import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { localServiceFetch, localServiceOrigin, readLocalServices } from "../../../infrastructure/local/services";
import type { RuntimeEnv } from "../../../shared/config/config";
import type { MeetingAudioSource, MeetingAudioTicketClaims } from "../audio/meeting-audio-ticket";
import { createMeetingRealtimeTranscriptSink, type MeetingRealtimeTranscriberCallbacks } from "./meeting-realtime-transcription";

const FRAME_BYTES = 960;
const MAX_CHUNK_FRAMES = 1500;
const MAX_PENDING_BYTES = 512 * 1024 * 1024;
const metadataSchema = z.object({ meetingId: z.string(), leaseId: z.string(), userId: z.string(), workspaceId: z.string(), source: z.enum(["microphone", "system"]) });
type Metadata = z.infer<typeof metadataSchema>;
type Stream = { directory: string; metadata: Metadata; accepted: number; start: number | null; frames: number; silence: number; writing: Promise<void>; queuedBytes: number; callbacks?: MeetingRealtimeTranscriberCallbacks; failed?: Error };
const streams = new Map<string, Stream>();
let timer: ReturnType<typeof setInterval> | undefined;
let working: Promise<void> | undefined;
let controller: AbortController | undefined;
let pendingBytes = 0;
let runtimeEnv: RuntimeEnv;
let closing = false;
let serviceError: string | null = null;
const filename = (sequence: number, extension: string) => `${String(sequence).padStart(16, "0")}.${extension}`;
const directoryFor = (root: string, meta: Metadata) => path.join(root, "recordings", createHash("sha256").update(`${meta.leaseId}:${meta.source}`).digest("hex"));
async function syncDirectory(directory: string) { const handle = await open(directory, "r"); try { await handle.sync(); } finally { await handle.close(); } }
async function atomicJson(file: string, value: unknown) { const temporary = `${file}.tmp`; const handle = await open(temporary, "w", 0o600); try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); } await rename(temporary, file); await syncDirectory(path.dirname(file)); }

/** Mono PCM16 24 kHz capture -> PCM16 16 kHz WAV, entirely in process. */
export function localWhisperWav(pcm: Uint8Array) {
  if (pcm.byteLength % FRAME_BYTES) throw new Error("Incomplete audio frame");
  const samples = pcm.byteLength / 2;
  const outputSamples = Math.floor(samples * 2 / 3);
  const wav = Buffer.alloc(44 + outputSamples * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(outputSamples * 2, 40);
  const input = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  for (let i = 0; i < outputSamples; i++) {
    const at = i * 1.5, left = Math.floor(at), fraction = at - left;
    wav.writeInt16LE(Math.round(input.getInt16(left * 2, true) * (1 - fraction) + input.getInt16(Math.min(left + 1, samples - 1) * 2, true) * fraction), 44 + i * 2);
  }
  return wav;
}
export async function initializeLocalTranscription(env: RuntimeEnv) {
  closing = false; runtimeEnv = env; pendingBytes = 0; streams.clear();
  const root = process.env.ZILOBASE_LOCAL_ROOT!;
  const recordings = path.join(root, "recordings");
  await mkdir(recordings, { recursive: true, mode: 0o700 });
  for (const entry of await readdir(recordings, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
    const directory = path.join(recordings, entry.name);
    const metadata = metadataSchema.parse(JSON.parse(await readFile(path.join(directory, "metadata.json"), "utf8")));
    if (directoryFor(root, metadata) !== directory) throw new Error("Invalid recording recovery identity");
    await loadStream(directory, metadata, true);
  }
  timer = setInterval(() => { void drainLocalTranscription(); }, 2000); timer.unref();
  void drainLocalTranscription();
  return async () => {
    closing = true; clearInterval(timer); controller?.abort();
    await Promise.all([...streams.values()].map(async stream => { await stream.writing.catch(() => undefined); await seal(stream); }));
    await working;
  };
}
async function loadStream(directory: string, metadata: Metadata, recovering = false) {
  let accepted = -1;
  try { accepted = z.number().int().min(-1).parse(JSON.parse(await readFile(path.join(directory, "accepted.json"), "utf8"))); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const stream: Stream = { directory, metadata, accepted, start: null, frames: 0, silence: 0, writing: Promise.resolve(), queuedBytes: 0 };
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (!file.isFile() || !/^\d{16}\.(?:part|ready)$/.test(file.name)) continue;
    const filePath = path.join(directory, file.name);
    const size = (await stat(filePath)).size;
    if (!size || size % FRAME_BYTES || size > MAX_CHUNK_FRAMES * FRAME_BYTES) throw new Error("Recording recovery data is incomplete; keep the data folder for recovery.");
    const start = Number(file.name.split(".")[0]);
    stream.accepted = Math.max(stream.accepted, start + size / FRAME_BYTES - 1); pendingBytes += size;
    if (file.name.endsWith(".part")) { if (!recovering) throw new Error("Recording stream already has pending capture"); await rename(filePath, path.join(directory, filename(start, "ready"))); }
  }
  streams.set(directory, stream); return stream;
}
async function seal(stream: Stream) {
  if (stream.start === null) return;
  await rename(path.join(stream.directory, filename(stream.start, "part")), path.join(stream.directory, filename(stream.start, "ready")));
  await syncDirectory(stream.directory); stream.start = null; stream.frames = 0; stream.silence = 0;
}
export async function connectLocalWhisper(callbacks: MeetingRealtimeTranscriberCallbacks, claims: MeetingAudioTicketClaims, source: MeetingAudioSource) {
  const metadata = metadataSchema.parse({ ...claims, source });
  const directory = directoryFor(process.env.ZILOBASE_LOCAL_ROOT!, metadata);
  let stream = streams.get(directory);
  if (!stream) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await atomicJson(path.join(directory, "metadata.json"), metadata);
    stream = await loadStream(directory, metadata);
  }
  const state = stream; state.callbacks = callbacks;
  queueMicrotask(() => callbacks.onReady?.());
  return {
    appendAudio(pcm: Uint8Array, sequence: number) {
      if (closing || state.failed) throw state.failed ?? new Error("Local recording is stopping");
      if (pcm.byteLength % FRAME_BYTES || !Number.isSafeInteger(sequence) || sequence < 0) throw new Error("Invalid local audio packet");
      if (state.queuedBytes + pcm.byteLength > 2 * 1024 * 1024) throw new Error("Recording storage is too slow. Pause and retry; recovery audio is preserved.");
      const copy = Buffer.from(pcm); state.queuedBytes += copy.length;
      const operation = state.writing.then(async () => {
        for (let offset = 0; offset < copy.length; offset += FRAME_BYTES) {
          const seq = sequence + offset / FRAME_BYTES;
          if (seq <= state.accepted) continue;
          if (state.start !== null && seq !== state.accepted + 1) await seal(state);
          if (pendingBytes + FRAME_BYTES > MAX_PENDING_BYTES) throw new Error("Pending transcription storage is full. Pause recording and start Whisper to clear the backlog.");
          if (state.start === null) {
            const disk = await statfs(directory);
            if (disk.bavail * disk.bsize < 100 * 1024 * 1024) throw new Error("Not enough disk space to safely record. Free space and retry.");
            state.start = seq;
          }
          const frame = copy.subarray(offset, offset + FRAME_BYTES);
          const handle = await open(path.join(directory, filename(state.start, "part")), "a", 0o600);
          try { await handle.writeFile(frame); await handle.sync(); } finally { await handle.close(); }
          pendingBytes += FRAME_BYTES; state.frames++; state.accepted = seq;
          let energy = 0; for (let i = 0; i < frame.length; i += 2) energy += (frame.readInt16LE(i) / 32768) ** 2;
          state.silence = Math.sqrt(energy / 480) < 0.012 ? state.silence + 1 : 0;
          if (state.frames >= MAX_CHUNK_FRAMES || (state.frames >= 50 && state.silence >= 25)) await seal(state);
        }
      }).catch(error => { state.failed = error; throw error; }).finally(() => { state.queuedBytes -= copy.length; });
      state.writing = operation; return operation;
    },
    async finish() { await state.writing; await seal(state); state.callbacks = undefined; void drainLocalTranscription(); },
  };
}
export function localTranscriptionStatus(meetingId?: string) {
  return { pendingBytes, serviceError, streams: [...streams.values()].filter(stream => !meetingId || stream.metadata.meetingId === meetingId).map(stream => ({ meetingId: stream.metadata.meetingId, source: stream.metadata.source, acceptedSequence: stream.accepted })) };
}
export async function drainLocalTranscription() {
  if (closing || working) return working;
  working = (async () => {
    for (const stream of streams.values()) {
      if (closing) break;
      const files = (await readdir(stream.directory)).filter(name => /^\d{16}\.ready$/.test(name)).sort();
      for (const file of files) {
        if (closing) break;
        const filePath = path.join(stream.directory, file);
        const pcm = await readFile(filePath);
        const start = Number(file.split(".")[0]);
        const config = await readLocalServices();
        const origin = localServiceOrigin(config.whisperPort);
        const form = new FormData(); form.append("file", new Blob([localWhisperWav(pcm)]), "audio.wav"); form.append("response_format", "json"); form.append("temperature", "0.0");
        controller = new AbortController();
        const response = await localServiceFetch(origin)(`${origin}/inference`, { method: "POST", body: form, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]) });
        if (!response.ok) throw new Error("Local Whisper service is unavailable. Audio remains buffered.");
        const result = z.object({ text: z.string().max(100_000) }).parse(await response.json());
        const turn = { startSequence: start, endSequence: start + pcm.length / FRAME_BYTES - 1, itemId: `local:${start}`, text: result.text };
        if (stream.callbacks) await stream.callbacks.onCompleted(turn);
        else await createMeetingRealtimeTranscriptSink(runtimeEnv, { ...stream.metadata, exp: 0 }, undefined, stream.metadata.source).onCompleted({ ...turn, itemId: `${stream.metadata.source}:${turn.itemId}` });
        await atomicJson(path.join(stream.directory, "accepted.json"), turn.endSequence);
        await rm(filePath); await syncDirectory(stream.directory); pendingBytes -= pcm.length; serviceError = null;
      }
    }
  })().catch(() => { if (!closing) serviceError = "Local transcription is waiting for the Whisper service. Pending audio is saved on this Mac."; }).finally(() => { working = undefined; controller = undefined; });
  return working;
}

export async function localMeetingBacklog(meetingId: string) {
  let bytes = 0, chunks = 0;
  for (const stream of streams.values()) {
    if (stream.metadata.meetingId !== meetingId) continue;
    for (const file of await readdir(stream.directory, { withFileTypes: true })) {
      if (!file.isFile() || !/^\d{16}\.(?:part|ready)$/.test(file.name)) continue;
      try { bytes += (await stat(path.join(stream.directory, file.name))).size; chunks++; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  }
  return { bytes, chunks, serviceError: bytes ? serviceError : null };
}

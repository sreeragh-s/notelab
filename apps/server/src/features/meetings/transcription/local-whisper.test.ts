import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { writeLocalServices } from "../../../infrastructure/local/services";
import { connectLocalWhisper, drainLocalTranscription, initializeLocalTranscription, localMeetingBacklog, localWhisperWav } from "./local-whisper";
const saved = vi.hoisted(() => ({ turns: [] as unknown[] }));
vi.mock("./meeting-realtime-transcription", () => ({ createMeetingRealtimeTranscriptSink: () => ({ onCompleted: async (turn: unknown) => { saved.turns.push(turn); } }) }));
let server: Server;
let root: string;
let stop: () => Promise<void>;
let unavailable = false;
let requests = 0;
const claims = { exp: 0, meetingId: "meeting", workspaceId: "workspace", userId: "owner", leaseId: "lease" };
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "zilo-whisper-")); vi.stubEnv("ZILOBASE_LOCAL_ROOT", root);
  unavailable = false; requests = 0; saved.turns.length = 0;
  server = createServer(async (req, res) => {
    requests++;
    if (unavailable) { res.statusCode = 503; return res.end(); }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks); const wav = body.subarray(body.indexOf("RIFF"));
    expect(req.url).toBe("/inference"); expect(wav.readUInt32LE(24)).toBe(16000);
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ text: "Recorded speech" }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No address");
  await writeLocalServices({ whisperPort: address.port });
  stop = await initializeLocalTranscription({});
});
afterEach(async () => { await stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true }); vi.unstubAllEnvs(); });
it("converts native PCM into a WAV without an external converter", () => {
  const wav = localWhisperWav(new Uint8Array(960));
  expect(wav.length).toBe(44 + 640); expect(wav.toString("ascii", 0, 4)).toBe("RIFF"); expect(wav.readUInt32LE(24)).toBe(16000);
  expect(() => localWhisperWav(new Uint8Array(2))).toThrow("Incomplete");
});
it("keeps chunks durable across service loss, restart, and duplicate replay for both sources", async () => {
  unavailable = true;
  for (const source of ["microphone", "system"] as const) {
    const capture = await connectLocalWhisper({ onCompleted: turn => { saved.turns.push(turn); }, onDelta: () => {} }, claims, source);
    await capture.appendAudio(new Uint8Array(960 * 50), 0);
    await capture.finish();
  }
  await drainLocalTranscription();
  expect((await localMeetingBacklog("meeting")).bytes).toBe(960 * 100);
  expect(saved.turns.length).toBe(0);
  await stop(); unavailable = false; stop = await initializeLocalTranscription({});
  await drainLocalTranscription();
  expect((await localMeetingBacklog("meeting")).bytes).toBe(0);
  expect(saved.turns).toHaveLength(2);
  for (const source of ["microphone", "system"] as const) {
    const capture = await connectLocalWhisper({ onCompleted: turn => { saved.turns.push(turn); }, onDelta: () => {} }, claims, source);
    await capture.appendAudio(new Uint8Array(960 * 50), 0); await capture.finish();
  }
  await drainLocalTranscription(); expect(saved.turns).toHaveLength(2);
});
it("seals a partial recording on Quit and resumes inference after restart", async () => {
  const capture = await connectLocalWhisper({ onCompleted: () => {}, onDelta: () => {} }, claims, "microphone");
  await capture.appendAudio(new Uint8Array(960 * 5), 0);
  expect((await localMeetingBacklog("meeting")).chunks).toBe(1);
  await stop(); stop = await initializeLocalTranscription({}); await drainLocalTranscription();
  expect(saved.turns).toHaveLength(1); expect((await localMeetingBacklog("meeting")).bytes).toBe(0);
});

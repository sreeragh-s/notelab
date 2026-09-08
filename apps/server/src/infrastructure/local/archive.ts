import { createHash } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from "node:fs";
import { createReadStream } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Unzip, Zip, ZipPassThrough } from "fflate";
import { z } from "zod";
const MAX_FILE = 0xffff_ffff - 1;
const MAX_ARCHIVE = MAX_FILE; // V1 uses classic ZIP; reject ZIP64-sized exports explicitly.
const manifestSchema = z.object({ format: z.literal(1), postgresMajor: z.literal(17), createdAt: z.string(), files: z.record(z.string(), z.object({ bytes: z.number().int().nonnegative().max(MAX_FILE), sha256: z.string().regex(/^[a-f0-9]{64}$/) })) });
export function safeArchiveName(name: string) {
  return name.length > 0 && name.length < 1000 && !name.includes("\\") && !name.includes("\0") && !name.startsWith("/") && name.split("/").every(part => part && part !== "." && part !== ".." && !part.includes(":"));
}
async function listFiles(root: string, relative = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (!safeArchiveName(name) || entry.isSymbolicLink()) throw new Error("Unsafe backup file");
    if (entry.isDirectory()) files.push(...await listFiles(root, name));
    else if (entry.isFile()) files.push(name);
    else throw new Error("Unsupported backup file");
  }
  return files.sort();
}
export async function createLocalArchive(source: string, destination: string) {
  const names = await listFiles(source);
  if (names.length > 60_000 || names.includes("backup.json")) throw new Error("Unsupported backup contents");
  const files: Record<string, { bytes: number; sha256: string }> = {};
  let total = 0;
  for (const name of names) {
    const hash = createHash("sha256"); let bytes = 0;
    for await (const chunk of createReadStream(path.join(source, name))) { hash.update(chunk); bytes += chunk.length; }
    total += bytes;
    if (bytes > MAX_FILE || total > MAX_ARCHIVE - 16 * 1024 * 1024) throw new Error("V1 backups must be smaller than 4 GiB");
    files[name] = { bytes, sha256: hash.digest("hex") };
  }
  const temporary = `${destination}.${crypto.randomUUID()}.partial`;
  const descriptor = openSync(temporary, "wx", 0o600);
  let finished = false;
  try {
    const zip = new Zip((error, bytes, final) => { if (error) throw error; writeSync(descriptor, bytes); if (final) finished = true; });
    for (const name of names) {
      const file = new ZipPassThrough(name); zip.add(file);
      for await (const chunk of createReadStream(path.join(source, name))) file.push(new Uint8Array(chunk), false);
      file.push(new Uint8Array(), true);
    }
    const metadata = new ZipPassThrough("backup.json"); zip.add(metadata); metadata.push(new TextEncoder().encode(JSON.stringify({ format: 1, postgresMajor: 17, createdAt: new Date().toISOString(), files })), true);
    zip.end(); if (!finished) throw new Error("Backup archive did not finish"); fsyncSync(descriptor);
  } catch (error) { await rm(temporary, { force: true }); throw error; }
  finally { closeSync(descriptor); }
  const verification = await mkdtemp(path.join(path.dirname(source), "verify-"));
  try { await extractLocalArchive(temporary, verification); } catch (error) { await rm(temporary, { force: true }); throw error; } finally { await rm(verification, { recursive: true, force: true }); }
  await rename(temporary, destination);
  const parent = await open(path.dirname(destination), "r"); try { await parent.sync(); } finally { await parent.close(); }
  return { file: destination, bytes: (await stat(destination)).size };
}
export async function extractLocalArchive(archive: string, destination: string) {
  if ((await lstat(archive)).isSymbolicLink()) throw new Error("Backup must be a regular file");
  if ((await stat(archive)).size > MAX_ARCHIVE) throw new Error("Unsupported backup size");
  const archiveHandle = await open(archive, "r");
  try { const info = await archiveHandle.stat(); const footer = Buffer.alloc(22); if (info.size < 22) throw new Error("Truncated backup archive"); await archiveHandle.read(footer, 0, 22, info.size - 22); if (footer.readUInt32LE(0) !== 0x06054b50 || footer.readUInt16LE(20) !== 0) throw new Error("Truncated or unsupported backup archive"); } finally { await archiveHandle.close(); }
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const names = new Set<string>(); const complete = new Set<string>(); const descriptors = new Set<number>();
  let total = 0;
  const unzip = new Unzip(file => {
    if (!safeArchiveName(file.name) || names.has(file.name) || names.size >= 60_001 || file.compression !== 0) throw new Error("Unsupported or unsafe backup entry");
    names.add(file.name);
    const target = path.join(destination, file.name); mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const descriptor = openSync(target, "wx", 0o600); descriptors.add(descriptor);
    file.ondata = (error, bytes, final) => {
      if (error) throw error; total += bytes.length; if (total > MAX_ARCHIVE) throw new Error("Backup expansion exceeds the size limit"); writeSync(descriptor, bytes);
      if (final) { fsyncSync(descriptor); closeSync(descriptor); descriptors.delete(descriptor); complete.add(file.name); }
    };
    file.start();
  });
  try {
    for await (const chunk of createReadStream(archive)) unzip.push(new Uint8Array(chunk), false);
    unzip.push(new Uint8Array(), true);
    if (names.size !== complete.size || !complete.has("backup.json")) throw new Error("Truncated backup archive");
    const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(destination, "backup.json"), "utf8")));
    if (Object.keys(manifest.files).length !== names.size - 1) throw new Error("Backup file inventory mismatch");
    for (const [name, expected] of Object.entries(manifest.files)) {
      if (!safeArchiveName(name) || !complete.has(name)) throw new Error("Missing backup file");
      const hash = createHash("sha256"); let bytes = 0;
      for await (const chunk of createReadStream(path.join(destination, name))) { bytes += chunk.length; hash.update(chunk); }
      if (bytes !== expected.bytes || hash.digest("hex") !== expected.sha256) throw new Error("Backup checksum mismatch");
    }
    if (!manifest.files["database.dump"] || !manifest.files["installation.json"] || !manifest.files["content-keys.json"]) throw new Error("Backup is missing required data");
    return manifest;
  } finally { for (const descriptor of descriptors) closeSync(descriptor); }
}

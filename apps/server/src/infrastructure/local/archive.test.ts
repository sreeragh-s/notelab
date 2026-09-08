import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import { createLocalArchive, extractLocalArchive, safeArchiveName } from "./archive";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
it("round trips verified data and rejects truncation and modified payloads", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zilo-archive-")); roots.push(root);
  const source = path.join(root, "source"); await mkdir(source); await mkdir(path.join(source, "objects"));
  for (const [file, body] of Object.entries({ "database.dump": "database fixture", "installation.json": "{}", "content-keys.json": "{}", "objects/abc": "persistent attachment" })) await writeFile(path.join(source, file), body);
  const archive = path.join(root, "workspace.zilobackup"); await createLocalArchive(source, archive);
  await extractLocalArchive(archive, path.join(root, "restored"));
  expect(await readFile(path.join(root, "restored/objects/abc"), "utf8")).toBe("persistent attachment");
  const bytes = await readFile(archive); await writeFile(path.join(root, "truncated"), bytes.subarray(0, -8));
  await expect(extractLocalArchive(path.join(root, "truncated"), path.join(root, "bad"))).rejects.toThrow("Truncated");
  bytes[bytes.indexOf("persistent attachment")] = 0; await writeFile(path.join(root, "corrupt"), bytes);
  await expect(extractLocalArchive(path.join(root, "corrupt"), path.join(root, "bad2"))).rejects.toThrow("checksum");
});
it("rejects archive path escapes", () => {
  for (const name of ["../x", "/tmp/x", "objects/../../x", "objects\\x", "C:/x", "a//b", "a/./b"]) expect(safeArchiveName(name)).toBe(false);
  expect(safeArchiveName("objects/abc")).toBe(true);
});

// This tiny process owns no data or secrets. EOF detects even a SIGKILL of the backend.
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
const execute = promisify(execFile);
const input = createInterface({ input: process.stdin });
let configuration: { data: string; pgCtl: string; pid: number } | undefined;
input.once("line", line => {
  const value = JSON.parse(line);
  if (!path.isAbsolute(value.data) || !path.isAbsolute(value.pgCtl) || !Number.isSafeInteger(value.pid) || value.pid <= 0) process.exit(1);
  configuration = value;
});
input.once("close", () => {
  void (async () => {
    if (!configuration) return;
    const { data, pgCtl, pid } = configuration;
    const record = await readFile(path.join(data, "postmaster.pid"), "utf8").catch(() => "");
    const fields = record.split("\n");
    if (fields[0] !== String(pid) || fields[1] !== data) return;
    await execute(pgCtl, ["-D", data, "stop", "-m", "fast", "-w", "-t", "10"], { timeout: 15_000 });
  })().then(() => process.exit(0)).catch(() => process.exit(1));
});

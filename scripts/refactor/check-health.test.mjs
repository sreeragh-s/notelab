import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runner = fileURLToPath(new URL("./check-health.mjs", import.meta.url));

function invoke(mode, coverageExit = 0) {
  const directory = mkdtempSync(join(tmpdir(), "zilobase-health-test-"));
  const callsPath = join(directory, "calls.jsonl");
  try {
    writeFileSync(join(directory, "npm"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.HEALTH_TEST_CALLS, JSON.stringify(args) + "\\n");
if (args[0] === "run") process.exit(Number(process.env.HEALTH_TEST_EXIT));
`, { mode: 0o755 });
    const result = spawnSync(process.execPath, [runner, mode], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, HEALTH_TEST_CALLS: callsPath, HEALTH_TEST_EXIT: String(coverageExit) },
    });
    const calls = readFileSync(callsPath, "utf8").trim().split("\n").map(JSON.parse);
    return { status: result.status, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("health refuses stale coverage when the server gate fails", () => {
  const result = invoke("health", 1);
  assert.equal(result.status, 1);
  assert.deepEqual(result.calls, [["run", "test:server"]]);
});

for (const mode of ["health", "audit"]) {
  test(`${mode} generates coverage before using the unchanged identity baseline`, () => {
    const result = invoke(mode);
    assert.equal(result.status, 0);
    assert.equal(result.calls.length, 2);
    assert.deepEqual(result.calls[0], ["run", "test:server"]);
    const args = result.calls[1];
    assert.equal(args[args.indexOf("--coverage") + 1], "apps/server/coverage/coverage-final.json");
    assert.equal(args[args.indexOf("--baseline-mode") + 1], "identity");
    assert.ok(args.includes("scripts/refactor/fallow-health-baseline.json"));
    assert.ok(!args.includes("--max-crap"));
  });
}

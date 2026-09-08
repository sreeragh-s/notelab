import assert from "node:assert/strict";
import test from "node:test";
import { runtimeHasCapability } from "./index";
test("local mode retains local providers but excludes remote collaboration", () => {
  for (const capability of ["members", "sharing", "publishing", "integrations"] as const) {
    assert.equal(runtimeHasCapability("local", capability), false);
    assert.equal(runtimeHasCapability("remote", capability), true);
  }
  assert.equal(runtimeHasCapability("local", "local-ai"), true);
  assert.equal(runtimeHasCapability("remote", "local-transcription"), false);
});

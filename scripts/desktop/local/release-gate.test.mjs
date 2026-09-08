import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceChecks, validateLocalRelease } from './release-gate.mjs';
const revision = 'a'.repeat(40);
const record = () => ({ format: 1, sourceRevision: revision, architectures: Object.fromEntries(['arm64', 'x64'].map(arch => [arch, Object.fromEntries(acceptanceChecks.map(check => [check, { status: 'passed', evidence: 'test fixture only' }]))])) });
test('release gate requires both architectures and exact revision', () => {
  assert.doesNotThrow(() => validateLocalRelease(record(), revision));
  assert.throws(() => validateLocalRelease(record(), 'b'.repeat(40)), /revision/);
  const missing = record(); delete missing.architectures.x64;
  assert.throws(() => validateLocalRelease(missing, revision), /x64/);
});
test('unchecked, failed and evidence-free checks cannot enable releases', () => {
  for (const status of ['pending', 'failed', 'not-run']) {
    const input = record(); input.architectures.arm64['real-local-ai'].status = status;
    assert.throws(() => validateLocalRelease(input, revision), /real-local-ai/);
  }
  const input = record(); input.architectures.x64.performance.evidence = '';
  assert.throws(() => validateLocalRelease(input, revision), /performance/);
});

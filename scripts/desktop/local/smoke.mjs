import { launchLocal, resources } from './harness.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'zilo-runtime-')));
const launch = (directory = root, bundle = resources, abrupt = false) => launchLocal({ root: directory, bundle, abrupt });

try {
  const first = await launch();
  const second = await launch();
  assert.equal(first.installationId, second.installationId);
  console.log('Local backend migrated, started, shut down on parent EOF, and reopened the same installation.');
} finally { await rm(root, { recursive: true, force: true }); }

import { launchLocal, maintainLocal, resources } from './harness.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, realpath, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'zilo-runtime-')));
const launch = (directory = root, bundle = resources, abrupt = false) => launchLocal({ root: directory, bundle, abrupt });

const restored = root + '-restored';
try {
  const first = await launch();
  await writeFile(path.join(root, 'objects', 'backup-fixture'), 'durable object');
  const before = JSON.parse(await readFile(path.join(root, 'secrets/database.json'), 'utf8'));
  const archive = path.join(root, 'backups', 'test.zilobackup');
  await maintainLocal(root, 'backup', archive);
  await maintainLocal(restored, 'restore', archive);
  const second = await launch(restored);
  const after = JSON.parse(await readFile(path.join(restored, 'secrets/database.json'), 'utf8'));
  assert.equal(first.installationId, second.installationId);
  assert.equal(first.userId, second.userId);
  assert.notEqual(before.admin, after.admin);
  assert.notEqual(before.app, after.app);
  assert.equal(before.auth, after.auth);
  assert.equal(await readFile(path.join(restored, 'objects/backup-fixture'), 'utf8'), 'durable object');
  console.log('Packaged backup and fresh-install restore preserved owner, identity, objects, and content keys with fresh database credentials.');
} finally { await rm(root, { recursive: true, force: true }); await rm(restored, { recursive: true, force: true }); }

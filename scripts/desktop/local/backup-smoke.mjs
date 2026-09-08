import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, realpath, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const triple = process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
const resources = fileURLToPath(new URL(`../../../apps/desktop/src-tauri/local-resources/${triple}`, import.meta.url));
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'zilo-runtime-')));
async function launch(directory = root) {
  const child = spawn(path.join(resources, 'node/node'), [path.join(resources, 'server/desktop-local.cjs')], { env: { PATH: '/usr/bin:/bin', ZILOBASE_LOCAL_ENABLED: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', bytes => { errors += bytes; });
  const lines = createInterface({ input: child.stdout });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.stdin.end(); reject(Error('Startup timeout')); }, 90_000);
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Startup exited ${code}: ${errors}`)); });
    lines.on('line', line => {
      try { const value = JSON.parse(line); if (value.event === 'local.ready') { clearTimeout(timer); resolve(value); } } catch {}
    });
  });
  child.stdin.write(JSON.stringify({ ZILOBASE_LOCAL_ROOT: directory, ZILOBASE_LOCAL_RESOURCES: resources }) + '\n');
  const message = await ready;
  assert.match(message.apiOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const response = await fetch(`${message.apiOrigin}/session`, { headers: { authorization: `Bearer ${message.sessionToken}` } });
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.equal(session.user.id, message.userId);
  assert.equal((await fetch(`${message.apiOrigin}/session`)).status, 401);
  assert.equal((await fetch(`${message.apiOrigin}/api/auth/sign-up/email`, { method: 'POST' })).status, 403);
  const closed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(Error('Shutdown timeout')); }, 20_000);
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(`Shutdown failed: ${code}`)); });
  });
  child.stdin.end();
  await closed;
  return message;
}
async function maintain(directory, operation, file) {
  const child = spawn(path.join(resources, 'node/node'), [path.join(resources, 'server/desktop-maintenance.cjs')], { env: { PATH: '/usr/bin:/bin', ZILOBASE_LOCAL_ENABLED: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', () => {});
  child.stdin.write(JSON.stringify({ ZILOBASE_LOCAL_ROOT: directory, ZILOBASE_LOCAL_RESOURCES: resources, operation, file }) + '\n');
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(Error('Maintenance timeout')); }, 120_000);
    child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(Error(output)); });
  });
  return JSON.parse(output.trim().split('\n').find(line => line.includes('local.maintenance'))).result;
}
const restored = root + '-restored';
try {
  const first = await launch();
  await writeFile(path.join(root, 'objects', 'backup-fixture'), 'durable object');
  const before = JSON.parse(await readFile(path.join(root, 'secrets/database.json'), 'utf8'));
  const archive = path.join(root, 'backups', 'test.zilobackup');
  await maintain(root, 'backup', archive);
  await maintain(restored, 'restore', archive);
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

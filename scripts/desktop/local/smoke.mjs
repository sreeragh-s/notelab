import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const triple = process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
const resources = fileURLToPath(new URL(`../../../apps/desktop/src-tauri/local-resources/${triple}`, import.meta.url));
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'zilo-runtime-')));
async function launch() {
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
  child.stdin.write(JSON.stringify({ ZILOBASE_LOCAL_ROOT: root, ZILOBASE_LOCAL_RESOURCES: resources }) + '\n');
  const message = await ready;
  assert.match(message.apiOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const closed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(Error('Shutdown timeout')); }, 20_000);
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(`Shutdown failed: ${code}`)); });
  });
  child.stdin.end();
  await closed;
  return message;
}
try {
  const first = await launch();
  const second = await launch();
  assert.equal(first.installationId, second.installationId);
  console.log('Local backend migrated, started, shut down on parent EOF, and reopened the same installation.');
} finally { await rm(root, { recursive: true, force: true }); }

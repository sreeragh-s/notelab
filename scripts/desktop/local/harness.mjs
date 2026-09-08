import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const triple = process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
export const resources = fileURLToPath(new URL(`../../../apps/desktop/src-tauri/local-resources/${triple}`, import.meta.url));
function start(bundle, entrypoint, config) {
  const child = spawn(path.join(bundle, 'node/node'), [path.join(bundle, 'server', entrypoint)], { env: { PATH: '/usr/bin:/bin', ZILOBASE_LOCAL_ENABLED: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', () => {});
  child.stdin.write(JSON.stringify({ ...config, ZILOBASE_LOCAL_RESOURCES: bundle }) + '\n');
  return child;
}
function readyMessage(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Startup timeout')), 90_000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Startup exited ${code}`)); });
    createInterface({ input: child.stdout }).on('line', line => {
      try { const value = JSON.parse(line); if (value.event === 'local.ready') { clearTimeout(timer); resolve(value); } } catch {}
    });
  });
}
function stop(child, abrupt) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(Error('Shutdown timeout')); }, 20_000);
    child.once('exit', code => { clearTimeout(timer); (code === 0 || abrupt) ? resolve() : reject(Error(`Shutdown failed: ${code}`)); });
    if (abrupt) child.kill('SIGKILL'); else child.stdin.end();
  });
}
async function verifySession(message) {
  assert.match(message.apiOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const response = await fetch(`${message.apiOrigin}/session`, { headers: { authorization: `Bearer ${message.sessionToken}` } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, message.userId);
  assert.equal((await fetch(`${message.apiOrigin}/session`)).status, 401);
  assert.equal((await fetch(`${message.apiOrigin}/api/auth/sign-up/email`, { method: 'POST' })).status, 403);
}
export async function launchLocal({ root, bundle = resources, abrupt = false, afterReady = async () => {} }) {
  const started = performance.now();
  const child = start(bundle, 'desktop-local.cjs', { ZILOBASE_LOCAL_ROOT: root });
  try {
    const message = await readyMessage(child);
    await afterReady({ child, message, startupMs: performance.now() - started });
    await verifySession(message);
    return message;
  } finally { await stop(child, abrupt); }
}
export async function maintainLocal(root, operation, file) {
  const child = start(resources, 'desktop-maintenance.cjs', { ZILOBASE_LOCAL_ROOT: root, operation, file });
  let output = ''; child.stdout.on('data', bytes => { output += bytes; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(Error('Maintenance timeout')); }, 120_000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(Error(output)); });
  });
  return JSON.parse(output.trim().split('\n').find(line => line.includes('local.maintenance'))).result;
}

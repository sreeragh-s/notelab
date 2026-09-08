import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, realpath, readFile, writeFile, mkdir, cp, symlink, access, rename } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const triple = process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
const resources = fileURLToPath(new URL(`../../../apps/desktop/src-tauri/local-resources/${triple}`, import.meta.url));
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'zilo-runtime-')));
async function launch(directory = root, bundle = resources, abrupt = false) {
  const child = spawn(path.join(bundle, 'node/node'), [path.join(bundle, 'server/desktop-local.cjs')], { env: { PATH: '/usr/bin:/bin', ZILOBASE_LOCAL_ENABLED: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
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
  child.stdin.write(JSON.stringify({ ZILOBASE_LOCAL_ROOT: directory, ZILOBASE_LOCAL_RESOURCES: bundle }) + '\n');
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
    child.once('exit', code => { clearTimeout(timer); (code === 0 || abrupt) ? resolve() : reject(Error(`Shutdown failed: ${code}`)); });
  });
  if (abrupt) child.kill("SIGKILL"); else child.stdin.end();
  await closed;
  return message;
}

const upgraded = root + '-resources';
try {
  const first = await launch();
  await mkdir(upgraded);
  for (const folder of ['node', 'postgres', 'server']) await symlink(path.join(resources, folder), path.join(upgraded, folder));
  await cp(path.join(resources, 'drizzle'), path.join(upgraded, 'drizzle'), { recursive: true });
  const journalPath = path.join(upgraded, 'drizzle/meta/_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  const last = journal.entries.at(-1);
  journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1, tag: 'local_upgrade_fixture' });
  await writeFile(journalPath, JSON.stringify(journal));
  await writeFile(path.join(upgraded, 'drizzle/local_upgrade_fixture.sql'), 'CREATE TABLE local_upgrade_fixture (id text PRIMARY KEY);');
  const second = await launch(root, upgraded);
  assert.equal(first.userId, second.userId);
  await access(path.join(root, 'backups/pre-upgrade.zilobackup'));
  await assert.rejects(launch(), /Startup exited/);
  await launch(root, upgraded, true);
  for (let i = 0; i < 150; i++) {
    if (!await access(path.join(root, 'postgres/postmaster.pid')).then(() => true, () => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await assert.rejects(access(path.join(root, 'postgres/postmaster.pid')));
  await launch(root, upgraded);
  const recovery = root + '.recovery-123';
  await rename(root, recovery);
  await writeFile(root + '.restore-intent.json', JSON.stringify({ previous: recovery }));
  await mkdir(root); // Native creates the root before acquiring its sibling lock.
  await launch(root, upgraded);
  await assert.rejects(access(recovery));
  console.log('Packaged upgrade created a pre-migration backup, rejected downgrade, and recovered after backend SIGKILL with watchdog database cleanup.');
} finally { await rm(root, { recursive: true, force: true }); await rm(upgraded, { recursive: true, force: true }); }

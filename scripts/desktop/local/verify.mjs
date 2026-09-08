import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const triple = process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
const source = process.argv[2] ?? fileURLToPath(new URL(`../../../apps/desktop/src-tauri/local-resources/${triple}`, import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'zilo-'));
const relocated = path.join(temporary, 'relocated app');
const socket = await mkdtemp('/tmp/zs-');
let started = false;
const pg = (name, args) => execFileSync(path.join(relocated, 'postgres/bin', name), args, { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' } });
try {
  await cp(source, relocated, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(relocated, 'manifest.json')));
  assert.equal(manifest.target, triple);
  for (const required of ['node/node', 'node/LICENSE', 'postgres/LICENSE', 'server/desktop-local.cjs', 'server/desktop-maintenance.cjs', 'server/desktop-watchdog.cjs', ...['initdb', 'postgres', 'pg_ctl', 'pg_isready', 'pg_dump', 'pg_restore'].map(name => 'postgres/bin/' + name)]) assert.ok(manifest.files[required], `Missing resource: ${required}`);
  for (const [name, hash] of Object.entries(manifest.files)) {
    const filename = path.join(relocated, name);
    assert.equal(createHash('sha256').update(await readFile(filename)).digest('hex'), hash, name);
    if (execFileSync('/usr/bin/file', ['-b', filename], { encoding: 'utf8' }).includes('Mach-O')) {
      const architectures = execFileSync('/usr/bin/lipo', ['-archs', filename], { encoding: 'utf8' }).trim();
      assert.equal(architectures, process.arch === 'arm64' ? 'arm64' : 'x86_64', name);
      const dependencies = execFileSync('/usr/bin/otool', ['-L', filename], { encoding: 'utf8' }).split('\n').slice(1).map(line => line.trim().split(' (')[0]);
      for (const dependency of dependencies) assert.ok(!dependency.startsWith('/') || dependency.startsWith('/usr/lib/') || dependency.startsWith('/System/Library/'), `${name}: ${dependency}`);
    }
  }
  assert.equal(execFileSync(path.join(relocated, 'node/node'), ['--version'], { encoding: 'utf8' }).trim(), `v${manifest.node}`);
  assert.match(pg('postgres', ['--version']), new RegExp(manifest.postgres.replaceAll('.', '\\.')));
  const data = path.join(temporary, 'data');
  pg('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth-local=trust', '--auth-host=reject']);
  const start = () => { pg('pg_ctl', ['-D', data, '-l', path.join(temporary, 'postgres.log'), '-o', `-c listen_addresses='' -c unix_socket_directories='${socket}'`, '-w', 'start']); started = true; };
  start();
  pg('psql', ['-h', socket, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "create table persistence(value text); insert into persistence values ('survives restart');"]);
  pg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); started = false;
  start();
  assert.equal(pg('psql', ['-h', socket, '-d', 'postgres', '-Atc', 'select value from persistence']).trim(), 'survives restart');
  console.log('Verified checksums, relocated runtimes and PostgreSQL restart persistence.');
} finally {
  if (started) pg('pg_ctl', ['-D', path.join(temporary, 'data'), '-m', 'fast', '-w', 'stop']);
  await rm(temporary, { recursive: true, force: true });
  await rm(socket, { recursive: true, force: true });
}

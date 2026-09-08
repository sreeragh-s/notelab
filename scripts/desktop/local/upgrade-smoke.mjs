import { launchLocal, resources } from './harness.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, realpath, readFile, writeFile, mkdir, cp, symlink, access, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'zilo-runtime-')));
const launch = (directory = root, bundle = resources, abrupt = false) => launchLocal({ root: directory, bundle, abrupt });

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

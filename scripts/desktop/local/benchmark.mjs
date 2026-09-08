import { launchLocal, maintainLocal, resources } from './harness.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, realpath, readFile, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'zilo-runtime-')));
const samples = [];
async function observe({ child, message, startupMs }) {
  const latencies = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    const result = await fetch(`${message.apiOrigin}/workspaces`, { headers: { authorization: `Bearer ${message.sessionToken}` } });
    assert.equal(result.status, 200); await result.arrayBuffer(); latencies.push(performance.now() - start);
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
  const processes = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const descendants = new Set([child.pid]);
  for (let i = 0; i < 5; i++) for (const [pid, parent] of processes) if (descendants.has(parent)) descendants.add(pid);
  const rssKiB = processes.filter(([pid]) => descendants.has(pid)).reduce((sum, row) => sum + row[2], 0);
  latencies.sort((a,b) => a-b);
  samples.push({ startupMs, apiMedianMs: latencies[10], apiP95Ms: latencies[19], runtimeRssKiB: rssKiB });
}
const launch = (directory = root, bundle = resources, abrupt = false) => launchLocal({ root: directory, bundle, abrupt, afterReady: observe });

try {
  await launch(); await launch();
  const started = performance.now();
  await maintainLocal(root, 'backup', path.join(root, 'backups/benchmark.zilobackup'));
  const backupMs = performance.now() - started;
  const unchanged = await maintainLocal(root, 'daily-backup');
  assert.equal(unchanged.skipped, true);
  const manifest = JSON.parse(await readFile(path.join(resources, 'manifest.json')));
  let resourceBytes = 0;
  for (const file of Object.keys(manifest.files)) resourceBytes += (await stat(path.join(resources, file))).size;
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), architecture: process.arch, os: os.release(), fixture: 'fresh empty workspace; warm OS caches; 20 authenticated workspace-list requests', resourceBytes, samples, backupMs, signedInstallerBytes: null, transcriptionRate: null }, null, 2));
} finally { await rm(root, { recursive: true, force: true }); }

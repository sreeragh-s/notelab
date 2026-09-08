import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(process.argv[2]);
const identity = process.env.APPLE_SIGNING_IDENTITY;
if (!identity || identity === '-') throw Error('Local release resources require Developer ID signing');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(filename)); else if (entry.isFile()) result.push(filename);
  }
  return result;
}
for (const filename of await files(root)) {
  if (!execFileSync('/usr/bin/file', ['-b', filename], { encoding: 'utf8' }).includes('Mach-O')) continue;
  const args = ['--force', '--options', 'runtime', '--timestamp', '--sign', identity];
  if (filename === path.join(root, 'node/node')) args.push('--entitlements', fileURLToPath(new URL('./node-entitlements.plist', import.meta.url)));
  execFileSync('/usr/bin/codesign', [...args, filename], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--verify', '--strict', filename]);
}
for (const name of Object.keys(manifest.files)) manifest.files[name] = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
manifest.signing = 'Developer ID';
await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));

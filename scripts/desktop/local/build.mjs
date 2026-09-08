import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../../apps/web/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const versions = JSON.parse(await readFile(new URL('./runtime-versions.json', import.meta.url)));
const arch = process.argv[2] ?? process.arch;
if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(arch)) throw Error('Build on macOS for arm64 or x64');
const triple = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
const cache = path.join(root, '.dev/local/build', arch);
const output = path.join(root, 'apps/desktop/src-tauri/local-resources', triple);
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw Error(`Failed: ${command}`, { cause: result.error });
};
async function download(url, digest, name) {
  const destination = path.join(cache, name);
  let bytes = await readFile(destination).catch(() => null);
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== digest) {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw Error(`Download failed: ${url}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== digest) throw Error(`Checksum mismatch: ${name}`);
    await writeFile(destination, bytes);
  }
  return destination;
}
const nodeName = `node-v${versions.node.version}-darwin-${arch}`;
const nodeArchive = await download(`https://nodejs.org/dist/v${versions.node.version}/${nodeName}.tar.gz`, versions.node[arch], `${nodeName}.tar.gz`);
run('tar', ['-xzf', nodeArchive, '-C', cache]);
await mkdir(path.join(output, 'node'), { recursive: true });
await cp(path.join(cache, nodeName, 'bin/node'), path.join(output, 'node/node'));
await cp(path.join(cache, nodeName, 'LICENSE'), path.join(output, 'node/LICENSE'));
const pgName = `postgresql-${versions.postgres.version}`;
const pgArchive = await download(`https://ftp.postgresql.org/pub/source/v${versions.postgres.version}/${pgName}.tar.bz2`, versions.postgres.sha256, `${pgName}.tar.bz2`);
const pgRoot = path.join(output, 'postgres');
if (!(await readFile(path.join(cache, 'postgres-built')).catch(() => null))) {
  run('tar', ['-xjf', pgArchive, '-C', cache]);
  const source = path.join(cache, pgName);
  const env = { ...process.env, CC: 'clang', CFLAGS: `-O2 -arch ${arch === 'x64' ? 'x86_64' : 'arm64'}`, LDFLAGS: `-arch ${arch === 'x64' ? 'x86_64' : 'arm64'}`, MACOSX_DEPLOYMENT_TARGET: '12.0', PKG_CONFIG: '/usr/bin/false' };
  run('./configure', [`--prefix=${pgRoot}`, '--without-icu', '--without-readline', '--without-lz4', '--without-zstd'], { cwd: source, env });
  run('make', ['-j4'], { cwd: source, env });
  run('make', ['install'], { cwd: source, env });
  await cp(path.join(source, 'COPYRIGHT'), path.join(pgRoot, 'LICENSE'));
  await writeFile(path.join(cache, 'postgres-built'), versions.postgres.version);
}
// Eliminate absolute install paths from Mach-O dependencies before signing.
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(filename));
    else if (entry.isFile()) result.push(filename);
  }
  return result;
}
for (const filename of await files(pgRoot)) {
  if (filename.endsWith('.a') || !spawnSync('file', ['-b', filename], { encoding: 'utf8' }).stdout.includes('Mach-O')) continue;
  const result = spawnSync('otool', ['-L', filename], { encoding: 'utf8' });
  if (result.status !== 0) continue;
  for (const line of result.stdout.split('\n').slice(1)) {
    const dependency = line.trim().split(' (')[0];
    if (dependency.startsWith(pgRoot + '/')) {
      run('install_name_tool', ['-change', dependency, `@loader_path/${path.relative(path.dirname(filename), dependency)}`, filename]);
    } else if (dependency.startsWith('/') && !dependency.startsWith('/usr/lib/') && !dependency.startsWith('/System/Library/')) {
      throw Error(`Unbundled dependency: ${filename}: ${dependency}`);
    }
  }
  run('codesign', ['--force', '--sign', '-', filename]);
}
await mkdir(path.join(output, 'server'), { recursive: true });
await build({ entryPoints: [path.join(root, 'apps/server/src/entrypoints/desktop-local.ts')], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: path.join(output, 'server/desktop-local.cjs'), banner: { js: 'const __localImportMetaUrl = require("node:url").pathToFileURL(__filename).href;' }, define: { 'import.meta.url': '__localImportMetaUrl' } });
await build({ entryPoints: [path.join(root, 'apps/server/src/entrypoints/desktop-maintenance.ts')], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: path.join(output, 'server/desktop-maintenance.cjs'), banner: { js: 'const __localImportMetaUrl = require("node:url").pathToFileURL(__filename).href;' }, define: { 'import.meta.url': '__localImportMetaUrl' } });
await rm(path.join(output, 'drizzle'), { recursive: true, force: true });
await cp(path.join(root, 'apps/server/drizzle'), path.join(output, 'drizzle'), { recursive: true });
const hashes = {};
for (const filename of await files(output)) {
  if (filename.endsWith('/manifest.json')) continue;
  hashes[path.relative(output, filename)] = createHash('sha256').update(await readFile(filename)).digest('hex');
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ version: 1, target: triple, node: versions.node.version, postgres: versions.postgres.version, files: hashes }, null, 2));
console.log(`Local resources: ${output}`);

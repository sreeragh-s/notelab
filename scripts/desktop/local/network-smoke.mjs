import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'zilo-network-'));
try {
  const outfile = path.join(temporary, 'network.cjs');
  await build({ stdin: { resolveDir: root, contents: `
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import { installLocalNetworkBoundary, setLocalServicePorts } from './apps/server/src/infrastructure/local/network-boundary';
async function main() {
  let escaped = 0;
  const blocked = createServer((_req, res) => { escaped++; res.end('escape'); });
  await new Promise(resolve => blocked.listen(0, '127.0.0.1', resolve));
  const allowed = createServer((req, res) => { if (req.url === '/redirect') { res.writeHead(302, { location: 'http://127.0.0.1:' + blocked.address().port }); } res.end('local'); });
  await new Promise(resolve => allowed.listen(0, '127.0.0.1', resolve));
  const port = allowed.address().port;
  setLocalServicePorts([port]); installLocalNetworkBoundary('/tmp/private-postgres');
  assert.equal(await (await fetch('http://127.0.0.1:' + port)).text(), 'local');
  assert.throws(() => net.connect({ host: 'example.com', port: 443 }), /destination rejected/);
  await assert.rejects(dns.resolve4('example.com'), /DNS disabled/);
  await assert.rejects(fetch('http://127.0.0.1:' + port + '/redirect'));
  assert.equal(escaped, 0);
  allowed.closeAllConnections(); blocked.closeAllConnections(); allowed.close(); blocked.close();
  console.log('Local socket, HTTP redirect, and DNS boundaries passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
` }, outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  await new Promise((resolve, reject) => { const child = spawn(process.execPath, [outfile], { stdio: 'inherit' }); child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error(`Boundary check exited ${code}`))); });
} finally { await rm(temporary, { recursive: true, force: true }); }

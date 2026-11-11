import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { makeRepo, rmrf, SERVER } from './harness.mjs';

let repo, proc, port, stderr = '';

function post(body, headers = {}, { method = 'POST', pathName = '/mcp' } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: pathName, method, headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers } }, (res) => {
      let t = '';
      res.on('data', (d) => { t += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: t ? JSON.parse(t) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

before(async () => {
  repo = makeRepo();
  proc = spawn(process.execPath, [SERVER, '--repo', repo, '--http', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', (d) => { stderr += `STDOUT:${d}`; });
  port = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no listen line: ${stderr}`)), 10000);
    proc.stderr.on('data', (d) => {
      stderr += d;
      const m = /127\.0\.0\.1:(\d+)\/mcp/.exec(stderr);
      if (m) { clearTimeout(t); resolve(Number(m[1])); }
    });
  });
});
after(async () => {
  const exited = new Promise((r) => proc.on('exit', r));
  proc.kill('SIGTERM');
  await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  if (proc.exitCode === null) proc.kill();
  rmrf(repo);
});

test('HTTP: initialize and tools/list over POST /mcp', async () => {
  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  assert.equal(init.status, 200);
  assert.match(init.headers['content-type'], /^application\/json/);
  assert.equal(init.body.result.protocolVersion, '2025-11-25');
  assert.ok(!('mcp-session-id' in init.headers), 'no session id is minted');
  const note = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, { 'MCP-Protocol-Version': '2025-11-25' });
  assert.equal(note.status, 202);
  const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'MCP-Protocol-Version': '2025-11-25' });
  assert.equal(list.body.result.tools.length, 11);
  // a tool call over HTTP
  const call = await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'whats_needed', arguments: {} } });
  assert.equal(JSON.parse(call.body.result.content[0].text).data.tasks.length, 0);
});

test('HTTP: the 2026-07-28 headers are checked', async () => {
  const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 't', version: '0' }, 'io.modelcontextprotocol/clientCapabilities': {} };
  const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta } };
  const ok = await post(body, { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/list' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.result.resultType, 'complete');
  const noHeader = await post(body, { 'Mcp-Method': 'tools/list' });
  assert.equal(noHeader.status, 400);
  assert.equal(noHeader.body.error.code, -32020);
  const wrong = await post(body, { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call' });
  assert.equal(wrong.status, 400);
  const badVer = await post(body, { 'MCP-Protocol-Version': '1900-01-01' });
  assert.equal(badVer.status, 400);
  assert.equal(badVer.body.error.code, -32022);
});

test('HTTP: non-loopback Origin and Host are refused, other methods and paths are rejected', async () => {
  const msg = { jsonrpc: '2.0', id: 1, method: 'ping' };
  assert.equal((await post(msg, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(msg, { Origin: 'http://localhost.evil.example' })).status, 403);
  assert.equal((await post(msg, { Origin: 'http://localhost:3000' })).status, 200);
  assert.equal((await post(msg, { Origin: 'http://127.0.0.1:5173' })).status, 200);
  assert.equal((await post(msg, { Host: 'rebind.example' })).status, 403);
  assert.equal((await post(undefined, {}, { method: 'GET' })).status, 405);
  assert.equal((await post(msg, {}, { pathName: '/other' })).status, 404);
  assert.equal((await post('{ nope')).status, 400);
});

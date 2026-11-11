#!/usr/bin/env node
// Rebuild the World contributor MCP server (local test). No dependencies.
//   node mcp/server.mjs                 stdio
//   node mcp/server.mjs --http 8765     Streamable HTTP on 127.0.0.1
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createTools } from './lib/tools.mjs';
import { createRpc, SUPPORTED, MODERN, ERR } from './lib/rpc.mjs';
import { HANDLE_RE } from './lib/util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const log = (...a) => process.stderr.write(`[rtw-mcp] ${a.join(' ')}\n`);

const USAGE = `Usage: node mcp/server.mjs [--http <port>] [--repo <path>] [--as <handle>] [--workspace <dir>] [--trust <0-3>]
  (no --http)       speak MCP over stdio
  --http <port>     serve Streamable HTTP at http://127.0.0.1:<port>/mcp (port 0 picks a free one)
  --repo <path>     the repo to serve (default: the repo that contains mcp/)
  --as <handle>     the contributor's handle (default: local)
  --workspace <dir> where the agent builds assets (default: <repo>/assets)
  --trust <0-3>     the contributor's trust level (default: 0)`;

function parseArgs(argv) {
  const o = { http: null, repo: path.resolve(HERE, '..'), handle: 'local', workspace: null, trust: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--http') {
      const n = argv[i + 1];
      o.http = n !== undefined && /^\d+$/.test(n) ? Number(argv[++i]) : 8765;
      if (o.http > 65535) throw new Error('--http port must be 0 to 65535');
    } else if (a === '--repo') o.repo = path.resolve(val());
    else if (a === '--as') o.handle = val();
    else if (a === '--workspace') o.workspace = path.resolve(val());
    else if (a === '--trust') {
      o.trust = Number(val());
      if (![0, 1, 2, 3].includes(o.trust)) throw new Error('--trust must be 0, 1, 2 or 3');
    } else if (a === '--help' || a === '-h') {
      process.stderr.write(`${USAGE}\n`);
      process.exit(0);
    } else throw new Error(`unknown option ${a}`);
  }
  if (!HANDLE_RE.test(o.handle)) throw new Error('--as must be letters, digits, "-" or "_" (at most 39 characters)');
  if (!fs.existsSync(path.join(o.repo, 'spec', 'spec.json'))) throw new Error('--repo does not look like the project repo (no spec/spec.json)');
  o.workspace = o.workspace || path.join(o.repo, 'assets');
  return o;
}

// ---- stdio ----
function serveStdio(rpc) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let pending = 0;
  let closed = false;
  const maybeExit = () => {
    if (closed && pending === 0) process.exit(0);
  };
  rl.on('line', (line) => {
    if (!line.trim()) return;
    pending += 1;
    rpc
      .handleText(line, {})
      .then(({ text }) => {
        if (text) process.stdout.write(`${text}\n`);
      })
      .catch((e) => log('error:', e.stack || e))
      .finally(() => {
        pending -= 1;
        maybeExit();
      });
  });
  // Closing stdin is the shutdown signal. Finish what is in flight, then exit.
  rl.on('close', () => {
    closed = true;
    maybeExit();
  });
  log('stdio transport ready');
}

// ---- Streamable HTTP ----
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
function loopbackOrigin(origin) {
  try {
    const u = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function serveHttp(rpc, port) {
  const send = (res, status, body, extra = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra });
    res.end(body === null ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
  };
  const err = (code, message, data) => ({ jsonrpc: '2.0', id: null, error: { code, message, ...(data ? { data } : {}) } });

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin !== undefined && !loopbackOrigin(origin)) return send(res, 403, err(ERR.request, 'Forbidden: Origin is not a loopback origin'));
    if (!LOOPBACK_HOST.test(req.headers.host || '')) return send(res, 403, err(ERR.request, 'Forbidden: Host is not a loopback address'));
    const url = (req.url || '').split('?')[0];
    if (url !== '/mcp') return send(res, 404, err(ERR.request, 'Not found: the MCP endpoint is /mcp'));
    if (req.method !== 'POST') return send(res, 405, err(ERR.request, 'Method not allowed: POST to /mcp'), { Allow: 'POST' });

    const chunks = [];
    let size = 0;
    let over = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) {
        over = true;
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('error', () => {});
    req.on('end', async () => {
      if (over) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, err(ERR.parse, 'Parse error'));
      }
      const one = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
      const hv = req.headers['mcp-protocol-version'];
      const requested = one?.params?._meta?.['io.modelcontextprotocol/protocolVersion'];
      // Header checks from the 2026-07-28 Streamable HTTP page.
      if (hv !== undefined && !SUPPORTED.includes(String(hv))) {
        return send(res, 400, { jsonrpc: '2.0', id: one?.id ?? null, error: { code: ERR.unsupportedVersion, message: 'Unsupported protocol version', data: { supported: SUPPORTED, requested: String(hv) } } });
      }
      if (requested !== undefined) {
        const mismatch = (what) => send(res, 400, { jsonrpc: '2.0', id: one?.id ?? null, error: { code: ERR.headerMismatch, message: `Header mismatch: ${what}` } });
        if (hv === undefined) return mismatch('MCP-Protocol-Version header is missing');
        if (String(hv) !== requested) return mismatch(`MCP-Protocol-Version "${hv}" does not match _meta "${requested}"`);
        if (requested === MODERN) {
          const m = req.headers['mcp-method'];
          if (m === undefined || m !== one.method) return mismatch('Mcp-Method is missing or does not match the method');
          if (one.method === 'tools/call') {
            const n = req.headers['mcp-name'];
            const decoded = typeof n === 'string' && /^=\?base64\?.*\?=$/.test(n) ? Buffer.from(n.slice(9, -2), 'base64').toString('utf8') : n;
            if (decoded === undefined || decoded !== one.params?.name) return mismatch('Mcp-Name is missing or does not match params.name');
          }
        }
      }
      try {
        const { text, status } = await rpc.handleText(raw, {});
        send(res, text ? status : 202, text);
      } catch (e) {
        log('error:', e.stack || e);
        send(res, 500, err(ERR.internal, 'Internal error'));
      }
    });
  });
  server.listen(port, '127.0.0.1', () => log(`Streamable HTTP listening on http://127.0.0.1:${server.address().port}/mcp`));
  server.on('error', (e) => {
    log('http server error:', e.message);
    process.exit(1);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`${e.message}\n${USAGE}\n`);
  process.exit(2);
}
const tools = createTools({ repo: opts.repo, handle: opts.handle, workspace: opts.workspace, trust: opts.trust });
const rpc = createRpc({ tools, log });
process.on('unhandledRejection', (e) => log('unhandled rejection:', e?.stack || e));
if (opts.http === null) serveStdio(rpc);
else serveHttp(rpc, opts.http);

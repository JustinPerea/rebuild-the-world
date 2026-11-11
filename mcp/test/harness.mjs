// Test helpers: a temp copy of the repo folders the server needs, and a stdio client.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { writeRegistry, TEST_TYPES } from '../../validator/test/helpers.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REAL_REPO = path.resolve(HERE, '..', '..');
export const SERVER = path.join(REAL_REPO, 'mcp', 'server.mjs');

export function tmpDir(prefix = 'rtw-mcp-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
export const rmrf = (d) => fs.rmSync(d, { recursive: true, force: true });

// Copies docs/, spec/, tasks/task.example.json, feedback/README.md and validator/ (code only) into a temp repo.
export function makeRepo() {
  const root = tmpDir();
  const cp = (rel, filter) => fs.cpSync(path.join(REAL_REPO, rel), path.join(root, rel), { recursive: true, filter });
  cp('docs');
  cp('spec');
  cp('validator', (src) => !/[\\/](node_modules|test)([\\/]|$)/.test(src));
  fs.mkdirSync(path.join(root, 'tasks', 'claims'), { recursive: true });
  fs.copyFileSync(path.join(REAL_REPO, 'tasks', 'task.example.json'), path.join(root, 'tasks', 'task.example.json'));
  fs.mkdirSync(path.join(root, 'feedback'));
  fs.copyFileSync(path.join(REAL_REPO, 'feedback', 'README.md'), path.join(root, 'feedback', 'README.md'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.mkdirSync(path.join(root, 'registry'));
  const reg = writeRegistry(root, TEST_TYPES);
  fs.renameSync(reg, path.join(root, 'registry', 'connectors.json'));
  return root;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

export class StdioClient {
  constructor(args = []) {
    this.proc = spawn(process.execPath, [SERVER, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.stderr = '';
    this.stdoutLines = [];
    this.proc.stderr.on('data', (d) => { this.stderr += d; });
    this.waiting = new Map();
    this.nextId = 1;
    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.rl.on('line', (line) => {
      this.stdoutLines.push(line);
      let m;
      try { m = JSON.parse(line); } catch { return; }
      const w = this.waiting.get(m.id);
      if (w) { this.waiting.delete(m.id); w(m); }
    });
    this.exited = new Promise((res) => this.proc.on('exit', (code) => res(code)));
  }
  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 20000);
      this.waiting.set(id, (m) => { clearTimeout(t); resolve(m); });
      this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }
  notify(method, params) {
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }
  raw(line) { this.proc.stdin.write(`${line}\n`); }
  // Calls a tool and returns { isError, body } with body the parsed envelope.
  async call(name, args = {}) {
    const m = await this.request('tools/call', { name, arguments: args });
    if (m.error) return { rpcError: m.error };
    return { isError: m.result.isError, body: JSON.parse(m.result.content[0].text) };
  }
  async close() {
    this.proc.stdin.end();
    const code = await this.exited;
    return code;
  }
}

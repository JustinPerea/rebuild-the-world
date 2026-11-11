import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, readJson } from './profile.mjs';

export const CONN_RE = /^conn_([a-z0-9]+(?:_[a-z0-9]+)*)_([ab])_(\d+)$/;

export function parseConnName(name) {
  const m = CONN_RE.exec(name || '');
  return m ? { type: m[1], side: m[2], index: m[3] } : null;
}

export function loadRegistry(registryPath) {
  const file = registryPath ? path.resolve(registryPath) : path.join(REPO_ROOT, 'registry', 'connectors.json');
  const out = { file, types: new Map(), error: null };
  try {
    const j = readJson(file);
    for (const t of j.types || []) out.types.set(t.type, t);
  } catch (e) {
    out.error = `cannot read connector registry ${file}: ${e.message}`;
  }
  return out;
}

export function symmetryCount(sym) {
  if (sym === 'free') return Infinity;
  if (Number.isInteger(sym) && sym >= 1) return sym;
  return 1; // "none" and anything unreadable: one valid rotation
}

export const exists = (p) => fs.existsSync(p);

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
    for (const t of j.types || []) {
      out.types.set(t.type, t);
      // mating_axes: for each mating dimension, the axis of the connector's own frame it lies along.
      if (t.mating_axes !== undefined) {
        const dims = Array.isArray(t.mating_dimensions) ? t.mating_dimensions : [];
        if (!t.mating_axes || typeof t.mating_axes !== 'object' || Array.isArray(t.mating_axes)) {
          out.error = `connector registry ${file}: type "${t.type}": mating_axes must be an object of { dimension: "x" | "y" | "z" }`;
        } else {
          for (const [d, a] of Object.entries(t.mating_axes)) {
            if (!dims.includes(d)) out.error = `connector registry ${file}: type "${t.type}": mating_axes names "${d}", which is not one of its mating_dimensions (${dims.join(', ') || 'none'})`;
            else if (!['x', 'y', 'z'].includes(a)) out.error = `connector registry ${file}: type "${t.type}": mating_axes "${d}" is ${JSON.stringify(a)}, and must be "x", "y" or "z"`;
          }
        }
      }
    }
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

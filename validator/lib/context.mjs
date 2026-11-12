import fs from 'node:fs';
import path from 'node:path';
import { readJson, REPO_ROOT } from './profile.mjs';
import { parseGlb, GlbError, nodeWorlds, collectGeometry } from './glb.mjs';
import { orthoFrame } from './math.mjs';
import { parseConnName } from './registry.mjs';

function tryJson(file) {
  if (!fs.existsSync(file)) return { missing: true };
  try {
    return { value: readJson(file) };
  } catch (e) {
    return { error: `${path.basename(file)} is not valid JSON: ${e.message}` };
  }
}

const glbCache = new Map();
export function loadGlb(file) {
  if (glbCache.has(file)) return glbCache.get(file);
  let r;
  try {
    r = { doc: parseGlb(fs.readFileSync(file)) };
  } catch (e) {
    r = { error: e instanceof GlbError ? e.message : `cannot read ${file}: ${e.message}` };
  }
  glbCache.set(file, r);
  return r;
}

// Connector nodes of a parsed GLB: name -> { type, side, index, frame, node }.
export function glbConnectors(doc) {
  const worlds = nodeWorlds(doc.json);
  const found = new Map();
  const bad = [];
  const dupes = [];
  for (const [i, w] of worlds) {
    const node = doc.json.nodes[i];
    const name = node.name || '';
    if (!name.startsWith('conn_')) continue;
    const parsed = parseConnName(name);
    if (!parsed) {
      bad.push(name);
      continue;
    }
    if (found.has(name)) dupes.push(name);
    const raw = { p: [w[12], w[13], w[14]], y: [w[4], w[5], w[6]], z: [w[8], w[9], w[10]] };
    found.set(name, { ...parsed, name, rawFrame: raw, frame: orthoFrame(raw) });
  }
  return { found, bad, dupes };
}

export function countTriangles(doc) {
  const { prims } = collectGeometry(doc);
  let n = 0;
  for (const p of prims) if (!p.isCollision && p.mode === 4) n += Math.floor(p.indices.length / 3);
  return n;
}

export function loadAssetDir(dir) {
  const a = { dir, files: [], kind: null, meta: null, metaError: null, manifest: null, manifestError: null, blueprint: null, blueprintError: null };
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    a.dirError = `cannot read folder ${dir}: ${e.message}`;
    return a;
  }
  a.files = entries;
  if (entries.includes('asset.glb')) a.kind = 'atom';
  else if (entries.includes('molecule.json')) a.kind = 'molecule';
  else if (entries.includes('blueprint.json')) a.kind = 'object';
  const m = tryJson(path.join(dir, 'asset.json'));
  a.meta = m.value ?? null;
  a.metaError = m.error ?? (m.missing ? 'asset.json is missing' : null);
  if (a.kind === 'molecule') {
    const j = tryJson(path.join(dir, 'molecule.json'));
    a.manifest = j.value ?? null;
    a.manifestError = j.error ?? null;
  }
  // An object's folder keeps its blueprint when the molecule is written, so a molecule may have one beside it.
  if (a.kind === 'object' || (a.kind === 'molecule' && entries.includes('blueprint.json'))) {
    const j = tryJson(path.join(dir, 'blueprint.json'));
    a.blueprint = j.value ?? null;
    a.blueprintError = j.error ?? null;
  }
  if (a.kind === 'atom') {
    const g = loadGlb(path.join(dir, 'asset.glb'));
    a.glb = g.doc ?? null;
    a.glbError = g.error ?? null;
  }
  return a;
}

export function defaultLibrary() {
  return path.join(REPO_ROOT, 'assets');
}

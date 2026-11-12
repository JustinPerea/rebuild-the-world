import fs from 'node:fs';
import path from 'node:path';
import { sceneRoots, isIdentityNode, collectGeometry, COL_RE, pngSize, readAccessor } from '../lib/glb.mjs';
import { glbConnectors, countTriangles } from '../lib/context.mjs';
import { normClass } from '../lib/profile.mjs';
import { bboxOfFaces, visiblePrims, usedVertices, vtx, triArea, triNormal, dot } from '../lib/geom.mjs';
import { libraryDir, moleculeBounds } from '../lib/library.mjs';
import { analyze } from './analysis.mjs';
import { norm, vsub, len } from '../lib/math.mjs';

export const pass = (messages = []) => ({ status: 'PASS', messages });
export const fail = (messages) => ({ status: 'FAIL', messages: Array.isArray(messages) ? messages : [messages] });
export const skip = (reason) => ({ status: 'SKIP', messages: [reason] });
const fmt = (v, d = 4) => Number(v.toFixed(d));

const ID_RE = /^(veh|bld|prop|veg|gnd|mat|ter|int|obj|chr)(_[a-z0-9]+){2,}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const needAtom = (ctx, what) => (ctx.asset.kind === 'atom' ? null : skip(`applies to atoms (asset.glb); this is ${ctx.asset.kind ? `${ctx.asset.kind === 'molecule' ? 'a' : 'an'} ${ctx.asset.kind}` : 'an unrecognised folder'}${what ? `; ${what}` : ''}`));
const needGlb = (ctx) => (ctx.asset.glb ? null : fail(`asset.glb cannot be read: ${ctx.asset.glbError}`));

// ---------------------------------------------------------------------------
export async function fileValidity(ctx) {
  const s = needAtom(ctx);
  if (s) return s;
  if (ctx.asset.glbError) return fail(`asset.glb is not a readable GLB: ${ctx.asset.glbError}`);
  let mod;
  try {
    mod = await import('gltf-validator');
  } catch {
    return skip('gltf-validator not installed (run `npm install` in validator/); the GLB container itself parsed without error');
  }
  const api = mod.validateBytes ? mod : mod.default;
  const file = path.join(ctx.dir, 'asset.glb');
  const bytes = new Uint8Array(fs.readFileSync(file));
  const root = path.resolve(ctx.dir);
  const report = await api.validateBytes(bytes, {
    uri: 'asset.glb',
    maxIssues: 50,
    externalResourceFunction: (uri) => {
      const p = path.resolve(root, decodeURIComponent(uri));
      if (!p.startsWith(root + path.sep)) return Promise.reject(new Error(`resource ${uri} is outside the asset folder`));
      return Promise.resolve(new Uint8Array(fs.readFileSync(p)));
    },
  });
  const errors = report.issues.messages.filter((m) => m.severity === 0);
  if (errors.length === 0) {
    const w = report.issues.numWarnings;
    return pass(w ? [`gltf-validator reports 0 errors and ${w} warning(s)`] : []);
  }
  return fail(errors.map((m) => `${m.code} at ${m.pointer || '/'}: ${m.message}`));
}

// ---------------------------------------------------------------------------
const FILES = { atom: ['asset.glb', 'asset.json'], molecule: ['molecule.json', 'asset.json'], object: ['blueprint.json', 'asset.json'] };

export function folderAndNaming(ctx) {
  const a = ctx.asset;
  if (a.dirError) return fail(a.dirError);
  const msgs = [];
  const folder = path.basename(path.resolve(ctx.dir));
  if (!ID_RE.test(folder)) msgs.push(`folder name "${folder}" does not match <category>_<name>_<variant> (lowercase ASCII, digits and underscores; category one of veh, bld, prop, veg, gnd, mat, ter, int, obj, chr; at least a name and a variant, e.g. veh_wheel_17in_01)`);
  if (!a.kind) {
    msgs.push('folder holds none of asset.glb (atom), molecule.json (molecule) or blueprint.json (object)');
    return fail(msgs);
  }
  if (a.kind === 'atom' && a.files.includes('molecule.json')) msgs.push('folder has both asset.glb and molecule.json; a molecule has molecule.json in place of asset.glb');
  if (a.kind === 'atom' && a.files.includes('blueprint.json')) msgs.push('folder has both asset.glb and blueprint.json; use one kind per folder');
  for (const f of FILES[a.kind]) if (!a.files.includes(f)) msgs.push(`required file ${f} is missing`);
  if (a.metaError && a.files.includes('asset.json')) msgs.push(a.metaError);
  if (a.manifestError) msgs.push(a.manifestError);
  if (a.blueprintError) msgs.push(a.blueprintError);
  const idField = a.kind === 'object' ? a.blueprint?.object_id : a.kind === 'molecule' ? a.manifest?.asset_id : null;
  if (a.kind !== 'atom') {
    const label = a.kind === 'object' ? 'blueprint.json "object_id"' : 'molecule.json "asset_id"';
    if (idField === undefined || idField === null) msgs.push(`${label} is missing`);
    else if (idField !== folder) msgs.push(`${label} is "${idField}" but the folder is "${folder}"`);
  }
  if (a.meta && a.meta.asset_id !== undefined && a.meta.asset_id !== folder) msgs.push(`asset.json "asset_id" is "${a.meta.asset_id}" but the folder is "${folder}"`);
  if (msgs.length) return fail(msgs);
  const notes = [];
  for (const d of ['preview', 'source']) if (!a.files.includes(d)) notes.push(`note: ${d}/ is absent (the spec's layout lists it; not enforced)`);
  return pass(notes);
}

// ---------------------------------------------------------------------------
const COMMON = ['asset_id', 'version', 'task_id', 'spec_version', 'profile', 'style_version', 'library', 'kind', 'description', 'licence', 'sources', 'provenance'];
const REQUIRED = {
  atom: [...COMMON, 'class', 'tier', 'dimensions_m', 'triangles', 'connectors', 'mirror_safe', 'materials'],
  molecule: [...COMMON, 'class', 'tier', 'triangles'],
  object: COMMON,
};
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim() !== '';

export function metadata(ctx) {
  const a = ctx.asset;
  if (!a.kind) return skip('asset kind unknown; see Folder and naming');
  if (!a.meta) return fail(a.metaError || 'asset.json is missing');
  const m = a.meta;
  const msgs = [];
  for (const f of REQUIRED[a.kind]) {
    if (m[f] === undefined || m[f] === null || m[f] === '') msgs.push(`asset.json: required field "${f}" is missing`);
  }
  const typed = (f, ok, want) => { if (m[f] !== undefined && m[f] !== null && !ok(m[f])) msgs.push(`asset.json "${f}" must be ${want}, found ${JSON.stringify(m[f])}`); };
  typed('version', (v) => SEMVER.test(v), 'a version like 1.0.0');
  typed('spec_version', isStr, 'a string');
  typed('kind', (v) => v === 'library' || v === 'unique', '"library" or "unique"');
  typed('tier', (v) => [1, 2, 3].includes(Number(v)), '1, 2 or 3');
  typed('dimensions_m', (v) => Array.isArray(v) && v.length === 3 && v.every(isNum), 'an array of three numbers [width, height, depth] in metres');
  typed('triangles', (v) => Number.isInteger(v) && v >= 0, 'a non-negative integer');
  typed('connectors', Array.isArray, 'an array');
  typed('mirror_safe', (v) => typeof v === 'boolean', 'true or false');
  typed('sources', Array.isArray, 'an array (empty if no map data or imagery was used)');
  typed('description', (v) => isStr(v) || (v && typeof v === 'object'), 'plain-language text');
  typed('materials', (v) => v && typeof v === 'object' && !Array.isArray(v), 'an object { "library": [ids], "custom": [names] }');
  if (m.provenance && typeof m.provenance === 'object') {
    for (const f of ['author', 'created', 'dimension_source']) if (!isStr(m.provenance[f])) msgs.push(`asset.json provenance: "${f}" is missing`);
    if (!Array.isArray(m.provenance.tools)) msgs.push('asset.json provenance: "tools" must be an array');
    if (isStr(m.provenance.dimension_source) && !['measured', 'estimated', 'designed'].includes(m.provenance.dimension_source)) msgs.push(`asset.json provenance.dimension_source must be "measured", "estimated" or "designed", found "${m.provenance.dimension_source}"`);
  } else if (m.provenance !== undefined) msgs.push('asset.json "provenance" must be an object');
  if (m.kind === 'unique') {
    for (const f of ['anchor', 'place_id', 'accuracy_level']) if (m[f] === undefined) msgs.push(`asset.json: unique assets require "${f}"`);
    if (m.accuracy_level !== undefined && !['A2', 'A3'].includes(m.accuracy_level)) msgs.push(`asset.json "accuracy_level" must be "A2" or "A3" for a unique asset, found ${JSON.stringify(m.accuracy_level)}`);
  }
  // Recorded values against the file.
  if (a.kind === 'atom') {
    if (!a.glb) msgs.push(`cannot compare metadata with asset.glb: ${a.glbError}`);
    else {
      const { prims } = collectGeometry(a.glb);
      const vis = visiblePrims(prims);
      const box = bboxOfFaces(vis);
      if (box && Array.isArray(m.dimensions_m) && m.dimensions_m.length === 3) {
        const tol = ctx.profile.dimension_record_tolerance_m;
        ['width (x)', 'height (y)', 'depth (z)'].forEach((n, k) => {
          if (Math.abs(box.size[k] - m.dimensions_m[k]) > tol) msgs.push(`asset.json dimensions_m ${n} is ${m.dimensions_m[k]} m but the mesh measures ${fmt(box.size[k])} m (allowed difference ${tol * 1000} mm)`);
        });
      }
      const tris = countTriangles(a.glb);
      if (Number.isInteger(m.triangles) && m.triangles !== tris) msgs.push(`asset.json triangles is ${m.triangles} but the mesh has ${tris}`);
      const conns = glbConnectors(a.glb);
      if (Array.isArray(m.connectors)) {
        const listed = new Map();
        m.connectors.forEach((c, i) => {
          if (!c || !isStr(c.name)) { msgs.push(`asset.json connectors[${i}] has no "name"`); return; }
          if (listed.has(c.name)) msgs.push(`asset.json lists connector "${c.name}" twice`);
          listed.set(c.name, c);
        });
        for (const [name, node] of conns.found) {
          const c = listed.get(name);
          if (!c) { msgs.push(`connector node "${name}" is in asset.glb but not listed in asset.json "connectors"`); continue; }
          if (c.type !== undefined && c.type !== node.type) msgs.push(`asset.json connector "${name}" has type "${c.type}" but the node name says "${node.type}"`);
          if (c.side !== undefined && c.side !== node.side) msgs.push(`asset.json connector "${name}" has side "${c.side}" but the node name says "${node.side}"`);
          if (c.type === undefined || c.side === undefined) msgs.push(`asset.json connector "${name}" must state "type" and "side"`);
        }
        for (const name of listed.keys()) if (!conns.found.has(name)) msgs.push(`asset.json lists connector "${name}" but asset.glb has no node with that name`);
      }
      if (m.materials && typeof m.materials === 'object') {
        const names = (a.glb.json.materials || []).map((x) => x.name || '');
        const lib = names.filter((n) => n.startsWith('mat_'));
        const custom = names.filter((n) => !n.startsWith('mat_'));
        const setEq = (x, y) => x.length === y.length && x.every((v) => y.includes(v));
        if (m.materials.library && !setEq([...new Set(lib)], [...new Set(m.materials.library)])) msgs.push(`asset.json materials.library is [${(m.materials.library || []).join(', ')}] but asset.glb references library materials [${[...new Set(lib)].join(', ')}]`);
        if (!m.materials.library && lib.length) msgs.push(`asset.json materials.library is missing; asset.glb references [${lib.join(', ')}]`);
        if (m.materials.custom && !setEq(custom, m.materials.custom)) msgs.push(`asset.json materials.custom is [${m.materials.custom.join(', ')}] but asset.glb has custom materials [${custom.join(', ')}]`);
        if (!m.materials.custom && custom.length) msgs.push(`asset.json materials.custom is missing; asset.glb has [${custom.join(', ')}]`);
      }
    }
  }
  if (a.kind === 'molecule') {
    const an = analyze(ctx);
    if (an && Number.isInteger(m.triangles) && an.triangles !== m.triangles) msgs.push(`asset.json triangles is ${m.triangles} but the atoms sum to ${an.triangles}`);
  }
  return msgs.length ? fail(msgs) : pass();
}

// ---------------------------------------------------------------------------
// A molecule has no mesh of its own: its size is measured from its atoms, placed through the joints.
function moleculeScale(ctx) {
  const an = analyze(ctx);
  if (!an || an.errors.length) return skip('the molecule could not be placed, so it cannot be measured; see Molecule');
  const box = moleculeBounds(an);
  if (!box) return fail('no placed atom has triangles to measure');
  const tol = ctx.profile.scale_tolerance;
  const names = ['width (x)', 'height (y)', 'depth (z)'];
  const msgs = [];
  const notes = [`measured from the placed atoms: ${box.size.map((v) => fmt(v)).join(' by ')} m (x from ${fmt(box.min[0])} to ${fmt(box.max[0])}, y from ${fmt(box.min[1])} to ${fmt(box.max[1])}, z from ${fmt(box.min[2])} to ${fmt(box.max[2])})`];
  const own = ctx.asset.meta?.dimensions_m;
  if (own !== undefined) {
    if (!Array.isArray(own) || own.length !== 3 || !own.every(isNum)) msgs.push('asset.json "dimensions_m" must be three numbers [width, height, depth] in metres');
    else names.forEach((n, k) => {
      if (Math.abs(box.size[k] - own[k]) > Math.max(0.001, 0.001 * box.size[k])) msgs.push(`asset.json dimensions_m gives ${n} as ${own[k]} m, the placed atoms measure ${fmt(box.size[k])} m; record the measured size of the whole object`);
    });
  } else notes.push('asset.json records no dimensions_m');
  const dims = ctx.task?.dimensions_m;
  if (!ctx.task) notes.push('no --task given, so the size was not compared with a task');
  else if (dims === undefined) notes.push('the task gives no dimensions_m, so the size was not compared with it');
  else if (!Array.isArray(dims) || dims.length !== 3 || !dims.every((v) => isNum(v) && v > 0)) msgs.push('task file "dimensions_m" must be three positive numbers [width, height, depth] in metres');
  else names.forEach((n, k) => {
    const rel = Math.abs(box.size[k] - dims[k]) / dims[k];
    if (rel > tol) msgs.push(`${n} is ${fmt(box.size[k])} m, the task asks for ${dims[k]} m: off by ${fmt(rel * 100, 2)}% (allowed ${tol * 100}%)`);
  });
  return msgs.length ? fail([...msgs, ...notes]) : pass(notes);
}

export function scale(ctx) {
  if (ctx.asset.kind === 'molecule') return moleculeScale(ctx);
  const s = needAtom(ctx);
  if (s) return s;
  const dims = ctx.task?.dimensions_m;
  if (!ctx.task) return skip('no --task given; the task supplies the dimensions to compare with');
  if (!Array.isArray(dims) || dims.length !== 3 || !dims.every((v) => isNum(v) && v > 0)) return fail('task file "dimensions_m" must be three positive numbers [width, height, depth] in metres');
  const g = needGlb(ctx);
  if (g) return g;
  const box = bboxOfFaces(visiblePrims(collectGeometry(ctx.asset.glb).prims));
  if (!box) return fail('asset.glb has no triangles to measure');
  const tol = ctx.profile.scale_tolerance;
  const msgs = [];
  ['width (x)', 'height (y)', 'depth (z)'].forEach((n, k) => {
    const rel = Math.abs(box.size[k] - dims[k]) / dims[k];
    if (rel > tol) msgs.push(`${n} is ${fmt(box.size[k])} m, the task asks for ${dims[k]} m: off by ${fmt(rel * 100, 2)}% (allowed ${tol * 100}%)`);
  });
  return msgs.length ? fail(msgs) : pass();
}

// ---------------------------------------------------------------------------
export function transforms(ctx) {
  const s = needAtom(ctx);
  if (s) return s;
  const g = needGlb(ctx);
  if (g) return g;
  const json = ctx.asset.glb.json;
  const msgs = [];
  for (const r of sceneRoots(json)) {
    const n = json.nodes[r];
    if (n && !isIdentityNode(n)) {
      const bits = [];
      if (n.matrix) bits.push(`matrix ${JSON.stringify(n.matrix)}`);
      if (n.translation) bits.push(`translation ${JSON.stringify(n.translation)}`);
      if (n.rotation) bits.push(`rotation ${JSON.stringify(n.rotation)}`);
      if (n.scale) bits.push(`scale ${JSON.stringify(n.scale)}`);
      msgs.push(`root node "${n.name ?? r}" has a transform (${bits.join(', ')}); apply transforms before export so the root has position 0, rotation 0, scale 1`);
    }
  }
  return msgs.length ? fail(msgs) : pass();
}

// ---------------------------------------------------------------------------
export function triangleBudget(ctx) {
  const a = ctx.asset;
  if (a.kind === 'object') return skip('a blueprint has no mesh; its atoms and molecules are budgeted on their own');
  if (!a.kind) return skip('asset kind unknown');
  if (!a.meta?.class) return fail('asset.json "class" is missing, so the budget class is unknown');
  const key = normClass(a.meta.class);
  const budget = ctx.profile.budgets[key];
  if (budget === undefined) return fail(`class "${a.meta.class}" has no budget in ${ctx.profile.name} (classes: ${Object.keys(ctx.profile.budgets).join(', ')})`);
  let count;
  let what;
  if (a.kind === 'atom') {
    const g = needGlb(ctx);
    if (g) return g;
    count = countTriangles(a.glb);
    what = 'LOD0';
  } else {
    const an = analyze(ctx);
    count = an.triangles;
    what = 'sum of atoms';
  }
  return count > budget ? fail(`${what} has ${count} triangles, class "${a.meta.class}" allows ${budget} (over by ${count - budget})`) : pass([`${count} of ${budget} triangles`]);
}

// ---------------------------------------------------------------------------
export function meshHealth(ctx) {
  const s = needAtom(ctx);
  if (s) return s;
  const g = needGlb(ctx);
  if (g) return g;
  const { prims, problems } = collectGeometry(ctx.asset.glb);
  const vis = visiblePrims(prims);
  const msgs = [...problems];
  if (vis.length === 0) return fail([...msgs, 'asset.glb has no visible mesh']);
  const weld = ctx.profile.weld_m;
  const ids = new Map();
  const wid = (p, v) => {
    const k = `${Math.round(p.positions[v * 3] / weld)},${Math.round(p.positions[v * 3 + 1] / weld)},${Math.round(p.positions[v * 3 + 2] / weld)}`;
    let id = ids.get(k);
    if (id === undefined) { id = ids.size; ids.set(k, id); }
    return id;
  };
  const faces = new Map();
  const edges = new Map();
  const directed = new Map();
  const parent = [];
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (x, y) => { x = find(x); y = find(y); if (x !== y) parent[x] = y; };
  const tris = [];
  let zero = 0;
  let dup = 0;
  const examples = { zero: [], dup: [] };
  for (const p of vis) {
    if (p.mode !== 4) { msgs.push(`${p.where}: primitive mode ${p.mode} is not triangles; Profile 1 allows triangle lists only`); continue; }
    if (p.indices.length % 3) msgs.push(`${p.where}: index count ${p.indices.length} is not a multiple of 3`);
    const used = usedVertices(p);
    const loose = p.vertexCount - used.size;
    if (loose > 0) msgs.push(`${p.where}: ${loose} loose vertex(es) not used by any triangle; delete them`);
    const nT = Math.floor(p.indices.length / 3);
    for (let t = 0; t < nT; t++) {
      const [i0, i1, i2] = [p.indices[t * 3], p.indices[t * 3 + 1], p.indices[t * 3 + 2]];
      const a = vtx(p, i0), b = vtx(p, i1), c = vtx(p, i2);
      const w = [wid(p, i0), wid(p, i1), wid(p, i2)];
      const area = triArea(a, b, c);
      if (area < ctx.profile.zero_area_m2 || new Set(w).size < 3) {
        zero++;
        if (examples.zero.length < 5) examples.zero.push(`${p.where} triangle ${t} (area ${area.toExponential(2)} m^2)`);
        continue;
      }
      const fk = [...w].sort((x, y) => x - y).join('_');
      if (faces.has(fk)) { dup++; if (examples.dup.length < 5) examples.dup.push(`${p.where} triangle ${t} repeats triangle ${faces.get(fk)}`); } else faces.set(fk, `${t} of ${p.where}`);
      unite(w[0], w[1]); unite(w[1], w[2]);
      for (const [x, y] of [[w[0], w[1]], [w[1], w[2]], [w[2], w[0]]]) {
        const ek = x < y ? `${x}_${y}` : `${y}_${x}`;
        edges.set(ek, (edges.get(ek) || 0) + 1);
        const dk = `${x}_${y}`;
        directed.set(dk, (directed.get(dk) || 0) + 1);
      }
      tris.push({ w, a, b, c });
    }
  }
  if (zero) msgs.push(`${zero} zero-area triangle(s), e.g. ${examples.zero.join('; ')}`);
  if (dup) msgs.push(`${dup} duplicate triangle(s), e.g. ${examples.dup.join('; ')}`);
  if (ctx.asset.meta?.thin === true) return msgs.length ? fail(msgs) : pass(['metadata marks the asset thin: watertight and outward-normal checks skipped']);
  let open = 0;
  let nonManifold = 0;
  let sameDir = 0;
  for (const [, n] of edges) { if (n === 1) open++; else if (n > 2) nonManifold++; }
  for (const [, n] of directed) if (n > 1) sameDir++;
  const comps = new Map();
  for (const t of tris) {
    const r = find(t.w[0]);
    const n = triNormal(t.a, t.b, t.c);
    const vol = dot(t.a, n) / 6;
    comps.set(r, (comps.get(r) || 0) + vol);
  }
  if (open) msgs.push(`not watertight: ${open} edge(s) belong to only one triangle (holes). Close the mesh, or set "thin": true in asset.json if the object is a sheet`);
  if (nonManifold) msgs.push(`not watertight: ${nonManifold} edge(s) are shared by more than two triangles`);
  if (sameDir) msgs.push(`${sameDir} edge(s) are used twice in the same direction: neighbouring triangles have opposite winding`);
  if (!open && !nonManifold && !sameDir) {
    let inward = 0;
    for (const v of comps.values()) if (v < 0) inward++;
    if (inward) msgs.push(`${inward} closed shell(s) have normals pointing inward (negative signed volume); flip the winding so normals point outward`);
  }
  return msgs.length ? fail(msgs) : pass();
}

// ---------------------------------------------------------------------------
export function collision(ctx) {
  const s = needAtom(ctx, 'collision shapes are per atom');
  if (s) return s;
  const g = needGlb(ctx);
  if (g) return g;
  const json = ctx.asset.glb.json;
  const msgs = [];
  const colNodes = (json.nodes || []).filter((n) => (n.name || '').startsWith('col_'));
  for (const n of colNodes) if (!COL_RE.test(n.name)) msgs.push(`node "${n.name}" starts with col_ but is not named col_<index> (digits only)`);
  const named = colNodes.filter((n) => COL_RE.test(n.name));
  const { min, max } = { min: ctx.profile.collision_min, max: ctx.profile.collision_max };
  if (named.length < min || named.length > max) msgs.push(`${named.length} collision shape(s) (col_<index> nodes); Profile 1 requires ${min} to ${max}`);
  const { prims } = collectGeometry(ctx.asset.glb);
  for (const n of named) {
    if (n.mesh === undefined) msgs.push(`collision node "${n.name}" has no mesh; it must be a convex hull`);
  }
  for (const p of prims.filter((x) => x.isCollision)) {
    if (p.mode !== 4) { msgs.push(`collision ${p.where}: not a triangle list`); continue; }
    const uniq = [...usedVertices(p)].map((v) => vtx(p, v));
    const nT = Math.floor(p.indices.length / 3);
    let worst = 0;
    let at = -1;
    for (let t = 0; t < nT; t++) {
      const a = vtx(p, p.indices[t * 3]), b = vtx(p, p.indices[t * 3 + 1]), c = vtx(p, p.indices[t * 3 + 2]);
      const n = norm(triNormal(a, b, c));
      if (len(n) === 0) continue;
      let pos = 0, negd = 0;
      for (const v of uniq) {
        const d = dot(n, vsub(v, a));
        if (d > 1e-6) pos = Math.max(pos, d);
        if (d < -1e-6) negd = Math.max(negd, -d);
      }
      const bad = Math.min(pos, negd);
      if (bad > worst) { worst = bad; at = t; }
    }
    if (worst > 0) msgs.push(`collision ${p.where} is not convex: vertices lie on both sides of the plane of triangle ${at} (by ${fmt(worst * 1000, 2)} mm)`);
  }
  return msgs.length ? fail(msgs) : pass([`${named.length} collision shape(s)`]);
}

// ---------------------------------------------------------------------------
function imageBytes(ctx, img) {
  const doc = ctx.asset.glb;
  if (img.bufferView !== undefined) {
    const bv = doc.json.bufferViews[img.bufferView];
    const off = (bv.byteOffset || 0);
    return Buffer.from(doc.bin.subarray(off, off + bv.byteLength));
  }
  if (img.uri) {
    if (img.uri.startsWith('data:')) {
      const i = img.uri.indexOf(',');
      return Buffer.from(img.uri.slice(i + 1), 'base64');
    }
    const root = path.resolve(ctx.dir);
    const p = path.resolve(root, decodeURIComponent(img.uri));
    if (!p.startsWith(root + path.sep)) throw new Error(`image uri ${img.uri} is outside the asset folder`);
    return fs.readFileSync(p);
  }
  throw new Error('image has neither bufferView nor uri');
}

const openSlots = (ctx) => new Set((ctx.asset.meta?.variation?.open_slots || []).map((s) => s.slot));

export function textures(ctx) {
  const s = needAtom(ctx);
  if (s) return s;
  const g = needGlb(ctx);
  if (g) return g;
  const json = ctx.asset.glb.json;
  const pf = ctx.profile;
  const msgs = [];
  const images = json.images || [];
  images.forEach((img, i) => {
    const label = `image ${img.name ? `"${img.name}"` : i}`;
    let buf;
    try { buf = imageBytes(ctx, img); } catch (e) { msgs.push(`${label}: cannot read (${e.message})`); return; }
    if (img.mimeType && img.mimeType !== 'image/png') msgs.push(`${label}: mimeType is ${img.mimeType}; the source format is PNG (image/png)`);
    const size = pngSize(buf);
    if (!size) { msgs.push(`${label}: not a PNG file (bad signature or no IHDR chunk)`); return; }
    for (const [axis, v] of [['width', size.width], ['height', size.height]]) {
      if (v & (v - 1) || v === 0) msgs.push(`${label}: ${axis} ${v} px is not a power of two`);
      if (v > pf.texture_max_side) msgs.push(`${label}: ${axis} ${v} px is over the maximum ${pf.texture_max_side}`);
      if (v < pf.texture_min_side) msgs.push(`${label}: ${axis} ${v} px is under the minimum ${pf.texture_min_side}`);
    }
  });
  if (pf.require_custom_material_maps) {
    const exempt = openSlots(ctx);
    (json.materials || []).forEach((m, i) => {
      const name = m.name || `#${i}`;
      if (name.startsWith('mat_') || exempt.has(name)) return;
      const pbr = m.pbrMetallicRoughness || {};
      if (!pbr.baseColorTexture) msgs.push(`custom material "${name}": no base colour texture`);
      if (!m.normalTexture) msgs.push(`custom material "${name}": no normal texture`);
      if (!pbr.metallicRoughnessTexture || !m.occlusionTexture) msgs.push(`custom material "${name}": needs an occlusion-roughness-metallic texture, set as both occlusionTexture and metallicRoughnessTexture`);
      else if (pbr.metallicRoughnessTexture.index !== m.occlusionTexture.index) msgs.push(`custom material "${name}": occlusion and metallic-roughness must be channels R, G, B of one texture, but they use textures ${m.occlusionTexture.index} and ${pbr.metallicRoughnessTexture.index}`);
    });
  }
  if (msgs.length) return fail(msgs);
  return pass(images.length ? [`${images.length} image(s) checked; colour spaces follow glTF slot rules and pixels per metre is not measured`] : ['no textures']);
}

// ---------------------------------------------------------------------------
export function materials(ctx) {
  const s = needAtom(ctx, 'materials of molecules come from their atoms');
  if (s) return s;
  const g = needGlb(ctx);
  if (g) return g;
  const mats = ctx.asset.glb.json.materials || [];
  const msgs = [];
  const size = String(ctx.task?.size || ctx.asset.meta?.size || 'S').toUpperCase();
  const max = size === 'S' ? ctx.profile.materials_max_small : ctx.profile.materials_max_large;
  if (mats.length > max) msgs.push(`${mats.length} materials; Profile 1 allows ${max} on a size ${size} asset (size comes from the task or asset.json "size", default S)`);
  for (const m of mats) {
    const name = m.name || '';
    if (!name.startsWith('mat_')) continue;
    const dir = libraryDir(ctx.libDir, name);
    if (!fs.existsSync(dir)) msgs.push(`library material "${name}" does not exist: ${dir} not found`);
  }
  return msgs.length ? fail(msgs) : pass([`${mats.length} material(s)`]);
}

// ---------------------------------------------------------------------------
function folderBytes(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += folderBytes(p);
    else if (e.isFile()) total += fs.statSync(p).size;
  }
  return total;
}

export function fileSize(ctx) {
  if (ctx.asset.dirError) return fail(ctx.asset.dirError);
  const max = ctx.profile.folder_max_bytes;
  const n = folderBytes(ctx.dir);
  return n >= max ? fail(`folder is ${(n / 1e6).toFixed(1)} MB; it must be under ${max / 1e6} MB`) : pass([`${(n / 1e6).toFixed(2)} MB`]);
}

// ---------------------------------------------------------------------------
export function licence(ctx) {
  const a = ctx.asset;
  const msgs = [];
  if (!a.meta) msgs.push(a.metaError || 'asset.json is missing');
  else if (!isStr(a.meta.licence) || /^(tbd|todo|unknown|none)$/i.test(a.meta.licence.trim())) msgs.push(`asset.json "licence" is ${a.meta.licence === undefined ? 'missing' : JSON.stringify(a.meta.licence)}; state the agreed licence`);
  const refs = path.join(ctx.dir, 'refs');
  if (fs.existsSync(refs)) {
    const files = fs.readdirSync(refs).filter((f) => fs.statSync(path.join(refs, f)).isFile());
    const isNote = (f) => /\.licen[cs]e\.txt$/i.test(f);
    for (const f of files.filter((x) => !isNote(x))) {
      const note = files.find((x) => x.toLowerCase() === `${f.toLowerCase()}.licence.txt` || x.toLowerCase() === `${f.toLowerCase()}.license.txt`);
      if (!note) msgs.push(`refs/${f} has no licence note; add refs/${f}.licence.txt stating its source and licence`);
      else if (fs.readFileSync(path.join(refs, note), 'utf8').trim() === '') msgs.push(`refs/${note} is empty`);
    }
  }
  return msgs.length ? fail(msgs) : pass();
}

// Fixture builders. Everything is generated at test time into a temp directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

export function tmpDir(prefix = 'rtw-val-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
export function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

export const quatY = (deg) => [0, Math.sin((deg * Math.PI) / 360), 0, Math.cos((deg * Math.PI) / 360)];

// ---- geometry ---------------------------------------------------------------
const QUADS = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];

export function boxMesh(w = 1, h = 1, d = 1, centre = [0, 0, 0]) {
  const positions = [];
  for (let i = 0; i < 8; i++) {
    positions.push(centre[0] + (i & 1 ? w / 2 : -w / 2), centre[1] + (i & 2 ? h / 2 : -h / 2), centre[2] + (i & 4 ? d / 2 : -d / 2));
  }
  const indices = [];
  for (const [a, b, c, e] of QUADS) {
    for (const t of [[a, b, c], [a, c, e]]) {
      const p = t.map((i) => positions.slice(i * 3, i * 3 + 3));
      const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
      const v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const out = [p[0][0] - centre[0], p[0][1] - centre[1], p[0][2] - centre[2]];
      indices.push(...(n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? t : [t[0], t[2], t[1]]));
    }
  }
  return { positions, indices };
}

// ---- PNG --------------------------------------------------------------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
// real = true writes real pixel data (only for small sizes); false writes the header size with a stub body.
export function png(width, height, real = width * height <= 128 * 128) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const raw = real ? Buffer.alloc((width * 3 + 1) * height) : Buffer.alloc(8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- GLB --------------------------------------------------------------------
// opts: mesh {positions, indices} | null, size, connectors [{name,pos,rotY,matrix}], collision (count) | hulls [{positions,indices}],
//       materials [gltf material objects], images [Buffer], rootTransform, mutate(json)
export function buildGlb(opts = {}) {
  const parts = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const addView = (buf, target) => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(target ? { target } : {}) });
    parts.push(buf);
    offset += buf.length;
    return bufferViews.length - 1;
  };
  const addMesh = (m, material, uv = false) => {
    const pos = Buffer.alloc(m.positions.length * 4);
    m.positions.forEach((v, i) => pos.writeFloatLE(v, i * 4));
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], m.positions[i + k]); max[k] = Math.max(max[k], m.positions[i + k]); }
    accessors.push({ bufferView: addView(pos, 34962), componentType: 5126, count: m.positions.length / 3, type: 'VEC3', min, max });
    const pa = accessors.length - 1;
    const idx = Buffer.alloc(m.indices.length * 2);
    m.indices.forEach((v, i) => idx.writeUInt16LE(v, i * 2));
    accessors.push({ bufferView: addView(idx, 34963), componentType: 5123, count: m.indices.length, type: 'SCALAR' });
    const ia = accessors.length - 1;
    const attributes = { POSITION: pa };
    if (uv) {
      const t = Buffer.alloc((m.positions.length / 3) * 8);
      accessors.push({ bufferView: addView(t, 34962), componentType: 5126, count: m.positions.length / 3, type: 'VEC2' });
      attributes.TEXCOORD_0 = accessors.length - 1;
    }
    return { attributes, indices: ia, ...(material !== undefined ? { material } : {}) };
  };

  const meshes = [];
  const nodes = [{ name: 'asset_root', children: [] }];
  if (opts.rootTransform) Object.assign(nodes[0], opts.rootTransform);
  const child = (n) => { nodes.push(n); nodes[0].children.push(nodes.length - 1); };

  if (opts.mesh !== null) {
    const m = opts.mesh || boxMesh(...(opts.size || [1, 1, 1]));
    const prim = addMesh(m, opts.materials?.length ? 0 : undefined, Boolean(opts.images?.length));
    meshes.push({ name: 'body_mesh', primitives: [prim] });
    child({ name: 'body', mesh: meshes.length - 1 });
  }
  for (const c of opts.connectors || []) {
    const n = { name: c.name };
    if (c.matrix) n.matrix = c.matrix;
    else { n.translation = c.pos; if (c.rotY) n.rotation = quatY(c.rotY); }
    child(n);
  }
  const hulls = opts.hulls || Array.from({ length: opts.collision ?? 1 }, () => boxMesh(0.5, 0.5, 0.5));
  hulls.forEach((h, i) => {
    meshes.push({ name: `hull_${i}`, primitives: [addMesh(h)] });
    child({ name: `col_${String(i + 1).padStart(2, '0')}`, mesh: meshes.length - 1 });
  });
  const images = [];
  for (const buf of opts.images || []) images.push({ bufferView: addView(buf), mimeType: opts.imageMime || 'image/png' });

  const json = {
    asset: { version: '2.0', generator: 'rtw-validator-tests' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes, meshes, accessors, bufferViews,
    buffers: [{ byteLength: 0 }],
    ...(opts.materials ? { materials: opts.materials } : {}),
    ...(images.length ? { images, textures: images.map((_, i) => ({ source: i })) } : {}),
  };
  if (opts.mutate) opts.mutate(json);
  const bin = Buffer.concat(parts);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  json.buffers[0].byteLength = binPadded.length;
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + js.length + 8 + binPadded.length;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  return Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(binPadded.length, 0x004e4942), binPadded]);
}

// ---- registry ---------------------------------------------------------------
export const TEST_TYPES = [
  { type: 'door_hinge', sides: { a: 'body side', b: 'door side' }, mating_dimensions: [], symmetry: 'none', motion: 'fixed' },
  { type: 'wheel_hub', sides: { a: 'axle', b: 'wheel' }, mating_dimensions: ['diameter'], symmetry: 'free', motion: 'spin', axis: 'z' },
  { type: 'tab_four', sides: { a: 'host', b: 'guest' }, mating_dimensions: [], symmetry: 4, motion: 'fixed' },
];
export function writeRegistry(dir, types = TEST_TYPES) {
  const file = path.join(dir, 'registry.json');
  fs.writeFileSync(file, JSON.stringify({ registry_version: 'test', types }));
  return file;
}

// ---- asset folders ----------------------------------------------------------
export function metaFor(id, o = {}) {
  return {
    asset_id: id, version: '1.0.0', task_id: 'task_test_01', spec_version: '0.4', profile: 'Profile 1 (2026)', style_version: '0.1',
    library: 'test', kind: 'library', class: 'Small prop', tier: 1, dimensions_m: [1, 1, 1], triangles: 12,
    connectors: [], mirror_safe: false, materials: { library: [], custom: [] }, description: 'A test box.', licence: 'CC0-1.0',
    sources: [], considered: [], provenance: { author: 'tester', tools: [], created: '2026-11-11', dimension_source: 'designed' },
    ...o,
  };
}

// Writes <lib>/<category>/<id>/ and returns the folder. glb: options for buildGlb, or null for none.
export function writeAtom(lib, id, { glb = {}, meta = {}, raw } = {}) {
  const dir = path.join(lib, id.split('_')[0], id);
  fs.mkdirSync(path.join(dir, 'source'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'preview'), { recursive: true });
  if (glb !== null) fs.writeFileSync(path.join(dir, 'asset.glb'), raw ?? buildGlb(glb));
  fs.writeFileSync(path.join(dir, 'asset.json'), JSON.stringify(metaFor(id, meta), null, 2));
  return dir;
}

export const conn = (name, pos, rotY = 0, extra = {}) => ({ name, pos, rotY, ...extra });
export function connMeta(name, extra = {}) {
  const m = /^conn_(.+)_([ab])_(\d+)$/.exec(name);
  return { name, type: m[1], side: m[2], ...extra };
}

// A valid atom: unit box, one hinge connector, one hull.
export function validAtom(lib, id = 'prop_box_01', { glb = {}, meta = {} } = {}) {
  const connectors = glb.connectors ?? [conn('conn_door_hinge_a_01', [0.5, 0, 0], 90)];
  return writeAtom(lib, id, {
    glb: { connectors, ...glb },
    meta: { connectors: connectors.map((c) => connMeta(c.name)), ...meta },
  });
}

export function writeMolecule(lib, id, manifest, meta = {}) {
  const dir = path.join(lib, id.split('_')[0], id);
  fs.mkdirSync(path.join(dir, 'source'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'preview'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'molecule.json'), JSON.stringify({ asset_id: id, ...manifest }, null, 2));
  fs.writeFileSync(path.join(dir, 'asset.json'), JSON.stringify(metaFor(id, { class: 'Vehicle molecule', triangles: 24, dimensions_m: undefined, connectors: undefined, mirror_safe: undefined, materials: undefined, ...meta }), null, 2));
  return dir;
}

export function status(report, name) {
  const c = report.checks.find((x) => x.name === name);
  if (!c) throw new Error(`no check named ${name}`);
  return c;
}

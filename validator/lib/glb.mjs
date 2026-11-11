import { fromTRS, mul, identity } from './math.mjs';

export class GlbError extends Error {}

export function parseGlb(buf) {
  if (buf.length < 12) throw new GlbError(`file is ${buf.length} bytes, shorter than the 12-byte GLB header`);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new GlbError('file does not start with the GLB magic "glTF"; export as .glb (binary glTF 2.0)');
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new GlbError(`GLB container version is ${version}, expected 2`);
  const total = buf.readUInt32LE(8);
  if (total !== buf.length) throw new GlbError(`GLB header length ${total} differs from file size ${buf.length}`);
  let off = 12;
  let json = null;
  let bin = null;
  while (off + 8 <= buf.length) {
    const clen = buf.readUInt32LE(off);
    const ctype = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (start + clen > buf.length) throw new GlbError('a GLB chunk extends past the end of the file');
    if (ctype === 0x4e4f534a && json === null) {
      try {
        json = JSON.parse(buf.subarray(start, start + clen).toString('utf8'));
      } catch (e) {
        throw new GlbError(`JSON chunk is not valid JSON: ${e.message}`);
      }
    } else if (ctype === 0x004e4942 && bin === null) {
      bin = buf.subarray(start, start + clen);
    }
    off = start + clen;
  }
  if (!json) throw new GlbError('GLB has no JSON chunk');
  return { json, bin };
}

const COMP = { 5120: [1, 'getInt8'], 5121: [1, 'getUint8'], 5122: [2, 'getInt16'], 5123: [2, 'getUint16'], 5125: [4, 'getUint32'], 5126: [4, 'getFloat32'] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

export function readAccessor(doc, index) {
  const { json, bin } = doc;
  const acc = json.accessors?.[index];
  if (!acc) throw new GlbError(`accessor ${index} does not exist`);
  const n = NCOMP[acc.type];
  const [csize, getter] = COMP[acc.componentType] || [];
  if (!n || !csize) throw new GlbError(`accessor ${index} has an unsupported type`);
  const out = new Array(acc.count * n).fill(0);
  if (acc.bufferView === undefined) return { data: out, count: acc.count, n };
  const bv = json.bufferViews?.[acc.bufferView];
  if (!bv) throw new GlbError(`accessor ${index} points at a missing bufferView`);
  if (!bin) throw new GlbError('GLB has no BIN chunk');
  const stride = bv.byteStride || csize * n;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  if (base + stride * (acc.count - 1) + csize * n > bin.byteLength) throw new GlbError(`accessor ${index} reads past the end of the BIN chunk`);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) {
      out[i * n + c] = dv[getter](base + i * stride + c * csize, true);
    }
  }
  return { data: out, count: acc.count, n };
}

export function localMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  return fromTRS(node.translation, node.rotation, node.scale);
}

export function isIdentityNode(node) {
  if (node.matrix) {
    const id = identity();
    return node.matrix.every((v, i) => Math.abs(v - id[i]) < 1e-9);
  }
  const t = node.translation || [0, 0, 0];
  const r = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  return t.every((v) => Math.abs(v) < 1e-9) && r.every((v, i) => Math.abs(v - [0, 0, 0, 1][i]) < 1e-9) && s.every((v) => Math.abs(v - 1) < 1e-9);
}

export function sceneRoots(json) {
  const sc = json.scenes?.[json.scene ?? 0];
  if (sc?.nodes) return sc.nodes;
  // No scene: nodes that are nobody's child.
  const child = new Set();
  (json.nodes || []).forEach((n) => (n.children || []).forEach((c) => child.add(c)));
  return (json.nodes || []).map((_, i) => i).filter((i) => !child.has(i));
}

// World matrix of every node reachable from the scene roots (index -> matrix).
export function nodeWorlds(json) {
  const worlds = new Map();
  const walk = (i, parent, depth) => {
    if (depth > 64 || worlds.has(i)) return;
    const node = json.nodes[i];
    if (!node) return;
    const w = mul(parent, localMatrix(node));
    worlds.set(i, w);
    (node.children || []).forEach((c) => walk(c, w, depth + 1));
  };
  sceneRoots(json).forEach((r) => walk(r, identity(), 0));
  return worlds;
}

export const COL_RE = /^col_\d+$/;

// All triangle-list primitives with world-space positions. Collision hulls are returned separately.
export function collectGeometry(doc) {
  const { json } = doc;
  const worlds = nodeWorlds(json);
  const prims = [];
  const problems = [];
  for (const [i, w] of worlds) {
    const node = json.nodes[i];
    if (node.mesh === undefined) continue;
    const mesh = json.meshes?.[node.mesh];
    if (!mesh) continue;
    (mesh.primitives || []).forEach((p, pi) => {
      const mode = p.mode ?? 4;
      const where = `node "${node.name ?? i}" primitive ${pi}`;
      if (p.attributes?.POSITION === undefined) {
        problems.push(`${where} has no POSITION attribute`);
        return;
      }
      const pos = readAccessor(doc, p.attributes.POSITION);
      const world = new Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        const x = pos.data[v * 3], y = pos.data[v * 3 + 1], z = pos.data[v * 3 + 2];
        world[v * 3] = w[0] * x + w[4] * y + w[8] * z + w[12];
        world[v * 3 + 1] = w[1] * x + w[5] * y + w[9] * z + w[13];
        world[v * 3 + 2] = w[2] * x + w[6] * y + w[10] * z + w[14];
      }
      let indices;
      if (p.indices !== undefined) indices = readAccessor(doc, p.indices).data;
      else indices = Array.from({ length: pos.count }, (_, k) => k);
      prims.push({
        node: node.name ?? `#${i}`,
        isCollision: COL_RE.test(node.name || ''),
        mode,
        where,
        positions: world,
        vertexCount: pos.count,
        indices,
        material: p.material,
      });
    });
  }
  return { prims, problems };
}

export function pngSize(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24 || !sig.every((b, i) => buf[i] === b)) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

#!/usr/bin/env node
// Builds a region's A0 blockout: one plain box per building, from its outline and height.
//
//   node tools/blockout/build.mjs data/tokyo-sumida-oshiage-2
//
// Reads <region>/places.json and writes <region>/blockout/blockout.glb and summary.json.
// Each building is one node named by its place ID. Axes follow the asset spec:
// +X east, +Y up, +Z south, metres from the region origin, with the lowest ground at Y = 0.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("usage: node tools/blockout/build.mjs <region folder>"); process.exit(2); }
const pack = JSON.parse(readFileSync(join(dir, "places.json"), "utf8"));
const datum = pack.ground_datum_m ?? 0;

const area2 = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);

// Drops repeated and collinear points, and orders the ring so its signed area is positive.
function clean(ring) {
  let r = ring.filter((p, i) => { const q = ring[(i + 1) % ring.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
  r = r.filter((p, i) => {
    const a = r[(i + r.length - 1) % r.length], b = r[(i + 1) % r.length];
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-6;
  });
  return area2(r) < 0 ? r.reverse() : r;
}

// Ear clipping. Returns index triples into the ring, or null if the outline is not simple.
function triangulate(r) {
  const idx = r.map((_, i) => i), out = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9;
  let guard = idx.length * idx.length + 8;
  while (idx.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      if (cross(r[ia], r[ib], r[ic]) <= 1e-9) continue;
      if (idx.some((k) => k !== ia && k !== ib && k !== ic && inside(r[k], r[ia], r[ib], r[ic]))) continue;
      out.push([ia, ib, ic]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) return null;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return idx.length === 3 ? out : null;
}

const chunks = [], accessors = [], views = [], meshes = [], nodes = [];
let offset = 0;
function view(typed, target) {
  const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  const pad = (4 - (buf.length % 4)) % 4;
  views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
  chunks.push(buf, Buffer.alloc(pad)); offset += buf.length + pad;
  return views.length - 1;
}

const summary = { region: pack.region, buildings: 0, skipped: [], triangles: 0, most_triangles: 0 };
for (const b of pack.places) {
  const ring = clean(b.footprint_m);
  const tris = ring.length >= 3 ? triangulate(ring) : null;
  if (!tris || !b.height_m) { summary.skipped.push({ place_id: b.place_id, why: !b.height_m ? "no height" : "outline is not a simple shape" }); continue; }
  const y0 = (b.ground_m ?? datum) - datum, y1 = y0 + b.height_m;
  const pos = [], nor = [], ind = [];
  const tri = (a, c, d, n) => {           // one flat triangle, wound to face along n
    const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const pts = f[0] * n[0] + f[1] * n[1] + f[2] * n[2] >= 0 ? [a, c, d] : [a, d, c];
    for (const p of pts) { ind.push(pos.length / 3); pos.push(...p); nor.push(...n); }
  };
  for (const [i, j, k] of tris) {
    tri([ring[i][0], y1, ring[i][1]], [ring[j][0], y1, ring[j][1]], [ring[k][0], y1, ring[k][1]], [0, 1, 0]);
    tri([ring[i][0], y0, ring[i][1]], [ring[j][0], y0, ring[j][1]], [ring[k][0], y0, ring[k][1]], [0, -1, 0]);
  }
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length], dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
    const n = [dz / len, 0, -dx / len];   // outward for a ring with positive signed area
    const a = [p[0], y0, p[1]], c = [q[0], y0, q[1]], d = [q[0], y1, q[1]], e = [p[0], y1, p[1]];
    tri(a, c, d, n); tri(a, d, e, n);
  });
  const P = new Float32Array(pos), N = new Float32Array(nor), I = new Uint16Array(ind);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[i + k]); max[k] = Math.max(max[k], P[i + k]); }
  const ap = accessors.push({ bufferView: view(P, 34962), componentType: 5126, count: P.length / 3, type: "VEC3", min, max }) - 1;
  const an = accessors.push({ bufferView: view(N, 34962), componentType: 5126, count: N.length / 3, type: "VEC3" }) - 1;
  const ai = accessors.push({ bufferView: view(I, 34963), componentType: 5123, count: I.length, type: "SCALAR" }) - 1;
  meshes.push({ primitives: [{ attributes: { POSITION: ap, NORMAL: an }, indices: ai, material: 0 }] });
  nodes.push({ name: b.place_id, mesh: meshes.length - 1, extras: { place_id: b.place_id, accuracy_level: "A0", height_m: b.height_m, in_start_block: !!b.in_start_block } });
  const t = I.length / 3;
  summary.buildings++; summary.triangles += t; summary.most_triangles = Math.max(summary.most_triangles, t);
}

const gltf = {
  asset: { version: "2.0", generator: "rebuild-the-world tools/blockout" },
  scene: 0, scenes: [{ name: pack.region, nodes: nodes.map((_, i) => i) }],
  nodes, meshes, accessors, bufferViews: views,
  materials: [{ name: "blockout", pbrMetallicRoughness: { baseColorFactor: [0.72, 0.72, 0.7, 1], metallicFactor: 0, roughnessFactor: 0.9 } }],
  buffers: [{ byteLength: offset }],
};
let json = Buffer.from(JSON.stringify(gltf)); json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const bin = Buffer.concat(chunks);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
mkdirSync(join(dir, "blockout"), { recursive: true });
writeFileSync(join(dir, "blockout", "blockout.glb"), Buffer.concat([head, jh, json, bh, bin]));
writeFileSync(join(dir, "blockout", "summary.json"), JSON.stringify(summary, null, 1) + "\n");
console.log(`${summary.buildings} buildings, ${summary.triangles} triangles, ${summary.skipped.length} skipped -> ${join(dir, "blockout", "blockout.glb")}`);

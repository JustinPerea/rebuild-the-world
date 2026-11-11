import { cross, dot, len, vsub } from './math.mjs';

export const visiblePrims = (prims) => prims.filter((p) => !p.isCollision);

// Vertices that belong to at least one triangle of a triangle-list primitive.
export function usedVertices(prim) {
  const used = new Set();
  const n = prim.indices.length - (prim.indices.length % 3);
  for (let i = 0; i < n; i++) used.add(prim.indices[i]);
  return used;
}

export function bboxOfFaces(prims) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    if (p.mode !== 4) continue;
    for (const v of usedVertices(p)) {
      for (let k = 0; k < 3; k++) {
        const x = p.positions[v * 3 + k];
        if (x < min[k]) min[k] = x;
        if (x > max[k]) max[k] = x;
      }
    }
  }
  if (min[0] === Infinity) return null;
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

export const vtx = (p, i) => [p.positions[i * 3], p.positions[i * 3 + 1], p.positions[i * 3 + 2]];

export function triArea(a, b, c) {
  return len(cross(vsub(b, a), vsub(c, a))) / 2;
}

export function triNormal(a, b, c) {
  return cross(vsub(b, a), vsub(c, a));
}

export { dot };

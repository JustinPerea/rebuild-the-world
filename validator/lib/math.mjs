// Small vector and matrix helpers. Matrices are column-major 4x4 arrays, as in glTF.

export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export function norm(a) {
  const l = len(a);
  return l === 0 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
}
export function angleDeg(a, b) {
  const la = len(a);
  const lb = len(b);
  if (la === 0 || lb === 0) return NaN;
  const c = Math.max(-1, Math.min(1, dot(a, b) / (la * lb)));
  return (Math.acos(c) * 180) / Math.PI;
}

export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

export function fromTRS(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
    2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

export const point = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
export const vector = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
];

export const translation = (t) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];

// Rotate vector v about unit axis by deg degrees (Rodrigues).
export function rotateAbout(v, axis, deg) {
  const a = norm(axis);
  const th = (deg * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  const k = cross(a, v);
  const d = dot(a, v) * (1 - c);
  return [v[0] * c + k[0] * s + a[0] * d, v[1] * c + k[1] * s + a[1] * d, v[2] * c + k[2] * s + a[2] * d];
}

// A connector frame is { p, y, z }: position, up direction, outward direction. X = Y x Z.
export function orthoFrame(f) {
  const z = norm(f.z);
  const y = norm(vsub(f.y, vscale(z, dot(f.y, z))));
  return { p: f.p, y, z };
}
export const frameX = (f) => cross(f.y, f.z);

export function mirrorFrame(f) {
  return { p: [-f.p[0], f.p[1], f.p[2]], y: [-f.y[0], f.y[1], f.y[2]], z: [-f.z[0], f.z[1], f.z[2]] };
}

export function applyPose(m, f) {
  return { p: point(m, f.p), y: vector(m, f.y), z: vector(m, f.z) };
}

function basis(f) {
  const x = frameX(f);
  // columns x, y, z in a 4x4 (rotation only)
  return [x[0], x[1], x[2], 0, f.y[0], f.y[1], f.y[2], 0, f.z[0], f.z[1], f.z[2], 0, 0, 0, 0, 1];
}
function transposeRot(m) {
  return [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
}

// Rigid pose P with P(local) == target, for two orthonormal frames.
export function poseBetween(local, target) {
  const R = mul(basis(target), transposeRot(basis(local)));
  const rp = vector(R, local.p);
  R[12] = target.p[0] - rp[0];
  R[13] = target.p[1] - rp[1];
  R[14] = target.p[2] - rp[2];
  return R;
}

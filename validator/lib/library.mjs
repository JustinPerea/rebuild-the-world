import path from 'node:path';
import fs from 'node:fs';
import { loadAssetDir, glbConnectors, countTriangles } from './context.mjs';
import { collectGeometry } from './glb.mjs';
import { visiblePrims, usedVertices } from './geom.mjs';
import { symmetryCount } from './registry.mjs';
import {
  applyPose, mirrorFrame, orthoFrame, poseBetween, rotateAbout, translation, vscale, vsub, len, angleDeg, point, frameX,
} from './math.mjs';

export const PIN_RE = /^([a-z0-9]+(?:_[a-z0-9]+)*)@(\d+\.\d+\.\d+)$/;
export const categoryOf = (id) => String(id).split('_')[0];
export const libraryDir = (lib, id) => path.join(lib, categoryOf(id), id);

const MAX_DEPTH = 8;

// Look up "id@version" in the library.
export function resolvePin(pin, libDir) {
  const m = PIN_RE.exec(String(pin));
  if (!m) return { error: `"${pin}" is not pinned as <asset_id>@<major.minor.patch>` };
  const [, id, version] = m;
  const dir = libraryDir(libDir, id);
  if (!fs.existsSync(dir)) return { error: `"${pin}" is not in the library: ${dir} does not exist` };
  const a = loadAssetDir(dir);
  if (a.kind !== 'atom' && a.kind !== 'assembly') return { error: `"${pin}": folder ${dir} holds neither asset.glb nor assembly.json` };
  if (!a.meta) return { error: `"${pin}": ${a.metaError}` };
  if (a.meta.version !== version) return { error: `"${pin}" is not a merged version: ${dir} holds version ${a.meta.version ?? '(no version field)'}` };
  return { id, version, dir, asset: a, meta: a.meta, kind: a.kind };
}

const joinPart = (s) => {
  const i = String(s).indexOf(':');
  return i < 0 ? null : { ref: s.slice(0, i), conn: s.slice(i + 1) };
};

const isPos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

// The three scale factors of a manifest entry, along the placed thing's own x, y and z. An entry's
// "scale" is one positive number or three. Anything else reads as 1; the Variation check reports it.
export function entryScale(entry) {
  const s = entry.scale;
  if (isPos(s)) return [s, s, s];
  if (Array.isArray(s) && s.length === 3 && s.every(isPos)) return [s[0], s[1], s[2]];
  return [1, 1, 1];
}
export const isEvenScale = (sv) => sv[0] === sv[1] && sv[1] === sv[2];
const vscale3 = (a, s) => [a[0] * s[0], a[1] * s[1], a[2] * s[2]];

// Which axis (0, 1 or 2) of the atom a direction lies along, and whether it does so within the angle tolerance.
export function axisOf(v, tolD) {
  let k = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(v[i]) > Math.abs(v[k])) k = i;
  const e = [0, 0, 0];
  e[k] = Math.sign(v[k]) || 1;
  return { k, parallel: angleDeg(v, e) <= tolD };
}

// The mating dimensions of a placed connector, after scaling (asset spec, "Connectors", "Variation").
// A dimension lies along one axis of the connector's own frame, named by the type's mating_axes; it is
// multiplied by the scale factor of the atom axis that frame axis is parallel to. A dimension with no
// axis follows an even scale only. Returns { values, axisLess, skewed }: values holds the numbers that
// could be worked out, axisLess names the dimensions an uneven scale cannot reach, and skewed says that
// a frame axis is not parallel to an atom axis, which an uneven scale cannot allow.
function scaledMating(reg, base, frame, sv, tolD) {
  const out = { values: {}, axisLess: [], skewed: false };
  const dims = Array.isArray(reg?.mating_dimensions) ? reg.mating_dimensions : [];
  const even = isEvenScale(sv);
  const axes = { x: frameX(frame), y: frame.y, z: frame.z };
  for (const a of Object.values(axes)) if (!axisOf(a, tolD).parallel) out.skewed = true;
  for (const d of dims) {
    const v = base?.[d];
    const name = reg.mating_axes?.[d];
    if (!even && !(name in axes)) out.axisLess.push(d);
    else if (typeof v === 'number') out.values[d] = even ? v * sv[0] : v * sv[axisOf(axes[name], tolD).k];
  }
  return out;
}

// Connector of a placed entry, in the entry's own coordinates (mirrored and scaled when the entry is).
function entryConnector(rec, entry, connName, ctx) {
  let c;
  let base;
  if (rec.kind === 'atom') {
    if (!rec.connectors) return { error: `atom "${rec.id}" cannot be read: ${rec.asset.glbError}` };
    c = rec.connectors.found.get(connName);
    if (!c) return { error: `atom "${rec.id}" has no connector node "${connName}"` };
    base = (Array.isArray(rec.meta.connectors) ? rec.meta.connectors : []).find((m) => m?.name === connName)?.mating;
  } else {
    c = rec.nested.exposed.get(connName);
    if (!c) {
      const names = [...rec.nested.exposed.keys()];
      return { error: `connector "${connName}" is not exposed by assembly "${rec.id}" (it exposes: ${names.length ? names.join(', ') : 'nothing'}); join it through an exposed name` };
    }
    base = c.mating;
  }
  let frame = entry.mirror ? mirrorFrame(c.frame) : c.frame;
  // A placed thing scales about its own origin (asset spec, "Scale"), axis by axis, so its connectors move with it.
  // assemblyBounds scales the vertices the same way. Directions do not change.
  const sv = entryScale(entry);
  if (!(sv[0] === 1 && sv[1] === 1 && sv[2] === 1)) frame = { ...frame, p: vscale3(frame.p, sv) };
  const reg = ctx.registry.types.get(c.type);
  const mating = scaledMating(reg, base, frame, sv, ctx.profile.connector_direction_tolerance_deg);
  return { type: c.type, side: c.side, frame, name: connName, mating };
}

export function analyzeAssembly(dir, manifest, meta, ctx, stack = []) {
  const { libDir, registry, profile } = ctx;
  const res = {
    errors: [], entries: new Map(), poses: new Map(), exposed: new Map(), joints: [], triangles: 0, rootRef: null, loopChecks: 0, worstGapM: 0, worstAngleDeg: 0, unstatedMating: 0,
  };
  const err = (m) => res.errors.push(m);
  if (stack.length > MAX_DEPTH) {
    err(`assemblies nest more than ${MAX_DEPTH} levels deep`);
    return res;
  }
  if (!manifest || typeof manifest !== 'object') {
    err('assembly.json is not an object');
    return res;
  }
  const atoms = Array.isArray(manifest.atoms) ? manifest.atoms : null;
  if (!atoms || atoms.length === 0) {
    err('assembly.json: "atoms" must be a non-empty array');
    return res;
  }
  for (const [i, entry] of atoms.entries()) {
    const label = `atoms[${i}]`;
    if (!entry || typeof entry.ref !== 'string' || !entry.ref) { err(`${label}: "ref" is missing`); continue; }
    if (res.entries.has(entry.ref)) { err(`${label}: ref "${entry.ref}" is used twice`); continue; }
    const rec = resolvePin(entry.asset, libDir);
    if (rec.error) { err(`atom "${entry.ref}": ${rec.error}`); res.entries.set(entry.ref, { entry, rec: null }); continue; }
    if (meta?.library && rec.meta.library && rec.meta.library !== meta.library) {
      err(`atom "${entry.ref}" (${entry.asset}) belongs to library "${rec.meta.library}", this assembly is in "${meta.library}"; an assembly uses atoms from its own library only`);
    }
    if (rec.kind === 'atom') {
      if (rec.asset.glbError) err(`atom "${entry.ref}" (${entry.asset}): ${rec.asset.glbError}`);
      else {
        rec.connectors = glbConnectors(rec.asset.glb);
        res.triangles += countTriangles(rec.asset.glb);
      }
    } else {
      if (stack.includes(rec.dir)) { err(`atom "${entry.ref}": assembly ${entry.asset} contains itself`); res.entries.set(entry.ref, { entry, rec: null }); continue; }
      if (!rec.asset.manifest) { err(`atom "${entry.ref}": ${rec.asset.manifestError || 'assembly.json is missing'}`); res.entries.set(entry.ref, { entry, rec: null }); continue; }
      rec.nested = analyzeAssembly(rec.dir, rec.asset.manifest, rec.meta, ctx, [...stack, dir]);
      for (const e of rec.nested.errors) err(`nested assembly "${entry.ref}" (${entry.asset}): ${e}`);
      res.triangles += rec.nested.triangles;
    }
    if (entry.mirror === true && rec.meta.mirror_safe !== true) {
      err(`atom "${entry.ref}" (${entry.asset}) is mirrored but its asset.json does not set "mirror_safe": true; remove "mirror" or mark the asset mirror_safe`);
    }
    res.entries.set(entry.ref, { entry, rec });
  }

  // Origin
  const origin = manifest.origin;
  if (!origin || typeof origin.ref !== 'string') err('"origin" is missing: name the root atom as { "ref": "<atom ref>", "offset_m": [x, y, z] }');
  else if (!res.entries.has(origin.ref)) err(`"origin.ref" is "${origin.ref}", which is not an atom ref in this manifest`);
  else {
    const off = origin.offset_m ?? [0, 0, 0];
    if (!Array.isArray(off) || off.length !== 3 || off.some((v) => typeof v !== 'number')) err('"origin.offset_m" must be three numbers');
    else {
      res.rootRef = origin.ref;
      res.poses.set(origin.ref, translation(vscale(off, -1)));
    }
  }

  // Joints
  const tolP = profile.connector_position_tolerance_m;
  const tolD = profile.connector_direction_tolerance_deg;
  const tolM = profile.mating_tolerance_m;
  const joints = Array.isArray(manifest.joints) ? manifest.joints : [];
  if (!Array.isArray(manifest.joints)) err('"joints" must be an array (it may be empty only for a one-atom assembly)');
  const parsed = [];
  for (const [i, j] of joints.entries()) {
    const label = `joint ${i} (${j?.a} -> ${j?.b})`;
    const pa = typeof j?.a === 'string' ? joinPart(j.a) : null;
    const pb = typeof j?.b === 'string' ? joinPart(j.b) : null;
    if (!pa || !pb) { err(`${label}: "a" and "b" must be "<atom ref>:<connector name>"`); continue; }
    let bad = false;
    const ends = [];
    for (const [k, part] of [['a', pa], ['b', pb]]) {
      const ent = res.entries.get(part.ref);
      if (!ent) { err(`${label}: "${k}" names atom ref "${part.ref}", which is not in "atoms"`); bad = true; continue; }
      if (!ent.rec) { bad = true; continue; }
      const c = entryConnector(ent.rec, ent.entry, part.conn, ctx);
      if (c.error) { err(`${label}: ${c.error}`); bad = true; continue; }
      ends.push({ ...part, ...c, ent });
    }
    if (bad) continue;
    const [A, B] = ends;
    if (A.type !== B.type) { err(`${label}: connector types differ ("${A.type}" on ${A.ref}, "${B.type}" on ${B.ref}); a joint needs the same type on both ends`); continue; }
    if (A.side === B.side) { err(`${label}: both connectors are side "${A.side}"; a joint needs one side a and one side b`); continue; }
    const reg = registry.types.get(A.type);
    if (!reg) { err(`${label}: connector type "${A.type}" is not in the connector registry (${registry.file})`); continue; }
    const sym = symmetryCount(reg.symmetry);
    const turn = j.turn_deg ?? 0;
    if (typeof turn !== 'number') { err(`${label}: "turn_deg" must be a number, found ${JSON.stringify(j.turn_deg)}`); continue; }
    if (sym !== Infinity) {
      const step = 360 / sym;
      const r = ((turn % step) + step) % step;
      if (Math.min(r, step - r) > 1e-6) {
        err(`${label}: turn_deg is ${turn} but type "${A.type}" has symmetry ${JSON.stringify(reg.symmetry)}, so the valid turns are multiples of ${step} degrees`);
        continue;
      }
    }
    // Both sides must agree on every mating dimension once scaled (asset spec, "Connectors"). A side that
    // states no value for a dimension cannot be compared; that is counted, and the Assembly check says so.
    for (const d of Array.isArray(reg.mating_dimensions) ? reg.mating_dimensions : []) {
      const va = A.mating.values[d];
      const vb = B.mating.values[d];
      if (typeof va !== 'number' || typeof vb !== 'number') {
        if (!A.mating.axisLess.includes(d) && !B.mating.axisLess.includes(d)) res.unstatedMating += 1;
        continue;
      }
      if (Math.abs(va - vb) > tolM) {
        err(`${label}: mating dimension "${d}" of type "${A.type}" differs: ${A.ref} (${A.ent.entry.asset}) gives ${Number(va.toFixed(5))} m and ${B.ref} (${B.ent.entry.asset}) gives ${Number(vb.toFixed(5))} m after scaling (allowed ${tolM * 1000} mm)`);
      }
    }
    parsed.push({ i, label, A, B, turn, sym, raw: j });
  }
  res.joints = parsed;

  const done = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const J of parsed) {
      if (done.has(J.i)) continue;
      const pa = res.poses.get(J.A.ref);
      const pb = res.poses.get(J.B.ref);
      if (pa && pb) {
        done.add(J.i);
        progress = true;
        res.loopChecks += 1;
        const wa = applyPose(pa, J.A.frame);
        const wb = applyPose(pb, J.B.frame);
        const dist = len(vsub(wa.p, wb.p));
        if (dist > res.worstGapM) res.worstGapM = dist;
        if (dist > tolP) err(`${J.label}: positions differ by ${(dist * 1000).toFixed(2)} mm (allowed ${tolP * 1000} mm). ${J.A.ref}:${J.A.name} and ${J.B.ref}:${J.B.name} do not coincide once the atoms are placed through the other joints. Check the manifest first (the right connector on each side, the right neighbour, turn_deg); if the manifest is right, a connector node in one of the atoms is off`);
        const zang = angleDeg(wa.z, [-wb.z[0], -wb.z[1], -wb.z[2]]);
        if (zang > res.worstAngleDeg) res.worstAngleDeg = zang;
        if (!(zang <= tolD)) err(`${J.label}: +Z axes are ${zang.toFixed(2)} degrees from opposite (allowed ${tolD}); the connectors must face each other`);
        if (J.sym !== Infinity) {
          const yExpect = rotateAbout(wa.y, wa.z, J.turn);
          const yang = angleDeg(yExpect, wb.y);
          if (yang > res.worstAngleDeg) res.worstAngleDeg = yang;
          if (!(yang <= tolD)) err(`${J.label}: +Y axes differ by ${yang.toFixed(2)} degrees after turn_deg ${J.turn} (allowed ${tolD}); the up directions do not agree`);
        }
      } else if (pa || pb) {
        done.add(J.i);
        progress = true;
        if (pa) {
          const wa = orthoFrame(applyPose(pa, J.A.frame));
          const target = { p: wa.p, z: vscale(wa.z, -1), y: rotateAbout(wa.y, wa.z, J.turn) };
          res.poses.set(J.B.ref, poseBetween(orthoFrame(J.B.frame), orthoFrame(target)));
        } else {
          const wb = orthoFrame(applyPose(pb, J.B.frame));
          const zA = vscale(wb.z, -1);
          const target = { p: wb.p, z: zA, y: rotateAbout(wb.y, zA, -J.turn) };
          res.poses.set(J.A.ref, poseBetween(orthoFrame(J.A.frame), orthoFrame(target)));
        }
      }
    }
  }
  for (const [ref, ent] of res.entries) {
    if (!res.poses.has(ref) && res.rootRef) {
      err(`atom "${ref}"${ent.rec ? ` (${ent.entry.asset})` : ''} is not joined to the origin atom "${res.rootRef}" by any chain of joints; add a joint that mates one of its connectors`);
    }
  }

  // Exposes
  if (manifest.exposes !== undefined) {
    if (typeof manifest.exposes !== 'object' || Array.isArray(manifest.exposes) || manifest.exposes === null) err('"exposes" must be an object of { name: "<atom ref>:<connector name>" }');
    else {
      for (const [name, target] of Object.entries(manifest.exposes)) {
        const p = typeof target === 'string' ? joinPart(target) : null;
        const ent = p && res.entries.get(p.ref);
        if (!p || !ent) { err(`exposes "${name}": "${target}" must name "<atom ref>:<connector name>" of an atom in this manifest`); continue; }
        if (!ent.rec || !res.poses.has(p.ref)) continue;
        const c = entryConnector(ent.rec, ent.entry, p.conn, ctx);
        if (c.error) { err(`exposes "${name}": ${c.error}`); continue; }
        res.exposed.set(name, { type: c.type, side: c.side, frame: applyPose(res.poses.get(p.ref), c.frame), target, mating: c.mating.values });
      }
    }
  }
  return res;
}

// The bounding box of an analysed assembly: every vertex of every placed atom, in the assembly's
// own coordinates (its origin at 0). Nested assemblies are measured through their own poses.
// Returns null when nothing could be placed.
export function assemblyBounds(res) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const points = new Map();
  const pointsOf = (rec) => {
    if (!points.has(rec.dir)) {
      const out = [];
      for (const p of visiblePrims(collectGeometry(rec.asset.glb).prims)) {
        if (p.mode !== 4) continue;
        for (const v of usedVertices(p)) out.push([p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]]);
      }
      points.set(rec.dir, out);
    }
    return points.get(rec.dir);
  };
  const visit = (r, up) => {
    for (const [ref, ent] of r.entries) {
      const pose = r.poses.get(ref);
      if (!ent.rec || !pose) continue;
      const sv = entryScale(ent.entry);
      const mirrored = ent.entry.mirror === true;
      // Same order as a connector's frame: mirrored in the entry's own coordinates, scaled, then placed.
      const place = (p) => up(point(pose, vscale3(mirrored ? [-p[0], p[1], p[2]] : p, sv)));
      if (ent.rec.kind === 'atom') {
        if (!ent.rec.asset.glb) continue;
        for (const p of pointsOf(ent.rec)) {
          const q = place(p);
          for (let k = 0; k < 3; k++) {
            if (q[k] < min[k]) min[k] = q[k];
            if (q[k] > max[k]) max[k] = q[k];
          }
        }
      } else if (ent.rec.nested) visit(ent.rec.nested, place);
    }
  };
  visit(res, (p) => p);
  if (min[0] === Infinity) return null;
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

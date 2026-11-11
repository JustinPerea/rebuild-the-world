import path from 'node:path';
import fs from 'node:fs';
import { loadAssetDir, glbConnectors, countTriangles } from './context.mjs';
import { symmetryCount } from './registry.mjs';
import {
  applyPose, mirrorFrame, orthoFrame, poseBetween, rotateAbout, translation, vscale, vsub, len, angleDeg,
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

// Connector of a placed entry, in the entry's own coordinates (mirrored when the entry is).
function entryConnector(rec, entry, connName) {
  let c;
  if (rec.kind === 'atom') {
    if (!rec.connectors) return { error: `atom "${rec.id}" cannot be read: ${rec.asset.glbError}` };
    c = rec.connectors.found.get(connName);
    if (!c) return { error: `atom "${rec.id}" has no connector node "${connName}"` };
  } else {
    c = rec.nested.exposed.get(connName);
    if (!c) {
      const names = [...rec.nested.exposed.keys()];
      return { error: `connector "${connName}" is not exposed by assembly "${rec.id}" (it exposes: ${names.length ? names.join(', ') : 'nothing'}); join it through an exposed name` };
    }
  }
  const frame = entry.mirror ? mirrorFrame(c.frame) : c.frame;
  return { type: c.type, side: c.side, frame, name: connName };
}

export function analyzeAssembly(dir, manifest, meta, ctx, stack = []) {
  const { libDir, registry, profile } = ctx;
  const res = {
    errors: [], entries: new Map(), poses: new Map(), exposed: new Map(), joints: [], triangles: 0, rootRef: null, loopChecks: 0, worstGapM: 0, worstAngleDeg: 0,
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
      const c = entryConnector(ent.rec, ent.entry, part.conn);
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
        const c = entryConnector(ent.rec, ent.entry, p.conn);
        if (c.error) { err(`exposes "${name}": ${c.error}`); continue; }
        res.exposed.set(name, { type: c.type, side: c.side, frame: applyPose(res.poses.get(p.ref), c.frame), target });
      }
    }
  }
  return res;
}

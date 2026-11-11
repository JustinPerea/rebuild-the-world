import { pass, fail, skip } from './core.mjs';
import { analyze } from './analysis.mjs';
import { glbConnectors } from '../lib/context.mjs';
import { collectGeometry } from '../lib/glb.mjs';
import { bboxOfFaces, visiblePrims } from '../lib/geom.mjs';
import { angleDeg } from '../lib/math.mjs';
import { resolvePin } from '../lib/library.mjs';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const pair = (v) => Array.isArray(v) && v.length === 2 && v.every(isNum) && v[0] <= v[1];

// ---------------------------------------------------------------------------
export function connectors(ctx) {
  const a = ctx.asset;
  if (a.kind !== 'atom') return skip(`applies to atoms; ${a.kind === 'assembly' ? 'an assembly reaches connectors through its joints (see Assembly)' : 'a blueprint has no connectors'}`);
  if (!a.glb) return fail(`asset.glb cannot be read: ${a.glbError}`);
  const msgs = [];
  if (ctx.registry.error) return fail(ctx.registry.error);
  const { found, bad, dupes } = glbConnectors(a.glb);
  for (const n of bad) msgs.push(`node "${n}" starts with conn_ but does not match conn_<type>_<side>_<index> (side is a or b, index is digits), for example conn_wheel_hub_a_01`);
  for (const n of dupes) msgs.push(`connector name "${n}" is used by more than one node`);
  const listed = new Map((Array.isArray(a.meta?.connectors) ? a.meta.connectors : []).map((c) => [c?.name, c]));
  const tolD = ctx.profile.connector_direction_tolerance_deg;
  for (const [name, c] of found) {
    const reg = ctx.registry.types.get(c.type);
    if (!reg) msgs.push(`connector "${name}": type "${c.type}" is not in the connector registry (${ctx.registry.file}); registered types: ${[...ctx.registry.types.keys()].join(', ') || 'none'}`);
    const ang = angleDeg(c.rawFrame.y, c.rawFrame.z);
    if (!(ang > tolD && ang < 180 - tolD)) msgs.push(`connector "${name}": +Y and +Z are ${Number.isNaN(ang) ? 'degenerate' : `${ang.toFixed(2)} degrees apart`}; the up direction (+Y) must not be parallel to the outward direction (+Z)`);
    if (reg && reg.motion && reg.motion !== 'fixed') {
      const meta = listed.get(name);
      const lim = meta?.limits;
      if (!meta || lim === undefined || meta.rest === undefined) msgs.push(`connector "${name}": type "${c.type}" has motion "${reg.motion}", so asset.json must list it with "limits" ${reg.motion === 'ball' ? '' : '([min, max]) '}and "rest"`);
      else if (reg.motion !== 'ball') {
        if (!pair(lim)) msgs.push(`connector "${name}": "limits" must be [min, max] with min <= max, found ${JSON.stringify(lim)}`);
        else if (!isNum(meta.rest) || meta.rest < lim[0] || meta.rest > lim[1]) msgs.push(`connector "${name}": "rest" ${JSON.stringify(meta.rest)} must be a number inside limits ${JSON.stringify(lim)}`);
      }
    }
  }
  if (ctx.task) {
    const req = ctx.task.required_connectors;
    if (req !== undefined && !Array.isArray(req)) msgs.push('task file "required_connectors" must be an array of { type, side, count }');
    else for (const r of req || []) {
      const want = r.count ?? 1;
      const have = [...found.values()].filter((c) => c.type === r.type && c.side === r.side).length;
      if (have < want) msgs.push(`task requires ${want} connector(s) of type "${r.type}" side "${r.side}", the file has ${have}; add node(s) named conn_${r.type}_${r.side}_<index>`);
    }
    // Where the task fixes a connector's frame, the file must match it. This is what lets
    // atoms made by different people meet: each is checked against the same stated frame.
    const frames = ctx.task.connector_frames;
    if (frames !== undefined && !Array.isArray(frames)) msgs.push('task file "connector_frames" must be an array of { name, position_m, z_axis, y_axis, and limits and rest for a moving connector }');
    else for (const f of frames || []) {
      const c = found.get(f.name);
      if (!c) { msgs.push(`task fixes the frame of connector "${f.name}", and the file has no node of that name`); continue; }
      const tolP = ctx.profile.connector_position_tolerance_m;
      const fmt = (v) => `[${v.map((x) => Number(x.toFixed(4))).join(', ')}]`;
      if (Array.isArray(f.position_m)) {
        const d = Math.hypot(...f.position_m.map((x, k) => x - c.rawFrame.p[k]));
        if (d > tolP) msgs.push(`connector "${f.name}": position is ${fmt(c.rawFrame.p)}, the task asks for ${fmt(f.position_m)} (${(d * 1000).toFixed(1)} mm apart; allowed ${tolP * 1000} mm)`);
      }
      const cm = (Array.isArray(a.meta?.connectors) ? a.meta.connectors : []).find((x) => x && x.name === f.name);
      if (f.limits !== undefined && !(cm && Array.isArray(cm.limits) && cm.limits.length === 2 && cm.limits.every((v, k) => Math.abs(v - f.limits[k]) <= 1e-6))) msgs.push(`connector "${f.name}": asset.json limits are ${JSON.stringify(cm?.limits ?? null)}, the task asks for ${JSON.stringify(f.limits)}`);
      if (f.rest !== undefined && !(cm && typeof cm.rest === 'number' && Math.abs(cm.rest - f.rest) <= 1e-6)) msgs.push(`connector "${f.name}": asset.json rest is ${JSON.stringify(cm?.rest ?? null)}, the task asks for ${JSON.stringify(f.rest)}`);
      for (const [axis, want] of [['z', f.z_axis], ['y', f.y_axis]]) {
        if (!Array.isArray(want)) continue;
        const ang = angleDeg(c.rawFrame[axis], want);
        if (!(ang <= tolD)) msgs.push(`connector "${f.name}": +${axis.toUpperCase()} points along ${fmt(c.rawFrame[axis])}, the task asks for ${fmt(want)} (${Number.isNaN(ang) ? 'degenerate' : ang.toFixed(2) + ' degrees'} apart; allowed ${tolD} degrees). Axes are the asset's: +X right, +Y up, +Z front`);
      }
    }
  }
  return msgs.length ? fail(msgs) : pass([`${found.size} connector(s)${ctx.task ? '' : '; no --task, so required connectors were not checked'}`]);
}

// ---------------------------------------------------------------------------
export function assembly(ctx) {
  if (ctx.asset.kind !== 'assembly') return skip(`applies to assemblies (assembly.json); this is ${ctx.asset.kind ? `an ${ctx.asset.kind}` : 'an unrecognised folder'}`);
  if (ctx.registry.error) return fail(ctx.registry.error);
  const an = analyze(ctx);
  if (an.errors.length) return fail(an.errors);
  const notes = [`${an.entries.size} atom(s), ${an.joints.length} joint(s); ${an.joints.length - an.loopChecks} placed by mating, ${an.loopChecks} measured as loop closures`];
  if (an.loopChecks > 0) notes.push(`measured joints: largest gap ${(an.worstGapM * 1000).toFixed(3)} mm (allowed ${ctx.profile.connector_position_tolerance_m * 1000} mm), largest angle ${an.worstAngleDeg.toFixed(3)} degrees (allowed ${ctx.profile.connector_direction_tolerance_deg})`);
  if (an.joints.length > an.loopChecks && an.loopChecks === 0 && an.entries.size > 1) notes.push('note: with no loop closure, joints mate by construction; position errors in a connector cannot show until a second joint ties the same atoms together');
  if (ctx.asset.manifest.states) notes.push('note: "states" are not checked');
  return pass(notes);
}

// ---------------------------------------------------------------------------
function checkDeclared(v, where, msgs, glb) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) { msgs.push(`${where}: "variation" must be an object`); return; }
  if (v.scale !== undefined) {
    if (!pair(v.scale) || v.scale[0] <= 0) msgs.push(`${where}: variation.scale must be [min, max] with 0 < min <= max, found ${JSON.stringify(v.scale)}`);
  }
  if (v.open_slots !== undefined) {
    if (!Array.isArray(v.open_slots)) msgs.push(`${where}: variation.open_slots must be an array`);
    else v.open_slots.forEach((s, i) => {
      if (!s || typeof s.slot !== 'string' || !s.slot) msgs.push(`${where}: open_slots[${i}] needs a "slot" name`);
      if (!Array.isArray(s?.materials) || s.materials.length === 0 || !s.materials.every((m) => typeof m === 'string' && m)) msgs.push(`${where}: open_slots[${i}] needs a non-empty "materials" array of library material IDs`);
    });
  }
  if (v.spans !== undefined) {
    if (!Array.isArray(v.spans)) { msgs.push(`${where}: variation.spans must be an array`); return; }
    const conns = glb ? [...glbConnectors(glb).found.values()] : [];
    v.spans.forEach((s, i) => {
      const w = `${where}: spans[${i}]${s?.name ? ` "${s.name}"` : ''}`;
      if (!s || typeof s.name !== 'string') msgs.push(`${w} needs a "name"`);
      if (!['stretch', 'repeat'].includes(s?.mode)) msgs.push(`${w}: "mode" must be "stretch" or "repeat"`);
      if (!['x', 'y', 'z'].includes(s?.axis)) msgs.push(`${w}: "axis" must be "x", "y" or "z"`);
      if (!pair(s?.between_m) || !(s.between_m[0] < s.between_m[1])) msgs.push(`${w}: "between_m" must be [start, end] with start < end`);
      if (s?.mode === 'stretch' && (!pair(s.range_m) || s.range_m[0] <= 0)) msgs.push(`${w}: a stretch span needs "range_m" [min, max]`);
      if (s?.mode === 'repeat' && (!pair(s.count) || !s.count.every(Number.isInteger) || s.count[0] < 1)) msgs.push(`${w}: a repeat span needs "count" [min, max] as whole numbers >= 1`);
      if (s?.mode === 'stretch' && pair(s.between_m) && ['x', 'y', 'z'].includes(s.axis)) {
        const k = 'xyz'.indexOf(s.axis);
        for (const c of conns) if (c.frame.p[k] > s.between_m[0] && c.frame.p[k] < s.between_m[1]) msgs.push(`${w}: connector "${c.name}" sits at ${s.axis} = ${c.frame.p[k].toFixed(3)} m, inside the stretch span ${JSON.stringify(s.between_m)}; no connector may sit inside a stretch span`);
      }
    });
  }
}

function checkMotion(m, where, msgs) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) { msgs.push(`${where}: "motion" must be an object`); return; }
  for (const k of Object.keys(m)) if (!['locked', 'limits_deg', 'limits_m', 'also'].includes(k)) msgs.push(`${where}: motion key "${k}" is not one of locked, limits_deg, limits_m, also`);
  if (m.locked !== undefined && typeof m.locked !== 'boolean') msgs.push(`${where}: motion.locked must be true or false`);
  for (const k of ['limits_deg', 'limits_m']) if (m[k] !== undefined && !pair(m[k])) msgs.push(`${where}: motion.${k} must be [min, max] with min <= max`);
  if (m.also !== undefined) {
    if (!Array.isArray(m.also)) msgs.push(`${where}: motion.also must be an array`);
    else m.also.forEach((x, i) => {
      const kinds = ['turn', 'slide'].filter((k) => x?.[k] !== undefined);
      if (kinds.length !== 1) { msgs.push(`${where}: motion.also[${i}] must have exactly one of "turn" or "slide"`); return; }
      if (!['x', 'y', 'z'].includes(x[kinds[0]])) msgs.push(`${where}: motion.also[${i}].${kinds[0]} must be "x", "y" or "z"`);
      const lk = kinds[0] === 'turn' ? 'limits_deg' : 'limits_m';
      if (!pair(x[lk])) msgs.push(`${where}: motion.also[${i}] needs "${lk}" as [min, max]`);
    });
  }
}

export function variation(ctx) {
  const a = ctx.asset;
  if (a.kind === 'object') return skip('a blueprint declares no variation');
  if (!a.kind) return skip('asset kind unknown');
  const msgs = [];
  const notes = [];
  let touched = false;
  const v = a.meta?.variation;
  if (v !== undefined) {
    touched = true;
    checkDeclared(v, 'asset.json', msgs, a.glb);
    if (v.spans?.length) notes.push('note: spans are proposed, not built; only their shape is checked, not both ends of each range');
  }
  if (a.kind === 'assembly') {
    const an = analyze(ctx);
    const atoms = a.manifest?.atoms || [];
    for (const entry of atoms) {
      const ent = an.entries.get(entry.ref);
      const where = `atom "${entry.ref}"`;
      const rec = ent?.rec;
      if (entry.scale !== undefined) {
        touched = true;
        if (!isNum(entry.scale) || entry.scale <= 0) msgs.push(`${where}: "scale" must be a positive number, found ${JSON.stringify(entry.scale)}`);
        else if (rec) {
          const r = rec.meta.variation?.scale;
          if (!r) msgs.push(`${where}: scaled to ${entry.scale} but ${entry.asset} declares no variation.scale`);
          else if (pair(r) && (entry.scale < r[0] || entry.scale > r[1])) msgs.push(`${where}: scale ${entry.scale} is outside the declared range [${r[0]}, ${r[1]}] of ${entry.asset}`);
        }
        if (isNum(entry.scale) && entry.scale !== 1) {
          for (const J of an.joints) for (const E of [J.A, J.B]) {
            if (E.ref !== entry.ref) continue;
            const dims = ctx.registry.types.get(E.type)?.mating_dimensions;
            if (dims && dims.length) msgs.push(`${where}: scaled to ${entry.scale} but joint ${J.i} uses ${E.name}, a connector with mating dimensions (${dims.join(', ')}); a scaled thing joins nothing through such a connector`);
          }
        }
      }
      if (entry.materials !== undefined) {
        touched = true;
        if (!entry.materials || typeof entry.materials !== 'object') { msgs.push(`${where}: "materials" must be an object { slot: material ID }`); continue; }
        for (const [slot, mat] of Object.entries(entry.materials)) {
          if (!rec) continue;
          const decl = (rec.meta.variation?.open_slots || []).find((s) => s.slot === slot);
          if (!decl) msgs.push(`${where}: material slot "${slot}" is not an open slot of ${entry.asset} (open slots: ${(rec.meta.variation?.open_slots || []).map((s) => s.slot).join(', ') || 'none'})`);
          else if (!decl.materials?.includes(mat)) msgs.push(`${where}: slot "${slot}" is set to "${mat}", which ${entry.asset} does not list (allowed: ${(decl.materials || []).join(', ')})`);
        }
      }
    }
    for (const [i, j] of (a.manifest?.joints || []).entries()) {
      if (j?.motion !== undefined) { touched = true; checkMotion(j.motion, `joint ${i}`, msgs); }
    }
  }
  if (!touched) return skip('no variation declared or chosen');
  return msgs.length ? fail(msgs) : pass(notes);
}

// ---------------------------------------------------------------------------
export function blueprint(ctx) {
  const a = ctx.asset;
  if (a.kind !== 'object') return skip(`applies to objects (blueprint.json); this is ${a.kind ? `an ${a.kind}` : 'an unrecognised folder'}`);
  const b = a.blueprint;
  if (!b) return fail(a.blueprintError || 'blueprint.json is missing');
  const msgs = [];
  if (!b.description || typeof b.description !== 'string') msgs.push('blueprint.json: "description" is missing');
  if (!Array.isArray(b.slots) || b.slots.length === 0) return fail([...msgs, 'blueprint.json: "slots" must be a non-empty array']);
  const seen = new Set();
  for (const [i, s] of b.slots.entries()) {
    const w = `slot ${i}${s?.slot ? ` "${s.slot}"` : ''}`;
    if (!s || typeof s.slot !== 'string' || !s.slot) { msgs.push(`${w}: "slot" name is missing`); continue; }
    if (seen.has(s.slot)) msgs.push(`${w}: slot name used twice`);
    seen.add(s.slot);
    if (!Number.isInteger(s.count) || s.count < 1) msgs.push(`${w}: "count" must be a whole number >= 1`);
    if (!Array.isArray(s.connectors) || s.connectors.length === 0) msgs.push(`${w}: "connectors" must list the { type, side } the atom must carry`);
    else for (const c of s.connectors) {
      if (!c || !['a', 'b'].includes(c.side)) msgs.push(`${w}: connector ${JSON.stringify(c)} needs "side" "a" or "b"`);
      else if (!ctx.registry.types.has(c.type)) msgs.push(`${w}: connector type "${c?.type}" is not in the connector registry`);
    }
    if (!s.dimensions_m || typeof s.dimensions_m !== 'object' || Array.isArray(s.dimensions_m) || Object.keys(s.dimensions_m).length === 0) msgs.push(`${w}: "dimensions_m" must be an object of named sizes in metres, such as { "diameter": 0.65 }`);
    else for (const [k, val] of Object.entries(s.dimensions_m)) if (!isNum(val) || val <= 0) msgs.push(`${w}: dimension "${k}" must be a positive number`);
    if (s.atom === undefined) msgs.push(`${w}: "atom" must be a pinned asset ("<id>@<version>") or "new"`);
    else if (s.atom !== 'new') {
      const rec = resolvePin(s.atom, ctx.libDir);
      if (rec.error) { msgs.push(`${w}: ${rec.error}`); continue; }
      msgs.push(...fitMessages(ctx, s, rec, w));
    }
  }
  return msgs.length ? fail(msgs) : pass(['description match is not tested by a script (spec open question)']);
}

const BOX = { width: 0, height: 1, depth: 2 };
function fitMessages(ctx, slot, rec, w) {
  const msgs = [];
  const have = Array.isArray(rec.meta.connectors) ? rec.meta.connectors : [];
  for (const c of slot.connectors || []) {
    if (!have.some((h) => h.type === c.type && h.side === c.side)) msgs.push(`${w}: ${slot.atom} does not carry a connector of type "${c.type}" side "${c.side}"`);
  }
  for (const [k, val] of Object.entries(slot.dimensions_m || {})) {
    if (k in BOX) {
      const d = rec.meta.dimensions_m?.[BOX[k]];
      if (!isNum(d)) msgs.push(`${w}: ${slot.atom} records no dimensions_m`);
      else if (Math.abs(d - val) / val > ctx.profile.scale_tolerance) msgs.push(`${w}: ${slot.atom} has ${k} ${d} m, the slot asks for ${val} m (allowed ${ctx.profile.scale_tolerance * 100}%)`);
    } else {
      const slotTypes = (slot.connectors || []).map((c) => c.type);
      const vals = have.filter((h) => slotTypes.includes(h.type) && isNum(h.mating?.[k])).map((h) => h.mating[k]);
      if (vals.length === 0) msgs.push(`${w}: ${slot.atom} states no mating dimension "${k}" on a connector the slot requires`);
      else if (vals.some((x) => Math.abs(x - val) > ctx.profile.mating_tolerance_m)) msgs.push(`${w}: ${slot.atom} has mating dimension ${k} = ${vals.join(' / ')} m, the slot asks for ${val} m (allowed ${ctx.profile.mating_tolerance_m * 1000} mm)`);
    }
  }
  return msgs;
}

// ---------------------------------------------------------------------------
export function reuse(ctx) {
  const a = ctx.asset;
  if (a.kind !== 'atom') return skip('applies to atoms; objects and assemblies reuse by construction');
  const c = a.meta?.considered;
  if (!Array.isArray(c)) return fail('asset.json "considered" is missing; list the library atoms looked at as [{ "asset": "<id>@<version>", "reason": "why it does not fit" }], or [] if the library has nothing similar');
  const msgs = [];
  const notes = [];
  let mine = null;
  if (a.glb) {
    const box = bboxOfFaces(visiblePrims(collectGeometry(a.glb).prims));
    mine = { size: box?.size, conns: [...glbConnectors(a.glb).found.values()] };
  }
  c.forEach((e, i) => {
    const w = `considered[${i}]`;
    if (!e || typeof e.reason !== 'string' || !e.reason.trim()) { msgs.push(`${w}: "reason" (why it does not fit) is missing`); return; }
    const rec = resolvePin(e.asset, ctx.libDir);
    if (rec.error) { msgs.push(`${w}: ${rec.error}`); return; }
    const theirs = Array.isArray(rec.meta.connectors) ? rec.meta.connectors : [];
    if (!mine || !mine.size || mine.conns.length === 0 || !Array.isArray(rec.meta.dimensions_m)) return;
    const carries = mine.conns.every((m) => theirs.some((t) => t.type === m.type && t.side === m.side));
    const sizeOk = mine.size.every((s, k) => rec.meta.dimensions_m[k] > 0 && Math.abs(rec.meta.dimensions_m[k] - s) / s <= ctx.profile.scale_tolerance);
    // Connectors and size are the fit rules a script can test. Two parts can agree on both and still be
    // different things (a plain wall module and a window module), which is fit rule 4, the description.
    // So this is a note for the reviewer, with the builder's reason beside it, and not a failure.
    if (carries && sizeOk) notes.push(`${w}: ${e.asset} carries every connector of this atom and is within ${ctx.profile.scale_tolerance * 100}% of its size. Whether it is the same kind of part (fit rule 4, the description) is for a reviewer to judge from the reason given: ${JSON.stringify(e.reason.trim().slice(0, 300))}`);
  });
  if (msgs.length) return fail(msgs);
  return pass([`${c.length} considered atom(s); connectors and size were compared, and the "description matches" rule is not scripted (spec open question)`, ...notes]);
}

// ---------------------------------------------------------------------------
export function clip() {
  return skip('not implemented: the spec does not fix a clip file format or where clips live, so no clip can be read (see NOTES.md, Spec gaps)');
}

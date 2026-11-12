#!/usr/bin/env node
// The blueprint kit's command line. Run from anywhere inside a clone:
//
//   node tools/blueprint/blueprint.mjs draft <source_id> [--write]   blueprint, layout and tasks for one building
//   node tools/blueprint/blueprint.mjs assemble <object_id>          write assembly.json once every slot is pinned
//   node tools/blueprint/blueprint.mjs check                         draft every plan of the region, write nothing
//
// Options: --region <name> (default tokyo-sumida-oshiage-2), --repo <path> (default: the clone this file is in).
// What the tool does and what it does not: tools/blueprint/README.md.
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegion, readPlans, planFile } from '../survey/lib.mjs';
import { draft, assemble, ID_RE, ID_MAX, PIN_RE, VERSION_RE } from './lib.mjs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (name, fallback) => { const i = argv.indexOf(name); if (i < 0) return fallback; const v = argv[i + 1]; argv.splice(i, 2); return v ?? fallback; };
const repo = path.resolve(opt('--repo', path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')));
const region = opt('--region', 'tokyo-sumida-oshiage-2');
const write = flag('--write');
const [command, target] = argv;

const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + '\n');
const fail = (msg, code = 2) => { console.error(msg); process.exit(code); };
// Output goes only inside the clone. A symlink at assets/bld/<id>, tasks or a file in them could point
// elsewhere, so the real path of each file's nearest existing parent must lie inside the clone's real path.
const insideRepo = (file) => {
  let dir = path.dirname(path.resolve(file));
  while (!existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  const rel = path.relative(realpathSync(repo), realpathSync(dir));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  try { if (lstatSync(file).isSymbolicLink()) return false; } catch { /* does not exist yet */ }
  return true;
};
const guardOutputs = (files) => { const bad = files.find((f) => !insideRepo(f)); if (bad) fail(`refusing to write ${path.relative(repo, bad)}: it resolves outside the clone (a symlink?)`); };
const writeJson = (file, value) => { guardOutputs([file]); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const library = path.join(repo, 'assets');
const tasksDir = path.join(repo, 'tasks');
const objectDir = (id) => path.join(library, 'bld', id);
const validObjectId = (id) => typeof id === 'string' && ID_RE.test(id) && id.length <= ID_MAX && id.startsWith('bld_');

// An existing blueprint is untrusted: a pin or a slot name of the wrong shape is not carried over, and
// the report says how many and under which slot names, never what the value was.
function existingPins(id) {
  const none = { pins: new Map(), rejected: [], version: undefined };
  const file = path.join(objectDir(id), 'blueprint.json');
  if (!existsSync(file)) return none;
  try {
    const bp = readJson(file);
    const pins = new Map(), rejected = [];
    for (const s of bp.slots) {
      if (!s || s.atom === undefined || s.atom === 'new') continue;
      if (typeof s.slot === 'string' && ID_RE.test(s.slot) && typeof s.atom === 'string' && PIN_RE.test(s.atom)) pins.set(s.slot, s.atom);
      else rejected.push(typeof s.slot === 'string' && /^[a-z0-9_]{1,64}$/.test(s.slot) ? s.slot : '(a slot name of the wrong shape)');
    }
    return { pins, rejected, version: typeof bp.version === 'string' && VERSION_RE.test(bp.version) ? bp.version : undefined };
  } catch { return none; }
}

function summarise(r) {
  return {
    object_id: r.object_id,
    ...(r.unsupported ? { unsupported: r.unsupported, detail: r.detail } : {}),
    problems: r.problems,
    ...(r.summary ? { summary: r.summary, slots: r.slots } : {}),
    ...(r.height_dropped_m ? { height_dropped_m: r.height_dropped_m } : {}),
    ...(r.outline ? { max_shift_m: r.outline.max_shift_m } : {}),
    ...(r.conflicts ? { conflicts: r.conflicts } : {}),
  };
}

if (command === 'draft') {
  if (!target) fail('usage: draft <source_id or place_id> [--region R] [--repo P] [--write]');
  let reg;
  try { reg = loadRegion(repo, region); } catch (e) { fail(e.message); }
  const place = reg.places.find((p) => p.source_id === target || p.place_id === target);
  if (!place) fail(`no building ${target} in region ${region}`);
  const file = planFile(reg, place);
  if (!existsSync(file)) fail(`no plan file at ${path.relative(repo, file)}`);
  let plan;
  try { plan = readJson(file); } catch { fail(`${path.relative(repo, file)} is not valid JSON`); }
  const pre = draft(reg, place, plan, { library, tasks: tasksDir });
  const prior = pre.object_id ? existingPins(pre.object_id) : { pins: new Map(), rejected: [], version: undefined };
  const r = prior.pins.size || prior.version ? draft(reg, place, plan, { library, tasks: tasksDir, pinned: prior.pins, version: prior.version }) : pre;
  const report = summarise(r);
  if (prior.rejected.length) report.ignored_pins = { count: prior.rejected.length, slots: prior.rejected };
  if (write && !r.problems.length && !r.unsupported && !r.conflicts) {
    const dir = objectDir(r.object_id);
    guardOutputs([path.join(dir, 'blueprint.json'), path.join(dir, 'layout.json'), ...r.tasks.map((t) => path.join(tasksDir, `${t.task_id}.json`))]);
    const written = [], kept = [];
    writeJson(path.join(dir, 'blueprint.json'), r.blueprint); written.push(path.relative(repo, path.join(dir, 'blueprint.json')));
    writeJson(path.join(dir, 'layout.json'), r.layout); written.push(path.relative(repo, path.join(dir, 'layout.json')));
    for (const t of r.tasks) {
      const f = path.join(tasksDir, `${t.task_id}.json`);
      // The object's own task is this tool's output for this building, so a new draft replaces it.
      // A slot's task may belong to another building's bundle or be hand-written: it is left alone.
      if (existsSync(f) && t.task_id !== `task_${r.object_id}`) { kept.push(path.relative(repo, f)); continue; }
      writeJson(f, t); written.push(path.relative(repo, f));
    }
    report.written = written;
    if (kept.length) report.task_files_left_alone = kept;
  } else if (write) {
    report.written = [];
    report.note = r.conflicts
      ? 'nothing written: the existing blueprint pins slots this plan no longer has'
      : 'nothing written: the plan has problems or is unsupported';
  }
  out(report);
} else if (command === 'assemble') {
  if (!validObjectId(target)) fail('usage: assemble <object_id>');
  const dir = objectDir(target);
  let blueprint, layout;
  try { blueprint = readJson(path.join(dir, 'blueprint.json')); layout = readJson(path.join(dir, 'layout.json')); } catch (e) { fail(`cannot read blueprint.json and layout.json in ${path.relative(repo, dir)}: ${e.message}`); }
  try {
    const manifest = assemble(blueprint, layout, target);
    guardOutputs([path.join(dir, 'assembly.json')]);
    writeJson(path.join(dir, 'assembly.json'), manifest);
    out({ wrote: path.relative(repo, path.join(dir, 'assembly.json')), atoms: manifest.atoms.length, joints: manifest.joints.length });
  } catch (e) { fail(e.message, 1); }
} else if (command === 'check') {
  let reg;
  try { reg = loadRegion(repo, region); } catch (e) { fail(e.message); }
  const totals = { ok: 0, problems: 0, unsupported: 0, skipped: 0 };
  const allSlots = new Set();
  const byReason = {};
  for (const p of readPlans(reg)) {
    const name = p.place ? p.place.source_id : p.file;
    if (!p.place || !p.plan || p.problems.length) { totals.problems++; console.log(`${name}  problems: ${p.problems.join('; ')}`); continue; }
    if (p.plan.skipped) { totals.skipped++; console.log(`${name}  skipped (${p.plan.skipped})`); continue; }
    let r;
    try { r = draft(reg, p.place, p.plan, { library, tasks: tasksDir }); } catch (e) { console.log(`${name}  crash: ${e.stack}`); process.exitCode = 1; continue; }
    if (r.unsupported) { totals.unsupported++; byReason[r.unsupported] = (byReason[r.unsupported] ?? 0) + 1; console.log(`${name}  unsupported: ${r.unsupported} (${r.detail})`); }
    else if (r.problems.length) { totals.problems++; console.log(`${name}  problems: ${r.problems.join('; ')}`); }
    else { totals.ok++; r.slots.forEach((s) => allSlots.add(s.asset_id)); console.log(`${name}  ok: ${r.summary.pieces} pieces, ${r.summary.distinct_slots} slots (${r.summary.distinct_sizes} distinct sizes unscaled)`); }
  }
  console.log(`ok ${totals.ok}, problems ${totals.problems}, unsupported ${totals.unsupported}${Object.keys(byReason).length ? ` (${Object.entries(byReason).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}, skipped ${totals.skipped}; ${allSlots.size} distinct slots across the ok buildings`);
} else {
  fail('usage: blueprint.mjs draft <source_id> [--write] | assemble <object_id> | check   (options: --region R, --repo P)');
}

#!/usr/bin/env node
// The block survey's command line. Run from anywhere inside a clone:
//
//   node tools/survey/survey.mjs next            the next building to plan, and the bays used so far
//   node tools/survey/survey.mjs check           check every plan file
//   node tools/survey/survey.mjs check <file>    check one plan file
//   node tools/survey/survey.mjs tally           what the passing plans add up to (--write saves TALLY.md)
//   node tools/survey/survey.mjs edges           every building's walls as JSON, for tools/refs/wallrefs.py
//
// Options: --region <name> (default tokyo-sumida-oshiage-2), --all (every building, not only the
// start block), --repo <path> (default: the clone this file is in).
// The format is described in survey/README.md.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegion, readPlans, nextPlace, facts, vocabulary, tally, tallyMarkdown, BAY_KINDS, ROOF_KINDS, USAGES, SKIP_REASONS } from './lib.mjs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (name, fallback) => { const i = argv.indexOf(name); if (i < 0) return fallback; const v = argv[i + 1]; argv.splice(i, 2); return v ?? fallback; };
const repo = path.resolve(opt('--repo', path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')));
const region = opt('--region', 'tokyo-sumida-oshiage-2');
const all = flag('--all'), write = flag('--write');
const [command, target] = argv;
// JSON with one line per object that holds only plain values, so a list of edges or bays reads as a table.
const flat = (v) => v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'));
function show(v, pad = '') {
  if (flat(v)) return JSON.stringify(v);
  if (!Array.isArray(v) && Object.values(v).every(flat)) return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(', ')} }`;
  const inner = pad + ' ';
  const items = Array.isArray(v) ? v.map((x) => inner + show(x, inner)) : Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${show(x, inner)}`);
  return `${Array.isArray(v) ? '[' : '{'}\n${items.join(',\n')}\n${pad}${Array.isArray(v) ? ']' : '}'}`;
}
const print = (o) => process.stdout.write(show(o) + '\n');

let reg;
try { reg = loadRegion(repo, region); } catch (e) { console.error(e.message); process.exit(2); }

if (command === 'next') {
  const plans = readPlans(reg);
  const n = nextPlace(reg, plans, { all });
  const scope = all ? 'the region' : 'the start block';
  if (!n.place) {
    print({ done: true, progress: `${n.done} of ${n.total} buildings in ${scope} have a passing plan`, next_step: 'Every building has a passing plan. Run: node tools/survey/survey.mjs tally --write' });
  } else {
    print({
      done: false,
      progress: `${n.done} of ${n.total} buildings in ${scope} have a passing plan`,
      remaining: n.total - n.done,
      ...(n.problems ? { fix_first: 'This building has a plan file that does not pass. Its problems:', problems: n.problems } : {}),
      building: facts(reg, n.place),
      allowed: { bay_kinds: BAY_KINDS, roofs: ROOF_KINDS, usages: USAGES, skip_reasons: SKIP_REASONS },
      used_so_far: vocabulary(plans),
    });
  }
} else if (command === 'check') {
  const plans = readPlans(reg);
  const wanted = target ? path.basename(target) : null;
  const picked = wanted ? plans.filter((p) => (p.place ? `${p.place.source_id}.json` : p.file) === wanted) : plans;
  if (wanted && !picked.length) { console.error(`no plan file named ${wanted} in survey/${region}/plans`); process.exit(2); }
  const failing = picked.filter((p) => p.problems.length);
  for (const p of failing) {
    console.log(`FAIL ${p.place ? `${p.place.source_id}.json` : p.file}`);
    for (const m of p.problems) console.log(`  - ${m}`);
  }
  console.log(failing.length ? `${failing.length} of ${picked.length} plan file(s) fail` : `OK: ${picked.length} plan file(s) pass`);
  process.exit(failing.length ? 1 : 0);
} else if (command === 'tally') {
  const t = tally(reg, readPlans(reg));
  if (write) {
    const dir = path.join(repo, 'survey', region);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'TALLY.md'), tallyMarkdown(t) + '\n');
    writeFileSync(path.join(dir, 'tally.json'), JSON.stringify(t, null, 1) + '\n');
    console.log(`wrote survey/${region}/TALLY.md and tally.json: ${t.plans.planned} planned, ${t.plans.skipped} skipped, ${t.plans.failing} failing`);
  } else print(t);
} else if (command === 'edges') {
  // For tools/refs/wallrefs.py: every building's walls, numbered as the survey numbers them,
  // with both ends in region metres [x, z] (left end first, seen from outside).
  process.stdout.write(JSON.stringify(Object.fromEntries(reg.places.map((p) => {
    const f = facts(reg, p), ring = reg.rings.get(p.place_id);
    return [p.source_id, {
      place_id: p.place_id, in_start_block: f.in_start_block, ground_m: p.ground_m ?? 0, wall_height_m: f.roof.main_eave_m, top_m: f.roof.top_m,
      edges: f.edges.map((e, i) => ({ ...e, left: ring[i], right: ring[(i + 1) % ring.length] })),
    }];
  }))) + '\n');
} else {
  console.error('usage: node tools/survey/survey.mjs next | check [file] | tally [--write]   (options: --region <name>, --all, --repo <path>)');
  process.exit(2);
}

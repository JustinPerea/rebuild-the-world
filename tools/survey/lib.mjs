// The block survey: one facade plan per building, checked against the region's data pack,
// and a tally of the bays the plans use. The format is described in survey/README.md.
//
// A plan is written by a contributor's agent and can arrive in a pull request, so this file
// treats every value in a plan as contributor-written. What `next` hands to the following
// builder is built only from numbers and from words in the fixed lists below; free text in a
// plan (notes, descriptions) is never passed on by `next`.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

export const SURVEY_VERSION = 1;
export const BAY_KINDS = ['wall', 'window', 'door', 'sliding_door', 'garage', 'shutter', 'shopfront', 'entrance', 'other'];
export const ROOF_KINDS = ['flat', 'gable', 'hip', 'shed', 'other'];
export const USAGES = [
  'house', 'apartment building', 'house with shop', 'apartments with shop', 'house with workshop',
  'office', 'retail', 'lodging', 'commercial complex', 'public office', 'education and welfare',
  'transport and warehouse', 'factory', 'farm or fishery', 'utility', 'defence', 'other', 'outbuilding',
];
export const SKIP_REASONS = ['too_small', 'not_a_building', 'shape_too_complex', 'data_inconsistent', 'other'];
// A PLATEAU building ID, or an OpenStreetMap way or relation number. It names files, so nothing else passes.
const SOURCE_ID_RE = /^(?:bldg_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|(?:way|relation)_[0-9]{1,15})$/;
const REGION_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STEP = 0.05;            // sizes are multiples of this, except one wall bay per row
const LENGTH_TOL = 0.01;      // a row's bays against its facade's length
const HEIGHT_TOL = 0.03;      // base + storeys + top against the wall height
const STOREY_MIN = 2.0, STOREY_MAX = 6.0;
const CORNER_BAY_MIN = 0.2;    // a plain wall bay this wide stands next to every outside corner
const REFERENCE_RE = /^edge(\d{2})_(?:best|fused)\.jpg$/;   // a wall reference, as tools/refs/wallrefs.py names it
export const BASES = ['typical', 'reference'];
const REFERENCE_OFFSET_MAX = 3;  // metres a wall reference may sit off along the wall
const CLEAR_CAP = 30;

const r3 = (n) => Math.round(n * 1000) / 1000;
const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const onStep = (n) => Math.abs(n / STEP - Math.round(n / STEP)) < 1e-6;

function readJson(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { return { error: e.code === 'ENOENT' ? 'file not found' : `cannot be read (${e.code})` }; }
  try { return { value: JSON.parse(text) }; } catch { return { error: 'not valid JSON' }; }
}

const area2 = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);

// The same cleaning as tools/blockout/build.mjs (repeated and collinear points dropped), then
// ordered so that each edge runs left to right for someone standing outside and looking at it,
// and edge i + 1 is the facade around the right-hand corner of edge i.
export function outline(footprint) {
  let r = footprint.filter((p, i) => { const q = footprint[(i + 1) % footprint.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
  r = r.filter((p, i) => {
    const a = r[(i + r.length - 1) % r.length], b = r[(i + 1) % r.length];
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-6;
  });
  return area2(r) > 0 ? r.slice().reverse() : r;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function loadRegion(repo, region) {
  if (!REGION_RE.test(region)) throw new Error('region name is not valid');
  const dir = path.join(repo, 'data', region);
  const pack = readJson(path.join(dir, 'places.json'));
  if (pack.error) throw new Error(`data/${region}/places.json: ${pack.error}`);
  const roofs = readJson(path.join(dir, 'roof-shapes.json'));
  const places = pack.value.places
    .filter((p) => SOURCE_ID_RE.test(p.source_id))
    .sort((a, b) => (b.in_start_block ? 1 : 0) - (a.in_start_block ? 1 : 0) || (a.source_id < b.source_id ? -1 : 1));
  const rings = new Map(places.map((p) => [p.place_id, outline(p.footprint_m)]));
  return {
    repo, region, places, rings,
    shapes: roofs.value?.shapes ?? {},
    plansDir: path.join(repo, 'survey', region, 'plans'),
    byId: new Map(places.map((p) => [p.place_id, p])),
  };
}

export const planFile = (reg, place) => path.join(reg.plansDir, `${place.source_id}.json`);
export const planPath = (reg, place) => `survey/${reg.region}/plans/${place.source_id}.json`;

const inside = (ring, o) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > o[1]) !== (b[1] > o[1]) && o[0] < (b[0] - a[0]) * (o[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};

// Distance from a point just outside a wall, along a direction, to the nearest wall of any other
// building. 0 when the point is already inside another building: the two touch or overlap.
function clearAhead(reg, place, o, d) {
  let best = CLEAR_CAP;
  for (const [id, ring] of reg.rings) {
    if (id === place.place_id) continue;
    if (inside(ring, o)) return 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const den = d[0] * ez - d[1] * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a[0] - o[0]) * ez - (a[1] - o[1]) * ex) / den;
      const u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
  }
  return best;
}

function roofFacts(reg, place) {
  const ground = place.ground_m ?? 0;
  const polys = (reg.shapes[place.place_id] ?? []).filter((s) => s.kind === 'roof' && Array.isArray(s.ring) && s.ring.length >= 3);
  if (!polys.length) return { from: 'height only', shape: 'unknown', lowest_eave_m: r2(place.height_m), main_eave_m: r2(place.height_m), top_m: r2(place.height_m), levels: [] };
  const parts = polys.map((s) => {
    const ys = s.ring.map((v) => v[1] - ground);
    const plan = Math.abs(area2(s.ring.map((v) => [v[0], v[2]]))) / 2;
    return { low: Math.min(...ys), high: Math.max(...ys), plan };
  });
  // Roof pieces whose lowest edges sit within 0.3 m of each other count as one level.
  const levels = [];
  for (const p of parts.slice().sort((a, b) => a.low - b.low)) {
    const l = levels.find((x) => Math.abs(x.low - p.low) <= 0.3);
    if (l) { l.plan += p.plan; l.high = Math.max(l.high, p.high); } else levels.push({ low: p.low, high: p.high, plan: p.plan });
  }
  const total = levels.reduce((s, l) => s + l.plan, 0) || 1;
  const main = levels.slice().sort((a, b) => b.plan - a.plan)[0];
  const flat = parts.every((p) => p.high - p.low < 0.05);
  const pitched = parts.every((p) => p.high - p.low >= 0.05);
  return {
    from: 'roof shape data',
    shape: flat ? 'flat' : pitched ? 'pitched' : 'mixed',
    lowest_eave_m: r2(Math.min(...parts.map((p) => p.low))),
    main_eave_m: r2(main.low),
    top_m: r2(Math.max(...parts.map((p) => p.high))),
    levels: levels.map((l) => ({ eave_m: r2(l.low), top_m: r2(l.high), share: r2(l.plan / total) })),
  };
}

// What the data pack says about one building, in the form a plan is written against.
export function facts(reg, place) {
  const ring = reg.rings.get(place.place_id);
  const n = ring.length;
  const edges = ring.map((p, i) => {
    const q = ring[(i + 1) % n], prev = ring[(i + n - 1) % n], next = ring[(i + 2) % n];
    const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
    const out = [-dz / len, dx / len];
    const bearing = (Math.atan2(out[0], -out[1]) * 180 / Math.PI + 360) % 360;
    const clear = Math.min(...[0.25, 0.5, 0.75].map((f) => clearAhead(reg, place, [p[0] + dx * f + out[0] * 0.05, p[1] + dz * f + out[1] * 0.05], out)));
    const angle = (a, b, c) => {
      const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]];
      const inner = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))) * 180 / Math.PI;
      // Inside angle of the building at b: 90 for a square corner, 270 for a corner that points inwards.
      return (u[0] * v[1] - u[1] * v[0]) > 0 ? inner : 360 - inner;
    };
    return {
      edge: i,
      length_m: r3(len),
      faces: COMPASS[Math.round(bearing / 45) % 8],
      clear_m: clear >= CLEAR_CAP ? CLEAR_CAP : r1(clear),
      corner_left_deg: r1(angle(prev, p, q)),
      corner_right_deg: r1(angle(p, q, next)),
    };
  });
  return {
    place_id: place.place_id,
    file: planPath(reg, place),
    in_start_block: !!place.in_start_block,
    height_m: place.height_m,
    height_from: place.height_from ?? null,
    storeys: Number.isInteger(place.storeys) ? place.storeys : null,
    usage: USAGES.includes(place.usage) ? place.usage : null,
    footprint_area_m2: r1(Math.abs(area2(ring)) / 2),
    roof: roofFacts(reg, place),
    edges,
  };
}

// Returns the list of problems with one plan. An empty list means the plan passes.
export function checkPlan(reg, place, plan) {
  const out = [];
  const bad = (m) => { out.push(m); };
  if (!isObj(plan)) return ['the file must hold one JSON object'];
  if (plan.survey_version !== SURVEY_VERSION) bad(`"survey_version" must be ${SURVEY_VERSION}`);
  if (plan.place_id !== place.place_id) bad('"place_id" must be the place this file is named after');
  const pv = plan.provenance;
  if (!isObj(pv) || typeof pv.author !== 'string' || !pv.author.trim() || !Array.isArray(pv.tools) || !pv.tools.length
    || pv.tools.some((t) => typeof t !== 'string' || !t.trim()) || typeof pv.created !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(pv.created)) {
    bad('"provenance" needs "author", "tools" (a list that names the agent and its model) and "created" (YYYY-MM-DD)');
  }
  if (plan.notes !== undefined && (typeof plan.notes !== 'string' || plan.notes.length > 600)) bad('"notes" must be text of at most 600 characters');

  if (plan.skipped !== undefined) {
    if (!SKIP_REASONS.includes(plan.skipped)) bad(`"skipped" must be one of: ${SKIP_REASONS.join(', ')}`);
    if (typeof plan.notes !== 'string' || plan.notes.trim().length < 10) bad('a skipped building needs "notes" that say why, in a sentence');
    return out;
  }

  const f = facts(reg, place);
  if (!USAGES.includes(plan.usage)) bad(`"usage" must be one of: ${USAGES.join(', ')}`);
  if (!['data', 'estimated'].includes(plan.usage_from)) bad('"usage_from" must be "data" or "estimated"');
  else if (plan.usage_from === 'data' && plan.usage !== f.usage) bad(f.usage ? `"usage_from" is "data", and the data says "${f.usage}"` : 'the data gives no usage for this building, so "usage_from" must be "estimated"');
  else if (plan.usage_from === 'estimated' && f.usage && plan.usage !== f.usage && !(plan.notes ?? '').trim()) bad(`the data says "${f.usage}"; a different usage needs "notes" that say why`);

  const storeys = plan.storeys;
  if (!Number.isInteger(storeys) || storeys < 1 || storeys > 60) bad('"storeys" must be a whole number from 1 to 60');
  if (!['data', 'estimated'].includes(plan.storeys_from)) bad('"storeys_from" must be "data" or "estimated"');
  else if (plan.storeys_from === 'data' && storeys !== f.storeys) bad(f.storeys ? `"storeys_from" is "data", and the data says ${f.storeys}` : 'the data gives no storey count for this building, so "storeys_from" must be "estimated"');
  else if (plan.storeys_from === 'estimated' && f.storeys && storeys !== f.storeys && !(plan.notes ?? '').trim()) bad(`the data says ${f.storeys} storeys; a different count needs "notes" that say why`);

  if (!ROOF_KINDS.includes(plan.roof)) bad(`"roof" must be one of: ${ROOF_KINDS.join(', ')}`);

  const lo = f.roof.lowest_eave_m - 0.05, hi = f.roof.top_m + 0.05;
  const wall = plan.wall_height_m;
  if (!isNum(wall) || wall < lo || wall > hi) bad(`"wall_height_m" must lie between the lowest eave and the top of the roof (${f.roof.lowest_eave_m} to ${f.roof.top_m})`);
  const sh = plan.storey_heights_m;
  let heightsOk = Array.isArray(sh) && sh.every(isNum);
  if (!heightsOk) bad('"storey_heights_m" must be a list of numbers, one per storey, ground floor first');
  else {
    if (Number.isInteger(storeys) && sh.length !== storeys) { bad(`"storey_heights_m" has ${sh.length} entries for ${storeys} storeys`); heightsOk = false; }
    if (sh.some((h) => h < STOREY_MIN || h > STOREY_MAX)) bad(`every storey height must be from ${STOREY_MIN} to ${STOREY_MAX} m`);
    if (sh.some((h) => !onStep(h))) bad(`every storey height must be a multiple of ${STEP} m; put the remainder in "base_m" or "top_m"`);
  }
  for (const k of ['base_m', 'top_m']) if (!isNum(plan[k]) || plan[k] < 0 || plan[k] > 3) bad(`"${k}" must be a number from 0 to 3`);
  if (heightsOk && isNum(wall) && isNum(plan.base_m) && isNum(plan.top_m)) {
    const sum = plan.base_m + plan.top_m + sh.reduce((s, h) => s + h, 0);
    if (Math.abs(sum - wall) > HEIGHT_TOL) bad(`base_m + the storey heights + top_m is ${r3(sum)} m, and wall_height_m is ${wall} m; they must agree within ${HEIGHT_TOL} m`);
  }

  if (!Array.isArray(plan.facades)) { bad('"facades" must be a list (it may be empty: an edge that is not listed is a plain wall)'); return out; }
  const seen = new Set();
  plan.facades.forEach((fa, fi) => {
    const at = `facades[${fi}]`;
    if (!isObj(fa) || !Number.isInteger(fa.edge) || fa.edge < 0 || fa.edge >= f.edges.length) { bad(`${at}: "edge" must be an edge number from 0 to ${f.edges.length - 1}`); return; }
    if (seen.has(fa.edge)) { bad(`${at}: edge ${fa.edge} is listed twice`); return; }
    seen.add(fa.edge);
    const len = f.edges[fa.edge].length_m;
    if (!isNum(fa.length_m) || Math.abs(fa.length_m - len) > LENGTH_TOL) bad(`${at}: "length_m" must be the length of edge ${fa.edge}, ${len} m`);
    if (fa.basis !== undefined && !BASES.includes(fa.basis)) bad(`${at}: "basis" must be one of: ${BASES.join(', ')}`);
    if ((fa.basis ?? 'typical') === 'reference') {
      const m = typeof fa.reference === 'string' ? REFERENCE_RE.exec(fa.reference) : null;
      if (!m || Number(m[1]) !== fa.edge) bad(`${at}: a facade drawn from a wall reference names it in "reference", as edge${String(fa.edge).padStart(2, '0')}_fused.jpg or edge${String(fa.edge).padStart(2, '0')}_best.jpg`);
      if (fa.reference_offset_m !== undefined && (!isNum(fa.reference_offset_m) || Math.abs(fa.reference_offset_m) > REFERENCE_OFFSET_MAX)) bad(`${at}: "reference_offset_m" is where the wall's left end sits in the image, in metres from the image's left edge, from -${REFERENCE_OFFSET_MAX} to ${REFERENCE_OFFSET_MAX}`);
    } else if (fa.reference !== undefined || fa.reference_offset_m !== undefined) bad(`${at}: "reference" and "reference_offset_m" are only for a facade whose "basis" is "reference"`);
    const outsideLeft = f.edges[fa.edge].corner_left_deg < 180, outsideRight = f.edges[fa.edge].corner_right_deg < 180;
    if (!Array.isArray(fa.rows) || !fa.rows.length) { bad(`${at}: "rows" must be a list with at least one row`); return; }
    const covered = new Map();
    fa.rows.forEach((row, ri) => {
      const rat = `${at}.rows[${ri}]`;
      if (!isObj(row) || !Array.isArray(row.storeys) || !row.storeys.length || row.storeys.some((s) => !Number.isInteger(s) || s < 1 || (Number.isInteger(storeys) && s > storeys))) {
        bad(`${rat}: "storeys" must list storey numbers from 1 to ${Number.isInteger(storeys) ? storeys : 'the storey count'}`); return;
      }
      for (const s of row.storeys) covered.set(s, (covered.get(s) ?? 0) + 1);
      if (!Array.isArray(row.bays) || !row.bays.length) { bad(`${rat}: "bays" must be a list with at least one bay`); return; }
      const lowest = heightsOk ? Math.min(...row.storeys.map((s) => sh[s - 1]).filter(isNum)) : Infinity;
      let total = 0, offStep = 0, baysOk = true;
      row.bays.forEach((bay, bi) => {
        const bat = `${rat}.bays[${bi}]`;
        if (!isObj(bay) || !BAY_KINDS.includes(bay.kind)) { bad(`${bat}: "kind" must be one of: ${BAY_KINDS.join(', ')}`); baysOk = false; return; }
        const count = bay.count ?? 1;
        if (!Number.isInteger(count) || count < 1 || count > 200) { bad(`${bat}: "count" must be a whole number from 1 to 200`); baysOk = false; return; }
        if (!isNum(bay.width_m) || bay.width_m <= 0) { bad(`${bat}: "width_m" must be a number above 0`); baysOk = false; return; }
        total += bay.width_m * count;
        if (bay.balcony !== undefined && (bay.balcony !== true || !['window', 'sliding_door'].includes(bay.kind))) bad(`${bat}: "balcony" may only be true, on a window or a sliding_door`);
        if (bay.kind === 'wall') {
          if (bay.opening_m !== undefined || bay.sill_m !== undefined) bad(`${bat}: a wall bay has no opening`);
          if (!onStep(bay.width_m)) offStep += count;
          return;
        }
        if (!onStep(bay.width_m)) bad(`${bat}: the width of a ${bay.kind} bay must be a multiple of ${STEP} m`);
        const op = bay.opening_m;
        if (!Array.isArray(op) || op.length !== 2 || !op.every((v) => isNum(v) && v > 0 && onStep(v))) { bad(`${bat}: "opening_m" must be [width, height] in multiples of ${STEP} m`); return; }
        if (!isNum(bay.sill_m) || bay.sill_m < 0 || !onStep(bay.sill_m)) { bad(`${bat}: "sill_m" must be the height of the opening's bottom above the storey's floor, a multiple of ${STEP} m (0 for a door)`); return; }
        if (op[0] > bay.width_m + 1e-6) bad(`${bat}: the opening is ${op[0]} m wide in a bay ${bay.width_m} m wide`);
        if (bay.sill_m + op[1] > lowest + 1e-6) bad(`${bat}: the opening reaches ${r3(bay.sill_m + op[1])} m above the floor, and the storey is ${lowest} m high`);
        if (bay.kind === 'other' && (typeof bay.description !== 'string' || bay.description.trim().length < 3 || bay.description.length > 120)) bad(`${bat}: an "other" bay needs a "description" of 3 to 120 characters`);
      });
      if (!baysOk) return;
      const endBay = (bay, which) => { if (bay.kind !== 'wall' || bay.width_m < CORNER_BAY_MIN - 1e-6) bad(`${rat}: the ${which} bay stands at an outside corner, so it must be a plain wall bay at least ${CORNER_BAY_MIN} m wide`); };
      if (outsideLeft) endBay(row.bays[0], 'first');
      if (outsideRight) endBay(row.bays[row.bays.length - 1], 'last');
      if (offStep > 1) bad(`${rat}: ${offStep} wall bays have a width that is not a multiple of ${STEP} m; only one wall bay in a row may take up the remainder`);
      if (Math.abs(total - len) > LENGTH_TOL) bad(`${rat}: the bays add up to ${r3(total)} m, and edge ${fa.edge} is ${len} m long`);
    });
    if (Number.isInteger(storeys)) {
      const missing = [], twice = [];
      for (let s = 1; s <= storeys; s++) { const c = covered.get(s) ?? 0; if (c === 0) missing.push(s); if (c > 1) twice.push(s); }
      if (missing.length) bad(`${at}: no row covers storey ${missing.join(', ')}`);
      if (twice.length) bad(`${at}: more than one row covers storey ${twice.join(', ')}`);
    }
  });
  return out;
}

// Reads every plan file of the region. Each entry is { place, plan, problems } or { place: null, file, problems }.
export function readPlans(reg) {
  if (!existsSync(reg.plansDir)) return [];
  const bySource = new Map(reg.places.map((p) => [p.source_id, p]));
  return readdirSync(reg.plansDir).filter((n) => n.endsWith('.json')).sort().map((name) => {
    const place = bySource.get(name.slice(0, -5));
    if (!place) return { place: null, file: name, problems: ['the file is not named after a building of this region'] };
    const r = readJson(path.join(reg.plansDir, name));
    if (r.error) return { place, plan: null, problems: [r.error] };
    return { place, plan: r.value, problems: checkPlan(reg, place, r.value) };
  });
}

const bayKey = (b, storeyH) => [b.kind, b.width_m, b.opening_m?.[0] ?? '', b.opening_m?.[1] ?? '', b.sill_m ?? '', b.balcony ? 1 : 0, storeyH ?? ''].join('|');

// Every bay of a passing plan, one entry per storey it stands on, with the storey's height.
function* baysOf(plan) {
  for (const fa of plan.facades) for (const row of fa.rows) for (const s of row.storeys) for (const bay of row.bays) {
    yield { bay, count: bay.count ?? 1, storey_height_m: plan.storey_heights_m[s - 1] };
  }
}

// The bays used so far, most used first. Numbers and listed words only: see the note at the top.
export function vocabulary(plans, limit = 40) {
  const map = new Map();
  const heights = new Map();
  for (const { plan, problems } of plans) {
    if (!plan || problems.length || plan.skipped) continue;
    for (const h of plan.storey_heights_m) heights.set(h, (heights.get(h) ?? 0) + 1);
    for (const { bay, count } of baysOf(plan)) {
      if (bay.kind === 'wall' || bay.kind === 'other') continue;
      const k = bayKey(bay);
      const e = map.get(k) ?? { kind: bay.kind, width_m: bay.width_m, opening_m: bay.opening_m, sill_m: bay.sill_m, ...(bay.balcony ? { balcony: true } : {}), used: 0 };
      e.used += count; map.set(k, e);
    }
  }
  return {
    bays: [...map.values()].sort((a, b) => b.used - a.used).slice(0, limit),
    storey_heights_m: [...heights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([h, used]) => ({ height_m: h, used })),
  };
}

// The next building that has no passing plan: start block first unless `all`.
export function nextPlace(reg, plans, { all = false } = {}) {
  const state = new Map(plans.filter((p) => p.place).map((p) => [p.place.place_id, p]));
  const pool = reg.places.filter((p) => all || p.in_start_block);
  const done = pool.filter((p) => state.has(p.place_id) && !state.get(p.place_id).problems.length).length;
  const place = pool.find((p) => !state.has(p.place_id) || state.get(p.place_id).problems.length);
  return { place: place ?? null, problems: place ? state.get(place.place_id)?.problems ?? null : null, done, total: pool.length };
}

const hist = (values, step) => {
  const m = new Map();
  for (const v of values) { const k = r3(Math.floor(v / step + 1e-9) * step); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([from, count]) => ({ from, to: r3(from + step), count }));
};

// What the passing plans add up to. See survey/README.md, "The tally".
export function tally(reg, plans) {
  const good = plans.filter((p) => p.place && p.plan && !p.problems.length);
  const planned = good.filter((p) => !p.plan.skipped);
  const skipped = good.filter((p) => p.plan.skipped);
  const count = (list, f) => { const m = {}; for (const x of list) { const k = f(x); m[k] = (m[k] ?? 0) + 1; } return m; };

  // One atom per distinct bay. Three readings of "distinct": nothing stretches; walls stretch
  // in width; walls stretch in width and every bay stretches in height.
  const fixed = new Map(), wallsStretch = new Map(), allStretch = new Map();
  const add = (map, key, entry, n, id) => { const e = map.get(key) ?? { ...entry, instances: 0, places: new Set() }; e.instances += n; e.places.add(id); map.set(key, e); };
  const filler = [], wallWidths = [], others = [];
  let instances = 0, listedEdges = 0, plainEdges = 0, balconies = 0;
  for (const { place, plan } of planned) {
    const f = facts(reg, place);
    listedEdges += plan.facades.length; plainEdges += f.edges.length - plan.facades.length;
    // An edge that is not listed is one plain wall bay on every storey.
    const listed = new Set(plan.facades.map((fa) => fa.edge));
    const plain = f.edges.filter((e) => !listed.has(e.edge)).flatMap((e) => plan.storey_heights_m.map((h) => ({ bay: { kind: 'wall', width_m: e.length_m }, count: 1, storey_height_m: h })));
    for (const { bay, count: n, storey_height_m: h } of [...baysOf(plan), ...plain]) {
      instances += n;
      const base = { kind: bay.kind, width_m: bay.width_m, opening_m: bay.opening_m ?? null, sill_m: bay.sill_m ?? null, balcony: !!bay.balcony };
      if (bay.balcony) balconies += n;
      if (bay.kind === 'other') others.push({ place_id: place.place_id, width_m: bay.width_m, description: String(bay.description).slice(0, 120) });
      if (bay.kind === 'wall') {
        for (let i = 0; i < n; i++) wallWidths.push(bay.width_m);
        if (!onStep(bay.width_m)) filler.push(bay.width_m);
      }
      add(fixed, bayKey(bay, h), { ...base, storey_height_m: h }, n, place.place_id);
      add(wallsStretch, bay.kind === 'wall' ? `wall|${h}` : bayKey(bay, h), bay.kind === 'wall' ? { kind: 'wall', width_m: 'any', storey_height_m: h } : { ...base, storey_height_m: h }, n, place.place_id);
      add(allStretch, bay.kind === 'wall' ? 'wall' : bayKey(bay), bay.kind === 'wall' ? { kind: 'wall', width_m: 'any' } : base, n, place.place_id);
    }
  }
  const ranked = (map) => [...map.values()].sort((a, b) => b.instances - a.instances || b.places.size - a.places.size);
  const coverage = (map) => {
    const list = ranked(map);
    const need = (share) => { let s = 0; for (let i = 0; i < list.length; i++) { s += list[i].instances; if (s >= share * instances) return i + 1; } return list.length; };
    const fully = (n) => {
      const top = new Set(list.slice(0, n)); let c = 0;
      for (const { place } of planned) if (list.every((e) => !e.places.has(place.place_id) || top.has(e))) c++;
      return c;
    };
    return {
      atoms: list.length,
      atoms_for_half_the_bays: instances ? need(0.5) : 0,
      atoms_for_80_percent: instances ? need(0.8) : 0,
      atoms_for_95_percent: instances ? need(0.95) : 0,
      buildings_fully_covered_by_top_20: fully(20),
      buildings_fully_covered_by_top_50: fully(50),
    };
  };
  const strip = (e) => { const { places, ...rest } = e; return { ...rest, buildings: places.size }; };

  // From the data pack alone: how square the corners are, and how long the facades are.
  const pool = reg.places.filter((p) => p.in_start_block);
  const corners = [], lengths = [];
  for (const p of pool) for (const e of facts(reg, p).edges) { corners.push(e.corner_left_deg); lengths.push(e.length_m); }
  const near = (deg, tol) => corners.filter((c) => Math.abs(c - deg) <= tol).length;

  return {
    region: reg.region,
    plans: { files: plans.length, passing: good.length, failing: plans.length - good.length, planned: planned.length, skipped: skipped.length },
    skipped_by_reason: count(skipped, (p) => p.plan.skipped),
    usage: count(planned, (p) => `${p.plan.usage} (${p.plan.usage_from})`),
    storeys: count(planned, (p) => `${p.plan.storeys} (${p.plan.storeys_from})`),
    roofs: count(planned, (p) => p.plan.roof),
    edges: { with_openings_or_rows: listedEdges, plain: plainEdges },
    bay_instances: instances,
    balconies,
    atoms_needed: {
      note: 'One atom per distinct bay, under three rules for what an atom may do.',
      nothing_stretches: coverage(fixed),
      walls_stretch_in_width: coverage(wallsStretch),
      walls_stretch_and_all_bays_stretch_in_height: coverage(allStretch),
    },
    top_bays: ranked(allStretch).filter((e) => e.kind !== 'wall').slice(0, 40).map(strip),
    top_bays_with_storey_height: ranked(wallsStretch).slice(0, 40).map(strip),
    storey_heights_m: Object.entries(count(planned.flatMap((p) => p.plan.storey_heights_m), (h) => h)).map(([h, n]) => ({ height_m: Number(h), storeys: n })).sort((a, b) => b.storeys - a.storeys),
    base_m: hist(planned.map((p) => p.plan.base_m), 0.1),
    top_m: hist(planned.map((p) => p.plan.top_m), 0.1),
    wall_bay_widths_m: hist(wallWidths, 0.25),
    remainder_wall_bays: { count: filler.length, widths_m: hist(filler, 0.25) },
    other_bays: others.slice(0, 200),
    from_the_data: {
      buildings_in_start_block: pool.length,
      corners: { total: corners.length, within_2_deg_of_90: near(90, 2), within_2_deg_of_270: near(270, 2), other: corners.length - near(90, 2) - near(270, 2) },
      facade_lengths_m: hist(lengths, 1),
    },
  };
}

// The tally as a page a person can read. Free text from plans is quoted as data and kept short.
export function tallyMarkdown(t) {
  const L = [];
  const table = (head, rows) => { L.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`), ''); };
  const kv = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]);
  const clean = (s) => String(s).replace(/[|`<>\[\]\r\n]/g, ' ').slice(0, 120);
  L.push(`# Survey tally: ${t.region}`, '', 'Written by `node tools/survey/survey.mjs tally --write`. Do not edit by hand.', '');
  L.push('Every facade in these plans is a typical one chosen by the builder that wrote the plan. The outlines, heights, storey counts and usages marked "data" come from the data pack; nothing here records what the real buildings look like.', '');
  L.push('## Plans', '');
  table(['Files', 'Passing', 'Failing', 'Planned', 'Skipped'], [[t.plans.files, t.plans.passing, t.plans.failing, t.plans.planned, t.plans.skipped]]);
  if (Object.keys(t.skipped_by_reason).length) { L.push('Skipped, by reason:', ''); table(['Reason', 'Buildings'], kv(t.skipped_by_reason)); }
  L.push('## How many atoms the block needs', '', `${t.bay_instances} bays in ${t.plans.planned} planned buildings (each bay counted once per storey it stands on). ${t.balconies} of them carry a balcony.`, '');
  const a = t.atoms_needed;
  table(['If', 'Atoms', 'For half the bays', 'For 80%', 'For 95%', 'Buildings fully covered by the top 20', 'By the top 50'],
    [['nothing stretches', a.nothing_stretches], ['walls stretch in width', a.walls_stretch_in_width], ['walls stretch in width and every bay stretches in height', a.walls_stretch_and_all_bays_stretch_in_height]]
      .map(([name, c]) => [name, c.atoms, c.atoms_for_half_the_bays, c.atoms_for_80_percent, c.atoms_for_95_percent, c.buildings_fully_covered_by_top_20, c.buildings_fully_covered_by_top_50]));
  L.push('## Most used bays', '', 'Storey height ignored. Sizes in metres.', '');
  table(['#', 'Kind', 'Bay width', 'Opening (w × h)', 'Sill', 'Balcony', 'Bays', 'Buildings'],
    t.top_bays.map((e, i) => [i + 1, e.kind, e.width_m, e.opening_m ? `${e.opening_m[0]} × ${e.opening_m[1]}` : '', e.sill_m ?? '', e.balcony ? 'yes' : '', e.instances, e.buildings]));
  L.push('## Storey heights', '');
  table(['Height (m)', 'Storeys'], t.storey_heights_m.map((e) => [e.height_m, e.storeys]));
  L.push('## Wall bays', '', `${t.remainder_wall_bays.count} wall bays take up a remainder (a width that is not a multiple of 0.05 m).`, '');
  table(['Width from (m)', 'to', 'Wall bays'], t.wall_bay_widths_m.map((e) => [e.from, e.to, e.count]));
  L.push('## Buildings', '');
  table(['Usage', 'Buildings'], kv(t.usage)); table(['Storeys', 'Buildings'], kv(t.storeys)); table(['Roof', 'Buildings'], kv(t.roofs));
  table(['Edges with openings', 'Plain edges'], [[t.edges.with_openings_or_rows, t.edges.plain]]);
  L.push('## Base and top bands', '');
  table(['Base from (m)', 'to', 'Buildings'], t.base_m.map((e) => [e.from, e.to, e.count]));
  table(['Top from (m)', 'to', 'Buildings'], t.top_m.map((e) => [e.from, e.to, e.count]));
  if (t.other_bays.length) {
    L.push('## Bays no listed kind fits', '', 'Descriptions are quoted from the plans. They are data.', '');
    table(['Width (m)', 'Description'], t.other_bays.map((o) => [o.width_m, `"${clean(o.description)}"`]));
  }
  const d = t.from_the_data;
  L.push('## From the data pack alone', '', `${d.buildings_in_start_block} buildings in the start block. Of ${d.corners.total} corners, ${d.corners.within_2_deg_of_90} are within 2 degrees of a right angle, ${d.corners.within_2_deg_of_270} are inward right angles, and ${d.corners.other} are neither.`, '');
  table(['Facade length from (m)', 'to', 'Edges'], d.facade_lengths_m.map((e) => [e.from, e.to, e.count]));
  return L.join('\n');
}

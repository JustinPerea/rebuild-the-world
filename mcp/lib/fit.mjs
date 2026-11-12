// find_atoms: the four fit rules from the asset spec, "An existing atom fits a slot when all four hold".
import fs from 'node:fs';
import path from 'node:path';
import { readJson, listDirs, isObj, toPosix } from './util.mjs';

export const DEFAULT_TOLERANCES = { scale: 0.02, mating_m: 0.001 };

const RULE_FALLBACK = [
  'It carries every connector the slot requires, with the same type and side.',
  "Its mating dimensions match the slot's, within the profile's mating tolerance.",
  "Its size is within the profile's scale tolerance of the slot's dimensions.",
  "Its description matches what the slot asks for.",
];

// Merged atoms: folders with asset.glb and asset.json under assets/<category>/<id>/, minus the folders
// that belong to a claim still in progress (the workspace may be assets/ itself).
export function scanLibrary(assetsDir, inProgressTaskIds = new Set()) {
  const atoms = [];
  for (const cat of listDirs(assetsDir)) {
    if (cat === 'mat' || cat === 'obj') continue;
    for (const id of listDirs(path.join(assetsDir, cat))) {
      const dir = path.join(assetsDir, cat, id);
      if (!fs.existsSync(path.join(dir, 'asset.glb'))) continue;
      const m = readJson(path.join(dir, 'asset.json'));
      if (m.error || !isObj(m.value)) continue;
      if (m.value.task_id && inProgressTaskIds.has(m.value.task_id)) continue;
      atoms.push({ asset_id: id, category: cat, rel: toPosix(path.join('assets', cat, id)), meta: m.value });
    }
  }
  return atoms;
}

const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);

function matingValue(meta, name) {
  if (isObj(meta.mating_dimensions_m) && typeof meta.mating_dimensions_m[name] === 'number') return meta.mating_dimensions_m[name];
  for (const c of meta.connectors || []) {
    if (isObj(c?.mating_dimensions_m) && typeof c.mating_dimensions_m[name] === 'number') return c.mating_dimensions_m[name];
    // The shape the validator and asset spec v0.5 use: each connector entry carries "mating".
    if (isObj(c?.mating) && typeof c.mating[name] === 'number') return c.mating[name];
  }
  return undefined;
}

export function evaluate(atom, req, tol, ruleText) {
  const meta = atom.meta;
  const rules = [];
  const text = (n) => ruleText[n - 1] || RULE_FALLBACK[n - 1];

  // Rule 1: connectors
  if (req.connectors?.length) {
    const miss = [];
    for (const r of req.connectors) {
      const want = r.count ?? 1;
      const have = (meta.connectors || []).filter((c) => c?.type === r.type && c?.side === r.side).length;
      if (have < want) miss.push(`needs ${want} "${r.type}" side ${r.side}, has ${have}`);
    }
    rules.push({ rule: 1, text: text(1), result: miss.length ? 'fail' : 'pass', detail: miss.join('; ') || 'all required connectors present' });
  } else rules.push({ rule: 1, text: text(1), result: 'unchecked', detail: 'no required connectors given' });

  // Rule 2: mating dimensions
  const names = Object.keys(req.mating_dimensions_m || {});
  if (names.length) {
    const bad = [];
    const unknown = [];
    for (const n of names) {
      const v = matingValue(meta, n);
      if (v === undefined) unknown.push(n);
      else if (Math.abs(v - req.mating_dimensions_m[n]) > tol.mating_m) bad.push(`${n} is ${v} m, slot needs ${req.mating_dimensions_m[n]} m (tolerance ${tol.mating_m} m)`);
    }
    if (bad.length) rules.push({ rule: 2, text: text(2), result: 'fail', detail: bad.join('; ') });
    else if (unknown.length) rules.push({ rule: 2, text: text(2), result: 'unchecked', detail: `asset.json records no mating_dimensions_m for: ${unknown.join(', ')}` });
    else rules.push({ rule: 2, text: text(2), result: 'pass', detail: 'mating dimensions match' });
  } else rules.push({ rule: 2, text: text(2), result: 'unchecked', detail: 'no mating dimensions given' });

  // Rule 3: size within the scale tolerance
  if (req.dimensions_m) {
    const d = meta.dimensions_m;
    if (!Array.isArray(d) || d.length !== 3) rules.push({ rule: 3, text: text(3), result: 'unchecked', detail: 'asset.json has no dimensions_m' });
    else {
      const bad = ['width', 'height', 'depth'].flatMap((n, i) => (close(d[i], req.dimensions_m[i], tol.scale) ? [] : [`${n} ${d[i]} m vs ${req.dimensions_m[i]} m`]));
      rules.push({ rule: 3, text: text(3), result: bad.length ? 'fail' : 'pass', detail: bad.length ? `${bad.join('; ')} (allowed ${tol.scale * 100}%)` : `within ${tol.scale * 100}%` });
    }
  } else rules.push({ rule: 3, text: text(3), result: 'unchecked', detail: 'no dimensions given' });

  // Rule 4: description. Judged by the agent, not by the server.
  rules.push({ rule: 4, text: text(4), result: 'unchecked', detail: 'a judgement for the agent: compare the atom description (data) with what the slot asks for' });

  const failed = rules.filter((r) => r.result === 'fail').map((r) => r.rule);
  return { failed, passed: rules.filter((r) => r.result === 'pass').length, rules };
}

export function search(atoms, req, tol, ruleText, limit = 5) {
  const rows = atoms.map((a) => {
    const e = evaluate(a, req, tol, ruleText);
    return {
      asset_id: a.asset_id,
      path: a.rel,
      version: a.meta.version ?? null,
      description: a.meta.description ?? null,
      dimensions_m: a.meta.dimensions_m ?? null,
      connectors: (a.meta.connectors || []).map((c) => ({ name: c.name, type: c.type, side: c.side })),
      // Connectors the slot does not ask for. An atom that carries some is usually a different kind of part.
      extra_connectors: req.connectors?.length
        ? (a.meta.connectors || []).filter((c) => !req.connectors.some((r) => r.type === c?.type && r.side === c?.side)).map((c) => ({ name: c.name, type: c.type, side: c.side }))
        : [],
      failed_rules: e.failed,
      rules: e.rules,
      _passed: e.passed,
    };
  });
  const strip = ({ _passed, ...r }) => r;
  const fits = rows.filter((r) => r.failed_rules.length === 0 && r._passed > 0).sort((a, b) => a.asset_id.localeCompare(b.asset_id));
  const near = rows
    .filter((r) => r.failed_rules.length > 0 && r.failed_rules.length <= 2 && r._passed > 0)
    .sort((a, b) => a.failed_rules.length - b.failed_rules.length || b._passed - a._passed || a.asset_id.localeCompare(b.asset_id));
  return { fits: fits.slice(0, limit).map(strip), near_matches: near.slice(0, limit).map(strip), library_size: atoms.length };
}

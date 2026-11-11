import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VALIDATOR_DIR = path.resolve(HERE, '..');
export const REPO_ROOT = path.resolve(VALIDATOR_DIR, '..');

export const normClass = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadProfile(profilePath) {
  const file = profilePath ? path.resolve(profilePath) : path.join(VALIDATOR_DIR, 'profile-1.json');
  const p = readJson(file);
  let budgets = p.budgets;
  let budgetSource = `${file} (budgets)`;
  if (!budgets) {
    const specFile = path.join(REPO_ROOT, 'spec', 'spec.json');
    const spec = readJson(specFile);
    budgets = {};
    for (const b of spec.profile.budgets) budgets[normClass(b.class)] = b.triangles;
    budgetSource = `${specFile} (profile.budgets)`;
  } else {
    budgets = Object.fromEntries(Object.entries(budgets).map(([k, v]) => [normClass(k), v]));
  }
  // The asset spec's version comes from spec/spec.json, so the report cannot fall behind the docs.
  let specVersion = p.spec_version;
  try {
    const v = readJson(path.join(REPO_ROOT, 'spec', 'spec.json')).layers.find((l) => l.id === 'contract').version;
    if (typeof v === 'string') specVersion = v.replace(/^v/, '');
  } catch { /* keep the profile's own value */ }
  return { ...p, spec_version: specVersion, budgets, budget_source: budgetSource, file };
}

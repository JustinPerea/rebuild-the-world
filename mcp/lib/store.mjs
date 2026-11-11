// The repo is the database: tasks/*.json, tasks/claims/*.json, assets/<category>/<id>/.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJsonAtomic, listDirs, isObj, TASK_ID_RE, parseDuration, iso } from './util.mjs';

export const ACTIVE = ['Claimed', 'In review', 'Changes requested'];
export const SIZES = ['S', 'M', 'L'];
export const TRUST_CAPS = [
  { objects: 1, review: 2 },
  { objects: 2, review: 2 },
  { objects: 3, review: 4 },
  { objects: 5, review: Infinity },
];
const COOLDOWN_MS = 24 * 3600000;

export class Store {
  constructor({ repo, handle, workspace, trust }) {
    this.repo = repo;
    this.handle = handle;
    this.workspace = workspace;
    this.trust = trust;
    this.tasksDir = path.join(repo, 'tasks');
    this.claimsDir = path.join(repo, 'tasks', 'claims');
    this.assetsDir = path.join(repo, 'assets');
    this.feedbackDir = path.join(repo, 'feedback');
  }

  spec() {
    const r = readJson(path.join(this.repo, 'spec', 'spec.json'));
    if (r.error) throw new Error(`cannot read spec/spec.json in the repo: ${r.error}`);
    return r.value;
  }

  windowFor(size) {
    const row = (this.spec().task_sizes || []).find((s) => s.size === size);
    if (!row) return null;
    return { size, what: row.what, window: row.window, window_ms: parseDuration(row.window), warning: row.warning, extension: row.extension };
  }

  // The three versions a claim pins: asset spec, capability profile, style guide.
  pins() {
    const layers = this.spec().layers || [];
    const pick = (id) => layers.find((l) => l.id === id);
    const out = {};
    for (const [key, id] of [['spec', 'contract'], ['profile', 'profile'], ['style', 'look']]) {
      const l = pick(id);
      if (l) out[key] = { layer: id, doc: l.doc, version: l.version };
    }
    return out;
  }

  // ---- tasks ----
  normaliseTask(raw, fileId) {
    const t = { ...raw };
    const warnings = [];
    if (t.task_id !== fileId) return { error: `task_id "${t.task_id}" does not match the file name "${fileId}.json"` };
    if (!SIZES.includes(t.size)) return { error: `size must be S, M or L, got ${JSON.stringify(t.size)}` };
    const idForCat = t.object_id || t.asset_id || '';
    t.category = t.category || idForCat.split('_')[0] || null;
    t.title = t.title || t.asset_id || t.object_id || t.task_id;
    t.region = t.region || 'universal';
    t.min_trust_level = Number.isInteger(t.min_trust_level) ? t.min_trust_level : 0;
    t.required_connectors = Array.isArray(t.required_connectors) ? t.required_connectors : [];
    t.reference_pack = Array.isArray(t.reference_pack) ? t.reference_pack : [];
    t.depends_on = Array.isArray(t.depends_on) ? t.depends_on : [];
    if (!t.description) warnings.push('no description');
    if (!Array.isArray(t.dimensions_m)) warnings.push('no dimensions_m');
    if (t.state !== undefined && !this.spec().task_states.includes(t.state)) return { error: `state ${JSON.stringify(t.state)} is not one of ${this.spec().task_states.join(', ')}` };
    return { task: t, warnings };
  }

  listTasks() {
    const tasks = [];
    const problems = [];
    let names = [];
    try {
      names = fs.readdirSync(this.tasksDir).filter((n) => n.endsWith('.json') && n !== 'task.example.json').sort();
    } catch {
      /* no tasks folder yet */
    }
    for (const n of names) {
      const id = n.slice(0, -5);
      const r = readJson(path.join(this.tasksDir, n));
      if (r.error || !isObj(r.value)) {
        problems.push({ file: `tasks/${n}`, problem: r.error || 'not a JSON object' });
        continue;
      }
      const t = this.normaliseTask(r.value, id);
      if (t.error) problems.push({ file: `tasks/${n}`, problem: t.error });
      else tasks.push(t.task);
    }
    return { tasks, problems };
  }

  getTask(id) {
    if (!TASK_ID_RE.test(id) || id === 'task.example') return { error: `"${id}" is not a valid task id` };
    const file = path.join(this.tasksDir, `${id}.json`);
    const r = readJson(file);
    if (r.error) return { error: `no task "${id}" (tasks/${id}.json: ${r.error})` };
    if (!isObj(r.value)) return { error: `tasks/${id}.json is not a JSON object` };
    const t = this.normaliseTask(r.value, id);
    return t.error ? { error: `tasks/${id}.json: ${t.error}` } : { task: t.task, warnings: t.warnings };
  }

  // ---- claims ----
  claimFile(id) {
    return path.join(this.claimsDir, `${id}.json`);
  }

  getClaim(id) {
    const r = readJson(this.claimFile(id));
    return r.error ? null : r.value;
  }

  listClaims() {
    let names = [];
    try {
      names = fs.readdirSync(this.claimsDir).filter((n) => n.endsWith('.json')).sort();
    } catch {
      return [];
    }
    return names.map((n) => readJson(path.join(this.claimsDir, n)).value).filter((c) => isObj(c) && c.task_id);
  }

  writeClaim(claim) {
    writeJsonAtomic(this.claimFile(claim.task_id), claim);
  }

  // The state a task is in right now, from its file and its claim.
  stateOf(task, claim, now = Date.now(), depth = 0) {
    if (claim && ACTIVE.includes(claim.state)) {
      const expiring = claim.state === 'Claimed' || claim.state === 'Changes requested';
      if (expiring && Date.parse(claim.expires_at) <= now) return { state: 'Open', expired_claim: true };
      return { state: claim.state, builder: claim.handle, expires_at: claim.expires_at };
    }
    if (claim && claim.state === 'Merged') return { state: 'Merged' };
    const base = task.state || 'Open';
    if (base === 'Open' && task.depends_on.length && depth < 8) {
      const open = task.depends_on.filter((d) => {
        const dt = this.getTask(d);
        if (dt.error) return true;
        return this.stateOf(dt.task, this.getClaim(d), now, depth + 1).state !== 'Merged';
      });
      if (open.length) return { state: 'Locked', waiting_on: open };
    }
    return { state: base };
  }

  activeClaimsOf(handle, now = Date.now()) {
    return this.listClaims().filter((c) => c.handle === handle && ACTIVE.includes(c.state) && !((c.state === 'Claimed' || c.state === 'Changes requested') && Date.parse(c.expires_at) <= now));
  }

  inProgressTaskIds() {
    return new Set(this.listClaims().filter((c) => ACTIVE.includes(c.state)).map((c) => c.task_id));
  }

  // ---- objects ----
  findObjectDir(objectId) {
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(objectId)) return null;
    const first = path.join(this.assetsDir, objectId.split('_')[0], objectId);
    if (fs.existsSync(path.join(first, 'blueprint.json'))) return first;
    for (const cat of listDirs(this.assetsDir)) {
      const d = path.join(this.assetsDir, cat, objectId);
      if (fs.existsSync(path.join(d, 'blueprint.json'))) return d;
    }
    return null;
  }

  getBlueprint(objectId) {
    const dir = this.findObjectDir(objectId);
    if (!dir) return { error: `no blueprint found at assets/<category>/${objectId}/blueprint.json` };
    const r = readJson(path.join(dir, 'blueprint.json'));
    return r.error ? { error: `blueprint.json for ${objectId}: ${r.error}` } : { blueprint: r.value };
  }

  cooldownLeft(task, handle, now = Date.now()) {
    const c = this.getClaim(task.task_id);
    if (!c || c.handle !== handle || c.state !== 'Claimed') return 0;
    const exp = Date.parse(c.expires_at);
    if (exp > now) return 0;
    return Math.max(0, exp + COOLDOWN_MS - now);
  }

  historyEntryFor(claim, now) {
    if (!claim) return [];
    const prior = Array.isArray(claim.history) ? claim.history : [];
    const reason = claim.state === 'Released' ? 'released' : claim.state === 'Claimed' || claim.state === 'Changes requested' ? 'expired' : claim.state;
    return [...prior, { handle: claim.handle, claimed_at: claim.claimed_at, ended_at: claim.released_at || iso(now), end_reason: reason }];
  }
}

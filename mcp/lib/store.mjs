// The repo is the database: tasks/*.json, tasks/claims/*.json, assets/<category>/<id>/.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJsonAtomic, listDirs, isObj, TASK_ID_RE, HANDLE_RE, ASSET_ID_RE, VERSION_RE, DOC_PATH_RE, isIsoDate, parseDuration, iso } from './util.mjs';

export const ACTIVE = ['Claimed', 'In review', 'Changes requested'];
export const SIZES = ['S', 'M', 'L'];
export const TRUST_CAPS = [
  { objects: 1, review: 1 },
  { objects: 3, review: 3 },
  { objects: 10, review: 10 },
  { objects: 20, review: Infinity },
];
const COOLDOWN_MS = 24 * 3600000;
export const CLAIM_STATES = [...ACTIVE, 'Merged', 'Released'];

// A claim file is written by this server, but it sits in the repo and can arrive in a pull request.
// Every field that a tool repeats outside "data" must have the shape the server writes.
export function claimProblem(c, fileId) {
  if (!isObj(c)) return 'not a JSON object';
  if (c.task_id !== fileId) return 'task_id does not match the file name';
  if (typeof c.handle !== 'string' || !HANDLE_RE.test(c.handle)) return 'handle is not a valid handle';
  if (!CLAIM_STATES.includes(c.state)) return 'state is not a claim state';
  if (c.expires_at != null && !isIsoDate(c.expires_at)) return 'expires_at is not an ISO date';
  if (ACTIVE.includes(c.state) && !isIsoDate(c.expires_at)) return 'an active claim needs expires_at';
  if (c.bundle != null && (typeof c.bundle !== 'string' || !TASK_ID_RE.test(c.bundle))) return 'bundle is not a task id';
  const branchOwner = c.bundle != null ? c.bundle : fileId;
  if (c.branch != null && c.branch !== `claim/${branchOwner}`) return c.bundle != null ? 'branch is not claim/<bundle>' : 'branch is not claim/<task_id>';
  if (c.versions != null) {
    if (!isObj(c.versions)) return 'versions is not an object';
    for (const [key, pin] of Object.entries(c.versions)) {
      if (!ASSET_ID_RE.test(key) || !isObj(pin)) return 'versions has a malformed entry';
      if (typeof pin.layer !== 'string' || !ASSET_ID_RE.test(pin.layer)) return 'versions has a malformed layer';
      if (typeof pin.version !== 'string' || !VERSION_RE.test(pin.version)) return 'versions has a malformed version';
      if (pin.doc != null && (typeof pin.doc !== 'string' || !DOC_PATH_RE.test(pin.doc))) return 'versions has a malformed doc path';
    }
  }
  return null;
}

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
  // A task file is contributor-written. The fields a tool may repeat outside "data" (ids, slot,
  // category, depends_on) must be plain names, and no error text here quotes the file.
  normaliseTask(raw, fileId) {
    const t = { ...raw };
    const warnings = [];
    if (t.task_id !== fileId) return { error: `task_id does not match the file name "${fileId}.json"` };
    if (!SIZES.includes(t.size)) return { error: 'size must be S, M or L' };
    for (const field of ['asset_id', 'object_id', 'slot', 'category']) {
      if (t[field] == null) continue;
      if (typeof t[field] !== 'string' || !ASSET_ID_RE.test(t[field])) return { error: `${field} must be lower case words joined by underscores, 64 characters at most` };
    }
    const idForCat = t.object_id || t.asset_id || '';
    t.category = t.category || idForCat.split('_')[0] || null;
    t.title = t.title || t.asset_id || t.object_id || t.task_id;
    t.region = t.region || 'universal';
    t.min_trust_level = Number.isInteger(t.min_trust_level) ? t.min_trust_level : 0;
    t.required_connectors = Array.isArray(t.required_connectors) ? t.required_connectors : [];
    t.reference_pack = Array.isArray(t.reference_pack) ? t.reference_pack : [];
    if (t.depends_on != null && !(Array.isArray(t.depends_on) && t.depends_on.every((d) => typeof d === 'string' && TASK_ID_RE.test(d)))) return { error: 'depends_on must be a list of task ids' };
    t.depends_on = t.depends_on || [];
    if (!t.description) warnings.push('no description');
    if (!Array.isArray(t.dimensions_m)) warnings.push('no dimensions_m');
    if (t.state !== undefined && !this.spec().task_states.includes(t.state)) return { error: `state must be one of ${this.spec().task_states.join(', ')}` };
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
    if (typeof id !== 'string' || !TASK_ID_RE.test(id) || id === 'task.example') return { error: 'that is not a valid task id' };
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

  // null when there is no claim file. A file that is present but malformed comes back as
  // { invalid: true }: it blocks the task and none of its values are passed on.
  getClaim(id) {
    if (typeof id !== 'string' || !TASK_ID_RE.test(id)) return null;
    const r = readJson(this.claimFile(id));
    if (r.error === 'file not found') return null;
    const problem = r.error || claimProblem(r.value, id);
    if (problem) return { task_id: id, invalid: true, problem };
    // Claim files are local to each clone. Once a maintainer marks the task Merged in its task file,
    // a claim still waiting for review here is finished, and it stops counting against the builder's limits.
    if (ACTIVE.includes(r.value.state)) {
      const t = readJson(path.join(this.tasksDir, `${id}.json`));
      if (isObj(t.value) && t.value.state === 'Merged') return { ...r.value, state: 'Merged', merged_in_task_file: true };
    }
    return r.value;
  }

  listClaims() {
    let names = [];
    try {
      names = fs.readdirSync(this.claimsDir).filter((n) => n.endsWith('.json')).sort();
    } catch {
      return [];
    }
    return names.map((n) => this.getClaim(n.slice(0, -5))).filter((c) => c && !c.invalid);
  }

  writeClaim(claim) {
    writeJsonAtomic(this.claimFile(claim.task_id), claim);
  }

  // The state a task is in right now, from its file and its claim.
  stateOf(task, claim, now = Date.now(), depth = 0) {
    if (claim && claim.invalid) return { state: 'Locked', claim_invalid: true };
    if (claim && ACTIVE.includes(claim.state) && this.bundleLapsed(claim, now)) return { state: 'Open', expired_claim: true };
    if (claim && ACTIVE.includes(claim.state)) {
      const expiring = claim.state === 'Claimed' || claim.state === 'Changes requested';
      if (expiring && Date.parse(claim.expires_at) <= now) return { state: 'Open', expired_claim: true };
      return { state: claim.state, builder: claim.handle, expires_at: claim.expires_at };
    }
    if (claim && claim.state === 'Merged') return { state: 'Merged' };
    const base = task.state || 'Open';
    // An object task (one with depends_on) opens when no member is Locked or unreadable. Members
    // that are unmerged, claimed or in review do not hold it: claiming the object reserves them.
    if (base === 'Open' && task.depends_on.length && depth < 8) {
      const stuck = task.depends_on.filter((d) => {
        const dt = this.getTask(d);
        if (dt.error) return true;
        return this.stateOf(dt.task, this.getClaim(d), now, depth + 1).state === 'Locked';
      });
      if (stuck.length) return { state: 'Locked', waiting_on: stuck };
    }
    return { state: base };
  }

  activeClaimsOf(handle, now = Date.now()) {
    return this.listClaims().filter((c) => c.handle === handle && ACTIVE.includes(c.state) && !((c.state === 'Claimed' || c.state === 'Changes requested') && Date.parse(c.expires_at) <= now) && !this.bundleLapsed(c, now));
  }

  // A member claim lives only as long as the object claim it was reserved under. Once that claim has
  // expired, been released or passed to another builder, the member is Open again, In review or not:
  // an atom of a bundle is in review only through the bundle's one pull request.
  bundleLapsed(c, now = Date.now()) {
    if (!c.bundle || c.bundle === c.task_id) return false;
    const o = this.getClaim(c.bundle);
    if (!o) return true;
    if (o.invalid) return false;
    if (o.handle !== c.handle || o.bundle !== c.bundle || o.state === 'Released') return true;
    return (o.state === 'Claimed' || o.state === 'Changes requested') && Date.parse(o.expires_at) <= now;
  }

  // Every task under an object task: its members, and the members of a member that is itself an object.
  memberIds(task, depth = 0, seen = new Set()) {
    for (const d of task.depends_on || []) {
      if (seen.has(d)) continue;
      seen.add(d);
      const dt = this.getTask(d);
      if (!dt.error && depth < 8) this.memberIds(dt.task, depth + 1, seen);
    }
    return depth ? null : [...seen].filter((d) => d !== task.task_id);
  }

  // A member of a bundle whose object claim is still being worked on does not count as awaiting review.
  isOpenBundleMember(c) {
    if (!c.bundle || c.bundle === c.task_id) return false;
    const o = this.getClaim(c.bundle);
    return !!o && !o.invalid && (o.state === 'Claimed' || o.state === 'Changes requested');
  }

  // Distinct objects the handle is building now: active claims still Claimed or Changes requested.
  objectsHeld(handle, now = Date.now()) {
    return new Set(this.activeClaimsOf(handle, now).filter((c) => c.state === 'Claimed' || c.state === 'Changes requested').map((c) => c.object_id || c.task_id));
  }

  // Distinct objects the handle has awaiting review.
  objectsInReview(handle) {
    return new Set(this.listClaims().filter((c) => c.handle === handle && c.state === 'In review' && !this.isOpenBundleMember(c) && !this.bundleLapsed(c)).map((c) => c.object_id || c.task_id));
  }

  inProgressTaskIds() {
    return new Set(this.listClaims().filter((c) => ACTIVE.includes(c.state)).map((c) => c.task_id));
  }

  // ---- objects ----
  findObjectDir(objectId) {
    if (typeof objectId !== 'string' || !ASSET_ID_RE.test(objectId)) return null;
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
    if (!dir) return { error: 'no blueprint.json found for that object_id under assets/<category>/<object_id>/' };
    const r = readJson(path.join(dir, 'blueprint.json'));
    if (r.error) return { error: `blueprint.json for ${objectId}: ${r.error}` };
    return isObj(r.value) ? { blueprint: r.value } : { error: `blueprint.json for ${objectId} is not a JSON object` };
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

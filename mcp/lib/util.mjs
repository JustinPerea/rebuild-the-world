// Small helpers shared by the server modules. No dependencies.
import fs from 'node:fs';
import path from 'node:path';

export const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
export const HANDLE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,38}$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function readJson(file) {
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: e.code === 'ENOENT' ? 'file not found' : e.message };
  }
}

// Write JSON through a temp file in the same folder, then rename, so a reader never sees half a file.
export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

export function isInside(root, target) {
  const rel = path.relative(root, target);
  if (rel === '') return true;
  if (path.isAbsolute(rel)) return false;
  return rel !== '..' && !rel.startsWith(`..${path.sep}`);
}

// Resolve through symlinks when the path exists, so a link cannot lead out of a root.
export function realish(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

export const toPosix = (p) => p.split(path.sep).join('/');
export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    return [];
  }
}

export const iso = (ms) => new Date(ms).toISOString();

export function humanDuration(ms) {
  if (ms <= 0) return '0 minutes';
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts = [];
  if (d) parts.push(`${d} day${d === 1 ? '' : 's'}`);
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (!d && m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  return parts.join(' ') || 'under a minute';
}

// "48 hours", "5 days", "+24 hours" -> milliseconds. Returns null when the text is not a duration.
export function parseDuration(text) {
  const m = /(\d+(?:\.\d+)?)\s*(hour|day)/i.exec(String(text ?? ''));
  if (!m) return null;
  return Number(m[1]) * (m[2].toLowerCase() === 'hour' ? 3600000 : 86400000);
}

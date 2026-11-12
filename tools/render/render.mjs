#!/usr/bin/env node
// Renders one asset in the standard scene: node tools/render/render.mjs <asset folder> [options]
//
//   --light overcast|sun   the neutral sky (default) or the clear-sun variant
//   --views a,b,...        any of front, back, left, right, three_quarter, close (default: all six)
//   --size N               pixels on a side, 64 to 2048 (default 1024)
//   --out DIR              where the PNG files go (default: the asset's preview/ folder)
//   --library DIR          the library a molecule's atoms are resolved in (default: assets/)
//   --blender PATH         the Blender to run (default: $BLENDER, then "blender" on the PATH)
//
// An atom is rendered alone. A molecule is rendered with every atom where the validator's
// analysis places it; a molecule that does not assemble is not rendered.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placements } from './placements.mjs';

export const VIEWS = ['front', 'back', 'left', 'right', 'three_quarter', 'close'];
export const BLENDER_SERIES = '5.0';   // the pinned renderer: pictures from another series are not comparable

const here = path.dirname(fileURLToPath(import.meta.url));
const fail = (msg) => { console.error(msg); process.exit(2); };

export function parseArgs(argv) {
  const o = { light: 'overcast', views: VIEWS, size: 1024 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--light') o.light = val();
    else if (a === '--views') o.views = val().split(',').filter(Boolean);
    else if (a === '--size') o.size = Number(val());
    else if (a === '--out') o.out = val();
    else if (a === '--library') o.library = val();
    else if (a === '--blender') o.blender = val();
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else rest.push(a);
  }
  if (rest.length !== 1) throw new Error('give one asset folder');
  if (!['overcast', 'sun'].includes(o.light)) throw new Error('--light is overcast or sun');
  if (!o.views.length || o.views.some((v) => !VIEWS.includes(v))) throw new Error(`--views takes ${VIEWS.join(', ')}`);
  if (!Number.isInteger(o.size) || o.size < 64 || o.size > 2048) throw new Error('--size is a whole number from 64 to 2048');
  o.dir = rest[0];
  return o;
}

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { fail(`${e.message}\nusage: node tools/render/render.mjs <asset folder> [--light overcast|sun] [--views a,b] [--size N] [--out DIR] [--library DIR] [--blender PATH]`); }
  const p = placements(o.dir, { library: o.library });
  if (p.error) fail(p.error);
  const out = path.resolve(o.out || path.join(o.dir, 'preview'));
  // An asset folder arrives in a pull request. A preview folder or picture that is a link would send the render somewhere else.
  const isLink = (f) => { try { return fs.lstatSync(f).isSymbolicLink(); } catch { return false; } };
  if (isLink(out)) fail(`${out} is a link, not a folder; remove it and run again`);
  const blender = o.blender || process.env.BLENDER || 'blender';
  const ver = spawnSync(blender, ['--version'], { encoding: 'utf8' });
  if (ver.error || ver.status !== 0) fail(`could not run Blender as "${blender}". Install Blender ${BLENDER_SERIES}, or give its path with --blender or the BLENDER environment variable.`);
  const found = (ver.stdout.match(/Blender (\d+\.\d+)/) || [])[1];
  if (found !== BLENDER_SERIES) console.error(`warning: this is Blender ${found}; the standard scene is pinned to ${BLENDER_SERIES}, so these pictures may differ from the reviewer's`);

  fs.mkdirSync(out, { recursive: true });
  const prefix = o.light === 'sun' ? 'sun_' : '';
  const files = o.views.map((v) => path.join(out, `${prefix}${v}.png`));
  // Remove what an earlier run left, links included, so every file reported below was written by this run.
  for (const f of files) fs.rmSync(f, { force: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rtw-render-'));
  const job = path.join(tmp, 'job.json');
  // Forward slashes: Blender takes them on every system.
  const fwd = (f) => f.split(path.sep).join('/');
  let r;
  try {
  fs.writeFileSync(job, JSON.stringify({ meshes: p.meshes.map((m) => ({ glb: fwd(m.glb), matrix: m.matrix })), views: o.views, light: o.light, size: o.size, out: fwd(out), prefix }));
  r = spawnSync(blender, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', path.join(here, 'scene.py'), '--', job], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (r.error) fail(`Blender could not be run to the end: ${r.error.message}`);
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('RENDERED '));
  if (r.status !== 0 || !line) fail(`Blender did not finish the render.\n${(r.stderr || '').trim().split('\n').slice(-8).join('\n')}\n${(r.stdout || '').trim().split('\n').slice(-8).join('\n')}`);
  const info = JSON.parse(line.slice('RENDERED '.length));
  const missing = files.filter((f) => !fs.existsSync(f));
  if (missing.length) fail(`Blender reported success but did not write ${missing.map((f) => path.basename(f)).join(', ')}`);
  console.log(JSON.stringify({ asset: p.asset_id, kind: p.kind, meshes: p.meshes.length, light: o.light, size_px: o.size, measured_m: info.size_m, blender: info.blender, scene_settings: info.settings, files: files.map((f) => fwd(path.relative(process.cwd(), f))) }, null, 1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

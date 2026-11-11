#!/usr/bin/env node
import fs from 'node:fs';
import { validate, formatHuman } from './validate.mjs';

const USAGE = 'usage: node validator/cli.mjs <asset-folder> [--json] [--registry <path>] [--library <dir>] [--task <task.json>] [--profile <path>]';

function parseArgs(argv) {
  const o = { json: false, dir: null };
  const valued = { '--registry': 'registry', '--library': 'library', '--task': 'task', '--profile': 'profile' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (valued[a]) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      o[valued[a]] = argv[++i];
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (o.dir === null) o.dir = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return o;
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(USAGE); process.exit(0); }
  if (!opts.dir) throw new Error('missing <asset-folder>');
  if (!fs.existsSync(opts.dir) || !fs.statSync(opts.dir).isDirectory()) throw new Error(`${opts.dir} is not a folder`);
  if (opts.task) {
    try { opts.task = JSON.parse(fs.readFileSync(opts.task, 'utf8')); } catch (e) { throw new Error(`cannot read task file: ${e.message}`); }
  }
  for (const k of ['registry', 'profile']) {
    if (opts[k] && !fs.existsSync(opts[k])) throw new Error(`${k} file ${opts[k]} does not exist`);
  }
} catch (e) {
  console.error(`error: ${e.message}\n${USAGE}`);
  process.exit(2);
}

try {
  const report = await validate(opts.dir, opts);
  console.log(opts.json ? JSON.stringify(report, null, 2) : formatHuman(report));
  process.exit(report.summary.ok ? 0 : 1);
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpDir, rmrf, writeRegistry, validAtom } from './helpers.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'cli.mjs');
let root, registry, lib;
before(() => { root = tmpDir(); registry = writeRegistry(root); lib = path.join(root, 'lib'); fs.mkdirSync(lib); });
after(() => rmrf(root));
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('exit 0 for a valid asset, with --json shape', () => {
  const dir = validAtom(lib, 'prop_box_01');
  const r = cli(dir, '--json', '--registry', registry, '--library', lib);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(j), ['asset', 'kind', 'spec_version', 'profile', 'checks', 'summary']);
  assert.equal(j.checks.length, 18);
  assert.deepEqual(Object.keys(j.checks[0]), ['name', 'status', 'source', 'messages']);
  assert.equal(j.summary.ok, true);
});

test('exit 1 for a broken asset, and the human output names the failure', () => {
  const dir = validAtom(lib, 'prop_box_02', { meta: { triangles: 999 } });
  const r = cli(dir, '--registry', registry, '--library', lib);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL\s+Metadata/);
  assert.match(r.stdout, /triangles is 999 but the mesh has 12/);
});

test('exit 2 on usage errors', () => {
  assert.equal(cli().status, 2);
  assert.equal(cli(path.join(root, 'nope')).status, 2);
  assert.equal(cli(root, '--bogus').status, 2);
  assert.equal(cli(root, '--task').status, 2);
});

test('--task is read from a file', () => {
  const dir = validAtom(lib, 'prop_box_03');
  const t = path.join(root, 'task.json');
  fs.writeFileSync(t, JSON.stringify({ dimensions_m: [2, 2, 2] }));
  const r = cli(dir, '--json', '--registry', registry, '--library', lib, '--task', t);
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).checks.find((c) => c.name === 'Scale').status, 'FAIL');
});

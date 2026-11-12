import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { placements } from '../placements.mjs';
import { parseArgs, VIEWS } from '../render.mjs';
import { loadAssetDir, loadGlb } from '../../../validator/lib/context.mjs';
import { loadProfile } from '../../../validator/lib/profile.mjs';
import { loadRegistry } from '../../../validator/lib/registry.mjs';
import { analyzeMolecule, moleculeBounds } from '../../../validator/lib/library.mjs';
import { collectGeometry } from '../../../validator/lib/glb.mjs';
import { visiblePrims, usedVertices } from '../../../validator/lib/geom.mjs';
import { point } from '../../../validator/lib/math.mjs';
import { tmpDir, rmrf, writeRegistry, validAtom, writeMolecule, conn } from '../../../validator/test/helpers.mjs';

let root, registry, n = 0;
before(() => { root = tmpDir('rtw-render-'); registry = writeRegistry(root); });
after(() => rmrf(root));
const newLib = () => { const d = path.join(root, `lib${n++}`); fs.mkdirSync(d); return d; };

function bodyDoor(lib, doorMeta = {}) {
  validAtom(lib, 'veh_body_01', { glb: { connectors: [conn('conn_door_hinge_a_01', [0.5, 0, 0], 90), conn('conn_door_hinge_a_02', [0.5, 0.3, 0], 90)] } });
  validAtom(lib, 'veh_door_01', { glb: { connectors: [conn('conn_door_hinge_b_01', [-0.5, 0, 0], -90), conn('conn_door_hinge_b_02', [-0.5, 0.3, 0], -90)] }, meta: doorMeta });
}
const manifest = (door = {}) => ({
  origin: { ref: 'body', offset_m: [0, 0.31, 0] },
  atoms: [{ ref: 'body', asset: 'veh_body_01@1.0.0' }, { ref: 'door', asset: 'veh_door_01@1.0.0', ...door }],
  joints: [{ a: 'body:conn_door_hinge_a_01', b: 'door:conn_door_hinge_b_01' }, { a: 'body:conn_door_hinge_a_02', b: 'door:conn_door_hinge_b_02' }],
});

// The box around every vertex of every placed mesh, from the renderer's list alone.
function boxOf(meshes) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    for (const p of visiblePrims(collectGeometry(loadGlb(m.glb).doc).prims)) {
      for (const v of usedVertices(p)) {
        const q = point(m.matrix, [p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]]);
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], q[k]); max[k] = Math.max(max[k], q[k]); }
      }
    }
  }
  return { min, max };
}
function validatorBox(dir, lib) {
  const asset = loadAssetDir(dir);
  const ctx = { dir, asset, profile: loadProfile(), registry: loadRegistry(registry), task: null, libDir: lib };
  return moleculeBounds(analyzeMolecule(dir, asset.manifest, asset.meta, ctx));
}
const det3 = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

test('an atom is one mesh at the origin', () => {
  const lib = newLib();
  const dir = validAtom(lib, 'prop_box_01');
  const p = placements(dir, { registry, library: lib });
  assert.equal(p.kind, 'atom');
  assert.equal(p.meshes.length, 1);
  assert.deepEqual(p.meshes[0].matrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
});

test('a molecule is rendered where the validator places it: same bounding box, plain, scaled, stretched and mirrored', () => {
  const one = (m) => ({ ...m, joints: m.joints.slice(0, 1) });
  const cases = [
    ['plain', manifest(), {}, null],
    ['scaled', one(manifest({ scale: 1.2 })), { variation: { scale: [0.8, 1.3] } }, (m) => Math.abs(m[5] - 1.2) < 1e-9],
    ['stretched', one(manifest({ scale: [1, 1.5, 1] })), { variation: { scale: { y: [1, 2] } } }, (m) => Math.abs(Math.hypot(m[4], m[5], m[6]) - 1.5) < 1e-9 && Math.abs(Math.hypot(m[0], m[1], m[2]) - 1) < 1e-9],
    ['mirrored', manifest({ mirror: true }), { mirror_safe: true }, (m) => det3(m) < 0],
  ];
  for (const [name, m, doorMeta, holds] of cases) {
    const lib = newLib();
    bodyDoor(lib, doorMeta);
    const dir = writeMolecule(lib, 'veh_sedan_01', m, { library: 'test' });
    const p = placements(dir, { registry, library: lib });
    assert.equal(p.error, undefined, `${name}: ${p.error}`);
    assert.equal(p.meshes.length, 2);
    const mine = boxOf(p.meshes), theirs = validatorBox(dir, lib);
    assert.ok(close(mine.min, theirs.min) && close(mine.max, theirs.max), `${name}: ${JSON.stringify(mine)} vs ${JSON.stringify(theirs)}`);
    if (holds) assert.ok(holds(p.meshes[1].matrix), `${name}: the matrix carries it`);
  }
});

test('a model that names a file outside itself is refused, alone and inside a molecule', () => {
  const lib = newLib();
  const outside = (json) => { json.images = [{ uri: '../secret.png' }]; };
  const dir = validAtom(lib, 'prop_box_01', { glb: { mutate: outside } });
  assert.match(placements(dir, { registry, library: lib }).error, /names a file outside itself/);
  validAtom(lib, 'veh_body_01', { glb: { connectors: [conn('conn_door_hinge_a_01', [0.5, 0, 0], 90), conn('conn_door_hinge_a_02', [0.5, 0.3, 0], 90)] } });
  validAtom(lib, 'veh_door_01', { glb: { mutate: outside, connectors: [conn('conn_door_hinge_b_01', [-0.5, 0, 0], -90), conn('conn_door_hinge_b_02', [-0.5, 0.3, 0], -90)] } });
  const mol = writeMolecule(lib, 'veh_sedan_01', manifest(), { library: 'test' });
  assert.match(placements(mol, { registry, library: lib }).error, /veh_door_01.*names a file outside itself/);
});

test('a molecule that does not assemble is refused, and so is a folder with nothing to render', () => {
  const lib = newLib();
  bodyDoor(lib);
  const m = manifest();
  m.atoms.push({ ref: 'loose', asset: 'veh_door_01@1.0.0' });
  const dir = writeMolecule(lib, 'veh_sedan_01', m, { library: 'test' });
  assert.match(placements(dir, { registry, library: lib }).error, /does not assemble/);
  const empty = path.join(lib, 'veh', 'veh_none_01');
  fs.mkdirSync(empty, { recursive: true });
  assert.match(placements(empty, { registry, library: lib }).error, /nothing to render/);
});

test('arguments: defaults, and what is refused', () => {
  const o = parseArgs(['assets/bld/x']);
  assert.deepEqual([o.light, o.views, o.size, o.dir], ['overcast', VIEWS, 1024, 'assets/bld/x']);
  assert.deepEqual(parseArgs(['x', '--views', 'front,close', '--light', 'sun', '--size', '512']).views, ['front', 'close']);
  for (const bad of [[], ['a', 'b'], ['x', '--light', 'noon'], ['x', '--views', 'top'], ['x', '--size', '4096'], ['x', '--size'], ['x', '--nope']]) assert.throws(() => parseArgs(bad));
});

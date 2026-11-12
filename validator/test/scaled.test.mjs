// Scaled connectors (asset spec v0.6): a placed atom may be scaled per axis, and its connectors and
// mating sizes scale with it. These use the real registry, so mating_axes is tested as shipped.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validate } from '../validate.mjs';
import { REPO_ROOT } from '../lib/profile.mjs';
import { loadRegistry } from '../lib/registry.mjs';
import { tmpDir, rmrf, writeRegistry, boxMesh, validAtom, writeMolecule, conn, connMeta, status } from './helpers.mjs';

const REGISTRY = path.join(REPO_ROOT, 'registry', 'connectors.json');
let root, n = 0;
before(() => { root = tmpDir(); });
after(() => rmrf(root));

const newLib = () => { const d = path.join(root, `lib${n++}`); fs.mkdirSync(d); return d; };
const failing = (r, name, ...needles) => {
  const c = status(r, name);
  assert.equal(c.status, 'FAIL', `${name} should fail, got ${c.status}: ${c.messages.join(' | ')}`);
  const text = c.messages.join('\n');
  for (const s of needles) assert.ok(text.includes(s), `${name} should mention "${s}", got:\n${text}`);
};
const passing = (r, name) => assert.equal(status(r, name).status, 'PASS', `${name}: ${status(r, name).messages.join(' | ')}`);
const run = (dir, lib, registry = REGISTRY) => validate(dir, { registry, library: lib });

const FACADE = { storey_height: 2.8, wall_thickness: 0.15 };
// storey_stack a: +Z up, +Y out of the facade (the atom's +Z). b: +Z down, same +Y. Column-major, X = Y cross Z.
const STACK_A = (y) => [-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, y, 0, 1];
const STACK_B = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];

// A facade module as the task describes it: x from 0 to w, y from 0 to 2.8, z from -0.15 to 0.
function panel(lib, id, { w = 1, variation } = {}) {
  const connectors = [
    conn('conn_facade_edge_a_01', [w, 0, 0], 90),
    conn('conn_facade_edge_b_01', [0, 0, 0], -90),
    conn('conn_storey_stack_a_01', [0, 2.8, 0], 0, { matrix: STACK_A(2.8) }),
    conn('conn_storey_stack_b_01', [0, 0, 0], 0, { matrix: STACK_B }),
  ];
  const mating = (name) => (name.includes('facade_edge') ? FACADE : { module_width: w, wall_thickness: 0.15 });
  return validAtom(lib, id, {
    glb: { connectors, mesh: boxMesh(w, 2.8, 0.15, [w / 2, 1.4, -0.075]) },
    meta: { connectors: connectors.map((c) => connMeta(c.name, { mating: mating(c.name) })), ...(variation ? { variation } : {}) },
  });
}
// A corner post: b takes a wall running along +x, a sends the next wall along +z.
function post(lib, id) {
  const connectors = [conn('conn_facade_edge_b_01', [0, 0, 0], -90), conn('conn_facade_edge_a_01', [0, 0, 0], 0)];
  return validAtom(lib, id, { glb: { connectors, mesh: boxMesh(0.15, 2.8, 0.15, [0.075, 1.4, -0.075]) }, meta: { connectors: connectors.map((c) => connMeta(c.name, { mating: FACADE })) } });
}
const ASM = 'bld_scaled_01';
const build = (lib, manifest, meta = {}) => writeMolecule(lib, ASM, manifest, { library: 'test', ...meta });
const ent = (ref, asset, scale) => ({ ref, asset: `${asset}@1.0.0`, ...(scale !== undefined ? { scale } : {}) });

test('(a) four facade modules and four posts in a closed ring: two opposite walls scaled [1.5, 1, 1] and the ring still closes', async () => {
  const lib = newLib();
  panel(lib, 'bld_panel_01', { variation: { scale: { x: [1, 2] } } });
  post(lib, 'bld_post_01');
  const ring = (scales) => {
    const atoms = [];
    const joints = [];
    for (let i = 1; i <= 4; i++) {
      atoms.push(ent(`p${i}`, 'bld_panel_01', scales[i - 1]), ent(`c${i}`, 'bld_post_01'));
      joints.push({ a: `p${i}:conn_facade_edge_a_01`, b: `c${i}:conn_facade_edge_b_01` });
      joints.push({ a: `c${i}:conn_facade_edge_a_01`, b: `p${(i % 4) + 1}:conn_facade_edge_b_01` });
    }
    return { origin: { ref: 'p1' }, atoms, joints };
  };
  const r = await run(build(lib, ring([[1.5, 1, 1], undefined, [1.5, 1, 1], undefined])), lib);
  passing(r, 'Molecule');
  passing(r, 'Variation');
  assert.match(status(r, 'Molecule').messages[0], /8 atom\(s\), 8 joint\(s\); 7 placed by mating, 1 measured as loop closures/);
  // with only one of the two opposite walls scaled, the ring does not close
  failing(await run(build(lib, ring([[1.5, 1, 1], undefined, undefined, undefined])), lib), 'Molecule', 'positions differ');
});

test('(b) a module scaled [1, 1.1, 1] beside an unscaled one fails on storey_height, with both values', async () => {
  const lib = newLib();
  panel(lib, 'bld_panel_01', { variation: { scale: { y: [1, 1.2] } } });
  const m = (s) => ({ origin: { ref: 'a' }, atoms: [ent('a', 'bld_panel_01', s), ent('b', 'bld_panel_01')], joints: [{ a: 'a:conn_facade_edge_a_01', b: 'b:conn_facade_edge_b_01' }] });
  const r = await run(build(lib, m([1, 1.1, 1])), lib);
  failing(r, 'Molecule', 'storey_height', 'facade_edge', 'a (bld_panel_01@1.0.0) gives 3.08 m', 'b (bld_panel_01@1.0.0) gives 2.8 m');
  // the wall thickness lies along the atom's z, which did not change
  assert.ok(!status(r, 'Molecule').messages.join('\n').includes('wall_thickness'));
  passing(await run(build(lib, m([1, 1, 1])), lib), 'Molecule');
});

test('(c) a hinge pair scaled evenly by 0.4 on both sides holds; on one side only it fails', async () => {
  const lib = newLib();
  const v = { variation: { scale: [0.3, 1] } };
  validAtom(lib, 'bld_frame_01', { glb: { connectors: [conn('conn_door_hinge_a_01', [0.1, 0, -0.05], 90)] }, meta: { ...v, connectors: [connMeta('conn_door_hinge_a_01', { mating: { leaf_width: 0.8, leaf_height: 2 } })] } });
  validAtom(lib, 'bld_leaf_01', { glb: { connectors: [conn('conn_door_hinge_b_01', [0, 0, 0], -90)] }, meta: { ...v, connectors: [connMeta('conn_door_hinge_b_01', { mating: { leaf_width: 0.8, leaf_height: 2 } })] } });
  const m = (fs, ls) => ({ origin: { ref: 'f' }, atoms: [ent('f', 'bld_frame_01', fs), ent('l', 'bld_leaf_01', ls)], joints: [{ a: 'f:conn_door_hinge_a_01', b: 'l:conn_door_hinge_b_01' }] });
  const both = await run(build(lib, m(0.4, 0.4)), lib);
  passing(both, 'Molecule');
  passing(both, 'Variation');
  failing(await run(build(lib, m(0.4)), lib), 'Molecule', 'leaf_width', 'gives 0.32 m', 'gives 0.8 m');
});

test('(d) a scale outside the declared per-axis range fails, and an axis left out is fixed at 1', async () => {
  const lib = newLib();
  panel(lib, 'bld_panel_01', { variation: { scale: { x: [1, 2] } } });
  const m = (s) => ({ origin: { ref: 'a' }, atoms: [ent('a', 'bld_panel_01', s), ent('b', 'bld_panel_01')], joints: [{ a: 'a:conn_facade_edge_a_01', b: 'b:conn_facade_edge_b_01' }] });
  passing(await run(build(lib, m([1.5, 1, 1])), lib), 'Variation');
  failing(await run(build(lib, m([2.5, 1, 1])), lib), 'Variation', 'scale x = 2.5', '[1, 2]');
  failing(await run(build(lib, m([1.5, 1.1, 1])), lib), 'Variation', 'scale y = 1.1', 'fixed at 1');
  failing(await run(build(lib, m([1, 0, 1])), lib), 'Variation', 'positive');
  failing(await run(build(lib, m([1, 1])), lib), 'Variation', 'three positive numbers');
});

test('(e) an uneven scale on an atom that declared [min, max] fails', async () => {
  const lib = newLib();
  panel(lib, 'bld_panel_01', { variation: { scale: [0.8, 1.3] } });
  const m = (s) => ({ origin: { ref: 'a' }, atoms: [ent('a', 'bld_panel_01', s), ent('b', 'bld_panel_01', s)], joints: [{ a: 'a:conn_facade_edge_a_01', b: 'b:conn_facade_edge_b_01' }] });
  failing(await run(build(lib, m([1.2, 1, 1])), lib), 'Variation', 'allows an even scale only');
  passing(await run(build(lib, m([1.2, 1.2, 1.2])), lib), 'Variation');
  passing(await run(build(lib, m(1.2)), lib), 'Molecule');
});

test('(f) an atom that declares a per-axis range with a connector turned 30 degrees fails its own check', async () => {
  const lib = newLib();
  const connectors = [conn('conn_facade_edge_a_01', [1, 0, 0], 30)];
  const mk = (variation) => validAtom(lib, 'bld_skew_01', { glb: { connectors }, meta: { connectors: [connMeta('conn_facade_edge_a_01', { mating: FACADE })], variation } });
  failing(await run(mk({ scale: { x: [1, 2] } }), lib), 'Variation', 'conn_facade_edge_a_01', 'not parallel to one of the atom\'s axes');
  // an even range needs no axis-parallel connector, and a per-axis range held to one value on every axis is even
  passing(await run(mk({ scale: [1, 2] }), lib), 'Variation');
  passing(await run(mk({ scale: { x: [1, 1], y: [1, 1] } }), lib), 'Variation');
  failing(await run(mk({ scale: { w: [1, 2] } }), lib), 'Variation', 'variation.scale must be');
  failing(await run(mk({ scale: { x: [2, 1] } }), lib), 'Variation', 'variation.scale must be');
});

test('(g) stacked modules with the lower one scaled [1.2, 1, 1] fail on module_width', async () => {
  const lib = newLib();
  panel(lib, 'bld_panel_01', { variation: { scale: { x: [1, 2] } } });
  const m = (s) => ({ origin: { ref: 'lo' }, atoms: [ent('lo', 'bld_panel_01', s), ent('up', 'bld_panel_01')], joints: [{ a: 'lo:conn_storey_stack_a_01', b: 'up:conn_storey_stack_b_01' }] });
  failing(await run(build(lib, m([1.2, 1, 1])), lib), 'Molecule', 'module_width', 'gives 1.2 m', 'gives 1 m');
  passing(await run(build(lib, m()), lib), 'Molecule');
});

test('an unevenly scaled atom joins nothing through a mating dimension that has no axis; an even scale is fine', async () => {
  const lib = newLib();
  const reg = writeRegistry(root);
  const v = { variation: { scale: { x: [1, 2] } } };
  validAtom(lib, 'veh_axle_01', { glb: { connectors: [conn('conn_wheel_hub_a_01', [0.5, 0, 0], 90)] }, meta: { ...v, connectors: [connMeta('conn_wheel_hub_a_01', { mating: { diameter: 0.5 } })] } });
  validAtom(lib, 'veh_wheel_01', { glb: { connectors: [conn('conn_wheel_hub_b_01', [-0.5, 0, 0], -90)] }, meta: { connectors: [connMeta('conn_wheel_hub_b_01', { mating: { diameter: 0.5 } })] } });
  const m = (s) => ({ origin: { ref: 'wheel' }, atoms: [ent('axle', 'veh_axle_01', s), ent('wheel', 'veh_wheel_01')], joints: [{ a: 'axle:conn_wheel_hub_a_01', b: 'wheel:conn_wheel_hub_b_01' }] });
  failing(await run(build(lib, m([1.5, 1, 1])), lib, reg), 'Variation', 'diameter', 'no "mating_axes" entry');
  passing(await run(build(lib, m(1)), lib, reg), 'Variation');
});

test('a molecule is placed with an even scale only', async () => {
  const lib = newLib();
  panel(lib, 'bld_panel_01');
  writeMolecule(lib, 'bld_wall_01', { origin: { ref: 'a' }, atoms: [ent('a', 'bld_panel_01')], joints: [] }, { library: 'test', variation: { scale: [0.5, 2] } });
  const m = (s) => ({ origin: { ref: 'w' }, atoms: [ent('w', 'bld_wall_01', s)], joints: [] });
  failing(await run(build(lib, m([1, 1.5, 1])), lib), 'Variation', 'a placed molecule scales evenly only');
  passing(await run(build(lib, m(1.5)), lib), 'Variation');
});

test('Scale (molecule) measures the extents of an unevenly scaled atom', async () => {
  const lib = newLib();
  panel(lib, 'bld_panel_01', { variation: { scale: { x: [1, 2], y: [1, 2] } } });
  const m = { origin: { ref: 'a' }, atoms: [ent('a', 'bld_panel_01', [1.5, 1.1, 1])], joints: [] };
  const r = await run(build(lib, m, { dimensions_m: [1.5, 3.08, 0.15] }), lib);
  passing(r, 'Scale');
  assert.match(status(r, 'Scale').messages[0], /^measured from the placed atoms: 1\.5 by 3\.08 by 0\.15 m/);
});

test('registry: mating_axes must name an axis and a dimension the type lists', () => {
  const dir = tmpDir();
  try {
    const shipped = loadRegistry(REGISTRY);
    assert.equal(shipped.error, null);
    assert.deepEqual(shipped.types.get('facade_edge').mating_axes, { storey_height: 'y', wall_thickness: 'x' });
    const file = (axes) => writeRegistry(dir, [{ type: 't', sides: { a: 'a', b: 'b' }, mating_dimensions: ['w'], mating_axes: axes, symmetry: 'none', motion: 'fixed' }]);
    assert.equal(loadRegistry(file({ w: 'z' })).error, null);
    assert.match(loadRegistry(file({ w: 'q' })).error, /must be "x", "y" or "z"/);
    assert.match(loadRegistry(file({ h: 'x' })).error, /not one of its mating_dimensions/);
    assert.match(loadRegistry(file(['x'])).error, /must be an object/);
  } finally { rmrf(dir); }
});

// ---- review findings --------------------------------------------------------------------------------

const AXLE = (lib) => validAtom(lib, 'veh_axle_01', { glb: { connectors: [conn('conn_wheel_hub_a_01', [0.5, 0, 0], 90)] }, meta: { variation: { scale: { x: [1, 2], y: [1, 2], z: [1, 2] } }, connectors: [connMeta('conn_wheel_hub_a_01', { mating: { diameter: 0.5 } })] } });

test('an unevenly scaled atom cannot be exposed through a connector with a mating dimension that has no axis', async () => {
  const lib = newLib();
  const reg = writeRegistry(root);
  AXLE(lib);
  const inner = (s) => ({ origin: { ref: 'axle' }, atoms: [ent('axle', 'veh_axle_01', s)], joints: [], exposes: { hub: 'axle:conn_wheel_hub_a_01' } });
  failing(await run(writeMolecule(lib, 'veh_axleasm_01', inner([1.5, 1, 1]), { library: 'test' }), lib, reg), 'Variation', 'veh_axleasm_01', 'exposes "hub"', 'axle', 'diameter', 'no "mating_axes" entry');
  passing(await run(writeMolecule(lib, 'veh_axleasm_01', inner(1.5), { library: 'test' }), lib, reg), 'Variation');
});

test('an unevenly scaled atom cannot be exposed through a connector whose frame is not along its axes', async () => {
  const lib = newLib();
  const connectors = [conn('conn_facade_edge_a_01', [1, 0, 0], 30)];
  validAtom(lib, 'bld_skew_01', { glb: { connectors }, meta: { variation: { scale: { x: [1, 2] } }, connectors: [connMeta('conn_facade_edge_a_01', { mating: FACADE })] } });
  // the atom itself fails its own Variation check, so the exposure is what is tested here
  const m = { origin: { ref: 'a' }, atoms: [ent('a', 'bld_skew_01', [1.5, 1, 1])], joints: [], exposes: { edge: 'a:conn_facade_edge_a_01' } };
  failing(await run(build(lib, m), lib), 'Variation', 'exposes "edge"', 'not parallel');
});

test('an exposed connector of a molecule placed at an even scale carries the scaled mating dimensions', async () => {
  const lib = newLib();
  panel(lib, 'bld_panel_01', { variation: { scale: [1, 2] } });
  writeMolecule(lib, 'bld_wall_01', { origin: { ref: 'a' }, atoms: [ent('a', 'bld_panel_01')], joints: [], exposes: { edge: 'a:conn_facade_edge_a_01' } }, { library: 'test', variation: { scale: [0.5, 2] } });
  const m = (s, t) => ({ origin: { ref: 'w' }, atoms: [ent('w', 'bld_wall_01', s), ent('p', 'bld_panel_01', t)], joints: [{ a: 'w:edge', b: 'p:conn_facade_edge_b_01' }] });
  const ok = await run(build(lib, m(1.1, 1.1)), lib);
  passing(ok, 'Molecule');
  failing(await run(build(lib, m(1.1)), lib), 'Molecule', 'storey_height', 'gives 3.08 m', 'gives 2.8 m');
  failing(await run(build(lib, m(1.1, 1.2)), lib), 'Molecule', 'storey_height', 'gives 3.08 m', 'gives 3.36 m');
});

test('a mirrored atom scaled per axis: connectors and extents follow the mirror and the scale', async () => {
  const lib = newLib();
  panel(lib, 'bld_panel_01', { variation: { scale: { x: [1, 2], y: [1, 2] } } });
  const ml = path.join(lib, 'bld', 'bld_panel_01', 'asset.json');
  const meta = JSON.parse(fs.readFileSync(ml, 'utf8'));
  fs.writeFileSync(ml, JSON.stringify({ ...meta, mirror_safe: true }));
  // extents: x from 0 to 1 mirrors to -1..0 and scales to -1.5..0
  const single = { origin: { ref: 'a' }, atoms: [{ ...ent('a', 'bld_panel_01', [1.5, 1.1, 1]), mirror: true }], joints: [] };
  const r = await run(build(lib, single, { dimensions_m: [1.5, 3.08, 0.15] }), lib);
  passing(r, 'Scale');
  assert.match(status(r, 'Scale').messages[0], /x from -1\.5 to 0,/);
  // a mirrored, scaled panel joined to an unscaled one: its a-edge sits at x = -1.5 and the joint mates
  const pair2 = (s) => ({ origin: { ref: 'a' }, atoms: [{ ...ent('a', 'bld_panel_01', s), mirror: true }, { ...ent('b', 'bld_panel_01'), mirror: true }], joints: [{ a: 'a:conn_facade_edge_a_01', b: 'b:conn_facade_edge_b_01' }] });
  const ok = await run(build(lib, pair2([1.5, 1, 1]), { dimensions_m: [2.5, 2.8, 0.15] }), lib);
  passing(ok, 'Molecule');
  passing(ok, 'Variation');
  failing(await run(build(lib, pair2([1.5, 1.1, 1])), lib), 'Molecule', 'storey_height');
});

test('an uneven scale along an axis no mating dimension lies on leaves the joint intact (and the wrong axis would break it)', async () => {
  const lib = newLib();
  panel(lib, 'bld_panel_01', { variation: { scale: { x: [1, 2] } } });
  const m = (s) => ({ origin: { ref: 'a' }, atoms: [ent('a', 'bld_panel_01', s), ent('b', 'bld_panel_01')], joints: [{ a: 'a:conn_facade_edge_a_01', b: 'b:conn_facade_edge_b_01' }] });
  // storey_height lies along y and wall_thickness along the connector frame's x, which is the atom's z: x scaling changes neither
  passing(await run(build(lib, m([1.5, 1, 1])), lib), 'Molecule');
  passing(await run(build(lib, m([2, 1, 1])), lib), 'Molecule');
});

test('a scale written as [0.30000000000000004, 0.3, 0.3] counts as even', async () => {
  const lib = newLib();
  panel(lib, 'bld_panel_01', { variation: { scale: [0.2, 0.5] } });
  const m = { origin: { ref: 'a' }, atoms: [ent('a', 'bld_panel_01', [0.30000000000000004, 0.3, 0.3])], joints: [] };
  passing(await run(build(lib, m), lib), 'Variation');
});

test('a profile without mating_tolerance_m still compares mating dimensions', async () => {
  const lib = newLib();
  panel(lib, 'bld_panel_01', { variation: { scale: { y: [1, 1.2] } } });
  const base = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'validator', 'profile-1.json'), 'utf8'));
  delete base.mating_tolerance_m;
  const pf = path.join(root, 'noprofile.json');
  fs.writeFileSync(pf, JSON.stringify(base));
  const m = { origin: { ref: 'a' }, atoms: [ent('a', 'bld_panel_01', [1, 1.1, 1]), ent('b', 'bld_panel_01')], joints: [{ a: 'a:conn_facade_edge_a_01', b: 'b:conn_facade_edge_b_01' }] };
  failing(await validate(build(lib, m), { registry: REGISTRY, library: lib, profile: pf }), 'Molecule', 'storey_height');
});

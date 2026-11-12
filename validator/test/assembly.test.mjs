import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validate } from '../validate.mjs';
import { VALIDATOR_DIR } from '../lib/profile.mjs';
import { tmpDir, rmrf, writeRegistry, validAtom, writeAssembly, conn, status } from './helpers.mjs';

let root, registry, n = 0;
before(() => { root = tmpDir(); registry = writeRegistry(root); });
after(() => rmrf(root));

const newLib = () => { const d = path.join(root, `lib${n++}`); fs.mkdirSync(d); return d; };
const failing = (r, name, ...needles) => {
  const c = status(r, name);
  assert.equal(c.status, 'FAIL', `${name} should fail, got ${c.status}: ${c.messages.join(' | ')}`);
  const text = c.messages.join('\n');
  for (const s of needles) assert.ok(text.includes(s), `${name} should mention "${s}", got:\n${text}`);
};
const passing = (r, name) => assert.equal(status(r, name).status, 'PASS', `${name}: ${status(r, name).messages.join(' | ')}`);

// Body and door share two hinge connectors 0.3 m apart, so the second joint closes a loop and measures the fit.
function bodyDoor(lib, { doorB2y = 0.3, doorMeta = {} } = {}) {
  validAtom(lib, 'veh_body_01', { glb: { connectors: [conn('conn_door_hinge_a_01', [0.5, 0, 0], 90), conn('conn_door_hinge_a_02', [0.5, 0.3, 0], 90)] } });
  validAtom(lib, 'veh_door_01', {
    glb: { connectors: [conn('conn_door_hinge_b_01', [-0.5, 0, 0], -90), conn('conn_door_hinge_b_02', [-0.5, doorB2y, 0], -90)] },
    meta: doorMeta,
  });
}
const manifest = (o = {}) => ({
  origin: { ref: 'body', offset_m: [0, 0.31, 0] },
  atoms: [{ ref: 'body', asset: 'veh_body_01@1.0.0' }, { ref: 'door', asset: 'veh_door_01@1.0.0', ...o.door }],
  joints: [
    { a: 'body:conn_door_hinge_a_01', b: 'door:conn_door_hinge_b_01' },
    { a: 'body:conn_door_hinge_a_02', b: 'door:conn_door_hinge_b_02', ...o.joint2 },
  ],
  ...o.top,
});
const build = (lib, m = manifest(), meta = {}) => writeAssembly(lib, 'veh_sedan_01', m, { library: 'test', ...meta });
const run = (dir, lib, extra = {}) => validate(dir, { registry, library: lib, ...extra });

test('two atoms that mate: Assembly passes and the loop joint is measured', async () => {
  const lib = newLib();
  bodyDoor(lib);
  const r = await run(build(lib), lib);
  passing(r, 'Assembly');
  assert.match(status(r, 'Assembly').messages[0], /1 measured as loop closures/);
  assert.match(status(r, 'Assembly').messages[1], /^measured joints: largest gap \d+\.\d{3} mm \(allowed 1 mm\), largest angle \d+\.\d{3} degrees \(allowed 0\.5\)$/);
  for (const c of r.checks) assert.notEqual(c.status, 'FAIL', `${c.name}: ${c.messages.join(' | ')}`);
  assert.equal(r.kind, 'assembly');
  assert.equal(status(r, 'Triangle budget').status, 'PASS');
});

test('one connector moved 5 mm: Assembly fails and says by how much', async () => {
  const lib = newLib();
  bodyDoor(lib, { doorB2y: 0.305 });
  const r = await run(build(lib), lib);
  failing(r, 'Assembly', '5.00 mm', 'conn_door_hinge_a_02', 'conn_door_hinge_b_02');
});

test('mirrored atom: fails without mirror_safe, passes with it', async () => {
  const lib = newLib();
  bodyDoor(lib);
  failing(await run(build(lib, manifest({ door: { mirror: true } })), lib), 'Assembly', 'mirror_safe', 'door');
  const lib2 = newLib();
  bodyDoor(lib2, { doorMeta: { mirror_safe: true } });
  passing(await run(build(lib2, manifest({ door: { mirror: true } })), lib2), 'Assembly');
});

test('Assembly: unjoined atom, missing origin, unmerged version, wrong sides, unregistered type', async () => {
  const lib = newLib();
  bodyDoor(lib);
  validAtom(lib, 'veh_extra_01');
  const m = manifest();
  m.atoms.push({ ref: 'extra', asset: 'veh_extra_01@1.0.0' });
  failing(await run(build(lib, m), lib), 'Assembly', 'atom "extra"', 'not joined');
  const noOrigin = manifest();
  delete noOrigin.origin;
  failing(await run(build(newLibWith(bodyDoor), noOrigin), lastLib), 'Assembly', '"origin" is missing');
  failing(await run(build(lib, manifest({ door: { asset: 'veh_door_01@2.0.0' } })), lib), 'Assembly', 'not a merged version');
  failing(await run(build(lib, manifest({ door: { asset: 'veh_ghost_01@1.0.0' } })), lib), 'Assembly', 'not in the library');
  const sides = manifest();
  sides.joints[0] = { a: 'body:conn_door_hinge_a_01', b: 'body:conn_door_hinge_a_02' };
  failing(await run(build(lib, sides), lib), 'Assembly', 'both connectors are side "a"');
  const mystery = newLib();
  validAtom(mystery, 'veh_body_01', { glb: { connectors: [conn('conn_mystery_a_01', [0.5, 0, 0], 90)] } });
  validAtom(mystery, 'veh_door_01', { glb: { connectors: [conn('conn_mystery_b_01', [-0.5, 0, 0], -90)] } });
  const one = { origin: { ref: 'body' }, atoms: manifest().atoms, joints: [{ a: 'body:conn_mystery_a_01', b: 'door:conn_mystery_b_01' }] };
  failing(await run(build(mystery, one), mystery), 'Assembly', 'mystery', 'registry');
});
let lastLib;
function newLibWith(fn) { lastLib = newLib(); fn(lastLib); return lastLib; }

test('Assembly: turn_deg must be a valid turn for the type symmetry', async () => {
  const lib = newLib();
  validAtom(lib, 'veh_host_01', { glb: { connectors: [conn('conn_tab_four_a_01', [0.5, 0, 0], 90)] } });
  validAtom(lib, 'veh_guest_01', { glb: { connectors: [conn('conn_tab_four_b_01', [-0.5, 0, 0], -90)] } });
  const mk = (turn) => ({ origin: { ref: 'host' }, atoms: [{ ref: 'host', asset: 'veh_host_01@1.0.0' }, { ref: 'guest', asset: 'veh_guest_01@1.0.0' }], joints: [{ a: 'host:conn_tab_four_a_01', b: 'guest:conn_tab_four_b_01', turn_deg: turn }] });
  failing(await run(build(lib, mk(45)), lib), 'Assembly', 'multiples of 90');
  passing(await run(build(lib, mk(90)), lib), 'Assembly');
});

test('nested assembly: a joint reaches it only through an exposed name', async () => {
  const lib = newLib();
  const beamConns = [conn('conn_tab_four_a_01', [0.5, 0, 0], 90), conn('conn_tab_four_b_01', [-0.5, 0, 0], -90)];
  validAtom(lib, 'veh_beam_01', { glb: { connectors: beamConns } });
  writeAssembly(lib, 'veh_pair_01', {
    origin: { ref: 'one' },
    atoms: [{ ref: 'one', asset: 'veh_beam_01@1.0.0' }, { ref: 'two', asset: 'veh_beam_01@1.0.0' }],
    joints: [{ a: 'one:conn_tab_four_a_01', b: 'two:conn_tab_four_b_01' }],
    exposes: { left: 'one:conn_tab_four_b_01', right: 'two:conn_tab_four_a_01' },
  }, { library: 'test', triangles: 24 });
  const outer = (target) => ({
    origin: { ref: 'beam' },
    atoms: [{ ref: 'beam', asset: 'veh_beam_01@1.0.0' }, { ref: 'pair', asset: 'veh_pair_01@1.0.0' }],
    joints: [{ a: 'beam:conn_tab_four_a_01', b: `pair:${target}` }],
  });
  const ok = await run(build(lib, outer('left'), { triangles: 36 }), lib);
  passing(ok, 'Assembly');
  passing(ok, 'Metadata');
  failing(await run(build(lib, outer('conn_tab_four_b_01'), { triangles: 36 }), lib), 'Assembly', 'not exposed', 'left, right');
});

test('Assembly triangle budget and recorded triangle total', async () => {
  const lib = newLib();
  bodyDoor(lib);
  const prof = path.join(root, `prof${n++}.json`);
  fs.writeFileSync(prof, JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(VALIDATOR_DIR, 'profile-1.json'), 'utf8')), budgets: { vehicle_assembly: 20 } }));
  failing(await run(build(lib), lib, { profile: prof }), 'Triangle budget', '24 triangles', 'allows 20');
  failing(await run(build(lib, manifest(), { triangles: 99 }), lib), 'Metadata', 'triangles is 99', 'sum to 24');
});

test('Variation (assembly): scale, material and motion choices are held to what atoms declare', async () => {
  const doorMeta = { variation: { scale: [0.8, 1.2], open_slots: [{ slot: 'paint', materials: ['mat_red_01', 'mat_blue_01'] }] } };
  const lib = newLib();
  bodyDoor(lib, { doorMeta });
  passing(await run(build(lib, manifest({ door: { scale: 1.1, materials: { paint: 'mat_red_01' } } })), lib), 'Variation');
  failing(await run(build(lib, manifest({ door: { scale: 1.5 } })), lib), 'Variation', '1.5', '[0.8, 1.2]');
  failing(await run(build(lib, manifest({ door: { materials: { paint: 'mat_green_01' } } })), lib), 'Variation', 'mat_green_01', 'paint');
  failing(await run(build(lib, manifest({ door: { materials: { trim: 'mat_red_01' } } })), lib), 'Variation', 'slot "trim"');
  passing(await run(build(lib, manifest({ joint2: { motion: { also: [{ turn: 'z', limits_deg: [-12, 12] }] } } })), lib), 'Variation');
  failing(await run(build(lib, manifest({ joint2: { motion: { also: [{ turn: 'q', limits_deg: [12, -12] }] } } })), lib), 'Variation', 'motion.also[0]');
  failing(await run(build(lib, manifest({ joint2: { motion: { teleport: true } } })), lib), 'Variation', 'teleport');
  // a scaled atom may not join through a connector that has mating dimensions
  const lib2 = newLib();
  validAtom(lib2, 'veh_axle_01', { glb: { connectors: [conn('conn_wheel_hub_a_01', [0.5, 0, 0], 90)] } });
  validAtom(lib2, 'veh_wheel_01', { glb: { connectors: [conn('conn_wheel_hub_b_01', [-0.5, 0, 0], -90)] }, meta: { variation: { scale: [0.8, 1.3] } } });
  const w = (scale) => ({ origin: { ref: 'axle' }, atoms: [{ ref: 'axle', asset: 'veh_axle_01@1.0.0' }, { ref: 'wheel', asset: 'veh_wheel_01@1.0.0', scale }], joints: [{ a: 'axle:conn_wheel_hub_a_01', b: 'wheel:conn_wheel_hub_b_01' }] });
  failing(await run(build(lib2, w(1.2)), lib2), 'Variation', 'mating dimensions', 'diameter');
  passing(await run(build(lib2, w(1)), lib2), 'Variation');
});

test('Assembly uses atoms of its own library only', async () => {
  const lib = newLib();
  bodyDoor(lib);
  failing(await run(build(lib, manifest(), { library: 'other' }), lib), 'Assembly', 'own library only');
});

test('Scale (assembly): the size is measured from the placed atoms and held to asset.json and the task', async () => {
  const lib = newLib();
  bodyDoor(lib);
  // two 1 m boxes side by side along x
  const plain = await run(build(lib), lib);
  passing(plain, 'Scale');
  assert.match(status(plain, 'Scale').messages[0], /^measured from the placed atoms: 2 by 1 by 1 m \(x from -0\.5 to 1\.5, y from -0\.81 to 0\.19, /);
  assert.ok(status(plain, 'Scale').messages.some((m) => m.includes('no --task')));
  passing(await run(build(lib, manifest(), { dimensions_m: [2, 1, 1] }), lib, { task: { dimensions_m: [2.02, 1, 1] } }), 'Scale');
  failing(await run(build(lib, manifest(), { dimensions_m: [2, 1, 1] }), lib, { task: { dimensions_m: [2.5, 1, 1] } }), 'Scale', 'width (x) is 2 m', 'the task asks for 2.5 m');
  failing(await run(build(lib, manifest(), { dimensions_m: [3, 1, 1] }), lib), 'Scale', 'asset.json dimensions_m gives width (x) as 3 m', 'measure 2 m');
  // an assembly that cannot be placed is not measured
  const off = newLib();
  bodyDoor(off, { doorB2y: 0.305 });
  assert.equal(status(await run(build(off), off), 'Scale').status, 'SKIP');
});

test('Scale (assembly): a nested assembly is measured through its own placement', async () => {
  const lib = newLib();
  const beamConns = [conn('conn_tab_four_a_01', [0.5, 0, 0], 90), conn('conn_tab_four_b_01', [-0.5, 0, 0], -90)];
  validAtom(lib, 'veh_beam_01', { glb: { connectors: beamConns } });
  writeAssembly(lib, 'veh_pair_01', {
    origin: { ref: 'one' },
    atoms: [{ ref: 'one', asset: 'veh_beam_01@1.0.0' }, { ref: 'two', asset: 'veh_beam_01@1.0.0' }],
    joints: [{ a: 'one:conn_tab_four_a_01', b: 'two:conn_tab_four_b_01' }],
    exposes: { left: 'one:conn_tab_four_b_01', right: 'two:conn_tab_four_a_01' },
  }, { library: 'test', triangles: 24 });
  const r = await run(build(lib, {
    origin: { ref: 'beam' },
    atoms: [{ ref: 'beam', asset: 'veh_beam_01@1.0.0' }, { ref: 'pair', asset: 'veh_pair_01@1.0.0' }],
    joints: [{ a: 'beam:conn_tab_four_a_01', b: 'pair:left' }],
  }, { triangles: 36, dimensions_m: [3, 1, 1] }), lib);
  passing(r, 'Scale');
  assert.match(status(r, 'Scale').messages[0], /3 by 1 by 1 m \(x from -0\.5 to 2\.5,/);
});

test('Blueprint (assembly): a blueprint beside the manifest must be filled, and the manifest must match its counts', async () => {
  const slot = (name, side, atom, count = 1) => ({ slot: name, count, connectors: [{ type: 'door_hinge', side }], dimensions_m: { width: 1 }, atom });
  const withBlueprint = (slots) => {
    const lib = newLib();
    bodyDoor(lib);
    const dir = build(lib);
    fs.writeFileSync(path.join(dir, 'blueprint.json'), JSON.stringify({ object_id: 'veh_sedan_01', description: 'A body and a door', slots }));
    return run(dir, lib);
  };
  const ok = await withBlueprint([slot('body', 'a', 'veh_body_01@1.0.0'), slot('door', 'b', 'veh_door_01@1.0.0')]);
  passing(ok, 'Blueprint');
  assert.match(status(ok, 'Blueprint').messages[0], /^2 slot\(s\) compared with the manifest's 2 atom\(s\)$/);
  for (const c of ok.checks) assert.notEqual(c.status, 'FAIL', `${c.name}: ${c.messages.join(' | ')}`);
  failing(await withBlueprint([slot('body', 'a', 'veh_body_01@1.0.0'), slot('door', 'b', 'new')]), 'Blueprint', 'slot "door": still marked "new"', 'places 1 of veh_door_01@1.0.0, which no blueprint slot names');
  failing(await withBlueprint([slot('body', 'a', 'veh_body_01@1.0.0'), slot('door', 'b', 'veh_door_01@1.0.0', 2)]), 'Blueprint', 'asks for 2 of veh_door_01@1.0.0 (slot "door"), the manifest places 1');
  // one atom named by two slots: the counts add
  failing(await withBlueprint([slot('body', 'a', 'veh_body_01@1.0.0'), slot('door', 'b', 'veh_door_01@1.0.0'), slot('spare', 'b', 'veh_door_01@1.0.0')]), 'Blueprint', 'asks for 2 of veh_door_01@1.0.0 (slots "door", "spare")');
  // a slot whose atom does not fit still fails, as it does for an object
  failing(await withBlueprint([slot('body', 'b', 'veh_body_01@1.0.0'), slot('door', 'b', 'veh_door_01@1.0.0')]), 'Blueprint', 'does not carry a connector of type "door_hinge" side "b"');
  // without a blueprint beside it the check does not apply
  const lib = newLib();
  bodyDoor(lib);
  assert.equal(status(await run(build(lib), lib), 'Blueprint').status, 'SKIP');
});

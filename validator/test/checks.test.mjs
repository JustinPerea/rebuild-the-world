import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validate, CHECKS } from '../validate.mjs';
import { VALIDATOR_DIR, REPO_ROOT } from '../lib/profile.mjs';
import {
  tmpDir, rmrf, writeRegistry, validAtom, writeAtom, conn, connMeta, buildGlb, boxMesh, png, status, metaFor,
} from './helpers.mjs';

let root, lib, registry, n = 0;
before(() => {
  root = tmpDir();
  lib = path.join(root, 'lib');
  fs.mkdirSync(path.join(lib, 'mat', 'mat_brick_01'), { recursive: true });
  registry = writeRegistry(root);
});
after(() => rmrf(root));

const fresh = () => { const d = path.join(root, `case${n++}`); fs.mkdirSync(d); return d; };
const run = (dir, o = {}) => validate(dir, { registry, library: lib, ...o });
const writeProfile = (extra) => {
  const base = JSON.parse(fs.readFileSync(path.join(VALIDATOR_DIR, 'profile-1.json'), 'utf8'));
  const file = path.join(fresh(), 'profile.json');
  fs.writeFileSync(file, JSON.stringify({ ...base, ...extra }));
  return file;
};
const atomIn = (id, o) => validAtom(fresh(), id, o);
const failing = (r, name, ...needles) => {
  const c = status(r, name);
  assert.equal(c.status, 'FAIL', `${name} should fail, got ${c.status}: ${c.messages.join(' | ')}`);
  const text = c.messages.join('\n');
  for (const s of needles) assert.ok(text.includes(s), `${name} message should mention "${s}", got:\n${text}`);
};

test('check list matches the 18 names in spec.json, in order', () => {
  const spec = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'spec', 'spec.json'), 'utf8'));
  assert.deepEqual(CHECKS.map((c) => c[0]), spec.checks.map((c) => c.name));
  assert.deepEqual(CHECKS.map((c) => c[1]), spec.checks.map((c) => c.source));
});

test('valid atom passes every applicable check and every check is reported', async () => {
  const r = await run(atomIn('prop_box_01'), { task: { dimensions_m: [1, 1, 1], required_connectors: [{ type: 'door_hinge', side: 'a' }] } });
  assert.equal(r.checks.length, 18);
  for (const c of r.checks) assert.notEqual(c.status, 'FAIL', `${c.name}: ${c.messages.join(' | ')}`);
  const st = Object.fromEntries(r.checks.map((c) => [c.name, c.status]));
  for (const k of ['File validity', 'Folder and naming', 'Metadata', 'Scale', 'Transforms', 'Triangle budget', 'Mesh health', 'Connectors', 'Reuse', 'Collision', 'Textures', 'Materials', 'File size', 'Licence']) assert.equal(st[k], 'PASS', k);
  for (const k of ['Molecule', 'Blueprint', 'Clip']) assert.equal(st[k], 'SKIP', k);
  assert.equal(r.kind, 'atom');
  assert.equal(r.summary.ok, true);
  assert.equal(status(r, 'File validity').status, 'PASS', 'gltf-validator must be installed for this test');
});

test('File validity: dangling mesh reference and truncated file fail', async () => {
  const bad = atomIn('prop_box_01', { glb: { mutate: (j) => { j.nodes[1].mesh = 99; } } });
  failing(await run(bad), 'File validity');
  const trunc = atomIn('prop_box_02', {});
  const f = path.join(trunc, 'asset.glb');
  fs.writeFileSync(f, fs.readFileSync(f).subarray(0, 100));
  failing(await run(trunc), 'File validity', 'GLB');
});

test('Folder and naming: bad folder name and missing asset.json fail', async () => {
  const d = path.join(fresh(), 'Bad-Name');
  fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'asset.glb'), buildGlb({}));
  failing(await run(d), 'Folder and naming', 'Bad-Name', 'asset.json is missing');
  const d2 = atomIn('prop_box_01');
  fs.rmSync(path.join(d2, 'asset.json'));
  failing(await run(d2), 'Folder and naming', 'asset.json');
  const d3 = atomIn('prop_box_03', { meta: { asset_id: 'prop_other_01' } });
  failing(await run(d3), 'Folder and naming', 'prop_other_01');
});

test('Folder and naming: a manifest under its old name, assembly.json, fails and says what to rename', async () => {
  // beside a blueprint the folder would otherwise read as an object, and the manifest would never be checked
  const d = path.join(fresh(), 'bld_old_house_01');
  fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'assembly.json'), '{}');
  fs.writeFileSync(path.join(d, 'blueprint.json'), '{}');
  failing(await run(d), 'Folder and naming', 'assembly.json was renamed', 'molecule.json');
  // alone, it is not mistaken for an empty folder either
  const d2 = path.join(fresh(), 'bld_old_house_02');
  fs.mkdirSync(d2);
  fs.writeFileSync(path.join(d2, 'assembly.json'), '{}');
  failing(await run(d2), 'Folder and naming', 'assembly.json was renamed');
});

test('Metadata: missing field, wrong triangles, wrong dimensions, unlisted connector', async () => {
  const d = atomIn('prop_box_01', { meta: { triangles: 13, dimensions_m: [1, 1.5, 1], style_version: undefined, connectors: [] } });
  failing(await run(d), 'Metadata', 'style_version', 'triangles is 13 but the mesh has 12', 'height (y) is 1.5', 'conn_door_hinge_a_01');
});

test('Scale: skipped without a task, fails when 10% off, passes within 2%', async () => {
  const d = atomIn('prop_box_01');
  assert.equal(status(await run(d), 'Scale').status, 'SKIP');
  failing(await run(d, { task: { dimensions_m: [1.1, 1, 1] } }), 'Scale', 'width (x)', '1.1 m');
  assert.equal(status(await run(d, { task: { dimensions_m: [1.01, 1, 1] } }), 'Scale').status, 'PASS');
});

test('Transforms: translated root fails', async () => {
  const d = atomIn('prop_box_01', { glb: { rootTransform: { translation: [0, 1, 0] } } });
  failing(await run(d), 'Transforms', 'asset_root', 'translation');
});

test('Triangle budget: over a class budget fails (budget from a --profile file)', async () => {
  const d = atomIn('prop_box_01', { meta: { class: 'Blockout' } });
  failing(await run(d, { profile: writeProfile({ budgets: { blockout: 10 } }) }), 'Triangle budget', '12 triangles', 'allows 10');
  assert.equal(status(await run(d), 'Triangle budget').status, 'PASS', 'real Blockout budget is 500');
});

const meshCase = (mesh, meta = {}) => atomIn('prop_box_01', { glb: { mesh }, meta: { triangles: mesh.indices.length / 3, ...meta } });
test('Mesh health: hole, zero-area face, duplicate face, loose vertex, inward normals', async () => {
  const box = boxMesh();
  failing(await run(meshCase({ positions: box.positions, indices: box.indices.slice(3) })), 'Mesh health', 'not watertight', 'holes');
  failing(await run(meshCase({ positions: [...box.positions, 2, 2, 2], indices: [...box.indices, 0, 8, 8] })), 'Mesh health', 'zero-area');
  failing(await run(meshCase({ positions: box.positions, indices: [...box.indices, ...box.indices.slice(0, 3)] })), 'Mesh health', 'duplicate');
  failing(await run(meshCase({ positions: [...box.positions, 5, 5, 5], indices: box.indices })), 'Mesh health', 'loose vertex');
  const flipped = [];
  for (let i = 0; i < box.indices.length; i += 3) flipped.push(box.indices[i], box.indices[i + 2], box.indices[i + 1]);
  failing(await run(meshCase({ positions: box.positions, indices: flipped })), 'Mesh health', 'inward');
  assert.equal(status(await run(meshCase({ positions: box.positions, indices: box.indices.slice(3) }, { thin: true })), 'Mesh health').status, 'PASS', 'thin metadata exempts holes');
});

test('Connectors: unregistered type, +Y parallel to +Z, missing limits, missing required', async () => {
  let d = atomIn('prop_box_01', { glb: { connectors: [conn('conn_mystery_a_01', [0, 0, 0])] } });
  failing(await run(d), 'Connectors', 'conn_mystery_a_01', 'not in the connector registry');
  d = atomIn('prop_box_02', { glb: { connectors: [conn('conn_door_hinge_a_01', [0, 0, 0], 0, { matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1] })] } });
  failing(await run(d), 'Connectors', 'conn_door_hinge_a_01', 'parallel');
  d = atomIn('prop_box_03', { glb: { connectors: [conn('conn_wheel_hub_b_01', [0, 0, 0])] } });
  failing(await run(d), 'Connectors', 'conn_wheel_hub_b_01', 'limits', 'spin');
  const ok = atomIn('prop_box_04', { glb: { connectors: [conn('conn_wheel_hub_b_01', [0, 0, 0])] }, meta: { connectors: [connMeta('conn_wheel_hub_b_01', { limits: [-180, 180], rest: 0 })] } });
  assert.equal(status(await run(ok), 'Connectors').status, 'PASS');
  failing(await run(atomIn('prop_box_05'), { task: { required_connectors: [{ type: 'wheel_hub', side: 'b', count: 1 }] } }), 'Connectors', 'wheel_hub', 'side "b"');
});

test('Connectors: a task that fixes a frame is measured: position, directions, limits and rest', async () => {
  const hub = () => atomIn(`prop_box_0${n}`, { glb: { connectors: [conn('conn_wheel_hub_b_01', [0, 0, 0])] }, meta: { connectors: [connMeta('conn_wheel_hub_b_01', { limits: [-180, 180], rest: 0 })] } });
  const frame = (extra = {}) => ({ task: { connector_frames: [{ name: 'conn_wheel_hub_b_01', position_m: [0, 0, 0], z_axis: [0, 0, 1], y_axis: [0, 1, 0], limits: [-180, 180], rest: 0, ...extra }] } });
  const ok = status(await run(hub(), frame()), 'Connectors');
  assert.equal(ok.status, 'PASS', ok.messages.join(' | '));
  failing(await run(hub(), frame({ position_m: [0.005, 0, 0] })), 'Connectors', 'conn_wheel_hub_b_01', '5.0 mm apart');
  failing(await run(hub(), frame({ z_axis: [1, 0, 0] })), 'Connectors', '+Z points along');
  failing(await run(hub(), frame({ limits: [-90, 90] })), 'Connectors', 'limits are [-180,180]', 'the task asks for [-90,90]');
  failing(await run(hub(), frame({ rest: 10 })), 'Connectors', 'rest is 0', 'the task asks for 10');
  failing(await run(hub(), { task: { connector_frames: [{ name: 'conn_wheel_hub_b_02', position_m: [0, 0, 0] }] } }), 'Connectors', 'no node of that name');
});

test('Collision: none, too many, non-convex', async () => {
  failing(await run(atomIn('prop_box_01', { glb: { collision: 0 } })), 'Collision', '0 collision');
  failing(await run(atomIn('prop_box_02', { glb: { collision: 9 } })), 'Collision', '9 collision', '1 to 8');
  const dent = boxMesh(0.5, 0.5, 0.5);
  dent.positions[7 * 3] = 0; dent.positions[7 * 3 + 1] = 0; dent.positions[7 * 3 + 2] = 0;
  failing(await run(atomIn('prop_box_03', { glb: { hulls: [dent] } })), 'Collision', 'not convex');
});

const customMat = [{ name: 'painted', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 2 } }, normalTexture: { index: 1 }, occlusionTexture: { index: 2 } }];
test('Textures: valid set passes; bad size, non-PNG and missing maps fail', async () => {
  const good = atomIn('prop_box_01', { glb: { materials: customMat, images: [png(128, 128), png(128, 128), png(128, 128)] }, meta: { materials: { library: [], custom: ['painted'] } } });
  const r = await run(good);
  assert.equal(status(r, 'Textures').status, 'PASS', status(r, 'Textures').messages.join('|'));
  assert.equal(status(r, 'File validity').status, 'PASS', status(r, 'File validity').messages.join('|'));
  const mk = (id, images, materials = customMat) => atomIn(id, { glb: { materials, images }, meta: { materials: { library: [], custom: ['painted'] } } });
  failing(await run(mk('prop_box_02', [png(100, 128), png(128, 128), png(128, 128)])), 'Textures', 'width 100 px', 'power of two');
  failing(await run(mk('prop_box_03', [png(8192, 8192), png(128, 128), png(128, 128)])), 'Textures', '8192', 'maximum 4096');
  failing(await run(mk('prop_box_04', [png(64, 64), png(128, 128), png(128, 128)])), 'Textures', 'under the minimum 128');
  failing(await run(mk('prop_box_05', [Buffer.from('\xff\xd8\xff\xe0 not a png'), png(128, 128), png(128, 128)])), 'Textures', 'not a PNG');
  failing(await run(mk('prop_box_06', [png(128, 128), png(128, 128)], [{ name: 'painted', pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }])), 'Textures', 'normal texture');
});

test('Materials: unknown library ID and too many materials fail; known ID passes', async () => {
  const mats = (names) => names.map((name) => ({ name, pbrMetallicRoughness: {} }));
  const mk = (id, names) => atomIn(id, { glb: { materials: mats(names) }, meta: { materials: { library: names.filter((x) => x.startsWith('mat_')), custom: names.filter((x) => !x.startsWith('mat_')) } } });
  failing(await run(mk('prop_box_01', ['mat_missing_01'])), 'Materials', 'mat_missing_01');
  failing(await run(mk('prop_box_02', ['a', 'b', 'c', 'd'])), 'Materials', '4 materials', 'allows 3');
  assert.equal(status(await run(mk('prop_box_03', ['mat_brick_01'])), 'Materials').status, 'PASS');
});

test('File size: folder over the limit fails', async () => {
  const d = atomIn('prop_box_01');
  failing(await run(d, { profile: writeProfile({ folder_max_bytes: 500 }) }), 'File size', 'must be under');
});

test('Licence: empty licence and a reference without a note fail', async () => {
  failing(await run(atomIn('prop_box_01', { meta: { licence: '' } })), 'Licence', 'licence');
  const d = atomIn('prop_box_02');
  fs.mkdirSync(path.join(d, 'refs'));
  fs.writeFileSync(path.join(d, 'refs', 'photo.jpg'), 'x');
  failing(await run(d), 'Licence', 'refs/photo.jpg');
  fs.writeFileSync(path.join(d, 'refs', 'photo.jpg.licence.txt'), 'CC BY 4.0, from example.org');
  assert.equal(status(await run(d), 'Licence').status, 'PASS');
});

test('Reuse: a missing list or a missing reason fails; a considered atom that fits by connectors and size is noted for the reviewer', async () => {
  failing(await run(atomIn('prop_box_01', { meta: { considered: undefined } })), 'Reuse', 'considered');
  const other = path.join(fresh(), 'lib2');
  validAtom(other, 'prop_twin_01', { meta: { library: 'test' } });
  const withLib = (consider) => atomIn('prop_box_02', { meta: { considered: [{ asset: consider, reason: 'looked' }] } });
  const twin = status(await validate(withLib('prop_twin_01@1.0.0'), { registry, library: other }), 'Reuse');
  assert.equal(twin.status, 'PASS');
  assert.ok(twin.messages.some((m) => m.includes('prop_twin_01@1.0.0') && m.includes('reviewer') && m.includes('"looked"')), twin.messages.join(' | '));
  failing(await validate(atomIn('prop_box_03', { meta: { considered: [{ asset: 'prop_twin_01@1.0.0', reason: '  ' }] } }), { registry, library: other }), 'Reuse', 'reason');
  validAtom(other, 'prop_big_01', { glb: { size: [3, 1, 1] }, meta: { dimensions_m: [3, 1, 1] } });
  assert.equal(status(await validate(withLib('prop_big_01@1.0.0'), { registry, library: other }), 'Reuse').status, 'PASS');
});

test('Clip: always skipped, with a reason', async () => {
  const c = status(await run(atomIn('prop_box_01')), 'Clip');
  assert.equal(c.status, 'SKIP');
  assert.match(c.messages[0], /not implemented/);
});

test('Blueprint: bad slot fails; valid blueprint with new and pinned atoms passes', async () => {
  const bp = (slots) => {
    const d = path.join(fresh(), 'obj_thing_01');
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'blueprint.json'), JSON.stringify({ object_id: 'obj_thing_01', description: 'A thing', slots }));
    fs.writeFileSync(path.join(d, 'asset.json'), JSON.stringify(metaFor('obj_thing_01', { class: undefined, tier: undefined, dimensions_m: undefined, triangles: undefined, connectors: undefined, mirror_safe: undefined, materials: undefined })));
    return d;
  };
  failing(await run(bp([{ slot: 'wheel', count: 4, atom: 'new' }])), 'Blueprint', 'connectors', 'dimensions_m');
  const wheelLib = path.join(fresh(), 'lib3');
  validAtom(wheelLib, 'prop_wheel_01', { glb: { connectors: [conn('conn_wheel_hub_b_01', [0, 0, 0])] }, meta: { connectors: [connMeta('conn_wheel_hub_b_01', { limits: [-180, 180], rest: 0, mating: { diameter: 0.128 } })] } });
  const slot = (atom, dia) => [{ slot: 'wheel', count: 4, connectors: [{ type: 'wheel_hub', side: 'b' }], dimensions_m: { diameter: dia, width: 1 }, atom }];
  const ok = await validate(bp(slot('prop_wheel_01@1.0.0', 0.128)), { registry, library: wheelLib });
  assert.equal(status(ok, 'Blueprint').status, 'PASS', status(ok, 'Blueprint').messages.join('|'));
  failing(await validate(bp(slot('prop_wheel_01@1.0.0', 0.2)), { registry, library: wheelLib }), 'Blueprint', 'mating dimension', 'diameter');
  failing(await validate(bp(slot('prop_wheel_01@2.0.0', 0.128)), { registry, library: wheelLib }), 'Blueprint', 'not a merged version');
  assert.equal(status(await run(bp(slot('new', 0.128))), 'Blueprint').status, 'PASS');
});

test('Variation (atom): malformed declared ranges fail; well-formed ones pass; connector inside a stretch span fails', async () => {
  failing(await run(atomIn('prop_box_01', { meta: { variation: { scale: [1.3, 0.8] } } })), 'Variation', 'variation.scale');
  failing(await run(atomIn('prop_box_02', { meta: { variation: { open_slots: [{ slot: 'leaves', materials: [] }] } } })), 'Variation', 'open_slots[0]');
  const span = { name: 'length', mode: 'stretch', axis: 'x', between_m: [0.2, 0.8], range_m: [2, 7] };
  failing(await run(atomIn('prop_box_03', { glb: { connectors: [conn('conn_door_hinge_a_01', [0.5, 0, 0], 90)] }, meta: { variation: { spans: [span] } } })), 'Variation', 'inside the stretch span');
  const ok = await run(atomIn('prop_box_04', { meta: { variation: { scale: [0.8, 1.3], open_slots: [{ slot: 'leaves', materials: ['mat_brick_01'] }] } } }));
  assert.equal(status(ok, 'Variation').status, 'PASS');
  assert.equal(status(await run(atomIn('prop_box_05')), 'Variation').status, 'SKIP');
});

test('Variation (atom): the scale range a task asks for must be allowed by asset.json', async () => {
  const task = { task: { variation: { scale: { x: [0.05, 1.5], y: [0.01, 2.2] } } } };
  failing(await run(atomIn('prop_box_01'), task), 'Variation', 'declares no valid variation.scale');
  failing(await run(atomIn('prop_box_02', { meta: { variation: { scale: { x: [0.05, 1.5], y: [0.5, 2.2] } } } }), task), 'Variation', 'scale y from 0.01 to 2.2', 'allows 0.5 to 2.2');
  failing(await run(atomIn('prop_box_03', { meta: { variation: { scale: { x: [0.05, 1.5] } } } }), task), 'Variation', 'scale y', 'allows 1 to 1');
  failing(await run(atomIn('prop_box_04', { meta: { variation: { scale: [0.01, 2.2] } } }), task), 'Variation', 'even range');
  const ok = await run(atomIn('prop_box_05', { meta: { variation: { scale: { x: [0.05, 2], y: [0.01, 2.2] } } } }), task);
  assert.equal(status(ok, 'Variation').status, 'PASS', status(ok, 'Variation').messages.join('|'));
  const even = { task: { variation: { scale: [0.8, 1.2] } } };
  assert.equal(status(await run(atomIn('prop_box_06', { meta: { variation: { scale: [0.5, 1.5] } } }), even), 'Variation').status, 'PASS');
  const short = await run(atomIn('prop_box_07', { meta: { variation: { scale: [0.9, 1.5] } } }), even);
  failing(short, 'Variation', 'even scale from 0.8 to 1.2');
  assert.equal(status(short, 'Variation').messages.length, 1);
  for (const bad of [{ scale_range: [1, 2] }, 's', [], 5, null]) failing(await run(atomIn('prop_box_08', { meta: { variation: { scale: [0.5, 2] } } }), { task: { variation: bad } }), 'Variation', "the task's \"variation\"");
  failing(await run(atomIn('prop_box_09', { meta: { variation: null } })), 'Variation', 'must be an object');
});

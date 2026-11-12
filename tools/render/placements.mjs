// Where every mesh of an asset sits, for the renderer: an atom is one file at the origin, and a
// molecule is every atom it places, through nested molecules, each with the matrix that the
// validator's own analysis gives it. Nothing here decides a position; a molecule that the
// validator cannot place is not rendered.
import path from 'node:path';
import { loadAssetDir, defaultLibrary } from '../../validator/lib/context.mjs';
import { loadProfile } from '../../validator/lib/profile.mjs';
import { loadRegistry } from '../../validator/lib/registry.mjs';
import { analyzeMolecule, entryScale } from '../../validator/lib/library.mjs';
import { mul, identity } from '../../validator/lib/math.mjs';

// Column-major 4x4, as the validator's math uses: mirror in the entry's own x, then scale.
const mirrorScale = (sv, mirrored) => [(mirrored ? -1 : 1) * sv[0], 0, 0, 0, 0, sv[1], 0, 0, 0, 0, sv[2], 0, 0, 0, 0, 1];

export function placements(dir, opts = {}) {
  const abs = path.resolve(dir);
  const asset = loadAssetDir(abs);
  if (asset.dirError) return { error: asset.dirError };
  if (asset.kind === 'atom') {
    if (!asset.glb) return { error: asset.glbError || 'asset.glb could not be read' };
    return { kind: 'atom', asset_id: path.basename(abs), meshes: [{ glb: path.join(abs, 'asset.glb'), matrix: identity() }] };
  }
  if (asset.kind !== 'molecule') return { error: `${path.basename(abs)} holds neither asset.glb nor molecule.json, so there is nothing to render` };
  if (!asset.manifest) return { error: asset.manifestError || 'molecule.json could not be read' };
  const ctx = { dir: abs, asset, profile: loadProfile(opts.profile), registry: loadRegistry(opts.registry), task: null, libDir: path.resolve(opts.library || defaultLibrary()) };
  const res = analyzeMolecule(abs, asset.manifest, asset.meta, ctx);
  if (res.errors.length) return { error: `the molecule does not assemble, so it is not rendered: ${res.errors.slice(0, 5).join('; ')}${res.errors.length > 5 ? `; and ${res.errors.length - 5} more` : ''}` };
  const meshes = [];
  const visit = (r, up) => {
    for (const [ref, ent] of r.entries) {
      const pose = r.poses.get(ref);
      if (!ent.rec || !pose) continue;
      const m = mul(up, mul(pose, mirrorScale(entryScale(ent.entry), ent.entry.mirror === true)));
      if (ent.rec.kind === 'atom') { if (ent.rec.asset.glb) meshes.push({ glb: path.join(ent.rec.dir, 'asset.glb'), matrix: m }); }
      else if (ent.rec.nested) visit(ent.rec.nested, m);
    }
  };
  visit(res, identity());
  if (!meshes.length) return { error: 'the molecule places no atom that has a mesh' };
  return { kind: 'molecule', asset_id: path.basename(abs), meshes };
}

import { analyzeMolecule } from '../lib/library.mjs';

// One analysis per molecule folder per run.
export function analyze(ctx) {
  if (ctx.asset.kind !== 'molecule') return null;
  if (!ctx._analysis) {
    ctx._analysis = ctx.asset.manifest
      ? analyzeMolecule(ctx.dir, ctx.asset.manifest, ctx.asset.meta, ctx)
      : { errors: [ctx.asset.manifestError || 'molecule.json is missing'], entries: new Map(), poses: new Map(), exposed: new Map(), joints: [], triangles: 0, loopChecks: 0 };
  }
  return ctx._analysis;
}

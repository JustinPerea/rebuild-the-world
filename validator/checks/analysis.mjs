import { analyzeAssembly } from '../lib/library.mjs';

// One analysis per assembly folder per run.
export function analyze(ctx) {
  if (ctx.asset.kind !== 'assembly') return null;
  if (!ctx._analysis) {
    ctx._analysis = ctx.asset.manifest
      ? analyzeAssembly(ctx.dir, ctx.asset.manifest, ctx.asset.meta, ctx)
      : { errors: [ctx.asset.manifestError || 'assembly.json is missing'], entries: new Map(), poses: new Map(), exposed: new Map(), joints: [], triangles: 0, loopChecks: 0 };
  }
  return ctx._analysis;
}

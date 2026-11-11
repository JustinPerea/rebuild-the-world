import path from 'node:path';
import { loadAssetDir, defaultLibrary } from './lib/context.mjs';
import { loadProfile } from './lib/profile.mjs';
import { loadRegistry } from './lib/registry.mjs';
import * as core from './checks/core.mjs';
import * as st from './checks/structure.mjs';

// Names and order are the "Automated checks" table in docs/asset-spec.md.
export const CHECKS = [
  ['File validity', 'Contract', core.fileValidity],
  ['Folder and naming', 'Contract', core.folderAndNaming],
  ['Metadata', 'Contract', core.metadata],
  ['Scale', 'Profile', core.scale],
  ['Transforms', 'Contract', core.transforms],
  ['Triangle budget', 'Profile', core.triangleBudget],
  ['Mesh health', 'Profile', core.meshHealth],
  ['Connectors', 'Contract', st.connectors],
  ['Assembly', 'Contract', st.assembly],
  ['Variation', 'Contract', st.variation],
  ['Blueprint', 'Contract', st.blueprint],
  ['Reuse', 'Contract', st.reuse],
  ['Clip', 'Contract', st.clip],
  ['Collision', 'Profile', core.collision],
  ['Textures', 'Profile', core.textures],
  ['Materials', 'Profile', core.materials],
  ['File size', 'Profile', core.fileSize],
  ['Licence', 'Contract', core.licence],
];

export async function validate(dir, opts = {}) {
  const profile = loadProfile(opts.profile);
  const registry = loadRegistry(opts.registry);
  const asset = loadAssetDir(path.resolve(dir));
  const ctx = {
    dir: path.resolve(dir), asset, profile, registry, task: opts.task ?? null,
    libDir: path.resolve(opts.library || defaultLibrary()),
  };
  const checks = [];
  for (const [name, source, fn] of CHECKS) {
    let r;
    try {
      r = await fn(ctx);
    } catch (e) {
      r = { status: 'FAIL', messages: [`validator error in this check (report it): ${e.stack?.split('\n').slice(0, 3).join(' | ') || e.message}`] };
    }
    checks.push({ name, status: r.status, source, messages: r.messages || [] });
  }
  const count = (s) => checks.filter((c) => c.status === s).length;
  return {
    asset: path.basename(ctx.dir),
    kind: asset.kind,
    spec_version: profile.spec_version,
    profile: profile.name,
    checks,
    summary: { pass: count('PASS'), fail: count('FAIL'), skip: count('SKIP'), ok: count('FAIL') === 0 },
  };
}

export function formatHuman(report) {
  const lines = [`${report.asset}  (${report.kind ?? 'unknown kind'}; spec ${report.spec_version}; ${report.profile})`];
  for (const c of report.checks) {
    lines.push(`${c.status.padEnd(4)}  ${c.name}`);
    for (const m of c.messages) lines.push(`        ${m}`);
  }
  const s = report.summary;
  lines.push(`${s.ok ? 'OK' : 'FAILED'}: ${s.pass} passed, ${s.fail} failed, ${s.skip} skipped`);
  return lines.join('\n');
}

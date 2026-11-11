#!/usr/bin/env node
// Fails when spec/spec.json and the prose specs in docs/ disagree.
// spec.json feeds the visualizer (and later the validator), so a number changed in
// one place and not the other would otherwise go unnoticed.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(readFileSync(join(root, "spec/spec.json"), "utf8"));
const docs = {};
const lines = (doc) => (docs[doc] ??= readFileSync(join(root, "docs", doc), "utf8").split("\n"));
const fmt = (n) => n.toLocaleString("en-US");
const failures = [];

// Passes when one line of the doc contains every string.
function row(doc, what, ...parts) {
  if (!lines(doc).some((l) => parts.every((p) => l.includes(String(p))))) {
    failures.push(`${doc}: no line has ${what}: ${parts.map((p) => JSON.stringify(String(p))).join(" + ")}`);
  }
}

for (const l of spec.layers) {
  if (!existsSync(join(root, l.doc))) failures.push(`layer "${l.name}": ${l.doc} does not exist`);
  else row(l.doc.replace("docs/", ""), "its version", `(Draft ${l.version})`);
  row("vision.md", "the layer", `| ${l.name} |`, l.question);
}
for (const d of spec.durable) row("vision.md", "the durable item", `| ${d.what} |`, d.why);
for (const s of spec.scale_levels) row("world-model.md", "the scale level", `| ${s.n} ${s.name} |`, s.what, s.example, s.built);
for (const k of spec.asset_kinds) row("world-model.md", "the asset kind", `| ${k.name} |`, k.what, k.placed);
for (const a of spec.accuracy_levels) row("world-model.md", "the accuracy level", `| ${a.id} |`, a.name, a.meaning, a.example);
for (const c of spec.categories) {
  row("world-model.md", "the category", `\`${c.code}\``, c.name, c.status);
  row("asset-spec.md", "the category code", "Categories are", `\`${c.code}\``);
}
for (const b of spec.behaviours) row("world-model.md", "the behaviour", "First behaviours", `\`${b}\``);
for (const r of spec.accuracy_rules) row("accuracy-and-data.md", "the accuracy rule", `| ${r.subject}`, `| ${r.rule}`, r.reason);
row("asset-spec.md", "the connector pattern", `\`${spec.connector.pattern}\``, `\`${spec.connector.example}\``);
for (const m of spec.connector.mate_rules) row("asset-spec.md", "the mating rule", m);
for (const f of spec.connector.registry_fields) row("asset-spec.md", "the registry field", `| \`${f}\` |`);
for (const m of spec.connector.motions) row("asset-spec.md", "the motion", "| `motion` |", `\`${m}\``);
for (const v of spec.variation) row("asset-spec.md", "the variation kind", `| ${v.what} |`, v.declared, v.chosen, v.example);
for (const l of spec.libraries) {
  row("vision.md", "the library", `- ${l.name} is`);
  row("asset-spec.md", "the library", `- **${l.name}** is`);
}
row("capability-profiles.md", "the connector tolerance", spec.connector.tolerance);
row("capability-profiles.md", "the profile name", `## ${spec.profile.name}`);
for (const b of spec.profile.budgets) row("capability-profiles.md", "the budget", `| ${b.class} |`, b.examples, `| ${fmt(b.triangles)} |`);
for (const l of spec.profile.limits) row("capability-profiles.md", "the limit", l.rule, l.value);
for (const t of spec.tiers) {
  row("capability-profiles.md", "the tier", `| ${t.n} ${t.name} |`, t.holds_at, t.feature, `${fmt(t.px_per_m)} pixels per metre`);
  row("art-style-guide.md", "the tier", `| ${t.n} ${t.name} |`, t.feature, `${fmt(t.px_per_m)} pixels per metre`, t.status);
}
spec.principles.forEach((p, i) => row("art-style-guide.md", "the principle", `${i + 1}. **${p}**`));
spec.workflow.forEach((w, i) => row("claim-system-spec.md", "the workflow step", `${i + 1}. **${w.name}.** ${w.what}`));
spec.fit_rules.forEach((r, i) => row("asset-spec.md", "the fit rule", `${i + 1}. ${r}`));
for (const st of spec.slot_states) row("claim-system-spec.md", "the slot state", `| ${st.name} | ${st.meaning} |`);
row("asset-spec.md", "the example object", `"object_id": "${spec.example_blueprint.object_id}"`);
for (const sl of spec.example_blueprint.slots) row("asset-spec.md", "the example slot", `"slot": "${sl.slot}"`, `"count": ${sl.count}`);
for (const t of spec.mcp_tools) row("contributor-service.md", "the MCP tool", `| \`${t.tool}\` | ${t.what} |`);
spec.service_rules.forEach((r, i) => row("contributor-service.md", "the service rule", `${i + 1}. **${r.name}** ${r.what}`));
for (const f of [...spec.provenance.declared, ...spec.provenance.stamped]) row("asset-spec.md", "the provenance field", `| \`${f.field}\` | ${f.what} |`);
for (const s of spec.task_sizes) {
  row("claim-system-spec.md", "the task size", `| ${s.size} |`, s.what);
  row("claim-system-spec.md", "the claim window", `| ${s.size} |`, s.window, s.warning, s.extension);
}
row("claim-system-spec.md", "the state count", `${["zero", "one", "two", "three", "four", "five", "six", "seven"][spec.task_states.length]} states`);
for (const t of spec.transitions) row("claim-system-spec.md", "the transition", `| ${t.from} | ${t.to} | ${t.trigger} |`);
for (const t of spec.trust_levels) {
  row("claim-system-spec.md", "the trust level", `| ${t.n} ${t.name} |`, t.reach, `| ${t.claims} |`, t.sizes, `| ${t.open_prs} |`);
  row("claim-system-spec.md", "the spec role", t.spec_role);
}
spec.review_gates.forEach((g, i) => row("claim-system-spec.md", "the review gate", `${i + 1}. **${g.name}.**`));
for (const c of spec.checks) row("asset-spec.md", "the check", `| ${c.name} |`, `| ${c.source} |`);
const checkRows = lines("asset-spec.md").filter((l) => /\| (Contract|Profile) \|\s*$/.test(l)).length;
if (checkRows !== spec.checks.length) failures.push(`asset-spec.md lists ${checkRows} checks, spec.json has ${spec.checks.length}`);

if (failures.length) {
  console.error(`spec.json and docs/ disagree (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("spec.json matches docs/");

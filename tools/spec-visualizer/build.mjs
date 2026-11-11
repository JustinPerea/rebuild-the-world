#!/usr/bin/env node
// Builds the spec visualizer from spec/spec.json and the open questions in docs/.
//
//   node tools/spec-visualizer/build.mjs                 -> tools/spec-visualizer/dist/index.html (opens from disk)
//   node tools/spec-visualizer/build.mjs --body <file>   -> also writes a body-only page (no doctype/head), for
//                                                           hosts that wrap pages in their own skeleton
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const spec = JSON.parse(readFileSync(join(root, "spec/spec.json"), "utf8"));

// Open questions are read straight from the docs, so the page cannot drift from them.
const open = readdirSync(join(root, "docs"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const text = readFileSync(join(root, "docs", f), "utf8");
    const title = (text.match(/^# (?:Rebuild the World: )?(.+?)(?: \(Draft.*\))?$/m) || [, f])[1];
    const items = [...text.matchAll(/^- \[ \] (.+)$/gm)].map((m) => m[1]);
    return { doc: `docs/${f}`, title, items };
  })
  .filter((d) => d.items.length)
  .sort((a, b) => b.items.length - a.items.length);

// "<" is escaped so no string in the data can close the script tag.
const json = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
const template = readFileSync(join(here, "template.html"), "utf8");
if (!template.includes("/*SPEC*/null") || !template.includes("/*OPEN*/[]")) throw new Error("template.html is missing a data placeholder");
const body = template.replace("/*SPEC*/null", () => json(spec)).replace("/*OPEN*/[]", () => json(open));

mkdirSync(join(here, "dist"), { recursive: true });
const title = (body.match(/<title>(.*?)<\/title>/) || [, "Spec Map"])[1];
const page = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title}</title>\n</head>\n<body>\n${body.replace(/<title>.*?<\/title>\n?/, "")}</body>\n</html>\n`;
writeFileSync(join(here, "dist/index.html"), page);
console.log(`dist/index.html  (${open.reduce((a, d) => a + d.items.length, 0)} open questions from ${open.length} docs)`);

const i = process.argv.indexOf("--body");
if (i > -1) {
  const out = process.argv[i + 1];
  if (!out) throw new Error("--body needs a file path");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body);
  console.log(out);
}

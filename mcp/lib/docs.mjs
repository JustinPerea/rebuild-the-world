// get_rules: one section of one spec document, with the version.
import fs from 'node:fs';
import path from 'node:path';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Documents are the spec.json layers, so only files the maintainers listed can be read.
export function documentList(spec) {
  return (spec.layers || []).map((l) => ({
    layer: l.id,
    document: path.basename(l.doc, path.extname(l.doc)),
    path: l.doc,
    version: l.version,
    status: l.status,
    answers: l.question,
  }));
}

export function resolveDocument(spec, name) {
  const docs = documentList(spec);
  const key = norm(name);
  if (!key) return null;
  const exact = docs.filter((d) => [d.layer, d.document, d.path, (spec.layers.find((l) => l.id === d.layer) || {}).name].some((x) => norm(x) === key));
  if (exact.length === 1) return exact[0];
  const loose = docs.filter((d) => norm(d.document).includes(key) || norm(d.path).includes(key));
  return loose.length === 1 ? loose[0] : null;
}

export function parseHeadings(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, title: m[2], line: i });
  });
  return { lines, headings: out };
}

export function getSection(text, heading) {
  const { lines, headings } = parseHeadings(text);
  const key = norm(heading);
  const pick = headings.find((h) => norm(h.title) === key) || headings.find((h) => norm(h.title).startsWith(key)) || headings.find((h) => norm(h.title).includes(key));
  if (!pick) return { found: false, headings: headings.map((h) => `${'#'.repeat(h.level)} ${h.title}`) };
  const next = headings.find((h) => h.line > pick.line && h.level <= pick.level);
  const end = next ? next.line : lines.length;
  return { found: true, heading: pick.title, level: pick.level, text: lines.slice(pick.line, end).join('\n').trimEnd() };
}

export function readDoc(repo, entry) {
  const file = path.join(repo, ...entry.path.split('/'));
  return fs.readFileSync(file, 'utf8');
}

// "# Rebuild the World: Asset Spec (Draft v0.4)" -> "v0.4"
export function headerVersion(text) {
  const m = /\(Draft (v[\d.]+)\)/.exec(text.split(/\r?\n/, 1)[0] || '');
  return m ? m[1] : null;
}

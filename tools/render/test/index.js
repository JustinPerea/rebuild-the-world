// Node 21 and later treat `node --test tools/render/test/` as a file argument and load this index.
// Node 20 scans the folder and runs each *.test.mjs itself, so this file does nothing there.
if (Number(process.versions.node.split('.')[0]) >= 21) {
  await import('./render.test.mjs');
}

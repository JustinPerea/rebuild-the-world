// Node 21 and later treat `node --test validator/test/` as a file argument and load this index.
// Node 20 scans the folder and runs each *.test.mjs itself, so this file does nothing there.
if (Number(process.versions.node.split('.')[0]) >= 21) {
  await import('./checks.test.mjs');
  await import('./assembly.test.mjs');
  await import('./scaled.test.mjs');
  await import('./cli.test.mjs');
}

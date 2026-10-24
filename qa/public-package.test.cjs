/* Fresh-artifact and negative coverage for the test-only production packager
   fixture. All missing/stale/tampered/broken-copy cases live in unique temp
   workspaces; no cached repository public/ or product sources are modified. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { buildPublic, publicParity, PARITY_FILES } = require('./public-package.cjs');
const root = path.resolve(__dirname, '..');
const builds = [];
let passed = 0;
function check(name, condition) { assert.ok(condition, name); passed++; console.log('  ok - ' + name); }
function build(source) { const result = buildPublic(source); builds.push(result); return result; }
function fingerprint(directory) {
  return PARITY_FILES.map(file => {
    const p = path.join(directory, file);
    return fs.existsSync(p) ? [file, fs.readFileSync(p).toString('base64'), fs.statSync(p).mtimeMs] : [file, null];
  });
}
try {
  const sourceBefore = fingerprint(root);
  const localOutput = path.join(root, 'platform/cloudflare/public');
  const cachedBefore = fingerprint(localOutput);
  const knowledge = path.join(root, 'platform/studio-knowledge.mjs');
  const knowledgeBefore = fs.readFileSync(knowledge);
  const fixture = build(root);
  check('actual unchanged production packager runs successfully in isolation', /Synced public/.test(fixture.log));
  for (const item of publicParity(root, fixture.publicRoot)) check('fresh artifact matches source: ' + item.file, item.ok);

  fs.rmSync(fixture.publicRoot, { recursive: true });
  const clean = build(fixture.workspace);
  check('clean source without any public/ builds passing artifact', publicParity(fixture.workspace, clean.publicRoot).every(item => item.ok));
  check('clean source is not polluted with generated public/', !fs.existsSync(fixture.publicRoot));

  // Model the reviewer's old local cache. It remains stale, but cannot be used
  // as the test artifact or silently repaired by an independent parity run.
  for (const file of PARITY_FILES) {
    const p = path.join(fixture.publicRoot, file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'old cached output\n');
  }
  check('direct comparator rejects every deliberately stale cached mirror', publicParity(fixture.workspace, fixture.publicRoot).every(item => !item.ok));
  const staleBefore = fingerprint(fixture.publicRoot);
  const fresh = build(fixture.workspace);
  check('stale source cache cannot poison freshly built artifact', publicParity(fixture.workspace, fresh.publicRoot).every(item => item.ok));
  check('packaging fixture does not silently repair the stale source cache', JSON.stringify(staleBefore) === JSON.stringify(fingerprint(fixture.publicRoot)));

  for (const file of ['assets/js/dashboard.js', 'dashboard.html', 'assets/js/settings-connections.js', 'assets/css/settings-connections.css', 'assets/css/workspace-fit.css', 'assets/css/bess.css', 'assets/js/system-image-frame.js']) {
    const output = path.join(fresh.publicRoot, file);
    fs.appendFileSync(output, '\n/* deliberately wrong built bytes */\n');
    const verdict = publicParity(fixture.workspace, fresh.publicRoot);
    check('NEGATIVE: built-byte drift independently fails: ' + file,
      verdict.filter(item => !item.ok).length === 1 && verdict.some(item => item.file === file && !item.ok));
    fs.copyFileSync(path.join(fixture.workspace, file), output);
  }
  fs.rmSync(path.join(fresh.publicRoot, 'dashboard.html'));
  check('NEGATIVE: missing packaged dashboard.html fails', publicParity(fixture.workspace, fresh.publicRoot).some(item => item.file === 'dashboard.html' && !item.ok));

  // Prove that invoking the packager is not enough to pass C5: a broken copy
  // implementation must still be caught by the post-build byte comparisons.
  const packager = path.join(fixture.workspace, 'platform/cloudflare/sync-public.js');
  const source = fs.readFileSync(packager, 'utf8');
  assert.ok(source.includes('function copyFile(src, dest) {'));
  fs.writeFileSync(packager, source.replace('function copyFile(src, dest) {',
    "function copyFile(src, dest) {\n  if (path.basename(src) === 'dashboard.js') return;"));
  const broken = build(fixture.workspace);
  check('NEGATIVE: faulty production copy implementation fails despite successful build exit',
    publicParity(fixture.workspace, broken.publicRoot).some(item => item.file === 'assets/js/dashboard.js' && !item.ok));

  check('repository source files and mtimes unchanged', JSON.stringify(sourceBefore) === JSON.stringify(fingerprint(root)));
  check('repository cached public files and mtimes unchanged', JSON.stringify(cachedBefore) === JSON.stringify(fingerprint(localOutput)));
  check('tracked assistant knowledge unchanged', fs.readFileSync(knowledge).equals(knowledgeBefore));
} finally {
  for (const result of builds.reverse()) result.cleanup();
}
check('all isolated build workspaces cleaned', builds.every(result => !fs.existsSync(result.workspace)));
console.log(`RESULT: ${passed} passed, 0 failed`);

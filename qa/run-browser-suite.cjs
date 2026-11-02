#!/usr/bin/env node
/* Run every browser suite file on its own.
 *
 * `npm run test:browser` chains the files with &&, so the first stale file
 * hides all the ones after it: the job says "failed" and nothing about how
 * much of the suite is actually healthy. This runner executes each file in
 * turn, keeps going after a failure, prints a per-file verdict, and exits
 * non-zero if any file failed - so one red run answers "which files are
 * stale" instead of "something before this one broke".
 *
 * Usage:  QA_BASE=http://127.0.0.1:8787 node qa/run-browser-suite.cjs
 *         node qa/run-browser-suite.cjs array-size brand-engineering   # subset
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const QA_DIR = __dirname;
const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(QA_DIR, 'package.json'), 'utf8'));

/* The canonical order lives in package.json; split it instead of keeping a
   second copy that can drift. */
const chain = String(pkg.scripts['test:browser'] || '')
  .split('&&')
  .map((part) => part.trim())
  .filter(Boolean)
  .map((part) => part.replace(/^node\s+/, '').trim());

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const files = wanted.length ? chain.filter((f) => wanted.some((w) => f.includes(w))) : chain;

if (!files.length) {
  console.error('No browser suite files matched.');
  process.exit(2);
}

const results = [];
for (const file of files) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [file], {
    cwd: QA_DIR,
    env: { ...process.env, QA_BASE: process.env.QA_BASE || 'http://127.0.0.1:8787' },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const ms = Date.now() - started;
  const out = `${run.stdout || ''}${run.stderr || ''}`;
  const ok = run.status === 0;
  results.push({ file, ok, ms, out });
  const tail = out.trim().split('\n').slice(-1)[0] || '';
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${file}  (${(ms / 1000).toFixed(1)}s)${ok ? '' : '  ' + tail}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser files passed`);
if (failed.length) {
  console.log('Failed files:');
  for (const f of failed) {
    const lines = f.out.trim().split('\n');
    const why = lines.find((l) => /AssertionError|TimeoutError|Evaluation failed|not clickable|Error:/.test(l)) || lines.slice(-1)[0];
    /* The last passing check says where in the file the run stopped, so a
       report of one stale check does not read like the whole file is broken. */
    const lastPass = [...lines].reverse().find((l) => l.trim().startsWith('✓'));
    console.log(`  - ${f.file}: ${String(why).trim().slice(0, 200)}${lastPass ? '  [after: ' + lastPass.trim().slice(2, 80) + ']' : ''}`);
  }
  process.exitCode = 1;
}

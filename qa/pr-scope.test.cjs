/* PR-scope guard test — positive coverage on this checkout plus NEGATIVE
   coverage (the Space directive of 2026-10-23): deliberately mutating a
   frozen file, touching a deploy config, or stepping outside the allowlist
   MUST fail the guard. The negative half runs entirely inside a throwaway
   git repo under this suite's temp dir - this checkout is never mutated.
   Run: node pr-scope.test.cjs */
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const guard = require('./pr-scope-guard.cjs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗ FAIL:', name, extra !== undefined ? '→ ' + String(extra).slice(0, 300) : ''); }
};

/* -------- throwaway repo helper: two-commit base→head fixture -------- */
function tmpRepo(dir, baseFiles, headEdits) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const env = { ...process.env };
  const run = (args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env });
    if (r.status !== 0) throw new Error('git ' + args.join(' ') + ' → ' + r.status + ' ' + r.stderr);
    return r.stdout;
  };
  for (const [rel, text] of Object.entries(baseFiles)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  run(['init', '-q']);
  run(['add', '-A']);
  run(['-c', 'user.email=qa@example', '-c', 'user.name=qa', 'commit', '-q', '--allow-empty', '-m', 'base']);
  const base = run(['rev-parse', 'HEAD']).trim();
  if (baseFiles !== headEdits) {
    for (const [rel, text] of Object.entries(headEdits)) {
      const p = path.join(dir, rel);
      if (text === null) fs.rmSync(p);
      else { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
    }
  }
  run(['add', '-A']);
  run(['-c', 'user.email=qa@example', '-c', 'user.name=qa', 'commit', '-q', '--allow-empty', '-m', 'head']);
  return { run, base };
}

const FIN = () => guard.FROZEN_FILES[0]; /* assets/js/finance.js */
const BRIDGE = () => guard.FROZEN_FILES[1]; /* assets/js/cloud-bridge.js */
const WRANGLER = 'platform/cloudflare/wrangler.git.toml';

async function main() {
  console.log('\npr-scope guard (correct comparison base, explicit golden baseline, deploy-config detection)');

  /* ================= POSITIVE: this checkout ================= */
  const v = guard.verify(ROOT);
  t('comparison base resolves in this checkout', !!v.base && !!v.base.ref, JSON.stringify(v.base));
  t('resolved base is a real commit', v.base && v.base.ref.length === 40, v.base && v.base.ref);
  t('PR scope = test-only files (guard + suite + patched parity), nothing else',
    v.changed.every((f) => /^qa\//.test(f)) && v.changed.length <= 4, JSON.stringify(v.changed));

  t('FROZEN files untouched in PR scope', v.frozen.length === 0, JSON.stringify(v.frozen));
  t('deploy config untouched in PR scope (no exceptions granted)', v.deploy.length === 0, JSON.stringify(v.deploy));
  t('changed files are inside the (unwidened) allowlist', v.scope.length === 0, JSON.stringify(v.scope));

  const bl = guard.baselineMatch(ROOT);
  t('golden baseline checked for every frozen-family file', bl.length === guard.FROZEN_FILES.length && bl.every((b) => b.ok),
    JSON.stringify(bl.filter((b) => !b.ok).map((b) => b.file)));
  const byName = Object.fromEntries(bl.map((b) => [b.file, b.ok]));
  t('quote-calc freeze pinned explicitly: finance.js byte-identical to 8cc7db1', byName[FIN()] === true);
  t('quote-calc freeze pinned explicitly: cloud-bridge.js byte-identical to 8cc7db1', byName[BRIDGE()] === true);

  /* ================= NEGATIVE: throwaway repos ================= */
  /* base tree = FULL pristine frozen family; head sneaks in: frozen mutation,
     deploy-config edit and an out-of-scope file. The base tree sha stands in
     for 8cc7db1 inside the throwaway repo, so every golden baseline entry is
     a real blob compare - no absent-ref shortcut anywhere. Throwaway repos
     live under the OS temp dir (never inside the checkout) and are removed
     on the way out. */
  const TMPROOT = path.join(require('os').tmpdir(), 'pr-scope-negatives');
  const dir = path.join(TMPROOT, 'negative');
  try {
    const mk = (k) => Array.from({ length: k }, (_, i) => 'const x' + i + ' = ' + i + ';  calculate has been frozen\n').join('');
    const pristineFamily = () => Object.fromEntries(guard.FROZEN_FILES.map((f, i) => [f, mk(10 + i * 3)]));
    const repo = tmpRepo(dir, Object.assign(pristineFamily(), { [WRANGLER]: 'name = "tmp"\n', 'qa/sentinel.txt': 'base\n' }),
      Object.fromEntries([
        [FIN(), mk(41)], /* deliberately frozen file MUTATED */
        [BRIDGE(), mk(39)], /* the second quote file MUTATED too */
        [WRANGLER, 'name = "tmp"\naccount_id = "_changed"\n'], /* deploy config touched */
        ['misc/stray.js', 'stray\n'] /* outside the allowlist */
      ]));

    const vBad = guard.verify(dir, { base: repo.base, goldenRef: repo.base });
    t('tmp fixture: guard runs base→head', Array.isArray(vBad.changed) && vBad.changed.length >= 3, JSON.stringify(vBad.changed));
    t('NEGATIVE: mutated frozen file is detected (finance.js)', vBad.frozen.includes(FIN()), JSON.stringify(vBad.frozen));
    t('NEGATIVE: mutated frozen file is detected (cloud-bridge.js)', vBad.frozen.includes(BRIDGE()), JSON.stringify(vBad.frozen));
    t('NEGATIVE: deploy-config edit is detected (wrangler*.toml, no exception)', vBad.deploy.includes(WRANGLER), JSON.stringify(vBad.deploy));
    t('NEGATIVE: out-of-scope file is detected', vBad.scope.includes('misc/stray.js'), JSON.stringify(vBad.scope));
    t('NEGATIVE: guard verdict on the tampered tree is NOT ok', vBad.ok === false, JSON.stringify({ frozen: vBad.frozen, deploy: vBad.deploy }));
    t('NEGATIVE: golden blob-compare catches the in-tree mutation (mutated blobs differ from base)',
      vBad.baseline.filter((b) => [FIN(), BRIDGE()].includes(b.file)).every((b) => !b.ok && b.base && b.head && b.base !== b.head),
      JSON.stringify(vBad.baseline.filter((b) => [FIN(), BRIDGE()].includes(b.file))));
    t('NEGATIVE: the other eight family members stay ok:true (no over-flagging)',
      vBad.baseline.filter((b) => ![FIN(), BRIDGE()].includes(b.file)).every((b) => b.ok),
      JSON.stringify(vBad.baseline.filter((b) => !b.ok && ![FIN(), BRIDGE()].includes(b.file))));

    /* list-level detection helpers catch even a plain mention */
    t('helper: frozenTouches flags finance.js + cloud-bridge.js only',
      JSON.stringify(guard.frozenTouches([FIN(), BRIDGE(), 'assets/js/dashboard.js'])) === JSON.stringify([FIN(), BRIDGE()]));
    t('helper: deployConfigTouches flags deploy configs it sees, nothing else',
      JSON.stringify(guard.deployConfigTouches([WRANGLER, 'platform/cloudflare/wrangler.toml', 'vercel.json', 'src/app.ts']))
        === JSON.stringify([WRANGLER, 'platform/cloudflare/wrangler.toml', 'vercel.json']));

    /* and the CLEAN throwaway repo proves the guard does not false-positive */
    const dirClean = dir + '-clean';
    const repo2 = tmpRepo(dirClean, Object.assign(pristineFamily(), { 'misc/stray.js': 'stray in base, not in scope\n' }),
      Object.fromEntries([['qa/log.txt', 'clean head change\n']]));
    const vClean = guard.verify(dirClean, { base: repo2.base, goldenRef: repo2.base });
    t('control: clean tmp repo passes the guard end to end (ok:true, zero violations)',
      vClean.ok === true && vClean.frozen.length === 0 && vClean.deploy.length === 0 && vClean.scope.length === 0,
      JSON.stringify({ frozen: vClean.frozen, deploy: vClean.deploy, scope: vClean.scope, ok: vClean.ok }));
    t('control: every pristine family member is ok:true under the golden compare (no false positives)',
      vClean.baseline.length === guard.FROZEN_FILES.length && vClean.baseline.every((b) => b.ok),
      JSON.stringify(vClean.baseline.filter((b) => !b.ok)));
    /* a head commit that rewrites a frozen file with IDENTICAL content is not a violation */
    const repo3 = tmpRepo(dir + '-rewrite', pristineFamily(),
      Object.fromEntries(guard.FROZEN_FILES.map((f, i) => [f, mk(10 + i * 3)])));
    const vSame = guard.verify(dir + '-rewrite', { base: repo3.base, goldenRef: repo3.base });
    t('control: identical-content re-adds are not flagged as frozen violations',
      vSame.frozen.length === 0 && vSame.baseline.every((b) => b.ok) === true, JSON.stringify(vSame.frozen));
  } finally {
    try { fs.rmSync(TMPROOT, { recursive: true, force: true }); } catch (_) {}
    try { execFileSync('git', ['worktree', 'prune']); } catch (_) {}
  }

  console.log('\n==== RESULT: ' + pass + ' passed, ' + fail + ' failed ====');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

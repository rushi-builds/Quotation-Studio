/* PR-scope guard test — positive coverage on this checkout plus NEGATIVE
   coverage: deliberately mutating a frozen file, touching a deploy config,
   stepping outside the allowlist, RENAMING a protected config (rename
   detection must not hide it), MOVING an out-of-scope file into qa/
   (rename source must not vanish), COMMITTED deploy-config / out-of-scope
   edits masked by a worktree restoration (committed verdict must win), and
   worktree-noise controls (hygiene never flips the committed verdict).

   Each scenario runs in its OWN mkdtemp throwaway git repo under the OS
   temp dir (this checkout is never mutated, concurrent runs never collide,
   and everything is removed at the end). Run: node pr-scope.test.cjs */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const guard = require('./pr-scope-guard.cjs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ FAIL: ' + name + (extra !== undefined ? '  → ' + String(extra).slice(0, 300) : '')); }
};

/* throwaway repos, created exactly once per name (cached), each inside its
   own mkdtemp root so parallel suites cannot collide. */
let tmproot = null;
const cache = new Map();
function repo(name, baseFiles, headEdits) {
  if (cache.has(name)) return cache.get(name);
  const dir = fs.mkdtempSync(path.join(tmproot, name + '-'));
  const run = (args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
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
  if (headEdits) {
    for (const [rel, text] of Object.entries(headEdits)) {
      const p = path.join(dir, rel);
      if (text === null) fs.rmSync(p);
      else { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
    }
    run(['add', '-A']);
    run(['-c', 'user.email=qa@example', '-c', 'user.name=qa', 'commit', '-q', '--allow-empty', '-m', 'head']);
  }
  const out = { dir, run, base };
  cache.set(name, out);
  return out;
}

/* base tree = full pristine frozen family + pristine configs; a head can
   then break selected members. Inside the throwaway repo the BASE tree
   stands in for 8cc7db1, so every golden baseline entry is a real blob
   compare - no absent-ref shortcut. */
const mk = (k) => Array.from({ length: k }, (_, i) => 'const x' + i + ' = ' + i + ';  calculate has been frozen\n').join('');
const pristineFamily = () => Object.fromEntries(guard.FROZEN_FILES.map((f, i) => [f, mk(10 + i * 3)]));
const baseAssets = () => Object.assign(pristineFamily(), { 'vercel.json': '{"rewrites":["/api/*"]}\n', [WRANGLER]: 'name = "tmp"\n', [STRAY]: 'stray\n' });
const FIN = () => guard.FROZEN_FILES[0]; /* assets/js/finance.js */
const BRIDGE = () => guard.FROZEN_FILES[1]; /* assets/js/cloud-bridge.js */
const VERCEL = 'vercel.json';
const WRANGLER = 'platform/cloudflare/wrangler.git.toml';
const STRAY = 'misc/stray.js';
const verify = (name, baseFiles, headEdits) => {
  const r = repo(name, baseFiles, headEdits);
  return guard.verify(r.dir, { base: r.base, goldenRef: r.base });
};

async function main() {
  tmproot = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-scope-'));
  console.log('\npr-scope guard (correct comparison base, explicit golden baseline, exception-free deploy detection, rename + worktree traps)');

  /* ================= POSITIVE: this checkout ================= */
  const v = guard.verify(ROOT);
  t('comparison base resolves in this checkout', !!v.base && !!v.base.ref, JSON.stringify(v.base));
  t('resolved base is a real commit', v.base && v.base.ref.length === 40, v.base && v.base.ref);
  t('committed PR verdict matches the reviewed scope, frozen pin and deploy protection',
    v.ok === true, JSON.stringify({ scope: v.scope, frozen: v.frozen, deploy: v.deploy }));

  t('FROZEN files untouched in committed PR scope', v.frozen.length === 0, JSON.stringify(v.frozen));
  t('deploy config untouched in committed PR scope (no exceptions granted)', v.deploy.length === 0, JSON.stringify(v.deploy));
  t('changed files are inside the explicitly reviewed allowlist', v.scope.length === 0, JSON.stringify(v.scope));

  const bl = guard.baselineMatch(ROOT);
  t('golden baseline checked for every frozen-family file', bl.length === guard.FROZEN_FILES.length && bl.every((b) => b.ok),
    JSON.stringify(bl.filter((b) => !b.ok).map((b) => b.file)));
  const byName = Object.fromEntries(bl.map((b) => [b.file, b.ok]));
  t('quote-calc freeze pinned explicitly: finance.js byte-identical to 8cc7db1', byName[FIN()] === true);
  t('quote-calc freeze pinned explicitly: cloud-bridge.js byte-identical to 8cc7db1', byName[BRIDGE()] === true);

  t('Connections UI allowance covers only the four reviewed frontend paths',
    guard.scopeOffenders(['assets/js/settings-connections.js', 'assets/css/settings-connections.css',
      'assets/js/pulse/business-pulse.js', 'assets/js/pulse/pulse-governance-ui.js']).length === 0);
  t('NEGATIVE: Connections scope does not admit neighbouring assets or provider adapters',
    guard.scopeOffenders(['assets/js/settings-connections-extra.js', 'assets/css/settings-connections-extra.css',
      'assets/js/pulse/provider-adapter.js', 'assets/js/pulse/settings-connections.js']).length === 4);

  /* ================= NEGATIVE: rename traps ================= */
  /* rename-ONLY fixtures: no frozen mutation, no out-of-scope add. A
     protected config must fail ALONE even when its destination sits inside
     an allowed path - rename detection may not erase the violation. */
  const vMove = verify('vercel-rename', baseAssets(), { [VERCEL]: null, 'qa/archived-config.json': '{"rewrites":["/api/*","/_tmp"]}\n' });
  t('tmp fixture: vercel.json renamed away — BOTH rename ends are in the scope list',
    vMove.changed.includes(VERCEL) && vMove.changed.includes('qa/archived-config.json'), JSON.stringify(vMove.changed));
  t('NEGATIVE rename: committed vercel.json rename fails the deploy check (source retained)', vMove.deploy.includes(VERCEL), JSON.stringify(vMove.deploy));
  t('NEGATIVE rename: config rename fails INDEPENDENTLY (no other violation present)',
    vMove.ok === false && vMove.frozen.length === 0 && vMove.scope.length === 0, JSON.stringify({ frozen: vMove.frozen, scope: vMove.scope }));

  const vWr = verify('wrangler-rename', baseAssets(), { [WRANGLER]: null, 'qa/archive-wrangler.toml': 'name = "tmp"\n' });
  t('NEGATIVE rename: wrangler*.toml rename fails too (source AND config-shaped destination kept)',
    vWr.deploy.includes(WRANGLER) && vWr.ok === false, JSON.stringify({ changed: vWr.changed, deploy: vWr.deploy }));

  /* out-of-scope file relocated into an allowed directory: with rename
     detection only the destination would remain and the offender would
     vanish; --no-renames keeps the source on the books. */
  const vMoveOut = verify('stray-into-qa', baseAssets(), { [STRAY]: null, 'qa/relocated.js': 'stray\n' });
  t('NEGATIVE rename: out-of-scope source moved into qa/ stays an offender', vMoveOut.scope.includes(STRAY), JSON.stringify(vMoveOut.scope));
  t('NEGATIVE rename: the relocation still fails the guard', vMoveOut.ok === false, JSON.stringify({ ok: vMoveOut.ok, scope: vMoveOut.scope }));

  /* plain deletion (no rename at all) of a protected config */
  const vDel = verify('vercel-delete', baseAssets(), { [VERCEL]: null });
  t('NEGATIVE delete: committed vercel.json deletion fails on its own', vDel.deploy.includes(VERCEL) && vDel.ok === false, JSON.stringify(vDel.deploy));

  /* ================= NEGATIVE: worktree masks ================= */
  /* 1. commit a deploy-config edit, then restore that ONE file from base in
        the worktree without touching HEAD/index. The committed violation
        must stay visible; the restored file shows up as hygiene only. */
  const maskFixture = repo('worktree-mask', baseAssets(), { [VERCEL]: '{"rewrites":["/api/*","/changed"]}\n' });
  fs.writeFileSync(path.join(maskFixture.dir, VERCEL), '{"rewrites":["/api/*"]}\n'); /* base copy restored */
  const vMask = guard.verify(maskFixture.dir, { base: maskFixture.base, goldenRef: maskFixture.base });
  t('control: the worktree copy was genuinely restored (equals the pristine content)',
    fs.readFileSync(path.join(maskFixture.dir, VERCEL), 'utf8') === '{"rewrites":["/api/*"]}\n');
  t('NEGATIVE mask: committed deploy-config edit survives the worktree restoration', vMask.deploy.includes(VERCEL) && vMask.ok === false, JSON.stringify(vMask.deploy));
  t('NEGATIVE mask: the restoration is reported as worktree dirt, never as a verdict pass',
    vMask.worktree.dirty.includes(VERCEL), JSON.stringify(vMask.worktree));

  /* 2. the same trap with an out-of-scope committed edit */
  const mask2 = repo('worktree-mask-scope', baseAssets(), { [STRAY]: 'stray\nCHANGED-ON-HEAD\n' });
  fs.writeFileSync(path.join(mask2.dir, STRAY), 'stray\n'); /* base copy restored */
  const vMask2 = guard.verify(mask2.dir, { base: mask2.base, goldenRef: mask2.base });
  t('NEGATIVE mask: committed out-of-scope edit survives a worktree restoration',
    vMask2.scope.includes(STRAY) && vMask2.ok === false, JSON.stringify({ scope: vMask2.scope, ok: vMask2.ok }));

  /* 3. committed-clean repo + unrelated dirty/untracked noise: the verdict
     stays ok and the noise is REPORTED separately (never an ok input). */
  const noise = repo('worktree-noise', baseAssets(), { 'qa/log.txt': 'clean head change\n' });
  fs.writeFileSync(path.join(noise.dir, 'junk-nobody-tracks.tmp'), 'untracked\n');
  fs.writeFileSync(path.join(noise.dir, 'qa/log.txt'), 'dirty working copy of a committed file\n');
  const vNoise = guard.verify(noise.dir, { base: noise.base, goldenRef: noise.base });
  t('control: unrelated worktree noise does NOT flip the committed verdict',
    vNoise.ok === true && vNoise.frozen.length === 0 && vNoise.deploy.length === 0 && vNoise.scope.length === 0,
    JSON.stringify({ ok: vNoise.ok, deploy: vNoise.deploy, scope: vNoise.scope }));
  t('control: the noise is still visible in the hygiene block (untracked + dirty lists)',
    vNoise.worktree.untracked.includes('junk-nobody-tracks.tmp') && vNoise.worktree.dirty.includes('qa/log.txt'),
    JSON.stringify(vNoise.worktree));

  /* ================= the original mutation negatives ================= */
  const vBad = verify('frozen-mutation', baseAssets(), {
    [FIN()]: mk(41), /* deliberately frozen file MUTATED */
    [BRIDGE()]: mk(39), /* the second quote file MUTATED too */
    [VERCEL]: '{"rewrites:[changed}"}\n' /* deploy config touched too */
  });
  t('tmp fixture: guard runs base→head', Array.isArray(vBad.changed) && vBad.changed.length >= 3, JSON.stringify(vBad.changed));
  t('NEGATIVE: mutated frozen file is detected (finance.js)', vBad.frozen.includes(FIN()), JSON.stringify(vBad.frozen));
  t('NEGATIVE: mutated frozen file is detected (cloud-bridge.js)', vBad.frozen.includes(BRIDGE()), JSON.stringify(vBad.frozen));
  t('NEGATIVE: deploy-config edit is detected (no exception)', vBad.deploy.includes(VERCEL), JSON.stringify(vBad.deploy));
  t('NEGATIVE: guard verdict on the tampered tree is NOT ok', vBad.ok === false, JSON.stringify({ frozen: vBad.frozen, deploy: vBad.deploy }));
  t('NEGATIVE: golden blob-compare catches the in-tree mutation (mutated blobs differ from base)',
    vBad.baseline.filter((b) => [FIN(), BRIDGE()].includes(b.file)).every((b) => !b.ok && b.base && b.head && b.base !== b.head),
    JSON.stringify(vBad.baseline.filter((b) => [FIN(), BRIDGE()].includes(b.file))));
  t('NEGATIVE: the other eight family members stay ok:true (no over-flagging)',
    vBad.baseline.filter((b) => ![FIN(), BRIDGE()].includes(b.file)).every((b) => b.ok),
    JSON.stringify(vBad.baseline.filter((b) => !b.ok && ![FIN(), BRIDGE()].includes(b.file))));

/* out-of-scope plain edit (misc/stray.js over-edit) */
  const vStray = verify('stray-add', baseAssets(), { [STRAY]: 'stray\nOUT-OF-SCOPE-HEAD-EDIT\n' });
  t('NEGATIVE: out-of-scope file is detected', vStray.scope.includes(STRAY) && vStray.ok === false, JSON.stringify(vStray.scope));

  /* list-level detection helpers */
  t('helper: frozenTouches flags finance.js + cloud-bridge.js only',
    JSON.stringify(guard.frozenTouches([FIN(), BRIDGE(), 'assets/js/dashboard.js'])) === JSON.stringify([FIN(), BRIDGE()]));
  t('helper: deployConfigTouches flags deploy configs it sees, nothing else',
    JSON.stringify(guard.deployConfigTouches([WRANGLER, 'platform/cloudflare/wrangler.toml', VERCEL, 'src/app.ts']))
      === JSON.stringify([WRANGLER, 'platform/cloudflare/wrangler.toml', VERCEL]));

  /* pristine / no-false-positive controls */
  const vClean = verify('control-clean', baseAssets(), { 'qa/log.txt': 'clean head change\n' });
  t('control: clean tmp repo passes the guard end to end (ok:true, zero violations)',
    vClean.ok === true && vClean.frozen.length === 0 && vClean.deploy.length === 0 && vClean.scope.length === 0,
    JSON.stringify({ frozen: vClean.frozen, deploy: vClean.deploy, scope: vClean.scope, ok: vClean.ok }));
  t('control: every pristine family member is ok:true under the golden compare (no false positives)',
    vClean.baseline.length === guard.FROZEN_FILES.length && vClean.baseline.every((b) => b.ok),
    JSON.stringify(vClean.baseline.filter((b) => !b.ok)));
  const vSame = verify('control-rewrite', pristineFamily(), pristineFamily());
  t('control: identical-content re-adds are not flagged as frozen violations',
    vSame.frozen.length === 0 && vSame.baseline.every((b) => b.ok) === true, JSON.stringify(vSame.frozen));

  console.log('\n==== RESULT: ' + pass + ' passed, ' + fail + ' failed ====');
  process.exitCode = fail ? 1 : 0;
}

main().then(() => { try { fs.rmSync(tmproot, { recursive: true, force: true }); } catch (_) {} })
  .catch((e) => { console.error('FATAL', e); try { if (tmproot) fs.rmSync(tmproot, { recursive: true, force: true }); } catch (_) {} process.exitCode = 1; });

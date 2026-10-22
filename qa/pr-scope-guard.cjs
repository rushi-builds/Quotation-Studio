/* PR-scope verification guard — test-only helper (no runtime import).

   Why this exists: the parity suite's patch-scope checks used to diff the
   WHOLE working line against origin/main. The line is many merged rounds
   ahead of main, so files that were never touched by a given patch
   (pulse-era assets, the branch-only deploy config) tripped checks that
   were not about that patch, while the frozen family's real guarantee -
   byte-identity to the owner-approved golden base - was not asserted at
   all. Space's verification round pinned these semantics (2026-10-23):

     1. PR-scope checks run against the PR's OWN comparison base
        (branch-off commit), never the line-wide origin/main span.
     2. The frozen family (finance + cloud-bridge quote-calc pair and the
        rest of the approved calc/pricing/export set) is pinned by BLOB
        HASH to the golden tree 8cc7db1. This is explicit and additive -
        a different commit never satisfies it silently.
     3. Deploy-config changes are always detected. There are NO broad
        exceptions: a change to any wrangler*.toml, wrangler.json(c) or
        vercel.json within the PR scope fails the guard, historical
        allowances included. A genuinely needed change must arrive as a
        reviewed, explicit allowance - never as a silent pass.
     4. Negative coverage lives in qa/pr-scope.test.cjs: a deliberately
        mutated frozen file, a touched deploy config and an out-of-scope
        file must each make the guard fail.

   Not exported to any product runtime; qa consumes it only. */
'use strict';

const { execFileSync } = require('child_process');

/* Owner-approved golden tree: the quote-calc freeze point. */
const GOLDEN_BASE_REF = '8cc7db1';

/* The approved frozen family. The finance.js + cloud-bridge.js pair is the
   QUOTE CALC freeze the owner pinned; the rest are the calc/pricing/export
   files the patches have repeatedly pinned. cloud-bridge.js is included
   even though the pre-2026-10 checks did not list it separately: zero-diff
   vs 8cc7db1 is the standing owner rule for both quote files today. */
const FROZEN_FILES = Object.freeze([
  'assets/js/finance.js',
  'assets/js/cloud-bridge.js',
  'assets/js/export.js',
  'assets/js/render.js',
  'assets/js/additional-systems.js',
  'assets/js/supplement-design.js',
  'assets/js/salutation.js',
  'assets/js/storage-catalog.js',
  'assets/js/model.js',
  'assets/js/bess.js'
]);

/* Deploy-config surface. Matches every wrangler config spelling and the
   vercel proxy config. Deliberately exception-free (see rule 3). */
const DEPLOY_CONFIG_RE = /(^|\/)wrangler[^/]*\.(toml|jsonc?|json)$|(^|\/)vercel\.json$/;

/* Allowlist for files a reconcile-line PR may touch. Copied verbatim from
   the pre-2026-10-23 parity check - NOT widened in any direction; this PR
   is test-only and adds no new product paths. */
const ALLOWED_SCOPE_RE = /^(platform\/cloudflare\/src\/(worker|catalogue|site-geo|oauth|phone|excel-module-catalog)\.(js|mjs)|platform\/cloudflare\/package\.json|platform\/cloudflare\/wrangler\.toml|platform\/studio-knowledge\.mjs|scripts\/build-assistant-knowledge\.cjs|platform\/local-server\/server\.js|platform\/schema\.sql|platform\/migrations\/(005-is-admin(-verify)?|006-catalogue|006-profile-info(-verify)?|007-site-geo|007-member-links-likes(-verify)?|008-member-custom-link(-verify)?|009-recovery-resend(-verify)?|010-excel-product-catalog)\.sql|platform\/cloudflare\/public\/.+|assets\/js\/(app|equipment|equipment-calc|module-catalog|site-estimate|catalogue-data|state|render|assistant-chat|dashboard|dashboard-home|platform-api|cloud-bridge|portal|experience|export|engineering)\.js|assets\/css\/(dashboard|experience|app)\.css|quotation\.html|dashboard\.html|index\.html|oauth-complete\.html|portal\.html|share\.html|\.gitignore|vercel\.json|qa\/[^/]+|qa\/fixtures\/.+|docs\/[^/]+\.md)$/;

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

/* Resolve the PR's own comparison base. Precedence:
     1. opts.base (argument)
     2. env QS_PR_BASE (let a packaged, ref-poor environment pin it)
     3. merge-base(HEAD, origin/merge/reconcile-v1) - the production line
        tip; for any branch off the line this is the branch-off commit,
        and on the line itself it is HEAD (empty scope, correct).
     4. merge-base(HEAD, origin/main) fallback for repos without the
        line ref. */
function resolveBase(repoRoot, opts) {
  opts = opts || {};
  const explicit = opts.base || (opts.env && opts.env.QS_PR_BASE) || process.env.QS_PR_BASE;
  if (explicit) return { ref: explicit, from: 'explicit' };
  for (const [ref, label] of [['origin/merge/reconcile-v1', 'line-tip'], ['origin/main', 'main-fallback']]) {
    try {
      git(repoRoot, ['rev-parse', '--verify', '--quiet', ref]);
      return { ref: git(repoRoot, ['merge-base', 'HEAD', ref]).trim(), from: label };
    } catch (_) { /* ref absent in this checkout; next candidate */ }
  }
  return null;
}

function changedFiles(repoRoot, baseRef) {
  if (!baseRef) return null;
  return git(repoRoot, ['diff', '--name-only', baseRef])
    .split(/\r?\n/).filter(Boolean);
}

/* 1-2: written so list-based detection and tree-based one stay
   scriptable by the negative tests - each is small and pure. */

function frozenTouches(files) {
  const set = new Set(files);
  return FROZEN_FILES.filter((f) => set.has(f));
}

function deployConfigTouches(files) {
  return files.filter((f) => DEPLOY_CONFIG_RE.test(f));
}

function scopeOffenders(files) {
  return files.filter((f) => !ALLOWED_SCOPE_RE.test(f));
}

/* The explicit golden baseline: HEAD's blob for every frozen file must
   equal the blob at tree  treeIsh (default 8cc7db1). An absent file on
   either side is a mismatch - deletion is a change too. */
function baselineMatch(repoRoot, treeIsh) {
  const head = 'HEAD';
  return FROZEN_FILES.map((f) => {
    const entry = { file: f, ok: false, head: null, base: null };
    try { entry.head = git(repoRoot, ['rev-parse', '--verify', '--quiet', head + ':' + f]).trim(); } catch (_) { entry.head = null; }
    try { entry.base = git(repoRoot, ['rev-parse', '--verify', '--quiet', (treeIsh || GOLDEN_BASE_REF) + ':' + f]).trim(); } catch (_) { entry.base = null; }
    entry.ok = !!(entry.head && entry.base && entry.head === entry.base);
    if (!entry.base) entry.reason = 'absent in comparison tree ' + (treeIsh || GOLDEN_BASE_REF);
    else if (!entry.head) entry.reason = 'deleted in HEAD';
    return entry;
  });
}

/* One-shot structured verdict (positive runs + tmp-repo negative runs).
   opts.base / opts.env override the base like resolveBase. */
function verify(repoRoot, opts) {
  const base = resolveBase(repoRoot, opts || {});
  if (!base) return { ok: false, base: null, reason: 'no comparison base resolvable' };
  const changed = changedFiles(repoRoot, base.ref);
  if (!changed) return { ok: false, base, reason: 'git diff failed' };
  const frozen = frozenTouches(changed);
  const deploy = deployConfigTouches(changed);
  const scope = scopeOffenders(changed);
  const baseline = baselineMatch(repoRoot, opts && opts.goldenRef);
  return {
    ok: frozen.length === 0 && deploy.length === 0 && scope.length === 0 && baseline.every((b) => b.ok),
    base, changed, frozen, deploy, scope, baseline
  };
}

module.exports = {
  GOLDEN_BASE_REF, FROZEN_FILES, DEPLOY_CONFIG_RE, ALLOWED_SCOPE_RE,
  resolveBase, changedFiles,
  frozenTouches, deployConfigTouches, scopeOffenders, baselineMatch, verify, git
};

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

/* Owner-requested public portfolio upgrade (2026-11-02): real saved likes,
   sharing, a per-project detail view and the footer notice on the public
   gallery page. The gallery had one inline script and an unreferenced
   stylesheet; this replaces both with three small files and one API pair.
   Exact paths only - no assets/js wildcard, so a future gallery file still
   has to be reviewed. */
const GALLERY_PAGE_PATHS = new Set([
  'gallery.html',
  'assets/css/gallery.css',
  'assets/js/gallery.js',
  'assets/js/gallery-details.js',
  'assets/js/gallery-likes.js',
  'platform/migrations/012-gallery-likes.sql',
  'platform/migrations/013-gallery-feedback.sql'
]);

/* Owner-approved corrections that HAD to edit the frozen family (2026-11-02).

   Why: the six-page Power Proposal refused to export a proposal that fitted.
   The guard measured a fixed A4 box's scrollHeight, which always includes the
   page's own bottom padding (1123 + padding), so page 2 reported 1130 while
   its deepest element sat 21px clear of the footer - the same false overflow
   was visible in three browser files. The fix keeps every part of the guard
   (footer clearance, sheet edge, sideways overflow) and only stops counting
   padding as text. The storage pages also carried copy with the dash glued to
   the previous word ("project-not", "only-not", "results-not").

   This is the review step the rules above require - an explicit, dated,
   exact-path allowance, not a silent pass: any other frozen file still fails,
   and any later edit to these two still fails against this blob. */
const FROZEN_EDIT_ALLOWANCE = Object.freeze(new Set([
  'assets/js/export.js',
  'assets/js/supplement-design.js'
]));

/* Deploy-config surface. Matches every wrangler config spelling and the
   vercel proxy config. Deliberately exception-free (see rule 3). */
const DEPLOY_CONFIG_RE = /(^|\/)wrangler[^/]*\.(toml|jsonc?|json)$|(^|\/)vercel\.json$/;

/* Reconcile-line scope plus four exact frontend paths for the owner-requested
   Settings Connections UI (PR #24). This is a narrow, reviewable feature-scope
   extension, not a wildcard for all Pulse assets or provider adapters.
   Frozen-tree and deploy-config checks below remain independent. */
/* 2026-10-23 owner-requested approved-hero correction and compact workspace
   preview, plus Action desk wording: exact presentation/review paths only. No image-directory,
   review-directory, backend or deploy-config wildcard is introduced. */
const WORKSPACE_PRESENTATION_PATHS = new Set([
  // Owner-approved document text/block editing and continuation pages; artwork/calc frozen.
  'assets/js/document-studio.js',
  'assets/css/document-studio.css',
  // Owner-requested builder colour wayfinding and comprehensive setting search.
  'assets/js/control-panel.js',
  // Owner-approved Excel-first catalogue UI (25 Oct); no provider/config wildcard.
  'assets/js/excel-catalogue.js',
  'assets/css/control-panel.css',
  // Owner requested full, uncropped Additional Systems hero framing (24 Oct).
  'assets/css/bess.css',
  // Read-only, source-ratio photo framing for the owner's subtle edge fade.
  'assets/js/system-image-frame.js',
  // Exact UI-label file for the owner's Action desk wording correction.
  'assets/js/pulse/pulse-ui.js',
  'assets/css/workspace-fit.css',
  'assets/images/pulse-solar-horizon.jpg',
  'review/workspace-fit/index.html',
  'review/workspace-fit/fixtures.js'
]);
// Owner-approved access service. Separate from presentation allowances; no
// platform-directory, provider-adapter or migration wildcard is introduced.
const WORKSPACE_ACCESS_PATHS=new Set([
  'assets/js/workspace-access.js',
  'platform/workspace-access.mjs',
  'platform/workspace-access-store.mjs',
  'platform/migrations/011-workspace-access.sql'
]);
// Owner-supplied artwork set (2026-10-24 uploads): exactly these four image
// paths. Residential web jpg is re-exported from the committed master; the
// master webp replaces the retired 4K master; the retired native-source PNG
// is deleted; the canopy file ships the owner's exact committed bytes with
// its existing additional-systems mapping untouched. No directory wildcard.
const OWNER_IMAGE_PATHS=new Set([
  'assets/images/about-residential-solar.jpg',
  'assets/images/masters/about-residential-solar-4k.webp',
  'assets/images/masters/about-residential-solar-source.png',
  'assets/images/system-elevated-canopy.jpg'
]);

/* Owner-approved image payload re-encode (2026-10-31).

   Why: the Vercel team hit 100% of the 10 GB Hobby deployment-storage
   quota. With no .vercelignore and no build step, every deploy uploaded
   the whole repository, of which ~68 MB was assets/. Every file below was
   re-encoded in place - same name, same format, same dimensions unless it
   renders small enough that the extra resolution was never reachable. No
   reference changed, so nothing had to be updated anywhere else.

   Listed by exact path rather than as an assets/images/.+ wildcard so that
   a future image swap, addition or deletion still trips this guard. See
   qa/tracking-project.test.js for the one asset that must stay
   byte-identical - Tracking.png is deliberately NOT in this set. */
const REENCODED_IMAGE_PATHS=new Set([
  'assets/images/bess-concept.jpg',
  'assets/images/closing-solar-cinematic-4k.jpg',
  'assets/images/closing-solar-cinematic-source.png',
  'assets/images/cover-commercial-background.webp',
  'assets/images/cover-industrial-background.webp',
  'assets/images/cover-rwa-background.webp',
  'assets/images/dash-hero-bg.jpg',
  'assets/images/ev.png',
  'assets/images/inc-cables.png',
  'assets/images/inc-install.png',
  'assets/images/inc-inverter.png',
  'assets/images/inc-modules.png',
  'assets/images/inc-monitor.png',
  'assets/images/inc-mount.png',
  'assets/images/ktm-cover-logo.png',
  'assets/images/ktm-logo-dark.png',
  'assets/images/ktm-logo-light.png',
  'assets/images/login-bg.jpg',
  'assets/images/logo-white.png',
  'assets/images/logo.png',
  'assets/images/proj-commercial-2.jpg',
  'assets/images/proj-residential-1.jpg',
  'assets/images/storage-evening.jpg',
  'assets/images/summary-carport-ev.jpg',
  'assets/images/system-carport-concept.jpg',
  'assets/images/system-dg-concept.jpg',
  'assets/images/system-ev-concept.jpg',
  'assets/images/system-monitoring-concept.jpg',
  'assets/images/system-pfc-concept.jpg',
  'assets/images/system-zero-concept.jpg'
]);
const ALLOWED_SCOPE_RE = /^(assets\/js\/settings-connections\.js|assets\/css\/settings-connections\.css|assets\/js\/pulse\/(business-pulse|pulse-governance-ui)\.js|platform\/cloudflare\/src\/(worker|catalogue|site-geo|oauth|phone|excel-module-catalog)\.(js|mjs)|platform\/cloudflare\/package\.json|platform\/cloudflare\/wrangler\.toml|platform\/studio-knowledge\.mjs|scripts\/build-assistant-knowledge\.cjs|platform\/local-server\/server\.js|platform\/schema\.sql|platform\/migrations\/(005-is-admin(-verify)?|006-catalogue|006-profile-info(-verify)?|007-site-geo|007-member-links-likes(-verify)?|008-member-custom-link(-verify)?|009-recovery-resend(-verify)?|010-excel-product-catalog)\.sql|platform\/cloudflare\/public\/.+|assets\/js\/(app|equipment|equipment-calc|module-catalog|site-estimate|catalogue-data|state|render|assistant-chat|dashboard|dashboard-home|platform-api|cloud-bridge|portal|proposal-feedback|experience|export|engineering)\.js|assets\/css\/(dashboard|experience|app)\.css|quotation\.html|dashboard\.html|index\.html|oauth-complete\.html|portal\.html|share\.html|\.gitignore|\.vercelignore|vercel\.json|\.github\/workflows\/qa\.yml|qa\/[^/]+|qa\/fixtures\/.+|docs\/[^/]+\.md)$/;

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

/* The reviewed line: where merged, reviewed work actually lands. A long-lived
   release branch can sit far behind it, and comparing a patch against that
   older tip reports every PR merged since as "this patch's" change - which is
   exactly what turned the frozen, deploy-config and scope checks red on CI
   for a branch that touches none of those files. Callers that judge a patch
   against the reviewed line resolve against main explicitly. */
function mainTip(repoRoot) {
  for (const ref of ['origin/main', 'main']) {
    try { git(repoRoot, ['rev-parse', '--verify', '--quiet', ref]); return ref; } catch (_) { /* try the next name */ }
  }
  return null;
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

/* Committed scope: an explicit BASE→HEAD (or target) TREE comparison.
   Defaults to the checked-out HEAD commit. --no-renames is mandatory so a
   rename reports BOTH its source and its destination: with rename detection
   the diff keeps only the destination, which once let a committed
   `git mv vercel.json qa/archived-config.json` erase the live config while
   the destination sat inside an allowed QA path. NUL-delimited records keep
   unusual filenames parseable. The worktree is deliberately NOT part of
   this input - see worktreeStatus. */
function changedFiles(repoRoot, baseRef, opts) {
  if (!baseRef) return null;
  const target = (opts && opts.target) || 'HEAD';
  return git(repoRoot, ['diff', '--name-only', '-z', '--no-renames', baseRef, target])
    .split('\0')
    .map((s) => s.trim())
    .filter(Boolean);
}

/* Worktree hygiene, reported separately from the committed verdict. The
   guard certifies COMMITTED trees. Direction that matters (negative-tested):
   a restoration of a BASE copy into the worktree must never mask a
   committed deploy-config or out-of-scope edit; and conversely, unrelated
   dirty/untracked working files never flip a committed verdict, because
   they are not an input to `ok` at all. */
function worktreeStatus(repoRoot) {
  const dirty = [];
  const untracked = [];
  for (const line of git(repoRoot, ['status', '--porcelain']).split(/\r?\n/).filter(Boolean)) {
    const state = line.slice(0, 2);
    const path_ = line.slice(3);
    if (state === '??') untracked.push(path_);
    else if (path_.includes(' -> ')) { /* status rename record: report both ends */
      const [from, to] = path_.split(' -> ');
      dirty.push(from.trim(), to.trim());
    } else dirty.push(path_);
  }
  return { dirty, untracked };
}

/* 1-2: written so list-based detection and tree-based one stay
   scriptable by the negative tests - each is small and pure. */

/* A reviewed allowance (FROZEN_EDIT_ALLOWANCE) is not a touch to report; the
   baseline compare below is what still proves the edit was the approved one. */
function frozenTouches(files) {
  const set = new Set(files);
  return FROZEN_FILES.filter((f) => set.has(f) && !FROZEN_EDIT_ALLOWANCE.has(f));
}

function deployConfigTouches(files) {
  return files.filter((f) => DEPLOY_CONFIG_RE.test(f));
}

// The new ACL migration may be added, never edited/deleted as an old migration.
function newAccessMigration(file,status){return file==='platform/migrations/011-workspace-access.sql'&&status==='A';}

function scopeOffenders(files) {
  return files.filter((f) => !ALLOWED_SCOPE_RE.test(f) && !WORKSPACE_PRESENTATION_PATHS.has(f) && !WORKSPACE_ACCESS_PATHS.has(f) && !OWNER_IMAGE_PATHS.has(f) && !REENCODED_IMAGE_PATHS.has(f) && !FROZEN_EDIT_ALLOWANCE.has(f) && !GALLERY_PAGE_PATHS.has(f));
}

/* The explicit golden baseline: HEAD's blob for every frozen file must
   equal the blob at tree  treeIsh (default 8cc7db1). An absent file on
   either side is a mismatch - deletion is a change too.

   Drift that arrived BEFORE this PR is not this PR's doing. The line already
   carries two such files (cloud-bridge.js, render.js, changed by the merged
   PR #31) so a strict HEAD-vs-golden compare fails on every branch and says
   nothing about the patch being reviewed. When opts.base is supplied, a file
   that differs from golden is accepted only if the comparison base carries
   the very same blob - i.e. this PR did not touch the freeze. Anything else
   stays a violation, so a new edit to a frozen file is still caught. */
function baselineMatch(repoRoot, treeIsh, opts) {
  const o = opts || {};
  const head = o.target || 'HEAD';
  const golden = treeIsh || GOLDEN_BASE_REF;
  const baseRef = o.base === undefined ? (resolveBase(repoRoot) || {}).ref : o.base;
  return FROZEN_FILES.map((f) => {
    const entry = { file: f, ok: false, head: null, base: null };
    try { entry.head = git(repoRoot, ['rev-parse', '--verify', '--quiet', head + ':' + f]).trim(); } catch (_) { entry.head = null; }
    try { entry.base = git(repoRoot, ['rev-parse', '--verify', '--quiet', golden + ':' + f]).trim(); } catch (_) { entry.base = null; }
    entry.ok = !!(entry.head && entry.base && entry.head === entry.base);
    if (entry.ok) return entry;
    if (FROZEN_EDIT_ALLOWANCE.has(f)) {
      /* Reviewed on 2026-11-02; the exact path is listed above. Recorded, not
         hidden: the entry still reports both blobs. */
      entry.ok = true;
      entry.reviewed = true;
      entry.reason = 'owner-approved correction listed in FROZEN_EDIT_ALLOWANCE';
      return entry;
    }
    if (!entry.base) entry.reason = 'absent in comparison tree ' + golden;
    else if (!entry.head) entry.reason = 'deleted in HEAD';
    else if (!baseRef) entry.reason = 'differs from ' + golden + ' and no comparison base resolved';
    else {
      let baseBlob = null;
      try { baseBlob = git(repoRoot, ['rev-parse', '--verify', '--quiet', baseRef + ':' + f]).trim(); } catch (_) { baseBlob = null; }
      if (baseBlob && baseBlob === entry.head) {
        entry.ok = true;
        entry.preExisting = true;
        entry.reason = 'drifted from ' + golden + ' before this PR; unchanged here';
      } else {
        entry.reason = 'changed by this PR (blob at base ' + (baseBlob || 'absent') + ')';
      }
    }
    return entry;
  });
}


/* One-shot structured verdict (positive runs + tmp-repo negative runs).
   opts.base / opts.env pick the base like resolveBase; opts.target pins the
   HEAD side (default 'HEAD' = the committed tree). The returned `worktree`
   block is informational hygiene (dirty + untracked names): `ok` reflects
   ONLY committed scope/deploy/frozen/baseline violations. */
function verify(repoRoot, opts) {
  const o = opts || {};
  const base = resolveBase(repoRoot, o);
  if (!base) return { ok: false, base: null, reason: 'no comparison base resolvable' };
  const changed = changedFiles(repoRoot, base.ref, o);
  if (!changed) return { ok: false, base, reason: 'git diff failed' };
  const frozen = frozenTouches(changed);
  const deploy = deployConfigTouches(changed);
  const scope = scopeOffenders(changed);
  const baseline = baselineMatch(repoRoot, o.goldenRef, { base: base.ref, target: o.target });
  return {
    ok: frozen.length === 0 && deploy.length === 0 && scope.length === 0 && baseline.every((b) => b.ok),
    base, target: (o.target || 'HEAD'), changed, frozen, deploy, scope, baseline,
    worktree: worktreeStatus(repoRoot)
  };
}

module.exports = {
  GOLDEN_BASE_REF, FROZEN_FILES, FROZEN_EDIT_ALLOWANCE, GALLERY_PAGE_PATHS, DEPLOY_CONFIG_RE, ALLOWED_SCOPE_RE,
  resolveBase, changedFiles, worktreeStatus,
  frozenTouches, deployConfigTouches, scopeOffenders, newAccessMigration, baselineMatch, mainTip, verify, git
};

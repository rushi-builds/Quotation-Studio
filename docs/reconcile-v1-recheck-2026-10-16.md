# Recheck against `merge/reconcile-v1`

**Review date:** 16 October 2026
**Baseline:** `origin/merge/reconcile-v1` at `7bc2f23` — “team/role: a power-key role change with a riding 'admin' title on another row is a role change, not an elevation attempt”.
**Deployment status:** the owner identified this branch as live; no production deployment or database was accessed to verify that claim.

## Scope and safeguards

This recheck supersedes the earlier review's conclusions **for the newer baseline**. The earlier review examined `a27ad6b`, not this branch. There are 100 changed/added files between those revisions, including major equipment, authentication, profile, recovery and backend changes.

- The Arena session remained on `arena/d435d7ac-quotation-studio`; no local branch was created or switched.
- The requested remote branch was fetched and archived into ignored `tmp/review-live/` for inspection/testing. It was not merged into the working branch.
- `assets/js/finance.js` and `assets/js/cloud-bridge.js` were not modified. Reading/evaluating modules is not an edit.
- The finance blob is identical in the checkout and baseline: `34bf69cf6378c5f8ddb485c74f1c44959440bc55`.
- No genFactor changes were made. The baseline default and preset reset remain `1460`.
- No deploy, push, PR, real account mutation or production API test was performed.
- Disposable SQLite/JSON fixtures were used for behavioral checks. External-provider responses in the applicable tests are mocked.

## Corrections to the earlier review

| Earlier finding | Status on `7bc2f23` |
|---|---|
| Worker ignores sequential stale-save `baseRevision` | **Fixed for sequential saves.** A revision mismatch now returns `409 CONFLICT`. A simultaneous-request race remains; see C2. |
| Owner edits another member's proposal return 200 without persisting | **Fixed.** UPDATE now uses `OWN_SCOPE`; reproduced Owner edit persists and increments revision. |
| Designated admin email immediately grants write/admin powers | **Changed.** The address now grants workspace visibility and self-elevation eligibility, not immediate write rank. An unverified account can still self-elevate; see C1. |
| Worker security suite expects Viewer team read to be forbidden | **Fixed in that suite.** `studio-security-worker.test.mjs` now passes. A stale equivalent assertion remains in `oauth.test.mjs`. |
| Public recovery is always disabled | **No longer the current design.** Recovery supports SMTP-backed OTP, and fails closed when delivery is unconfigured. Unit/API checks exercise the newer flow; actual mail delivery was not verified. |

Ordinary public signup still correctly creates a Viewer regardless of a typed “Owner” title. The old arbitrary-role signup defect is not being reported as current.

## Current confirmed concerns

### C1 — Critical, conditional: unverified designated mailbox can obtain privileged access

**Locations on the baseline:** `platform/cloudflare/src/worker.js:515–518,991–1005,1780–1841,3450–3513`; equivalent registration/designation logic exists in the local backend.

Password registration accepts an email address without proving mailbox ownership. If the designated address has not already been registered:

1. Signing up as `OWNER_EMAIL` immediately returns Owner and `canManageTeam: true`.
2. Signing up as `ADMIN_EMAIL` initially returns Viewer, `canManageTeam: false`, `seesAll: true`, `canElevate: true`.
3. That session can POST its own ID and `role: 'admin'` to `/api/team/role`. The pre-owner-gate self-elevation door accepts it; `/api/auth/me` then returns `isAdmin: true`, `canManageTeam: true`.

This was reproduced against the actual Worker handler with synthetic environment settings and disposable SQLite. No mailbox access or email/provider verification was involved.

**Limit:** this is a first-claim/bootstrap problem, not a demonstrated takeover of an already-registered designated account. Existing unique-email checks prevent registering an address twice. No claim is made that either production mailbox is unclaimed.

**Recommendation:** bind privileged bootstrap to an explicitly provisioned user ID, a verified identity or a controlled invitation. Securely provision designated accounts before exposing registration. Preserve legitimate existing access during any migration.

### C2 — High: Worker revision check is not atomic

**Location:** `platform/cloudflare/src/worker.js:2616–2674`.

The new check correctly rejects a sequential stale request, but it compares against a previously SELECTed row and later issues UPDATE without a revision predicate. Two requests can read the same revision and both pass the JavaScript comparison.

**Reproduction:** a D1-shaped SQLite adapter deliberately synchronized the two proposal reads, without changing application logic. Both requests submitted `baseRevision: 2`:

```text
statuses: [200, 200]
finalRevision: 3
finalTitle: Race B
```

Both callers were told their edit succeeded, but only the last edit remains and the revision only advanced once. This is the simultaneous-request case; it is narrower than the earlier missing-check finding.

**Recommendation:** in the backend, update with both authorized scope and `revision=?`, increment the revision in SQL, and inspect the affected-row count. Return a conflict when another write won. Cover simultaneous writes, not only sequential stale writes. No CloudBridge change is required to correct the backend compare-and-swap boundary.

### C3 — High for local multi-user usage: whole-file JSON writes still lose concurrent records

**Location:** `platform/local-server/server.js:1687–1688`, registration around `1781–1845`, and `saveDb()` at `1008–1013`.

The local handler captures the database before awaiting the request body. Two handlers can later save different snapshots of the entire file. Some newer routes refresh their snapshot after an await, but registration and general snapshot replacement are not globally transactional.

**Reproduction:** keep registration A's body incomplete, finish registration B, then complete A:

```text
fastStatus: 201
slowStatus: 201
storedUserCount: 1
fastUserLost: true
```

Only synthetic users were involved; the temporary database was deleted afterward.

**Recommendation:** use local SQLite transactions or serialize a fresh read/validate/mutate/write critical section. Locking only the final file rename does not fix stale snapshots. Until then, do not treat the local JSON server as a durable multi-user backend.

### C4 — Medium, frozen-file observation only: effective writable Viewer is still blocked by Studio save

**Location:** `assets/js/cloud-bridge.js:171,439`.

The baseline still checks `user.role === 'viewer'` inside save and button state, although effective `canWrite` is used elsewhere. An elevated account retaining the Viewer stored role is writable on the server but rejected here.

**Reproduction:** the real module was evaluated read-only using the actual elevated Viewer user returned by the Worker fixture:

```text
CloudBridge.saveToCloud() -> {ok:false,error:"Your role is read-only."}
```

**Owner constraint respected:** `cloud-bridge.js` was not modified. This is recorded for awareness, not treated as permission to alter the finalized three fixes. Any handling needs an owner-approved approach compatible with that freeze.

## Current test state

Dependencies were installed only in ignored locations. QA still needs the `--legacy-peer-deps` workaround for the old `chrome-aws-lambda` / newer `puppeteer-core` combination. The new Worker Excel import also requires `@e965/xlsx`, which was installed in the archived Cloudflare package without deployment or lifecycle scripts.

| Check | Result |
|---|---|
| `npm test` after archive asset sync | **Fails** at `excel-module-catalog.test.mjs`: 5/6 tests pass; picker test expects `Deye or Equivalent`, actual initial make is `Sungrow`. Earlier scripts complete successfully. Later default scripts are not reached. |
| `studio-security-worker.test.mjs` | **Passes**, including fail-closed unconfigured recovery and Viewer team-read / denied role mutation. |
| `platform-api.test.js` independently | **170 passed, 0 failed**, including configured recovery fixture behavior. |
| `audit-fixes-worker.test.mjs` independently | **82 passed, 0 failed**, including sequential stale-save rejection and send-state revisions. |
| `team-profile.test.js` independently | **77 passed, 0 failed**. |
| `roles-access.test.js` independently | **150 passed, 0 failed**. |
| `npm run test:assistant` | **Passes:** 24 Node tests plus local/Worker adapter checks. No live model call. |
| OAuth + phone + site-geo + catalogue parse/Worker test selection | **52/53 pass**. Failure is `qa/oauth.test.mjs:117`, still expecting Viewer team GET to return 403 instead of 200. |
| `catalogue-sync.test.js` independently | **27 passed, 0 failed**. |
| `equipment-calc.test.js`, `site-estimate.test.js` | **9 + 8 checks pass**. |
| `module-autofill.test.js` independently | **0/8 pass**: refers to absent exports such as `modelEntriesForMake`, `findModule`, `applyModuleDefaults`. |
| `product-match.test.js` independently | **0/19 pass**: absent helpers and obsolete/missing DOM assumptions, plus unmet matching assertions. |
| Real-browser security flow | Not completed; not claimed as passed. Browser/PDF/mobile and live provider certification remain outside this recheck. |

**Interpretation:** the reconciled application and test suite disagree in several equipment interfaces. Missing exports used only by old tests do not, by themselves, prove the current UI is broken. Reconcile tests against the intended current catalogue APIs/DOM and then exercise real selector interactions. Do not simply delete failing assertions to obtain green output.

The old report's “1,370 default checks pass” result belongs to the old revision. It must not be used as evidence that the live baseline's default command passes.

## Policy observations requiring owner decisions, not automatic edits

- **Team privacy:** current `/api/team/members` passes `contact: true` for other members, so a newly registered ordinary Viewer receives other members' emails and phone numbers. This was confirmed with fixtures. Nearby comments still describe contact as restricted. Decide whether an unapproved public signup counts as a trusted team member. If contact visibility is intentional, fix the documentation; otherwise enforce approval/field-level privacy. No actual production contacts were requested.
- **Generation factor:** source defaults/reset are still `1460`, and this review made zero changes. Existing `app.js:697` has an optional NASA “Apply” action that changes the form's genFactor. If “frozen” is intended to mean a runtime invariant rather than “do not edit this assumption/code,” that pre-existing pathway needs clarification from the owner. It was left untouched.
- **Release gate:** no GitHub Actions workflow exists in the reviewed snapshot. The default test chain stops before several known failing later tests, and browser checks must run in an environment with the required Chromium libraries. Establish explicit test gates before the owner deploys.

## Recommended next work, without touching the frozen files

1. Secure designated-identity bootstrapping in the backend (C1).
2. Make the Worker save atomic using a revision-qualified UPDATE (C2).
3. Address the local persistence transaction boundary if multi-user local operation matters (C3).
4. Reconcile the catalogue/OAuth tests with approved behavior and run real-browser equipment/export checks.
5. Resolve C4 and privacy/runtime-genFactor policy with the owner before proposing any change that intersects the freeze.

Any later implementation must use `merge/reconcile-v1` as the PR base and must not deploy. This session's fixed branch constraint needs to be accounted for explicitly; no main-based implementation PR was opened by this review.

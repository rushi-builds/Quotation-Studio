# Quotation Studio — repository review

> **Historical baseline only:** this review examined `a27ad6b`, not the owner's live `merge/reconcile-v1` branch. See [the reconcile-v1 recheck](reconcile-v1-recheck-2026-10-16.md) for corrected findings against `7bc2f23`. Several issues below are fixed or changed there; the old test results do not describe the newer baseline.

**Date:** 15 October 2026
**Reviewed revision:** `a27ad6b816e1163279b82b928220d0f1a6a7704a`
**Branch:** `arena/d435d7ac-quotation-studio`
**Scope:** architecture, authentication/authorization, proposal persistence, frontend/cloud integration, calculations, testing, dependencies, deployment configuration and operational documentation.

## Executive assessment

This is a substantial offline-first solar proposal application, not merely a quotation template. It has useful separation between the calculation engine and rendering, considerable regression coverage, immutable published snapshots, and thoughtful customer-facing limitations. The highest risks are now **identity bootstrapping and persistence correctness**, particularly differences between the local and Cloudflare backends.

**Recommendation:** fix the designated-email bootstrap before enabling it for an unclaimed account, and fix the three persistence defects before relying on concurrent multi-user editing. A passing default test command is not sufficient release evidence: security/OAuth tests currently fail, and browser checks were not executable in this environment.

No application code was changed, no deployment was made, and no production account or database was accessed. Reproductions used disposable accounts and an in-memory SQLite adapter or temporary local JSON database. This document is the only tracked change from the review.

## 1. System map

| Layer | Main files | Responsibility |
|---|---|---|
| Sign-in | `index.html`, `oauth-ui.js`, `phone-auth.js` | Password/social/phone authentication interface |
| Workspace | `dashboard.html`, `dashboard.js`, dashboard UI modules | Proposals, team, tasks, reports and sharing |
| Builder | `quotation.html`, `app.js`, `state.js`, `editor.js` | Form inputs, orchestration, defaults and content editing |
| Domain engines | `finance.js`, `engineering.js`, `bess.js`, `additional-systems.js` | Solar finance, engineering checks and optional systems |
| Presentation | `render.js`, `charts.js`, `export.js` | A4 pages, charts, PDF capture/export |
| Offline persistence | `model.js`, `workspace-prefs.js`, equipment store | Browser-local drafts and configuration |
| Cloud integration | `platform-api.js`, `cloud-bridge.js` | Session handling, save/open and revision tracking |
| Customer views | `portal.html`, `portal.js`, `share.html`, `share.js` | Published bearer-token portal versus same-browser local view |
| Local backend | `platform/local-server/server.js` | HTTP API and whole-file JSON persistence |
| Hosted backend | `platform/cloudflare/src/worker.js`, `platform/schema.sql` | Worker API, D1 persistence and static assets |
| Shared backend helpers | `gemini.mjs`, `oauth-store.mjs`, `reference-numbers.mjs` | Assistant gateway, identity storage and reference allocation |
| Packaging | `sync-public.js`, `wrangler.toml`, `vercel.json` | Curated Worker assets and Vercel-to-Worker API rewrite |

The repository has 303 tracked files and 69 test files matching `*test*`. The two main backend implementations are approximately 2,400–2,600 lines each. The frontend uses browser globals and script-load order rather than a build/module graph. Assets include roughly 31 MB of images, plus bundled fonts and PDF libraries.

## 2. Confirmed findings, ordered by priority

### R1 — Critical, conditional: unverified email can claim designated owner/admin powers

**Locations:**
- `platform/cloudflare/src/worker.js:1031–1085` — password registration.
- `platform/cloudflare/src/worker.js:394–397` — designated-admin email comparison.
- `platform/cloudflare/src/worker.js:706–720` — designated-owner promotion.
- `platform/local-server/server.js:950–959,1197–1247` — equivalent local registration/bootstrap.

Ordinary signup correctly stores `role: 'viewer'`, regardless of whether the typed job title is Owner. The old arbitrary-Owner-title vulnerability is **not** present.

However, password registration does not prove mailbox ownership. A caller who registers an as-yet-unregistered `OWNER_EMAIL` is immediately promoted to Owner. Registering an unclaimed `ADMIN_EMAIL` grants effective admin powers through the email comparison, even while the stored role remains Viewer.

**Reproduction:** real Worker handler against disposable SQLite, with synthetic designated email settings:

```text
Signup as OWNER_EMAIL: 201; role=owner; canWrite=true; canManageTeam=true; seesAll=true
Signup as ADMIN_EMAIL: 201; role=viewer; isAdmin=true; canManageTeam=true; seesAll=true
```

No verification code, email delivery or provider identity was required.

**Impact:** unauthorized workspace administration if an attacker claims a configured privileged mailbox before its legitimate owner. This does not demonstrate takeover of an already-registered account; the duplicate-email guard limits that scenario. It also does not apply when the designation variables are unset.

**Fix direction:** bootstrap using an explicitly provisioned immutable user ID, or require a verified email/invitation before making a designation effective. Do not treat syntactically valid email input as verified identity. Provision privileged accounts securely before making signup public. Preserve existing legitimate access during migration and add negative tests for unverified designated mailboxes.

### R2 — High: Cloudflare ignores stale-save revisions

**Locations:**
- `platform/cloudflare/src/worker.js:1529–1572`.
- `platform/local-server/server.js:1665–1680` — local conflict guard, absent in Worker.
- `assets/js/cloud-bridge.js:155–168` — client sends `baseRevision` and expects a 409 response.

The Worker increments `revision` but never checks the submitted `baseRevision`. Therefore the UI's conflict-handling branch is ineffective in the hosted backend.

**Reproduction:** create revision 1; save with `baseRevision: 1`; submit a second edit still based on revision 1:

```text
First save:  200, revision=2
Stale save:  200, revision=3, stale title replaces the newer title
```

These were sequential requests, so this failure does not require a narrowly timed race.

**Impact:** silent loss of edits when two tabs, users or devices work on one proposal.

**Fix direction:** atomically update with a revision predicate and an in-database increment, for example `WHERE id=? AND <authorized scope> AND revision=?`, `revision=revision+1`. If no row changed, distinguish conflict from missing/forbidden and return 409 with a safe resolution path. Merely copying a pre-update JavaScript comparison is insufficient for concurrent requests. Run the same stale-write contract against both backends.

### R3 — High: owner edits to another member's proposal report success but do not persist

**Location:** `platform/cloudflare/src/worker.js:1531,1560–1572`.

The proposal lookup permits Owner/admin workspace-wide scope through `OWN_SCOPE`, but the UPDATE uses `WHERE id=? AND owner_id=?` bound to the acting user's ID. For a proposal owned by another member, the lookup succeeds and the UPDATE affects zero rows. The handler does not check the change count and returns HTTP 200 with the unchanged proposal.

**Reproduction:** a Sales fixture creates a proposal; an Owner fixture updates its title:

```text
Response: 200
Returned/stored title: original title
Returned revision: 1 (unchanged)
```

**Impact:** a legitimate Owner believes an edit was saved when it was discarded. This is distinct from R2: it happens with one user and no competing save.

**Fix direction:** make lookup and write authorization predicates consistent, preserve the original `owner_id`, and verify affected-row counts. Cover Owner/admin-to-other-owner writes as well as ordinary same-owner writes. Combine with R2's atomic revision condition.

### R4 — High for local multi-user use: overlapping requests overwrite the whole JSON database

**Locations:** `platform/local-server/server.js:1101–1102,528–531`.

Each handler reads its own database snapshot before awaiting request-body input. `saveDb()` later replaces the entire JSON file. Atomic rename prevents a partially written file, but it does not provide transaction isolation or prevent stale-snapshot overwrite.

**Reproduction:** open registration A and hold its incomplete body; finish registration B; then finish A. Both return 201, but only A remains in `db.json`:

```text
fastStatus=201
slowStatus=201
storedUsers=[slow@example.test]
fastUserLost=true
```

**Impact:** acknowledged records and sessions can disappear. Whole-file replacement means the risk is not restricted to two edits on the same proposal; unrelated writes can overwrite one another. The local revision guard does not repair this database-wide race.

**Fix direction:** use SQLite transactions for the local backend, or serialize the complete read/validate/mutate/write critical section after reading bounded request bodies. A lock only around the final disk write is not enough. Treat the JSON server as single-user development infrastructure until this is corrected.

### R5 — Medium: cloud-save UI rejects an effectively writable Viewer/admin

**Locations:** `assets/js/cloud-bridge.js:140,333`; compare the capability-aware check at `:352` and dashboard checks at `assets/js/dashboard.js:101`.

The backend can deliberately return `role: 'viewer', canWrite: true` for a designated/elevated admin. CloudBridge still disables Save and rejects saves by checking the raw role string. Elsewhere it correctly uses `canWrite` for reference reservation.

**Reproduction:** evaluate the real CloudBridge module with `currentUser()` returning `{role:'viewer', canWrite:true, canManageTeam:true}`:

```text
CloudBridge.saveToCloud() -> {ok:false,error:"Your role is read-only."}
```

**Impact:** authorized users can administer the dashboard or reserve references but cannot save through the builder. This remains a functional bug even after R1 is fixed securely.

**Fix direction:** use one shared effective-capability helper for button state and save enforcement, with the existing older-backend role fallback. Continue enforcing permission independently on the server.

## 3. Test results and confidence

Environment: Node `v22.22.3`, npm `10.9.8`.

| Command/check | Result | Interpretation |
|---|---|---|
| `cd qa && npm install --no-package-lock` | Failed, `ERESOLVE` | `chrome-aws-lambda@10.1.0` expects `puppeteer-core@^10.1.0`; project requests `^23.11.1` |
| Install with `--legacy-peer-deps` | Passed | Workaround for this review, not a dependency fix |
| `cd qa && npm test` on clean generated state | Failed: 4 checks | Roles-parity suite requires ignored `platform/cloudflare/public` assets |
| `node platform/cloudflare/sync-public.js`, then `npm test` | Passed | 1,370 reported assertions/checks across 17 scripts; engineering tests also exercise 54,600 sizing scenarios |
| `npm run test:audit` | Passed | Static checks, local API regressions, SQLite-backed Worker regressions, real page scripts in jsdom |
| `npm run test:assistant` | Passed | 24 unit tests plus local/Worker adapter checks; no live model request |
| `npm run test:references` | Passed | 3 tests, including SQLite-backed reference allocation |
| `node --test reverification.test.cjs calculation-verification.test.cjs rwa-subsidy.test.cjs assistant-actions.test.cjs` | Passed | 14 tests |
| `npm run test:security` | Failed | Worker test expects 403 from team listing, receives 200 |
| `node studio-security.test.cjs` separately | Failed | Same stale team-listing expectation in local test |
| `npm run test:oauth` | Failed | 43/44 Node tests passed; failure expects team-listing 403; browser stage not reached |
| `npm run test:browser` | Blocked | Chromium missing `libnspr4.so`; first browser could not start |
| `test:financial-fixes`, `test:actions` | Partial only | Node stages pass; browser stages blocked by Chromium libraries |
| Independent R1–R5 checks | Reproduced | Isolated fixtures; no production requests |

**Important distinction:** team listing is explicitly readable by all signed-in members in current code (`worker.js:2201–2228`), with contact information restricted and writes separately gated. Those 200-versus-403 failures are outdated contract assertions, not evidence that arbitrary signup grants Owner. Update the tests to assert the approved read-only payload and denied mutation, rather than simply changing status expectations without checking privacy.

Browser rendering, real PDF output, visual overflow, mobile layout, live social login, real phone OTP and live Gemini responses are **not certified by this review**. jsdom passing is not a substitute for those checks.

## 4. Dependency and delivery concerns

### Reproducibility and security tooling

- Neither QA nor Cloudflare has a tracked lockfile; `.gitignore:3,16` explicitly ignores both. Caret ranges can resolve differently across machines and dates.
- Standard QA installation is broken by the Chromium/Puppeteer peer conflict. Consolidate the browser stack; the repository currently includes Playwright, Puppeteer, Sparticuz Chromium and the old Lambda Chromium package.
- A temporary lockfile generated with the review's dependency workaround allowed `npm audit --json` to run. It reported **10 high-severity package entries**, including transitive chains involving `tar-fs`, `extract-zip` and `basic-ftp`. These are QA/tooling dependencies, not proof of remotely exploitable production application vulnerabilities. Counts include parent packages affected by transitive advisories, not ten independent exploits. Do not run a blind `npm audit fix --force`; the proposed changes include major-version transitions.
- No `.github/workflows` CI exists. `.github/github-app.yml` is a preview-run configuration, not a test workflow.
- `npm test` does not include every security, OAuth, audit, assistant or browser suite. Establish explicit release gates rather than relying on the default command.
- Document and enforce a Node version supporting `node:sqlite` and the selected browser tooling.

### Suggested CI split

1. Locked dependency install and syntax/static validation.
2. Deterministic domain/unit/jsdom tests.
3. Shared authorization/persistence contract tests for local and SQLite-backed Worker implementations.
4. Security/OAuth attack tests.
5. Playwright browser job on an image with Chromium system dependencies, using a fixture server.
6. Asset sync followed by generated-asset consistency checks.

Keep browser artifact generation and deployment separate from tests that mutate external state. Do not permit a real production database or paid provider to become a test fixture accidentally.

## 5. Strengths worth preserving

- **Pure financial engine:** UMD-compatible and directly testable without DOM/browser infrastructure. Pricing normalization, IRR boundaries, payment warnings and residential/RWA subsidy handling have targeted checks.
- **Distinct optional systems:** BESS/additional-system pricing and economics do not silently change the solar totals.
- **Published snapshots:** immutable customer versions and hashed access tokens separate changing staff drafts from shared customer copies.
- **Honest activity semantics:** manual share starts are not represented as verified provider delivery.
- **Security improvements already present:** ordinary signup defaults to Viewer; public password recovery is fail-closed; scrypt password hashing; CSRF-origin checks; no-referrer protections; bounded assistant requests and quota controls; disabled-by-default development upload routes.
- **Curated Worker static deployment:** `sync-public.js` copies explicit HTML entrypoints and assets instead of uploading the entire repository.
- **Single Worker implementation:** `src/index.js` is a re-export, not a second backend fork.
- **Real regression investment:** coverage spans domain boundaries, rendering/state reconciliation, API behavior and identity attacks, rather than only smoke tests.

## 6. Architectural and operational follow-ups

These are improvement opportunities or scope limitations, not additional independently reproduced critical vulnerabilities.

1. **Reduce backend duplication.** R2 and R3 illustrate why maintaining the same API in two large files is risky. Extract shared validation, capabilities and route-domain operations; keep storage adapters separate. Add cross-backend contract tests before a larger rewrite.
2. **Make authorization intent explicit.** Stored role, typed title, effective permission, designated identity and persistent elevation are separate concepts. Centralize capability interpretation and document how persistent elevation is revoked when designation changes.
3. **Treat browser storage as sensitive.** Drafts and cloud mappings use origin-wide keys; sessions are persisted in browser storage and a JS-readable fallback cookie for preview compatibility. Decide whether shared-device/account-switch isolation is required, and test that policy. This review did not reproduce a cross-account cloud-authorization bypass from those caches.
4. **Stage CSP hardening.** The application has substantial inline content/global scripts and preview-iframe requirements. Begin with report-only CSP and an inventory, not a policy that unexpectedly breaks the builder/exporter.
5. **Use byte-bounded streaming consistently.** General Worker JSON input checks buffer `request.text()` and compare string length (`worker.js:80–84`), while the assistant has a stronger streaming byte limit. Move API parsing toward one byte-correct bounded helper.
6. **Review real D1 payload limits.** Proposal images are embedded in JSON and gallery files are D1 BLOBs. Exercise realistic image-heavy proposals against the actual storage limits before treating an 8 MB HTTP allowance as a persistence guarantee.
7. **Control asset weight.** Measure dashboard/builder first-load behavior on mobile connections before adding more cover variants. Prefer responsive imagery and lazy loading where export behavior permits it.
8. **Separate current runbooks from historical audit evidence.** Earlier audit results are useful history, but current security suites no longer all pass. `workspace-roles.md` also initially says owner promotion clears titles and later correctly says titles are preserved. Pick one current source of operational truth and link historical reports from it.
9. **Add deployment provenance.** `/api/health` uses a manually maintained `CODE_VERSION='roles-r1'`; a generated commit/build identifier would make environment verification more dependable.
10. **Retain small, targeted changes.** A framework rewrite is not required to fix these findings. Correct identity/persistence boundaries first; modularize incrementally while retaining the calculation and export regression tests.

## 7. Recommended sequence

### Before the next multi-user release

- Secure privileged bootstrap and add unverified-designated-email rejection tests (R1).
- Fix Worker save scope and atomic revision enforcement together (R2, R3).
- Make the local backend transactional or explicitly restrict it to single-user development (R4).
- Align CloudBridge with effective capabilities (R5).

### Next engineering pass

- Reconcile team-listing security/OAuth assertions with the approved policy.
- Remove the incompatible browser dependency combination; commit lockfiles.
- Add CI with asset generation, security tests and actual browser dependencies.
- Re-run the full browser/PDF/mobile suite and provider configuration smoke tests in a suitable environment.

### Subsequent maintainability pass

- Extract shared backend contracts and capability helpers.
- Define account-switch cache isolation and session-hardening policy.
- Load-test image-heavy proposals and instrument failed saves/conflicts.
- Consolidate current deployment/role/runbook documentation.

**Bottom line:** preserve the domain engine and breadth of regression work, but prioritize trusted identity and durable, conflict-safe persistence over additional UI features. The repository is feature-rich; its multi-user safety currently needs focused remediation.

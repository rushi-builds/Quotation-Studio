# OpenCode handoff — infrastructure + CI release on PR #33

## State / access boundary

- Feature branch: `arena/1a774e12-quotation-studio` (head at the time of writing: `08770f5`).
- Existing PR: https://github.com/rushi-builds/Quotation-Studio/pull/33 — base **`main`**, 14 commits, 50 files. Leave it open until the owner approves the merge.
- Arena did **not** merge the PR, did **not** deploy the Worker, and did **not** touch D1, secrets, bindings, migrations, DNS or the custom domain.
- The only Vercel action taken was promoting a **preview** of this branch onto the project's own production alias (`quotation-studio-two.vercel.app`) so the owner could see the branch build. Vercel is preview-only in this project; it serves static files and rewrites `/api/*` to the Worker below. Cloudflare remains the real deployment.
- `main` auto-deploys `qs-studio-rushi` when it is updated. That deploy is the step this handoff exists for; nothing in the branch depends on Arena having run it.

## What needs a Worker deploy, and what does not

Only two backend-adjacent files change in this release:

1. `platform/local-server/server.js` — `CODE_VERSION` parity with the Worker (`proposal-feedback-r1`). Local server only; not deployed.
2. `platform/studio-knowledge.mjs` — regenerated assistant knowledge (+49 lines). **This one is imported by the Worker**, so it reaches production only when the Worker is deployed. Everything else in the PR is tests, CI, docs and the Vercel ignore file.

No schema change, no migration, no new binding, no secret change, no route change.

## Deploy into the owner's existing target

1. Deploy the **reviewed branch tip or the merged `main`**, never an older `main` checkout.
2. Use `platform/cloudflare/wrangler.git.toml`:
   - Worker: `qs-studio-rushi`
   - D1: `f3c2c763-e497-4617-8392-25605fceeafe`
   - `OAUTH_PUBLIC_ORIGIN`: `https://qs-studio-rushi.ktmenergyexperts.workers.dev`
3. The repository also carries a generic `wrangler.toml`. Do **not** let its defaults create or deploy a different Worker; the git-targeted config above is the only correct target.
4. Do not run historical migrations for this release and do not reset the database.

## Verify after deploy

```
GET /api/health
  → ok:true, codeVersion:"proposal-feedback-r1", storage:"cloudflare-d1",
    hasDb:true, hasAssets:true, warnings:[]
GET /api/assistant/status
  → enabled per GEMINI_ENABLED; no 403
```

Last verified live state before this release (02 Nov 2026): `codeVersion:"proposal-feedback-r1"`, `build:"workspace-5"`, `storage:"cloudflare-d1"`, `warnings:[]`, all 16 bindings present. The knowledge file is the only expected behavioural difference afterwards.

## Safeguards — do not regress these

- **Test-pinned assets must stay byte-identical**: `assets/images/Tracking.png` (blob `b876c635…`) and `assets/ktm-cover-page-1.png` (sha256 `0d8e226e…`). A browser test hashes both; re-encoding them — even losslessly — fails the suite.
- **Vercel production host list** lives in three files that must stay identical: `assets/js/platform-api.js`, `assets/js/portal.js`, `assets/js/proposal-feedback.js`. Changing it in one place silently re-blocks cloud actions on the production alias.
- **Frozen calc/pricing family** (`finance.js`, `cloud-bridge.js`, `export.js`, `render.js`, and the rest of `qa/pr-scope-guard.cjs`'s list) is pinned by blob hash to golden tree `8cc7db1`. `cloud-bridge.js` and `render.js` already carry drift merged in PR #31; that drift is tolerated, a new edit is not.
- `vercel.json` rewrites `/api/*` to this Worker. Any edit there is a deploy-config change and is rejected by the scope guard on purpose.

## Known red checks on PR #33, and why they are not release blockers

| check | state | reason |
|---|---|---|
| Offline suite (jsdom + node) | **pass** | required suite, green on the head commit |
| Browser suite (Chromium) | fail, `continue-on-error: true` | one real UI interaction (`#prepareRequest` click) still to be diagnosed; needs a browser runner |
| Workers Builds: qs-studio-rushi | fail, 0s | Cloudflare's own GitHub integration failing on the PR ref; unrelated to the test suites — confirm against the Worker log before treating it as a build problem |

Do not "fix" these by weakening the suites. The offline job is the one that guards this release.

# Offer workspace — isolated concept preview

Owner-authorised, disposable UI prototype. Open `/concept-preview/` on the feature-branch Vercel preview. This is **not** production feature integration, an engineering calculation, a signed order, or a verified customer acceptance workflow.

## Scope and reuse

Six connected screens: Scope & pricing, Revisions, Customer view, Site survey, Follow-ups, and Excel export. Uses the existing read-only dashboard stylesheet (Inter fonts and button primitives), KTM logo and approved residential illustration. No existing application entry points, source files, finance/calculation engine, CloudBridge, authentication, configuration or database schema are edited.

Sample prices, names, dates and task records are deliberately synthetic. Do not enter real customer information. UI values are not estimates derived from the live finance engine.

## Isolation

- All new files live in `concept-preview/`; existing app does not import the demo.
- No fetch/XHR, APIs, authentication, email, database access, local/session storage or cookies.
- Page CSP sets `connect-src 'none'` and `form-action 'none'` as an additional barrier. Do not remove it to enable production calls.
- State is memory-local to one tab and resets on reload. A reset dialog is available.
- No real share links/tokens, identity verification, spam controls or public response endpoint are implemented.
- Sample customer responses are explicitly unverified and browser-timestamped, not server acknowledgements or e-signatures.
- No external fonts, scripts, image services or analytics.

## Interactions to review

1. Change a scope treatment or mark unpriced rainwater scope customer-requested. Observe separate totals/pending-price labels and conditional cover warning.
2. Included scope requires an explicit existing-price acknowledgement before sample publication. The solar gross number never changes. Unpriced scope is not zero.
3. Draft changes never rewrite published snapshots. Publish an in-memory sample revision to view/export the changes. This is not an engineering/commercial completeness approval; pending values stay explicitly pending.
4. Old customer views remain pinned. The newer-revision action is explicit; no real token-authorisation mechanism is simulated.
5. Submit a sample response to an old revision; see its version/source in activity. The latest revision still needs a fresh response. Create a contextual follow-up if desired.
6. Save survey source/value/units locally. This never applies survey data to sizing or rewrites the quotation.
7. Add, complete and filter sample tasks. No actual reminders are sent.
8. Download a genuine values-only `.xlsx` of the latest published sample, never the unpublished draft. It is editable by the recipient, not tamper-proof. No hidden worksheets, internal costs, private notes, formulas or live connections.

## Tests

Run a local static server from the repo root: `HOST=0.0.0.0 PORT=8080 node scripts/serve.js` (use a process manager for a persistent server). With QA Playwright and @sparticuz/chromium dependencies and required Linux shared libraries available, run `node concept-preview/test.cjs`. Dependencies resolve from `qa/node_modules` or `NODE_PATH`. Test origin defaults to `http://127.0.0.1:8080` and rejects non-local hosts. Optional `CONCEPT_TEST_OUTPUT` sets an external screenshot directory; default `/tmp/qs-concept-evidence`.

Browser QA passed 53 assertions covering six screens at 1440/768/390px, immutable snapshots, inclusion acknowledgement, old-version responses, escaped user content, contextual tasks, survey source, parsed XLSX contents, reload/reset, zero API/external requests/storage access and zero JS/CSP console errors. Screenshot review: desktop scope/customer and mobile scope.

## Publishing and rollback

Publishing is restricted to the current fixed feature branch; no PR merge or production deployment is authorised. The starting remote feature commit was `0af437dddc35b01caf78a9885e3f4db5bb86c5b2`.

The local checkout had pre-existing unrelated tracked/untracked differences and an older HEAD. A separate temporary Git index based on the verified remote feature commit is used to publish **only this directory**, preserving all those pre-existing local files, the original index and local HEAD. No reset, checkout, clean, history rewrite or staging of unrelated files.

To cancel, remove only `concept-preview/` in a separately approved change. Nothing outside it depends on the demo. Decide whether to remove the demo before any future production release.

## Third party

`vendor/xlsx.mini.min.js`: SheetJS Community Edition, npm `@e965/xlsx` 0.20.3, unmodified mini distribution, Apache-2.0. Its licence is in `vendor/SHEETJS-LICENSE.txt`. Used only for sample workbook creation and test readback; no user workbook import. No root or application dependency files changed.

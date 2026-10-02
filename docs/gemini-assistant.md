# Studio assistant — guarded commands and read-only Gemini

## Current state

The dashboard uses an authenticated, owner-scoped Gemini gateway for general questions and a separate allowlisted browser command layer for open/save/sharing-review/pricing. The same assistant is now available in the quotation Studio. Gemini output itself cannot execute actions.

Cloudflare Builds successfully deployed earlier dashboard releases; the action update is deployment-ready. Live provider replies still require verification with the user's signed-in account. Local regression tests use isolated accounts/data; no live customer records were modified.

Studio changes are limited to the screen-only assistant, cloud-save results/guards and unsaved status. Engineering/finance calculation implementations, proposal page design and PDF export code are unchanged. Pricing calls the existing Finance engine.

## Provider / activation

Default model: `gemini-3.1-flash-lite`, configurable via `GEMINI_MODEL` (a validated Gemini model ID, not an arbitrary URL). Provider reference: https://ai.google.dev/gemini-api/docs/models . Availability, quotas and pricing depend on the Google project; there is no guarantee this is free forever. Review Google's current data-use terms and choose an appropriate project/tier before sending customer records. Dedicated email, phone and address fields are excluded; customer names, titles and user questions can still contain personal data.

Keep API keys out of chat, frontend code, screenshots, URLs, commits and logs.

### Cloudflare

1. In your own Google AI Studio account, create/restrict a key for the intended project: https://aistudio.google.com/apikey .
2. In **Cloudflare → Workers & Pages → quotation-studio → Settings → Variables and Secrets**, add an encrypted secret named `GEMINI_API_KEY`. Never use a plain frontend environment variable. CLI alternative (interactive secret input):
   ```sh
   cd platform/cloudflare
   npx wrangler secret put GEMINI_API_KEY
   ```
3. The Worker automatically creates the small `assistant_usage` counter table on its first authenticated chat request using idempotent `CREATE TABLE IF NOT EXISTS`. No existing business tables are dropped or changed. The SQL migration remains available for administrators who prefer to apply it explicitly.
4. `GEMINI_ENABLED = "true"` is now set in `wrangler.toml` by owner request. Keep `GEMINI_API_KEY` encrypted in Worker secrets.
5. Cloudflare Builds configuration: repository `rushi-builds/Quotation-Studio`, production branch `arena/01a0fb18-quotation-studio`, path `platform/cloudflare`, build `npm install && npm run sync`, deploy `npx wrangler deploy`. Connect starts a deployment of the real connected dashboard, not the visual-only HTML preview.
6. Verify authenticated `GET /api/assistant/status`, then send a non-sensitive test question with explicit consent. Status indicates configuration, not verified provider health. Invalid/revoked keys only surface on chat requests, with a safe error.

The existing Vercel `/api/*` rewrite points at this Cloudflare Worker. The key belongs on Cloudflare, not in Vercel frontend code.

Rollback/kill switch: set `GEMINI_ENABLED` to `false`. Existing non-AI workflows continue to work.

### Local review

Set `GEMINI_API_KEY`, `GEMINI_ENABLED=true` and optionally `GEMINI_MODEL` in a private process environment, not tracked files or command history containing a literal key. Run `node review/dashboard/server.js`. The review backend uses isolated local JSON data, not production Cloudflare data. With no key, chat stays disabled and navigation/theme still work.

## API and data boundaries

- `GET /api/assistant/status`: staff session required, never returns a key.
- `POST /api/assistant/chat`: staff session **and explicit bearer/X-QS-Session header** required (cookie-only requests denied), JSON body max 8 KiB; message max 2,000 characters.
- Request: `{message, proposalId?: string, consent: true}`. Client model/system/context/history/URL fields are ignored.
- Server loads only records whose `owner_id` equals the authenticated user, including selected-record checks. Even Owner does not get cross-user records through AI. This matches existing proposal access semantics.
- Fresh summary counts, up to 30 recent quotation summaries, 30 open tasks, 15 non-prefetch events. A selected quotation includes a narrow allowlist of saved scalar technical/pricing fields. Counts and sample coverage are supplied explicitly.
- No passwords, API keys, session/share tokens, contact fields, image bytes, full PDFs, internal notes, arbitrary form contents or event metadata go to Gemini. Data fields are untrusted model input; the model is explicitly told not to treat them as instructions.
- No tools, function calling, mutation routes or autonomous execution. Model output is displayed as text, not HTML. Source buttons are limited to records in the user's current dashboard list.
- Messages are held in the page only; there is no persistent chat history. Each question is independent and uses fresh server data, not previous chat turns. Context sharing occurs only on explicit Send (or Enter), alongside a visible Gemini sharing disclosure. Opening the launcher or selecting a suggestion sends no workspace context.
- Sending/publishing/deleting, report-wide reasoning and engineering certification are **not implemented**. Future mutation tools need explicit confirmation and auditing.

## Limits / failure behavior

Persistent atomic D1 quota counters: 5 requests/user/minute, 50/user/day; 30 across the app/minute, 500/app/day (UTC epoch buckets). Local development uses in-memory counters reset on process restart. Failed validated requests can consume quota. Quotas are abuse/cost controls, not guarantees of provider free-tier limits or a currency budget. No automatic paid-model fallback or automatic retries.

25-second provider timeout, 1,600 output-token cap, bounded plain-text response. Errors are sanitized; no provider error bodies or secrets are returned. If automatic D1 quota-table creation fails, requests fail closed before provider usage. Counters contain no prompt/response text.

## Tests run

- `node --test qa/gemini.test.mjs`: consent, configuration, auth, ownership, selected-record access, context minimization/truncation, fixed provider host/header key, safe errors, timeout, blocked/tool-only output, rate limits, bounded/malformed bodies (mock provider).
- `node qa/gemini-api.test.mjs`: real local-server route/auth/size/consent/cross-owner/cookie-only checks; no provider requests.
- `node qa/gemini-worker.test.mjs`: Worker adapter with mocked D1 verifies owner-bound queries and all four atomic quota statements; no provider requests.
- SQLite quota UPSERT exercised separately through its configured limit.
- Existing `node qa/platform-api.test.js`: 116 checks pass.
- Dashboard jsdom tests cover UI, consent gate, single in-flight request, plain-text rendering, source allowlisting and unavailable-provider state.

Live Gemini responses, production Cloudflare deployment/bootstrap and production quotas remain unverified until activation. Local end-to-end login/create/save/return passed.

## Workspace 5 connection diagnostics

The current UI uses a closed-by-default floating chat with prompt suggestions, workspace-overview context, retry and clear-chat. **Send** remains blocked until connected and a question is entered. Workspace data is requested only on explicit submit; there is no separate checkbox or quotation picker. No automatic retries or fake answers are used.

`GET /api/assistant/status` now returns a sanitized `reason` (`disabled`, `missing_key`, `invalid_model`, or null) and `build: "workspace-5"`. Public health includes the same build marker. These indicate deployment/configuration, not a successful provider request. Provider key/permission/model/quota failures are differentiated without exposing upstream bodies. Browser status/chat timeouts are 12/35 seconds; provider timeout remains 25 seconds.

- `npm run test:dashboard --prefix qa`: production-root browser regression across every dashboard screen, isolated local account/data; explicit mocks only for chat success/consent/XSS checks. Screenshots are ignored under `qa/shots/workspace-v5`.
- Historical `review/dashboard/*.test.cjs` now load production-root files. `review/dashboard/server.js` also serves the current root dashboard. Stored old review HTML/JS and offline preview are historical, **not the current app**.
- The redesign changes dashboard presentation/controllers only; quotation editor, proposal/PDF design and finance/engineering files are unchanged.

### Simplified assistant UI
The context picker and long sharing footer have been removed at the user's request. Chat now requests workspace overview only (`proposalId: null`), not selected-record technical fields. Only an explicit Send/Enter transmits the question and server-scoped summary; opening the panel or choosing a prompt does not. The footer reads “AI can make mistakes. Please verify once.” Backend authentication, owner scoping, read-only behavior and quotas are unchanged.


## Studio command layer (October 2026)

The model remains read-only. A separate client-side allowlist interprets **user-entered** open, save, share-review and pricing commands before contacting Gemini. It never parses or executes model replies as commands. Ordinary questions still use the guarded Gemini gateway.

- Examples: `open recent quotation`, `open Rushikesh sir's quotation`, `save quotation`, `send quotation`, `3kw ka kitne paise honge`.
- The authenticated proposal list is fetched afresh. Ambiguous names/rate sources show selectable records (first eight, with a narrowing hint). Unknown matches do not open arbitrary records.
- Studio has a screen-only assistant outside proposal pages, hidden for print and marked `data-html2canvas-ignore`. Dashboard and Studio share the chat controller.
- Save applies only to the current Studio quotation. Dashboard cannot save another tab's unsaved form. Existing cloud save now returns a truthful result, coalesces concurrent requests, respects local validation and viewer permissions, tracks unsaved changes, and retains tab-local revisions. Active proposal mapping—not a stale URL—chooses the cloud ID. Conflicts preserve local edits and never produce an AI success message.
- Send means **open the exact quotation's existing sharing review**, not unattended delivery. Current unsaved Studio edits require save confirmation. New local drafts must be saved first. Channel, recipient, prepared message and final manual WhatsApp/email Send remain explicit. Commands never call publish/prepare-send APIs automatically.
- Pricing uses the existing unmodified `Finance.compute`, converting saved `costPerWp` to `costPerKwp` exactly as Render does. Current Studio inputs are used in Studio; dashboard uses a matching saved quotation or asks which rate source to use. Missing rate/GST is rejected, not defaulted. Output names its basis and reports base/GST/gross solar EPC price. Capacity changes are estimates only: no equipment redesign, stored-field mutation, subsidy entitlement, add-on pricing, or engineering certification.
- Commands/pricing do not consume Gemini quota and work when Gemini is unavailable. API authentication/ownership still apply. The provider is not granted tools or mutation endpoints.

Tests: `npm run test:actions --prefix qa` covers pure parsing/financial parity/auth and real-browser local-server workflows, including two-tab conflicts, new-draft mapping, duplicate-save suppression, print isolation and zero provider requests. The dashboard E2E, Gemini gateway suite, 116 platform checks and 50 export preflight checks remain passing. Production requires authenticated user verification; no live customer record was modified during tests.

## Repository-grounded questions and calculations (October 2026)

- Pricing questions no longer run through the browser's keyword/quotation matcher. Gemini receives generated repository reference data, authorized recent workspace facts, bounded recent conversation, and (in Studio) a small allowlist of current unsaved calculation inputs.
- `scripts/build-assistant-knowledge.cjs` extracts actual StateStore defaults, quick presets/reset assumptions and proposal content. `platform/cloudflare/sync-public.js` regenerates this on deploy. The checked-in `platform/studio-knowledge.mjs` supports the local server too. Run the generator after editing those sources; the knowledge test detects drift.
- The only model tool is **read-only** `calculateStudio`. It calls the existing `Finance.compute` without modifying the engine, forms, records or PDFs. Exact generic capacities use the shipped preset; other capacities use an explicitly labeled general default, never an interpolated price list. Named quotations use authorized saved fields; current inputs are identified as client-supplied/unsaved. Missing rate/GST never silently falls back.
- Example: 3 kW quick preset = ₹62/Wp, ₹186,000 base + 8.9% GST ₹16,554 = ₹202,554. The separate ₹63.60/Wp general default gives ₹207,781.20 for 3 kW. These are editable repository assumptions, not live market offers or tax advice.
- Financial projections use the real engine and supplied assumptions. Generation is based on rounded installed module capacity; subsidies are estimates, not approval. Battery/EV/add-ons are excluded from solar EPC totals. Site certification, live prices, unseen records and delivery/payment confirmation must not be invented.
- Questions about Studio/dashboard functionality, proposal text, contacts and general solar concepts are model answers, not canned FAQ branches. Contact details are provided when requested; “contact sales” must not replace an answer already supported by repo facts.
- Conversation is in-memory only, bounded to four 600-character messages and reset by New chat. No client system-role history is accepted. Arbitrary client context/model/URLs are ignored. Server-side ownership checks, API key secrecy, quota, safe text rendering and CSRF protections remain.
- Explicit save/open/share commands retain application safety guards; model tool output never executes these actions. Disconnected Gemini gives an honest connection error for questions, not a fake fallback AI answer.
- Verification: `node --test qa/gemini.test.mjs qa/assistant-knowledge.test.mjs qa/assistant-actions.test.cjs`; API/Worker suites; dashboard and assistant browser suites. Provider/tool round-trip tests use a mocked provider, not proof of live Gemini output.

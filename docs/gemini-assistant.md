# Gemini assistant — read-only integration, deployment ready

## Current state

The authenticated Gemini backend and reviewed dashboard have now been promoted to the production source paths. The Cloudflare build configuration enables Gemini; the encrypted key must already exist on the Worker. No Cloudflare production deployment or real Gemini request has been performed from this workspace. The isolated HTML preview remains visual-only.

Local browser verification passed: session gate → sign in → new cloud quotation → update/save in the unchanged editor → return to dashboard and see the saved customer name. Dark mode and unconfigured-AI state also passed without browser runtime errors. Worker deploy dry-run passed.

No quotation editor, engineering, finance or PDF code changed.

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

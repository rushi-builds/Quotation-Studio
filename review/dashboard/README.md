# Dashboard review v3 — not deployed

Run `node review/dashboard/server.js` and open port 8080. The launcher creates a disposable, empty local account. Original application files are untouched; review files are overlaid at their normal URLs. Backend data is isolated under ignored `platform/data/dashboard-review/`.

## Changes
- Four Home metrics and four Home sections; duplicate charts, accepted-project cards and gallery thumbnails removed from Home (original panels remain accessible).
- Collapsed Sharing & activity / Workspace navigation groups; active group opens automatically.
- Quoted value comes from the report summary and is explicitly not revenue or opportunity pipeline. No N+1 proposal fetching, Finance computation or persistent financial cache on Home.
- Sent-or-viewed filter matches its count; active and creation-month filters added.
- Due today includes overdue tasks due today, but not overdue tasks from earlier dates. Due-today and overdue drilldowns filter the tasks panel.
- Task completion and proposal-list refresh update Home and proposal chips. Overlapping refreshes are coalesced; repeated New quotation clicks cannot create concurrent drafts.
- Failed Home API requests display unavailable/retry states instead of misleading zero/empty data.
- Recent quotations sorted by update time, native keyboard-accessible record buttons, upcoming tasks sorted by due time.
- Closed Assistant launcher explicitly marked Coming soon; no AI API key or fake chat integration.

## Checks
`NODE_PATH=/home/user/review-tools/node_modules node review/dashboard/review.test.cjs` uses jsdom installed outside the repo. Checks filters, task completion, count refresh, API failure/recovery, request/cache reduction, duplicate-create guard and collapsed navigation.

Desktop 1536px and mobile 390px offline-preview smoke checks: no captured runtime errors and no page-level horizontal overflow at 390px. Full production integration and all role-specific workflows still require testing. No deployment/push performed for these fixes.

Build self-contained visual-only preview: `python3 review/dashboard/build-preview.py`. The output is `review/preview/Dashboard-Preview.html`. Its empty-data adapter is explicitly offline and is not used by the connected local dashboard.

## Appearance and assistant shell
- Notification-adjacent Light / Dark / System selector, dashboard-only saved preference, OS theme listener, cross-tab sync and blocked-storage fallback.
- Bottom-right assistant launcher opens a closable, keyboard-accessible panel. Escape restores focus. Local context reflects current user, panel and saved quotation count.
- Real local navigation shortcuts are labelled as shortcuts, not AI output. Composer remains disabled with an explicit AI-not-connected status. No model requests, credentials or AI writes exist yet.
- Actual provider-backed AI requires a separately approved server integration: provider/model selection, secret storage, authenticated scoped retrieval, rate limits, confirmation for mutations and audit trails. No quotation editor or backend files were modified.
- Additional tests: `NODE_PATH=/home/user/review-tools/node_modules node review/dashboard/ui.test.cjs`. Browser smoke checks: dark/light panels render; at 390×844 the assistant stays inside viewport with no horizontal page overflow; no runtime errors captured.

## Gemini integration update
The connected review now uses authenticated `/api/assistant/status` and `/api/assistant/chat` through PlatformAPI. The composer enables only when the backend is configured AND the user consents to sharing context. It remains read-only, with no API keys in browser code and no automatic actions. The earlier disconnected-shell notes describe the previous iteration. See `docs/gemini-assistant.md` for secret setup, migration, deployment boundaries, scope and tests. No real provider call or deployment performed.

## Promotion for Cloudflare Builds
Dashboard HTML/CSS/controller/home/UI have been copied to the production source paths. Session gate → login → create → Studio edit/cloud-save → dashboard return passed in a local browser with no runtime errors. Gemini quota table now auto-creates idempotently; Worker deploy dry-run passed. Production deployment and live Gemini response still require verification after Cloudflare Connect.

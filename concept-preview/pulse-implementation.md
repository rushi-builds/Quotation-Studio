# Studio Pulse — customer operations & isolated persistence

Date: **22 October 2026**. Owner approved the Studio Pulse name and requested customer timeline, smart action desk, automation control, durable data foundations and later authorised messaging connections. This remains an isolated preview; no production/Cloudflare/database migration or provider connection is authorised by these changes.

## Implemented

- Rebrand of the existing Growth Hub slot to **Studio Pulse**, including heading, breadcrumb and page menu; old `?panel=growth` / `?panel=sales` routes retained. Seven contextual tabs, not another sidebar item.
- **Action desk:** current IST deadlines, unanswered threads, missing owners/next steps and old open records. Deterministic priorities, unique-customer KPI counts, action-signal counts, type/owner filters, 25-row progressive display, linked customer/thread/task actions and formula-safe filtered CSV. An old record without stage history is explicitly not called verified stage dwell.
- **Customer 360:** one timeline for CRM date-only events, task deadlines, meetings, inbound/outbound thread examples, internal notes, outbox actions and control events; category filters and direct record editing. Undated notes stay undated; task deadlines are not completion timestamps. Customer-wide pause, opt-out and channel-specific permission-evidence capture. Evidence is staff-recorded, not automatic/provider verification. UI does not clear opt-outs or resurrect cancelled messages.
- **Business results:** source cohorts based on lead-created dates, first recorded wins observed through today, lost/no-outcome classification and observed cohort win share. Different cohorts have different maturity; not causal campaign attribution or the independent activity chart’s conversion rate. Median elapsed inbound-to-first-sent/delivered/read response interval uses measured pairs only. No fabricated revenue/payment ledger, ad spend or ROI.
- **Automation control room:** Draft → Needs approval → Approved → Active/Paused. Approval fingerprints cover rule content/scope; edits reset approval and cancel pending rule jobs. Unsupported/unowned rules cannot activate; malformed active rules are paused rather than blocking other rules. External activation is hard-locked. Internal rules can actually create isolated tasks/notices, manually in static mode or via the optional local worker.
- **Draft outbox:** WhatsApp/Gmail/Outlook message previews, bounded template fields, future IST schedule, duplicate-draft guard, frozen recipient/body, header-line-break rejection, configuration approval, cancellation, status filtering and audit export. Recipient validity/change, permission evidence, opt-out, customer pause, closed deals, new inbound reply, quiet hours, authorised sender and WhatsApp window/template eligibility remain separate gates. Preview approval never transmits a message.
- **Reply safety test:** explicitly simulated inbound example stops pending outreach. This is not a real webhook, customer reply or external provider receipt.
- **Workspace backup:** actual JSON export includes domain records and safety controls. Restoring with the local service is supported only into a new empty sample database; imported rules become Draft and pending actions are cancelled for fresh review.

## Aesthetic / usability pass

`pulse-brand.js` and local `brand-icons/` replace letters/symbols with recognisable channel marks, with pinned source/MIT attribution and explicit trademark/non-endorsement notes. No remote asset request or AI-generated brand artwork. `pulse-polish.css` scopes the teal action system, line symbols, readable labels/body/table typography, subtle status tints, disabled states, keyboard focus, reduced motion, responsive layout and Dark appearance. The existing Dashboard sidebar and quotation pill search are not restyled.

Customer 360 uses a compact identity and stage/owner/next-step/last-message summary above four semantic, keyboard-accessible tabs. Details are no longer all visible in the default timeline. Linked tasks and conversations have direct actions; completing a task preserves the selected Tasks panel and records the actual internal completion. `pulse-customer.js` reorganises existing form nodes rather than duplicating records or creating a second CRM controller. No external action is introduced.

Four preset lead quick views compose with existing source/stage/search/date filters; export uses the same filtered set. Quick views are session UI preferences, not persistent user-created searches. Report controls are hidden on operational tabs (current queue, all recorded dates), not silently applied to the inbox/action desk/rules. The workspace-mode switch and disconnected-state explanation remain visible.

The local SQLite poll also rechecks pending edits/saves/open dialogs after its asynchronous response, so an in-flight refresh cannot hydrate over an edit that began while it was waiting. Version conflicts still fail closed with backup recovery; no production network/storage boundary was relaxed.

## Connection preparations & reversible alert controls

`pulse-governance.js` is a shared pure browser/Node domain layer; `pulse-governance-ui.js` and scoped CSS add controls without another sidebar. The initial ninth connection card is **+ Add**, after Outlook Calendar. The searchable catalogue includes the eight base services plus Google Sheets, Google Drive, Microsoft Teams, Slack, Telegram Business and Custom integration. A custom item is just a named preparation, not an executable integration or arbitrary webhook. Batch 1–12 at a time; up to 40 additional active preparations; repeated providers require distinct case-insensitive labels. Failed batches do not allocate IDs, partially add cards or append audit. Desired Manual/Hourly/Daily preferences do **not** schedule a job. Archive/restore is reversible; real accounts/data are not disconnected/deleted.

Action desk controls are per stable **occurrence**. Overdue tasks use their task identity, so two tasks for one customer at the same deadline cannot collide. The occurrence fingerprint includes relevant recorded stage/owner/deadline/task/calendar context, not the moving “waiting Nh” text. Clock aging alone cannot undo a dismissal; new context does. Dismiss/snooze only affects alert visibility. Raw tasks/CRM/inbox data and automation triggers remain unchanged. Overview attention, visible signal/customer counts and filtered action CSV honour visibility. The actual open-follow-up table retains open tasks. A minute refresh (when not editing/in a dialog) and normal renders apply snooze expiry. History distinguishes Hidden / Expired / Restored / Context changed / Condition resolved.

| Capability | Owner / Admin | Member | Viewer |
| --- | --- | --- | --- |
| Add/configure/archive/restore preparation | Yes | No | No |
| Dismiss/restore alert | Yes, reason required | Request assigned occurrence | No |
| Snooze | Up to 30 days | Assigned occurrence, up to one day | No |
| Review request | Approve/reject with reason; stale occurrence cannot be approved | Cannot self-approve | No |
| Existing Studio Pulse general edits / automation controls | Sample writes allowed | Read-only | Read-only |
| Read sample records / history / export | Yes | Yes | Yes |

All successful controls record actor ID/name, role, time, reason/detail. Request reviews retain the review identity and decision reason; customer timeline includes linked governance controls. JSON backup includes governance. Server projection keeps a separate append-only governance audit table. Existing entries cannot be deleted/rewritten by generic browser writes or commands. This is **not cryptographic/tamper-proof audit** against the machine/database operator, nor authenticated identity for static/imported history.

**No manual role UI:** the access-preview banner, role selector, Access rules button and role-change listener have been removed. Signed-in account/server-session permissions are the required production source; no separate user-selectable role is appropriate. Static mode remains an Owner-capability synthetic demonstration, not real login. QA injects capability contexts from the test harness only; there is no shipped role-switch control.

**Local sample mode:** `--role` fixes the capability role for **every visitor to that instance** (default Owner); `--actor-name` records the sample operator label; `--owner-name` is the assigned-owner match used for Member. GET supplies this trusted sample policy. `POST /concept-preview/pulse-api/control` accepts only `{revision, command}` and uses the server's actor, never a browser role. The shared Node engine executes inside the store's control path; SQLite save checks revision and appends projection/history atomically. Generic PUT cannot change governance even for Owner, cannot seed non-empty privileged governance, and rejects Member/Viewer general writes. Origin/CSRF/size guards remain. Conflict retains the command form and fails closed; reload is required rather than stale overwrite. Polling also respects in-flight controls. While a command awaits the server, workspace/dialog editing is inert and navigation has a dirty guard, preventing a late response from hydrating over a new edit; delayed-response browser checks verify this. Server-side backup restore remains an explicit local operator action into an empty database, not a browser privilege bypass.

This anonymous sample service has **no authenticated users, no tenant/record privacy and no real production Owner/Admin authority**. All roles can read/export full synthetic data. Production must obtain trusted login/session identity, tenant/record scopes, role assignments and server-side policies before real data/people enter it. A capability preview or fixed CLI role is not that implementation. No role can connect providers, enable a missing sender or delete a customer using these alert controls.

Example Member sample instance (use an already initialised synthetic workspace or explicit safe sample restore; lower roles cannot initialise general workspace data from the browser):

```sh
python3 concept-preview/pulse-server.py --db /home/user/member-sample.sqlite3 \
  --port 8092 --role Member --actor-name 'Sample sales operator' --owner-name Sales
```

## Two deliberately distinct runtime modes

### Static review / Vercel

The checked-in `dashboard.html` retains `connect-src 'none'`; `studio-sandbox.js` is unchanged and browser storage stays isolated. No backend/provider request is attempted. Edits are memory-only and reset on reload. JSON/CSV downloads are real; external accounts remain disconnected. Clicking an approval or internal action is not a production deployment or customer-message send.

### Optional local persistent SAMPLE workspace

Requirements: Python 3.9+ with SQLite JSON support and Node.js (the test environment uses Python 3.11 / Node 22). No pip/npm dependency is required by the local service itself.

```sh
python3 concept-preview/pulse-server.py \
  --db /home/user/studio-pulse-demo.sqlite3 \
  --port 8090 --scheduler
```

Open `/concept-preview/dashboard.html?panel=growth` on port 8090 (or `/`, which serves the same workspace). The server binds `0.0.0.0` and accepts the preview proxy origin; the browser uses **relative same-origin URLs**, never a browser-facing localhost backend.

- Database path must be **outside the repository**. File mode 0600; no database, sample export, browser dependency or screenshot is committed.
- The explicit opt-in server response alone changes the delivered Dashboard CSP to `connect-src 'self'` and injects an ephemeral local CSRF/session capability. Checked-in static HTML/CSP and the sandbox are untouched. The only data endpoint is `/concept-preview/pulse-api/workspace`; it cannot proxy to the production `/api` rewrite or any provider.
- Token-header + same-origin/fetch-metadata checks, JSON-only bounded writes, strict root fields/prototype-key guards, identity/link validation, relational foreign keys, transaction rollback, unique outbox idempotency keys, external-`Done` rejection and append-only existing control history.
- Relational projections for organisations, contacts, opportunities, linked tasks/threads/meetings/activity, outbox and audit alongside an atomically versioned workspace snapshot. Repeat opportunities can share an organisation; this is not a production-ready contact-deduplication model.
- Real browser save/load across reloads, optimistic revision checks and explicit two-tab/worker conflicts. A rejected/stale save retains the in-memory edit and offers JSON backup recovery; it does not silently overwrite a newer snapshot. Initial DB load makes the panel inert to avoid overwriting edits during hydration. Production should move from whole-workspace CAS to permission-scoped entity/event APIs.
- `--scheduler` runs a real local loop every 15 seconds, invoking the pure Node worker. Only approved, unchanged **internal** rules can execute. Task/notice effects and idempotency/audit state commit together; replay has no duplicate effect. Worker errors leave the last committed database intact. Browser polling loads local-worker changes when no dialog/unsaved edit is active.
- Without `--scheduler`, the database persists but internal execution is manual. This is not a distributed queue, production scheduler, provider retry/dead-letter system or delivery transport.
- This is an **anonymous single sample workspace**, not real login, tenant/role authorisation or encrypted production storage. A preview URL holder can open it. CSRF checks are not user authentication. Do not put real customer data or credentials in it.

Restore a downloaded sample backup safely:

```sh
python3 concept-preview/pulse-server.py \
  --db /home/user/studio-pulse-restored.sqlite3 \
  --restore /path/to/Studio_Pulse_Sample_Workspace.json \
  --port 8090
```

Use a **new empty** database path. Restore preserves historical sample records and adds import provenance, but invalidates rule approvals and cancels pending actions. It does not automatically start the scheduler or restore live provider permissions.

## Still required before real sending / production

No provider adapter, OAuth callback/token vault, real mailbox/calendar/social/WhatsApp subscription, signed webhook receiver, secure provider identity mapping, verified consent policy, WhatsApp template/window validator, production permission-scoped API, encrypted sensitive storage or production queue is installed. All external sender gates are deliberately false; preferences/JSON imports cannot unlock them. No delivery is inferred from configuration approval, Sent email, or a sample read receipt.

Future real sending requires company-owned authorised accounts, least-privilege scopes, provider-approved onboarding, server-side credential protection, real opt-out/purpose/window/template checks, authenticated approval roles, account/tenant isolation, webhook reconciliation, durable retry/rate-limit/idempotency handling and provider delivery audit. Do not deploy this anonymous sample server with real data or expose it as production infrastructure. No universal historical backfill or permanent raw-provider retention is promised. See official-source references in [tracking-research.md](tracking-research.md).

## Executed verification

**Previous full release: 691 checks PASS:**

| Suite | Checks |
| --- | ---: |
| `business-engine-test.cjs` | 48 |
| `pulse-operations-test.cjs` | 66 |
| `pulse-server-test.py` | 49 |
| `pulse-ui-test.cjs` | 80 |
| `business-pulse-test.cjs` | 104 |
| `quote-summary-test.cjs` | 58 |
| `dashboard-test.cjs` | 16 |
| `pulse-polish-test.cjs` | 69 |
| `pulse-governance-test.cjs` | 78 |
| `pulse-governance-server-test.py` | 53 |
| `pulse-governance-ui-test.cjs` | 70 |

**Role-banner correction: 277 focused checks PASS** — 77 governance UI, 69 polish, 78 governance domain and 53 command HTTP. The updated UI suite asserts no access banner/role picker/Access rules button on every Studio Pulse tab or local sample mode. Its role scenarios inject a test context; no role-change UI/listener ships.

Static browser runs report zero production-API/external requests and browser errors. Local-mode browser checks use only the isolated local endpoint; verify durable edits, a real 15-second background internal action, stale-tab rejection and recovery backup. Expected conflict responses are exercised, not hidden. SQLite tests cover reopen/durability, FK projection, transaction rollback, immutable prior audit, private-file/path/prototype guards, CSRF/origin/method isolation and safe backup restore. Desktop, 390px, 768px, actual Dark, customer timeline, action desk, control room, outbox, cohort results and persistent-worker screenshots reviewed. These are not provider API, production auth/security, load or real-delivery tests.

Run browser tests sequentially with Playwright/Chromium and the static server on 8080. `pulse-ui-test.cjs` accepts `PULSE_LOCAL_URL` (default 8090); `pulse-governance-ui-test.cjs` accepts the same variable (default 8091). Use an isolated Owner sample service with `--scheduler`; this run used a separate disposable 8091 database, not the existing demonstration workspace. Its edits are synthetic; use a disposable sample database. In this workspace browser dependencies are outside Git at `/home/user/qs-preview-tools/node_modules`; Chromium `/tmp/chromium`, libraries `/tmp/qs-al2023/lib`. Screenshots remain outside Git at `/home/user/qs-pulse-evidence`, `/home/user/qs-business-evidence` , `/home/user/qs-polish-evidence` and `/home/user/qs-control-evidence`.

Only concept-preview changes are published. Finance/CloudBridge/BESS/app.css/sandbox hashes and the unrelated tracked patch match the preservation baseline. Existing quotation summaries/comparison, contextual Analytics, pill search and native Dashboard tests pass. PR remains separate from merge approval → parity → correct owner production connection/deploy. Push-triggered CI is independent of manual production authorisation.

# Studio business tracking — implementation and integration boundary

Date: 21 October 2026. Scope: an isolated, disposable Dashboard preview. Studio is the master system; Sparrow and Bigin were reference products, not integration targets. The owner asked for tracking and business operations, not another Instagram/LinkedIn editor. External connections are deferred.

## Reporting contract implemented now

- Business history counts `created`, recorded first `quoteAt` and first `wonAt` independently in inclusive IST calendar ranges. Source filtering uses the recorded lead source. This is activity reporting, **not** a same-cohort conversion percentage. Reopening a stage retains first-win history; changing a stage does not invent a quotation issue.
- Daily/monthly/yearly grouping and available-history/custom date controls. Comparisons are withheld if the preceding period lacks fixture coverage. Current-month/year data can be partial.
- Instagram content views, LinkedIn impressions and website sessions are provider-native additive observation examples, not a combined audience. Missing/null observations remain unavailable; known zero is distinct. Each total includes measured-day coverage and excludes missing observations.
- Daily unique reach/users must **not** be summed into monthly/yearly unique audiences. The fixture supplies no period-deduplicated audience: the UI shows unavailable. Aggregate analytics cannot name every viewer.
- Website source/medium sessions are explicit synthetic daily rows, not reverse-engineered from social clicks or CRM lead source. Their sum reconciles to available website sessions, including Unknown/unassigned. Real ingestion needs native analytics dimensions, UTM/provenance and identity evidence before linking to a Studio lead.
- Post snapshots are read-only lifetime measurements for posts published in the chosen range, explicitly not measurements accrued only during that range.
- Snapshot upsert uses provider/object/date/metric identity and chronological observation timestamps, rejects invalid dates/negative values, supports nullable revisions and ignores stale retries. This is pure library logic: no provider ingestion transport calls it yet.
- Receipt folding is a pure state helper that avoids downgrading delivered/read states on late lower-progress receipts. It is not a webhook receiver, proof of attention, or a send operation.
- CSV output protects spreadsheet formula prefixes and quotes embedded separators/newlines. Exports say sample/unavailable explicitly.

## Local business workflows

Business records are separate from quotation fixtures. The preview provides editable lead/opportunity-like records, a seven-stage pipeline, owner/service/source/contact fields, notes, tasks, customer-linked communication context and an internal agenda. Preview records are flat local objects, **not a production relational CRM schema**, and are discarded on reload. Production should separate contacts, organisations and opportunities, allow repeat opportunities for an organisation and permission-scope every record.

Task/event forms require a linked record and future IST time, reject duplicates and never create external invitations. Internal handling markers do not change provider read status or claim a customer replied. Customer-waiting examples use actual last-inbound timestamps rather than a later outbound message.

Rules have trigger, recorded lead-source condition, optional reply-channel condition, action and owner. WhatsApp conversation filtering is independent of the lead’s acquisition source. Same-day task deadlines are compared in IST; date-only tasks default to end-of-day. Dry runs return deduplicated matches, stable keys and readiness blockers, **without executing** proposed actions. External proposals remain blocked for disconnected sender/unverified permission. Simulation history is not a delivery/execution audit log.

All eight connection cards remain disconnected. Saved labels/history/cadence are memory-only preferences, not OAuth configuration, timers, backfill or scheduled jobs. No credentials are collected. External OAuth, production database writes, actual mail/calendar/WhatsApp/social/analytics sync, consent verification and AI generation are absent.

## Official provider research influencing the design

Public documentation is a design reference, not a tested provider integration or a guarantee of granted permissions. Access/version/history/retention must be rechecked when implementing each adapter.

| Provider | Constraint respected in this preview | Reference |
| --- | --- | --- |
| Instagram | Professional-account insights; account/media metric scopes and available history differ. Unavailable data must not become zero, and all-time history must not be promised. | [1](https://developers.facebook.com/docs/instagram-platform/insights/) · [2](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights) |
| LinkedIn | Approved Community Management access/account permissions; native page/share analytics. Organic and sponsored measurements are distinct; share history has a rolling window. No unconditional personal-account prohibition is assumed. | [3](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview?view=li-lms-2026-09) · [4](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics?view=li-lms-2026-09) |
| Retention | Do not promise to store all raw provider data forever. Permissions, contractual retention, deletion and revocation must shape the backend. | [5](https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements?view=li-lms-2025-11) |
| Gmail | Server-side watch notifications wake processing; history/cursors reconcile changes. Watches need renewal and recovery/resync handling. | [6](https://developers.google.com/workspace/gmail/api/guides/push) |
| Outlook | Graph change notifications plus delta reconciliation; mail delta is folder-scoped. Subscription renewal/missed notifications need lifecycle handling. | [7](https://learn.microsoft.com/en-us/graph/delta-query-messages) · [8](https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events) |
| WhatsApp | Incoming messages and reported delivery states arrive via webhooks. Eligible Business-app coexistence history is consented and limited, not universal personal-account inbox access. | [9](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/) · [10](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/) |
| Website / GA4 | Authorised property reports have native metrics/date/source dimensions. Users are not additive unique people across periods; sessions do not identify every visitor. | [11](https://developers.google.com/analytics/devguides/reporting/data/v1) · [12](https://developers.google.com/analytics/devguides/reporting/data/v1/basics) |

## Backend work required before real connections

1. Production Studio persistence: tenant/account/role-scoped contacts, organisations, opportunities, quotation event links, consent, tasks, conversation/calendar references and audit trail. Do not migrate sample fixtures into live records.
2. Server-only OAuth/credential vault, narrowly scoped permissions, state/CSRF checks, refresh/revoke/delete and safe account re-linking. Never collect passwords or tokens in chat/browser preferences.
3. Per-provider adapters: incremental cursors, signed webhook verification, subscription/watch renewal, pagination, rate limits, bounded retries, durable idempotency and out-of-order reconciliation. Provider notifications are not by themselves a complete event history.
4. Persistent metric snapshots with provider/account/object/metric/date/timezone/observedAt provenance, correction handling, coverage windows and policy-compliant retention. Query period-unique users/reach natively instead of summing daily uniques.
5. Sync health must distinguish last attempt, last successful sync, data-through, permission state, backfill coverage, gaps and next actual scheduled run. No green Connected/Live state until verified.
6. Separate mail/calendar permissions; provider-to-Studio identity matching that does not merge customers merely by shared domain. Explicit external invitation/outbound controls; no provider read markers from internal handling alone.
7. Automation executor only after approved scope, verified outreach permission/opt-out, sender/template/window eligibility, durable jobs, idempotency, human override, rate limiting and delivery audit. Preview draft saving and dry-run matches are not activation.
8. Owner review → separate merge approval → parity verification → correct production account/connection → owner-controlled deployment/smoke checks. No merge or production deployment was authorised here.

## Evidence

`business-engine-test.cjs`: 48 pure checks. `business-pulse-test.cjs`: 104 browser checks, including source-session reconciliation, all-available/yearly drilldown, CRM exports, tasks/calendar, rule blockers and disconnected mode. `quote-summary-test.cjs`: 58 regression checks. `dashboard-test.cjs`: 16 native Dashboard checks. **226 total PASS**; browser suites observed zero API/external requests and browser errors. Desktop, 390px/768px and actual Dark screenshots reviewed. These do not validate real OAuth/providers, persistence, production security or live sync. Historical editor tests describe a rejected design and are not part of the current count.

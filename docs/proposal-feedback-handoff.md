# Private proposal feedback — implementation / release handoff

## Behaviour
- The existing builder shortcut now opens the published feedback form; an unpublished quote gets an honest publish-first message instead of a broken local request jump.
- Closing page: **Discuss your project** opens the company WhatsApp chat. **Share proposal feedback** links to `portal.html?t=<published-token>#proposalFeedback`.
- Only a transferable published portal link enables feedback in a PDF. An unpublished draft or browser-local `share.html?p=...` is not presented as a working customer feedback link.
- Stars are optional (integer 1–5). A message without a rating is valid; an entirely empty submission is not. Comments/requests allow 1,500 UTF-16 characters, including Unicode. Optional next step + contact request are recorded, not auto-booked.
- No public business review, invented average, review gating, free survey/report entitlement, automatic task/order/payment, email, or WhatsApp notification is implied.
- Customer success appears only after the server returns a persisted receipt. Failed or ambiguous requests retain the draft; retries reuse the submission ID. Per-tab drafts expire after two hours and clear after success. Raw bearer tokens are not stored in drafts or feedback metadata.

## Persistence and access
- New `POST /api/portal/feedback` in both the Worker and local server. `GET /api/portal/proposal` advertises `access.feedbackAvailable: true` only in the new backend.
- Existing `portal_events` stores `proposal_feedback`, with proposal ID, published version ID, actual rating/comment/next step/contact request and server-side context.
- An unread `notifications` row is committed atomically with the feedback. The assigned **proposal owner** receives it, even when a different authorised admin published the link. Existing Owner/elevated visibility and staff ownership guards are unchanged.
- Studio **Customer activity** and the quotation's event history show the original feedback and follow-up request. Existing read/unread notification actions remain truthful; no 'resolved' or 'customer contacted' state is fabricated.
- Token validation, expiry/revocation, proposal/version association, JSON bounds, allowed fields, escaped rendering, deterministic idempotency and a six-submission/hour/link cap apply. SQL enforces the rate predicate inside the atomic batch. Duplicate retries do not create duplicate feedback/notifications.
- This is bearer-link feedback, **not identity-verified customer testimony**. Anyone legitimately holding the link can respond. There is no public feedback-list endpoint.

## Release boundary
Implementation and disposable local tests are complete. **No production Worker deployment, D1 command, catalogue Sync, secrets/provider change or migration has been performed.**

Uses existing tables; no new schema migration is introduced. Finance, export, CloudBridge, logo/photo, approved closing footer/artwork, existing role rules and connection settings are unchanged.

OpenCode remains responsible for the authorised production release. Release the Worker and its matching assets together using the established process; do not distribute new feedback-linked PDFs before that release. Expected `/api/health` code marker: `proposal-feedback-r1`. A new frontend with an old backend keeps submission disabled, never pretends to save. Vercel preview's production-rewritten APIs remain blocked; it is not a live feedback inbox.

## Focused verification
- `node --test qa/proposal-feedback.test.mjs` — 8 groups, actual SQLite schema and actual Worker HTTP route: validation, atomic writes/rollback, idempotency, scopes/association, expiry/revocation, Unicode, bounded body, rate cap, generic-event bypass and publisher/assignee distinction.
- `LD_LIBRARY_PATH=/tmp/lib node qa/proposal-feedback-browser.test.cjs` — actual disposable local platform: publish → customer form → feedback + unread notification → Studio; unrelated staff cannot read it. Lost-response retry, draft restoration, message-only feedback, low ratings, XSS escaping, mobile/keyboard, revoked link and old-backend capability checks.
- `LD_LIBRARY_PATH=/tmp/lib node qa/closing-page.test.cjs` — approved A4 layout/artwork, actual one-page PDF link annotations, direct WhatsApp vs secure feedback, local/published routing, gallery, unsafe URLs, continuation, unchanged Finance and no production writes.
- Worker bundled locally with esbuild; this is a build check, not a release.

Browser evidence is under ignored `qa/shots/proposal-feedback/`. All people, accounts, proposal IDs and receipts in that evidence are disposable local QA fixtures, not production customer activity. After an authorised release, live verification must use an explicitly approved test proposal/link; do not submit fabricated customer feedback to production.

Historical `brand-engineering`, `audit-browser` and `visual-discovery` tests include assumptions about the deliberately retired local engineering/acknowledgement UI (some also predate the approved signature-free closing design). They are not claimed as passing evidence for this flow; the focused suites above cover the replacement behaviour.

# Private proposal feedback — implementation / release handoff

## Behaviour
- The existing builder shortcut now opens the published feedback form; an unpublished quote opens an explicitly labelled, non-submitting form preview instead of a broken local request jump.
- Unpublished builder closing pages keep **Share your thoughts** visible as a keyboard-accessible preview button. It has no `href` and is screen-only, so no preview URL or non-working feedback link is exported into the PDF. Customer/local viewers do not receive this builder preview action.
- Closing page: **Chat on WhatsApp** opens the company WhatsApp chat. **Share your thoughts** links to `portal.html?t=<published-token>#proposalFeedback`.
- Only a transferable published portal link enables feedback in a PDF. An unpublished draft or browser-local `share.html?p=...` is not presented as a working customer feedback link.
- Stars are optional (integer 1–5). A message without a rating is valid; an entirely empty submission is not. Comments/requests allow 1,500 UTF-16 characters, including Unicode. Optional follow-up permission is recorded, not auto-booked. The removed next-step field is accepted only for older-client compatibility.
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

`feedback-preview.html` reuses the same form fields and interaction module without any token, API access, draft storage or receipt/success behaviour. The send button remains disabled; even a programmatically dispatched submit cannot call the API. `qa/feedback-preview.test.cjs` verifies discoverability, preview form parity, mobile/keyboard access and zero API writes.

## Current presentation
The optional four-card “What comes next” section has been removed, including its select, radios and clear control. New feedback sends no next-step preference; requests can be written in the message. Existing feedback/notification history and the backend's backwards-compatible enum are unchanged. An identical previously attempted draft may retain its old preference only to return the original idempotent receipt; editing that draft resets the removed preference. This upgrade path is exercised against the real disposable local API.

The remaining form contains optional stars, a message, and optional follow-up permission. Colourful SVG reactions stay inside the selected star, with blue star eyes for five stars and a short pop animation (disabled for reduced motion). The illustrated response within the rating panel changes for all five ratings; celebration is not a persisted receipt. Its live region updates only on rating changes, not while typing.

Closing is feedback-first: a compact soft-periwinkle **Share your thoughts** action and a quieter underlined **Chat on WhatsApp** link, without an outer joined strip. There are no arrows, pointer icons, second-line captions or instruction line. Its actual published PDF link annotations, secure-link validation, unpublished builder form preview, keyboard support and unchanged approved footer/artwork are covered by focused browser/PDF tests. Unpublished preview actions are screen-only and never exported as customer feedback URLs.

The comment label stays “Share your thoughts”; only the empty-field hint changes with the selected rating. Selecting, clearing or restoring a rating never replaces the message. Focused tests cycle all five ratings with a typed note and verify the note remains intact.

## Approved full-page reference refinement
The latest customer reference supersedes the prior minimal action styling: contact details sit below a company heading, the engineering inputs are four quiet ivory numbered rows, and the two centred actions are orange feedback / green-outline WhatsApp with the existing WhatsApp SVG mark. Arrows appear only on functioning actions, never on static engineering rows. All contact and engineering words remain editable live HTML. The original logo/photo, approved hero copy and wave/lettering/footer are preserved; no new company claims, booking promises, service forms, schema, auth or provider changes are introduced. Focused A4/PDF tests cover the reference palette, retained link annotations, mobile routing and authored-text continuation.

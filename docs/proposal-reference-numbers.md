# Proposal reference numbering and local copies

Implemented 3 October 2026. The owner approved using a shared counter in the existing database after the additive schema change was explained.

## Number allocation

- Online Dashboard creation, Studio New, Studio Duplicate, a genuinely fresh signed-in direct Studio opening, and the blank replacement after deleting the last Studio draft reserve a shared reference. API creation with an empty reference and API duplication also allocate references.
- Format: `KTM/YYYY/Solar/NNN`. The server year uses Asia/Kolkata. One atomic D1 UPSERT advances the annual high-water mark, including existing numeric references. Deletion never resets the counter. Reservations/cancelled creation can leave gaps; numbering is unique, not gapless.
- `proposal_reference_counters` is a small additive table in the **existing** D1 database, initialized idempotently on first allocation and included in `platform/schema.sql` for new installs. No existing rows are rewritten and no database reset/full-schema migration is needed. The JSON development backend keeps equivalent counter metadata in its existing file.
- Existing/manual references are preserved. Versions intentionally retain the proposal reference and advance the version. Reset retains the reference. Existing duplicates are not automatically renumbered.
- Offline, static-hosted and unsigned-in Studio drafts use browser-local high-water numbering. Those references, imported references and manually supplied references are not guaranteed unique across devices. Reconnecting does not silently renumber existing quotations. Use signed-in New for shared allocation; review older offline/imported references before sending.
- Reservation requires existing write permissions; viewers cannot reserve numbers or create cloud quotations. No login, ownership or authorization rules are changed.

## Cloud opening and local cache

Opening a cloud quotation reuses a linked local copy only when its persisted SHA-256 clean signature still matches. Dirty/unverified local copies remain intact. Historical duplicate copies are not automatically purged. A pending Dashboard open does not first create an unrelated blank local quotation. New/local navigation clears stale cloud URL/session markers.

## Clearing the list or suggestions

1. **Dashboard → Quotations → Delete** removes the cloud quotation under the existing permissions. It does not delete browser-local drafts or browser autofill.
2. **Studio → Proposals dropdown → select a record → Delete** removes that browser-local copy only. Back up or save any wanted edits first. Deleting the final local copy opens a newly numbered blank draft, so the list need not become empty.
3. Suggestions supplied by the browser are separate autofill history. Manage those in browser settings if needed. The reference input now requests `autocomplete="off"`; browsers may choose to ignore it.

Deleting either kind of quotation does **not** restart numbering. Avoid clearing all site data merely to tidy this list: doing so can remove unsynced drafts and session settings.

## Verification

- Full `npm --prefix qa test`: 15 suites, 995 assertions passed, plus 54,600 engineering sizing scenarios.
- `npm --prefix qa run test:references`: SQLite-backed atomic allocator, actual Worker routes, permissions, preservation of manual refs/updates, deletion high-water, India year boundary and offline model tests (3 passing tests).
- `npm --prefix qa run test:references:browser` against an isolated development store: Dashboard creation, no ghost initial draft, repeated clean cloud opening, preservation of unsaved local edits, Studio New/save/reload, versions, server/UI duplicates, eight concurrent API creates, signed-in direct opening, reset, last-copy deletion both signed-in/unsigned-in, and static hosting with API 404 responses.
- Browser tests use Playwright and Chromium from the QA dependencies. Set `QA_BASE` to an isolated local server (default `http://127.0.0.1:8080`); never point these account/quotation-creating tests at production. Some Linux environments need the Chromium package's supplied shared libraries on `LD_LIBRARY_PATH`.
- Cloudflare Worker dry-run bundling succeeded. Automated tests do not mutate production data.

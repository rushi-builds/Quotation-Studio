# Feedback inbox

One screen for everything a customer or visitor has said, whether it came from
the **public portfolio** or from a **shared quotation**.

## The two sources

| Source | Written by | Stored in | What the studio sees |
|---|---|---|---|
| Project note | anyone on `gallery.html` — no account, one first-party cookie | `gallery_feedback` (D1) | rating (optional), the note, the project it is about, the visitor's chosen name |
| Quotation rating | the customer who opened a shared proposal link | `portal_events` where `event_type = 'proposal_feedback'` | rating, comment, next step, "wants a call", the quotation and the version |

Both are merged server-side by `platform/feedback-inbox.mjs`, so the two
backends (Cloudflare Worker and the local server) return the same shape and the
same numbers. That module is pure: it takes rows and returns items plus
statistics, which is why the maths is unit-testable.

## Handled state

A third table, `feedback_state (source, item_id, handled_at, handled_by)`,
remembers which notes have been dealt with. It is separate so neither source
table is ever rewritten and a handled note can be re-opened without losing its
text. `source` is `project` or `quotation`, so one route can address either.

## API

| Route | Who | Returns |
|---|---|---|
| `GET /api/feedback?source=&status=&rating=&q=&proposal=&project=&limit=&offset=` | any signed-in staff member | `{items, stats, matched, hasMore}` |
| `GET /api/feedback/export` (same filters) | any signed-in staff member | `text/csv` download |
| `PATCH /api/feedback/<source>:<id>` `{handled:boolean}` | sales and above | the new handled state |
| `GET /api/gallery/insights` | any signed-in staff member | likes total, this week, and the project leaderboard |
| `GET /p/<project id>` | public | the project's share card (Open Graph) |

**Scoping.** Project notes belong to the workspace and every member reads them.
Quotation notes follow the quotation: an owner (or the workspace's own
owner-level account) sees all of them, a member sees only the notes on their own
quotations. Marking handled is a write, so a viewer can read but not change it.

**Stats are never filtered.** `stats` is always computed from the whole inbox,
so "12 notes, 4.3 average, 4 need a reply" does not change when you click a tab.
`matched` and `items` are the filtered view.

## The panel

`#panel-feedback` in `dashboard.html`, styled by `assets/css/feedback-inbox.css`,
driven by `assets/js/feedback-inbox.js`.

- four figures: notes received, needs a reply, average rating, project likes
- tabs for all / projects / quotations, with live counts
- search, status filter and rating filter (all server-side)
- each note names the person, shows the stars, the project or the quotation,
  a "wants a call" flag when the customer asked for one, and one action to
  mark it handled (or undo)
- side rail: rating split, most-liked projects, and a short explanation of
  where the two sources come from
- the sidebar entry carries a badge with the number of unhandled notes

## The link back to a quotation

Every row in **Quotations** that has feedback carries a small chip
(`★ 4.5 · 2 notes`). Clicking it opens the inbox filtered to that quotation, so
the note and the quotation it is about are one click apart. The existing
proposal activity timeline still shows the same note in context.

## Project catalogue

`assets/js/gallery-projects.js` holds the 41 published projects and is the only
copy of that list. `scripts/build-gallery-catalog.cjs` turns it into
`platform/cloudflare/src/gallery-catalog.mjs` for the Worker (feedback ids, the
like leaderboard, share cards). `platform/cloudflare/sync-public.js` rebuilds it
on every deploy, and `qa/feedback-catalog.test.cjs` fails if the committed copy
is stale, so the page and the backend cannot drift.

## Tests

- `qa/feedback-inbox.test.cjs` — the whole loop against a disposable local
  server: both sources in one list, stats, filters, handled/undo, CSV, scoping,
  auth, and the likes leaderboard (36 checks).
- `qa/feedback-catalog.test.cjs` — the generated catalogue matches the gallery.
- `qa/proposal-feedback-browser.test.cjs` — the customer's side of a quotation
  note, unchanged and still passing.
- `qa/gallery-page.test.js` — including the `/p/<id>` share card.

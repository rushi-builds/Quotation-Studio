# Platform Phase A — Cloud foundation

_Status: in progress. Personal Cloudflare account first; company mail transfer later._

## Goal

Staff can sign in, save proposals in the cloud, open them on another device, and
use a real dashboard. The existing Quotation Studio builder and customer-facing
proposal design stay intact.

## Stack (free tier)

| Piece | Choice | Notes |
| --- | --- | --- |
| Hosting | Cloudflare Pages | Static app: `quotation.html`, `dashboard.html`, `share.html` |
| API | Cloudflare Workers | Same routes as the local dev server |
| Database | D1 | Schema in `platform/schema.sql` |
| Files (later) | R2 | PDFs / frozen snapshots from Phase B |
| Local preview | `platform/local-server` | Pure Node, JSON file DB — no Cloudflare login required to develop |

## What Phase A delivers

1. Staff register / login (email + password, session cookie).
2. Cloud proposal list + CRUD (create, open, update, delete, duplicate).
3. Dashboard home: KPIs, recent proposals, status breakdown.
4. Bridge: **Open in Studio** (cloud → local builder) and **Save to Cloud** (builder → cloud).
5. Offline studio still works on localStorage alone (no login required to quote).

## What Phase A does **not** claim

- Secure customer token links (Phase B)
- Frozen sent versions + stored PDFs (Phase B)
- Real open tracking / notifications (Phase D)
- WhatsApp/email provider delivery (Phase C)
- Kill switches or hidden sabotage controls (never)
- “Sent / delivered / opened” as verified facts — dashboard KPIs use **Draft / Ready / Accepted** (staff-marked only)

## Security notes (Phase A local + future Worker)

| Control | Status |
| --- | --- |
| Password hash | `scrypt` with explicit cost (not bare SHA-256) |
| Session cookie | `HttpOnly`, `SameSite=Lax`, `Secure` when HTTPS |
| CORS | No `*` + credentials; same-origin / matching host only |
| Auth throttle | Per IP (`CF-Connecting-IP` when present) + per-email **exponential backoff**; same 429 text always; login failures use one message (no email-existence leak); success clears that email’s backoff |
| Client bundle secrets | None — only same-origin `/api` calls |
| Row isolation | Every proposal query filters `owner_id = session user` (D1 has no RLS — must stay manual) |
| Cloud save conflict | Monotonic server `revision` integer; client sends `baseRevision`; mismatch → **409** (not client clocks) |
| Search | Dashboard filter is in-memory / `LIKE`-style only — D1 has no FTS5 on free path; do not plan full-text yet |
| PDF storage (Phase B) | Cloudflare R2 (egress free); frozen snapshot + PDF SHA-256 on publish |

## Offline guarantee

With the platform server **stopped**, `quotation.html` must still load and run on pure static hosting. Cloud bar shows “Browser only”; localStorage autosave unchanged.

## Phase B locks (do not redesign later)

1. Customer access token: 32 random bytes; store **SHA-256 hash only**; constant-time compare; expiry + revoke; never log raw token.
2. Customer portal = separate bundle (`share.html` path) — no `control-panel.js` / `editor.js` in that page.
3. Customer routes are **GET (and limited POST for responses)** only; allowlist-tested so tokens cannot hit staff write APIs.
4. Publish freezes JSON snapshot + PDF bytes + SHA-256 of both; draft edits must not change an already-issued portal view.
5. Open beacons after paint; bot/prefetch → `suspected_prefetch`, not “accessed”.
6. Privacy notice + retention + delete path (DPDP-minded) before live customer traffic.

## Transfer to company account later

When `rushikesh.dhumal@ktmenergyexperts.com` (or similar) is ready:

1. Create Cloudflare account with the company mail + 2FA.
2. Create D1 + Pages + Worker there; apply `platform/schema.sql`.
3. Export local/dev data (`platform/data` or D1 export) and import.
4. Point DNS; redeploy same repo.
5. Remove production access from the personal account.

## Routes (API contract)

```
POST   /api/auth/register   { name, email, password }
POST   /api/auth/login      { email, password }
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/proposals
POST   /api/proposals       { title?, status?, form, content?, ... }
GET    /api/proposals/:id
PUT    /api/proposals/:id
DELETE /api/proposals/:id
POST   /api/proposals/:id/duplicate
```

All proposal routes require a valid session.

## Dashboard IA (target look)

```
┌──────────────────────────────────────────────────────────┐
│ KTM Quotation Studio          [Studio]  user · Log out   │
├────────────┬─────────────────────────────────────────────┤
│ Home       │  Good morning                               │
│ Proposals  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐               │
│ Customers* │  │Draft│ │Sent│ │Won │ │₹   │  KPI cards   │
│ Activity*  │  └────┘ └────┘ └────┘ └────┘               │
│ Settings*  │  Recent proposals table                     │
│            │  [New proposal] [Open studio]               │
└────────────┴─────────────────────────────────────────────┘
* Customers / Activity / Settings deepen in later phases.
```

Visual language matches the studio: navy `#1C2B3F`, orange `#F2811D`, cream, Inter/Poppins.

## Quotation builder changes (minimal)

- Header link: **Dashboard**
- When logged in: cloud chip + **Save to Cloud**
- No change to A4 pages, finance engine, BESS, PDF layout, or brochure design
- localStorage path unchanged for offline use and existing tests

## Run locally

```bash
node platform/local-server/server.js
# → http://0.0.0.0:8787/
```

Open `/dashboard.html` to register; open `/quotation.html` for the builder.

# Platform Phase B — Secure customer portal & frozen versions

_Status: implemented on the local platform API (same contract as future Cloudflare Worker)._

## What customers receive

A **secure link** of the form:

```text
https://<host>/portal.html?t=<high-entropy-token>
```

That page is a **read-only** proposal viewer:

- Same A4 pages, charts, and finance figures as the published snapshot
- Optional savings explorer and engineering request (WhatsApp hand-off)
- PDF download from the frozen data (client-side export)
- **No** control panel, editor, equipment library, or access to other customers

Authorization is enforced by the **API**, not by hiding buttons.

## What staff do

1. Save the proposal to the cloud (Phase A).
2. Open **Dashboard → Publish & links**.
3. **Publish version & create link** — freezes a JSON snapshot and issues one token.
4. Copy the link (shown once). Share via WhatsApp/email manually (Phase C will add providers).
5. Revoke the link at any time. Draft edits after publish **do not** change the portal.

## Security model

| Control | Behaviour |
| --- | --- |
| Token | 32 random bytes, `base64url`. Database stores **SHA-256 hash only**. |
| Compare | Lookup by hash; raw token never logged or listed after create. |
| Expiry | Default 30 days (configurable 1–365 on publish). |
| Revoke | `revoked_at` set; portal returns 404. |
| Snapshot | Immutable `proposal_versions` row + `snapshot_sha256`. |
| Isolation | Portal routes need **no staff cookie**. Staff routes need session + `owner_id`. |
| Bundle | `portal.html` does not load `control-panel.js` or `editor.js`. |
| Prefetch | Known bots / prefetch headers → `suspected_prefetch` (not counted as a human open). |
| Privacy | Short notice on the portal; open events are follow-up aids, not legal proof of reading. |

## API (additions)

```text
POST /api/proposals/:id/publish     (staff) → version + one-time raw token
GET  /api/proposals/:id/versions    (staff)
GET  /api/proposals/:id/links       (staff) — no raw tokens
POST /api/proposals/:id/links       (staff) — extra link to latest/selected version
POST /api/links/:id/revoke          (staff)
GET  /api/proposals/:id/events      (staff)

GET  /api/portal/proposal?t=…      (public token)
POST /api/portal/event              (public token) — pdf_download_requested, survey_requested, …
```

## PDF storage note

Phase B freezes the **data snapshot** and records `snapshot_sha256`.  
Client-side PDF export still runs in the browser from that snapshot.  

**R2 object storage** for a byte-identical server-held PDF (`pdf_sha256` / `pdf_path`) is the next increment when Cloudflare R2 is wired — schema columns are already reserved.

## English UI

All new customer-facing and staff dashboard copy is professional English.

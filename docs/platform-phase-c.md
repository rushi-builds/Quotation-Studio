# Platform Phase C — Send centre (manual, honest)

_Status: implemented on the local platform API._

## Goal

Staff can prepare a professional customer message that includes a **secure portal link**, open WhatsApp or the mail app, and keep a clear history — **without inventing delivery**.

## Channels (now)

| Channel | What happens | Recorded state |
| --- | --- | --- |
| WhatsApp (manual) | Opens `wa.me` with the message | `share_clicked` |
| Email (manual) | Opens `mailto:` with subject/body | `share_clicked` |
| Copy link only | Staff copies message / URL | `share_clicked` |
| Other / offline | Handed offline (print, meeting) | `share_clicked` |

## States (honest machine)

```
draft → share_clicked → (future) submitted_to_provider → (future) delivered
                      ↘ failed | cancelled
```

**Rules**

- Manual channels **cannot** be set to `delivered` or `submitted_to_provider`.
- API returns `400 DELIVERY_NOT_AVAILABLE` if staff try.
- `deliveryIsVerified` is always `false` for manual sends.
- UI labels say **“Share opened (not delivery-confirmed)”**, never “Delivered”.

## Flow

1. Select proposal in **Send centre**.
2. Choose channel + recipient.
3. **Publish link & prepare send**  
   - Freezes a new version (or uses latest if already published when `publishFirst` is false).  
   - Issues a new customer token.  
   - Builds message with absolute portal URL.  
   - Stores a `sends` row.
4. **Open WhatsApp / Open email app** or **Copy message**.
5. Optional: mark **Cancelled** if the attempt was abandoned.

## API

```text
GET  /api/proposals/:id/send-preview
GET  /api/proposals/:id/sends
POST /api/proposals/:id/sends
GET  /api/sends
POST /api/sends/:id/state
```

## Not in Phase C

- Meta WhatsApp Business API / BSP webhooks
- Transactional email providers (Resend, SES, …)
- Provider message IDs and true `delivered` events

Those require account setup, costs, and webhook verification before enabling.
When added, `provider` will leave `manual` and only then may `delivered` be set from a verified webhook.

# Approved identity and customer engineering flow

## Brand source

`assets/images/ktm-cover-logo.png` is a **304 × 180 exact pixel crop at (62, 62)**
from the supplied 1060 × 1484 cover. The navy background is retained so its white
lettering stays legible on white page headers. It is not an AI recreation or a
replacement font. `qa/build-cover-logo.py` reproduces it with ImageMagick.

The same asset is used in all page headers, the closing page, the editor header,
customer header and generated PDFs. The old independent logo-upload control was
removed to prevent split branding. Both approved full-cover assets and the live
cover fields remain unchanged.

## When to request Arka/PVsyst

The proposal is an initial estimate, not proof that a site simulation has already
been performed. A customer can request engineering **after reviewing the proposal
and indicating interest**, without first accepting an installation order.

The one customer hub after the proposal offers:

- Decision stage: reviewing, interested, or ready to discuss final scope.
- Service selection: site survey/feasibility, missing Arka layout, missing PVsyst report.
- Site locality and optional preferred call/visit window.
- Document checklist: electricity bill, roof photos/dimensions, site access details.
- Prepared message preview, WhatsApp link, and copy/manual-copy fallback.

The team confirms the actual inputs, survey feasibility, engineering scope, fees
(if any), and delivery schedule before preparing the deliverables. No automatic
simulation, booking, dispatch, payment or accepted-order status is implied.

### Guards

- Reviewing stage cannot prepare a request, even if submit is invoked directly.
- Blank site, no selected service and changed proposals are rejected.
- Provided report URLs are validated centrally for both technical references and
  the customer hub. No `javascript:`, `data:` or embedded-credential links.
- Existing reports appear as links, not duplicate request choices.
- Editing details invalidates the old prepared message/link.
- Invalid contact: no invented phone number or WhatsApp action; copy remains usable.
- Clipboard failures explain manual copy instead of claiming success.
- Request preparation does not modify proposal status or persist a false sent event.
- Expired quotations are flagged in the message for refresh before engineering.
- Local acknowledgement remains optional and distinct from an engineering request.

## Non-repetition policy

| Topic | Main home / change |
| --- | --- |
| Full-cover design and live personalisation | Cover remains intact. |
| Decision numbers | Summary tiles/KPIs; redundant five-number journey strip removed. |
| Company statistics | About page; three repeated default statistics removed from Why KTM. |
| Bill impact | Why Solar; repeated generation/savings/lifetime strips removed. |
| Inclusion overview | Summary; identical second inclusion grid removed from Proposed Solution. |
| Full equipment ratings and paper report references | Technical Specification. |
| Contractual scope and exclusions | EPC Scope; solution points to it instead of repeating the list. |
| Savings workings / investment amounts | Their respective detail pages. |
| Contact and next steps | Closing; repeated phone CTA and savings pressure strip removed. |
| Online requests / supplied report actions | One end-of-proposal customer hub. |
| Paper acceptance | Closing page in builder/print/PDF; not repeated next to the online acknowledgement. |

Branding, proposal reference/page numbers, and abbreviated cover/summary figures
intentionally remain for identification and overview. This is not a blanket removal
of financial figures wherever a detailed calculation legitimately needs them.
Custom-edited content is preserved: only exact legacy default copy is upgraded in
saved/imported proposals. Custom copy can still contain repetitions chosen by its
author.

## Print and export

Online controls never enter the proposal PDF. On the customer screen, report
references and the paper signature are hidden in the document pages so those
interactions are not repeated above the hub. Browser print restores the paper
content; html2canvas does the same in its export clone using `qs-pdf-capture`.
The live customer screen itself is not toggled during PDF export.

## Verification (21 September 2026)

- Unit/DOM/finance suites: **332 passed**, 0 failed.
- New branding/engineering regression: **42 passed**, including exact pixel crop,
  all-page logos, gated requests, no status mutation, one visible report link,
  clipboard fallback, mobile fit, print and PDF-clone content.
- Audit browser regression: **48 passed**.
- Technical layout: **21 passed**.
- Existing live-cover regression passed.
- Full browser suite passed; actual 16- and 17-page PDFs downloaded successfully,
  with no runtime errors.
- Original and editable cover SHA-256 hashes match the prior approved assets.

Run `npm --prefix qa test` and
`QA_BASE=http://127.0.0.1:8080 npm --prefix qa run test:browser` with Chromium's
shared libraries available. The new pixel-crop check also requires ImageMagick.
Screenshots/PDFs remain in ignored `qa/shots/`.

## Still not a hosted customer backend

`share.html?p=...` reads browser-local proposal storage. The new workflow does not
make an ID-only link portable between devices. A real customer portal, verified
e-sign, tracked requests and automated delivery need authenticated shared storage
and a backend. Until then, use the existing PDF/proposal-file workflow and explicit
WhatsApp communication; do not advertise those capabilities as complete.

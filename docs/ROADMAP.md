# KTM Solar Digital Proposal & Sales Platform — Roadmap

This document captures the master product vision for Quotation Studio and the
phased plan to get there. The guiding rule:

> **No guessing. No arbitrary assumptions. No fabricated engineering values.**
> If data is missing, the UI shows `DATA REQUIRED` / `NOT AVAILABLE`, or an
> explicitly labelled estimate with its assumption exposed.

The proposal is the bridge between engineering and the customer. Everything
else attaches to it.

---

## Target data flow (one source of truth)

```
CUSTOMER → CUSTOMER DATABASE → SITE DATA
        → ENGINEERING (module/inverter/resource DB + design rules)
        → CALCULATIONS (generation · BOM · financial)
        → PROPOSAL DATA (interactive web proposal + PDF)
        → CUSTOMER
```

PDF, web proposal, Excel and any future AI layer must all read from the same
validated proposal data and calculation engine — never compute their own.

---

## Current status (updated each phase)

| Phase | Scope | Status |
|---|---|---|
| 0 — Audit | Review repo, data flow, calculations | ✅ Done (baseline preserved; 107 tests added before any rewrite) |
| 1 — Foundation | Architecture, design system, proposal/customer/site/equipment models | ✅ **Done** — `model.js` (Proposal object, statuses, immutable versions), `equipment.js` (catalog), multi-proposal manager, legacy migration |
| 2 — Premium proposal | 15-page A4 system, charts, PDF/print, responsiveness, Advanced Edit | ✅ Done (ship-quality today) |
| 3 — Visual intelligence | Site map, PV layout visualisation, property concept view | ⬜ Next |
| 4 — KTM credibility | Project gallery, certifications, testimonials (real assets only) | ◐ Partial (portfolio page exists; needs real asset pipeline) |
| 5 — Sales system | Tracking, sharing links, WhatsApp/QR, comparison of options | ◐ Partial (statuses/versions done; sharing/tracking pending) |
| 6 — Engineering integration | Stringing, SLD, cable sizing, detailed engineering docs | ⬜ |
| 7 — Enterprise platform | CRM, projects, notifications, roles, analytics | ◐ **Phases A–E on local platform** — auth, cloud drafts, secure portal + frozen versions, send centre, **activity/notifications/follow-ups**, **reports + roles**. See `docs/platform-phase-*.md`. Still later: Cloudflare production deploy, R2 PDF bytes, provider delivery webhooks, multi-tenant org CRM. |

---

## Data model (implemented in Phase 1)

```
Proposal {
  id, ref, version, status, prevId?        — identity & history
  createdAt, updatedAt, sentAt?, acceptedAt?
  form          — every builder input (customer, site, system, financial…)
  content       — proposal-specific text overrides
  projectImages — photo overrides
}

Status workflow:
draft → internal_review → ready → sent → viewed → negotiation
      → accepted | rejected | expired | archived
```

Rules:
- **Versions are immutable.** "New version" clones + bumps + links back
  (`prevId`); the original is never overwritten. Duplicates start a new history.
- **Storage is API-ready.** Phase 1 uses localStorage
  (`qstudio.proposals.index`, `qstudio.proposal.<id>`, `qstudio.activeId`) but
  every operation goes through the `Proposals` store — swapping in a backend
  means reimplementing that one module.
- **Equipment catalog is company-level master data** (modules, inverters,
  structures, cables). Datasheet-only fields stay blank until entered;
  selecting a catalog entry syncs rating/dimensions/technology into the design.

---

## Hard rules carried into every future phase

1. All customer-facing values trace to entered data or documented calculations.
2. Customer-facing and internal-engineering documents stay strictly separated
   (SLD, stringing, cable sizing are internal; simple visuals are customer-facing).
3. Concept imagery (PV layouts, roof visualisations) is always labelled
   "concept — subject to engineering/site verification". Never presented as an
   engineered design.
4. Site coordinates come from validated site data — never invented.
5. 360°/video features only ship with real KTM assets.
6. Analytics on customer proposal viewing must be privacy-conscious with
   appropriate notice; legally significant e-signatures need a proper
   e-signature provider, not a button click.
7. Professional English everywhere; mobile is not an afterthought.

---

## Done — Phase 3+5 blend (options & share kit)

- **System options (Good / Better / Best)** — save named design snapshots
  (capacity, equipment, rate, assumptions), mark one *Recommended*, apply or
  delete; a conditional **Options page** (page 3) appears with a side-by-side
  comparison of 10 metrics, best-in-row highlighting, "at a glance" winner
  chips and page numbering that adapts (15 ↔ 16 pages) across preview, PDF
  and the share view. Options live on the proposal blob, survive versioning,
  duplication, export/import and cross-boot restore.
- **Share kit** — optional `shareUrl` on a proposal renders a scannable QR
  ("Scan to view your proposal") on the cover; a WhatsApp button opens
  `wa.me` with a pre-filled, customer-specific message; `share.html?p=<id>`
  is a read-only customer view driven by the same renderers and finance
  engine, with its own top bar, customer banner and PDF download.

---

## Done — financing & EMI page (optional, data-driven)

- Enter **loan amount + interest % + tenure (years)** in the Payment terms
  fieldset and a dedicated **Financing & EMI page** appears (15 ↔ 16 ↔ 17
  pages across preview, PDF and share view; nav, numbering and export loop
  all adapt). Leave the fields blank for a cash-purchase proposal.
- EMI from the standard reducing-balance formula (`P·r/(1−(1+r)^−n)`) inside
  `Finance.compute` — same engine as every other figure; month-wise savings
  across the tenure derived from the proposal's own annual savings series.
- Page shows a loan recap line, 4 KPI cards (EMI, total interest, monthly
  saving Y1, net monthly outgo Y1), a **savings-vs-EMI step chart** with the
  EMI line and a "month N" crossover marker, a cash-flow callout (month-1
  positive or the crossover month), and an explicit formula/assumption note.
- All figures traceable to user-entered loan terms + the proposal's own
  assumptions; note states bank fees/eligibility are external. Financing
  persists on the proposal blob and survives versioning/duplication/restore.

## Next up (remaining, in priority order)

1. **Proposal status timeline** — created → sent → viewed → accepted trail on
   the manager card (statuses already exist; add timestamps UI).
3. **Site model formalisation** — coordinates/orientation/shading fields with
   `DATA REQUIRED` states, feeding the generation factor instead of a bare
   assumption when available.

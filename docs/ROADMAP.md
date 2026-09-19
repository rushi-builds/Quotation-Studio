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
| 7 — Enterprise platform | CRM, projects, notifications, roles, analytics | ⬜ |

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

## Next up (Phase 3 + 5 blend, in priority order)

1. **System options / Good-Better-Best** — multiple designs per proposal with
   a comparison table (builds directly on `Finance.compute` being pure).
2. **Shareable proposal view** — a read-only customer render
   (`?p=<id>`) with the same sections as the PDF, plus WhatsApp message +
   QR generation on the cover.
3. **Proposal status timeline** — created → sent → viewed → accepted trail on
   the manager card (statuses already exist; add timestamps UI).
4. **EMI/financing section** — only when interest rate/tenure are entered.
5. **Site model formalisation** — coordinates/orientation/shading fields with
   `DATA REQUIRED` states, feeding the generation factor instead of a bare
   assumption when available.

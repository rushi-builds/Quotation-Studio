# Final download-menu and summary refinements

22 September 2026. The owner explicitly authorized merging PR #8 after these
fixes and verification. GitHub is the source of truth for the eventual merge and
deployment state: https://github.com/rushi-builds/Quotation-Studio/pull/8.

## Download menu

Both the builder and Customer View start with exactly two choices:

- **Detailed Proposal — all applicable pages**
- **Power Proposal — 2-page summary**

BESS enabled adds **BESS Report · 2 pages**. An enabled additional system adds
its named **Report · 2 pages** and **Power Proposal · 1 page**. For example,
selecting EV Charging Integration offers its two downloads, not a list of all
unselected system types. System names also appear in the section's download
buttons, download action, standalone PDF header, metadata and sanitized filename.
Custom names are inserted as plain text, never HTML.

Unavailable options are removed from the native select, not merely disabled or
hidden with browser-dependent option styling. Turning off the currently selected
report returns the menu to Detailed Proposal. Changing another system preserves
a still-valid selection. Enabling a standalone report without including it in the
main proposal continues to work. Direct API attempts to export a disabled report
are still refused.

The base HTML also contains only the two solar formats, so unavailable choices do
not flash before initialization. No new form fields, catalogue integration,
financial assumptions or saved-proposal schema changes are introduced.

## Executive Summary finish

`assets/images/summary-solar-landscape.svg` is a new, local vector illustration
of solar rooftops in a soft green landscape. It sits below the existing figures,
equipment inclusions and calculation trace note. The caption explicitly says
**Concept illustration · not a site layout**. It is not a photograph of the
customer's property, a proposed module layout, a generation forecast or new
engineering evidence.

The illustration fills the previously unused lower space. Its flexible height
yields to longer customer/site/equipment copy; existing figures remain readable
and the footer stays clear. It is shared by the live preview, Customer View,
print and detailed PDF. It does not alter the separate two-page Power Proposal.
The actual PDF raster was visually inspected, not only the HTML view.

## Verification

Both complete commands exited 0 on the final code before publishing:

- `npm test --prefix qa`: **474 unit/integration checks passed**.
- `npm run test:browser --prefix qa`: **671 numbered browser checks passed**,
  plus the existing unnumbered live-cover/general-browser export tests.
- The supplement suite now has **94 checks**; the A4 spacing suite has **28**.
  These include actual standalone PDFs and the 17/21-page combined stress cases.
- No browser runtime errors were reported by the checked workflows.

Browser tests used the locally served app, bundled Chromium and
`QA_BASE=http://127.0.0.1:8080`; Vercel deployment status is checked separately.

Focused coverage includes default/BESS-only/system-only/combined format lists,
all five system names, custom-name escaping, long mobile labels, selected-format
fallback, persistence, Customer View, actual named standalone PDF files, main and
Power downloads, summary SVG raster ink, commercial/long-text/mobile/print A4
geometry, and unchanged solar calculations.

Protected artwork remains unchanged:

- Cover SHA-256: `0d8e226e919f215b2ecd4ac17c57278da6841922322455c0ccb49c11a7876961`
- Tracking image Git blob: `b876c635488fccbf11217838e7baf6899e2e1557`
- Solar Finance, approved cover rendering, original small-house engineering
  diagram and portfolio data are unchanged by this patch.

## Existing boundaries

Excel catalogue integration remains deferred. Engineering/backup compatibility,
installed prices and warranty terms still require project review. Browser-local
proposal storage and device-dependent speech remain unchanged. Preview and live
origins have separate browser storage; use Save/Open proposal file to transfer
proposals when needed.

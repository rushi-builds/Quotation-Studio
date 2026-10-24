# Builder section colours and complete setting search

Owner request, 24 October 2026: make Equipment & design and the rest of the
quotation editor easier to scan, and make even small settings discoverable.

## Visual hierarchy

All thirteen builder section headers use quiet, labelled semantic colours:
customer/links/reports blue, equipment/additional systems mint, pricing/payment/
costs sand, comparisons lavender, branding/photos rose and technical/terms slate.
The original disclosure order, Essentials/All settings and natural scrolling stay.

Equipment & design has five labelled light-colour groups, using the original
controls (not copies): Modules (mint), Inverter (blue), Mounting & roof (sand),
Cables & protection (lavender), Generation assumption (slate). Module technology
and inverter rating, previously mixed in one row, now live with their own group.
Generation stays 1460; no default, calculation or saved value is changed.

Only `.form-panel` is styled. Customer-facing A4/PDF markup, navy system heroes,
full photos and rounded corners are unchanged.

## Search

`assets/js/control-panel.js` now indexes:

- Field labels, section/subgroup breadcrumbs, static hints, placeholders, IDs.
- Current dropdown choices, including options added after startup.
- Conditional/disabled settings, rather than silently omitting them.
- Nested Advanced Edit text settings (including item headings), advanced engineering,
  photo upload controls and ID-less company-library row fields.
- Builder action buttons, links, section disclosures and footer/backup tools.
- Small aliases (price/rate, wiring/cable, additional systems, QR code), case and
  punctuation normalization, and currency/percent symbol searches.

Exact field labels rank ahead of option/hint/section matches. All matches remain
reachable in the scrollable result list; the former eight-result cut-off is gone.
Arrow keys, Enter, Escape, native Tab and visible focus outlines are supported.

Result activation **locates** a control; it does not run an action, open a file
picker, select a dropdown option, enable a system, alter a price, send or export.
Folded ancestor disclosures are opened. Conditional settings lead to their setup
control/section and a nearby explanation, without forcing hidden controls visible.
Internal hidden state and superseded system pickers are not exposed as settings.
Search is editor-local, not an account-wide customer-record search. Input values,
proposal-selector names and filenames are not indexed.

## Verification

- `qa/editor-discovery.test.cjs`: all 210 ID-bearing editor controls discoverable,
  nested text settings, option brands/live option refresh, symbols/aliases,
  keyboard, mobile width, grouping, unique control IDs and zero browser errors.
- Search navigation leaves the collected form, Finance output and **all proposal
  page HTML** unchanged. Hidden BESS/custom controls remain inactive. Reset and
  upload discovery do not run those actions.
- Engineering-panel regression passes (desktop/mobile, keyboard, unchanged PDF).
- System-input-hierarchy regression passes, including actual 2/2/1-page PDFs.
- Finance 82; packaging 35; scope/negative controls 43; role/build/frozen parity 313.
- Existing `equipment-entry.test.js`: 38 checks pass, then its reload assertion at
  line 126 fails. The identical failure is independently reproduced when serving
  the unchanged HEAD `c4d842408e0adca21c51151fa3b27ad92c069193` control-panel JS/CSS.
  This pre-existing custom-equipment reload issue is not changed by this UI task.

Ignored screenshots: `qa/shots/editor-discovery/`. Tests use an isolated static
server with no live backend. No main merge, provider/config, D1 or live sync change.

Scope/parity base: `1ae392d5e875fc6888e9c7e7d0b67e2af4db9219`.

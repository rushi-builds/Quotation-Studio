# Connected control-panel workspace

## Scope

This is a builder-side redesign, not a proposal redesign. `control-panel.css` is
loaded only by `quotation.html`. The cover, system diagram, portfolio, customer
pages, both PDF formats and Finance engine keep their approved content and layout.

## New-proposal defaults

Customer name, site address and Prepared by start empty, with muted input hints:
“Enter customer name”, “Enter site address” and “Enter preparer name”. Prepared by
remains optional and accessible in the control panel. The cover shows neutral
“Customer Name” / “Site Address” labels until details are supplied; these are not
stored as real customer data. No person's name is prefilled. New and Reset use
these blank defaults; existing saved proposals retain their entered details.

## Daily workflow

1. Choose the current proposal. Expand **Manage proposals & versions** for New,
   Duplicate, New version, status, timeline, delete and WhatsApp sharing.
2. Use **Essentials** for customer/system, equipment, pricing and payment inputs.
   **All settings** exposes the less frequent configuration sections.
3. Open a section, or use **Find a setting** to locate a field. Search covers field
   labels and parent sections, including nested Advanced Edit text. A result opens
   its ancestors, enables All settings when needed and focuses the actual input.
4. Read the live summary: current capacity, net investment (after any applicable
   subsidy), estimated year-one generation and applicable detailed-proposal pages.
   These are read-only values from the existing renderer/Finance engine.
5. Use **View related page** to navigate deliberately. Typing does not automatically
   jump the preview. If an optional related page is absent, the summary is shown.
6. Open **Customer view** or choose a PDF format and download. **Backup & reset**
   keeps infrequent/destructive actions apart from the primary download action.

Presets retain their existing confirmation and design-reset behaviour. Disclosure
state is not proposal data. Essentials/All settings is a browser UI preference.

## Synchronization and storage

The workspace moves existing controls rather than creating duplicate inputs.
Original IDs and event handlers remain intact. Section summaries and metrics listen
to `qs:rendered`. Advanced Edit callbacks are still rebound when proposals change;
search builds its results from the current editor, not a previous proposal's DOM.

Autosave reports **Saving…**, **Saved locally** or **Not saved**. It verifies that
the saved blob matches the current snapshot because the underlying store tolerates
quota failures. A failed save prevents switching proposals or opening a stale
Customer View; the selector remains on the active proposal. Export backup includes
current form values, content, project images and options even if local storage is
full. It is a portable JSON backup, not a cloud upload or public sharing link.

Input warnings are advisory, not certification: missing customer/positive capacity
or price, payment percentages that do not total 100%, and partially entered or
non-positive financing inputs. They link back to the relevant field. They do not
rewrite values, alter calculations or replace engineering/commercial review.

## Accessibility and responsive behaviour

- Native details/summary elements support keyboard opening/closing.
- Existing field labels are associated with inputs; nested text editors receive
  accessible labels without inventing new persisted input IDs.
- Search results are normal keyboard-focusable buttons. Escape clears the search.
- Save state and validation notices have status semantics; focus indicators remain
  visible. Upload/import labels also support Enter and Space.
- Desktop keeps an independent control-panel scroller and sticky PDF actions.
  Tablet/mobile stack the panel and preview without horizontal overflow.
- All new controls are absent from Customer View and excluded from print/PDF.

## Verification

`qa/control-panel.test.js` exercises the real browser workspace: original control
identity, default modes, live summary/cover/selector updates, search into collapsed
and advanced controls, native disclosures, validation, related-page navigation,
proposal duplication/switching, isolated text edits, reload, simulated storage
failure, export recovery, Customer View, print isolation and mobile fitting.

The existing regression suites still verify branding, engineering flows, A4 bounds,
QR/audio, tracking references, finance, customer scenarios and actual PDF exports.
Bulk-entry tests explicitly open the new disclosure groups before filling them.

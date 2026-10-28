# Quotation library polish

The staff dashboard's Quotations panel now gives the existing, permission-scoped
quotation list quick stage filters, multi-word search, sort controls and 20-row
pagination. Search covers the customer, reference, title, capacity, status and
version fields returned by the existing list endpoint. Missing capacity sorts
last and is displayed as unavailable; no inferred value is added.

The list keeps the existing status actions, editor handoff, sharing/version
controls and owner/team gates. This is a presentation-only change: no API,
backend, saved record, financial value or role/permission behavior was changed.
Search, sort, filters and page position are transient UI state and are not saved
to quotations. For narrow screens rows become readable cards with touch-sized
controls. No-match and empty-library states explain what the staff member can do
next; Escape clears the search and the clear action restores focus to it.

Verification: `LD_LIBRARY_PATH=/tmp/al2023/lib node qa/quotation-library.test.cjs`
(or `npm run test:quotation-library --prefix qa`) — 19 checks using one isolated
local test account and 47 synthetic in-memory list rows. The test confirms
search, combined terms, statuses, sorting, pagination, safe text rendering,
mobile layout, and the existing selected-quotation handoff. It makes no
production API requests or quotation writes after creating the disposable test
account. The account's isolated local data directory is removed at test exit.

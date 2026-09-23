# Proposal management: what is fixed locally, and what needs a service

_Status: 23 September 2026. This note covers the "save, resume, reset and proposal
management" review. It separates what Quotation Studio now does **inside one
browser**, what it deliberately does **not claim**, and what genuinely needs a
backend or an external service before it can be promised to a customer._

## 1. Fixed in the studio (no server involved)

| Area | Behaviour now | Where |
| --- | --- | --- |
| Save | Autosave plus an explicit **Save now**, `Ctrl`/`Cmd`+`S` (the browser's own Save Page dialog is suppressed), saving form values, brochure text edits, uploaded page images, comparison options and optional-system settings. Confirmation reads **"Saved in this browser · HH:MM"** — never "synced" or "cloud". | `assets/js/app.js` |
| Save failure | The indicator goes to **Not saved**, the message tells the user the work is still open, and **Export backup** still writes what is on screen (it exports live values, not the last saved blob). | `assets/js/app.js`, `assets/js/state.js` |
| Resume | Reopening the same site in the same browser returns to the last proposal, its Essentials/All mode, the expanded control-panel sections, the last preview page and reading positions, and the chosen PDF format when that report is still available. Preferences are per proposal and kept separately from proposal data. | `assets/js/workspace-prefs.js` |
| Damaged preferences | A corrupt or missing preference record is ignored and rebuilt; proposal data is never touched. | `assets/js/workspace-prefs.js` |
| No jumping | Position is restored once, and only if the user has not already scrolled or typed in the tab. | `assets/js/app.js` |
| Pending edits | Pending edits are flushed on `pagehide` and when the tab is hidden. | `assets/js/app.js` |
| Reset | Confirmation required. Clears customer/preparer inputs to template defaults, edited brochure text, uploaded images, saved comparison options and the pending comparison name, BESS and additional-system selections/specs/scope/prices, returns status and any hand-recorded acknowledgement to **Draft**, clears the file pickers and the remembered reading position. It never deletes other proposals, earlier versions or the shared equipment library, and keeps the approved template artwork and defaults. If the reset cannot be written to storage, the content on screen is put back. | `assets/js/app.js` |
| Pending uploads | A reset or an import invalidates file reads that were already in flight, so a slow upload cannot repopulate a cleared proposal. | `assets/js/app.js` |
| Backup clarity | Export states that it writes **one proposal, not the whole workspace**, and that the file contains the current on-screen edits; import always creates a **new draft**, never overwrites, names the failure when a file is invalid or storage is full, and lets the same file be chosen twice. | `assets/js/state.js`, `assets/js/app.js` |
| Proposal numbers | New proposals and duplicates receive the next number from a local sequence (`KTM/YYYY/Solar/NNN`); numbers already used in the workspace are never reissued. New versions keep the number and move the version. | `assets/js/model.js` |
| Company defaults | Company/branding details can be stored as reusable defaults for new proposals in this browser. | `assets/js/app.js` |
| Status honesty | The status list says **"Viewed (marked manually)"**, the proposal meta line says statuses are set manually in this browser, and the milestone strip is titled as hand-recorded rather than verified customer activity. | `assets/js/model.js`, `assets/js/app.js` |
| Two tabs | Each tab keeps its own active proposal, so switching proposals in one tab can no longer make another tab save into the wrong proposal. A tab that would overwrite a newer revision written elsewhere refuses to write, reports the conflict, and keeps the user's unsaved work on screen so it can still be exported. | `assets/js/model.js`, `assets/js/app.js` |

## 2. Limits the studio states plainly

- **Everything above lives in this browser.** Clearing site data, using a
  private window, a different browser or a different device starts empty. The
  studio does not promise durability against a crash, a cleared profile or a
  device loss; the backup file is the portable copy.
- **Proposal numbers are unique inside one browser's workspace, not globally.**
  Two people quoting at the same time can produce the same number.
- **Company defaults are per browser**, not per company account.
- **A backup file carries one proposal.** There is no whole-workspace archive
  yet.

## 3. Needs a backend or an external service (not built, not silently added)

These cannot be delivered honestly by a static page in a browser. Each one is a
deliberate gap, not an oversight:

1. **Cloud saving and cross-device resume.** Requires accounts, hosted storage
   and conflict handling on the server. Until then the studio claims local
   storage only.
2. **Secure customer links.** A share link that a customer cannot forge or
   forward indefinitely needs a hosted document with access control, expiry and
   revocation. The current shared link and local file are conveniences, not
   access control.
3. **Genuine open/activity tracking.** Verified "the customer opened it",
   time-on-page and which pages were read require the customer's viewer to
   report back to a server. A locally marked status stays manual and is labelled
   as such.
4. **Globally unique customer-facing numbers.** Needs a central counter (or a
   server-issued prefix per workspace).
5. **Workspace-wide backup/restore.** Needs a single archive format plus a
   restore path that can rebuild every proposal and version; a server makes this
   a one-click operation rather than a manual file per proposal.
6. **Reminders and verified approvals.** Follow-up scheduling needs a service
   that can send mail/WhatsApp on a schedule; a verified approval needs an
   authenticated customer action with a stored audit trail (signer identity,
   timestamp, document hash). The current typed acknowledgement is a local
   record of a conversation, not proof of consent.

Any of these must be introduced as an explicit, named service with the user's
consent; none is switched on silently, and nothing here implies a paid service
is already in use.

## 4. Known limitation of the local conflict guard

The two-tab guard compares the revision this tab last wrote or accepted with the
revision in storage. If a tab never re-reads a proposal after another tab wrote
to it, its first write attempt is refused and reported — the user keeps their
work and is told to export it and reload. This is safer than silent overwriting,
but it is not a merge: the studio never tries to combine two divergent copies.

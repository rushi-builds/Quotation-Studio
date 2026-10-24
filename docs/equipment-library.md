# Equipment library persistence repair

Use **Advanced settings → Equipment library** to manage reusable module,
inverter, structure and cable makes. The built-in Excel catalogue remains
read-only here. Your added rows are stored in this browser's existing
`qstudio.equipment` localStorage key, shared by local proposals—not automatically
synced to another browser, device or company account.

## Reproduced fault

The original manager changed its user-row arrays, then called `save()`, which
reconstructed those arrays from a previously cached merged catalogue. A warm
cache discarded newly added rows and could resurrect deleted rows. A regression
test failed immediately: clicking Add module produced zero rows instead of one.

The manager now persists its authoritative user rows directly and invalidates
the merged cache. It does not rebuild or reorder editable user arrays from the
merged built-in/cloud/user view. Repeated additions, edits and deletes therefore
survive refresh and reload, including explicit user overrides.

Duplicate overlay keys now replace the correct merged entry instead of writing
to a separate extras index; later layers still win. Shipped catalogue objects
are not mutated. The existing public `cat().push(...)`/`save()` integration is
retained; save now reports success/failure as a boolean.

## UI

- New rows focus/select their name for immediate replacement.
- Original inputs retain their data fields; static accessible labels are added.
- Changes autosave with **Saved in this browser** feedback.
- **Save library** can explicitly retry a failed write. Full/blocked storage
  shows **Not saved**, never a false success. Keep the tab open to preserve
  unsaved in-memory changes until storage is available.
- Choose the saved make under **Equipment & design** to apply its provided
  rating/dimensions through the existing selection path. Editing the library
  itself does not retroactively rewrite a quotation's inputs.

No calculation equations, Finance/genFactor, cloud bridge, authority/provider,
deploy configuration or built-in catalogue source is changed.

## Verification

`cd qa && npm run test:equipment-library` (browser test uses isolated QA_BASE):

- Unit: warm-cache CRUD for all four categories; reload; manual overrides/order;
  built-in immutability; duplicate overlay precedence; legacy public save API;
  blocked storage and explicit retry.
- Browser: actual library controls; original dropdown application of custom
  makes/ratings; no passive form/Finance mutations; reload and proposal switch;
  390/360px layout; Customer View and an actual selected-equipment PDF.
- Existing catalogue sync 27, integration 117, equipment calculation 9, Finance
  82, package 39, scope 43, parity 315, editor search and section-group checks pass.

**Known independent legacy failure:** `qa/equipment-entry.test.js` fails at line
126 (custom proposal text/specification parity after reload). The same failure
was reproduced serving the original `equipment.js` from commit `6237039`, with
all other files unchanged. Its preceding selection/custom-input checks pass.
It is not hidden by changing that assertion and is not claimed fixed by this
library-cache repair. The new library-specific persistence/reload checks pass.

Generated screenshots/PDFs stay in ignored `qa/shots/equipment-library/`.

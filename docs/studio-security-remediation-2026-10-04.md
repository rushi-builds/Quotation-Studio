# Studio authentication remediation — 4 October 2026

## Implemented policy

- Public registration always creates a **viewer**. Typed Owner, Sales, custom titles, capitalization and extra authorization fields cannot grant permissions. The supplied job title is retained as metadata, separate from authorization.
- Only an existing authenticated owner can promote an account using the existing Team controls. No automatic first-signup owner exception or new public bootstrap endpoint was added.
- Existing users, roles, password hashes, sessions and quotations are not migrated or demoted. Existing owners can still administer access. Fresh installations without an owner need trusted operator provisioning, not public signup; do not deploy against a fresh database expecting signup to bootstrap an administrator.
- Both public forgot-password and reset-password endpoints fail closed with HTTP 403 and `RECOVERY_UNAVAILABLE`. Responses do not depend on account existence and do not look up accounts, issue codes or mutate passwords.
- Previously disclosed unexpired codes are unusable because public reset is disabled, not merely hidden in the interface.
- Verified email recovery is **not implemented**. There is no new administrator reset endpoint either. A company administrator must arrange identity-verified assistance through trusted operational procedures. The app does not claim it sent email.
- Signed-in Settings → Security password changes still require the current password and remain functional.
- Current sign-in recovery button and `#forgotPassword` deep link show persistent guidance with a keyboard-accessible return button, instead of a disappearing reset-code toast. Signup explains read-only access.

Changes apply to the local backend and both Cloudflare entry modules. No database/schema change is needed.

## Validation

`LD_LIBRARY_PATH=/tmp/al2023/lib npm --prefix qa run test:security`

- `studio-security.test.cjs`: real isolated HTTP server plus Chromium. Tests first signup cannot bootstrap Owner; existing owner fixture retains its role/session; unauthenticated recovery and an injected valid legacy reset code are refused; known/unknown accounts receive identical responses; old password remains valid after reset attempts; legitimate current-password change works; new user cannot list Team/change roles/create proposals/forge profile authorization; existing owner can explicitly grant Sales access; quotation remains accessible; mobile recovery guidance and deep link work without secret-issuing requests.
- `studio-security-worker.test.mjs`: exercises both Worker implementations with a labelled D1 contract adapter. Recovery executes no database statements. Owner/Sales/custom public signups persist Viewer. Team administration is denied to those accounts.
- `platform-api.test.js`: 114 assertions pass. Existing-owner fixture is provisioned directly in the isolated test DB, not via any production signup bypass. Insecure prior recovery/signup expectations were replaced with denial checks. Test cleanup no longer deletes a non-test platform data directory.
- Full core suite passes: 991 assertions (two fewer due to replacing obsolete recovery-success assertions), including the existing quotation/calculation suites.

The diagnostic in the initial audit described vulnerabilities, not desired behaviour. Use the new acceptance suite above after remediation. Historical browser tests that create Owner via public signup will need explicit trusted test fixtures; do not restore insecure signup to satisfy them.

## Operational follow-up / limits

This closes the identified public recovery and self-assigned privilege paths; it is not an assertion that all authentication or Studio bugs are eliminated. Audit remaining role/session/rate-limit/company-isolation behaviour separately.

Because existing accounts are intentionally preserved, review the current Team owner list for unexpected accounts using a trusted existing owner. This patch cannot determine whether earlier recovery codes were misused and does not claim that an intrusion occurred. Review sessions/passwords through authorized procedures if there is evidence of unauthorized access. Do not silently demote or bulk-delete accounts.

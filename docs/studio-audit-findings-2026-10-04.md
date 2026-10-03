# Studio audit: initial confirmed findings

Date: 4 October 2026
Status: discovery only — no production changes or deployment.

## Executive result

Three defects reproduced using temporary accounts and a disposable local database. Two are security-critical. Equivalent vulnerable authentication branches are present in the Cloudflare Worker source, but no exploit was attempted against the live deployment or real users. This is an initial triage, not a completed all-features audit.

### S-02 — Critical: password recovery does not prove account ownership

**Observed:** an unauthenticated forgot-password request returns a usable recovery code in its own response. With that code, the reset endpoint accepts a new password and issues a session. A subsequent login using the new password succeeds without mailbox access or knowledge of the old password.

**Impact:** account takeover when an account email is known. Returning different response fields for existing accounts also exposes account existence. A short expiry or one-time usage does not correct the missing ownership check.

**Evidence:** reproduced through actual local-server HTTP requests against an audit-created account. Corresponding source: `platform/local-server/server.js` forgot-password/reset-password branches; `platform/cloudflare/src/worker.js` and `index.js` contain matching response behaviour.

**Recommended direction, requiring approval:** never disclose reset secrets to an unauthenticated requester. Until verified email delivery exists, disable self-service reset or provide an authenticated administrator-assisted recovery process with appropriate identity checks. Preserve existing account access and data. Do not pretend email was sent.

### S-01 — Critical: public signup can grant administrative privileges

**Observed:** after one account already exists, a second public registration typing Owner receives administrative privileges. The new account can list the first account in Team and change its role. The test changed only an account it had created in the isolated database.

**Impact:** uncontrolled administrator creation, team information exposure and unauthorized role changes. The existing self-demotion safeguard does not stop a new owner from modifying someone else's role.

**Evidence:** real local-server registration, Team listing and role-change requests. Cloudflare source also maps free-text Owner directly to the privileged role and uses that permission for Team APIs without an invitation/approval boundary.

**Recommended direction, requiring approval:** separate the user's job-title text from authorization. New accounts must not grant themselves privileged roles; role changes require an existing authorized administrator. First-owner bootstrap and company ownership transfer need an explicit, safe policy. Existing owners must not be silently demoted or locked out.

### S-03 — High: password recovery cannot be completed from the current sign-in UI

**Observed:** the current `index.html` shows the recovery code in a toast but provides no reset-code/new-password submission form. Opening `index.html#forgotPassword` does not open a recovery-completion screen. The legacy login-auth script is not a substitute for wiring the currently served page.

**Impact:** a legitimate user can request recovery but cannot complete it using the current sign-in interface. This UI gap does not mitigate S-02: the backend reset API still works.

**Evidence:** real Chromium navigation and Forgot password click against the isolated server, with DOM assertions that no completion controls exist.

**Recommended direction:** repair the end-to-end recovery interface only after the secure recovery method is chosen.

## Reproduction and baseline results

New diagnostic: `qa/studio-discovery.test.cjs`.

- Starts its own loopback-only local server and temporary database.
- Creates its own disposable accounts and random test passwords.
- Prints only finding confirmations, not tokens, reset codes or credentials.
- Closes the browser/server and deletes its temporary database.
- Its assertions confirm observed vulnerabilities; they are intentionally **not** security acceptance tests. Replace/invert them when remediation is implemented.
- All three discoveries reproduced successfully.

Existing API baseline: 116 assertions passed. Some existing tests explicitly expect owner signup and local-display recovery, so their passing result is not evidence of secure authorization.

Assistant/action/knowledge unit baseline: 26 passed, 1 failed. The failure is generated knowledge-file drift (including the new engineering qualification field). The Cloudflare asset-sync build already regenerates this file, so this is confirmed local artifact drift, not proof that the deployed assistant has stale knowledge or gives wrong answers.

The broad dashboard browser test did not finish during this run and was stopped. No dashboard-wide pass is claimed. Downstream browser/provider suites in that sequential job were not reached. Live Gemini responses and paid-provider behaviour were not tested.

## Next steps

1. Approve the authentication/authorization remediation policy before backend changes.
2. Fix S-02 and S-01 first, with tests that reject unauthorized recovery and self-assigned administration.
3. Repair and test recovery completion, preserving legitimate access.
4. Continue the dashboard/navigation/search/task/settings/mobile/error-state audit and independently test customer-data isolation. No zero-bug claim is warranted.

No application source was changed during this discovery pass. Existing workspace changes were preserved. No production accounts, quotations or other data were modified.

## Remediation update

The findings above record the initial, pre-fix state. The approved authentication changes and acceptance-test results are documented in [Studio security remediation](studio-security-remediation-2026-10-04.md). The original discovery command now runs the secure acceptance checks rather than asserting that vulnerabilities remain exploitable.

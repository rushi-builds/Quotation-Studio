# Activate Google, Microsoft and Apple sign-in

## Current status — read this first

**Sign-in is email and password only** (owner decision, 2026-10-10). The Google, Phone and Microsoft buttons and the "or continue with" divider were removed from the sign-in screen, `OAUTH_GOOGLE_ENABLED` is `false`, and the `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` Worker secrets were deleted — only `GEMINI_API_KEY` remains. The provider code is intact but unreachable, so this document is now the **restoration procedure**: register the app again, add the two secrets, set the flag, and restore the buttons. Phone sign-in was never enabled (`PHONE_ENABLED` stays `false`) and its button was removed with the others.

The application integration is implemented. **Live provider sign-in is not activated merely by deploying this code.** Each provider requires a real app registration, valid credentials and an explicit enable flag. No provider credentials are currently supplied or registered; no real Google/Microsoft/Apple account login has been certified in this session.

Configured status means the required configuration is present, not that the provider has approved the app or that a live login has passed. Complete the live checklist below for each provider.

Never paste client secrets, private keys, passwords or recovery codes into chat or commit them to Git. Use the provider consoles and Cloudflare encrypted Secrets.

## One-time shared configuration

Open Cloudflare → the existing **studio** Worker → Settings → Variables and Secrets. Keep the existing database, account ownership and production URL.

Stuck on "not live yet"? Run the diagnostic locally (it reads the same variable
names and reports which requirement fails; it never prints secret values):

```
node platform/cloudflare/scripts/oauth-setup-check.mjs
```

It exits non-zero when an enabled provider is misconfigured.

Set a regular variable:

```
OAUTH_PUBLIC_ORIGIN=https://studio.rushidhumal-04.workers.dev
```

Use the canonical HTTPS origin only—no quotation path, query or fragment. If moving to a company domain later, change this value **and** the registered callback URLs at all providers. Arbitrary preview hosts are not accepted as OAuth callback origins. Use a normal top-level browser tab with cookies enabled, not a restricted embedded preview.

### Exact callback URLs

| Provider | Register this callback / redirect URI |
|---|---|
| Google | `https://studio.rushidhumal-04.workers.dev/api/auth/oauth/google/callback` |
| Microsoft | `https://studio.rushidhumal-04.workers.dev/api/auth/oauth/microsoft/callback` |
| Apple | `https://studio.rushidhumal-04.workers.dev/api/auth/oauth/apple/callback` |

Do not register `/index.html` or `/dashboard.html` as the OAuth callback.

## 1. Google

1. Open [Google Cloud Console](https://console.cloud.google.com/) and choose the company-controlled project.
2. Configure the Google Auth Platform consent/branding/audience information. If the app remains in testing, add the intended testers; publish/configure the intended audience before wider rollout.
3. Create an OAuth client of type **Web application**.
4. Register the exact Google callback above. Add the Studio origin where the console asks for authorized origins.
5. Add these to the Worker as encrypted secrets:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
6. Set regular variable `OAUTH_GOOGLE_ENABLED=true` only when the registration is ready.

Scopes requested: `openid email profile`. No Gmail inbox, contacts or file access is requested.

## 2. Microsoft

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/) → App registrations → New registration.
2. For both personal Microsoft accounts and work/school accounts, choose the supported account type covering **organizational directories and personal Microsoft accounts**. Organization policies can still require administrator consent.
3. Add the Microsoft callback above as a **Web** redirect URI, not an SPA redirect URI.
4. Create a client secret and securely capture its **value**, not its secret ID.
5. Add Worker encrypted secrets:
   - `MICROSOFT_CLIENT_ID` — Application/client ID
   - `MICROSOFT_CLIENT_SECRET` — secret value
6. Set regular variables:
   - `MICROSOFT_TENANT_ID=common`
   - `OAUTH_MICROSOFT_ENABLED=true`

For a company-only app, use its tenant GUID instead of `common` and align the app registration account type. `organizations` and `consumers` are also supported. Do not enable implicit flow; this integration uses authorization code + PKCE and a server-side token exchange.

Scopes requested: `openid email profile`. Microsoft may omit an email address; an existing Studio user can still link the provider after signing in and confirming the linking requirement. New account creation needs a usable provider-supplied email. Microsoft email is contact metadata, not a stable identity or permission grant.

## 3. Apple

1. Use the company’s [Apple Developer account](https://developer.apple.com/account/). Sign in with Apple web registration requires the applicable Apple Developer membership/configuration.
2. Configure the primary App ID with Sign in with Apple, then create/configure a **Services ID** for the website and associate it with that primary App ID.
3. Register the Studio domain and the exact Apple return URL above. Complete any domain verification required by the Apple console.
4. Create a Sign in with Apple signing key. Store the downloaded `.p8` file **outside this repository** and protect it. Record Team ID and Key ID in your secure operational records.
5. Generate the signed Apple client-secret JWT locally. A helper is included:

   `platform/cloudflare/scripts/apple-client-secret.mjs`

   It reads local environment variables `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID` (the Services ID) and `APPLE_PRIVATE_KEY_FILE` (a path outside Git). It writes a 30-day client-secret JWT to stdout. Pipe it directly into your authenticated Cloudflare secret-management command or use secure local handling—do not paste it into chat or logs.
6. Add Worker encrypted secrets:
   - `APPLE_CLIENT_ID` — Services ID, not an iOS bundle identifier
   - `APPLE_CLIENT_SECRET` — signed JWT from the helper
7. Set regular variable `OAUTH_APPLE_ENABLED=true`.
8. Schedule rotation **before the 30-day secret expires**. An expired Apple client secret disables the configured status. The private `.p8` key itself is not uploaded to this implementation.

Apple uses a server-side code exchange and `form_post` callback. Browser-bound Secure/HttpOnly/SameSite=None state cookies support that cross-site POST. Apple may supply a private relay email instead of the personal address. Name is commonly supplied only on first consent; it is optional, editable display information, never authorization data. Studio does not promise that every provider always returns a full name.

## Existing Studio account: preserve data and permissions

Do **not** create a replacement account for an existing owner.

1. Sign in using the existing Studio method.
2. Open **Settings → Profile → Connected sign-in accounts**.
3. Confirm the current Studio password before connecting a provider. For a provider-only account, sign in again with its existing provider within five minutes before connecting another.
4. Choose Connect Google/Microsoft/Apple and finish that provider’s consent flow.
5. Sign out and verify that the newly connected provider returns to the **same Studio account, quotations and permissions**.

An email match alone never merges accounts. An unauthenticated first attempt matching an existing Studio email asks the user to sign in normally and link explicitly. No special administrator email or hidden owner allowlist is hardcoded. New provider-created accounts are **Viewer**, just like other public registrations; an existing owner manages permissions in Settings → Team.

Provider-only accounts do not have a Studio password. The UI explains this rather than offering a password change that cannot be completed. Verified password setup/recovery and unlinking providers are not implemented here; existing email/password accounts remain unchanged.

## Live acceptance checklist — required after configuration

For each enabled provider:

- The status endpoint `/api/auth/oauth/providers` reports `configured: true`.
- A normal browser tab opens the **real provider** chooser/login page.
- Both consent and cancellation return to Studio cleanly.
- An existing linked account returns to its original ID and permissions.
- A new account is Viewer and cannot access Team administration.
- Repeated sign-in does not duplicate the account or overwrite an edited name.
- A different provider account cannot take over an existing account merely by matching email.
- Check desktop and phone browsers. A chooser may list already signed-in accounts; Studio cannot enumerate every email account stored on a device.
- Confirm provider secret expiry, production audience/test-user restrictions and company consent policy.

To pause a provider safely, set its enable flag to `false`. Do not delete users or identity records. Preserve another working sign-in method before disabling the only provider for a provider-only account.

## Troubleshooting: “Provider sign-in could not be completed” (SIGNIN_FAILED)

This message is generic **by design** — the server never sends provider payloads,
authorization codes, secrets or database errors to the browser. The real reason
is written to the server log only, as structured lines:

```
[oauth] token_exchange status=400
[oauth] google callback -> SIGNIN_FAILED code=SIGNIN_FAILED stage=token_exchange http=400 provider_error=invalid_client msg=...
```

Read them from the local server console, or `npx wrangler tail` for the Worker.
The log never prints `client_secret`, authorization codes, ID/access tokens,
`state`, `binding` or `verifier` values — `msg=` is redacted (sensitive
`key=value` pairs are masked) and truncated to 200 characters, and
`provider_error` is limited to the provider's own error code.

The failure happens after Google's consent screen, so the registered callback
matched. Ranked causes:

1. **`stage=token_exchange` + `provider_error=invalid_client`** — the
   `GOOGLE_CLIENT_SECRET` is wrong, regenerated, or belongs to a different
   OAuth client than `GOOGLE_CLIENT_ID`. Re-copy both from the **same** Google
   Cloud OAuth client (type *Web application*), no trailing spaces.
2. **`stage=token_exchange` + `provider_error=invalid_grant`** — the
   authorization code expired (~10 minutes) or was already redeemed, e.g. the
   callback URL was refreshed or the flow was submitted twice. Retry once from
   the sign-in page.
3. **`stage=token_exchange` + `provider_error=redirect_uri_mismatch`** — the
   `redirect_uri` sent in the token request differs from the one registered at
   the provider. `OAUTH_PUBLIC_ORIGIN` must equal the origin in the address bar
   **exactly** — note this repo references both
   `studio.rushidhumal-04.workers.dev` (older docs) and
   `quotation-studio.rushidhumal-04.workers.dev` (wrangler.toml / vercel.json).
   The registered callback must match the origin actually in use, character for
   character, including the subdomain. For local testing, `localhost` and
   `127.0.0.1` are different origins to Google.
4. **`stage=id_token_verify`** — the verified ID token was rejected: the env
   `GOOGLE_CLIENT_ID` differs from the client that issued the token (audience
   mismatch), the server clock is skewed (tolerance is 30 seconds), or the
   Google account's email is not verified. Sync the system clock and confirm
   the client ID matches the registered client.
5. **`stage=callback_params`** — Google returned no authorization code. Retry;
   if it repeats, check that no browser extension or proxy strips the query
   string on the callback redirect.

Other messages have distinct causes: `SIGNIN_EXPIRED` means the state expired
or the binding cookie was blocked (use a normal browser tab, allow cookies);
`SIGNIN_CANCELLED` means the consent was declined; `ACCOUNT_EXISTS` means the
email already has a password account — sign in with the existing method and
connect the provider from Settings → Profile.

## Local development (Google/Microsoft only)

`OAUTH_PUBLIC_ORIGIN=http://localhost:PORT` (or `http://127.0.0.1:PORT`) is
accepted so Google and Microsoft flows can be tested against the local server;
both providers allow `http://localhost` callbacks in their consoles. Any other
`http` origin stays unconfigured, and Apple requires `https`, so Apple remains
production-only. The browser, binding cookie and state rules are unchanged.

## Implementation and automated tests

- Server-only OIDC code exchange; Google/Microsoft PKCE; nonce, signature, audience, issuer, expiry and authorized-party checks via `jose`.
- Microsoft issuer/tenant validation, fixed provider endpoints, bounded callback bodies and token-response handling, request timeout, one-time state, browser binding and persistent start throttling.
- Additive `oauth_attempts`, `oauth_identities`, `oauth_rate_limits` tables. Created idempotently by the OAuth routes; SQL also provided in `platform/migrations/003-oauth.sql`. No reset-schema operation is needed.
- Stable issuer+subject identity keys; no email-based automatic linking; fresh/current-credential confirmation for linking; linking session must still be valid at callback.
- Provider access/refresh/ID tokens are not stored. Studio session tokens are issued in HttpOnly cookies, not URL parameters. Completion clears a stale locally persisted bearer token from the previous account.
- The pinned MIT-licensed `jose` 6.2.12 Web API bundle is included under `platform/vendor` so the established managed Worker build does not need a new dependency-install step. Its provenance and license are included. No root build framework is introduced.
- `node --test qa/oauth.test.mjs`: eight passing suites, including signed test tokens for all providers, tampering/replay/cancellation failures, SQL-backed D1 store checks and a real Worker route flow with mocked provider HTTP responses. These do **not** constitute live provider login tests.
- `LD_LIBRARY_PATH=/tmp/al2023/lib npm --prefix qa run test:oauth`: also runs real-browser/local-server readiness, settings, mobile guidance and stale-bearer completion checks. The library path is sandbox-specific; normal installed Chromium setups may not need it.
- Existing security suite and full 991-assertion core suite passed. Worker dry-run bundle passed. Standard asset sync also refreshed the pre-existing generated assistant knowledge from current repository sources; no quotation calculation was changed.

# Phone OTP sign-in setup (Firebase Authentication)

Sign-in order on the login page is **Google → Phone → Microsoft**.
Apple was removed from the UI (backend code stays dormant; re-adding the
button later takes minutes if an Apple Developer account is purchased).

How it works: the browser talks to Google directly (SMS code + invisible
reCAPTCHA). Our server never sends SMS — it only accepts Firebase ID tokens
it cryptographically verifies (RS256 against Google's securetoken
certificates, issuer + audience + expiry + E.164 phone + fresh auth_time),
then creates a normal Studio session (viewer role, same as other sign-ins).

Cost: Firebase Spark (free) includes ~10,000 phone verifications/month.
No billing setup is needed at this scale.

## 1. Firebase console (5 minutes, owner/sir does clicks)

1. Open [Firebase console](https://console.firebase.google.com/) → **Add project** →
   use the existing Google Cloud project (the same one as the OAuth client).
2. Left menu → **Build → Authentication** → **Get started**.
3. **Sign-in method** tab → **Phone** → **Enable** → Save.
4. **Settings** tab (inside Authentication) → **Authorized domains** →
   **Add domain** → add the worker host WITHOUT https, e.g.
   `qs-studio-rushi.rushidhumal-04.workers.dev`
   (add `app.ktmenergyexperts.com` later when the custom domain is live).
5. Project **Overview** (gear icon → Project settings) → **Your apps** →
   **Web app** (create one if none, any nickname) → copy the
   **Web API key** (`AIza…`) and the **Project ID**.

## 2. Worker configuration (same values both places)

Dashboard → Worker → Settings → Variables (or `wrangler secret put` /
`wrangler.toml [vars]` for local preview files — never commit secrets):

| Key | Value | Secret? |
|---|---|---|
| `PHONE_ENABLED` | `true` | no (plain var) |
| `FIREBASE_PROJECT_ID` | project ID from step 1.5 | no |
| `FIREBASE_API_KEY` | web API key (`AIza…`) | yes |
| `FIREBASE_AUTH_DOMAIN` | optional; defaults to `<project>.firebaseapp.com` | no |

Redeploy after changing vars. Secrets via dashboard "Add variable and deploy"
redeploy automatically.

For local development (`platform/local-server/server.js`), set the same four
as environment variables (`$env:PHONE_ENABLED="true"` etc. on PowerShell).

## 3. Test (2 minutes, real phone needed)

1. Open `/index.html` → click the **phone button** (2nd of the three).
2. Enter mobile with country code (e.g. `+91 98765 43210`) → **Send code**.
3. Enter the 6-digit SMS code → **Verify & sign in** → dashboard opens.
4. First login creates a viewer account named after the phone number;
   repeat logins reuse it. No email is asked — the account email is an
   internal `@phone.invalid` placeholder, never used for contact.

Verify wiring without SMS: `GET /api/auth/phone/config` returns
`{"enabled":true,…}` when configured, `{"enabled":false}` otherwise.

## 4. Troubleshooting

- Button says "not live yet" → vars missing/wrong (check `PHONE_ENABLED`,
  key starts with `AIza`, project ID lowercase). Redeploy after edits.
- `auth/operation-not-allowed` → Phone provider not enabled (step 1.3).
- `auth/unauthorized-domain` → worker host missing in Authorized domains.
- `auth/quota-exceeded` → Firebase SMS quota; retry later.
- `auth/captcha-check-failed` → reload the page (reCAPTCHA needs a normal
  tab, not an embedded/restricted preview).
- reCAPTCHA loads from `www.google.com`/`gstatic.com`; no CSP blocks it
  (the app sets no Content-Security-Policy).
- The test preview hosts are on Google Safe Browsing's list (false
  positive on fresh workers.dev login pages): bypass via
  Details → Visit this unsafe site during testing. The permanent fix is
  the company domain (`app.ktmenergyexperts.com`).

## 5. Security notes

- The web API key is public by design; quotas/domains are enforced by
  Google. The actual trust is the RS256 signature check on our server.
- Verify endpoint is same-origin only (CSRF gate) + throttled per IP
  (30 attempts / 5 min window); Firebase throttles OTP sending itself.
- ID tokens must be ≤15 min old with fresh `auth_time`; issuer, audience
  (project ID), expiry, and E.164 format are all enforced.
- Phone identities live in `oauth_identities` (`provider='phone'`,
  `subject`=E.164); no email-based linking; no role promotion.
- No schema change was needed: no new tables or columns.

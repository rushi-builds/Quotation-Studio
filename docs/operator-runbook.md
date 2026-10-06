# Operator runbook — Quotation Studio platform

Human-and-dashboard tasks that code cannot do. Everything the audit fixed in
code is in `docs/security-audit-2026-10-04.md`; this page is only what an
operator must configure, decide, or run by hand.

## 1. First owner account (required before inviting staff)

Fresh signups are created as **viewers** — registering with role "Owner" does
not grant owner rights. Promote exactly one trusted account per environment:

**Local server** (`platform/data/db.json` while the server is stopped):

```bash
node -e "
const fs = require('fs');
const p = 'platform/data/db.json';
const db = JSON.parse(fs.readFileSync(p, 'utf8'));
const u = db.users.find((x) => x.email === 'YOU@COMPANY.COM');
if (!u) throw new Error('sign up first, then re-run');
u.role = 'owner';
fs.writeFileSync(p, JSON.stringify(db, null, 2));
console.log('promoted', u.email);
"
```

**Cloudflare D1** (after `npx wrangler d1 execute`), with the same "sign up
first" prerequisite:

```sql
UPDATE users SET role = 'owner' WHERE email = 'YOU@COMPANY.COM';
```

Verify: sign in as that account — management links appear only for owners —
then invite staff, who join as viewers until an owner promotes them.

## 2. Environment & secrets checklist

| Item | Where | Notes |
|------|-------|-------|
| `GEMINI_API_KEY` | Worker secret / local env | Assistant refuses to answer without it (by design). Never commit. |
| OAuth provider credentials | Google/Apple/Microsoft consoles + Worker secrets | See `docs/social-sign-in-setup.md`. Production needs HTTPS callback URLs registered with each provider. |
| `QS_ENABLE_DEV_ROUTES=1` | Local shell only | Enables the bag-reference drop box + design preview. Never set on a network-reachable or hosted server. |
| `HOST` for `scripts/serve.js` | Local shell only | Defaults to loopback; set `HOST=0.0.0.0` only for trusted-LAN previews. |
| `APP_URL` | Worker vars | Must be the public origin; the OAuth `state` binding and link builder depend on it. |

## 3. Cloudflare recommended edge settings

The Worker now throttles auth in D1, but edge rules are still worthwhile:

- **WAF rate rule**: tighter cap on `/api/auth/*` per IP (e.g. 60/min) to shed
  floods before they reach D1 writes.
- **Bot management / challenge** on `/portal.html*` if link-scraping appears.
- **TLS**: Full (strict); minimum TLS 1.2.

## 4. Deploying this branch's backend changes

1. `npm run deploy` from `platform/cloudflare` (syncs static assets, including
   the generated `_headers`, then publishes the Worker).
2. Apply `platform/migrations/004-auth-throttle.sql` to D1 — or skip it: the
   Worker self-creates `auth_throttles` on first auth use. Applying it
   explicitly keeps `schema.sql` and D1 visibly in sync.
3. Smoke test production: register a throwaway viewer, confirm a foreign
   `Origin` POST gets `403 ORIGIN_BLOCKED`, confirm six bad logins yield 429.

## 5. Follow-ups needing a decision (not done, not forgotten)

- **Content-Security-Policy + HSTS + frame-ancestors.** Start with
  `Content-Security-Policy-Report-Only` and a report collector; enforce only
  after the preview-iframe and inline-script inventory is clean.
- **Refresh-token rotation.** Needs a client-compatible design before
  implementation.
- **Provider webhooks for delivery status.** "Delivered" receipts still
  require a future WhatsApp/email provider integration; manual shares record
  `share_clicked` only (see the in-code note in `server.js`).
- **Real-browser coverage: NOT RUN, no CI exists.** There is no
  `.github/workflows` directory, so nothing runs any test automatically.
  This sandbox cannot install Chromium system libraries (all distro, mirror
  and browser-CDN hosts are unreachable from its network), so Playwright
  cannot launch here. Partial substitutes that DO run: the API halves of
  `studio-security` / `oauth-browser` (verified green up to browser launch),
  `qa/audit-dom.test.cjs` (real page scripts in jsdom: recovery honesty,
  social states, sign-in, oauth-complete, save/reopen, dashboard boot —
  layout/viewport/canvas/PDF excluded), and `qa/oauth-attacks.test.mjs`
  (callback forgery/replay at handler + route level). Before merge, still
  run the Playwright suites on a machine with browser libraries, or add a
  GitHub Actions job. Do not assume they pass.
- **Social login needs provider registration.** Code is complete and
  attack-tested, but no live provider login has been certified. Run
  `node platform/cloudflare/scripts/oauth-setup-check.mjs` to see exactly
  which requirement is missing, then follow `docs/social-sign-in-setup.md`
  (Google/Microsoft testable on `http://localhost`; Apple needs `https`).
- **Phone OTP needs Firebase setup.** UI order is Google → Phone →
  Microsoft (Apple button removed; backend dormant). Follow
  `docs/phone-auth-setup.md`: enable the Phone provider in Firebase
  console, authorize the worker host, set `PHONE_ENABLED`,
  `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, redeploy, then test with a
  real phone. `GET /api/auth/phone/config` shows live status.
- **Roles need two Worker variables and one migration.** `OWNER_EMAIL` and
  `ADMIN_EMAIL` decide who runs the workspace, and `users.is_admin` makes an
  elevation permanent — apply `platform/migrations/005-is-admin.sql` (back up
  the `users` table first) before relying on it. Designated owner, designated
  admin, elevation, typed titles and owner-sees-all are all documented in
  [docs/workspace-roles.md](workspace-roles.md).

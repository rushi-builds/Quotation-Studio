# Quotation Studio → Cloudflare (NEW project)

**Do not use or change `solar-epc-relay`.**  
This app gets its **own** Worker + D1:

| Resource | Name |
|---|---|
| Worker | `quotation-studio` |
| D1 database | `quotation-studio-db` |

Who runs the workspace is decided by two Worker variables, `OWNER_EMAIL` and
`ADMIN_EMAIL` — see [docs/workspace-roles.md](workspace-roles.md).

Personal Cloudflare account first (`rushidhumal.04@…`) is fine. Company mail transfer later.

---

## What was prepared in this repo

```
platform/cloudflare/
  wrangler.toml          # project config (new names only)
  package.json           # wrangler scripts
  src/worker.js          # full /api/* on D1 (Phases A–E + auth/roles)

platform/schema.sql      # D1 tables (includes role_custom)
docs/cloudflare-deploy.md  # this file
```

Local Node server (`platform/local-server`) still works offline for development.

---

## You do these steps (once)

### 0) Tools on your PC

1. Install **Node.js 20+** if needed: https://nodejs.org  
2. Open a terminal in the repo folder:

```bash
cd Quotation-Studio
git pull
cd platform/cloudflare
npm install
```

3. Login to **your** Cloudflare account (the one in the screenshot):

```bash
npx wrangler login
```

Browser opens → Allow.  
**Confirm the account email** matches `rushidhumal.04@…` (not another CF account).

---

### 1) Create D1 database (new)

```bash
cd platform/cloudflare
npx wrangler d1 create quotation-studio-db
```

Copy the printed **`database_id`** (UUID).

Open `platform/cloudflare/wrangler.toml` and replace:

```toml
database_id = "00000000-0000-0000-0000-000000000000"
```

with your real id, for example:

```toml
database_id = "a1b2c3d4-...."
```

Save the file.

---

### 2) Apply schema (tables)

**Remote (production D1):**

```bash
npx wrangler d1 execute quotation-studio-db --remote --file=../schema.sql
```

You should see success for `CREATE TABLE` statements.

Optional local preview DB:

```bash
npx wrangler d1 execute quotation-studio-db --local --file=../schema.sql
```

---

### 3) Optional secret

```bash
npx wrangler secret put SESSION_PEPPER
```

Paste any long random string (password manager).  
Worker works without it today; keep the habit for later hardening.

---

### 4) Deploy

```bash
cd platform/cloudflare
npx wrangler deploy
```

Wrangler will:

- Upload Worker `quotation-studio`
- Bundle static files from the **repo root** (dashboard, studio, portal, assets)
- Bind D1 `quotation-studio-db`

At the end you get a URL like:

```text
https://quotation-studio.<your-subdomain>.workers.dev
```

---

### 5) Open and test

| URL | What |
|---|---|
| `https://…workers.dev/dashboard.html` | Staff dashboard |
| `https://…workers.dev/quotation.html` | Studio |
| `https://…workers.dev/api/health` | Should show `"storage":"cloudflare-d1"`, `"phase":"E"` |

**First test path**

1. Hard refresh dashboard.  
2. **Create account** → pick role (Owner / Sales / Viewer / Custom).  
3. Create a proposal, publish, create customer link.  
4. Open portal link in a private window.  
5. Settings → role shows as read-only (set at signup).

Fresh D1 = empty users. Your local Arena accounts do **not** copy over automatically.

---

## Cloudflare dashboard (optional UI checks)

1. https://dash.cloudflare.com → same account  
2. **Workers & Pages** → you should see **`quotation-studio`** (not only solar-epc-relay)  
3. **Storage → D1** → **`quotation-studio-db`**  
4. Leave **`solar-epc-relay`** alone  

---

## Update after code changes

```bash
cd platform/cloudflare
git pull   # if you pulled on another machine
npx wrangler deploy
```

If `schema.sql` gained new tables/columns:

```bash
npx wrangler d1 execute quotation-studio-db --remote --file=../schema.sql
```

(`IF NOT EXISTS` is safe to re-run for new tables; column changes may need a manual migration.)

---

## Local Worker preview (optional)

```bash
cd platform/cloudflare
npx wrangler d1 execute quotation-studio-db --local --file=../schema.sql
npx wrangler dev
```

Opens a local URL with Worker + local D1. Good before production deploy.

---

## Custom domain (later)

Workers & Pages → `quotation-studio` → **Custom domains** → add company domain when DNS is ready.  
No need for day one.

---

## Transfer to company Cloudflare (later)

1. Company mail CF account + 2FA  
2. Create new D1 + Worker there  
3. Apply schema  
4. Export/import data if needed  
5. Point domain / retire personal Worker  

Details also in `docs/platform-phase-a.md`.

---



## If health says **D1 database binding DB is missing**

Worker code is running, but **`env.DB` is empty**.

### Fix A — wrangler deploy (best)

```bash
cd Quotation-Studio
git pull
cd platform/cloudflare
# wrangler.toml already has:
#   binding = "DB"
#   database_id = "78f2b390-8468-4250-b8fd-c7ec119b56b8"
npm install
npx wrangler d1 execute quotation-studio-db --remote --file=../schema.sql
npm run deploy
```

### Fix B — dashboard only (if you cannot CLI yet)

1. Cloudflare → **Workers & Pages** → **quotation-studio** → **Settings** → **Bindings**
2. Remove any D1 row whose **variable name is not exactly `DB`**
3. **Add binding** → D1 →  
   - Variable name: **`DB`** (exactly, capital D B)  
   - Database: **quotation-studio-db**
4. **Add binding** → Assets (if available) or redeploy with wrangler for ASSETS  
5. Save → redeploy / wait ~30s → hard refresh `/api/health`

After a good deploy, health JSON should include `"hasDb": true` and `"ok": true`.

---
## If you see **ASSETS binding missing**

Worker code is live, but **static files were not uploaded**.

Cause: deploy without the `[assets]` folder, or only pasting `index.js` in the dashboard.

Fix on your laptop:

```bash
cd Quotation-Studio
git pull
cd platform/cloudflare
npm install
# refresh HTML/CSS/JS into public/
npm run sync
# database_id must be real in wrangler.toml
npx wrangler deploy
```

After deploy, hard-refresh:

- https://quotation-studio.rushidhumal-04.workers.dev/dashboard.html → sign-in UI  
- https://quotation-studio.rushidhumal-04.workers.dev/api/health → JSON  

Do **not** only Quick-Edit the worker — always `npx wrangler deploy` from `platform/cloudflare` so `./public` binds as **ASSETS**.

---
## If every page shows **Hello World**

That text is Cloudflare’s **default empty Worker stub**.  
It means the Worker name exists and D1 may be bound, but **our repo code was never uploaded**.

Fix = deploy from this repo (do this on your laptop):

```bash
cd Quotation-Studio
git pull
cd platform/cloudflare
npm install
npx wrangler login
npx wrangler whoami
```

### A) Put the real D1 id in `wrangler.toml`

Dashboard → **Storage & databases** → **D1** → **`quotation-studio-db`** → copy **Database ID**.

Or CLI:

```bash
npx wrangler d1 list
```

Edit `platform/cloudflare/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "quotation-studio-db"
database_id = "PASTE-YOUR-REAL-UUID-HERE"
```

Binding variable name must stay **`DB`** (not a random name).  
In the dashboard binding row it may show a label like `quotation_stu…` — after a proper `wrangler deploy`, it becomes **`DB`**.

### B) Apply tables (once)

```bash
npx wrangler d1 execute quotation-studio-db --remote --file=../schema.sql
```

### C) Deploy **our** Worker (replaces Hello World)

```bash
npx wrangler deploy
```

Wait until it prints a success URL. Then hard-refresh:

- https://quotation-studio.rushidhumal-04.workers.dev/api/health  
  → JSON with `"storage":"cloudflare-d1"` and `"phase":"E"` (not Hello World)
- https://quotation-studio.rushidhumal-04.workers.dev/dashboard.html  
  → Sign in / Create account UI

**Do not** use dashboard **Quick edit** to paste random code.  
**Do not** redeploy the default “Hello World” template.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **Hello World** on every URL | You never ran `wrangler deploy` from `platform/cloudflare` — see section above |
| `database_id` invalid | Paste id from D1 dashboard / `wrangler d1 list` into `wrangler.toml` |
| `/api/health` 500 DB missing | Binding name must be `DB`; redeploy after toml fix |
| Sign-in works then 401 | Use HTTPS workers.dev URL; hard refresh; Create account again on **this** D1 |
| Static 404 | Deploy from `platform/cloudflare` so assets `directory = "../.."` is repo root |
| Wrong CF account | `npx wrangler whoami` then `npx wrangler logout` / `login` |
| Accidentally opened solar-epc-relay | Close it — deploy only `quotation-studio` |
| `table users has no column named role_custom` | Old DB predates the column — empty pre-launch DB only: `npm run db:reset-schema` (drops + rebuilds all tables) |

---

## Honesty limits (unchanged on CF)

- Send centre still **share_clicked** only (no fake delivery)  
- Recovery codes still **shown on screen** until email provider is wired  
- No kill switch / no hidden sabotage paths  

---

## Agent / Arena note

This environment **cannot** run `wrangler login` against your personal account.  
You run steps 0–5 on your laptop (or any machine where you can log into Cloudflare).  
After deploy, paste the `workers.dev` URL in chat if you want help testing.

## Gallery photos live in D1 (no R2, no card)

Site-photo uploads are auto-compressed in the browser (max ~1400px, under ~900 KB)
and stored as values in the free D1 database — no R2 subscription and no payment
method needed, ever. The local server keeps full files on disk instead. Same
dashboard UI works on both. D1 free tier (5 GB) holds thousands of site photos.

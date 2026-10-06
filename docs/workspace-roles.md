# Workspace roles — designated owner, designated admin, elevation

Two Worker variables decide who runs the workspace, and one stored column makes
a decision permanent. Everything else is display text.

| Piece | Where | Secret? | What it does |
|---|---|---|---|
| `OWNER_EMAIL` | env var | no (plain var) | The **visible** Owner. That account is promoted to `owner` on any authenticated request, and the promotion clears any typed title. Unconditional — a titled signup does not block it. |
| `ADMIN_EMAIL` | env var | no (plain var), but treat as sensitive | Who **may elevate**. Owner-level powers on every gate, computed per request from the variable and the account email. Never persisted, never shown as a label. |
| `users.is_admin` | D1 column | n/a | Who **is elevated**. A stored flag that outranks `owner` and survives a change of the variable. Changes no display field. |

`ADMIN_EMAIL` and `is_admin` are deliberately two different ideas. The variable
is the *right to act*; the column is the *result of acting*. Only the
`ADMIN_EMAIL` login can set the column, and it can only set it on **its own
row** — so an elevated account cannot create a second elevated account.

Both variables are set together at deploy time. Neither is a secret in the
Cloudflare sense, but do not put them in a public repo file or a screenshot:
knowing the admin mailbox tells an attacker which account to phish.

## Migration (required)

The column arrives by migration, not implicitly. Nothing creates it at runtime.

```sql
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
```

That single statement is `platform/migrations/005-is-admin.sql`. Back up first:

```bash
cd platform/cloudflare

# 1. back up the table you are about to alter
npx wrangler d1 execute quotation-studio-db --remote \
  --command "SELECT id, email, role, role_custom FROM users" \
  > ../backup-users-before-is-admin.json

# 2. apply
npx wrangler d1 execute quotation-studio-db --remote --file=../migrations/005-is-admin.sql

# 3. verify — expect exactly one row: users | is_admin | INTEGER | 1 | 0
npx wrangler d1 execute quotation-studio-db --remote --file=../migrations/005-is-admin-verify.sql
```

The verifier reads `pragma_table_info` rather than selecting the column, so a
missing column returns **zero rows** instead of throwing. Zero rows means the
migration has not been applied.

**Re-running** the migration is harmless: SQLite has no `ADD COLUMN IF NOT
EXISTS`, so a second run fails with `duplicate column name: is_admin` and
changes nothing.

**Rollback.** The column is inert if you leave it behind — code that does not
know about it never reads it, and its default is `0`. To neutralise elevation
without DDL:

```sql
UPDATE users SET is_admin = 0;
```

SQLite cannot drop a column without rebuilding the table, and there is no reason
to: rolling the *code* back needs no DDL at all.

**Until the migration is applied** the site keeps serving — every read of the
column is defensive (`COALESCE`/`|| 0`) — but elevation cannot work,
`GET /api/health` reports a warning naming the migration, and
`features.elevation` is `false`.

## Nothing demotes the `ADMIN_EMAIL` row

The `ADMIN_EMAIL` account keeps **whatever role it is stored with**. No
automatic transition touches it — not on sign-in, not on any other request.

An earlier revision healed that row `owner → viewer` on sign-in, so the personal
mailbox would not show up as a second visible Owner. It is **removed**, for two
reasons:

- **It fought deliberate promotions.** Promoting the designated admin to a
  visible Owner stored `owner` with a NULL title, which re-armed the heal, so
  that mailbox's next request silently undid what an owner had just done on
  purpose. A role that cannot be set is a bug wearing a feature's clothes.
- **It was never needed for safety.** This account's reach comes from
  `ADMIN_EMAIL` and, once used, from `is_admin` — not from the `role` column.
  The demotion changed the display and nothing else.

So the `OWNER_EMAIL` bootstrap is now the **only** automatic role transition in
the product. It is unconditional and one-way: that mailbox is promoted to
`owner` (and its typed title cleared) on any authenticated request.

| You want the personal mailbox to show… | Do this | Does it stick? |
|---|---|---|
| `Owner` | leave it alone, or choose Owner in the team panel | **yes** |
| `Viewer` | choose Viewer once — from the team panel or its own pencil | **yes** |
| a typed title (e.g. `Director`) | choose Custom title and type it | **yes** |

Nothing writes any of those back. Hiding the Owner badge is therefore a
**one-click, permanent** choice rather than something the system does behind
your back — and after that demotion the account still has full reach, because
reach was never in the `role` column.

Two mechanisms that existed to make a promotion survive the heal are gone with
it: the `role_custom = ''` latch, and the `Founder` stamp. A promotion stores
plain NULL. (`''` is falsy in JavaScript, so it displayed as "Owner" while
defeating a NULL test — clever, and the wrong thing to be clever about.)

## Elevation

`is_admin` sits **above** `owner` in the permission rank:

| Rank | Role | Notes |
|---|---|---|
| 4 | elevated (`is_admin = 1`) | every gate passes, including owner-only ones |
| 3 | `owner` | |
| 2 | `sales`, and every custom title | |
| 1 | `viewer` | |

`requireRole` is a rank comparison, so `canWrite`, `canManageTeam` and
`seesAll` all inherit elevation with no further change. `admin` is **not** a
role value: no row ever stores `role='admin'`, `features.roles` does not list
it, and no badge renders it.

### Who may do what

| Actor | Target | Result |
|---|---|---|
| `ADMIN_EMAIL` login | itself | `is_admin = 1` (or `0` for `unadmin`) |
| `ADMIN_EMAIL` login | anyone else | **403** — elevation is self-service |
| `ADMIN_EMAIL` login | an `owner` row | allowed — elevation outranks owner |
| owner (not `ADMIN_EMAIL`) | an elevated row | **403** |
| owner (not `ADMIN_EMAIL`) | `role: "admin"` for anyone | **403** |
| any member | `role: "admin"` for itself | **403** |

The two refusals an owner can receive are **byte-identical** — same status, same
`error: "Ask admin"`, same `code: "ELEVATION_FORBIDDEN"`. That is deliberate: if
"this row is elevated" and "you may not elevate" were distinguishable, the
difference itself would reveal which row is elevated.

### Stealth is the point

Elevation changes reach and changes **nothing on screen**. `role`,
`role_custom` and therefore `roleLabel` are not written, so:

- the name-plate and the profile chip read exactly as before;
- the team-panel power badge reads the **stored** role — a viewer-level elevated
  account badges as `Viewer`;
- no payload about *another* member carries `isAdmin`, `canElevate`, or an
  effective-capability field. A member row for an elevated account is
  byte-identical in shape to an ordinary viewer's row, in devtools as well as in
  the UI.

Only the actor's **own** row carries `isAdmin` / `canElevate` /
`effectiveCanWrite` / `effectiveCanManageTeam`, on `/api/auth/me` and on the
actor's own entry in the team list — data about yourself, sent to yourself.

The word "Admin" is rendered in exactly **one** place in the whole front end:
the option in the own-role pencil dropdown, and only when the server says
`canElevate` for the signed-in user. The team panel's per-member role dropdown
never contains it, so no owner can raise or lower anyone else.

**Typing "Admin" as a title is allowed and does nothing.** Titles are
unrestricted display text; a title of "Admin" stores a custom title with
sales-level power and leaves `is_admin` at `0`.

### A documented edge

`canElevate` is the `ADMIN_EMAIL` login only — never "any `is_admin = 1` row".
So if `ADMIN_EMAIL` is later pointed at a different mailbox, an already-elevated
row keeps owner-and-above powers but **cannot de-elevate itself**; only the new
`ADMIN_EMAIL` login could, and it may only act on its own row. Clearing such a
row is a one-line D1 update: `UPDATE users SET is_admin = 0 WHERE id = '…'`.
This is the intended trade for "an elevated account cannot mint another".

## Team panel

Every signed-in member may **read** it. Only an owner or the designated admin
may change anything, and only they receive the contact column — the server omits
`email` from other members' rows rather than blanking it, so there is nothing to
unhide client-side. The response carries `canManageTeam` and the front end
renders either the editable table or a read-only one.

Columns: contact, typed title, power badge, last sign-in (most recent session
issued, else account creation), and the role control.

## Typed titles never grant power

A title is display text. Choosing a **power key** (Owner / Sales / Viewer)
changes access; typing a **title** does not.

| Action | Stored | Effective power | Badge shown |
|---|---|---|---|
| Role → Owner | `owner` / NULL | owner | Owner |
| Role → Sales | `sales` / NULL | sales | Sales |
| Role → Viewer | `viewer` / NULL | viewer | Viewer |
| Title → `Project lead` | `custom` / `Project lead` | sales | Project lead |
| Title → `Owner` | `custom` / `Owner` | **sales** | Owner |
| Title → `Admin` | `custom` / `Admin` | **sales**, `is_admin` still 0 | Admin |

There is **no blocklist** on titles — any wording up to 60 characters is
accepted — because the power badge is the truth and a title cannot escalate.
Before this round a typed title of "Owner" was mapped onto the owner power key
and granted full admin; that hole is closed.

Registration is unchanged and still open: a signup picks any title, always lands
on `viewer`, and always writes `is_admin = 0`. A job title on the form is not an
authorization grant.

## API

`POST /api/team/role` — owner gate to write.

```jsonc
{ "userId": "usr_…", "role": "owner" }                                  // power key
{ "userId": "usr_…", "role": "custom", "roleCustom": "Project lead" }   // typed title
{ "userId": "usr_…", "role": "admin" }                                  // elevate SELF
{ "userId": "usr_…", "role": "unadmin" }                                // de-elevate SELF
```

`admin` / `unadmin` are explicit values rather than a toggle, so a repeated
request cannot flip the flag by accident. They are handled before any title
parsing and ignore `roleCustom`. An explicit `roleCustom` on a normal role
change is always parsed as a title, never as a power keyword; `role: "custom"`
with no title is rejected rather than silently stored empty.

`GET /api/team/members` — any signed-in member. Each row carries `roleLabel`
(typed title), `power` (stored role), `canWrite`, `canManageTeam`, `lastLogin`,
and `email` only for a manager. The actor's own row additionally carries
`isAdmin`, `canElevate`, `effectiveCanWrite` and `effectiveCanManageTeam`.

`GET /api/auth/me` — self only. Carries the same capability flags, including
`isAdmin` and `canElevate`.

`GET /api/health` — public. Adds `codeVersion` (`roles-r1`), `features.elevation`
and `warnings`. Warnings report **configuration state only**: they never print an
email address, never count admins, and never admit that a designated admin
exists.

| Warning | Meaning |
|---|---|
| `users.is_admin` column is missing | The migration has not been applied. Elevation is unavailable; the warning names `005-is-admin.sql`. |
| `ADMIN_EMAIL` and `OWNER_EMAIL` name the same mailbox | The `ADMIN_EMAIL` designation is redundant — the bootstrap already makes that account a visible Owner, and it may still elevate itself. Nothing oscillates. Almost certainly a deploy-time mistake, so split the two variables. |
| `OWNER_EMAIL`/`ADMIN_EMAIL` is set but is not a valid email address | A typo. Nothing errors — the variable simply matches no account, so the bootstrap silently never runs, or nobody may elevate. |

## Deploy

```bash
cd platform/cloudflare
# migration first (see above: back up, apply, verify), then
npx wrangler deploy           # with OWNER_EMAIL + ADMIN_EMAIL in [vars]
```

Verify on the live worker:

```bash
curl -s https://<worker-host>/api/health | jq '{codeVersion, features, warnings}'
# codeVersion must be "roles-r1"; features.elevation must be true; warnings must be []
```

Then confirm with actions, not screens: sign in as the designated admin and
create a quotation (sales gate), open the team panel (owner gate), open a
quotation belonging to another member (owner-sees-all), and elevate yourself —
then check that your name-plate and badge did **not** change.

The `ADMIN_EMAIL` row is **not** demoted automatically. If that mailbox
currently reads `Owner` and you would rather it read `Viewer`, change it once
from the team panel — it sticks, and the account keeps full reach either way.

## Parity

`platform/cloudflare/src/worker.js` and `platform/local-server/server.js`
implement the same contract. The worker scopes queries in SQL with the
`OWN_SCOPE` guard `(? IS NULL OR owner_id = ?)` — bound `null` for owner or
elevated so the filter lifts, bound the user's id for members so their reads are
unchanged. The local server mirrors it in memory with `inScope(scope, row)`.

Token-based customer-portal queries are excluded on purpose: they run with no
staff session, so there is no caller whose scope could lift the filter.

Front-end gates use the `canWrite` / `canManageTeam` flags the server sends
rather than re-deriving them from a role string, which is what lets a
`viewer`-row designated admin still create and edit. On a team-panel **row**
those two flags are the stored-role values; the effective ones are named
`effectiveCanWrite` / `effectiveCanManageTeam` and appear only on your own row.

## Tests

```bash
npm --prefix qa test
node qa/roles-access.test.js    # behaviour, end-to-end on the local server  (142 assertions)
node qa/roles-parity.test.js    # worker/server parity, stealth, frozen files (218 assertions)
```

`roles-access` covers the elevate/de-elevate roundtrip, the zero display delta,
owner-cannot-touch-elevated 403, non-admin cannot self-elevate 403, the
indistinguishability of the two refusals, that **nothing** changes the
`ADMIN_EMAIL` row automatically — a promotion, a demotion and a typed title all
stick across repeated sign-ins — C3 proven on a row demoted to `viewer`, the P1
collision (bootstrap warns, no oscillation), a malformed `ADMIN_EMAIL` failing
closed, and the panel's read-only + contact-stripped behaviour for a member.

`roles-parity` covers the same contract structurally in the worker (which cannot
be executed here), including that no automatic demotion exists at all: no
`healAdminRow`, no SQL writing `role = 'viewer'`, and every SQL write of `role`
also deciding `role_custom`.

Browser suites are **not run** — no CI browser here. The team panel's rendered
columns (title / badge / last sign-in / contact) and the elevation dropdown are
therefore untested visually.

## Not touched by this round

Calculation, pricing, finance and export files are frozen. The phone button and
all Firebase wiring are unchanged. No zone, NS or domain change — NS goes last
and is an operator click, not a patch.

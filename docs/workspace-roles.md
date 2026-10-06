# Workspace roles — designated owner, designated admin, typed titles

Round-1 of the roles/auth/visibility work. Two Worker variables decide who runs
the workspace; everything else is display text.

| Variable | Secret? | What it does |
|---|---|---|
| `OWNER_EMAIL` | no (plain var) | The **visible** Owner. That account is promoted to `owner` on any authenticated request, and the promotion clears any typed title. Unconditional — a titled signup does not block it. |
| `ADMIN_EMAIL` | no (plain var), but treat as sensitive | A **hidden** admin. Owner-level powers on every gate, computed per request from the variable and the account email. Never persisted to D1, never shown as a label. |

Both are set together at deploy time. Neither is a secret in the Cloudflare
sense, but do not put them in a public repo file or a screenshot: knowing the
admin mailbox tells an attacker which account to phish.

## What the hidden admin sees, and what others see

The designated admin's **stored** row can be anything — after the founder
self-heal below it is `role='viewer'` with the typed title `Founder`. Its powers
come from the variable, not the row.

- The team panel shows them the typed title ("Founder") with a **Viewer** power
  badge. That badge is honest about the stored row and wrong about their reach;
  the word "Admin" appears nowhere in the product.
- Members see their own quotations only. The designated owner and the designated
  admin see everyone's, including detail views.
- The pencil next to a member's own title is visible to everyone. An owner or
  the designated admin can use it; anyone else gets "Ask owner to change it".

## Founder self-heal (one-time)

Today the personal mailbox holds `role='owner'` with `role_custom` NULL, so it
appears as a second visible Owner. The first time the `ADMIN_EMAIL` account signs
in:

```
personal row:  owner / NULL   →   viewer / 'Founder'
```

- **Target is the `ADMIN_EMAIL` account's own row.** The `OWNER_EMAIL` row is
  never touched — the company mailbox keeps the visible Owner role.
- **No manual D1 edit is needed.** The patch performs this on first admin login.
- **One-time latch:** it only fires while `role_custom` is NULL. Once `Founder`
  is stamped it never runs again.
- The second owner (`sales@…`) is not touched by this. Demote that account from
  the team panel in the UI later.

### Known behaviour worth knowing before you rely on it

Promoting the founder row to Owner from the team panel **clears** its typed
title, which re-arms the latch — so the next `ADMIN_EMAIL` sign-in stamps
`Founder` again. The designated admin never loses access (powers come from the
variable), but a *permanent visible second Owner* is not achievable while the
latch is `role_custom IS NULL`. Making it permanent needs a latch that survives
role changes (a dedicated column or a settled flag). Flagged for the spec owner;
`qa/roles-access.test.js` asserts the current behaviour so it cannot change
silently.

## Typed titles never grant power

A title is display text. Choosing a **power key** (Owner / Sales / Viewer) changes
access; typing a **title** does not.

| Action | Stored | Effective power | Badge shown |
|---|---|---|---|
| Role → Owner | `owner` / NULL | owner | Owner |
| Role → Sales | `sales` / NULL | sales | Sales |
| Role → Viewer | `viewer` / NULL | viewer | Viewer |
| Title → `Project lead` | `custom` / `Project lead` | sales | Project lead |
| Title → `Owner` | `custom` / `Owner` | **sales** | Owner |

The last row is deliberate. There is **no blocklist** on titles — any wording up
to 60 characters is accepted — because the power badge is the truth and a title
cannot escalate. Before this round, a typed title of "Owner" was mapped onto the
owner power key and granted full admin; that hole is closed.

Registration is unchanged and still open: a signup picks any title and always
lands on `viewer`. A job title on the form is not an authorization grant.

## API

`POST /api/team/role` — owner gate.

```jsonc
{ "userId": "usr_…", "role": "owner" }                       // power key
{ "userId": "usr_…", "role": "custom", "roleCustom": "Project lead" }  // typed title
```

An explicit `roleCustom` is always parsed as a title and never as a power
keyword. `role: "custom"` with no title is rejected rather than silently stored
empty. The response carries `power`, `canWrite`, `canManageTeam` and — when the
target is the `OWNER_EMAIL` mailbox and was just demoted — a `note` explaining
that the unconditional bootstrap will restore it on next sign-in.

`GET /api/team/members` — owner gate. Each member carries `roleLabel` (typed
title), `power`, `canWrite`, `canManageTeam`, `email` (contact, owner/admin only)
and `lastLogin` (most recent session issued, else account creation).

`GET /api/health` — public. Adds `codeVersion` (`roles-r1`) so an operator can
prove which build is running, plus `warnings`. Warnings report **configuration
state only**: they never print an email address, never count admins, and never
admit that a designated admin exists.

| Warning | Meaning |
|---|---|
| `ADMIN_EMAIL` and `OWNER_EMAIL` name the same mailbox | The self-heal is disabled so the role cannot oscillate between owner and viewer on every request. Split the two variables. |
| `OWNER_EMAIL`/`ADMIN_EMAIL` is set but is not a valid email address | A typo. Nothing errors — the variable simply matches no account, so the bootstrap or the heal silently never runs. |

## Deploy

Set both variables in one deploy, then sign in once with the `ADMIN_EMAIL`
account so the self-heal runs:

```bash
cd platform/cloudflare
npx wrangler deploy           # with OWNER_EMAIL + ADMIN_EMAIL in [vars]
```

Verify on the live worker:

```bash
curl -s https://<worker-host>/api/health | jq '{codeVersion, warnings}'
# codeVersion must be "roles-r1"; warnings must be []
```

Then confirm with actions, not screens: sign in as the designated admin and
create a quotation (sales gate), open the team panel (owner gate), and open a
quotation belonging to another member (owner-sees-all).

## Parity

`platform/cloudflare/src/worker.js` and `platform/local-server/server.js`
implement the same contract. The worker scopes queries in SQL with the
`OWN_SCOPE` guard `(? IS NULL OR owner_id = ?)` — bound `null` for owner/hidden
admin so the filter lifts, bound the user's id for members so their reads are
unchanged. The local server mirrors it in memory with `inScope(scope, row)`.

Token-based customer-portal queries are excluded on purpose: they run with no
staff session, so there is no caller whose scope could lift the filter.

Front-end gates use the `canWrite` / `canManageTeam` flags the server sends
rather than re-deriving them from a role string, which is what lets a
`viewer`-row designated admin still create and edit.

## Tests

```bash
npm --prefix qa test
node qa/roles-access.test.js    # behaviour, end-to-end on the local server
node qa/roles-parity.test.js    # worker parity + frozen-file rule, static
```

Browser suites are **not run** — no CI browser here. The team panel's rendered
columns (title / badge / last sign-in / contact) are therefore untested visually.

## Not touched by this round

Calculation, pricing, finance and export files are frozen. The phone button and
all Firebase wiring are unchanged. No zone, NS or domain change — NS goes last
and is an operator click, not a patch.

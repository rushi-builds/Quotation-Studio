# Company and personal account access

## What ships in this change

A real access service in both the local API and Cloudflare Worker, backed by the
same policy module and durable compare-and-swap storage. Settings → Connections
contains account preparations, access requests, owner decisions, revocation and
recent audit history. Pulse Overview has a separate company section.

**This is not provider onboarding.** Preparing Gmail, Outlook, WhatsApp, social
or calendar accounts does not authenticate a provider, import history, enable
sync, send a message or schedule an invitation. Provider controls remain disabled
until their server-side adapters and explicit provider consent are built and
configured. No provider password, OAuth token or message content belongs in this
store. Unknown request fields (including credentials) are rejected.

The existing deployment is **one company/workspace per database**. These APIs do
not invent a multi-tenant company selector or join separate company databases.
A future multi-company product needs tenant-scoped identities and database keys
before reusing this service.

## Defaults

- Individual Studio logins remain individual. A display title, email provider
  name or client-supplied role grants nothing.
- Existing trusted Sales roles retain their own quotation work and standard
  company membership. Owner/elevated authority comes from the existing server
  permission resolver, not the UI. Hidden elevation is never exposed about
  another team member.
- A public/new Viewer signup does **not** automatically become a company member.
  Owner approval is needed for company metrics, the team directory and staff
  gallery (including image bytes). Personal profile and own metadata remain
  accessible. A viewer title saying “Owner” is still unprivileged.
- Approved members see safe company-level quotation/follow-up **counts**, not
  customer names, individual ownership, monetary amounts or snapshots through
  the common metrics endpoint.
- Company social analytics permission defaults to approved members. Native
  provider insights are `null`/not connected, never fabricated zero views.
- Company mailbox reads, replies, calendar reads/writes and management have
  separate account-ID-bound permissions. Same provider != same account.
- Personal accounts belong to the individual. Company managers have **no
  implicit entitlement to their metadata/content**. Only the personal owner
  may explicitly delegate personal-account permissions. A personal account
  owner cannot grant workspace-wide company permissions.
- Company quoted-value reports and shared follow-up records need separate
  explicit grants. Shared follow-ups are read-only; this grant does not let
  somebody complete another person's tasks or open their quotation snapshot.
- Own quotation pricing/snapshots are separate from company financial reports.
  Existing Sales authorisation permits own-scope pricing; viewers need an
  explicit own-pricing grant. Company finance permission does not lift the
  existing quotation owner-ID scope or give access to personal snapshots.
- Pricing revocation gates financial detail/write/share/snapshot routes, not
  just the report card. Restricted report JSON omits `value` (`null`), while
  nonfinancial counts still work. Legacy value extractors are reused; no quote
  calculation engine, subsidy, pricing formula or frozen file is changed.
- “Quoted value” is not revenue, profit, payment collection or payroll. Those
  data domains are not connected and this change creates no invented amounts.

## Requests and decisions

Requests name the account/resource, requester and exact permission and require a
reason. Company owners/authorised elevated managers review company requests;
personal owners control their own explicit sharing. Requesters cannot approve
or grant themselves permissions. A grant never confers Team-role/elevation power.

Owner notifications are derived from durable pending requests. “Mark all read”
cannot approve, reject or dismiss a security request. Decisions are visible to
the requester on refresh. No external notification emails are sent.

Account preparations require approved company membership (including personal
preparations). Limits are 20 active personal accounts per member, 100 active
accounts and 500 historical preparations per workspace.

Requests expire after 7 days; duplicate pending requests and more than 5 pending
requests per person are rejected (workspace pending cap: 1000). Grants can last
7/30/90 days or until revoked. Expired grants are checked on every API request.
An explicit deny overrides member/Sales defaults for the relevant capability;
Owner authority and personal account ownership themselves remain role/ownership
properties, managed through the existing Team controls rather than feature ACLs.

Approvals/grants/archive commands require the revision the reviewer saw. A
concurrent decision returns 409; the UI reloads but **never automatically replays
an approval/grant**. Additive preparation/request creation may use a stale client
revision but is revalidated against fresh server permissions and still committed
with CAS. No last-writer-wins permission replacement.

Archive revokes explicit account grants and cancels pending account requests.
Restore does not resurrect those grants. It only restores a preparation, not a
provider session. Members cannot change company ownership to gain access.
Revocation applies to subsequent server requests; it cannot retract already
read/downloaded data or independently issued customer bearer links. Customer
links continue their existing expiration/revocation contract. This is access
control, not a DLP filter for prices manually typed into free-text task titles.

Every mutation requires a staff session plus a session header, strict input
allowlisting, bounded payloads and existing same-origin protections. Tokens are
not accepted from a form body. Storage failures fail closed; no UI localStorage
ACL fallback or financial cache is used. Frontend refresh clears displayed
company financial data while revalidating permissions and checks account/generation
before applying asynchronous responses.

Audit retains the latest 1000 access events in durable storage, with the latest
100 relevant events returned to the UI. Request history keeps pending requests
and the latest 500 closed decisions. This is bounded operational history, not an
unlimited/compliance-grade audit archive. Private account audit visibility is
limited to the actor/subject; company managers do not automatically read another
individual's private-account events. A production retention/archival policy is
still an operator decision.

## API

All routes below require a signed-in Studio user:

- `GET /api/workspace`: self permissions, visible preparations, scoped requests,
  decisions and audit. No provider credentials or other users' elevation fields.
- `POST /api/workspace/connections`: prepare a company/personal account.
- `POST /api/workspace/requests`: request a named permission.
- `POST /api/workspace/review`: approve/reject a pending request.
- `POST /api/workspace/grant`: explicit grant or deny, with reason and duration.
- `POST /api/workspace/archive`: archive/restore an account preparation.
- `GET /api/workspace/pulse`: approved company counts and available channel
  metadata, with no financial/customer-detail payload.
- `GET /api/workspace/finance`: explicitly authorised company quoted-value report.
- `GET /api/workspace/followups`: explicitly authorised shared records, read-only,
  capped at 200 records.
- `GET /api/workspace/connections/:id/data/:permission`: permission preflight.
  Denied = 403; authorised but adapter missing = 503 `PROVIDER_NOT_CONNECTED`.
  It never fetches a provider or performs a send.

## Rollout — not executed against production

1. Back up the intended company database and verify its account/environment.
2. Apply **only** the additive `platform/migrations/011-workspace-access.sql` to
   that database before rolling out these routes. Do not run reset-schema.
3. Verify a single `workspace` row at revision 0. Fresh installations include the
   same additive table in `platform/schema.sql`; existing rows are not rewritten.
4. Deploy only after the owner's existing production approval/parity process.
   This coding session does not authorise a production DB migration or live
   provider onboarding. No registrar, DNS, storage binding or secret was changed.
5. Owner approves read-only users' company membership explicitly. There is no
   bulk “grant everyone” migration. Sales role authorisation remains intentional
   existing authorisation; revoke a capability or change the Team role as needed.
6. Smoke-test two independent logins: request/review, safe metrics vs finance,
   own vs another user's quotation, personal sharing, revocation and photo bytes.
7. Configure official provider adapters/consent separately. Signing into Studio
   (including Google sign-in) is **not** mailbox/calendar consent.

Local JSON storage needs no schema command; it adds `workspaceAccess` only when
an access mutation is saved, merging into the freshest DB. The Worker does not
silently create production tables at request time. Missing migration returns
`ACCESS_UNAVAILABLE`; sensitive reads fail closed.

Staff photos now use authenticated `/api/gallery/file/:id` with `private,
no-store`. Legacy local file URLs are routed through the same session/membership
gate; they are no longer publicly served as unguessable capability URLs. Public,
repository-curated website photos are separate and unchanged.

## Verification / preview

- `node qa/workspace-access.test.mjs`: actual local handler and actual Worker;
  Worker SQL executes against disposable SQLite via a labelled D1-compatible
  adapter. This is not a live Cloudflare deployment test.
- `node qa/workspace-access-browser.test.cjs`: real authenticated browser,
  disposable local backend, multiple accounts; no provider requests.
- Existing platform/security/role/Pulse/workspace/package/frozen regressions.

`review/workspace-fit/index.html?panel=access` is an isolated **read-only sample
preview**, not evidence of production data or deployed backend access. Add
`role=member` for restricted-member presentation, `role=pending` for pending
membership, or `panel=sales&role=member` for common metrics with locked money.
The review fixture blocks API/auth, writes, uploads and provider requests;
preparations and decisions cannot be changed through the sample preview.

### Verification notes for this patch

The dedicated access API (95), authenticated browser workflow (28), isolated
preview (42), Pulse browser (77), Connections browser (67), eight-page workflow
(44), original-layout (28), label/readability (20), platform API (172), and
existing role-access (150) checks passed. The Worker security contract passed.
Packaging/frozen/scope/role-parity checks are also run before preview publication.

The finishing pass fixes the previously documented recovery back-arrow issue:
vertically centring overflowing recovery content had clipped the header outside
the card. Recovery now scrolls from the top and the form's bounds match its
card. The broader local security suite passes, including unforced desktop and
mobile back-arrow clicks, locked recovery steps and zero secret requests on
navigation. No recovery API/OTP logic or quote calculation freeze was changed.

Company connection grants cover Studio-mediated provider actions. Existing
manual sharing (opening the user's own mail/WhatsApp client) is not company
mailbox OAuth, and cannot override that external application's own permissions.
Do not share company provider passwords with team members; connect a company
account through an authorised provider adapter and delegate Studio access instead.

### Accounts & access presentation

The Settings panel uses provider-logo account cards and ownership filters.
Accounts, Requests, My access and History are separate keyboard-navigable tabs;
request reasons and individual permission details are disclosed on demand.
Notifications open the Requests tab. The shared Pulse overview and all backend
access rules are unchanged. Light/dark and mobile layouts are covered by the
isolated preview checks, including locally loaded logos and forced-submit
read-only protection. Sample names are fictional; the fixture remains visibly
labelled read-only and cannot save decisions or connect providers.

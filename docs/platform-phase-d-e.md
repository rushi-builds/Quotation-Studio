# Platform Phases D & E — Activity, follow-ups, reports, roles

_Status: implemented on the local platform API (Phase marker `E`)._

## Phase D — Activity, notifications, follow-ups

### Notifications
- Created when meaningful portal/staff events occur (first link open, survey request, PDF request, publish, revoke, share start).
- Suspected prefetches / bots are **stored as events** but do **not** raise a high-priority “opened” notification flood.
- Staff can mark one or all as read.
- API: `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`.

### Activity feed
- Workspace-wide timeline of events the signed-in user owns.
- Labels distinguish human opens from `suspected_prefetch`.
- API: `GET /api/activity`.

### Follow-up tasks
- Title, optional notes, optional linked proposal, due date.
- Status: `open` | `done` | `cancelled`.
- `overdue` is computed server-side for open tasks past `due_at`.
- API: `GET/POST /api/tasks`, `PUT/DELETE /api/tasks/:id`.

## Phase E — Reports & roles

### Reports (`GET /api/reports/summary`)
- Proposal counts by status.
- Quoted value: uses explicit investment fields when present, else capacity × rate when both exist; **missing values are counted separately and never invented**.
- Engagement: published versions, active links, share starts, opens, prefetches, PDF/survey requests.
- Honesty notes returned with every payload.

### Roles
| Role | Capabilities |
| --- | --- |
| **owner** | Full write + manage team roles |
| **sales** | Create/edit/publish/send/tasks (default for accounts after the first) |
| **viewer** | Read-only; write APIs return **403** |

- First registered account is **owner**.
- `GET /api/team/members`, `POST /api/team/role` (owner only).
- Owner cannot demote themselves unless another owner exists.

## Dashboard UI
- **Activity** — notifications + event timeline  
- **Follow-ups** — task list  
- **Reports** — KPI + honesty copy  
- **Settings → Team & roles** — owner management  
- Home KPIs include unread notifications, open/overdue tasks, and role  

## Not included (still later)
- Email push for notifications (in-app only for now)
- Multi-tenant company org with shared proposal pools
- Provider delivery webhooks (still blocked for manual channels)
- R2-stored PDF byte archive

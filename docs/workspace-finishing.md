# Workspace finishing pass — 24 October 2026

## Boundary

Preserves the approved spacious layout, translucent glass, native vendor logos,
Pulse solar/header design and existing permission authority. No new pages,
provider adapters, account connections, sync jobs, live messages, database
migrations, deployment configuration or frozen calculation/export changes.
Only the existing preview branch is published; production merge/manual deploy
remains separate.

## Improvements and confirmed fixes

- Shared lightweight loading skeletons for opening Home, account permission
  revalidation and gallery loading. Loading exposes `aria-busy`/status and
  honours reduced motion. Gallery clears old photos while revalidating.
- Home discards failed-feed caches, including tasks used by global search and
  quoted values. Failures are unavailable, not fictional zero counts. Session
  changes clear Home/search/notification presentation; identity/generation
  guards discard late prior-session Home responses.
- Follow-up failures remove stale actionable rows, label the count unavailable
  and offer inline Retry. Existing selected filters survive a successful retry.
- Notifications have inline Retry, correct expanded/busy state, Escape-to-close
  with focus return, outside/shortcut dismissal, duplicate-submit protection and
  a request-version guard. Event paths are preserved when Retry replaces its
  own DOM, avoiding accidental cancellation by the outside-click handler.
- Access history keeps the short timeline, with expandable actor, recipient,
  account, exact permission, recorded duration and reason where available.
  Names are resolved only from already-authorised state; missing records receive
  an honest fallback, not a guessed identity. All values remain escaped.
- Access saves expose a Saving state; refresh restores keyboard focus when the
  refresh button was replaced. Tab panels are keyboard-focusable.
- Consistent keyboard focus and 44px touch action targets; layout, fonts,
  photography and the approved transparency are otherwise unchanged.
- Recovery back-arrow failure reproduced, then fixed without force-clicking or
  weakening the old assertion. The overflowing card is top-aligned/scrollable;
  the form occupies its card rather than the entire oversized illustration.
  Both desktop and mobile arrows are reachable; navigation issues no secrets.
- Read-only preview contains clearly fictional history records. It still cannot
  save access decisions, connect providers or contact API/auth endpoints.

## Verification

All testing uses isolated fixtures/disposable local stores, never live accounts.

| Suite | Result |
| --- | --- |
| Home/notification controller race/error tests (jsdom; not authority proof) | 14 pass |
| Real authenticated access browser workflows | 28 pass |
| Read-only preview, history, themes, touch, keyboard, reduced motion | 42 pass |
| Eight-page real authenticated workflow audit | 44 pass |
| Pulse browser | 77 pass |
| Connections browser | 67 pass |
| Original spacious layout | 28 pass |
| Labels/readability | 20 pass |
| Access API: local handler + SQLite-backed Worker | 95 pass |
| Broader Studio security API + recovery browser | Pass |
| Public packaging | 25 pass |
| Role parity/frozen protection | 308 pass |

Screenshot capture in the workflow harness has the same 90-second allowance as
other browser suites for software Chromium. Assertions and normal click
behaviour are unchanged. This does not increase product request timeouts.

Real provider OAuth/linking/sync/send remains intentionally deferred until the
last functional phase. Test results do not claim live provider availability or
production deployment.

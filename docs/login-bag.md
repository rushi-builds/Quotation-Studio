# Interactive login bag (staff auth UI)

Visual reference: animated “login bag” character (Coding Stella / Visme-style **look**).  
**Implementation is 100% first-party** — no Visme embed, no `vismeforms-embed.js`, no runtime dependency on Visme.

## Modules

| File | Role |
|------|------|
| `assets/css/login-bag.css` | Layout + bag character + auth card animation |
| `assets/js/login-bag-ui.js` | **UI only** — flap, eyes, moods, loading |
| `assets/js/login-auth.js` | **Auth only** — validation + `PlatformAPI` `/api/auth/*` |
| `assets/js/dashboard.js` | Wires bag UI + auth → staff shell |
| `assets/js/platform-api.js` | HTTP client (login/register/forgot/reset) |

## Separation

```
[ login-bag-ui.js ]  ←── moods / focus / pointer
        ▲
        │ bagUi API (no network)
        │
[ login-auth.js ]  ←── validate → PlatformAPI → session
        ▲
        │ onAuthenticated({ user, token })
        │
[ dashboard.js ]   ←── showApp() / refreshAll()
```

Swap auth without touching animation: pass a custom `api` adapter to `QSLoginAuth.mount({ api })`.

## Moods (bag)

`idle` · `open` · `peek` · `cover` (password) · `happy` · `shy` / `error` · `success` · `loading`

## Explicit non-goals

- Do **not** embed Visme forms or connect submissions to Visme.
- Do **not** put API calls inside `login-bag-ui.js`.

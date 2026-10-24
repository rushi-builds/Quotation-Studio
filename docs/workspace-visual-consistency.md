# Workspace visual consistency — 24 October 2026

This is the visual pass **after** the functional finishing release `f428df1`.
The previous release's history/retry/recovery fixes are not counted as new work.

## Changes

`assets/css/workspace-fit.css` is the dashboard's last-loaded, scoped control
layer. It leaves the spacious natural-scroll layout, solar photographs,
translucent card material and colourful provider logos intact.

- Shared action geometry: 9px corners, 8px icon/text gaps, 16px action SVGs,
  38px regular and 34px compact minimum heights. Navigation tabs and logos
  retain their intentional shapes rather than turning everything into a CTA.
- Consistent primary, secondary, link and destructive-action roles. Field edges
  and muted/link text are easier to distinguish on glass in light, system and
  dark appearances. Dark hero secondary actions get their own readable
  backplate; the photograph and hero/card transparency are not flattened.
- Disabled buttons and fields use neutral, readable ink/fill/edges at opacity 1,
  not a whole-control fade. Disabled actions remain disabled: no permissions,
  handlers or provider states have been changed to make them appear available.
- Restrained pointer hover for action families, filters, tabs, header utilities,
  menus, fields and links. No new lift, glow or animation. Disabled hover cannot
  brighten or move a control. Existing reduced-motion preferences are respected.
- Visible 2px keyboard focus; coarse-pointer actions/menu entries use 44px
  minimum heights, with square icon targets enlarged accordingly.
- High-specificity Pulse subtab styles and governance disabled styles are
  explicitly reconciled with the shared tokens; checking Overview alone was
  insufficient to catch those overrides.

No provider OAuth, connections, sync, send, backend, schema, production/deploy
configuration, calculation, pricing or exported-report logic is changed.
Connection/sync wiring remains the final, separately authorised phase.

## Verification

Tests use read-only review fixtures or disposable local stores, not live
accounts. The new browser suite covers ten contexts (eight workspace pages plus
reports/publish), all seven Pulse tabs, Profile/Security/Team Settings sections,
light/system/dark, dialogs, hover, native keyboard Tab focus and 390px touch.

| Suite | Result |
| --- | --- |
| New shared-control visual regression | 212 pass |
| Read-only access preview/history/keyboard/reduced motion | 42 pass |
| Authenticated access browser | 28 pass |
| Eight-page authenticated workflows | 44 pass |
| Pulse browser | 77 pass |
| Connections browser | 67 pass |
| Original spacious layout | 28 pass |
| Labels/readability | 20 pass |
| Access API: local + SQLite-backed Worker | 95 pass |
| Public packaging, including CSS tamper rejection | 27 pass |
| Role parity, packaging and frozen protection | 309 pass |
| Scope guard and negative controls | 43 pass |

Measured control foreground/background checks target at least 4.5:1, including
selected disabled actions. The test composites alpha over black/white and
examines computed gradient stops rather than incorrectly treating an opaque
gradient as a transparent button. This is targeted regression coverage, **not**
a claim of a complete WCAG audit of every photograph/text combination.

The new review test also verifies no horizontal page overflow, natural scrolling,
zero API/auth requests and zero browser page errors. Screenshots were inspected
for the retained glass/photo treatment. Generated artifacts remain ignored:
`qa/shots/visual-consistency/accounts-{light,system,dark}.png`,
`mobile-settings.png` and `control-inventory.json`.

### Repeat

With Playwright/Chromium available in the test environment:

```sh
node qa/workspace-visual-consistency.test.cjs
node qa/public-package.test.cjs
QS_PR_BASE=f428df1712c596f1b069fea207f0972a2536377c node qa/roles-parity.test.js
QS_PR_BASE=f428df1712c596f1b069fea207f0972a2536377c node qa/pr-scope.test.cjs
```

The public packager now byte-checks `workspace-fit.css` as well as the other
tracked UI sources. A deliberate mutation of the packaged CSS must fail parity;
a successful packager exit by itself is not accepted as proof.

Publishing is limited to the existing preview branch. A main merge/manual
production deploy or live-provider smoke test is not implied by these results.

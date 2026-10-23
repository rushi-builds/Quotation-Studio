# Connections UI verification

## Reproducible asset / role parity

From a clean checkout, run either:

```sh
node qa/roles-parity.test.js
# Includes the packaging negative cases as well:
npm --prefix qa run test:roles-parity
```

No prerequisite sync is required. C5 runs the **unchanged production packager**
(`platform/cloudflare/sync-public.js`) against a disposable copy of its source
inputs, then byte-compares the fresh build to the checkout. Temporary files are
cleaned up. It does not overwrite the checkout's `public/`, generated knowledge,
configuration or database.

`platform/cloudflare/public/` is deliberately Git-ignored generated output, not a
committed mirror. A missing or stale local cache is not evidence of deployed
bytes. Do not force-add generated assets to Git. Normal production build scripts
still run `sync-public.js`; this verification does not modify deployment scripts
or prove a deployment occurred.

C5 retains the original four Dashboard asset comparisons and adds the four
Connections/Pulse assets touched by this feature. `qa/public-package.test.cjs`
proves that fresh builds work with no cache or a stale cache, while corrupted or
missing build output and a deliberately broken copy implementation still fail.
It also checks that source and cached-output bytes/mtimes remain untouched.

## Authenticated UI checks

```sh
npm --prefix qa run test:connections
npm --prefix qa run test:pulse
node qa/pr-scope.test.cjs
```

Browser checks need QA Playwright/Chromium dependencies and platform libraries.
They use disposable local stores, never production accounts or provider APIs.
Screenshots remain under ignored `qa/shots/`. Actual account linking, connection
ACLs, sync and sending are not implemented by this presentation-only slice.

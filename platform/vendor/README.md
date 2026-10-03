# Vendored OIDC verification library

`jose.mjs` is the bundled Web API entry point of **jose 6.2.12** by Filip Skokan, MIT licensed. The complete upstream license is in `jose-LICENSE.md`.

Upstream: https://github.com/panva/jose
Release package: https://registry.npmjs.org/jose/-/jose-6.2.12.tgz
NPM integrity: `sha512-9NiFmJEex0sy2Dk58j2UGBSHgUs2ypF9eZSu4L6vjOX3Dp96Sw1F3uL+H+D1sx02jZZdzUT0HgvCy59CuvXcWw==`

Bundled with esbuild 0.25.12:

```
esbuild node_modules/jose/dist/webapi/index.js --bundle --format=esm --platform=browser --target=es2022 --legal-comments=inline --outfile=jose.mjs
```

This retains the repository's existing deployment/dependency arrangement. It avoids a new runtime/package-install prerequisite for either the local JSON server or the managed Cloudflare build. The application explicitly restricts accepted ID-token signatures to RS256; exporting other upstream algorithms does not enable them in authentication.

When updating, obtain the audited upstream package, verify provenance/integrity and license, rebuild, and rerun OAuth, security and Worker bundle tests. Do not hand-edit cryptographic verification code in this generated file.

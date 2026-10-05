/* Post-merge audit (2026-10-04): static regression checks, no server needed.
   Run: node qa/audit-static.test.cjs */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0;
const t = (name, cond, extra) => {
  assert.ok(cond, `FAIL: ${name}${extra !== undefined ? ' → ' + String(extra).slice(0, 300) : ''}`);
  pass++;
  console.log('  ✓', name);
};

/* 1. Portal bearer tokens must never leak via Referer: every served HTML entry
   point carries a no-referrer policy (oauth-complete.html already had one). */
for (const file of [
  'portal.html', 'share.html', 'quotation.html', 'dashboard.html',
  'index.html', 'gallery.html', 'oauth-complete.html',
  'drop-bag-ref.html', 'preview-solar-login.html'
]) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  t(`${file} sets referrer no-referrer`,
    html.includes('name="referrer"') && html.includes('content="no-referrer"'));
}

/* 2. Dead misleading auth surface stays deleted: login.html was an unreferenced
   mockup whose fake submitter always "signed in"; login-auth.js still
   described the pre-remediation recovery-code flow and could display a reset
   secret; the bag UI/CSS it needed is equally unreferenced. */
for (const file of [
  'login.html',
  'assets/js/login-auth.js',
  'assets/js/login-bag-ui.js',
  'assets/css/login-bag.css'
]) {
  t(`${file} is removed`, !fs.existsSync(path.join(ROOT, file)));
}

/* 3. Sign-in page is offline-first: no third-party font requests that would
   expose sign-in visits or break without connectivity. */
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  t('index.html has no Google Fonts dependency',
    !html.includes('fonts.googleapis') && !html.includes('fonts.gstatic'));
  for (const weight of [400, 500, 600, 700]) {
    const font = `assets/fonts/inter-latin-${weight}-normal.woff2`;
    t(`bundled ${font} exists`, fs.existsSync(path.join(ROOT, font)));
    t(`index.html embeds @font-face for Inter ${weight}`,
      html.includes(font));
  }
}

/* 4. Security headers ship on every hosting path. */
{
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const headers = (vercel.headers || []).flatMap((h) => h.headers || []);
  const has = (k, v) => headers.some((h) => h.key === k && h.value === v);
  t('vercel.json sets X-Content-Type-Options: nosniff', has('X-Content-Type-Options', 'nosniff'));
  t('vercel.json sets Referrer-Policy: no-referrer', has('Referrer-Policy', 'no-referrer'));
  t('vercel.json keeps the /api/* worker rewrite',
    (vercel.rewrites || []).some((r) => r.source === '/api/:path*'));
}
{
  /* sync-public.js regenerates platform/studio-knowledge.mjs as a side effect;
     back it up and restore byte-for-byte so this test never dirties git. */
  const knowledge = path.join(ROOT, 'platform/studio-knowledge.mjs');
  const backup = fs.existsSync(knowledge) ? fs.readFileSync(knowledge) : null;
  try {
    execFileSync(process.execPath, ['sync-public.js'], {
      cwd: path.join(ROOT, 'platform/cloudflare'),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const headersFile = path.join(ROOT, 'platform/cloudflare/public/_headers');
    t('sync-public generates public/_headers', fs.existsSync(headersFile));
    const contents = fs.readFileSync(headersFile, 'utf8');
    t('_headers sets nosniff', contents.includes('X-Content-Type-Options: nosniff'));
    t('_headers sets referrer no-referrer', contents.includes('Referrer-Policy: no-referrer'));
  } finally {
    if (backup !== null) fs.writeFileSync(knowledge, backup);
  }
}

/* 5. Worker keeps a single implementation: index.js is an alias, not a fork. */
{
  const alias = fs.readFileSync(path.join(ROOT, 'platform/cloudflare/src/index.js'), 'utf8');
  t('index.js re-exports worker.js', /export\s*\{\s*default\s*\}\s*from\s*['"]\.\/worker\.js['"]/.test(alias));
  t('index.js carries no route logic', !alias.includes('/api/') && alias.length < 1000);
}

/* 6. QA preview server binds loopback by default (it serves the working tree). */
{
  const serve = fs.readFileSync(path.join(ROOT, 'scripts/serve.js'), 'utf8');
  t('serve.js defaults to 127.0.0.1', serve.includes("process.env.HOST || '127.0.0.1'"));
  t('serve.js no longer hard-binds 0.0.0.0', !serve.includes("'0.0.0.0'"));
}

/* 7. Throttle table ships in schema + migration (the Worker also self-creates). */
{
  const schema = fs.readFileSync(path.join(ROOT, 'platform/schema.sql'), 'utf8');
  const migration = fs.readFileSync(
    path.join(ROOT, 'platform/migrations/004-auth-throttle.sql'), 'utf8');
  t('schema.sql declares auth_throttles', schema.includes('CREATE TABLE IF NOT EXISTS auth_throttles'));
  t('migration 004 declares auth_throttles', migration.includes('CREATE TABLE IF NOT EXISTS auth_throttles'));
}

console.log(`\n${pass} passed, 0 failed`);

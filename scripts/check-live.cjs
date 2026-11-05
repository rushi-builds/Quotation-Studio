/* Is production serving the code in this checkout?

   The Worker also serves the front end (platform/cloudflare/wrangler.git.toml:
   [assets] run_worker_first), so a failed build does not break the site - it
   freezes it. The old version keeps running, the dashboard keeps showing the
   last good deployment as "success", and nobody notices until a customer sees
   last month's page. That is exactly what happened between PR #43 and PR #46:
   every Workers Builds check was red and the site was serving older bytes.

   This compares the bytes production actually serves against the bytes in the
   working tree, file by file, and says which is which.

     node scripts/check-live.cjs                      # check the live origin
     node scripts/check-live.cjs --origin http://127.0.0.1:8080   # check a local server

   Exit codes: 0 = everything matches, 1 = production is stale, 2 = could not
   reach production (a network failure is NOT reported as "stale").
*/
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_ORIGIN = 'https://qs-studio-rushi.ktmenergyexperts.workers.dev';

/* The files that decide what a customer sees and what a price works out to.
   Add to this list rather than running the whole tree: a check that fetches 200
   files will be deleted the first time it is slow. */
const FILES = [
  'index.html',
  'gallery.html',
  'quotation.html',
  'assets/js/estimate-calculator.js',
  'assets/js/equipment.js',
  'assets/js/finance.js',
  'assets/js/state.js'
];

function argv(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const origin = (argv('origin', process.env.LIVE_ORIGIN || DEFAULT_ORIGIN)).replace(/\/+$/, '');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function main() {
  console.log('live freshness — ' + origin);
  const rows = [];
  let networkErrors = 0;

  for (const file of FILES) {
    const localPath = path.join(ROOT, file);
    if (!fs.existsSync(localPath)) {
      rows.push({ file, state: 'MISSING LOCALLY', local: '-', live: '-' });
      continue;
    }
    const local = sha(fs.readFileSync(localPath));
    let live = '';
    try {
      /* The query string defeats a cached copy; static assets ignore it. */
      const res = await fetch(origin + '/' + file + '?live-check=' + Date.now(), {
        cache: 'no-store',
        redirect: 'follow',
        headers: { 'cache-control': 'no-cache' }
      });
      if (!res.ok) {
        rows.push({ file, state: 'HTTP ' + res.status, local: local.slice(0, 12), live: '-' });
        continue;
      }
      live = sha(Buffer.from(await res.arrayBuffer()));
    } catch (e) {
      networkErrors++;
      rows.push({ file, state: 'UNREACHABLE', local: local.slice(0, 12), live: '-' });
      continue;
    }
    rows.push({
      file,
      state: local === live ? 'FRESH' : 'STALE',
      local: local.slice(0, 12),
      live: live.slice(0, 12)
    });
  }

  const width = Math.max(...rows.map((r) => r.file.length));
  for (const r of rows) {
    console.log('  ' + r.state.padEnd(15) + r.file.padEnd(width + 2) + 'repo ' + r.local + '  live ' + r.live);
  }

  const stale = rows.filter((r) => r.state === 'STALE');
  const broken = rows.filter((r) => r.state !== 'FRESH' && r.state !== 'STALE');

  if (stale.length || broken.length) {
    console.log('');
    if (stale.length) {
      console.log('STALE: production is serving ' + stale.length + ' of ' + FILES.length + ' checked files from an older build.');
      console.log('        The Worker is up, so the site looks fine — it is simply not this code.');
      console.log('        Redeploy: cd platform/cloudflare && npm run deploy');
    }
    if (broken.length) console.log('INCOMPLETE: ' + broken.length + ' file(s) could not be compared (see the state column).');
    process.exitCode = networkErrors === rows.length ? 2 : 1;
    return;
  }

  console.log('\nFRESH: production is serving this checkout, file for file.');
}

main().catch((e) => {
  console.error('live check failed:', e && e.message);
  process.exitCode = 2;
});

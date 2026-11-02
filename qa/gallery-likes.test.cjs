/* Public gallery likes — backend contract.
 *
 * The portfolio page is the only public surface where a visitor can write
 * without an account, so the rules around it are checked here rather than in
 * the browser suite: no staff session needed, one like per visitor per
 * project, and counts that always come from stored rows.
 *
 * Static checks always run. When QA_BASE points at a running server the same
 * rules are exercised over HTTP as well.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const worker = read('platform/cloudflare/src/worker.js');
const local = read('platform/local-server/server.js');
const client = read('assets/js/gallery-likes.js');
const migration = read('platform/migrations/012-gallery-likes.sql');
const migrationFeedback = read('platform/migrations/013-gallery-feedback.sql');
const page = read('gallery.html');

const checks = [];
function check(name, fn) { checks.push({ name, fn }); }

/* ---------- both backends expose the route ---------- */

check('Cloudflare Worker serves GET and POST /api/gallery/likes', () => {
  assert.match(worker, /parts\[0\] === 'gallery' && parts\[1\] === 'likes'[\s\S]{0,80}'GET' \|\| method === 'POST'/);
});

check('local server serves GET and POST /api/gallery/likes', () => {
  assert.match(local, /parts\[0\] === 'gallery' && parts\[1\] === 'likes'/);
});

check('the likes route precedes the staff gate in both servers', () => {
  const workerRoute = worker.indexOf("parts[0] === 'gallery' && parts[1] === 'likes'");
  const workerGate = worker.indexOf('/* Staff session required below */');
  assert.ok(workerRoute > 0 && workerRoute < workerGate, 'worker: likes must be public');

  const localRoute = local.indexOf("parts[0] === 'gallery' && parts[1] === 'likes'");
  const localGate = local.indexOf('Everything below needs a staff session');
  assert.ok(localRoute > 0 && localRoute < localGate, 'local: likes must be public');
});

check('the route is not reachable past the staff gate in the local server', () => {
  const localGate = local.indexOf('Everything below needs a staff session');
  const after = local.slice(localGate);
  assert.ok(!/parts\[0\] === 'gallery' && parts\[1\] === 'likes'/.test(after),
    'no second, gated copy of the likes route');
});

/* ---------- one like per visitor per project ---------- */

check('the table keys a like by project and visitor', () => {
  assert.match(worker, /CREATE TABLE IF NOT EXISTS gallery_likes[\s\S]*PRIMARY KEY \(project_id, visitor_id\)/);
  assert.match(migration, /PRIMARY KEY \(project_id, visitor_id\)/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS gallery_likes_visitor/);
});

check('a repeat like is ignored, not counted twice', () => {
  assert.match(worker, /INSERT OR IGNORE INTO gallery_likes/);
  const localPush = local.indexOf('if (liked && !existing)');
  assert.ok(localPush > 0, 'local server checks for an existing row before pushing');
});

check('counting is done from stored rows, not a running total in the page', () => {
  assert.match(worker, /SELECT project_id, COUNT\(\*\) AS n FROM gallery_likes/);
  assert.match(local, /db\.galleryLikes\.filter\(l => l\.project_id === id\)\.length/);
  assert.ok(!/like-count[^\n]*\+=/.test(read('assets/js/gallery.js')), 'no client-side count arithmetic');
});

/* ---------- identity ---------- */

check('visitor ids are random and anonymous in both servers', () => {
  for (const [label, source] of [['worker', worker], ['local', local]]) {
    assert.match(source, /\[\^a-z0-9\]|\^\[a-z0-9\]\{16,40\}\$/i, label + ': visitor id is validated');
    assert.ok(!/visitor[^\n]*req\.(headers\[['"]x-forwarded-for|url)/i.test(source), label + ': no IP-derived identity');
  }
  assert.match(client, /\^\[a-z0-9\]\{16,40\}\$/);
  assert.match(client, /getRandomValues/);
  assert.match(client, /qs_gallery_visitor/);
});

check('project ids are validated before they touch the database', () => {
  assert.match(worker, /\^\[a-z0-9\]\[a-z0-9_-\]\{2,79\}\$/);
  assert.match(local, /\^\[a-z0-9\]\[a-z0-9_-\]\{2,79\}\$/);
  assert.match(client, /X-Gallery-Visitor/);
});

/* ---------- the page ---------- */

check('the page loads the likes script and gives every card a like button', () => {
  assert.match(page, /assets\/js\/gallery-likes\.js/);
  assert.match(page, /assets\/js\/gallery\.js/);
  const js = read('assets/js/gallery.js');
  assert.match(js, /aria-pressed/);
  assert.match(js, /Like this project/);
});

check('counts come from the server response, never invented', () => {
  const js = read('assets/js/gallery.js');
  assert.match(js, /GalleryLikes\.fetchCounts|L\.fetchCounts/);
  assert.match(js, /state\.available === false/);
  assert.match(js, /is-offline/);
  assert.match(client, /function canReachApi/);
});

/* ---------- feedback ---------- */

check('both backends store gallery feedback behind the same public route', () => {
  assert.match(worker, /parts\[0\] === 'gallery' && parts\[1\] === 'feedback'/);
  assert.match(local, /parts\[0\] === 'gallery' && parts\[1\] === 'feedback'/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS gallery_feedback/);
  assert.match(migrationFeedback, /CREATE TABLE IF NOT EXISTS gallery_feedback/);
});

check('a note is capped, sanitised and rate-limited server-side', () => {
  for (const [label, source] of [['worker', worker], ['local', local]]) {
    assert.match(source, /1,000 characters/, label + ': length cap');
    assert.match(source, /plain text/, label + ': control characters refused');
    assert.ok(/gallery_feedback[^\n]*created_at >= \?|visitor_id === visitor && f\.created_at >= since/.test(source), label + ': per-visitor rate window');
  }
});

check('feedback is never rendered back to visitors', () => {
  const js = read('assets/js/gallery.js');
  assert.ok(!/gallery\/feedback\?|fetch\([^)]*gallery\/feedback/.test(js), 'the page only POSTs a note');
  assert.match(read('assets/js/gallery-likes.js'), /method: 'POST'[\s\S]{0,120}feedback|feedback[\s\S]{0,600}method: 'POST'/);
});

/* ---------- optional live smoke test ---------- */

async function live(base) {
  const idA = 'qa-gallery-test-project__1-kwp';
  const idB = 'qa-gallery-test-project-b__2-kwp';
  const visitor = 'qa' + 'a1b2c3d4e5f6g7h8'.replace(/[^a-z0-9]/g, '');
  const call = async (method, qs, body, who) => {
    const res = await fetch(base + '/api/gallery/likes' + (qs || ''), {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, who ? { 'X-Gallery-Visitor': who } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const cleanup = async () => { await call('POST', '', { id: idA, liked: false }, visitor); await call('POST', '', { id: idB, liked: false }, visitor); };
  await cleanup();

  const first = await call('POST', '', { id: idA, liked: true }, visitor);
  assert.equal(first.status, 200);
  assert.equal(first.body.count, 1, 'first like counts once');

  const again = await call('POST', '', { id: idA, liked: true }, visitor);
  assert.equal(again.body.count, 1, 're-opening and liking again must not add a second like');

  const other = await call('POST', '', { id: idA, liked: true }, 'qa' + 'b2c3d4e5f6g7h8i9');
  assert.equal(other.body.count, 2, 'a different visitor is a different like');

  const listed = await call('GET', '?ids=' + encodeURIComponent([idA, idB].join(',')), null, visitor);
  assert.equal(listed.body.counts[idA], 2);
  assert.equal(listed.body.counts[idB], 0);
  assert.deepEqual(listed.body.mine, [idA]);

  const unliked = await call('POST', '', { id: idA, liked: false }, visitor);
  assert.equal(unliked.body.count, 1, 'unlike removes only this visitor row');

  const anon = await call('POST', '', { id: idA, liked: true }, null);
  assert.equal(anon.status, 400, 'a request with no visitor id is refused');

  const bad = await call('POST', '', { id: 'no', liked: true }, visitor);
  assert.equal(bad.status, 400, 'a malformed project id is refused');

  await call('POST', '', { id: idA, liked: false }, 'qa' + 'b2c3d4e5f6g7h8i9');
  await cleanup();
  const empty = await call('GET', '?ids=' + encodeURIComponent(idA), null, visitor);
  assert.equal(empty.body.counts[idA], 0, 'cleanup leaves no test likes behind');

  /* ---- feedback ---- */
  const note = async (body, who) => {
    const res = await fetch(base + '/api/gallery/feedback', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, who ? { 'X-Gallery-Visitor': who } : {}),
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const sent = await note({ message: 'QA note: the detail view reads well.', name: 'QA', rating: 4, project: idB }, visitor);
  assert.equal(sent.status, 201, 'a note is accepted');
  assert.ok(/^gfb_/.test(sent.body.id || ''), 'the note gets its own id');

  const tooShort = await note({ message: 'hi' }, visitor);
  assert.equal(tooShort.status, 400, 'a two-word note is refused');

  const tooLong = await note({ message: 'x'.repeat(1200) }, visitor);
  assert.equal(tooLong.status, 400, 'a note over the cap is refused');

  const nameless = await note({ message: 'no name needed here' }, null);
  assert.equal(nameless.status, 400, 'a note with no visitor id is refused');

  const badProject = await note({ message: 'valid words here', project: 'no' }, visitor);
  assert.equal(badProject.status, 400, 'a malformed project id is refused');
}

(async () => {
  let failed = 0;
  for (const { name, fn } of checks) {
    try { fn(); console.log('  ok   ' + name); }
    catch (err) { failed++; console.error('  FAIL ' + name + '\n       ' + err.message); }
  }
  const base = (process.env.QA_BASE || '').replace(/\/$/, '');
  if (base) {
    try { await live(base); console.log('  ok   live likes + feedback API (persistence, dedupe, unlike, 400s)'); }
    catch (err) { failed++; console.error('  FAIL live likes API\n       ' + err.message); }
  } else {
    console.log('  skip live likes API (set QA_BASE=http://127.0.0.1:8787 to run it)');
  }
  if (failed) { console.error('\n' + failed + ' gallery like check(s) failed'); process.exit(1); }
  console.log('\n' + checks.length + ' gallery like checks passed' + (base ? ' + live API' : ''));
})();

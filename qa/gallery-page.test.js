/* Public gallery: real saved likes, share, project detail and the footer claim.
   QA_BASE=http://127.0.0.1:8787 node qa/gallery-page.test.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
let passed = 0;
const check = (name, ok) => { assert(ok, name); passed++; console.log('  ✓ ' + name); };

(async () => {
  const base = process.env.QA_BASE || 'http://127.0.0.1:8080';
  const { default: chromium } = await import('@sparticuz/chromium');
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args.filter(a => a !== '--single-process'), headless: true });
  const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
  const errors = [];
  const watch = (page) => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      /* The QA server runs without a signed-in user; its API answers 401 to
         the app's own probes. Real page errors still fail. */
      if (/status of 401/.test(m.text()) && /\/api\//.test(m.location().url || '')) return;
      errors.push(m.text() + ' [' + (m.location().url || '') + ']');
    });
  };

  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage(); watch(page);
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(base + '/gallery.html', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#galleryProjects article');

    const shape = await page.evaluate(() => ({
      cards: document.querySelectorAll('#galleryProjects article').length,
      projects: PROJECTS.length,
      likes: document.querySelectorAll('#galleryProjects [data-like]').length,
      shares: document.querySelectorAll('#galleryProjects [data-share]').length,
      hero: document.getElementById('heroProjectCount').textContent,
      capacity: document.getElementById('heroCapacity').textContent,
      count: document.getElementById('galleryCount').textContent,
      complete: [...document.querySelectorAll('#galleryProjects article')].every(c => c.querySelector('.like-count') && c.querySelector('.project-photo img').getAttribute('src'))
    }));
    check('every published project is one card with a like and a share control', shape.cards === shape.projects && shape.likes === shape.cards && shape.shares === shape.cards && shape.complete, JSON.stringify(shape));
    check('hero figures come from the published list, not typed-in numbers', shape.hero === String(shape.projects) && /kWp|MWp/.test(shape.capacity));
    check('the visible count states the same number', shape.count.startsWith(String(shape.projects)));

    /* ---- likes are real, saved and one per visitor ---- */
    const first = await page.$eval('#galleryProjects article', c => c.getAttribute('data-id'));
    const sel = (id) => '[data-id="' + id + '"]';
    const likeState = () => page.$eval(sel(first) + ' [data-like]', b => ({ pressed: b.getAttribute('aria-pressed'), count: Number(b.querySelector('.like-count').textContent) }));
    const serverState = async (id) => page.evaluate(async (projectId) => {
      const res = await fetch('/api/gallery/likes?ids=' + encodeURIComponent(projectId), { cache: 'no-store' });
      return res.json();
    }, id);

    /* Start from a known state: with a warm local database the same browser id
       may already have liked this project, which would invert every delta. */
    if ((await likeState()).pressed === 'true') {
      await page.click(sel(first) + ' [data-like]');
      await page.waitForFunction((id) => document.querySelector('[data-id="' + id + '"] [data-like]').getAttribute('aria-pressed') === 'false', { timeout: 15000 }, first);
    }
    const before = await likeState();
    await page.click(sel(first) + ' [data-like]');
    await page.waitForFunction((id) => {
      const btn = document.querySelector('[data-id="' + id + '"] [data-like]');
      return btn && btn.getAttribute('aria-pressed') === 'true';
    }, { timeout: 15000 }, first);
    const after = await likeState();
    check('a like is sent to the server and painted', after.pressed === 'true' && after.count === before.count + 1, JSON.stringify({ before, after }));
    const spoken = await page.$eval(sel(first) + ' [data-like]', b => b.getAttribute('aria-label'));
    check('the like button announces the saved count', new RegExp('\\(\\d+ likes?\\)').test(spoken), spoken);
    const hearts = await page.waitForSelector(sel(first) + ' .heart-burst i', { timeout: 4000 }).then(() => true).catch(() => false);
    check('the hearts animation runs on a like', hearts && await page.$$eval(sel(first) + ' .heart-burst i', els => els.length >= 4));

    const saved = await serverState(first);
    check('the saved count is the server count, not a page-local number', saved.counts[first] === after.count && saved.mine.includes(first), JSON.stringify(saved));

    /* Reload = a second visit by the same person: still one like, not two. */
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#galleryProjects article');
    await page.waitForFunction((id) => {
      const btn = document.querySelector('[data-id="' + id + '"] [data-like]');
      return btn && btn.getAttribute('aria-pressed') === 'true';
    }, { timeout: 15000 }, first).catch(() => {});
    const reloaded = await likeState();
    check('reopening the page keeps the like and does not double it', reloaded.pressed === 'true' && reloaded.count === after.count, JSON.stringify({ before, after, reloaded }));

    /* A second browser is a second visitor: sees the count, likes once more. */
    const other = await browser.createBrowserContext();
    const visitor2 = await other.newPage(); watch(visitor2);
    await visitor2.goto(base + '/gallery.html', { waitUntil: 'networkidle0' });
    await visitor2.waitForSelector('#galleryProjects article');
    const seen = await visitor2.waitForFunction((id) => {
      const btn = document.querySelector('[data-id="' + id + '"] [data-like]');
      return btn && Number(btn.querySelector('.like-count').textContent) > 0 ? { pressed: btn.getAttribute('aria-pressed'), count: Number(btn.querySelector('.like-count').textContent) } : null;
    }, { timeout: 15000 }, first).then(h => h.jsonValue());
    check('another visitor sees the same count but has not liked it', seen.count === after.count && seen.pressed === 'false', JSON.stringify(seen));
    await visitor2.click(sel(first) + ' [data-like]');
    const seenAfter = await visitor2.waitForFunction((id) => {
      const btn = document.querySelector('[data-id="' + id + '"] [data-like]');
      return btn && btn.getAttribute('aria-pressed') === 'true' ? Number(btn.querySelector('.like-count').textContent) : null;
    }, { timeout: 15000 }, first).then(h => h.jsonValue());
    check('a second visitor adds exactly one like', seenAfter === after.count + 1, String(seenAfter));

    /* Unlike removes it again, on the server too. */
    await page.click(sel(first) + ' [data-like]');
    await page.waitForFunction((id) => document.querySelector('[data-id="' + id + '"] [data-like]').getAttribute('aria-pressed') === 'false', { timeout: 15000 }, first);
    const unliked = await likeState();
    const savedAfterUnlike = await serverState(first);
    check('unliking removes the saved like', unliked.pressed === 'false' && unliked.count === after.count - 1 && savedAfterUnlike.counts[first] === unliked.count && !savedAfterUnlike.mine.includes(first), JSON.stringify({ unliked, savedAfterUnlike }));
    await other.close();

    /* ---- project detail ---- */
    await page.click(sel(first) + ' .project-photo');
    await page.waitForFunction(() => document.getElementById('photoViewer').open);
    const detail = await page.evaluate(() => {
      const dlg = document.getElementById('photoViewer');
      return {
        name: dlg.querySelector('h2').textContent,
        tags: [...dlg.querySelectorAll('.detail-tags span')].map(s => s.textContent),
        summary: dlg.querySelector('.detail-summary').textContent,
        points: dlg.querySelectorAll('.detail-points li').length,
        date: dlg.querySelector('.detail-tags .date').textContent,
        img: dlg.querySelector('img').getAttribute('src'),
        hash: location.hash,
        like: !!dlg.querySelector('[data-like]'),
        share: !!dlg.querySelector('[data-detail-share]')
      };
    });
    const project = await page.evaluate((id) => {
      const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      return PROJECTS.find((p) => slug(p.name) + '__' + slug(p.capacity) === id);
    }, first);
    check('opening a project shows its own name, capacity, location and install date',
      detail.name === project.name &&
      detail.tags.some(t => t.includes(project.capacity)) &&
      detail.tags.some(t => t.includes(project.location)) &&
      /* The stored install date is a placeholder until the backend supplies the
         real one, so this checks the shape rather than today's value. */
      /^Installed \d{2}\/\d{2}\/\d{4}$/.test(detail.date), JSON.stringify(detail));
    check('the detail copy is written for that project and lists its scope',
      detail.summary.length > 80 && detail.summary.includes(project.capacity) && detail.points >= 4,
      JSON.stringify({ summary: detail.summary.slice(0, 120), points: detail.points }));
    check('the detail view can like and share the same project', detail.like && detail.share);

    /* The photograph is the point of the detail view; a stray display:none on a
       dialog id once hid it while every text assertion still passed. */
    const media = await page.evaluate(() => {
      const img = document.querySelector('#photoViewer .detail-media img');
      const r = img.getBoundingClientRect();
      return { display: getComputedStyle(img).display, w: Math.round(r.width), h: Math.round(r.height) };
    });
    check('the project photograph is actually visible in the detail view', media.display !== 'none' && media.w > 200 && media.h > 120, JSON.stringify(media));
    check('the shared link carries the project id', detail.hash === '#p-' + first, detail.hash);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('photoViewer').open);
    check('Escape closes the detail view and clears the hash', await page.evaluate(() => location.hash === ''));

    /* Deep link: a shared URL opens straight on that project. */
    const shared = base + '/gallery.html#p-' + encodeURIComponent(first);
    const linkPage = await context.newPage(); watch(linkPage);
    await linkPage.goto(shared, { waitUntil: 'networkidle0' });
    await linkPage.waitForFunction(() => { const d = document.getElementById('photoViewer'); return d && d.open && !!d.querySelector('h2'); }, { timeout: 15000 });
    check('a shared project link opens that project directly', await linkPage.$eval('#photoViewer h2', (e, name) => e.textContent === name, project.name));

    /* Share uses the OS sheet and passes exactly this project. */
    await linkPage.evaluate(() => { window.__shared = null; navigator.share = (payload) => { window.__shared = payload; return Promise.resolve(); }; });
    await linkPage.click('#photoViewer [data-detail-share]');
    const sharedPayload = await linkPage.evaluate(() => window.__shared);
    check('sharing passes this project’s link to the share sheet',
      !!sharedPayload && sharedPayload.url.endsWith('#p-' + first) && sharedPayload.title.includes(project.name),
      JSON.stringify(sharedPayload));
    await linkPage.screenshot({ path: path.join(shots, 'gallery-detail.png') });
    await linkPage.close();

    /* ---- filters, footer, mobile ---- */
    await page.click('#galleryFilters button:nth-child(2)');
    const filtered = await page.evaluate(() => ({
      cards: document.querySelectorAll('#galleryProjects article').length,
      expected: PROJECTS.filter(p => p.sector === SECTORS[0]).length
    }));
    check('the sector filter still narrows the real list', filtered.cards === filtered.expected, JSON.stringify(filtered));
    await page.click('#galleryFilters button:first-child');

    const footer = await page.evaluate(() => {
      const f = document.querySelector('footer');
      return { text: f.textContent, year: document.getElementById('galleryYear').textContent, links: f.querySelectorAll('a').length };
    });
    check('the footer makes the no-copyright claim explicit', /No copyright claim/i.test(footer.text) && /respective owner/i.test(footer.text) && footer.links >= 1);
    check('the footer year is the current one', footer.year === String(new Date().getFullYear()), footer.year);

    await page.screenshot({ path: path.join(shots, 'gallery-desktop.png'), fullPage: false });
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    check('mobile keeps the grid inside the viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(shots, 'gallery-mobile.png') });

    check('no runtime or console errors: ' + errors.join('; '), errors.length === 0);
    await context.close();
    console.log(`\n${passed} passed, 0 failed`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

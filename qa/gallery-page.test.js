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
      /* Press photographs are hosted on the WordPress site. A sandbox or a
         flaky network can refuse that connection; the page then draws its own
         named fallback frame, which is handled, not an error of this page. */
      const where = m.location().url || '';
      if (/Failed to load resource/.test(m.text()) && /^https?:\/\//.test(where) && !where.startsWith(base)) return;
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
    check('a like answers with exactly three drifting hearts',
      hearts && await page.$$eval(sel(first) + ' .heart-burst i', els => els.length === 3));

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
    /* The second visitor's like is still there, so removing ours leaves their
       count: seenAfter - 1, not the count from before their visit. */
    check('unliking removes only this visitor’s saved like', unliked.pressed === 'false' && unliked.count === seenAfter - 1 && savedAfterUnlike.counts[first] === unliked.count && !savedAfterUnlike.mine.includes(first), JSON.stringify({ seenAfter, unliked, savedAfterUnlike }));
    await other.close();

    /* ---- project detail ---- */
    await page.click(sel(first) + ' .project-photo');
    await page.waitForFunction(() => document.getElementById('photoViewer').open);
    const detail = await page.evaluate(() => {
      const dlg = document.getElementById('photoViewer');
      return {
        name: dlg.querySelector('h2').textContent,
        tags: [...dlg.querySelectorAll('.detail-tags .tag')].map(s => s.textContent),
        summary: dlg.querySelector('.detail-summary').textContent,
        points: dlg.querySelectorAll('.detail-points li').length,
        date: dlg.querySelector('.detail-tags .tag.date').textContent,
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
      /^Installed \d{2}\/\d{2}\/\d{4}/.test(detail.date), JSON.stringify(detail));
    check('the detail copy is written for that project and lists its scope',
      detail.summary.length > 80 && detail.summary.includes(project.capacity) && detail.points >= 4,
      JSON.stringify({ summary: detail.summary.slice(0, 120), points: detail.points }));
    check('the detail view can like and share the same project', detail.like && detail.share);

    /* The photograph is the point of the detail view; a stray display:none on a
       dialog id once hid it while every text assertion still passed. */
    const media = await page.evaluate(() => {
      const img = document.getElementById('largePhoto');
      const r = img.getBoundingClientRect();
      return { display: getComputedStyle(img).display, w: Math.round(r.width), h: Math.round(r.height) };
    });
    check('the project photograph is actually visible in the detail view', media.display !== 'none' && media.w > 200 && media.h > 120, JSON.stringify(media));
    check('the shared link carries the project id', detail.hash === '#p-' + first, detail.hash);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('photoViewer').open);
    /* The hash is cleared by the dialog's own close event, which is dispatched
       after the open attribute is removed - so wait for it, do not race it. */
    const hashCleared = await page.waitForFunction(() => location.hash === '', { timeout: 5000 })
      .then(() => true).catch(() => false);
    check('Escape closes the detail view and clears the hash', hashCleared, await page.evaluate(() => location.hash));

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

    /* ---- feedback, from the project and from the page ---- */
    const detailFeedbackBtn = await linkPage.$('#photoViewer [data-detail-feedback]').catch(() => null);
    check('the detail view offers feedback next to like and share', !!detailFeedbackBtn);
    await linkPage.click('#photoViewer [data-detail-feedback]');
    await linkPage.waitForFunction(() => document.getElementById('feedbackBox').open);
    const feedbackCopy = await linkPage.evaluate(() => ({
      title: document.getElementById('feedbackTitle').textContent,
      lede: document.getElementById('feedbackLede').textContent,
      stars: document.querySelectorAll('#feedbackBox [data-star]').length
    }));
    check('the feedback form names the project and offers an optional rating',
      feedbackCopy.title.length > 8 && feedbackCopy.lede.includes(project.name.replace(/\.$/, '')) && feedbackCopy.stars === 5,
      JSON.stringify(feedbackCopy));

    /* An empty note is refused in the page, without a round trip. */
    await linkPage.click('#feedbackBox #feedbackSend');
    const emptyError = await linkPage.$eval('#feedbackError', e => (e.hidden ? '' : e.textContent)).catch(() => '');
    check('an empty note is refused with a reason, not sent', /few words/i.test(emptyError), emptyError);

    await linkPage.click('#feedbackBox [data-star="4"]');
    const starBits = await linkPage.waitForSelector('#feedbackBox .star-burst .star-bit', { timeout: 4000 })
      .then(() => linkPage.$$eval('#feedbackBox .star-burst .star-bit', els => els.length)).catch(() => 0);
    check('a rating throws coloured stars', starBits >= 6, String(starBits));
    await linkPage.click('#feedbackBox [data-star="5"]');
    const party = await linkPage.waitForSelector('#feedbackBox .star-burst .star-party', { timeout: 4000 })
      .then(() => true).catch(() => false);
    check('five stars let the party popper go', party);
    await linkPage.type('#feedbackBox #feedbackName', 'QA visitor');
    await linkPage.type('#feedbackBox #feedbackMessage', 'The detail view is clear and the photographs show the work properly.');
    const posted = [];
    linkPage.on('request', r => { if (r.url().includes('/api/gallery/feedback')) posted.push({ method: r.method(), body: r.postData() }); });
    await linkPage.click('#feedbackBox #feedbackSend');
    const thanked = await linkPage.waitForFunction(() => {
      const el = document.querySelector('#feedbackBox .feedback-thanks');
      return !!el && /Thank you for your valuable feedback/i.test(el.textContent);
    }, { timeout: 15000 }).then(() => true).catch(() => false);
    check('a stored note is answered with a thank-you', thanked);
    const feedbackClosed = await linkPage.waitForFunction(() => !document.getElementById('feedbackBox').open, { timeout: 15000 }).then(() => true).catch(() => false);
    check('sending a note saves it and closes the form', feedbackClosed && posted.length === 1 && posted[0].method === 'POST', JSON.stringify(posted));
    const sentBody = posted.length ? JSON.parse(posted[0].body) : {};
    check('the note carries the project id and the chosen rating', sentBody.project === first && sentBody.rating === 5 && /detail view is clear/.test(sentBody.message), JSON.stringify(sentBody));
    /* The thank-you lives inside the card, not in a toast that outlives it. */
    const strayToast = await linkPage.evaluate(() => {
      const t = document.querySelector('.gallery-toast');
      return !!(t && t.classList.contains('is-on'));
    });
    check('the thank-you is shown in the form, not as a stray toast', !strayToast);
    await linkPage.close();

    /* ---- filters, footer, mobile ---- */
    await page.click('#galleryFilters button:nth-child(2)');
    const filtered = await page.evaluate(() => ({
      cards: document.querySelectorAll('#galleryProjects article').length,
      expected: PROJECTS.filter(p => p.sector === SECTORS[0]).length
    }));
    check('the sector filter still narrows the real list', filtered.cards === filtered.expected, JSON.stringify(filtered));

    /* The sector used to ride on the photograph as a pill and covered the top
       of every image; nothing may sit over the photo except the hover hint. */
    const overlays = await page.evaluate(() => [...document.querySelectorAll('#galleryProjects .project-photo')]
      .flatMap(p => [...p.children].filter(c => !c.matches('img') && !c.matches('.open-hint')).map(c => c.className || c.tagName)));
    check('no label is drawn over the project photographs', overlays.length === 0, overlays.join(','));
    await page.click('#galleryFilters button:first-child');

    const pageFeedbackBtn = await page.$('#pageFeedback');
    check('the page itself offers a feedback entry point', !!pageFeedbackBtn);
    if (pageFeedbackBtn) {
      await pageFeedbackBtn.click();
      await page.waitForFunction(() => document.getElementById('feedbackBox').open);
      const generic = await page.$eval('#feedbackLede', e => e.textContent);
      check('the page-level form is about the page, not a project', !/About /.test(generic), generic);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('feedbackBox').open);
    }

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

    /* ---- no API: say "unknown", never an invented zero ----
       The Vercel preview rewrites /api to a Worker that may not carry this
       route yet; the page must then show that the count is unknown instead of
       claiming nobody has liked anything. */
    const offline = await context.newPage();
    await offline.setRequestInterception(true);
    offline.on('request', (req) => {
      if (req.url().includes('/api/gallery/likes')) return req.respond({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' });
      return req.continue();
    });
    await offline.goto(base + '/gallery.html', { waitUntil: 'networkidle0' });
    await offline.waitForSelector('#galleryProjects article');
    const offlineState = await offline.waitForFunction(() => {
      const btn = document.querySelector('#galleryProjects [data-like]');
      return btn && btn.classList.contains('is-offline')
        ? { text: btn.querySelector('.like-count').textContent, label: btn.getAttribute('aria-label'), title: btn.getAttribute('title') }
        : null;
    }, { timeout: 15000 }).then(h => h.jsonValue()).catch(() => null);
    check('with no likes API the card says the count is unknown, not 0',
      !!offlineState && offlineState.text === '–' && /unavailable/i.test(offlineState.label), JSON.stringify(offlineState));
    await offline.click('#galleryProjects [data-like]');
    const offlineToast = await offline.waitForSelector('.gallery-toast.is-on', { timeout: 5000 }).then(e => e.evaluate(n => n.textContent)).catch(() => '');
    check('pressing like offline explains itself instead of failing silently',
      /live site|offline/i.test(offlineToast), offlineToast);
    await offline.close();

    check('no runtime or console errors: ' + errors.join('; '), errors.length === 0);
    await context.close();
    console.log(`\n${passed} passed, 0 failed`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

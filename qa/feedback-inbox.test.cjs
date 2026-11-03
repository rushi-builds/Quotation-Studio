/* Feedback inbox — project notes and quotation ratings in one list.
   Runs against a disposable LOCAL platform server (temp data directory), so it
   never touches production, real accounts or the live D1 database. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

(async () => {
  const root = path.resolve(__dirname, '..');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-inbox-'));
  const port = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
  const base = 'http://127.0.0.1:' + port;
  let server;
  let fails = 0;
  const check = (name, condition, extra) => {
    console.log('  ' + (condition ? 'ok  ' : 'FAIL') + ' ' + name + (condition ? '' : ' :: ' + (extra || '')));
    if (!condition) fails += 1;
  };

  try {
    server = spawn(process.execPath, ['platform/local-server/server.js'], {
      cwd: root,
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', QS_DATA_DIR: data, OWNER_EMAIL: 'unused@local.invalid', ADMIN_EMAIL: 'unused-admin@local.invalid' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local server did not start')), 15000);
      server.stdout.on('data', (chunk) => { if (chunk.toString().includes('http://')) { clearTimeout(timer); resolve(); } });
      server.once('exit', (code) => { clearTimeout(timer); reject(new Error('server exited ' + code)); });
    });

    const req = async (method, url, body, auth, extraHeaders) => {
      const res = await fetch(base + url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: 'Bearer ' + auth } : {}),
          ...(extraHeaders || {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) { json = null; }
      return { status: res.status, json, text, headers: res.headers };
    };

    /* ---- fixture: one owner, one member who must not see the owner's notes ---- */
    const owner = await req('POST', '/api/auth/register', { name: 'Inbox Owner', email: 'inbox-owner@local.invalid', password: 'LocalFixture123!', role: 'owner' });
    const member = await req('POST', '/api/auth/register', { name: 'Inbox Member', email: 'inbox-member@local.invalid', password: 'LocalFixture123!', role: 'sales' });
    assert.equal(owner.status, 201);
    assert.equal(owner.json.user.role, 'viewer', 'public signup never grants a role');
    const dbPath = path.join(data, 'db.json');
    const seed = JSON.parse(fs.readFileSync(dbPath));
    seed.users.forEach((user) => {
      user.role = user.id === owner.json.user.id ? 'owner' : 'viewer';
      user.profile_done = 1;
      user.phone = '+919000000000';
    });
    fs.writeFileSync(dbPath, JSON.stringify(seed));
    const ownerToken = owner.json.token;
    const memberToken = member.json.token;

    /* ---- a quotation with two customer notes ---- */
    const created = await req('POST', '/api/proposals', {
      form: { custName: 'Sunrise Textiles', capacity: '250', propRef: 'INBOX-QA-001', companyName: 'KTM Energy Experts', companyPhone: '+919000000000' },
      status: 'ready'
    }, ownerToken);
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const proposalId = created.json.proposal.id;
    const published = await req('POST', '/api/proposals/' + proposalId + '/publish', { label: 'Inbox test link', expiresInDays: 1 }, ownerToken);
    assert.equal(published.status, 201, JSON.stringify(published.json));
    const accessToken = published.json.access.token;

    const first = await req('POST', '/api/portal/feedback', {
      token: accessToken, submissionId: 'inbox_fixture_submission_01', rating: 5,
      comment: 'The layout and the savings look right. Please proceed.', nextStep: 'interested', contactRequested: false
    });
    assert.equal(first.status, 201, JSON.stringify(first.json));
    const second = await req('POST', '/api/portal/feedback', {
      token: accessToken, submissionId: 'inbox_fixture_submission_02', rating: 2,
      comment: 'Roof area looks smaller than measured. Can we discuss?', nextStep: 'changes', contactRequested: true
    });
    assert.equal(second.status, 201, JSON.stringify(second.json));

    /* ---- project notes and likes from the public gallery ---- */
    const visitor = 'feedfacecafebeef0123456789abcdef';
    const projectId = 'reachglobal-india-pvt-ltd__350-kwp';
    const projectNote = await req('POST', '/api/gallery/feedback', {
      message: 'Clean rooftop work, and the full photo in the detail view is a nice touch.',
      name: 'Ravi Patil', project: projectId, rating: 4
    }, null, { 'X-Gallery-Visitor': visitor });
    assert.equal(projectNote.status, 201, JSON.stringify(projectNote.json));
    const pageNote = await req('POST', '/api/gallery/feedback', {
      message: 'The page itself is easy to browse on a phone.'
    }, null, { 'X-Gallery-Visitor': visitor });
    assert.equal(pageNote.status, 201);
    for (const id of [projectId, 'grp-limited__1-000-kwp', 'grp-limited__1-000-kwp']) {
      await req('POST', '/api/gallery/likes', { id, liked: true }, null, { 'X-Gallery-Visitor': visitor });
    }

    /* ---- the inbox ---- */
    const inbox = await req('GET', '/api/feedback', null, ownerToken);
    check('the inbox answers for a signed-in owner', inbox.status === 200 && Array.isArray(inbox.json.items), JSON.stringify(inbox.json).slice(0, 160));
    const items = inbox.json.items || [];
    check('both sources land in one list', items.filter((i) => i.source === 'quotation').length === 2 && items.filter((i) => i.source === 'project').length === 2, String(items.length));
    check('newest note comes first', Date.parse(items[0].createdAt) >= Date.parse(items[items.length - 1].createdAt));

    const quoteItem = items.find((i) => i.source === 'quotation' && i.rating === 2);
    check('a quotation note carries its quotation and customer', !!quoteItem && quoteItem.proposal.id === proposalId && /Sunrise Textiles/.test(quoteItem.proposal.customer), JSON.stringify(quoteItem && quoteItem.proposal));
    check('a quotation note keeps the customer’s words and next step', /Roof area looks smaller/.test(quoteItem.message) && quoteItem.nextStep === 'changes' && quoteItem.contactRequested === true);

    const projectItem = items.find((i) => i.source === 'project' && i.project && i.project.id === projectId);
    check('a project note resolves the stored slug to the project name', !!projectItem && projectItem.project.name === 'ReachGlobal India Pvt. Ltd.' && projectItem.project.capacity === '350 kWp', JSON.stringify(projectItem && projectItem.project));
    const pageItem = items.find((i) => i.source === 'project' && !i.project.id);
    check('a note about the page itself says so instead of showing a blank project', !!pageItem && pageItem.project.name === 'Gallery page');

    const stats = inbox.json.stats || {};
    check('stats count every note', stats.total === 4, JSON.stringify(stats.total));
    check('stats split by source', stats.sources.project.count === 2 && stats.sources.quotation.count === 2);
    check('average rating ignores notes without a rating', stats.avgRating === 3.7, String(stats.avgRating));
    check('the rating split counts 4, 5 and 2', stats.buckets['5'] === 1 && stats.buckets['4'] === 1 && stats.buckets['2'] === 1 && stats.buckets['1'] === 0, JSON.stringify(stats.buckets));
    check('every note starts unhandled', stats.fresh === 4 && stats.handled === 0);
    check('the contact request is surfaced', stats.contactRequested === 1);
    check('likes are counted from the database', stats.likes.total === 2 && stats.likes.projects === 2, JSON.stringify(stats.likes));
    check('the like leaderboard names the projects', stats.likes.top[0].name === 'GRP Limited' && stats.likes.top[0].count === 1, JSON.stringify(stats.likes.top[0]));

    /* ---- filters ---- */
    const onlyQuotes = await req('GET', '/api/feedback?source=quotation', null, ownerToken);
    check('filtering by source keeps the stats whole', onlyQuotes.json.items.length === 2 && onlyQuotes.json.stats.total === 4);
    const twoStars = await req('GET', '/api/feedback?rating=2', null, ownerToken);
    check('filtering by rating works', twoStars.json.items.length === 1 && twoStars.json.items[0].rating === 2);
    const search = await req('GET', '/api/feedback?q=' + encodeURIComponent('roof area'), null, ownerToken);
    check('search looks inside the note', search.json.items.length === 1 && /Roof area/.test(search.json.items[0].message));
    const byProposal = await req('GET', '/api/feedback?proposal=' + encodeURIComponent(proposalId), null, ownerToken);
    check('one quotation’s notes can be read on their own', byProposal.json.items.length === 2 && byProposal.json.matched === 2);

    /* ---- handled marker ---- */
    const target = items.find((i) => i.source === 'project');
    const mark = await req('PATCH', '/api/feedback/' + encodeURIComponent(target.id), { handled: true }, ownerToken);
    check('a note can be marked handled', mark.status === 200 && mark.json.handled === true && !!mark.json.handledAt, JSON.stringify(mark.json));
    const afterMark = await req('GET', '/api/feedback', null, ownerToken);
    check('the handled note leaves the open count', afterMark.json.stats.fresh === 3 && afterMark.json.stats.handled === 1, JSON.stringify({ fresh: afterMark.json.stats.fresh, handled: afterMark.json.stats.handled }));
    check('the handled note keeps its text', !!afterMark.json.items.find((i) => i.id === target.id && i.handledAt));
    const handledOnly = await req('GET', '/api/feedback?status=handled', null, ownerToken);
    check('the handled filter lists only handled notes', handledOnly.json.items.length === 1 && handledOnly.json.items[0].id === target.id);
    const badPatch = await req('PATCH', '/api/feedback/' + encodeURIComponent(target.id), { handled: 'yes' }, ownerToken);
    check('a non-boolean handled flag is refused', badPatch.status === 400);
    const undo = await req('PATCH', '/api/feedback/' + encodeURIComponent(target.id), { handled: false }, ownerToken);
    check('a handled note can be re-opened', undo.status === 200 && undo.json.handled === false);
    const unknown = await req('PATCH', '/api/feedback/not-a-real-id', { handled: true }, ownerToken);
    check('an id without a source prefix is refused', unknown.status === 400);

    /* ---- export ---- */
    const csv = await req('GET', '/api/feedback/export', null, ownerToken);
    const lines = csv.text.trim().split(/\r?\n/);
    check('the export is a CSV with a header and one row per note', csv.status === 200 && /^Source,Rating,Name/.test(lines[0]) && lines.length === 5, lines[0]);
    check('the export is served as a download', /attachment; filename="ktm-feedback-/.test(csv.headers.get('content-disposition') || ''), csv.headers.get('content-disposition'));
    check('a note containing a comma survives quoting', lines.some((line) => line.includes('"Clean rooftop work, and the full photo')));

    /* ---- scoping and auth ---- */
    const stranger = await req('GET', '/api/feedback', null, memberToken);
    check('a viewer does not see another owner’s quotation notes', stranger.status === 200 && stranger.json.items.filter((i) => i.source === 'quotation').length === 0, JSON.stringify(stranger.json.items.map((i) => i.source)));
    check('project notes are company-wide', stranger.json.items.filter((i) => i.source === 'project').length === 2);
    check('a viewer may not mark notes handled', (await req('PATCH', '/api/feedback/' + encodeURIComponent(target.id), { handled: true }, memberToken)).status === 403);
    check('the inbox needs a session', (await req('GET', '/api/feedback')).status === 401);
    check('the export needs a session', (await req('GET', '/api/feedback/export')).status === 401);

    /* ---- first open moves a sent quotation to viewed (one-way) ---- */
    const sent = await req('POST', '/api/proposals', {
      form: { custName: 'Tracked Customer', capacity: '100', propRef: 'INBOX-QA-002', companyName: 'KTM Energy Experts', companyPhone: '+919000000000' },
      status: 'sent'
    }, ownerToken);
    assert.equal(sent.status, 201, JSON.stringify(sent.json));
    const sentId = sent.json.proposal.id;
    const sentLink = await req('POST', '/api/proposals/' + sentId + '/publish', { label: 'tracking', expiresInDays: 1 }, ownerToken);
    assert.equal(sentLink.status, 201, JSON.stringify(sentLink.json));
    const beforeOpen = await req('GET', '/api/proposals/' + sentId, null, ownerToken);
    check('a sent quotation starts as sent', (beforeOpen.json.proposal || {}).status === 'sent', JSON.stringify(beforeOpen.json.proposal && beforeOpen.json.proposal.status));
    await req('GET', '/api/portal/proposal?t=' + sentLink.json.access.token);
    const afterOpen = await req('GET', '/api/proposals/' + sentId, null, ownerToken);
    check('the customer’s first open moves it to viewed', (afterOpen.json.proposal || {}).status === 'viewed', JSON.stringify(afterOpen.json.proposal && afterOpen.json.proposal.status));
    /* A prefetch must not count as a visit. */
    const sent2 = await req('POST', '/api/proposals', {
      form: { custName: 'Preview Bot', capacity: '90', propRef: 'INBOX-QA-003', companyName: 'KTM Energy Experts', companyPhone: '+919000000000' },
      status: 'sent'
    }, ownerToken);
    const sent2Link = await req('POST', '/api/proposals/' + sent2.json.proposal.id + '/publish', { label: 'preview', expiresInDays: 1 }, ownerToken);
    await fetch(base + '/api/portal/proposal?t=' + sent2Link.json.access.token, { headers: { 'User-Agent': 'WhatsApp/2.23 preview' } });
    const stillSent = await req('GET', '/api/proposals/' + sent2.json.proposal.id, null, ownerToken);
    check('a chat-app preview does not mark a quotation viewed', (stillSent.json.proposal || {}).status === 'sent', JSON.stringify(stillSent.json.proposal && stillSent.json.proposal.status));

    /* ---- likes leaderboard on its own ---- */
    const insights = await req('GET', '/api/gallery/insights', null, ownerToken);
    check('the gallery insights route answers with the leaderboard', insights.status === 200 && insights.json.likes.total === 2 && insights.json.likes.top.length >= 1, JSON.stringify(insights.json).slice(0, 160));
  } finally {
    if (server) server.kill();
    fs.rmSync(data, { recursive: true, force: true });
  }

  console.log(fails ? '\n' + fails + ' feedback inbox check(s) failed' : '\nAll feedback inbox checks passed');
  process.exit(fails ? 1 : 0);
})().catch((error) => {
  console.error('feedback inbox test crashed:', error && error.message);
  process.exit(1);
});

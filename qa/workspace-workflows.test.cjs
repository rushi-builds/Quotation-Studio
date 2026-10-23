/* Workspace click-through regression against a disposable local platform.
   Covers exact-task navigation, filters, persisted task actions, sharing races,
   partial activity errors, gallery retry/viewer, profile confirmation/save,
   password validation, Pulse text cleanup and preserved layout. All writes
   stay in the temporary local store; no providers or production accounts. */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const net = require("net");
const assert = require("assert/strict");

const EMAIL = "pulse-review@example.test";
const PASSWORD = "ReviewPass!123";

(async () => {
  const root = path.resolve(__dirname, "..");
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "qs-pulse-"));
  fs.mkdirSync(path.join(root, "qa/shots/pulse"), { recursive: true });
  const reserver = net.createServer();
  await new Promise((r) => reserver.listen(0, "127.0.0.1", r));
  const port = reserver.address().port;
  await new Promise((r) => reserver.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["platform/local-server/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", QS_DATA_DIR: data, GEMINI_ENABLED: "false" },
    stdio: ["ignore", "pipe", "inherit"],
  });

  const api = (method, p, token, body) =>
    fetch(origin + p, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null), raw: r }));

  let browser;
  const fails = [];
  const errors = [];
  const ok = (name, cond, extra) => {
    console.log((cond ? "  ok - " : "  FAIL ") + name + (cond ? "" : " :: " + (extra || "")));
    if (!cond) fails.push(name);
  };

  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(Error("Server startup timeout")), 20000);
      child.stdout.on("data", (b) => { if (b.toString().includes("platform")) { clearTimeout(t); resolve(); } });
      child.once("error", reject);
    });
    const health = await api("GET", "/api/health");
    assert.equal(health.status, 200, "local platform server healthy");
    ok("disposable platform server up (real API contract)", health.status === 200, "");

    /* ---- seed via the REAL API entirely Node-side (disposable temp store) ---- */
    const reg = await api("POST", "/api/auth/register", null, { name: "Review workspace", email: EMAIL, password: PASSWORD, role: "Owner" });
    assert.ok(reg.json && (reg.json.token || reg.json.user), "register ok: " + JSON.stringify(reg.json || {}).slice(0, 120));
    const login = await api("POST", "/api/auth/login", null, { email: EMAIL, password: PASSWORD });
    assert.ok(login.json && login.json.token, "login ok with seeded account");
    const uid = login.json.user && login.json.user.id;
    /* Promote the seed to owner for write access (fresh signups are viewers).
       Trusted offline fixture, same pattern as audit-dom/audit-fixes tests. */
    const storePath = path.join(data, "db.json");
    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
    store.users.find((u) => u.id === uid).role = "owner";
    fs.writeFileSync(storePath, JSON.stringify(store));
    const relogin = await api("POST", "/api/auth/login", null, { email: EMAIL, password: PASSWORD });
    const token = relogin.json.token;
    const me = await api("GET", "/api/auth/me", token);
    ok("auth/me returns {user:{...}} envelope with Owner role", me.json && me.json.user && me.json.user.role === "owner", JSON.stringify(me.json).slice(0, 140));

    const pA = await api("POST", "/api/proposals", token, { status: "sent", form: { custName: "Review Industries", custPhone: "9800000001", custEmail: "a@example.test", capacity: "250", propRef: "PR-001", totalInvestment: "8750000", city: "Pune" } });
    const pB = await api("POST", "/api/proposals", token, { status: "negotiation", form: { custName: "Review Factory", custPhone: "9800000002", custEmail: "b@example.test", capacity: "100", propRef: "PR-002", totalInvestment: "3400000", city: "Pune" } });
    const pC = await api("POST", "/api/proposals", token, { status: "draft", form: { custName: "Review Society", custPhone: "9800000003", custEmail: "c@example.test", capacity: "40", propRef: "PR-003", city: "Pune" } });
    ok("seeded 3 real proposals (ids returned)", pA.json.proposal && pB.json.proposal && pC.json.proposal, JSON.stringify(pA).slice(0, 120));
    const idA = pA.json.proposal.id, idB = pB.json.proposal.id;
    let undated = null;
    try { const u = await api("POST", "/api/tasks", token, { title: "Undated follow-up", proposalId: idB }); undated = u.json.task || null; } catch (_) {}
    const tOver = await api("POST", "/api/tasks", token, { title: "Site survey call", proposalId: idA, dueAt: new Date(Date.now() - 86400000).toISOString() });
    const tFuture = await api("POST", "/api/tasks", token, { title: "Future customer call", proposalId: idB, dueAt: new Date(Date.now() + 3 * 86400000).toISOString() });
    ok("overdue + future real tasks seeded", tOver.json.task && tFuture.json.task, "");
    let published = null;
    try { published = (await api("POST", "/api/proposals/" + idA + "/publish", token, {})).json; } catch (_) {}
    const report = await api("GET", "/api/reports/summary", token);
    ok("reports/summary nonzero server-recorded value", report.json && report.json.value && Number.isFinite(report.json.value.quotedSum) && report.json.value.quotedSum > 0, JSON.stringify(report.json && report.json.value).slice(0, 200));

    /* ---- browser: authenticated dashboard with this disposable session ---- */
    let launchOpts;
    if (process.env.CHROMIUM_PATH) launchOpts = { executablePath: process.env.CHROMIUM_PATH, headless: true };
    else if (process.platform === "win32") launchOpts = { channel: "chrome", headless: true };
    else {
      const bundled = require("@sparticuz/chromium");
      const c = bundled.default || bundled;
      launchOpts = { executablePath: await c.executablePath(), args: c.args.filter(arg => arg !== "--single-process"), headless: true };
    }
    browser = await chromium.launch(launchOpts);
    const ctx = await browser.newContext({ viewport: { width: 1536, height: 1060 } });
    const p = await ctx.newPage();
    const assetRequests = [];
    p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    /* expected 401/404 gate chatter on the pre-auth redirect is not a regression */
    p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) errors.push("console: " + m.text()); });
    p.on("request", (r) => assetRequests.push({ url: r.url(), status: null, resource: r.resourceType() }));
    p.on("response", (r) => { const hit = assetRequests.find((a) => a.url === r.url()); if (hit) hit.status = r.status(); });
    p.on("dialog", (d) => d.accept());

    await p.route('**/api/activity', async route => {
      const response = await route.fetch();
      if (response.ok()) {
        const body = await response.json();
        const list=Array.isArray(body.activity)?body.activity:body.events;
        if (Array.isArray(list)) list.push({id:'undated-calendar-fixture',type:'Undated fixture event',createdAt:null});
        await route.fulfill({response,json:body});
      } else await route.fulfill({response});
    });
    /* sign-in gate first (no session yet), then inject the disposable token */
    await p.goto(origin + "/dashboard.html");
    await p.waitForURL("**/index.html", { timeout: 15000 });
    await p.evaluate((t) => window.PlatformAPI.setSessionToken(t), token);
    await p.goto(origin + "/dashboard.html?panel=sales");
    await p.waitForSelector("#panel-sales.on", { timeout: 20000 });
    await p.waitForSelector("#biBody .gh-metrics .gh-metric", { timeout: 20000 });

    const check = (name,condition,extra) => { ok(name,condition,extra); assert.ok(condition,name+(extra?' :: '+extra:'')); };
    const go = async panel => { await p.evaluate(name=>window.QSDash.show(name),panel); await p.waitForSelector('#panel-'+panel+'.on'); };
    const taskId=tOver.json.task.id;
    await go('home');
    await p.waitForSelector('#homeBody [data-tasks="overdue"]');
    await p.click('#homeBody [data-tasks="overdue"]');
    await p.waitForSelector('#tasksBody .task-item');
    check('Overview overdue shortcut opens filtered Tasks',await p.locator('#taskFilter').inputValue()==='overdue'&&(await p.locator('#tasksBody').textContent()).includes('Site survey call'));
    await go('home');
    await p.click('#homeBody [data-task-focus="'+taskId+'"]');
    await p.waitForFunction(id=>document.activeElement?.dataset.taskId===id,taskId);
    check('Overview individual follow-up opens and focuses exact task',await p.locator('#taskFilter').inputValue()==='all');
    await p.locator('#gSearch').fill('Future customer call');
    await p.locator('#gResults [role=option]').first().click();
    await p.waitForFunction(id=>document.activeElement?.dataset.taskId===id,tFuture.json.task.id);
    check('search opens exact matching follow-up',true);
    await p.selectOption('#taskFilter','upcoming');
    await p.waitForSelector('#tasksBody .task-item');
    const upcoming=await p.locator('#tasksBody').textContent();
    check('Upcoming excludes overdue and undated tasks',/Future customer call/.test(upcoming)&&!/Site survey call|Undated follow-up/.test(upcoming));
    check('Upcoming has a concise due-state badge',await p.locator('#tasksBody .badge').first().textContent()==='Upcoming');
    await p.selectOption('#taskFilter','overdue');
    await p.locator('[data-task-id="'+taskId+'"] .task-check').click();
    await p.waitForFunction(()=>document.querySelector('#tasksBody .task-item')===null);
    check('Complete persists and confirms success',/Follow-up completed/.test(await p.locator('#toast').textContent()));
    await p.selectOption('#taskFilter','done');
    await p.waitForSelector('[data-task-id="'+taskId+'"]');
    await p.locator('[data-task-id="'+taskId+'"] .task-check').click();
    await p.waitForFunction(()=>document.querySelector('#tasksBody .task-item')===null);
    await p.selectOption('#taskFilter','all');
    const row=p.locator('[data-task-id="'+taskId+'"]');
    await row.locator('summary').click();await row.locator('[data-act="task-edit"]').click();
    const later=new Date(Date.now()+5*864e5).toISOString().slice(0,10);
    await p.fill('#taskDue',later);await p.click('#btnTaskAdd');
    await p.waitForFunction(()=>document.querySelector('#btnTaskAdd').textContent.trim()==='Create follow-up');
    await p.selectOption('#taskFilter','upcoming');
    await p.waitForSelector('[data-task-id="'+taskId+'"]');
    check('Reschedule persists and moves task into Upcoming',(await api('GET','/api/tasks',token)).json.tasks.some(t=>t.id===taskId&&t.dueAt?.startsWith(later)));

    await go('proposals');
    await p.fill('#filterQ','Review Factory');
    check('quotation customer search shows one matching record',await p.locator('#propTableBody tr').count()===1&&(await p.locator('#propTableBody').textContent()).includes('Review Factory'));
    await p.selectOption('#filterStatus','draft');
    await p.waitForSelector('#clearQuoteFilters');
    check('filtered empty state does not claim no saved quotations',/No matching quotations/.test(await p.locator('#propTableBody').textContent()));
    await p.click('#clearQuoteFilters');
    check('Clear filters restores all saved quotations',await p.locator('#propTableBody tr').count()===3&&await p.locator('#filterQ').inputValue()==='');
    const quote=p.locator('#propTableBody tr').filter({hasText:'Review Industries'});
    await quote.locator('summary').click();await quote.locator('[data-act="send"]').click();
    await p.waitForFunction(id=>document.querySelector('#sendSelect').value===id&&document.querySelector('#sendRecipientName').value==='Review Industries',idA);
    check('quotation row Share opens correct record and recipient',true);
    await p.selectOption('#sendChannel','copy_link');
    await p.click('#btnSendPrepare');
    await p.waitForSelector('#sendResult.on.ok');
    check('sharing result distinguishes prepared from sent/delivered',/Prepared · not sent/.test(await p.locator('#sendResult').textContent())&&/Delivery not confirmed/.test(await p.locator('#sendResult').textContent()));
    check('share preparation does not auto-open an external channel',p.url().startsWith(origin)&&await p.locator('#btnSendLaunch').isHidden());
    let releaseHistory;const historyGate=new Promise(resolve=>releaseHistory=resolve);
    const historyRoute='**/api/proposals/'+idA+'/sends';
    await p.route(historyRoute,async route=>{if(route.request().method()!=='GET')return route.continue();await historyGate;await route.continue();});
    const historyRequest=p.waitForRequest(r=>r.method()==='GET'&&r.url().endsWith('/api/proposals/'+idA+'/sends'));
    await p.fill('#sendMessage','Second disposable draft');await p.click('#btnSendPrepare');await historyRequest;
    await p.fill('#sendMessage','User edit while history loads');
    const historyResponse=p.waitForResponse(r=>r.request().method()==='GET'&&r.url().endsWith('/api/proposals/'+idA+'/sends'));
    releaseHistory();await historyResponse;await p.waitForTimeout(150);
    check('late sharing history cannot overwrite newer message edits or re-enable stale copy',await p.locator('#sendMessage').inputValue()==='User edit while history loads'&&await p.locator('#btnSendCopy').isHidden());
    await p.unroute(historyRoute);
    let release; const gate=new Promise(resolve=>release=resolve);
    const staleRoute='**/api/proposals/'+idA+'/send-preview';
    await p.route(staleRoute,async route=>{await gate;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Stale preview failure'})});});
    const pending=p.waitForRequest(r=>r.url().endsWith('/api/proposals/'+idA+'/send-preview'));
    await p.evaluate(id=>window.QSDash.show('send',id),idA);await pending;
    await p.selectOption('#sendSelect',idB);
    await p.waitForFunction(()=>document.querySelector('#sendRecipientName').value==='Review Factory');
    const settled=p.waitForResponse(r=>r.url().endsWith('/api/proposals/'+idA+'/send-preview'));
    release();await settled;await p.waitForTimeout(150);
    check('stale sharing failure cannot overwrite current selection or banner',await p.locator('#sendSelect').inputValue()===idB&&!/Stale preview failure/.test(await p.locator('#banner').textContent()));
    await p.unroute(staleRoute);

    const order=await p.evaluate(()=>window.QSDash.orderedActivity([
      {id:'same',createdAt:'2026-10-20T10:00:00Z'}, {id:'old',createdAt:'2026-10-19T10:00:00Z'},
      {id:'same',createdAt:'2026-10-21T10:00:00Z'}, {createdAt:null},{createdAt:null}
    ]));
    check('activity deduplicates IDs, keeps distinct unkeyed events and sorts newest first',order.length===4&&order[0].id==='same'&&order[0].createdAt==='2026-10-21T10:00:00Z');
    await p.route('**/api/notifications',route=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"Unavailable"}'}));
    await go('activity');await p.waitForSelector('#notifBody [data-activity-retry]');
    check('notification failure does not blank healthy activity feed',await p.locator('#activityBody .timeline-item').count()>0&&await p.locator('#notifUnreadLabel').textContent()==='Unavailable');
    await p.unroute('**/api/notifications');await p.click('#notifBody [data-activity-retry]');
    await p.waitForFunction(()=>document.querySelector('#notifUnreadLabel').textContent!=='Unavailable');
    check('activity inline Retry recovers',await p.locator('[data-activity-retry]').count()===0);

    const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY8sAAAAASUVORK5CYII=','base64');
    for(const category of ['industrial','residential']){
      const res=await fetch(origin+'/api/gallery',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/png','X-Filename':category+'.png','X-Category':category,'X-Caption':encodeURIComponent('Review '+category+' roof')},body:pixel});
      assert.equal(res.status,201);
    }
    await go('gallery');await p.waitForSelector('#galleryGrid .gcard');
    await p.selectOption('#galleryFilter','residential');
    await p.waitForFunction(()=>document.querySelector('#galleryCount').textContent==='1 photo');
    check('gallery category filter and count agree',await p.locator('#galleryGrid .gcard').count()===1&&/residential/.test(await p.locator('#galleryGrid').textContent()));
    await p.locator('#galleryGrid [data-view]').click();await p.waitForSelector('#galleryViewer[open]');
    check('gallery opens labelled full photo',await p.locator('#galleryLarge').getAttribute('alt')==='Review residential roof');
    await p.keyboard.press('Escape');
    await p.route('**/api/gallery',route=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"Unavailable"}'}));
    await go('gallery');await p.waitForSelector('#retryGallery');
    check('gallery error is not a false zero count',await p.locator('#galleryCount').textContent()==='Unavailable');
    await p.unroute('**/api/gallery');await p.click('#retryGallery');
    await p.waitForSelector('#galleryGrid .gcard');
    check('gallery Retry restores matching photo and clears busy state',await p.locator('#galleryCount').textContent()==='1 photo'&&await p.locator('#galleryGrid').getAttribute('aria-busy')==='false');

    await p.evaluate(()=>window.QSDash.showSettings('profile'));
    await p.fill('#profileName','');await p.click('#btnSaveProfile');
    check('profile empty-name validation is visible',/Name cannot be empty/.test(await p.locator('#profileSaveMsg').textContent()));
    await p.fill('#profileName','Workflow Reviewer');await p.click('#btnSaveProfile');
    await p.waitForSelector('#confirmBox[open]');
    check('profile confirmation prevents duplicate save submissions',await p.locator('#btnSaveProfile').isDisabled());
    await p.keyboard.press('Escape');
    await p.waitForFunction(()=>!document.querySelector('#btnSaveProfile').disabled);
    check('cancelling confirmation restores Save without changing profile',(await api('GET','/api/auth/me',token)).json.user.name==='Review workspace');
    await p.click('#btnSaveProfile');await p.click('#cfOk');
    await p.waitForFunction(()=>document.querySelector('#profileSaveMsg').textContent==='Profile saved.');
    check('profile successful save updates account chip',await p.locator('#chipName').textContent()==='Workflow Reviewer');
    check('profile edit does not change authority',(await api('GET','/api/auth/me',token)).json.user.role==='owner');
    await p.click('[data-settings="security"]');
    await p.fill('#currPassword',PASSWORD);await p.fill('#newPassword','Disposable-New!123');await p.fill('#newPassword2','different');await p.click('#btnChangePassword');
    check('security mismatch shows clear validation without account changes',/do not match/.test(await p.locator('#passwordChangeMsg').textContent())&&(await api('GET','/api/auth/me',token)).status===200);
    await p.locator('#gSearch').fill('Studio Pulse');
    check('Studio Pulse is discoverable in global search',await p.locator('#gResults [role=option]').count()===1);
    await p.locator('#gResults [role=option]').click();await p.waitForSelector('#panel-sales.on');
    check('Pulse page menu has only one Pulse entry',await p.locator('#pageMenu button').filter({hasText:/^Studio Pulse$/}).count()===1);
    check('long explanation block is removed, not just CSS-hidden',await p.locator('.pulse-definitions').count()===0&&!/Summary cards show all recorded quotations|An empty source split is unavailable|Undated activity is excluded/.test(await p.locator('#panel-sales').textContent()));
    check('essential metric caveats remain concise',/not date-filtered/.test(await p.locator('.pulse-visual-metrics').textContent())&&/Not revenue/.test(await p.locator('.pulse-visual-metrics').textContent()));
    await p.click('#ghTabs [data-bi-tab="performance"]');
    await p.waitForSelector('.bi-history-table tbody tr');
    check('unconnected CRM history uses unavailable cells rather than fabricated zeros',await p.locator('.bi-history-table tbody').evaluate(body=>[...body.rows].every(row=>[...row.cells].slice(1).every(cell=>cell.textContent.trim()==='—'))));
    await p.click('#ghTabs [data-bi-tab="overview"]');
    check('original rounded header and natural layout retained',await p.locator('.gbar').evaluate(el=>getComputedStyle(el).borderRadius==='22px')&&await p.locator('.pulse-overview-grid').evaluate(el=>getComputedStyle(el).display==='grid'));
    await p.evaluate(()=>{document.getElementById('toast').classList.remove('on');document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});
    await p.screenshot({path:path.join(root,'qa/shots/pulse/workflow-polish.png'),fullPage:true});
    check('no page or console errors across workflow audit',errors.length===0,errors.join('\n'));
    assert.equal(fails.length,0,fails.join(', '));
    console.log('RESULT: ALL PASS');
  } finally {
    if(browser) await browser.close(); child.kill();fs.rmSync(data,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

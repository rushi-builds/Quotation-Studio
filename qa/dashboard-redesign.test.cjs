/* Connected Workspace 5 browser regression; isolated local data, mocked AI only where labelled. */
const { chromium } = require("playwright"),
  chromiumPackage = require("@sparticuz/chromium");
const bundled = chromiumPackage.default || chromiumPackage;
const { spawn } = require("child_process"),
  fs = require("fs"),
  path = require("path"),
  os = require("os"),
  net = require("net"),
  assert = require("assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    data = fs.mkdtempSync(path.join(os.tmpdir(), "qs-workspace5-"));
  const reserver = net.createServer();
  await new Promise((r) => reserver.listen(0, "127.0.0.1", r));
  const port = reserver.address().port;
  await new Promise((r) => reserver.close(r));
  const child = spawn(process.execPath, ["platform/local-server/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      QS_DATA_DIR: data,
      GEMINI_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(Error("Server startup timeout")),
        15000,
      );
      child.stdout.on("data", (b) => {
        if (b.toString().includes("Quotation Studio platform")) {
          clearTimeout(t);
          resolve();
        }
      });
      child.once("error", reject);
    });
    browser = await chromium.launch({
      executablePath: await bundled.executablePath(),
      args: bundled.args,
      headless: true,
    });
    const p = await browser.newPage({
        viewport: { width: 1536, height: 1060 },
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    const origin = `http://127.0.0.1:${port}`,
      shots = path.join(root, "qa/shots/workspace-v5");
    fs.mkdirSync(shots, { recursive: true });
    await p.goto(origin + "/dashboard.html");
    await p.waitForURL("**/index.html");
    await p.waitForFunction(() => !!window.PlatformAPI);
    const seed = await p.evaluate(async () => {
      const api = window.PlatformAPI;
      const account = await api.register(
        "Review workspace",
        "review@example.test",
        "ReviewPass!123",
        "owner",
      );
      api.setSessionToken(account.token);
      const ids = [];
      for (const [name, size, status] of [
        ["Sample Industries", 250, "draft"],
        ["Sample Factory", 100, "sent"],
        ["Sample Enterprises", 75, "accepted"],
      ]) {
        const r = await api.createProposal({
          status,
          form: {
            custName: name,
            capacity: String(size),
            propRef: "TEST-" + (ids.length + 1),
            costPerWp: "35",
          },
        });
        ids.push(r.proposal.id);
      }
      await api.createTask({
        title: "Review the site survey",
        proposalId: ids[0],
        dueAt: new Date(Date.now() - 86400000).toISOString(),
      });
      await api.createTask({
        title: "Schedule a customer call",
        proposalId: ids[1],
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
      return ids;
    });
    await p.goto(origin + "/dashboard.html");
    await p.waitForSelector(".kpi2");
    assert.equal(await p.locator(".kpi2").count(), 4);
    const shot = async (name) =>
      p.screenshot({ path: path.join(shots, name + ".png"), fullPage: true, animations: "disabled" });
    const nav = async (name) => {
      if (await p.locator("#btnMenu").isVisible()) await p.click("#btnMenu");
      await p.locator(`.nav-item[data-panel="${name}"]`).evaluate((el) => {
        const group = el.closest("details");
        if (group) group.open = true;
      });
      await p.click(`.nav-item[data-panel="${name}"]`);
      await p.waitForSelector(`#panel-${name}.on`);
    };
    await p.waitForFunction(() => {
      const logo = document.querySelector('.ktm-brand-logo');
      return logo && logo.complete && logo.naturalWidth > 0;
    });
    assert.match(await p.locator('.ktm-brand-logo').getAttribute('src'), /ktm-logo-dark/);
    assert.ok(await p.locator('.solar-hero #homeGreeting').isVisible());
    assert.match(await p.locator('.main').evaluate(el => getComputedStyle(el, '::before').backgroundImage), /dash-hero-bg/);
    assert.notEqual(await p.locator('.kpis').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    assert.doesNotMatch(await p.locator(".solar-hero").evaluate(el => getComputedStyle(el).backgroundImage), /url\(/, "Greeting has glass, not a separate photo");
    await p.emulateMedia({colorScheme:'dark'});
    assert.equal(await p.locator('html').getAttribute('data-appearance'),'system');
    assert.equal(await p.locator('html').getAttribute('data-theme'),'light','Pearl System mode is independent of OS dark mode');
    assert.equal(Math.round((await p.locator('#dashboardSidebar').boundingBox()).width),260);
    assert.match(await p.locator('#dashboardSidebar').evaluate(el=>getComputedStyle(el).backgroundImage),/sidebar-solar.webp/);
    await p.setViewportSize({width:1568,height:710});
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await p.screenshot({path:path.join(shots,'sidebar-laptop.png'),fullPage:false});
    await p.setViewportSize({width:1536,height:1060});
    await shot("overview");
    assert.equal(await p.locator('.workspace-label').count(),0);
    await p.focus('#gSearch');
    assert.equal(await p.getAttribute('#gSearch','aria-expanded'),'false');
    await p.press('#gSearch','ArrowDown');
    assert.equal(await p.getAttribute('#gSearch','aria-expanded'),'false');
    await p.fill('#gSearch','ai');
    assert.equal(await p.getAttribute('#gSearch','aria-expanded'),'true');
    assert.equal(await p.locator('#gResults button').filter({hasText:'Ask Studio AI'}).count(),1);
    await p.fill('#gSearch','');
    assert.equal(await p.getAttribute('#gSearch','aria-expanded'),'false');
    assert.equal(await p.locator('#gResults button').count(),0);
    for(const query of ['logout','log out','sign out']){
      await p.fill('#gSearch',query);
      assert.equal(await p.locator('#gResults button').filter({hasText:'Log out'}).count(),1);
      assert.ok(p.url().includes('dashboard.html'));
    }
    await p.fill('#gSearch','   ');
    assert.equal(await p.getAttribute('#gSearch','aria-expanded'),'false');

    await p.evaluate(()=>window.scrollTo(0,600));
    await p.waitForFunction(()=>Math.abs(document.querySelector('.gbar').getBoundingClientRect().top)<1);
    assert.ok(await p.evaluate(()=>window.scrollY>100));
    await p.click('#currentPage');await p.locator('#pageMenu button').filter({hasText:'Analytics'}).click();await p.waitForSelector('#panel-reports.on');
    await p.click('#workspaceHome');await p.waitForSelector('#panel-home.on');
    for(const [query,label,focus] of [['edit profile','Edit profile','profileName'],['upload photo','Upload photo','galleryFile'],['ask studio ai','Ask Studio AI','assistantPrompt']]){
      await p.fill('#gSearch',query);await p.locator('#gResults button').filter({hasText:label}).click();assert.equal(await p.evaluate(()=>document.activeElement.id),focus);
    }
    await p.click('#assistantClose');
    await p.fill('#gSearch','change password');await p.press('#gSearch','ArrowDown');await p.press('#gSearch','Enter');
    assert.equal(await p.locator('[data-settings-section="security"]').isVisible(),true);
    await p.fill('#gSearch','Review the site survey');await p.locator('#gResults button').filter({hasText:'Review the site survey'}).click();await p.waitForSelector('#panel-tasks.on');
    await p.fill('#gSearch','Sample Factory');assert.ok(await p.locator('#gResults button').filter({hasText:'Sample Factory'}).count());await p.press('#gSearch','Escape');assert.equal(await p.getAttribute('#gSearch','aria-expanded'),'false');
    await p.click('#workspaceHome');

    await nav("proposals");
    await p.waitForSelector("#propTableBody .quote-client");
    assert.equal(await p.locator("#propTableBody tr").count(), 3);
    await p.fill("#filterQ", "Factory");
    assert.equal(await p.locator("#propTableBody tr").count(), 1);
    await p.fill("#filterQ", "");
    await p.locator("#propTableBody .row-menu summary").first().click();
    await p.locator('#propTableBody [data-act="dup"]').first().click();
    await p.waitForFunction(
      () => document.querySelectorAll("#propTableBody tr").length === 4,
    );
    await shot("quotations");
    const editButton = p.locator(`#propTableBody .row-actions [data-act="open"][data-id="${seed[0]}"]`);
    assert.match(await editButton.innerText(), /Edit in Studio/);
    await editButton.click();
    await p.waitForURL('**/quotation.html?cloud=*');
    await p.waitForFunction(()=>document.querySelector('#custName').value==='Sample Industries');
    assert.equal(new URL(p.url()).searchParams.get('cloud'), seed[0]);
    await p.goto(origin+'/dashboard.html');await p.waitForSelector('.kpi2');await nav('proposals');

    // Sharing must use the selected record, never a stale/default recipient.
    await p.locator("#propTableBody .row-menu summary").first().click();
    await p
      .locator(`#propTableBody [data-act="send"][data-id="${seed[1]}"]`)
      .evaluate((el) => (el.closest("details").open = true));
    await p.click(`#propTableBody [data-act="send"][data-id="${seed[1]}"]`);
    await p.waitForFunction(
      () =>
        document.querySelector("#sendRecipientName").value === "Sample Factory",
    );
    assert.equal(await p.inputValue("#sendSelect"), seed[1]);
    await shot("sharing");
    await p.click("#btnSendPrepare");
    await p.waitForSelector("#btnSendCopy:not([hidden])");
    assert.ok(
      (await p.locator("#sendResult").innerText()).includes("Ready to share"),
    );
    await p.waitForSelector(".send-item");
    await p.click('#panel-send [data-go-panel="publish"]');
    await p.waitForSelector("#panel-publish.on");
    assert.equal(await p.inputValue("#publishSelect"), seed[1], "Sharing tabs preserve the selected quotation");
    await p.waitForSelector('#linksBody [data-act="revoke"]');
    await shot("links");
    await nav("tasks");
    await p.waitForSelector(".task-item");
    await p.selectOption("#taskFilter", "overdue");
    await p.waitForFunction(
      () => document.querySelectorAll(".task-item").length === 1,
    );
    assert.equal(await p.locator(".task-item").count(), 1);
    await p.click(".task-check");
    await p.waitForFunction(() => !document.querySelector(".task-item"));
    await p.selectOption("#taskFilter", "all");
    await p.fill("#taskTitle", "Confirm the next meeting");
    await p.selectOption("#taskProposal", seed[0]);
    await p.click("#btnTaskAdd");
    await p.waitForFunction(() =>
      document
        .querySelector("#tasksBody")
        .textContent.includes("Confirm the next meeting"),
    );
    await shot("followups");
    await nav("activity");
    await p.waitForSelector(".timeline-item");
    await shot("activity");
    await nav("gallery");
    await p.waitForSelector("#galleryGrid .empty-pad");
    await shot("gallery");
    // Upload a tiny synthetic local test image (no customer photos).
    await p.setInputFiles("#galleryFile", {
      name: "test.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await p.fill("#galleryCaption", "Test photo");
    await p.click("#btnGalleryUpload");
    await p.waitForSelector(".gcard");
    await p.click(".gimg");
    await p.waitForSelector("#galleryViewer[open]");
    await p.click("#galleryViewerClose");
    await p.selectOption("#galleryFilter", "industrial");
    await p.waitForSelector("#galleryGrid .empty-pad");
    await nav("reports");
    await p.waitForSelector(".stage-row");
    await shot("analytics");
    await nav("settings");
    await p.click('[data-settings="security"]');
    assert.equal(
      await p.locator('[data-settings-section="security"]').isVisible(),
      true,
    );
    await p.click('[data-settings="team"]');
    await p.waitForSelector(".team-role-select");
    await p.click('[data-settings="profile"]');
    await p.fill("#profileName", "Review workspace updated");
    await p.click("#btnSaveProfile");
    await p.waitForFunction(() =>
      document.querySelector("#settingsName").textContent.includes("updated"),
    );
    await shot("settings");
    await nav("home");
    await p.fill("#gSearch", "new proposal");
    await p.press("#gSearch", "Enter");
    await p.waitForURL("**/quotation.html?cloud=*");
    await p.waitForSelector("#cloudSaveBtn:not([hidden])");
    await p.fill("#custName", "Editor sync test");
    await p.click("#cloudSaveBtn");
    await p.waitForFunction(() =>
      document.body.innerText.includes("Saved to cloud ·"),
    );
    // Diagnose existing manual cloud-save behavior; no Studio logic changed.
    await p.click('#modeAll');
    await p.click('.studio-management > summary');
    await p.selectOption('#pmStatus','ready');
    assert.equal(await p.evaluate(()=>Proposals.active().status), 'ready');
    assert.equal(await p.evaluate(async()=> (await PlatformAPI.getProposal(new URL(location.href).searchParams.get('cloud'))).proposal.status), 'draft', 'Studio status change is local until Save to cloud');
    await p.click('#cloudSaveBtn');
    await p.waitForFunction(async()=> (await PlatformAPI.getProposal(new URL(location.href).searchParams.get('cloud'))).proposal.status==='ready');
    await p.waitForSelector('#cloudSaveBtn:not([disabled])');
    await p.evaluate(async()=>PlatformAPI.updateProposal(new URL(location.href).searchParams.get('cloud'),{status:'sent'}));
    assert.equal(await p.inputValue('#pmStatus'),'ready','An already-open Studio does not live-refresh cloud status');
    await p.click('#cloudSaveBtn');
    await p.waitForFunction(()=>document.querySelector('#cloudChip').textContent==='Newer in cloud');
    assert.equal(await p.evaluate(async()=> (await PlatformAPI.getProposal(new URL(location.href).searchParams.get('cloud'))).proposal.status), 'sent', 'Conflict guard prevents stale Studio from overwriting newer cloud status');
    console.log('VERIFIED: status changes stay local until cloud save; open Studio has no live status refresh; revision conflicts protect newer cloud edits.');
    await p.goto(origin + "/dashboard.html");
    await p.waitForFunction(() =>
      document
        .querySelector("#homeBody")
        .textContent.includes("Editor sync test"),
    );
    await p.click("#assistantLauncher");
    await p.waitForFunction(
      () =>
        document.querySelector("#assistantStatus").textContent ===
        "Not connected",
    );
    assert.ok(
      (await p.locator("#assistantErrorText").innerText()).includes(
        "switched off",
      ),
    );
    await shot("assistant-disconnected");
    // Verify chat UX with an explicitly mocked response; no real Gemini call.
    await p.route("**/api/assistant/status", (r) =>
      r.fulfill({
        json: { enabled: true, provider: "Gemini", mode: "read-only" },
      }),
    );
    let chatCalls = 0;
    await p.route("**/api/assistant/chat", (r) => {
      chatCalls++;
      assert.equal(r.request().postDataJSON().consent, true);
      return r.fulfill({
        json: {
          answer: "Test fixture response. <img src=x onerror=alert(1)>",
          sources: [],
          mode: "read-only",
        },
      });
    });
    await p.click("#assistantRetry");
    await p.waitForFunction(
      () =>
        document.querySelector("#assistantStatus").textContent ===
        "Gemini · Read-only",
    );
    await p.locator("[data-ai-prompt]").first().click();
    assert.equal(chatCalls, 0, "Picking a suggestion never sends workspace context");
    assert.equal(await p.locator("#assistantSend").isEnabled(), true);
    assert.equal(await p.locator("#assistantConsent").count(), 0);
    assert.equal(await p.locator("#assistantQuotation, #assistantSharingNote").count(),0);
    assert.match(await p.locator("#assistantConnectionNote").innerText(),/verify once/);
    await p.fill("#assistantPrompt", "Summarise the business in one sentence.");
    await p.click("#assistantSend");
    await p.waitForFunction(() =>
      document
        .querySelector("#assistantMessages")
        .textContent.includes("Test fixture response"),
    );
    assert.equal(chatCalls, 1);
    assert.equal(await p.locator("#assistantMessages img").count(), 0);
    await p.click("#assistantNewChat");
    assert.equal(await p.locator(".assistant-message").count(), 0);
    await p.click("#assistantClose");
    await p.unroute("**/api/assistant/status");
    await p.unroute("**/api/assistant/chat");
    await p.selectOption("#dashboardTheme", "dark");
    await nav("proposals");
    await shot("quotations-dark");
    await p.selectOption("#dashboardTheme", "system");
    await p.setViewportSize({ width: 390, height: 844 });
    await nav("home");
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await shot("mobile-overview");
    await p.click("#assistantLauncher");
    await p.waitForFunction(
      () =>
        document.querySelector("#assistantStatus").textContent ===
        "Not connected",
    );
    const rect = await p.locator("#assistantPanel").boundingBox();
    assert.ok(
      rect.x >= 0 &&
        rect.x + rect.width <= 390 &&
        rect.y >= 0 &&
        rect.y + rect.height <= 844,
    );
    await shot("mobile-assistant");
    await p.click("#assistantClose");
    await nav("tasks");
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await shot("mobile-tasks");
    await p.fill('#gSearch','fogot password');await p.locator('#gResults button').filter({hasText:'Forgot password'}).click();await p.waitForURL('**/index.html#forgotPassword');assert.equal(await p.locator('#forgotPassword').isVisible(),true);
    // Preserve viewer restrictions and custom-role write access.
    await p.evaluate(async()=>{await PlatformAPI.logout();const r=await PlatformAPI.register('Viewer test','viewer@example.test','ReviewPass!123','viewer');PlatformAPI.setSessionToken(r.token)});
    await p.goto(origin+'/dashboard.html');await p.waitForSelector('.kpi2');assert.equal(await p.locator('#btnNewFromHome').isDisabled(),true);await p.fill('#gSearch','new proposal');assert.equal(await p.locator('#gResults button').filter({hasText:'New quotation'}).count(),0);await p.press('#gSearch','Escape');await nav('tasks');assert.equal(await p.locator('#btnTaskAdd').isDisabled(),true);
    await p.evaluate(async()=>{await PlatformAPI.logout();const r=await PlatformAPI.register('Custom role test','custom@example.test','ReviewPass!123','Design engineer');PlatformAPI.setSessionToken(r.token)});
    await p.goto(origin+'/dashboard.html');await p.waitForSelector('.kpi2');assert.equal(await p.locator('#btnNewFromHome').isEnabled(),true);
    await p.fill('#gSearch','logout');
    await p.locator('#gResults button').filter({hasText:'Log out'}).click();
    await p.waitForURL('**/index.html');
    await p.goto(origin+'/dashboard.html');
    await p.waitForURL('**/index.html');
    assert.deepEqual(errors, []);
    console.log(
      "PASS: all 8 dashboard screens, filters, duplicate, selected sharing, publish history, tasks, gallery upload/filter/viewer, analytics, settings, login/editor/save/return, theme/mobile, disconnected AI and mocked consent/chat/XSS states.",
    );
    console.log("Screenshots: qa/shots/workspace-v5 (local test data only).");
  } finally {
    if (browser) await browser.close();
    const exited = new Promise((r) => {
      if (child.exitCode !== null) r();
      else child.once("exit", r);
    });
    child.kill("SIGTERM");
    await exited;
    fs.rmSync(data, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

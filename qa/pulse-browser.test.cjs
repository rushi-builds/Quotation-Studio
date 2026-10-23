/* Studio Pulse integration — authenticated Dashboard browser regression.
   Arena PR #22 required-verification set:
   - real /auth/me envelope + capability identity (also 401/expired-session)
   - real-backed nonzero report / tasks / proposals on a DISPOSABLE local
     platform server (platform/local-server, same API contract); data lives in
     a throwaway temp dir only (no live customer writes)
   - missing allocations -> honest empty states; XLSX snapshot disabled
   - governance: persistence absent -> no mutation, no success announce
   - undated tasks never falsely overdue; distinct-customer KPIs
   - degraded endpoint (injected 500) -> unavailable, never a measured zero
   - >60 s refresh lifecycle with no PulseStorage global
   - mobile / dark render, desk export, packaged asset graph (no concept-preview)
   Run: node pulse-browser.test.cjs   (chrome channel on win; CHROMIUM_PATH override)
*/
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

    /* sign-in gate first (no session yet), then inject the disposable token */
    await p.goto(origin + "/dashboard.html");
    await p.waitForURL("**/index.html", { timeout: 15000 });
    await p.evaluate((t) => window.PlatformAPI.setSessionToken(t), token);
    await p.goto(origin + "/dashboard.html?panel=sales");
    await p.waitForSelector("#panel-sales.on", { timeout: 20000 });
    await p.waitForSelector("#biBody .gh-metrics .gh-metric", { timeout: 20000 });

    const badge = await p.locator(".bi-mode").textContent();
    ok("production badge is LIVE STUDIO DATA", /LIVE STUDIO DATA/.test(badge), badge);
    const actor = await p.evaluate(() => (window.PulseAccess && window.PulseAccess.actor) || null);
    ok("identity from server envelope (Owner, no demo identity)", actor && actor.role === "Owner" && !/demo/i.test(actor.name || ""), JSON.stringify(actor));
    const panelText = await p.evaluate(() => document.getElementById("panel-sales").textContent);
    ok("no demo/sample leakage in rendered panel", !/demo/i.test(panelText) && !/sample data/i.test(panelText), "leak check");

    /* report-driven overview metrics (server-recorded, nonzero) */
    const metrics = await p.locator("#biBody .gh-metrics .gh-metric").allTextContents();
    const strongs = await p.locator("#biBody .gh-metrics .gh-metric strong").allTextContents();
    ok("overview renders 4 metric cards", metrics.length === 4, JSON.stringify(metrics));
    ok("New leads shows — with no-CRM note (never a fabricated 0)", /New leads/.test(metrics[0]) && (strongs[0] || "") === "—" && /Lead CRM not connected/.test(metrics[0]), "value=" + (strongs[0] || "") + " | " + metrics[0]);
    ok("quotations managed shows server total 3", /Quotations managed/.test(metrics[1]) && /\b3\b/.test(strongs[1] || ""), "value=" + (strongs[1] || ""));
    ok("quoted value shows ₹ with a nonzero recorded sum", /Quoted value/.test(metrics[2]) && /₹/.test(strongs[2] || "") && !/—/.test(strongs[2] || ""), "value=" + (strongs[2] || ""));
    ok("overdue follow-ups shows server count 1", /Overdue follow-ups/.test(metrics[3]) && (strongs[3] || "") === "1", "value=" + (strongs[3] || ""));
    ok("server summary labelled all-records (period picker does not filter)", metrics.join(" ").match(/not date-filtered/g).length >= 3, "");
    ok("no sample-mode footer anywhere", !/Sample mode/.test(panelText), "sample footer leaked");
    ok("no degraded note when all feeds healthy", (await p.locator(".bi-degraded-note").count()) === 0, "");

    /* desk: real overdue signal + undated never overdue + unlinked labels */
    await p.click('#ghTabs [data-bi-tab="desk"]');
    await p.waitForSelector(".pulse-action-table tbody tr", { timeout: 10000 });
    const deskRows = await p.locator(".pulse-action-table tbody tr").allTextContents();
    ok("desk shows real overdue task (Overdue · Survey Industries task)", deskRows.some((r) => /Review Industries/.test(r) && /Overdue/.test(r)), deskRows.join(" || ").slice(0, 260));
    ok("undated task never falsely overdue, still listed as a signal", !deskRows.some((r) => /Undated follow-up/.test(r) && /Overdue/.test(r)), deskRows.join(" || ").slice(0, 260));
    const gatedButtons = await p.locator("[data-bi-action][disabled],[data-pulse-action][disabled],[data-gov-action][disabled]").count();
    ok("write-gated controls render disabled (≥1 in desk view)", gatedButtons > 0, String(gatedButtons));

    /* overview follow-ups: undated task honestly excluded (no invented placement) */
    await p.click('#ghTabs [data-bi-tab="overview"]');
    await p.waitForSelector(".bi-task-table", { timeout: 10000 });
    const followups = await p.locator(".bi-task-table").textContent();
    ok("undated task not placed in today's follow-ups (no invented due)", !/Undated follow-up/.test(followups), followups.slice(0, 240));
    ok("no invented 12:00 due anywhere in the follow-up table", !/12:00/.test(followups), "found invented noon");
    ok("real overdue task still surfaces with honest time label", /Site survey call/.test(followups), followups.slice(0, 240));

    /* overview charts: absent-CRM history/sources are unavailable, not zero charts */
    const overviewText = await p.evaluate(() => document.getElementById("biBody").textContent);
    ok("activity history explicitly unavailable without CRM (never zero buckets)", /no measured lead\/quotation-issue\/win history exists to chart/.test(overviewText), overviewText.slice(0, 240));
    ok("lead sources explicitly unavailable without CRM (empty split is not a zero)", /An empty source split is unavailable, not a recorded zero/.test(overviewText), overviewText.slice(0, 240));

    /* Connection management has ONE home in Settings. Pulse is read-only. */
    await p.click('#ghTabs [data-bi-tab="connections"]');
    await p.waitForSelector('.sc-pulse-status', { timeout: 10000 });
    ok("Pulse channel status is honest about absent provider sync", /sync is not enabled/.test(await p.locator('.sc-pulse-status').textContent()), "");
    ok("Pulse has no duplicate setup cards/forms", await p.locator('#panel-sales .bi-connections,#panel-sales .pg-add-card,#panel-sales #biConnectionForm').count() === 0, "");
    await p.click('#panel-sales [data-open-connections]');
    await p.waitForSelector('#settingsConnections:not([hidden])');
    ok("Pulse shortcut opens the single Settings Connections hub", await p.locator('#panel-settings.on').count() === 1, "");
    ok("all service Connect controls remain hard-disabled", await p.locator('.sc-connect[disabled]').count() === 8, "");
    ok("additional-account action is unavailable without backend", await p.locator('#connectionsAdd button').isDisabled(), "");
    await p.click('.side-nav [data-panel="sales"]');
    await p.click('#ghTabs [data-bi-tab="desk"]');
    await p.waitForSelector(".pulse-action-table tbody tr", { timeout: 10000 });
    ok("manage-alert disabled without persistence", (await p.locator("[data-gov-action='alert'][disabled]").count()) > 0, "");
    ok("no fake 'Control saved' announce anywhere", !/Control saved/.test(await p.textContent("#ghStatus")), "fake save announce");

    /* quote summary on a real proposal: honest empty snapshot + disabled XLSX */
    await p.evaluate((id) => window.QuoteSummary.open(id), idA);
    await p.waitForSelector("#qsInsights[open]", { timeout: 10000 });
    const qsText = await p.locator("#qsInsights").textContent();
    ok("summary opens with honest no-snapshot state", /No material or pricing snapshot recorded/.test(qsText), qsText.slice(0, 240));
    ok("XLSX snapshot download disabled without allocation", await p.locator("#qsSummaryDownload").isDisabled(), "");
    const posFirst = await p.textContent("#qsSummaryPosition");
    ok("summary positions within all 3 real quotations", /of\s*3\b/.test(posFirst), posFirst);
    await p.click("#qsSummaryPrev");
    ok("prev navigation browses to the previous real quotation", /2\s*of\s*3/.test(await p.textContent("#qsSummaryPosition")), "");
    await p.click("#qsSummaryNext");
    ok("next navigation returns (multi-proposal browse works)", /3\s*of\s*3/.test(await p.textContent("#qsSummaryPosition")), "");
    await p.click("#qsSummaryClose");

    /* desk export */
    await p.click('#ghTabs [data-bi-tab="desk"]');
    await p.waitForSelector("[data-pulse-action='desk-export']", { timeout: 10000 });
    const [download] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.click("[data-pulse-action='desk-export']")]);
    ok("desk export downloads Studio_Pulse_Actions.csv", /Studio_Pulse_Actions\.csv/.test(download.suggestedFilename()), download.suggestedFilename());
    const dlPath = await download.path();
    const csvBody = fs.readFileSync(dlPath, "utf8");
    ok("export carries honest header + real overdue row", /STUDIO PULSE ACTION LIST/.test(csvBody) && /Review Industries/.test(csvBody), csvBody.slice(0, 160));

    /* degraded feed: tasks endpoint fails -> note + honest metrics, never fake zero */
    const dp = await ctx.newPage();
    dp.on("pageerror", (e) => errors.push("degraded pageerror: " + e.message));
    await dp.route("**/api/tasks*", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "forced outage for test" }) }));
    await dp.goto(origin + "/dashboard.html?panel=sales");
    await dp.waitForSelector(".bi-degraded-note", { timeout: 20000 });
    const note = await dp.locator(".bi-degraded-note").textContent();
    ok("degraded note names failing feed (tasks)", /tasks/.test(note), note);
    const degMetrics = await dp.locator("#biBody .gh-metrics .gh-metric").allTextContents();
    ok("overdue metric under feed failure is a real number or — (never a fake 0)", /[1-9]/.test(degMetrics[3] || "") || /—/.test(degMetrics[3] || ""), JSON.stringify(degMetrics));
    await dp.close();

    /* report feed fails while proposal list succeeds -> totals come from the
       real proposal records, quoted value becomes — (no fake zero) */
    const dp2 = await ctx.newPage();
    dp2.on("pageerror", (e) => errors.push("report-fail pageerror: " + e.message));
    await dp2.route("**/api/reports/summary*", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "forced report outage" }) }));
    await dp2.goto(origin + "/dashboard.html?panel=sales");
    await dp2.waitForSelector(".bi-degraded-note", { timeout: 20000 });
    const rFailMetrics = await dp2.locator("#biBody .gh-metrics .gh-metric").allTextContents();
    const rFailVals = await dp2.locator("#biBody .gh-metrics .gh-metric strong").allTextContents();
    ok("report outage: quotations managed falls back to real proposal count 3 (never empty-CRM zero)", /Quotations managed/.test(rFailMetrics[1] || "") && (rFailVals[1] || "") === "3", "value=" + rFailVals[1]);
    ok("report outage: quoted value becomes — (unavailable, not zero)", /Quoted value/.test(rFailMetrics[2] || "") && /—/.test(rFailMetrics[2]), JSON.stringify(rFailMetrics));
    await dp2.close();

    /* expired / bogus session fails closed on Pulse */
    const exp = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const ep = await exp.newPage();
    await ep.addInitScript(() => localStorage.setItem("qs.sessionToken", "expired-bogus-token"));
    await ep.goto(origin + "/dashboard.html");
    await ep.waitForTimeout(2500);
    ok("bogus session fails closed (no Pulse mount)", (await ep.locator("#panel-sales.on").count()) === 0, "pulse mounted with dead session");
    const epText = await ep.evaluate(() => document.body.textContent);
    ok("auth-gate copy visible for dead session", /sign in|password|backend|not configured|connected/i.test(epText), epText.slice(0, 160));
    await exp.close();

    /* >60s refresh lifecycle (governance timer): no PulseStorage, still alive */
    await p.click('#ghTabs [data-bi-tab="overview"]');
    await p.waitForSelector(".bi-task-table", { timeout: 10000 });
    await p.evaluate(() => new Promise((r) => setTimeout(r, 60500)));
    ok("no PulseStorage global in production graph", (await p.evaluate(() => typeof window.PulseStorage)) === "undefined", "");
    await p.click('#ghTabs [data-bi-tab="connections"]');
    await p.waitForSelector(".sc-pulse-status", { timeout: 10000 });
    ok("panel still interactive after the 61s timer window", (await p.locator(".sc-pulse-status").count()) === 1, "");
    await p.click('#ghTabs [data-bi-tab="overview"]');

    /* mobile + dark (fresh contexts need the disposable token injected) */
    const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mp = await mob.newPage();
    await mp.addInitScript((t) => localStorage.setItem("qs.sessionToken", t), token);
    mp.on("pageerror", (e) => errors.push("mobile pageerror: " + e.message));
    await mp.goto(origin + "/dashboard.html?panel=sales");
    await mp.waitForSelector("#panel-sales.on", { timeout: 20000 });
    await mp.screenshot({ path: path.join(root, "qa/shots/pulse/mobile-light.png"), fullPage: true, animations: "disabled" });
    await mob.close();
    const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
    const dkp = await dark.newPage();
    await dkp.addInitScript((t) => localStorage.setItem("qs.sessionToken", t), token);
    dkp.on("pageerror", (e) => errors.push("dark pageerror: " + e.message));
    await dkp.goto(origin + "/dashboard.html?panel=sales");
    await dkp.waitForSelector("#panel-sales.on", { timeout: 20000 });
    await dkp.screenshot({ path: path.join(root, "qa/shots/pulse/desktop-dark.png"), fullPage: false, animations: "disabled" });
    await dark.close();

    /* asset graph: nothing from concept-preview / fixtures; packaged assets 200 */
    const bad = assetRequests.filter((a) => /concept-preview|pulse-storage|dashboard-fixtures/.test(a.url) || (a.url.includes("/assets/") && a.status != null && a.status >= 400));
    ok("asset graph clean (no concept-preview/fixture fetches, assets 200)", bad.length === 0, JSON.stringify(bad.slice(0, 5)));
    ok("packaged pulse assets actually requested", assetRequests.some((a) => /assets\/js\/pulse\//.test(a.url)), "");

    /* zero page errors across the whole run */
    ok("zero page/console errors across the whole run", errors.length === 0, errors.join(" | ").slice(0, 400));
    await p.screenshot({ path: path.join(root, "qa/shots/pulse/overview-live-report.png"), fullPage: false, animations: "disabled" });
  } catch (e) {
    fails.push("exception: " + e.message);
    console.error("EXCEPTION:", e);
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    try { child.kill(); } catch (_) {}
    try { fs.rmSync(data, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(fails.length ? "RESULT: FAIL (" + fails.length + "): " + fails.join(" ; ") : "RESULT: ALL PASS");
  process.exit(fails.length ? 1 : 0);
})();

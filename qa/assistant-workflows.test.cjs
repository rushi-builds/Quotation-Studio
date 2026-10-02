/* Real local-server action E2E. Gemini is disabled; no provider mocks or paid calls. */
const { chromium } = require("playwright"),
  mod = require("@sparticuz/chromium"),
  bundled = mod.default || mod;
const fs = require("fs"),
  os = require("os"),
  path = require("path"),
  net = require("net"),
  { spawn } = require("child_process"),
  assert = require("assert/strict");
(async () => {
  const root = path.resolve(__dirname, ".."),
    data = fs.mkdtempSync(path.join(os.tmpdir(), "qs-actions-"));
  const listener = net.createServer();
  await new Promise((r) => listener.listen(0, "127.0.0.1", r));
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
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
      const t = setTimeout(() => reject(Error("Startup timeout")), 15000);
      child.stdout.on("data", (b) => {
        if (b.toString().includes("Quotation Studio platform")) {
          clearTimeout(t);
          resolve();
        }
      });
    });
    browser = await chromium.launch({
      executablePath: await bundled.executablePath(),
      args: bundled.args,
      headless: true,
    });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      p = await context.newPage(),
      errors = [];
    let writes = 0,
      sendWrites = 0,
      provider = 0;
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    p.on("request", (r) => {
      if (r.method() === "PUT" && /\/api\/proposals\//.test(r.url())) writes++;
      if (r.method() === "POST" && /\/sends/.test(r.url())) sendWrites++;
      if (/\/api\/assistant\/chat/.test(r.url())) provider++;
    });
    const origin = `http://127.0.0.1:${port}`;
    await p.goto(origin + "/index.html");
    await p.waitForFunction(() => !!window.PlatformAPI);
    const ids = await p.evaluate(async () => {
      const a = PlatformAPI,
        r = await a.register(
          "Actions test",
          "actions@example.test",
          "ActionsTest!123",
          "owner",
        );
      a.setSessionToken(r.token);
      const ids = [];
      for (const [i, name] of [
        "Rushikesh Dhumal",
        "Rushikesh Dhumal",
        "Rama Solar",
      ].entries()) {
        const r = await a.createProposal({
          form: {
            custName: name,
            propRef: "ACTION-" + i,
            capacity: "5",
            costPerWp: "63.6",
            gstPercent: "8.9",
            customerType: "commercial",
          },
        });
        ids.push(r.proposal.id);
      }
      return ids;
    });
    async function dashboard() {
      await p.goto(origin + "/dashboard.html");
      await p.waitForSelector(".kpi2");
    }
    async function ask(text) {
      if (await p.locator("#assistantPanel").isHidden())
        await p.click("#assistantLauncher");
      await p.fill("#assistantPrompt", text);
      await p.click("#assistantSend");
    }
    async function answer(pattern) {
      await p.waitForFunction(
        (s) =>
          document.querySelector("#assistantMessages")?.textContent.includes(s),
        pattern,
      );
    }
    await dashboard();
    await ask("open rescent quotation");
    await p.waitForURL("**/quotation.html?cloud=" + ids[2]);
    await p.waitForFunction(
      () => document.querySelector("#custName").value === "Rama Solar",
    );
    await p.waitForSelector("#studioAssistant #assistantLauncher");
    await ask("3kw ka kitne paise honge");
    await answer("₹2,07,781");
    await answer("₹63.6/Wp");
    fs.mkdirSync(path.join(root, "qa/shots/actions"), { recursive: true });
    await p.screenshot({
      path: path.join(root, "qa/shots/actions/studio-pricing.png"),
      fullPage: false,
    });
    assert.equal(await p.inputValue("#capacity"), "5");
    await p.click("#assistantClose");
    await p.fill("#custName", "Rama Solar updated");
    await p.locator("#costPerWp").evaluate((el) => {
      let n = el.parentElement;
      while (n) {
        if (n.tagName === "DETAILS") n.open = true;
        n = n.parentElement;
      }
    });
    await p.fill("#costPerWp", "40.5");
    await ask("save quotation");
    await answer("Saved quotation to cloud");
    const saved = await p.evaluate(
      async (id) => (await PlatformAPI.getProposal(id)).proposal,
      ids[2],
    );
    assert.equal(saved.form.custName, "Rama Solar updated");
    assert.equal(saved.form.costPerWp, "40.5");
    writes = 0;
    await p.evaluate(() =>
      Promise.all([CloudBridge.saveToCloud(), CloudBridge.saveToCloud()]),
    );
    assert.equal(writes, 1, "Concurrent saves use one write");
    await ask("3kw price kya hai");
    await answer("₹1,32,314");
    await answer("₹40.5/Wp");
    await p.emulateMedia({ media: "print" });
    assert.equal(await p.locator("#studioAssistant").isVisible(), false);
    await p.emulateMedia({ media: "screen" });
    await ask("open Rushikesh sir's quotation");
    await p.waitForSelector(".assistant-choices button");
    assert.equal(await p.locator(".assistant-choices button").count(), 2);
    assert.ok(p.url().includes(ids[2]));
    await p.locator(".assistant-choices button").first().click();
    await p.waitForURL("**/quotation.html?cloud=*");
    await p.waitForFunction(
      () => document.querySelector("#custName").value === "Rushikesh Dhumal",
    );
    await p.waitForSelector("#studioAssistant #assistantLauncher");
    // Save-and-review sharing uses the current quotation, never silently sends.
    const sharedId = new URL(p.url()).searchParams.get("cloud");
    await p.fill("#custName", "Rushikesh updated");
    await ask("send quotation");
    await p.waitForURL("**/dashboard.html?panel=send&proposal=*");
    await p.waitForFunction(
      () =>
        document.querySelector("#sendRecipientName").value ===
        "Rushikesh updated",
    );
    assert.equal(await p.inputValue("#sendSelect"), sharedId);
    assert.equal(sendWrites, 0);
    await ask("save quotation");
    await answer("Open the quotation in Studio first");
    await ask("3kw ka kitne paise honge");
    await p.waitForSelector(".assistant-choices button");
    assert.equal(await p.locator(".assistant-choices button").count(), 3);
    await p
      .locator(".assistant-choices button")
      .filter({ hasText: "Rama Solar updated" })
      .click();
    await answer("₹1,32,314");
    // New local drafts must never overwrite the old cloud ID left in the URL.
    await p.goto(origin + "/quotation.html?cloud=" + ids[2]);
    await p.waitForFunction(
      () => document.querySelector("#custName").value === "Rama Solar updated",
    );
    await p.waitForSelector("#studioAssistant #assistantLauncher");
    await p.click(".studio-management > summary");
    await p.click("#pmNew");
    await p.fill("#custName", "Brand new assistant draft");
    await ask("send quotation");
    await answer("not saved to cloud yet");
    await ask("save quotation");
    await answer("Saved quotation to cloud");
    const check = await p.evaluate(
      async (id) => ({
        rows: (await PlatformAPI.listProposals()).proposals,
        old: (await PlatformAPI.getProposal(id)).proposal,
      }),
      ids[2],
    );
    assert.equal(check.rows.length, 4);
    assert.equal(check.old.form.custName, "Rama Solar updated");
    assert.notEqual(new URL(p.url()).searchParams.get("cloud"), ids[2]);
    // Two tabs retain their own revisions even though browser storage is shared.
    await p.goto(origin + "/quotation.html?cloud=" + ids[2]);
    await p.waitForFunction(
      () => document.querySelector("#custName").value === "Rama Solar updated",
    );
    const other = await context.newPage();
    other.on("pageerror", (e) => errors.push(e.message));
    await other.goto(origin + "/quotation.html?cloud=" + ids[2]);
    await other.waitForFunction(
      () => document.querySelector("#custName").value === "Rama Solar updated",
    );
    await p.fill("#custName", "Tab A newest");
    assert.equal((await p.evaluate(() => CloudBridge.saveToCloud())).ok, true);
    await other.fill("#custName", "Tab B unsaved");
    const conflict = await other.evaluate(() => CloudBridge.saveToCloud());
    assert.equal(conflict.ok, false);
    assert.match(conflict.error, /newer/);
    assert.equal(await other.inputValue("#custName"), "Tab B unsaved");
    assert.equal(
      await p.evaluate(
        async (id) =>
          (await PlatformAPI.getProposal(id)).proposal.form.custName,
        ids[2],
      ),
      "Tab A newest",
    );
    await other.close();
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForSelector("#studioAssistant #assistantLauncher");
    await ask("3kw price");
    await answer("solar estimate");
    const box = await p.locator("#assistantPanel").boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.x + box.width <= 390 &&
        box.y >= 0 &&
        box.y + box.height <= 844,
    );
    await p.screenshot({
      path: path.join(root, "qa/shots/actions/studio-mobile.png"),
      fullPage: false,
    });
    assert.equal(
      provider,
      0,
      "Commands and estimates work without Gemini/provider usage",
    );
    assert.deepEqual(errors, []);
    fs.mkdirSync(path.join(root, "qa/shots/actions"), { recursive: true });
    await p.screenshot({
      path: path.join(root, "qa/shots/actions/studio-save.png"),
      fullPage: false,
    });
    console.log(
      "PASS: recent/name open, ambiguous picker, Studio save, duplicate-save guard, existing Finance pricing, rate precision, sharing handoff without delivery, unsaved draft safety, print isolation; no Gemini calls.",
    );
  } finally {
    if (browser) await browser.close();
    const exited = new Promise((r) =>
      child.exitCode !== null ? r() : child.once("exit", r),
    );
    child.kill("SIGTERM");
    await exited;
    fs.rmSync(data, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

const { test } = require("node:test"),
  assert = require("node:assert/strict");
const A = require("../assets/js/assistant-actions.js"),
  Finance = require("../assets/js/finance.js");
const rows = [
  {
    id: "a",
    customer: "Rushikesh Dhumal",
    ref: "KTM/015",
    updatedAt: "2026-09-01",
  },
  {
    id: "b",
    customer: "Rushikesh Dhumal",
    ref: "KTM/016",
    updatedAt: "2026-10-01",
  },
  { id: "c", customer: "Other", updatedAt: "2026-10-02" },
];
test("named, recent, typo, open and save commands", () => {
  assert.equal(A.parse("open rescent quotation").type, "open");
  assert.equal(A.resolve(rows, A.parse("open recent quotation"))[0].id, "c");
  assert.equal(
    A.resolve(rows, A.parse("open Rushikesh sir's quotation")).length,
    2,
  );
  assert.equal(
    A.resolve(rows, A.parse("open latest Rushikesh quotation"))[0].id,
    "b",
  );
  assert.equal(A.parse("save quotation").type, "save");
  assert.equal(A.parse("save to cloud").type, "save");
  assert.equal(A.parse("open save"), null);
  assert.equal(A.parse("show open quotations").panel, "proposals");
  assert.equal(A.parse("send Rushikesh quotation").type, "send");
  assert.equal(A.parse("do not open recent quotation"), null);
  assert.equal(A.parse("delete all quotations"), null);
  assert.equal(A.parse("how to save quotation"), null);
  assert.equal(A.parse("Business summary"), null);
});
test("3 kW Hinglish query and pricing use actual Finance engine with explicit saved inputs", () => {
  const intent = A.parse("3kw ka kitne paise honge");
  assert.equal(intent, null, "Pricing questions go to Gemini, not keyword routing");
  const form = {
    capacity: "5",
    costPerWp: "63.6",
    gstPercent: "8.9",
    customerType: "residential",
  };
  const e = A.estimate(form, 3, Finance);
  assert.equal(e.base, 190800);
  assert.equal(e.tax, 16981.2);
  assert.equal(e.total, 207781.2);
  assert.equal(form.capacity, "5", "estimate does not mutate saved form");
  assert.equal(
    A.estimate({ costPerKwp: 63600, gstPercent: 8.9 }, 3, Finance).total,
    e.total,
  );
  assert.throws(
    () => A.estimate({ costPerWp: "", gstPercent: 8.9 }, 3, Finance),
    /no saved solar rate/,
  );
  assert.throws(() => A.estimate({ costPerWp: 63.6 }, 3, Finance), /GST/);
  assert.throws(() => A.estimate(form, 0, Finance), /capacity/);
});
test("actions require auth; ambiguity asks; sharing never invokes a send API", async () => {
  let user = { id: "u", role: "sales" },
    choices,
    opened = [],
    shown = [],
    reply = "";
  global.window = {
    Finance,
    PlatformAPI: {
      currentUser: async () => user,
      listProposals: async () => ({ proposals: rows }),
      getProposal: async (id) => ({ proposal: rows.find((p) => p.id === id) }),
      prepareSend: () => {
        throw Error("must not send");
      },
    },
    QSDash: { open: (id) => opened.push(id), show: (...v) => shown.push(v) },
  };
  const ui = { reply: (s) => (reply = s), choices: (s, c) => (choices = c) };
  await A.run("open Rushikesh sir's quotation", ui);
  assert.equal(opened.length, 0);
  assert.equal(choices.length, 2);
  await choices[1].run();
  assert.equal(opened[0], "b");
  await A.run("send KTM/015 quotation", ui);
  assert.deepEqual(shown[0], ["send", "a"]);
  assert.match(reply, /nothing has been sent/);
  user = { id: "u", role: "viewer" };
  await assert.rejects(A.run("send quotation", ui), /read-only/);
  await assert.rejects(A.run("save quotation", ui), /read-only/);
  user = null;
  await assert.rejects(A.run("open recent quotation", ui), /Sign in/);
  delete global.window;
});

/* Allowlisted, user-initiated Studio commands. Model replies are NEVER executed. */
(function (root, factory) {
  const lib = factory();
  if (typeof module === "object" && module.exports) module.exports = lib;
  else root.QSAssistantActions = lib;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const normalise = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[’']/g, " ")
      .replace(/[^\p{L}\p{N}.]+/gu, " ")
      .trim();
  const stop = new Set(
    "to cloud most kya liye kitni milega bhai hey hello can you could would bata batao bataiye tell mujhe quotation open show edit quotation quotations quote proposal proposals please plz recent rescent latest last newest the my me mera meri kholo khol karo kar kr do dikhao dikha sir madam ji s ki ka ke for of from using use rate rates price cost estimate kitna kitne paise honge hai hoga what how much would will does it be at in a an this current save send share bhejo bhej whatsapp email on pe ko".split(
      " ",
    ),
  );
  function parse(text) {
    const t = normalise(text);
    // Mixed instructions (or a customer named "Save") must never turn an
    // open/share request into a write. Ask for one clear command instead.
    if (/\bsave\b/.test(t) && /\b(?:open|edit|send|share|kholo|khol)\b/.test(t)) return null;
    // Questions/explanations about actions do not trigger mutations.
    if (/\b(?:how to|how do|kaise|why|kyu|not|don t|dont|mat)\b/.test(t))
      return null;
    if (
      /^(?:(?:please|plz|bhai|can you|could you) )*save\b/.test(t) ||
      /\bsave(?: (?:kar|karo|kr|do|please|plz))*$/.test(t)
    )
      return { type: "save", query: query(t) };
    if (
      /^(?:(?:please|plz|bhai|can you|could you) )*(?:send|share|bhejo|bhej)\b/.test(
        t,
      ) ||
      /\b(?:send|share|bhejo|bhej)(?: (?:kar|karo|kr|do|please|plz))*$/.test(t)
    )
      return {
        type: "send",
        query: query(t),
        recent: /\b(recent|rescent|latest|last|newest)\b/.test(t),
      };
    if (
      /\b(?:open|show|dikhao|kholo)\b/.test(t) &&
      /\b(?:follow ups|followups|tasks|pending follow)\b/.test(t)
    )
      return { type: "panel", panel: "tasks" };
    if (
      /\b(?:open|show|dikhao|kholo)\b/.test(t) &&
      /\b(?:activity|notifications)\b/.test(t)
    )
      return { type: "panel", panel: "activity" };
    if (
      /\b(?:open|show|dikhao|kholo)\b/.test(t) &&
      /\b(?:analytics|reports)\b/.test(t)
    )
      return { type: "panel", panel: "reports" };
    if (
      /^(?:show |open )?(?:all |my )?(?:open|active) quotations$/.test(t) ||
      /^(?:open|show) (?:all |my )?quotations$/.test(t)
    )
      return { type: "panel", panel: "proposals" };
    if (/^(?:(?:please|plz|bhai|can you|could you) )*(?:open|edit|kholo|khol)\b/.test(t))
      return {
        type: "open",
        query: query(t),
        recent: /\b(recent|rescent|latest|last|newest)\b/.test(t),
      };
    return null;
  }
  function query(t) {
    return t
      .split(" ")
      .filter((x) => x && !stop.has(x))
      .join(" ");
  }
  function matches(rows, q) {
    if (!q) return rows.slice();
    const terms = normalise(q).split(" ").filter(Boolean);
    return rows.filter((p) => {
      const hay = normalise([p.customer, p.title, p.ref].join(" "));
      return terms.every(
        (t) => hay.split(" ").some((w) => w === t) || hay.includes(t),
      );
    });
  }
  function resolve(rows, intent) {
    let found = matches(rows, intent.query);
    if (intent.recent && found.length)
      found = [
        found
          .slice()
          .sort(
            (a, b) =>
              (Date.parse(b.updatedAt || b.createdAt) || 0) -
              (Date.parse(a.updatedAt || a.createdAt) || 0),
          )[0],
      ];
    return found;
  }
  function estimate(form, capacity, finance) {
    const number = (v) =>
      v == null || String(v).trim() === "" ? NaN : Number(v);
    const rate =
      form.costPerWp != null && String(form.costPerWp).trim() !== ""
        ? number(form.costPerWp) * 1000
        : number(form.costPerKwp);
    const gst = number(form.gstPercent),
      size = capacity == null ? number(form.capacity) : capacity;
    if (!Number.isFinite(size) || size <= 0 || size > 1000000)
      throw Error(
        "Please specify a valid capacity, for example “3 kW ka kitna hoga?”",
      );
    if (!Number.isFinite(rate) || rate <= 0)
      throw Error(
        "This quotation has no saved solar rate. Enter its ₹/Wp rate in Studio first; I will not assume a rate.",
      );
    if (!Number.isFinite(gst) || gst < 0 || gst > 100)
      throw Error(
        "This quotation has no valid GST percentage. Set GST in Studio first (0 is allowed).",
      );
    if (!finance?.compute)
      throw Error(
        "Quotation calculation engine is unavailable. Reload and try again.",
      );
    const result = finance.compute({
      ...form,
      capacity: size,
      costPerKwp: rate,
      gstPercent: gst,
    });
    if (
      ![result.projectCost, result.gstAmount, result.grossTotal].every(
        Number.isFinite,
      )
    )
      throw Error(
        "These saved inputs cannot produce a valid estimate. Review them in Studio.",
      );
    return {
      capacity: size,
      rate,
      gst,
      base: result.projectCost,
      tax: result.gstAmount,
      total: result.grossTotal,
    };
  }
  async function run(text, ui) {
    const intent = parse(text);
    if (!intent) return false;
    const W = window.QSAssistantWorkspace || window.QSDash,
      api = window.PlatformAPI;
    const user = await api.currentUser();
    if (!user) throw Error("Sign in to use Studio commands.");
    if (W?.isLoading?.())
      throw Error(
        "The quotation is still loading. Please try again in a moment.",
      );
    if (intent.type === "save") {
      if (user.role === "viewer") throw Error("Your role is read-only.");
      if (!W?.save) {
        ui.reply(
          "Open the quotation in Studio first, make your edits, then say “Save quotation”. Dashboard records are already saved; I cannot save an unsaved editor tab from here.",
        );
        return true;
      }
      const current = W.current();
      if (intent.query && !matches([current], intent.query).length) {
        ui.reply(
          "That name does not match the quotation currently open. Open the correct quotation before saving.",
        );
        return true;
      }
      const r = await W.save();
      if (!r?.ok)
        throw Error(
          r?.error ||
            "The quotation was not saved. Review the Studio save status.",
        );
      ui.reply(
        "Saved quotation to cloud: " +
          (r.proposal.ref || r.proposal.title || "Current quotation") +
          (r.unsaved
            ? "\nYou made further edits while saving; save again to include them."
            : "."),
      );
      return true;
    }
    if (intent.type === "panel") {
      if (W.refresh) await W.refresh();
      if (intent.panel === "proposals" && W.filterStatus)
        W.filterStatus("active");
      else W.show(intent.panel);
      ui.reply("Opened " + intent.panel + ".");
      return true;
    }
    const rows = (await api.listProposals()).proposals || [];
    if (W.setProposals) W.setProposals(rows);
    if (intent.type === "send" && user.role === "viewer")
      throw Error("Your role is read-only; sharing is unavailable.");
    const current = W.current?.();
    if (
      intent.type === "send" &&
      current &&
      !intent.query &&
      !intent.recent &&
      !current.id
    ) {
      ui.reply(
        "The current quotation is not saved to cloud yet. Say “Save quotation” first, then ask to send it. Nothing was shared.",
      );
      return true;
    }
    let found = resolve(rows, intent);
    if (
      !intent.query &&
      !intent.recent &&
      current?.id &&
      intent.type === "send"
    )
      found = rows.filter((p) => p.id === current.id);
    if (!found.length && intent.type === "open") return false; // Unknown phrasing may be a technical question (e.g. open circuit voltage), not navigation.
    if (!found.length) {
      ui.reply(
        "No matching quotation found. Try a customer name or quotation reference.",
      );
      return true;
    }
    const perform = async (p) => {
      await api.getProposal(p.id); // Recheck access and existence before navigation.
      if (intent.type === "open") {
        W.open(p.id);
        return;
      }
      // No publishing, recipient changes or delivery happens on this command.
      // Sharing review uses the existing channel/recipient/prepare/send controls.
      if (W.beforeShare && !(await W.beforeShare(p.id))) return;
      W.show("send", p.id);
      ui.reply(
        "Sharing opened for " +
          (p.customer || p.ref || "this quotation") +
          ". Review recipient, channel and message, then prepare the share. WhatsApp/email needs your final Send in that app; nothing has been sent yet.",
      );
    };
    if (found.length === 1) await perform(found[0]);
    else
      ui.choices(
        "Which quotation do you mean?" +
          (found.length > 8
            ? " Showing 8 matches; type a more specific name for others."
            : ""),
        found
          .slice(0, 8)
          .map((p) => ({
            label: [
              p.customer || p.title || "Untitled",
              p.ref,
              p.capacity ? p.capacity + " kWp" : "",
              p.status,
            ]
              .filter(Boolean)
              .join(" · "),
            run: () => perform(p),
          })),
      );
    return true;
  }
  return { parse, matches, resolve, estimate, run };
});

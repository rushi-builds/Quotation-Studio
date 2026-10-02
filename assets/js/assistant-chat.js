/* Shared assistant UI. Only allowlisted user commands can act; model text never executes. */
"use strict";
window.QSAssistantInit = function () {
  const $ = (id) => document.getElementById(id);
  const launcher = $("assistantLauncher"),
    panel = $("assistantPanel");
  if (!launcher || !panel || panel.dataset.initialized) return;
  panel.dataset.initialized = "true";
  const workspace = () => window.QSAssistantWorkspace || window.QSDash;
  let previousFocus = null;
  let conversation = [];
  let available = false,
    sending = false,
    statusGeneration = 0;
  const api = window.PlatformAPI;
  const form = $("assistantForm"),
    prompt = $("assistantPrompt");
  const messages = $("assistantMessages");
  function updateComposer() {
    const enabled = (available || !!window.QSAssistantActions) && !sending;
    prompt.disabled = sending;
    $("assistantSend").disabled = !enabled || !prompt.value.trim();
    $("assistantSend").title = "Send command or question";
    $("assistantConnectionNote").textContent =
      "AI can make mistakes. Please verify once.";
  }
  function connectionError(text) {
    if ($("assistantError")) $("assistantError").hidden = !text;
    if ($("assistantErrorText"))
      $("assistantErrorText").textContent = text || "";
  }
  async function checkConnection() {
    if (sending) return;
    const version = ++statusGeneration;
    available = false;
    $("assistantStatus").textContent = "Connecting to Gemini…";
    connectionError("");
    if ($("assistantRetry")) $("assistantRetry").disabled = true;
    updateComposer();
    try {
      const status = api?.assistantStatus
        ? await api.assistantStatus()
        : { enabled: false, reason: "preview" };
      if (version !== statusGeneration) return;
      available = status.enabled === true;
      $("assistantStatus").textContent = available
        ? "Gemini · Read-only"
        : "Not connected";
      $("assistantIntro").textContent =
        "Ask about pricing, calculations, Studio or your workspace.";
      if (!available) {
        const reasons = {
          disabled:
            "Gemini is switched off on the Worker. Deploy the latest code with GEMINI_ENABLED=true.",
          missing_key:
            "The Worker is missing its Gemini secret. Add GEMINI_API_KEY in Cloudflare settings.",
          invalid_model:
            "The Gemini model setting is invalid. Check GEMINI_MODEL on the Worker.",
          preview:
            "This is a design preview. AI works in the signed-in application.",
        };
        connectionError(
          reasons[status.reason] ||
            "AI is not enabled on the server yet. Check the latest Cloudflare build.",
        );
      }
    } catch (err) {
      if (version !== statusGeneration) return;
      $("assistantStatus").textContent =
        err.status === 401 ? "Sign in required" : "Connection issue";
      connectionError(
        err.status === 404
          ? "The live server does not have the new AI route yet. Deploy the latest Cloudflare build."
          : err.status === 401
            ? "Your session expired. Sign in again to use Studio AI."
            : err.message || "Cannot reach the AI backend. Please try again.",
      );
    } finally {
      if (version === statusGeneration) {
        if ($("assistantRetry")) $("assistantRetry").disabled = false;
        updateComposer();
      }
    }
  }
  $("assistantRetry")?.addEventListener("click", checkConnection);
  $("assistantNewChat")?.addEventListener("click", () => {
    if (sending) return;
    messages.replaceChildren();
    conversation = [];
    panel.classList.remove("has-messages");
    prompt.value = "";
    updateComposer();
    prompt.focus();
  });
  document.querySelectorAll("[data-ai-prompt]").forEach((button) =>
    button.addEventListener("click", () => {
      if (sending) return;
      prompt.value = button.dataset.aiPrompt;
      updateComposer();
      prompt.focus();
    }),
  );
  prompt.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!$("assistantSend").disabled) form.requestSubmit();
    }
  });
  function message(role, text) {
    const item = document.createElement("div");
    item.className = "assistant-message " + role;
    const label = document.createElement("strong");
    label.textContent =
      role === "user" ? "You" : role === "error" ? "Notice" : "Studio AI";
    const body = document.createElement("p");
    if (role !== "assistant") body.textContent = text;
    else {
      // Small presentation-only Markdown subset. Never parse model HTML or URLs.
      const clean = String(text || "").replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .replace(/^[ \t]*[*+-][ \t]+/gm, "• ");
      const emphasis = /\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*/g;
      let offset = 0;
      for (const match of clean.matchAll(emphasis)) {
        body.append(document.createTextNode(clean.slice(offset, match.index)));
        const span = document.createElement(match[1] || match[2] ? "strong" : "em");
        span.textContent = match[1] || match[2] || match[3];
        body.append(span);
        offset = match.index + match[0].length;
      }
      body.append(document.createTextNode(clean.slice(offset)));
    }
    item.append(label, body);
    messages.append(item);
    panel.classList.add("has-messages");
    messages.scrollTop = messages.scrollHeight;
    return item;
  }
  prompt.addEventListener("input", updateComposer);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (
      (!available && !window.QSAssistantActions) ||
      sending ||
      !prompt.value.trim()
    )
      return;
    const text = prompt.value.trim();
    if (text.length > 2000) return;
    const current = workspace()?.current?.();
    const proposalId = current?.id || null;
    const currentForm = workspace()?.form?.();
    const contextKeys=Object.keys(window.StateStore?.DEFAULTS||{}).filter(k=>!/^cust[A-Z]|^prop|^prep|Url$|^(company|stat)|^(systemNotes|systemScope|systemExclusions|systemEquipment|systemPurpose)$/.test(k));
    const currentStudio = currentForm ? Object.fromEntries([...contextKeys,'costPerKwp'].filter(k=>currentForm[k]!=null && ['string','number','boolean'].includes(typeof currentForm[k]) && String(currentForm[k]).length<=160).map(k=>[k,currentForm[k]])) : undefined;
    const catalogueFields=['id','make','model','wp','tech','lengthMm','widthMm','efficiency','voc','isc','vmp','imp','kw','mppt','label','vmaxDc','mpptMin','mpptMax','maxCurrent'];
    const catalog=window.EquipmentStore?.cat?.();
    const equipmentCatalog=catalog?Object.fromEntries(['modules','inverters','structures','cables'].filter(k=>Array.isArray(catalog[k])).map(k=>[k,catalog[k].slice(0,10).map(row=>Object.fromEntries(catalogueFields.filter(key=>row&&['string','number'].includes(typeof row[key])).map(key=>[key,String(row[key]).slice(0,100)])))])):undefined;
    message("user", text);
    prompt.value = "";
    sending = true;
    updateComposer();
    const pending = message("assistant", "Checking Studio and your workspace…");
    pending.classList.add("thinking");
    if ($("assistantNewChat")) $("assistantNewChat").disabled = true;
    try {
      const actions = window.QSAssistantActions;
      if (
        actions &&
        (await actions.run(text, {
          reply: (value) => message("assistant", value),
          choices: (title, options) => {
            const item = message("assistant", title),
              list = document.createElement("div");
            list.className = "assistant-sources assistant-choices";
            options.forEach((option) => {
              const button = document.createElement("button");
              button.type = "button";
              button.textContent = option.label;
              button.addEventListener("click", async () => {
                if (sending) return;
                sending = true;
                updateComposer();
                const buttons = [...list.querySelectorAll("button")];
                buttons.forEach((b) => (b.disabled = true));
                try {
                  await option.run();
                } catch (err) {
                  message("error", err.message || "Action failed.");
                  buttons.forEach((b) => (b.disabled = false));
                } finally {
                  sending = false;
                  updateComposer();
                  messages.scrollTop = messages.scrollHeight;
                }
              });
              list.append(button);
            });
            item.append(list);
          },
        }))
      ) {
        pending.remove();
        return;
      }
      if (!available)
        throw new Error(
          "Studio commands are available, but Gemini is not connected for this question.",
        );
      // Workspace context is sent only on an explicit Send (or Enter).
      // Opening chat or picking a suggestion never sends workspace context.
      const result = await api.assistantChat(text, proposalId, true, {history:conversation, currentStudio, equipmentCatalog});
      conversation = [...conversation,{role:"user",text:text.slice(0,600)},{role:"assistant",text:(result.answer||"").slice(0,600)}].slice(-4);
      connectionError("");
      $("assistantStatus").textContent = "Gemini · Read-only";
      pending.remove();
      const item = message("assistant", result.answer || "No answer returned.");
      if (result.partial)
        message("error", "Answer shortened. Ask a narrower question.");
      if (result.coverage && Object.values(result.coverage).includes(true)) {
        const hint = document.createElement("small");
        hint.textContent =
          "Based on a limited recent snapshot, not every record.";
        item.append(hint);
      }
      if (Array.isArray(result.sources) && result.sources.length) {
        const sources = document.createElement("div");
        sources.className = "assistant-sources";
        const label = document.createElement("small");
        label.textContent = "Records in context";
        sources.append(label);
        result.sources.slice(0, 5).forEach((source) => {
          // A response can only create a navigation button for a current, accessible record.
          if (
            !workspace()
              .proposals()
              .some((p) => p.id === source.id)
          )
            return;
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = source.label || "Open quotation";
          button.addEventListener("click", () => workspace().open(source.id));
          sources.append(button);
        });
        item.append(sources);
      }
    } catch (err) {
      pending.remove();
      message("error", err.message || "Could not reach Gemini. Try again.");
      connectionError(err.message || "Could not reach Gemini.");
      $("assistantStatus").textContent =
        err.status === 429 ? "Request limit reached" : "Request failed";
      if (err.status === 401 || err.status === 503) {
        available = false;
        $("assistantStatus").textContent =
          err.status === 401 ? "Sign in required" : "AI not connected";
      }
    } finally {
      sending = false;
      if ($("assistantNewChat")) $("assistantNewChat").disabled = false;
      updateComposer();
      messages.scrollTop = messages.scrollHeight;
      if (!prompt.disabled && !panel.hidden) prompt.focus();
    }
  });
  function close() {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    if (previousFocus?.isConnected) previousFocus.focus();
    else launcher.focus();
  }
  launcher.addEventListener("click", () => {
    if (!panel.hidden) {
      close();
      return;
    }
    previousFocus = document.activeElement;
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    if (!sending) checkConnection();
    $("assistantClose").focus();
  });
  $("assistantClose").addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (!panel.hidden && event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
};

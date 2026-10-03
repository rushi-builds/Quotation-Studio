/* Mount only for signed-in staff. Does not touch quotation pages or PDF renderers. */
(function () {
  "use strict";
  async function boot() {
    const api = window.PlatformAPI;
    if (!api || document.getElementById("studioAssistant")) return;
    let user = await api.currentUser();
    if (!user) return;
    let rows = [];
    try {
      rows = (await api.listProposals()).proposals || [];
    } catch (_) {
      return;
    }
    const current = () => {
      const blob = window.Proposals?.active(),
        form = window.StateStore?.collectForm();
      if (!blob || !form) return null;
      return {
        id: window.CloudBridge?.cloudIdFor(blob.id),
        customer: form.custName || "",
        ref: form.propRef || "",
        title: form.custName || "Current quotation",
        status: blob.status,
      };
    };
    const canLeave = () =>
      !window.CloudBridge?.hasUnsavedChanges() ||
      confirm(
        "This quotation has unsaved edits. Leave without saving to cloud? Your local draft remains in this browser.",
      );
    window.QSAssistantWorkspace = {
      user: () => user,
      proposals: () => rows,
      setProposals: (value) => {
        rows = value;
      },
      current,
      form: () => window.StateStore.collectForm(),
      isLoading: () => window.CloudBridge?.isOpening(),
      save: () => window.CloudBridge.saveToCloud(),
      open: (id) => {
        if (canLeave())
          location.href = "quotation.html?cloud=" + encodeURIComponent(id);
      },
      show: (panel, id) => {
        if (canLeave())
          location.href =
            "dashboard.html?panel=" +
            encodeURIComponent(panel) +
            (id ? "&proposal=" + encodeURIComponent(id) : "");
      },
      beforeShare: async (id) => {
        if (current()?.id !== id || !window.CloudBridge.hasUnsavedChanges())
          return true;
        if (
          !confirm(
            "Save the current edits before reviewing this quotation for sharing?",
          )
        )
          return false;
        const result = await window.CloudBridge.saveToCloud();
        if (!result?.ok)
          throw Error(result?.error || "Save failed. Nothing was shared.");
        if (result.unsaved)
          throw Error(
            "More edits were made during saving. Save again before sharing.",
          );
        return true;
      },
    };
    const host = document.createElement("div");
    host.id = "studioAssistant";
    host.setAttribute("data-html2canvas-ignore", "true");
    host.innerHTML =
      '        <button\n          type="button"\n          id="assistantLauncher"\n          class="assistant-launcher"\n          aria-label="Open Studio AI"\n          aria-controls="assistantPanel"\n          aria-expanded="false"\n        >\n          <span class="ai-spark" aria-hidden="true">\u2726</span\n          ><span class="ai-launch-label">Ask Studio</span>\n        </button>\n        <section\n          id="assistantPanel"\n          class="assistant-panel"\n          role="dialog"\n          aria-label="Studio AI assistant"\n          hidden\n        >\n          <header class="assistant-head">\n            <span class="assistant-mark" aria-hidden="true">\u2726</span>\n            <div>\n              <strong>Studio AI</strong\n              ><span id="assistantStatus" role="status">Connecting\u2026</span>\n            </div>\n            <button\n              type="button"\n              id="assistantNewChat"\n              aria-label="Clear conversation"\n              title="New conversation"\n            >\n              +</button\n            ><button\n              type="button"\n              id="assistantClose"\n              aria-label="Close assistant"\n            >\n              \u00d7\n            </button>\n          </header>\n          <div id="assistantError" class="assistant-error" hidden role="status">\n            <p id="assistantErrorText"></p>\n            <button type="button" id="assistantRetry">\n              Retry connection \u21bb\n            </button>\n          </div>\n          <div class="assistant-body">\n            <div class="ai-welcome">\n              <span aria-hidden="true">\u2726</span>\n              <h2>How can I help?</h2>\n              <p id="assistantIntro">Your saved work, one question away.</p>\n            </div>\n            <div class="assistant-shortcuts">\n              <button type="button" data-ai-prompt="Find pending follow-ups. List my open tasks with saved due dates, prioritising overdue items. Be clear if the snapshot is limited."><span aria-hidden="true">\u25f7</span> Find pending follow-ups <b aria-hidden="true">\u2197</b></button>\n              <button type="button" data-ai-prompt="Show open quotations. Exclude accepted, rejected, expired and archived quotations. Include saved customer names, references and statuses; do not invent missing details."><span aria-hidden="true">\u25a4</span> Show open quotations <b aria-hidden="true">\u2197</b></button>\n              <button type="button" data-ai-prompt="Give me a concise business summary from my saved quotation counts, stages and pending follow-ups. Do not treat quoted values as revenue. Clearly state snapshot limitations."><span aria-hidden="true">\u25c7</span> Business summary <b aria-hidden="true">\u2197</b></button>\n              <button type="button" data-ai-prompt="Show recent customer activity from my saved events. Distinguish recorded events from manually marked statuses, and do not claim verified delivery or customer approval without evidence."><span aria-hidden="true">\u2197</span> Show customer activity <b aria-hidden="true">\u2197</b></button>\n            </div>\n          </div>\n          <div\n            id="assistantMessages"\n            class="assistant-messages"\n            role="log"\n            aria-live="polite"\n            aria-label="Assistant conversation"\n          ></div>\n          <form id="assistantForm" class="assistant-composer">\n            <label class="sr-only" for="assistantPrompt"\n              >Message Studio AI</label\n            ><textarea\n              id="assistantPrompt"\n              rows="2"\n              maxlength="2000"\n              placeholder="Ask Studio anything about your work\u2026"\n              aria-describedby="assistantConnectionNote"\n            ></textarea\n            ><button\n              type="submit"\n              id="assistantSend"\n              disabled\n              aria-label="Send message and share selected context with Gemini"\n            >\n              \u2191</button\n            > <small id="assistantConnectionNote">AI can make mistakes. Please verify once.</small>\n          </form>\n        </section>';
    document.body.append(host);
    window.QSAssistantInit();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => {
      boot().catch(() => {});
    });
  else boot().catch(() => {});
})();

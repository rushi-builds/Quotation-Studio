/* Dashboard-only appearance and read-only Gemini assistant.
 * Gemini requests use the authenticated same-origin backend; no keys or mutations in the browser.
 */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const KEY = 'qs.dashboard.theme';
  const allowed = ['light', 'dark', 'system'];
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let preference = 'system';
  try { const saved = localStorage.getItem(KEY); if (allowed.includes(saved)) preference = saved; } catch (_) {}
  function applyTheme() {
    document.documentElement.dataset.theme = preference === 'dark' || (preference === 'system' && media && media.matches) ? 'dark' : 'light';
    if ($('dashboardTheme')) $('dashboardTheme').value = preference;
  }
  applyTheme();
  $('dashboardTheme')?.addEventListener('change', event => {
    if (!allowed.includes(event.target.value)) return;
    preference = event.target.value;
    try { localStorage.setItem(KEY, preference); } catch (_) {}
    applyTheme();
  });
  if (media?.addEventListener) media.addEventListener('change', applyTheme);
  window.addEventListener('storage', event => {
    if (event.key !== KEY && event.key !== null) return;
    preference = allowed.includes(event.newValue) ? event.newValue : 'system';
    applyTheme();
  });

  const launcher = $('assistantLauncher'), panel = $('assistantPanel');
  if (!launcher || !panel) return;
  let previousFocus = null;
  let available = false, sending = false, statusGeneration = 0;
  const api = window.PlatformAPI;
  const form = $('assistantForm'), prompt = $('assistantPrompt'), consent = $('assistantConsent');
  const messages = $('assistantMessages'), selection = $('assistantQuotation');
  function updateComposer() {
    const enabled = available && consent.checked && !sending;
    prompt.disabled = !enabled;
    $('assistantSend').disabled = !enabled || !prompt.value.trim();
    selection.disabled = sending;
    consent.disabled = sending;
    $('assistantConnectionNote').textContent = !available ? 'AI not connected · No data sent.' : !consent.checked ? 'Allow context sharing to enable chat.' : sending ? 'Gemini is thinking…' : 'Read-only · Check answers before acting.';
  }
  async function checkConnection() {
    const version = ++statusGeneration;
    available = false;
    $('assistantStatus').textContent = 'Checking connection…';
    updateComposer();
    try {
      const status = api?.assistantStatus ? await api.assistantStatus() : { enabled: false };
      if (version !== statusGeneration) return;
      available = status.enabled === true;
      $('assistantStatus').textContent = available ? 'Gemini · Read-only' : 'AI not connected';
      $('assistantIntro').textContent = available ? 'Ask about your saved quotations and follow-ups.' : 'Gemini needs to be enabled on the server.';
    } catch (_) {
      if (version !== statusGeneration) return;
      $('assistantStatus').textContent = 'Connection unavailable';
      $('assistantIntro').textContent = 'Close and reopen to retry.';
    }
    updateComposer();
  }
  function message(role, text) {
    const item = document.createElement('div');
    item.className = 'assistant-message ' + role;
    const label = document.createElement('strong'); label.textContent = role === 'user' ? 'You' : role === 'error' ? 'Notice' : 'Gemini';
    const body = document.createElement('p'); body.textContent = text;
    item.append(label, body); messages.append(item);
    panel.classList.add('has-messages');
    messages.scrollTop = messages.scrollHeight;
    return item;
  }
  consent.addEventListener('change', updateComposer);
  prompt.addEventListener('input', updateComposer);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!available || !consent.checked || sending || !prompt.value.trim()) return;
    const text = prompt.value.trim();
    if (text.length > 2000) return;
    const proposalId = selection.value || null;
    message('user', text); prompt.value = ''; sending = true; updateComposer();
    const pending = message('assistant', 'Thinking…');
    try {
      const result = await api.assistantChat(text, proposalId, true);
      pending.remove();
      const item = message('assistant', result.answer || 'No answer returned.');
      if (result.partial) message('error', 'Answer shortened. Ask a narrower question.');
      if (result.coverage && Object.values(result.coverage).includes(true)) {
        const hint = document.createElement('small'); hint.textContent = 'Based on a limited recent snapshot, not every record.'; item.append(hint);
      }
      if (Array.isArray(result.sources) && result.sources.length) {
        const sources = document.createElement('div'); sources.className = 'assistant-sources';
        const label = document.createElement('small'); label.textContent = 'Records in context'; sources.append(label);
        result.sources.slice(0,5).forEach(source => {
          // A response can only create a navigation button for a current, accessible record.
          if (!window.QSDash.proposals().some(p => p.id === source.id)) return;
          const button = document.createElement('button'); button.type = 'button'; button.textContent = source.label || 'Open quotation';
          button.addEventListener('click', () => window.QSDash.open(source.id)); sources.append(button);
        });
        item.append(sources);
      }
    } catch (err) {
      pending.remove(); message('error', err.message || 'Could not reach Gemini. Try again.');
      if (err.status === 401 || err.status === 503) { available = false; $('assistantStatus').textContent = err.status === 401 ? 'Sign in required' : 'AI not connected'; }
    } finally { sending = false; updateComposer(); messages.scrollTop = messages.scrollHeight; if (!prompt.disabled && !panel.hidden) prompt.focus(); }
  });
  function context() {
    const D = window.QSDash, user = D?.user();
    if (!user) { $('assistantContext').textContent = 'Available after sign-in'; return; }
    const active = document.querySelector('.nav-item.on .label')?.textContent || 'Home';
    const proposals = D.proposals(), count = proposals.length;
    if (!sending) {
      const value = selection.value;
      selection.replaceChildren(new Option('Workspace overview', ''));
      proposals.forEach(p => selection.add(new Option((p.customer || p.title || 'Quotation') + (p.ref ? ' · ' + p.ref : ''), p.id)));
      if (proposals.some(p => p.id === value)) selection.value = value;
    }
    $('assistantContext').textContent = `${active} · ${count} saved quotation${count === 1 ? '' : 's'}`;
    $('assistantContextDetail').textContent = `${user.name || 'User'} · ${user.roleLabel || user.role || 'Workspace member'}`;
  }
  function close() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    if (previousFocus?.isConnected) previousFocus.focus();
    else launcher.focus();
  }
  launcher.addEventListener('click', () => {
    if (!panel.hidden) { close(); return; }
    previousFocus = document.activeElement;
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    context();
    if (!sending) checkConnection();
    $('assistantClose').focus();
  });
  $('assistantClose').addEventListener('click', close);
  document.addEventListener('keydown', event => {
    if (!panel.hidden && event.key === 'Escape') { event.preventDefault(); close(); }
  });
  panel.addEventListener('click', event => {
    const button = event.target.closest('[data-assistant-action]');
    if (!button) return;
    const D = window.QSDash;
    if (!D?.user()) return;
    close();
    switch (button.dataset.assistantAction) {
      case 'overdue': D.showTasks('overdue'); break;
      case 'active': D.filterStatus('active'); break;
      case 'reports': D.show('reports'); break;
    }
  });
  document.addEventListener('qs:workspace-updated', context);
  document.addEventListener('click', event => {
    if (!panel.hidden && event.target.closest('.nav-item')) context();
  });
})();

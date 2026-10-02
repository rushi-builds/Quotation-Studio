/* Dashboard-only appearance and read-only Gemini assistant.
 * Gemini requests use the authenticated same-origin backend; no keys or mutations in the browser.
 */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const KEY = 'qs.dashboard.theme';
  const allowed = ['light', 'dark', 'system'];
  let preference = 'system';
  try { const saved = localStorage.getItem(KEY); if (allowed.includes(saved)) preference = saved; } catch (_) {}
  function applyTheme() {
    // Product preference: System is the Pearl glass workspace, independent of OS.
    document.documentElement.dataset.appearance = preference;
    document.documentElement.dataset.theme = preference === 'dark' ? 'dark' : 'light';
    if ($('dashboardTheme')) $('dashboardTheme').value = preference;
  }
  applyTheme();
  $('dashboardTheme')?.addEventListener('change', event => {
    if (!allowed.includes(event.target.value)) return;
    preference = event.target.value;
    try { localStorage.setItem(KEY, preference); } catch (_) {}
    applyTheme();
  });
  window.addEventListener('storage', event => {
    if (event.key !== KEY && event.key !== null) return;
    preference = allowed.includes(event.newValue) ? event.newValue : 'system';
    applyTheme();
  });

  const menu = $('btnMenu'), dash = $('dash'), backdrop = $('sidebarBackdrop');
  const closeMenu = () => { dash?.classList.remove('nav-open'); if(backdrop)backdrop.hidden=true; menu?.setAttribute('aria-expanded','false'); };
  menu?.addEventListener('click',()=>{const open=dash.classList.toggle('nav-open');backdrop.hidden=!open;menu.setAttribute('aria-expanded',String(open));});
  backdrop?.addEventListener('click',closeMenu);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});

  const launcher = $('assistantLauncher'), panel = $('assistantPanel');
  if (!launcher || !panel) return;
  let previousFocus = null;
  let available = false, sending = false, statusGeneration = 0;
  const api = window.PlatformAPI;
  const form = $('assistantForm'), prompt = $('assistantPrompt');
  const messages = $('assistantMessages');
  function updateComposer() {
    const enabled = available && !sending;
    prompt.disabled = sending;
    $('assistantSend').disabled = !enabled || !prompt.value.trim();
    $('assistantSend').title = !available ? 'Connect the AI backend first' : 'Send to Gemini';
    $('assistantConnectionNote').textContent = 'AI can make mistakes. Please verify once.';
  }
  function connectionError(text) {
    if ($('assistantError')) $('assistantError').hidden = !text;
    if ($('assistantErrorText')) $('assistantErrorText').textContent = text || '';
  }
  async function checkConnection() {
    if (sending) return;
    const version = ++statusGeneration;
    available = false;
    $('assistantStatus').textContent = 'Connecting to Gemini…';
    connectionError('');
    if ($('assistantRetry')) $('assistantRetry').disabled = true;
    updateComposer();
    try {
      const status = api?.assistantStatus ? await api.assistantStatus() : { enabled: false, reason:'preview' };
      if (version !== statusGeneration) return;
      available = status.enabled === true;
      $('assistantStatus').textContent = available ? 'Gemini · Read-only' : 'Not connected';
      $('assistantIntro').textContent = 'Your saved work, one question away.';
      if (!available) {
        const reasons = { disabled:'Gemini is switched off on the Worker. Deploy the latest code with GEMINI_ENABLED=true.', missing_key:'The Worker is missing its Gemini secret. Add GEMINI_API_KEY in Cloudflare settings.', invalid_model:'The Gemini model setting is invalid. Check GEMINI_MODEL on the Worker.', preview:'This is a design preview. AI works in the signed-in application.' };
        connectionError(reasons[status.reason] || 'AI is not enabled on the server yet. Check the latest Cloudflare build.');
      }
    } catch (err) {
      if (version !== statusGeneration) return;
      $('assistantStatus').textContent = err.status === 401 ? 'Sign in required' : 'Connection issue';
      connectionError(err.status === 404 ? 'The live server does not have the new AI route yet. Deploy the latest Cloudflare build.' : err.status === 401 ? 'Your session expired. Sign in again to use Studio AI.' : (err.message || 'Cannot reach the AI backend. Please try again.'));
    } finally { if(version===statusGeneration) { if ($('assistantRetry')) $('assistantRetry').disabled=false; updateComposer(); } }
  }
  $('assistantRetry')?.addEventListener('click',checkConnection);
  $('assistantNewChat')?.addEventListener('click',()=>{
    if(sending)return;
    messages.replaceChildren(); panel.classList.remove('has-messages'); prompt.value=''; updateComposer();prompt.focus();
  });
  document.querySelectorAll('[data-ai-prompt]').forEach(button=>button.addEventListener('click',()=>{
    if(sending)return;
    prompt.value=button.dataset.aiPrompt; updateComposer(); prompt.focus();
  }));
  prompt.addEventListener('keydown',event=>{
    if(event.key==='Enter' && !event.shiftKey && !event.isComposing){event.preventDefault(); if(!$('assistantSend').disabled)form.requestSubmit();}
  });
  function message(role, text) {
    const item = document.createElement('div');
    item.className = 'assistant-message ' + role;
    const label = document.createElement('strong'); label.textContent = role === 'user' ? 'You' : role === 'error' ? 'Notice' : 'Studio AI';
    const body = document.createElement('p'); body.textContent = text;
    item.append(label, body); messages.append(item);
    panel.classList.add('has-messages');
    messages.scrollTop = messages.scrollHeight;
    return item;
  }
  prompt.addEventListener('input', updateComposer);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!available || sending || !prompt.value.trim()) return;
    const text = prompt.value.trim();
    if (text.length > 2000) return;
    const proposalId = null; // Workspace overview only; no selected-record fields.
    message('user', text); prompt.value = ''; sending = true; updateComposer();
    const pending = message('assistant', 'Looking at your saved workspace…');
    pending.classList.add('thinking');
    if($('assistantNewChat'))$('assistantNewChat').disabled=true;
    try {
      // Workspace context is sent only on an explicit Send (or Enter).
      // Opening chat or picking a suggestion never sends workspace context.
      const result = await api.assistantChat(text, proposalId, true);
      connectionError('');
      $('assistantStatus').textContent = 'Gemini · Read-only';
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
      connectionError(err.message || 'Could not reach Gemini.');
      $('assistantStatus').textContent = err.status === 429 ? 'Request limit reached' : 'Request failed';
      if (err.status === 401 || err.status === 503) { available = false; $('assistantStatus').textContent = err.status === 401 ? 'Sign in required' : 'AI not connected'; }
    } finally { sending = false; if($('assistantNewChat'))$('assistantNewChat').disabled=false; updateComposer(); messages.scrollTop = messages.scrollHeight; if (!prompt.disabled && !panel.hidden) prompt.focus(); }
  });
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
    if (!sending) checkConnection();
    $('assistantClose').focus();
  });
  $('assistantClose').addEventListener('click', close);
  document.addEventListener('keydown', event => {
    if (!panel.hidden && event.key === 'Escape') { event.preventDefault(); close(); }
  });
})();

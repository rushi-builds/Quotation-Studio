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

  window.QSAssistantInit?.();
})();

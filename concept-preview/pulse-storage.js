/* Optional isolated SQLite bridge. Static Vercel preview never makes a request. */
'use strict';
(() => {
  const token = document.querySelector('meta[name="pulse-local-csrf"]')?.content;
  const endpoint = '/concept-preview/pulse-api/workspace';
  const fields = ['historyStart', 'leads', 'daily', 'posts', 'acquisition', 'tasks', 'threads', 'events', 'calendar', 'rules', 'connectionDrafts', 'ruleRuns', 'nextId', 'ops'];
  let context, revision = 0, last = '', timer, saving = false, changed = false, failed = false, applying = false;
  let status = token ? 'Connecting to isolated SQLite workspace…' : 'Session-only preview · download a backup to retain sample edits.';
  const snapshot = state => Object.fromEntries(fields.filter(key => state[key] !== undefined).map(key => [key, state[key]]));
  const update = text => { status = text; const el = document.getElementById('pulseStorageStatus'); if (el) el.textContent = text; };
  async function request(method = 'GET', data) {
    const response = await fetch(endpoint, { method, credentials: 'same-origin', headers: { 'X-Pulse-CSRF': token, ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const payload = await response.json();
    if (!response.ok) throw Error(payload.error || 'Local workspace unavailable');
    return payload;
  }
  function notify() {
    if (!token || !context || applying || failed) return;
    const value = JSON.stringify(snapshot(context.state));
    if (value === last) return;
    changed = true;
    clearTimeout(timer); timer = setTimeout(flush, 350);
  }
  async function flush() {
    if (saving || !changed || failed) return;
    saving = true; changed = false;
    const data = snapshot(context.state), serial = JSON.stringify(data);
    update('Saving isolated workspace…');
    try {
      const result = await request('PUT', { revision, data });
      revision = result.revision; last = serial; update('Saved to local SQLite · revision ' + revision + ' · sample workspace only.');
    } catch (error) {
      failed = true; changed = true;
      update('Not saved: ' + error.message + '. Download a backup before reloading.');
      context.announce('Workspace save blocked. Download a backup before reloading; your in-memory changes remain.');
    } finally { saving = false; if (!failed) notify(); }
  }
  async function bind(ctx) {
    context = ctx;
    if (!token) return;
    applying = true;document.getElementById('panel-sales').inert = true;
    try {
      const result = await request(); revision = result.revision;
      if (result.data) Object.assign(context.state, snapshot(result.data));
      else { last = ''; changed = true; }
      if (result.data) last = JSON.stringify(snapshot(context.state));
      update('Local SQLite workspace loaded · revision ' + revision + (result.scheduler ? ' · internal worker enabled.' : ' · internal worker disabled.'));
      context.render();
      document.getElementById('dashboardDemoReset').textContent = 'Reload workspace';
      window.__pulseStorageReady = true;
    } catch (error) { failed = true; update('Local database unavailable. Session edits only: ' + error.message); context.announce(status); }
    finally { applying = false;document.getElementById('panel-sales').inert = false; if (changed) void flush(); }
    setInterval(async () => {
      if (failed || saving || changed || document.getElementById('ghDialog')?.open) return;
      try {
        const result = await request();
        // An edit/save/modal may have begun while the poll was in flight. Never hydrate over it.
        if (failed || saving || changed || document.getElementById('ghDialog')?.open) return;
        if (result.revision > revision && result.data) {
          applying = true; Object.assign(context.state, snapshot(result.data)); revision = result.revision; last = JSON.stringify(snapshot(context.state));
          context.render(); applying = false; update('Local worker changes loaded · revision ' + revision + '.');
        }
      } catch (_) { update('Local worker connection unavailable. Existing sample data is retained.'); }
    }, 8000);
    window.addEventListener('beforeunload', event => { if (changed || saving) { event.preventDefault(); event.returnValue = ''; } });
  }
  window.PulseStorage = Object.freeze({ enabled: Boolean(token), snapshot, bind, notify, flush, get revision(){return revision;}, get dirty(){return changed||saving;}, get status() { return status; } });
})();

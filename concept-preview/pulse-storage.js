/* Optional isolated SQLite bridge. Static Vercel preview never makes a request. */
'use strict';
(() => {
  const token = document.querySelector('meta[name="pulse-local-csrf"]')?.content;
  const endpoint = '/concept-preview/pulse-api/workspace';
  const fields = ['historyStart', 'leads', 'daily', 'posts', 'acquisition', 'tasks', 'threads', 'events', 'calendar', 'rules', 'connectionDrafts', 'ruleRuns', 'nextId', 'ops', 'governance'];
  let context, revision = 0, last = '', timer, saving = false, changed = false, failed = false, applying = false, controlling = false;
  let status = token ? 'Connecting to isolated SQLite workspace…' : 'Session-only preview · download a backup to retain sample edits.';
  const snapshot = state => Object.fromEntries(fields.filter(key => state[key] !== undefined).map(key => [key, state[key]]));
  const update = text => { status = text; const el = document.getElementById('pulseStorageStatus'); if (el) el.textContent = text; };
  async function request(method = 'GET', data, url = endpoint) {
    const response = await fetch(url, { method, credentials: 'same-origin', headers: { 'X-Pulse-CSRF': token, ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const payload = await response.json();
    if (!response.ok) {const error=Error(payload.error || 'Local workspace unavailable');error.status=response.status;throw error;}
    return payload;
  }
  function notify() {
    if (!token || !context || applying || controlling || failed || !window.PulseAccess?.canEdit()) return;
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
      const result = await request(); revision = result.revision;window.PulseAccess?.trustActor(result.actor);
      if (result.data) Object.assign(context.state, snapshot(result.data));
      else { last = ''; changed = Boolean(window.PulseAccess?.canEdit()); }
      if (result.data) last = JSON.stringify(snapshot(context.state));
      update('Local SQLite workspace loaded · revision ' + revision + (result.scheduler ? ' · internal worker enabled.' : ' · internal worker disabled.'));
      context.render();
      document.getElementById('dashboardDemoReset').textContent = 'Reload workspace';
      window.__pulseStorageReady = true;
    } catch (error) { failed = true; update('Local database unavailable. Session edits only: ' + error.message); context.announce(status); }
    finally { applying = false;document.getElementById('panel-sales').inert = false; if (changed) void flush(); }
    setInterval(async () => {
      if (failed || saving || changed || controlling || document.getElementById('ghDialog')?.open) return;
      try {
        const result = await request();
        // An edit/save/modal may have begun while the poll was in flight. Never hydrate over it.
        if (failed || saving || changed || controlling || document.getElementById('ghDialog')?.open) return;
        if (result.revision > revision && result.data) {
          applying = true; Object.assign(context.state, snapshot(result.data)); revision = result.revision; last = JSON.stringify(snapshot(context.state));
          context.render(); applying = false; update('Local worker changes loaded · revision ' + revision + '.');
        }
      } catch (_) { update('Local worker connection unavailable. Existing sample data is retained.'); }
    }, 8000);
    window.addEventListener('beforeunload', event => { if (changed || saving || controlling) { event.preventDefault(); event.returnValue = ''; } });
  }
  async function control(command) {
    if (!token || !context || failed) throw Error('Local control unavailable; reload the workspace');
    if (saving || controlling) throw Error('A save is in progress; wait and retry');
    if (changed) await flush();
    if (failed || changed || saving) throw Error('Save existing edits before managing controls');
    controlling=true;
    const panel=document.getElementById('panel-sales'),dialog=document.getElementById('ghDialog');
    panel.inert=true;dialog.inert=true;panel.setAttribute('aria-busy','true');update('Saving protected control…');
    try {
      const result=await request('POST',{revision,command},'/concept-preview/pulse-api/control');
      applying=true;Object.assign(context.state,snapshot(result.data));window.PulseAccess?.trustActor(result.actor);
      revision=result.revision;last=JSON.stringify(snapshot(context.state));
      update('Control saved to SQLite · revision '+revision+' · '+result.actor.role+' sample policy.');
    } catch(error){if(error.status===409){failed=true;update('Control not saved: workspace changed. Reload to review latest data.');}throw error;}
    finally{applying=false;controlling=false;panel.inert=false;dialog.inert=false;panel.removeAttribute('aria-busy');}
  }
  window.PulseStorage = Object.freeze({control, enabled: Boolean(token), snapshot, bind, notify, flush, get revision(){return revision;}, get dirty(){return changed||saving||controlling;}, get status() { return status; } });
})();

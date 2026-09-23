/* ---------- workspace preferences (resume on reopen) ----------
   Remembers *presentation* state only — which proposal was open, the
   Essentials/All switch, which control-panel sections were expanded, and
   where the reader was. It is deliberately stored away from the proposal
   data: if this record is corrupt or missing the proposal itself still
   opens exactly as saved, because nothing here is authoritative.

   Per proposal, keyed by proposal id, in localStorage:
     qstudio.ws.<id> = {mode, open:[section...], pageId, pdfFormat, panelScroll, pageScroll}
   plus qstudio.ws.last = <proposal id> for "resume the last proposal". */
window.WorkspacePrefs = (function () {
  const LAST_KEY = 'qstudio.ws.last';
  const PREFIX = 'qstudio.ws.';

  function safeRead(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeWrite(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  /** Always returns an object; a corrupt record can never throw or leak out. */
  function read(id) {
    if (!id) return {};
    const raw = safeRead(PREFIX + id);
    if (!raw) return {};
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { safeRemove(PREFIX + id); return {}; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return {
      mode: parsed.mode === 'all' ? 'all' : parsed.mode === 'essentials' ? 'essentials' : null,
      open: Array.isArray(parsed.open) ? parsed.open.filter((s) => typeof s === 'string').slice(0, 40) : null,
      pageId: typeof parsed.pageId === 'string' ? parsed.pageId : null,
      pdfFormat: typeof parsed.pdfFormat === 'string' && parsed.pdfFormat ? parsed.pdfFormat : null,
      panelScroll: Number.isFinite(parsed.panelScroll) ? Math.max(0, parsed.panelScroll) : null,
      pageScroll: Number.isFinite(parsed.pageScroll) ? Math.max(0, parsed.pageScroll) : null
    };
  }

  function write(id, patch) {
    if (!id) return false;
    const next = Object.assign(read(id), patch || {});
    return safeWrite(PREFIX + id, JSON.stringify(next));
  }

  function setLast(id) { if (id) safeWrite(LAST_KEY, id); }
  function last() { return safeRead(LAST_KEY); }

  /** Forget one proposal's workspace position (used when it is deleted). */
  function forget(id) { if (id) safeRemove(PREFIX + id); }

  return { read, write, last, setLast, forget };
})();

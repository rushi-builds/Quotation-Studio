/* ==========================================================================
   Quotation Studio — Cloud bridge (Phase A)
   --------------------------------------------------------------------------
   Optional link between the offline localStorage studio and the platform API.
   - Shows Dashboard link + cloud chip when /api is reachable
   - "Save to cloud" uploads the active local proposal
   - ?cloud=<id> (or sessionStorage qs.cloudOpenId) pulls a cloud proposal in

   Does not replace local autosave. A4 design, finance and PDF are untouched.
   ========================================================================== */
'use strict';

(function (root) {
  const CLOUD_MAP_KEY = 'qstudio.cloudMap'; /* localId -> cloudId */
  const CLOUD_REV_KEY = 'qstudio.cloudRev'; /* cloudId -> last known server revision */
  const OPEN_KEY = 'qs.cloudOpenId';
  const tabRevisions = new Map();

  function $(id) { return document.getElementById(id); }

  function readMap() {
    try {
      return JSON.parse(root.localStorage.getItem(CLOUD_MAP_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }
  function writeMap(map) {
    try { root.localStorage.setItem(CLOUD_MAP_KEY, JSON.stringify(map)); } catch (_) {}
  }
  function readRevs() {
    try {
      return JSON.parse(root.localStorage.getItem(CLOUD_REV_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }
  function writeRevs(map) {
    try { root.localStorage.setItem(CLOUD_REV_KEY, JSON.stringify(map)); } catch (_) {}
  }
  function rememberLink(localId, cloudId) {
    if (!localId || !cloudId) return;
    const map = readMap();
    map[localId] = cloudId;
    writeMap(map);
  }
  function rememberRev(cloudId, revision) {
    if (!cloudId) return;
    const n = Number(revision);
    if (!Number.isFinite(n) || n < 1) return;
    tabRevisions.set(cloudId, Math.floor(n));
    const revs = readRevs();
    revs[cloudId] = Math.floor(n);
    writeRevs(revs);
  }
  function knownRev(cloudId) {
    if (tabRevisions.has(cloudId)) return tabRevisions.get(cloudId);
    const revs = readRevs();
    const n = Number(cloudId && revs[cloudId]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  function cloudIdFor(localId) {
    const map = readMap();
    return (localId && map[localId]) || null;
  }

  function syncActiveLocation() {
    try {
      const u = new URL(location.href), id = cloudIdFor(root.Proposals?.activeId());
      if (id) u.searchParams.set('cloud', id); else u.searchParams.delete('cloud');
      sessionStorage.removeItem(OPEN_KEY);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (_) {}
  }

  function setChip(state, label) {
    const chip = $('cloudChip');
    if (!chip) return;
    chip.dataset.state = state || 'off';
    chip.textContent = label || 'Browser only';
  }

  function setStatus(msg) {
    const el = $('statusMsg');
    if (el && msg) el.textContent = msg;
  }

  function collectPayload() {
    const P = root.Proposals;
    const S = root.StateStore;
    if (!P || !S) return null;
    const form = S.collectForm();
    const blob = P.active() || {};
    return {
      form,
      content: root.CONTENT || blob.content || null,
      projectImages: root.PROJECT_IMAGES || blob.projectImages || null,
      pageImages: root.__qsPageImages || blob.pageImages || null,
      options: root.__qsOptions || blob.options || [],
      status: blob.status || 'draft',
      localId: blob.id || P.activeId && P.activeId(),
      sentAt: blob.sentAt || null,
      acceptedAt: blob.acceptedAt || null,
      prevId: blob.prevId || null
    };
  }

  let savePending = null, saveTarget = null, opening = false;
  const savedSnapshots = new Map();
  function fingerprint(payload) {
    if (!payload) return '';
    const {localId, ...data} = payload;
    return JSON.stringify(data);
  }
  function hasUnsavedChanges() {
    const payload = collectPayload();
    return !!payload && savedSnapshots.get(payload.localId) !== fingerprint(payload);
  }
  function saveToCloud() {
    const target = root.Proposals?.activeId();
    if (savePending) return target === saveTarget ? savePending : Promise.resolve({ok:false,error:'Another quotation is being saved. Wait for it to finish, then save this quotation.'});
    saveTarget = target;
    savePending = performSaveToCloud(target).finally(() => { savePending = null; saveTarget = null; });
    return savePending;
  }
  async function performSaveToCloud(target) {
    if (opening) return {ok:false,error:'Wait for the quotation to finish loading.'};
    const api = root.PlatformAPI;
    if (!api) return {ok:false,error:'Cloud connection unavailable.'};
    const btn = $('cloudSaveBtn');
    if (btn) btn.disabled = true;
    setChip('sync', 'Saving…');
    try {
      const user = await api.currentUser();
      if (!user) {
        setChip('off', 'Sign in on Dashboard');
        setStatus('Sign in on the Dashboard first, then return here to save to cloud.');
        return {ok:false,error:'Sign in on Dashboard first.'};
      }
      if (user.role === 'viewer') throw new Error('Your role is read-only.');
      if (root.Proposals?.activeId() !== target) throw new Error('The active quotation changed. Please save the intended quotation again.');
      /* Prefer flushing local autosave so cloud gets the latest on-screen values. */
      if (typeof root.__qsSaveNow === 'function' && root.__qsSaveNow() === false) throw new Error('Review invalid fields in Studio before saving.');

      const payload = collectPayload();
      if (!payload) throw new Error('Studio is not ready yet');

      const localId = payload.localId;
      let cloudId = cloudIdFor(localId);
      // The active local proposal's mapping is authoritative. A stale ?cloud=
      // URL must never redirect a newly-created/switched proposal's save.
      const snapshot = fingerprint(payload);

      let result;
      if (cloudId) {
        const base = knownRev(cloudId);
        if (base != null) payload.baseRevision = base;
        try {
          result = await api.updateProposal(cloudId, payload);
        } catch (err) {
          if (err && err.status === 404) {
            result = await api.createProposal(payload);
            cloudId = result.proposal.id;
          } else if (err && err.status === 409) {
            setChip('err', 'Newer in cloud');
            setStatus((err.message || 'Cloud has a newer version') +
              ' Your work is still open here — export a backup, then reopen from the Dashboard.');
            return {ok:false,error:'Cloud has newer changes. Your local edits are safe; reopen or back up before resolving the conflict.'};
          } else {
            throw err;
          }
        }
      } else {
        result = await api.createProposal(payload);
        cloudId = result.proposal.id;
      }
      rememberLink(localId, cloudId);
      if (result.proposal && result.proposal.revision != null) {
        rememberRev(cloudId, result.proposal.revision);
      }
      savedSnapshots.set(localId, snapshot);
      const unsaved = hasUnsavedChanges();
      if (!unsaved && root.Proposals.activeId() === localId) await markCleanLocal(localId);
      setChip(unsaved ? 'sync' : 'on', unsaved ? 'Unsaved changes' : 'Saved in cloud');
      setStatus('Saved to cloud · ' + (result.proposal.ref || result.proposal.title || cloudId));
      /* Keep ?cloud= in the URL so the next save updates the same row. */
      try {
        const u = new URL(location.href);
        u.searchParams.set('cloud', cloudId);
        if (root.Proposals.activeId() === localId) history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch (_) {}
      return {ok:true,proposal:result.proposal,unsaved};
    } catch (err) {
      setChip('err', 'Cloud error');
      setStatus(err.message || 'Cloud save failed');
      return {ok:false,error:err.message || 'Cloud save failed'};
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function localSignature(blob) {
    if (!blob || !root.crypto?.subtle) return null;
    const keys = ['form','content','projectImages','pageImages','options','status','sentAt','acceptedAt','prevId'];
    const value = Object.fromEntries(keys.map(k => [k, blob[k] ?? null]));
    const hash = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
    return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2,'0')).join('');
  }
  async function markCleanLocal(id) {
    const P = root.Proposals, blob = P.get(id), signature = await localSignature(blob);
    if (!signature || P.get(id)?.updatedAt !== blob.updatedAt) return;
    blob.cloudCleanSignature = signature;
    P.put(blob);
  }
  async function applyCloudProposal(proposal) {
    const P = root.Proposals;
    const S = root.StateStore;
    if (!P || !S || !proposal) return false;

    const form = { ...(proposal.form || {}) };
    if (!form.propRef && proposal.ref) form.propRef = proposal.ref;
    // Reuse only a verified clean local cache of this exact cloud proposal.
    // Unsaved edits and older unverified copies are never overwritten/deleted.
    let reusable = null;
    for (const [localId, cloudId] of Object.entries(readMap())) {
      if (cloudId !== proposal.id) continue;
      const cached = P.get(localId);
      if (cached?.cloudCleanSignature && cached.cloudCleanSignature === await localSignature(cached) && P.get(localId)?.updatedAt === cached.updatedAt) { reusable = cached; break; }
    }
    const extras = {
      status: proposal.status || 'draft',
      content: proposal.content || null,
      projectImages: proposal.projectImages || null,
      pageImages: proposal.pageImages || null,
      options: proposal.options || [],
      sentAt: proposal.sentAt || null,
      acceptedAt: proposal.acceptedAt || null,
      prevId: proposal.prevId || null
    };
    if (reusable) P.markAccepted(reusable.id);
    const blob = reusable ? { ...reusable, ...extras, form } : P.create(form, extras);
    if (proposal.sentAt) blob.sentAt = proposal.sentAt;
    if (proposal.acceptedAt) blob.acceptedAt = proposal.acceptedAt;
    if (!P.put(blob)) throw new Error('Could not save the cloud quotation in this browser. Existing drafts have not been removed.');
    P.setActive(blob.id);
    rememberLink(blob.id, proposal.id);

    /* Drive the same path the proposal manager uses after a switch. */
    if (typeof root.__qsLoadActive === 'function') {
      root.__qsLoadActive();
    } else {
      S.applyForm(form);
      if (proposal.content && root.CONTENT) {
        try { Object.assign(root.CONTENT, proposal.content); } catch (_) {}
      }
      if (Array.isArray(proposal.options)) root.__qsOptions = proposal.options;
      if (proposal.pageImages) root.__qsPageImages = proposal.pageImages;
      if (proposal.projectImages) root.PROJECT_IMAGES = proposal.projectImages;
      if (root.Render && root.Render.renderAll) root.Render.renderAll();
    }
    await markCleanLocal(blob.id);
    return true;
  }

  async function openFromCloud(cloudId) {
    const api = root.PlatformAPI;
    if (!api || !cloudId) return;
    opening = true;
    setChip('sync', 'Loading…');
    try {
      const user = await api.currentUser();
      if (!user) {
        setChip('off', 'Sign in on Dashboard');
        setStatus('Sign in on the Dashboard to open cloud proposals.');
        return;
      }
      const r = await api.getProposal(cloudId);
      const ok = await applyCloudProposal(r.proposal);
      if (ok) {
        const loaded = collectPayload();
        if (loaded) savedSnapshots.set(loaded.localId, fingerprint(loaded));
        if (r.proposal.revision != null) rememberRev(cloudId, r.proposal.revision);
        setChip('on', 'Cloud proposal');
        setStatus('Opened from cloud · ' + (r.proposal.ref || r.proposal.title || cloudId));
        try {
          const u = new URL(location.href);
          u.searchParams.set('cloud', cloudId);
          history.replaceState(null, '', u.pathname + u.search + u.hash);
        } catch (_) {}
      }
    } catch (err) {
      setChip('err', 'Cloud error');
      setStatus(err.message || 'Could not open cloud proposal');
    } finally { opening = false; }
  }

  async function initCloudBridge() {
    const bar = $('studioCloudBar');
    if (bar) bar.hidden = false;
    if ($('cloudSaveBtn')) $('cloudSaveBtn').textContent = 'Save Quotation';
    const markDirty = e => {
      if (opening || savePending || !e.target.closest('#quoteForm')) return;
      // Do not serialize image-heavy payloads on every keystroke. Exact dirty
      // comparison is deferred until save/navigation decisions.
      setChip('sync', 'Unsaved changes');
    };
    document.addEventListener('input', markDirty);
    document.addEventListener('change', markDirty);

    const api = root.PlatformAPI;
    const saveBtn = $('cloudSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => { saveToCloud(); });
    }

    if (!api) {
      setChip('off', 'Browser only');
      return;
    }

    const available = await api.isAvailable();
    if (!available) {
      setChip('off', 'Browser only');
      if (saveBtn) saveBtn.hidden = true;
      return;
    }

    let user = null;
    try { user = await api.currentUser(); } catch (_) { user = null; }

    if (user) {
      setChip('on', user.name ? ('Cloud · ' + user.name.split(' ')[0]) : 'Cloud connected');
      if (saveBtn) { saveBtn.hidden = false; saveBtn.disabled = user.role === 'viewer'; saveBtn.title = user.role === 'viewer' ? 'Your role is read-only' : 'Save this quotation to your cloud workspace'; }
    } else {
      setChip('off', 'Sign in on Dashboard');
      if (saveBtn) saveBtn.hidden = true;
    }

    /* Open request from Dashboard */
    let openId = null;
    try { openId = new URLSearchParams(location.search).get('cloud'); } catch (_) {}
    try {
      const pending = sessionStorage.getItem(OPEN_KEY);
      sessionStorage.removeItem(OPEN_KEY); // consume once even when ?cloud= is present
      if (!openId) openId = pending;
    } catch (_) {}
    // A genuinely fresh direct-Studio draft gets a server number when signed in.
    // Never renumber an existing proposal or a manually edited reference.
    if (!openId && user && user.role !== 'viewer' && root.__qsFreshLocalId) {
      const id = root.__qsFreshLocalId, blob = root.Proposals.get(id), oldRef = blob?.autoAssignedRef;
      root.__qsFreshLocalId = null;
      try {
        const result = await api.reserveProposalReference();
        if (oldRef && root.Proposals.activeId() === id && $('propRef').value === oldRef) {
          $('propRef').value = result.reference;
          root.Render.renderAll(); root.__qsSaveNow?.(); root.__qsLoadActive?.();
        }
      } catch (error) { setStatus('Could not reserve a cloud reference. This draft retains its browser-only reference. ' + error.message); }
    }
    if (openId && user) {
      await openFromCloud(openId);
    } else if (openId && !user) {
      setStatus('Sign in on the Dashboard, then open this proposal again.');
    }
  }

  root.CloudBridge = {
    init: initCloudBridge,
    saveToCloud,
    openFromCloud,
    cloudIdFor, syncActiveLocation, hasUnsavedChanges, isOpening: () => opening
  };

  /* Run after app boot so Proposals/StateStore exist. App listens on
     DOMContentLoaded too; order of handlers is registration order — this
     file loads before app.js, so we defer one tick / listen after. */
  function schedule() {
    const start = () => {
      /* Wait until Proposals is live (app boot). */
      const tryInit = () => {
        if (root.Proposals && root.StateStore) {
          initCloudBridge();
          return;
        }
        setTimeout(tryInit, 30);
      };
      tryInit();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0));
    } else {
      setTimeout(start, 0);
    }
  }
  schedule();
})(typeof self !== 'undefined' ? self : this);

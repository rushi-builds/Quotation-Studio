/* ==========================================================================
   Quotation Studio — Cloud bridge (Phase A)
   --------------------------------------------------------------------------
   Cloud-primary sync for signed-in users, with localStorage retained as an
   offline cache and recovery copy.
   - Debounced cloud autosave plus a manual Save now action
   - Revision conflicts stop autosave rather than overwrite newer cloud data
   - ?cloud=<id> (or sessionStorage qs.cloudOpenId) safely pulls a cloud proposal

   A4 design, finance and PDF are untouched.
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
    if (!msg) return;
    const el = $('statusMsg');
    if (el) el.textContent = msg;
    const hint = $('cloudSyncHint');
    if (hint) hint.textContent = msg;
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
  let cloudUser = null, autoSaveTimer = null, autoSaveQueued = false, cloudConflict = false, allowLeaveAfterConflict = false;
  const savedSnapshots = new Map();
  const AUTO_SAVE_DELAY = 1100;
  function canWriteUser(user) {
    return !!user && (user.canWrite != null ? !!user.canWrite : user.role !== 'viewer');
  }
  function fingerprint(payload) {
    if (!payload) return '';
    const {localId, ...data} = payload;
    return JSON.stringify(data);
  }
  function payloadFromCloud(proposal, localId) {
    return {
      form: proposal.form || {},
      content: proposal.content || null,
      projectImages: proposal.projectImages || null,
      pageImages: proposal.pageImages || null,
      options: proposal.options || [],
      status: proposal.status || 'draft',
      localId,
      sentAt: proposal.sentAt || null,
      acceptedAt: proposal.acceptedAt || null,
      prevId: proposal.prevId || null
    };
  }
  function hasUnsavedChanges() {
    const payload = collectPayload();
    return !!payload && savedSnapshots.get(payload.localId) !== fingerprint(payload);
  }
  function scheduleAutoSave(delay = AUTO_SAVE_DELAY) {
    if (!cloudUser || !canWriteUser(cloudUser) || cloudConflict || opening) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      autoSaveTimer = null;
      if (!hasUnsavedChanges()) return;
      if (savePending) { autoSaveQueued = true; return; }
      const result = await saveToCloud();
      if (result.ok && (result.unsaved || hasUnsavedChanges())) scheduleAutoSave(350);
    }, delay);
  }
  function saveToCloud() {
    const target = root.Proposals?.activeId();
    if (savePending) {
      if (target === saveTarget) { autoSaveQueued = true; return savePending; }
      return Promise.resolve({ok:false,error:'Another quotation is being saved. Wait for it to finish, then save this quotation.'});
    }
    saveTarget = target;
    savePending = performSaveToCloud(target).finally(() => {
      savePending = null;
      saveTarget = null;
      if (autoSaveQueued && cloudUser && canWriteUser(cloudUser) && !cloudConflict) {
        autoSaveQueued = false;
        scheduleAutoSave(250);
      }
    });
    return savePending;
  }
  async function performSaveToCloud(target) {
    if (opening) return {ok:false,error:'Wait for the quotation to finish loading.'};
    const api = root.PlatformAPI;
    if (!api) return {ok:false,error:'Cloud connection unavailable.'};
    const btn = $('cloudSaveBtn');
    if (btn) btn.disabled = true;
    setChip('sync', 'Saving to cloud…');
    try {
      const user = await api.currentUser();
      cloudUser = user;
      if (!user) {
        setChip('off', 'Sign in to sync');
        setStatus('Your browser copy is safe. Sign in on the Dashboard to sync it to cloud.');
        return {ok:false,error:'Sign in on Dashboard first.'};
      }
      if (!canWriteUser(user)) {
        setChip('off', 'Read-only');
        setStatus('Your role can view cloud proposals but cannot save changes. This browser copy is still preserved.');
        return {ok:false,error:'Your role is read-only.'};
      }
      if (root.Proposals?.activeId() !== target) throw new Error('The active quotation changed. Please save the intended quotation again.');
      /* Flush the browser autosave before capturing the cloud snapshot. */
      if (typeof root.__qsSaveNow === 'function' && root.__qsSaveNow() === false) throw new Error('Review invalid fields in Studio before saving.');

      const payload = collectPayload();
      if (!payload) throw new Error('Studio is not ready yet');
      const localId = payload.localId;
      if (!localId) throw new Error('Studio has no active quotation to save.');
      let cloudId = cloudIdFor(localId);
      // The active local proposal's mapping is authoritative. A stale ?cloud=
      // URL must never redirect a newly-created/switched proposal's save.
      const snapshot = fingerprint(payload);
      if (cloudId && savedSnapshots.get(localId) === snapshot) {
        setChip('on', 'Cloud saved');
        setStatus('Latest changes are already saved to cloud. The browser copy remains available as a backup.');
        return {ok:true,unchanged:true,unsaved:false,proposal:{id:cloudId}};
      }

      let result;
      if (cloudId) {
        let base = knownRev(cloudId);
        let cloudMissing = false;
        if (base == null) {
          /* Never update a mapped cloud row without a known revision. Re-fetch
             it and proceed only if its content exactly matches this browser
             copy; otherwise pause and preserve both versions. */
          try {
            const current = await api.getProposal(cloudId);
            const remote = current && current.proposal;
            const revision = Number(remote && remote.revision);
            if (!remote || !Number.isFinite(revision) || revision < 1) {
              throw new Error('The cloud revision could not be verified. Your browser copy is safe; reopen this quotation from Dashboard before saving.');
            }
            const remoteSnapshot = fingerprint(payloadFromCloud(remote, localId));
            const knownSnapshot = savedSnapshots.get(localId) || snapshot;
            if (remoteSnapshot !== knownSnapshot) {
              cloudConflict = true;
              autoSaveQueued = false;
              setChip('err', 'Newer in cloud');
              setStatus('The cloud copy differs from the last verified browser copy. Your edits are preserved locally; autosave is paused. Reopen the latest version from Dashboard before continuing.');
              return {ok:false,error:'Cloud data differs from the last verified browser copy; no overwrite was attempted.'};
            }
            rememberRev(cloudId, revision);
            if (remoteSnapshot === snapshot) {
              savedSnapshots.set(localId, snapshot);
              setChip('on', 'Cloud saved');
              setStatus('Latest changes are already saved to cloud. The browser copy remains available as a backup.');
              return {ok:true,unchanged:true,unsaved:false,proposal:{id:cloudId,revision}};
            }
          } catch (err) {
            if (err && err.status === 404) cloudMissing = true;
            else throw err;
          }
        }
        if (cloudMissing) {
          /* Stale local mapping: create a new cloud row; do not attempt an
             unconditional update or remove the preserved browser copy. */
          result = await api.createProposal(payload);
          cloudId = result.proposal.id;
        } else {
          base = knownRev(cloudId);
          if (base == null) throw new Error('The cloud revision could not be verified. Your browser copy is safe; reopen this quotation from Dashboard before saving.');
          payload.baseRevision = base;
          try {
            result = await api.updateProposal(cloudId, payload);
          } catch (err) {
            if (err && err.status === 404) {
              result = await api.createProposal(payload);
              cloudId = result.proposal.id;
            } else if (err && err.status === 409) {
              cloudConflict = true;
              autoSaveQueued = false;
              setChip('err', 'Newer in cloud');
              setStatus((err.message || 'Cloud has a newer version') +
                ' Your browser copy is preserved. Autosave is paused to prevent overwriting cloud data. Export a backup, then reopen the latest version from Dashboard.');
              return {ok:false,error:'Cloud has newer changes. Your local edits are safe; back up and reopen the cloud version before resolving.'};
            } else {
              throw err;
            }
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
      setChip(unsaved ? 'sync' : 'on', unsaved ? 'Syncing latest edits…' : 'Cloud saved');
      setStatus(unsaved
        ? 'An earlier snapshot reached cloud, but newer edits remain in this browser. Syncing the latest changes now.'
        : 'Latest changes saved to cloud · ' + (result.proposal.ref || result.proposal.title || cloudId) + '. Browser backup retained.');
      /* Keep ?cloud= in the URL so the next save updates the same row. */
      try {
        const u = new URL(location.href);
        u.searchParams.set('cloud', cloudId);
        if (root.Proposals.activeId() === localId) history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch (_) {}
      if (unsaved) scheduleAutoSave(350);
      return {ok:true,proposal:result.proposal,unsaved};
    } catch (err) {
      setChip('err', 'Cloud save failed');
      setStatus('Your browser backup is still available. ' + (err.message || 'Cloud save failed. Retry when the connection is available.'));
      return {ok:false,error:err.message || 'Cloud save failed'};
    } finally {
      if (btn) btn.disabled = !canWriteUser(cloudUser);
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
      cloudUser = user;
      if (!user) {
        setChip('off', 'Sign in on Dashboard');
        setStatus('Sign in on the Dashboard to open cloud proposals.');
        return;
      }
      const r = await api.getProposal(cloudId);
      const ok = await applyCloudProposal(r.proposal);
      if (ok) {
        cloudConflict = false;
        autoSaveQueued = false;
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
    const saveBtn = $('cloudSaveBtn');
    if (saveBtn) saveBtn.textContent = 'Save now';
    setChip('off', 'Local backup only');
    setStatus('This browser keeps an offline backup. Sign in on the Dashboard to sync proposals to cloud.');

    const markDirty = e => {
      if (opening || !e.target.closest?.('#quoteForm')) return;
      if (!cloudUser) return;
      if (canWriteUser(cloudUser)) {
        setChip('sync', 'Waiting to sync…');
        setStatus('Local backup updated. Cloud sync starts automatically after you pause.');
        scheduleAutoSave();
      } else {
        setChip('off', 'Read-only');
        setStatus('This change is local to this browser; your role cannot save it to cloud.');
      }
    };
    document.addEventListener('input', markDirty);
    document.addEventListener('change', markDirty);

    if (saveBtn) saveBtn.addEventListener('click', () => { saveToCloud(); });
    const dashboardLink = $('cloudDashboardLink');
    if (dashboardLink) dashboardLink.addEventListener('click', async event => {
      if (cloudConflict) {
        event.preventDefault();
        if (confirm('The cloud copy has newer edits. Your local version is still stored in this browser. Open Dashboard to review the cloud copy without replacing this local backup?')) {
          allowLeaveAfterConflict = true;
          location.href = dashboardLink.href;
        }
        return;
      }
      if (!cloudUser || (!hasUnsavedChanges() && !savePending)) return;
      event.preventDefault();
      if (!canWriteUser(cloudUser)) {
        setChip('err', 'Changes not synced');
        setStatus('Cannot share the latest local edits: your role is read-only, so the cloud copy has not been updated. Export a backup or discard the local changes first.');
        return;
      }
      if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
      setStatus('Saving the latest changes to cloud before opening Dashboard…');
      const result = await saveToCloud();
      if (result.ok && !result.unsaved && !hasUnsavedChanges()) {
        setStatus('Latest cloud save confirmed. Opening Dashboard…');
        location.href = dashboardLink.href;
      } else if (result.ok) {
        setStatus('A newer edit is still syncing. Wait for “Cloud saved”, then open Dashboard again.');
      }
    });
    window.addEventListener('beforeunload', event => {
      if (allowLeaveAfterConflict || !cloudUser || opening || !hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    });
    window.addEventListener('online', () => scheduleAutoSave(150));

    const api = root.PlatformAPI;
    if (!api) {
      setStatus('Platform API is unavailable. Your local browser backup is preserved.');
      return;
    }

    let available = false;
    try { available = await api.isAvailable(); } catch (_) {}
    if (!available) {
      setChip('off', 'Local backup only');
      if (saveBtn) saveBtn.hidden = true;
      setStatus('No cloud backend is connected here. This browser backup is preserved; Vercel Preview does not read or write production data.');
      return;
    }

    try { cloudUser = await api.currentUser(); } catch (_) { cloudUser = null; }
    const user = cloudUser;
    const canWriteNow = canWriteUser(user);
    if (user) {
      setChip(canWriteNow ? 'on' : 'off', canWriteNow ? 'Cloud connected' : 'Cloud read-only');
      setStatus(canWriteNow
        ? 'Signed in. Changes auto-sync to cloud after you pause; this browser remains an offline backup.'
        : 'Signed in with read-only access. This browser still keeps a local backup.');
      if (saveBtn) {
        saveBtn.hidden = false;
        saveBtn.disabled = !canWriteNow;
        saveBtn.title = canWriteNow ? 'Save this quotation to cloud now' : 'Your role is read-only';
      }
    } else {
      setChip('off', 'Sign in to sync');
      setStatus('Your browser backup is safe. Sign in on Dashboard to make cloud the primary saved copy.');
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
    if (!openId && canWriteNow && root.__qsFreshLocalId) {
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

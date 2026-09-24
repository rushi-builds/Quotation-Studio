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
    const revs = readRevs();
    revs[cloudId] = Math.floor(n);
    writeRevs(revs);
  }
  function knownRev(cloudId) {
    const revs = readRevs();
    const n = Number(cloudId && revs[cloudId]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  function cloudIdFor(localId) {
    const map = readMap();
    return (localId && map[localId]) || null;
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

  async function saveToCloud() {
    const api = root.PlatformAPI;
    if (!api) return;
    const btn = $('cloudSaveBtn');
    if (btn) btn.disabled = true;
    setChip('sync', 'Saving…');
    try {
      const user = await api.currentUser();
      if (!user) {
        setChip('off', 'Sign in on Dashboard');
        setStatus('Sign in on the Dashboard first, then return here to save to cloud.');
        return;
      }
      /* Prefer flushing local autosave so cloud gets the latest on-screen values. */
      try {
        if (typeof root.__qsSaveNow === 'function') root.__qsSaveNow();
      } catch (_) {}

      const payload = collectPayload();
      if (!payload) throw new Error('Studio is not ready yet');

      const localId = payload.localId;
      let cloudId = cloudIdFor(localId);
      /* Also honour a cloud id already stashed on the URL from Dashboard open. */
      try {
        const q = new URLSearchParams(location.search).get('cloud');
        if (q) cloudId = q;
      } catch (_) {}

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
            return;
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
      setChip('on', 'Saved in cloud');
      setStatus('Saved to cloud · ' + (result.proposal.ref || result.proposal.title || cloudId));
      /* Keep ?cloud= in the URL so the next save updates the same row. */
      try {
        const u = new URL(location.href);
        u.searchParams.set('cloud', cloudId);
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch (_) {}
    } catch (err) {
      setChip('err', 'Cloud error');
      setStatus(err.message || 'Cloud save failed');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function applyCloudProposal(proposal) {
    const P = root.Proposals;
    const S = root.StateStore;
    if (!P || !S || !proposal) return false;

    const form = proposal.form || {};
    /* Create a fresh local blob so we never overwrite an unrelated local draft
       without the user noticing. */
    const blob = P.create(form, {
      status: proposal.status || 'draft',
      content: proposal.content || null,
      projectImages: proposal.projectImages || null,
      pageImages: proposal.pageImages || null,
      options: proposal.options || [],
      sentAt: proposal.sentAt || null,
      acceptedAt: proposal.acceptedAt || null,
      prevId: proposal.prevId || null
    });
    if (proposal.sentAt) blob.sentAt = proposal.sentAt;
    if (proposal.acceptedAt) blob.acceptedAt = proposal.acceptedAt;
    P.put(blob);
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
    return true;
  }

  async function openFromCloud(cloudId) {
    const api = root.PlatformAPI;
    if (!api || !cloudId) return;
    setChip('sync', 'Loading…');
    try {
      const user = await api.currentUser();
      if (!user) {
        setChip('off', 'Sign in on Dashboard');
        setStatus('Sign in on the Dashboard to open cloud proposals.');
        return;
      }
      const r = await api.getProposal(cloudId);
      const ok = applyCloudProposal(r.proposal);
      if (ok) {
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
    }
  }

  async function initCloudBridge() {
    const bar = $('studioCloudBar');
    if (bar) bar.hidden = false;

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
      if (saveBtn) saveBtn.hidden = false;
    } else {
      setChip('off', 'Sign in on Dashboard');
      if (saveBtn) saveBtn.hidden = true;
    }

    /* Open request from Dashboard */
    let openId = null;
    try { openId = new URLSearchParams(location.search).get('cloud'); } catch (_) {}
    if (!openId) {
      try {
        openId = sessionStorage.getItem(OPEN_KEY);
        if (openId) sessionStorage.removeItem(OPEN_KEY);
      } catch (_) {}
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
    cloudIdFor
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

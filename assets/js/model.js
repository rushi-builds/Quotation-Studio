/* ==========================================================================
   Quotation Studio — Proposal Data Model & Store  (Phase 1 foundation)
   --------------------------------------------------------------------------
   The Proposal is the platform's central object (see docs/ROADMAP.md):

     Proposal {
       id, ref, version, status, title,
       createdAt, updatedAt, sentAt?, acceptedAt?,
       prevId?                       — version chain (never overwrite history)
       form          — all proposal inputs (customer, site, system, financial…)
       content       — brochure text overrides (proposal-specific wording)
       projectImages — photo overrides (dataURLs where quota allows)
     }

   Storage (localStorage in Phase 1; the API is backend-ready):
     qstudio.proposals.index   — lightweight index of all proposals
     qstudio.proposal.<id>     — full proposal blob
     qstudio.activeId          — id currently open in the builder
     qstudio.proposal.v2       — legacy single-proposal key (migrated on init)

   Rules honoured from the product blueprint:
     - versions are immutable: "New version" clones and bumps, never overwrites
     - status is an explicit workflow field, not a guess
   ========================================================================== */
'use strict';

(function (root) {
  const INDEX_KEY = 'qstudio.proposals.index';
  const ACTIVE_KEY = 'qstudio.activeId';
  const LEGACY_KEY = 'qstudio.proposal.v2';
  const blobKey = (id) => 'qstudio.proposal.' + id;

  const STATUSES = [
    { id: 'draft', label: 'Draft' },
    { id: 'internal_review', label: 'Internal Review' },
    { id: 'ready', label: 'Ready' },
    { id: 'sent', label: 'Sent' },
    { id: 'viewed', label: 'Viewed' },
    { id: 'negotiation', label: 'Negotiation' },
    { id: 'accepted', label: 'Accepted' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'expired', label: 'Expired' },
    { id: 'archived', label: 'Archived' }
  ];
  const statusLabel = (id) => {
    const s = STATUSES.find((x) => x.id === id);
    return s ? s.label : (id || 'Draft');
  };

  function uid() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function readJSON(key) {
    try { const r = root.localStorage.getItem(key); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  function writeJSON(key, val) {
    try { root.localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function nowISO() { return new Date().toISOString(); }

  /* ---------- index ---------- */
  function list() { return readJSON(INDEX_KEY) || []; }
  function saveIndex(ix) { writeJSON(INDEX_KEY, ix); }
  function upsertIndex(entry) {
    const ix = list().filter((p) => p.id !== entry.id);
    ix.unshift(entry);
    saveIndex(ix);
  }
  function metaFor(blob) {
    const f = blob.form || {};
    return {
      id: blob.id,
      ref: f.propRef || '',
      version: f.propVersion || '1.0',
      title: (f.custName || 'Untitled customer') + ' — ' + (f.capacity || '0') + ' kWp',
      status: blob.status || 'draft',
      customer: f.custName || '',
      capacity: f.capacity || '',
      createdAt: blob.createdAt,
      updatedAt: blob.updatedAt
    };
  }

  /* ---------- CRUD ---------- */
  function create(form, extras) {
    const blob = Object.assign({
      id: uid(),
      status: 'draft',
      version: '1.0',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      form: form || {},
      content: null,
      projectImages: null
    }, extras || {});
    put(blob);
    return blob;
  }

  function get(id) { return readJSON(blobKey(id)); }

  function put(blob) {
    blob.updatedAt = nowISO();
    writeJSON(blobKey(blob.id), blob);
    upsertIndex(metaFor(blob));
  }

  function remove(id) {
    try { root.localStorage.removeItem(blobKey(id)); } catch (e) { /* noop */ }
    saveIndex(list().filter((p) => p.id !== id));
    if (activeId() === id) {
      const first = list()[0];
      if (first) setActive(first.id); else root.localStorage.removeItem(ACTIVE_KEY);
    }
  }

  function duplicate(id) {
    const b = get(id);
    if (!b) return null;
    const copy = JSON.parse(JSON.stringify(b));
    copy.id = uid();
    copy.createdAt = nowISO();
    copy.status = 'draft';
    copy.prevId = null; /* a copy is a new history, not a version */
    copy.form = JSON.parse(JSON.stringify(b.form || {}));
    if (b.form && b.form.custName) copy.form.custName = b.form.custName + ' (copy)';
    put(copy);
    return copy;
  }

  /** Immutable versioning: clone the proposal, bump the minor version,
      link backwards. The original blob is never modified. */
  function saveAsVersion(id) {
    const b = get(id);
    if (!b) return null;
    const nb = JSON.parse(JSON.stringify(b));
    nb.id = uid();
    nb.createdAt = nowISO();
    nb.status = 'draft';
    nb.prevId = id;
    const v = String((b.form && b.form.propVersion) || '1.0');
    const parts = v.split('.').map((n) => parseInt(n, 10) || 0);
    nb.form = JSON.parse(JSON.stringify(b.form || {}));
    nb.form.propVersion = parts[0] + '.' + ((parts[1] || 0) + 1);
    put(nb);
    return nb;
  }

  function setStatus(id, status) {
    const b = get(id);
    if (!b) return null;
    b.status = status;
    if (status === 'sent' && !b.sentAt) b.sentAt = nowISO();
    if (status === 'accepted' && !b.acceptedAt) b.acceptedAt = nowISO();
    put(b);
    return b;
  }

  /* ---------- active proposal ---------- */
  function activeId() { return root.localStorage.getItem(ACTIVE_KEY) || null; }
  function setActive(id) { root.localStorage.setItem(ACTIVE_KEY, id); }

  function active() { return get(activeId()); }

  /** Save working state into the active proposal blob. */
  function saveActive(form, content, projectImages) {
    const id = activeId();
    let b = id ? get(id) : null;
    if (!b) { b = create(form || {}); setActive(b.id); }
    b.form = form || b.form || {};
    if (content) b.content = content;
    if (projectImages) b.projectImages = projectImages;
    put(b);
    return b;
  }

  /* ---------- boot / migration ---------- */
  function init() {
    let ix = list();
    if (!ix.length) {
      const legacy = readJSON(LEGACY_KEY);
      if (legacy && legacy.form) {
        const b = create(legacy.form, {
          content: legacy.content || null,
          projectImages: legacy.projectImages || null
        });
        if (legacy.savedAt) b.createdAt = legacy.savedAt;
        put(b);
        setActive(b.id);
      } else {
        const b = create({});
        setActive(b.id);
      }
      ix = list();
    }
    if (!activeId() || !get(activeId())) {
      if (ix.length) setActive(ix[0].id);
    }
    return list();
  }

  root.Proposals = {
    STATUSES, statusLabel, list, create, get, put, remove,
    duplicate, saveAsVersion, setStatus,
    activeId, setActive, active, saveActive, init,
    KEYS: { INDEX_KEY, ACTIVE_KEY, LEGACY_KEY }
  };
})(typeof self !== 'undefined' ? self : this);

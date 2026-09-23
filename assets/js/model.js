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
       projectImages — project thumbnail overrides (dataURLs where quota allows)
       pageImages    — page photograph overrides, keyed by image element ID
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
    /* Manual marker only: the studio cannot verify that a customer opened the
       proposal, so this is never presented as activity tracking. */
    { id: 'viewed', label: 'Viewed (marked manually)' },
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

  /* ---------- customer-facing proposal numbers ----------
     A local sequence: unique inside this browser and workspace. Numbers issued
     in two different browsers (or two devices) cannot be coordinated without a
     server, so the studio never claims more than that. */
  const REF_SEQ_KEY = 'qstudio.refSeq';
  const REF_PATTERN = /^KTM\/(\d{4})\/Solar\/(\d+)$/;
  function refsInUse() {
    return new Set(list().map((p) => (p.ref || '').trim()).filter(Boolean));
  }
  function nextRef() {
    const year = new Date().getFullYear();
    const used = refsInUse();
    let seq = 0;
    try { seq = parseInt(root.localStorage.getItem(REF_SEQ_KEY) || '0', 10) || 0; } catch (e) { seq = 0; }
    /* Never reissue a number that a proposal in this workspace already uses. */
    let candidate = '';
    do {
      seq += 1;
      candidate = 'KTM/' + year + '/Solar/' + String(seq).padStart(3, '0');
    } while (used.has(candidate) && seq < 10000);
    try { root.localStorage.setItem(REF_SEQ_KEY, String(seq)); } catch (e) {}
    return candidate;
  }

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
  function saveIndex(ix) { return writeJSON(INDEX_KEY, ix); }
  function upsertIndex(entry) {
    const ix = list().filter((p) => p.id !== entry.id);
    ix.unshift(entry);
    return saveIndex(ix);
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
      projectImages: null,
      pageImages: null,
      options: []
    }, extras || {});
    put(blob);
    return blob;
  }

  function get(id) { return readJSON(blobKey(id)); }

  function put(blob) {
    const key = blobKey(blob.id), previous = get(blob.id);
    if (previous && staleFor(blob.id)) {
      /* Another tab saved a newer revision of this same proposal. */
      try { root.dispatchEvent(new CustomEvent('qs:saveconflict', { detail: { id: blob.id } })); } catch (e) {}
      return false;
    }
    blob.updatedAt = nowISO();
    if (!writeJSON(key, blob)) return false;
    /* The baseline only advances once the write really landed, so a failed
       save (quota, private mode) can be retried once storage recovers. */
    if (upsertIndex(metaFor(blob))) { baseline[blob.id] = blob.updatedAt; return true; }
    // Do not leave ghost/orphan proposals when storage fills between the
    // document write and its index entry. Existing content remains recoverable.
    if (previous) writeJSON(key, previous);
    else { try { root.localStorage.removeItem(key); } catch (_) {} }
    return false;
  }

  function remove(id) {
    try { root.localStorage.removeItem(blobKey(id)); } catch (e) { /* noop */ }
    saveIndex(list().filter((p) => p.id !== id));
    if (activeId() === id) {
      const first = list()[0];
      if (first) setActive(first.id); else root.localStorage.removeItem(ACTIVE_KEY);
    }
  }

  function clearAcknowledgement(blob) {
    ['sentAt', 'acceptedAt', 'viewedAt', 'rejectedAt', 'signerName', 'consentConfirmed', 'acceptanceMethod'].forEach(key => delete blob[key]);
  }

  function duplicate(id) {
    const b = get(id);
    if (!b) return null;
    const copy = JSON.parse(JSON.stringify(b));
    copy.id = uid();
    copy.createdAt = nowISO();
    copy.status = 'draft';
    clearAcknowledgement(copy);
    copy.prevId = null; /* a copy is a new history, not a version */
    copy.form = JSON.parse(JSON.stringify(b.form || {}));
    if (b.form && b.form.custName) copy.form.custName = b.form.custName + ' (copy)';
    if (copy.form.propRef) copy.form.propRef = nextRef();  /* never two live proposals with one number */
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
    clearAcknowledgement(nb);
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
  /* The shared localStorage key is only the 'last opened' hint. Each tab keeps
     its own copy so that two tabs on two proposals cannot cross-save into each
     other's proposal when they switch. */
  const TAB_KEY = 'qstudio.tabActiveId';
  function tabId() {
    try { return root.sessionStorage.getItem(TAB_KEY) || null; } catch (e) { return null; }
  }
  function activeId() {
    const own = tabId();
    if (own) return own;
    try { return root.localStorage.getItem(ACTIVE_KEY) || null; } catch (e) { return null; }
  }
  function setActive(id) {
    try { root.sessionStorage.setItem(TAB_KEY, id); } catch (e) {}
    try { root.localStorage.setItem(ACTIVE_KEY, id); } catch (e) {}
  }

  /* ---------- stale-write guard ----------
     baseline[id] is the revision this tab last wrote or knowingly accepted. If
     browser storage holds a different, newer revision than that, another tab
     (or a restored session) owns the newer content: refuse to overwrite it and
     tell the user, instead of silently discarding their work. */
  const baseline = {};
  function markAccepted(id) {
    const b = id ? get(id) : null;
    if (b) baseline[id] = b.updatedAt || null;
  }
  function staleFor(id) {
    if (!id || !(id in baseline)) return false;
    const stored = get(id);
    if (!stored) return false;
    const known = baseline[id];
    if (!known || !stored.updatedAt) return false;
    return stored.updatedAt !== known;
  }

  function active() { return get(activeId()); }

  /** Save working state into the active proposal blob. */
  function saveActive(form, content, projectImages, options, pageImages) {
    const id = activeId();
    let b = id ? get(id) : null;
    if (!b) { b = create(form || {}); setActive(b.id); }
    b.form = form || b.form || {};
    if (content) b.content = content;
    if (projectImages) b.projectImages = projectImages;
    if (options) b.options = options;
    if (pageImages) b.pageImages = pageImages;
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

  /** Reset the proposal to Draft and drop every hand-recorded acknowledgement. */
  function resetToDraft(id) {
    const b = get(id);
    if (!b) return null;
    b.status = 'draft';
    clearAcknowledgement(b);
    put(b);
    return b;
  }

  root.Proposals = {
    STATUSES, statusLabel, list, create, get, put, remove, markAccepted, resetToDraft, nextRef,
    duplicate, saveAsVersion, setStatus,
    activeId, setActive, active, saveActive, init,
    KEYS: { INDEX_KEY, ACTIVE_KEY, LEGACY_KEY }
  };
})(typeof self !== 'undefined' ? self : this);

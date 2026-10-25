/* ==========================================================================
   Quotation Studio - Equipment Catalog
   --------------------------------------------------------------------------
   Built-in master data (modules / inverters / cables) ships in
   catalogue-data.js, generated from the company Excel workbook's
   MODULE_DB / INVERTER_DB / CABLE_DB tables as an offline fallback. A
   complete synced Excel snapshot replaces it. Legacy browser rows remain
   archived in their original key, without overriding the catalogue.

   Make dropdowns: the real makes first, combined "X / Y or Equivalent"
   entries next (their calculation basis is the first named make), then
   Custom… last. The model dropdown cascades from the make. For an
   equivalent or a custom make the model box becomes a free-type field:
   typing a wattage (or kW) loads the nearest catalogue model's own
   values - exact make-level entries without models still autofill.
   ========================================================================== */
'use strict';

(function (root) {
  const KEY = 'qstudio.equipment';
  const CLOUD_KEY = 'qsCloudCatalogue';
  const LEGACY_SEED_IDS = new Set(['m1', 'm2', 'm3', 'i1', 'i2', 'i3', 'i4', 's1', 's2', 'c1', 'c2']);
  const $ = (id) => document.getElementById(id);

  const FIELDS = ['moduleMake', 'moduleModel', 'moduleTech', 'inverterMake', 'inverterModel', 'mountMake', 'cableMake', 'roofType'];
  const KIND_OF = { moduleMake: 'modules', inverterMake: 'inverters', mountMake: 'structures', cableMake: 'cables' };
  const MODEL_OF = {
    moduleModel: { makeId: 'moduleMake', kind: 'modules', unit: 'Wp', valueKey: 'wp' },
    inverterModel: { makeId: 'inverterMake', kind: 'inverters', unit: 'kW', valueKey: 'kw' }
  };
  const MAKE_ORDER = {
    modules: ['Waaree', 'Adani', 'Anchor by Panasonic', 'Premier Energies', 'Vikram Solar'],
    inverters: ['Sungrow', 'Growatt', 'Fronius', 'Huawei'],
    cables: ['Polycab', 'Havells']
  };
  const EQUIVALENTS = {
    modules: [
      { label: 'Waaree / Panasonic or Equivalent', basis: 'Waaree' },
      { label: 'Waaree / Vikram Solar or Equivalent', basis: 'Waaree' },
      { label: 'Adani / Premier Energies or Equivalent', basis: 'Adani' }
    ],
    inverters: [
      { label: 'Sungrow / Growatt or Equivalent', basis: 'Sungrow' },
      { label: 'Fronius / Sungrow or Equivalent', basis: 'Fronius' }
    ],
    cables: [
      { label: 'Polycab / Havells or Equivalent', basis: 'Polycab' }
    ]
  };
  /* Makes quoted by proposals saved before the Excel catalogue shipped. */
  const MAKE_ALIASES = {
    'Panasonic / Waaree / Adani or Equivalent': 'Waaree / Panasonic or Equivalent',
    'Premier Energies or Equivalent': 'Premier Energies',
    'Vikram Solar or Equivalent': 'Vikram Solar',
    'Sungrow / Fronius or Equivalent': 'Fronius / Sungrow or Equivalent',
    'Growatt or Equivalent': 'Growatt',
    'Polycab / KEI or Equivalent': 'Polycab',
    'Havells or Equivalent': 'Havells'
  };

  /* ------------------------------------------------------------------ */
  /* Catalog data                                                        */
  /* ------------------------------------------------------------------ */
  function legacySeed() {
    return {
      modules: [
        { id: 'm1', make: 'Panasonic / Waaree / Adani or Equivalent', model: '', wp: 545, tech: 'Mono PERC Half-Cut', lengthMm: 2278, widthMm: 1134, efficiency: '', voc: '', isc: '', vmp: '', imp: '' },
        { id: 'm2', make: 'Premier Energies or Equivalent', model: '', wp: 545, tech: 'Mono PERC Half-Cut', lengthMm: 2278, widthMm: 1134, efficiency: '', voc: '', isc: '', vmp: '', imp: '' },
        { id: 'm3', make: 'Vikram Solar or Equivalent', model: '', wp: 545, tech: 'Mono PERC Half-Cut', lengthMm: 2278, widthMm: 1134, efficiency: '', voc: '', isc: '', vmp: '', imp: '' }
      ],
      inverters: [
        { id: 'i4', make: 'Sungrow / Fronius or Equivalent', model: '', kw: '', mppt: '', efficiency: '' },
        { id: 'i1', make: 'Deye or Equivalent', model: '', kw: '', mppt: '', efficiency: '' },
        { id: 'i2', make: 'Growatt or Equivalent', model: '', kw: '', mppt: '', efficiency: '' },
        { id: 'i3', make: 'Luminous or Equivalent', model: '', kw: '', mppt: '', efficiency: '' }
      ],
      structures: [
        { id: 's1', label: 'Hot-Dip GI / Aluminum-ARS Solartech make' },
        { id: 's2', label: 'Hot-Dip GI - In-house KTM manufactured' }
      ],
      cables: [
        { id: 'c1', label: 'Polycab / KEI or Equivalent' },
        { id: 'c2', label: 'Havells or Equivalent' }
      ]
    };
  }

  function builtin() {
    const d = root.CATALOGUE_DATA;
    if (!d || !Array.isArray(d.modules) || !d.modules.length) return legacySeed();
    return {
      modules: d.modules,
      inverters: Array.isArray(d.inverters) ? d.inverters : [],
      structures: legacySeed().structures,
      cables: Array.isArray(d.cables) ? d.cables : [],
      version: d.version || ''
    };
  }

  function loadUser() {
    const empty = { modules: [], inverters: [], structures: [], cables: [] };
    try {
      const raw = root.localStorage.getItem(KEY);
      if (!raw) return empty;
      const old = JSON.parse(raw);
      if (!old || typeof old !== 'object') return empty;
      if (old._v === 2) {
        return {
          modules: Array.isArray(old.modules) ? old.modules : [],
          inverters: Array.isArray(old.inverters) ? old.inverters : [],
          structures: Array.isArray(old.structures) ? old.structures : [],
          cables: Array.isArray(old.cables) ? old.cables : []
        };
      }
      const keep = (arr) => (Array.isArray(arr) ? arr.filter((r) => r && !LEGACY_SEED_IDS.has(r.id)) : []);
      return { modules: keep(old.modules), inverters: keep(old.inverters), structures: keep(old.structures), cables: keep(old.cables) };
    } catch (e) { return empty; }
  }

  let userCache = null, cloudCache = null, merged = null, cacheSaved = true;
  function userRows() { if (!userCache) userCache = loadUser(); return userCache; }

  /* Cloud-synced catalogue rows (from the Sync Catalogue button). They live in
     their own storage key so the per-proposal user rows never absorb them. */
  function loadCloud() {
    const empty = { syncedAt: '', source: '', sha: '', counts: {}, modules: [], inverters: [], structures: [], cables: [] };
    try {
      const raw = root.localStorage.getItem(CLOUD_KEY);
      if (!raw) return empty;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || !Array.isArray(d.modules)) return empty;
      return {
        syncedAt: String(d.syncedAt || ''),
        source: String(d.source || ''),
        sha: String(d.sha || ''),
        counts: d.counts && typeof d.counts === 'object' ? d.counts : {},
        modules: (d.modules || []).filter((r) => r && r.model),
        inverters: (d.inverters || []).filter((r) => r && r.model),
        structures: [],
        cables: (d.cables || []).filter((r) => r && r.make)
      };
    } catch (e) { return empty; }
  }
  function cloudRows() { if (!cloudCache) cloudCache = loadCloud(); return cloudCache; }

  function importCloud(data) {
    if (!data || !['modules','inverters','cables'].every(kind => Array.isArray(data[kind]) && data[kind].length && data[kind].every(row => row && typeof row === 'object' && (kind === 'cables' ? row.make : row.make && row.model)))) {
      throw new Error('The Excel catalogue is incomplete. The previous catalogue has been kept.');
    }
    const clean = (arr) => (Array.isArray(arr) ? arr.filter((r) => r && typeof r === 'object') : []);
    cloudCache = {
      syncedAt: String((data && data.syncedAt) || new Date().toISOString()),
      source: String((data && data.source) || ''),
      sha: String((data && data.sha) || ''),
      counts: (data && data.counts) && typeof data.counts === 'object' ? data.counts : {},
      modules: clean(data && data.modules),
      inverters: clean(data && data.inverters),
      structures: [],
      cables: clean(data && data.cables)
    };
    cacheSaved = true;
    try { root.localStorage.setItem(CLOUD_KEY, JSON.stringify(cloudCache)); } catch (e) { cacheSaved = false; }
    merged = null;
    refreshSelects();
    return cloudInfo();
  }
  function cloudInfo() {
    const c = cloudRows();
    return { persisted: cacheSaved, syncedAt: c.syncedAt, source: c.source, sha: c.sha, counts: c.counts, modules: c.modules.length, inverters: c.inverters.length, cables: c.cables.length };
  }

  /* Excel is the single catalogue source, including its rating-bin rows.
     Legacy browser rows stay archived; saved proposal fields are untouched. */
  function cat() {
    if (!merged) {
      const b = builtin(), c = cloudRows();
      const synced = c.syncedAt && c.modules.length && c.inverters.length && c.cables.length;
      merged = {
        modules: (synced ? c.modules : b.modules).slice(),
        inverters: (synced ? c.inverters : b.inverters).slice(),
        structures: b.structures.slice(), // Not imported: no structure table in this sync.
        cables: (synced ? c.cables : b.cables).slice()
      };
    }
    return merged;
  }

  // Compatibility persistence for archived user rows only; no UI calls this.
  function persistUser() {
    merged = null;
    try {
      const u = userRows();
      root.localStorage.setItem(KEY, JSON.stringify({ ...u, _v: 2 }));
      return true;
    } catch (e) { return false; }
  }

  // Compatibility only: preserve archived local rows; never rebuild them from Excel.
  function save() { return persistUser(); }

  /* ------------------------------------------------------------------ */
  /* Select wiring                                                       */
  /* ------------------------------------------------------------------ */
  function isCustom(sel) { return !!sel.selectedOptions[0]?.hasAttribute('data-custom'); }
  function syncCustom(sel) {
    const input = $(sel.id + 'Custom'), wrap = $(sel.id + 'CustomWrap');
    const active = isCustom(sel);
    if (wrap) wrap.hidden = !active;
    if (input) input.disabled = !active;
  }
  function numOf(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
  function firstNum(v) { const m = String(v).match(/-?\d+(\.\d+)?/); return m ? m[0] : null; }

  function makeLabels(kind) {
    const seen = [];
    cat()[kind].forEach((e) => {
      const m = String((e && e.make) || (e && e.label) || '').trim();
      if (m && !seen.includes(m)) seen.push(m);
    });
    const preferred = (MAKE_ORDER[kind] || []).filter((m) => seen.includes(m));
    const rest = seen.filter((m) => !preferred.includes(m)).sort();
    return preferred.concat(rest, (EQUIVALENTS[kind] || []).map((e) => e.label));
  }

  function techLabels() {
    const seen = [];
    cat().modules.forEach((m) => {
      const t = m && m.cellType ? String(m.cellType) : '';
      if (t && !seen.includes(t)) seen.push(t);
    });
    return seen;
  }

  function fillSelect(sel, value, keepCustom, clearDraft) {
    const id = sel.id;
    const input = $(id + 'Custom');
    if (MAKE_ALIASES[value]) value = MAKE_ALIASES[value];
    value = value == null ? '' : String(value);
    if (clearDraft) input.value = '';
    const manual = new Option('Custom…', input.value);
    manual.setAttribute('data-custom', '');
    let labels;
    if (id === 'moduleTech') labels = techLabels();
    else if (KIND_OF[id]) labels = makeLabels(KIND_OF[id]);
    else labels = [...sel.options].filter((o) => !o.hasAttribute('data-custom')).map((o) => o.value);
    sel.replaceChildren(...labels.map((label) => new Option(label, label)), manual);
    if (!keepCustom && labels.includes(value)) sel.value = value;
    else { input.value = value; manual.value = value; manual.selected = true; }
    syncCustom(sel);
  }

  function basisInfo(modelId) {
    const cfg = MODEL_OF[modelId];
    const makeSel = $(cfg.makeId);
    const makeValue = makeSel ? makeSel.value : '';
    const eq = (EQUIVALENTS[cfg.kind] || []).find((e) => e.label === makeValue);
    if (eq) return { basis: eq.basis, freeType: true };
    if (makeSel && isCustom(makeSel)) return { basis: null, freeType: true };
    return { basis: makeValue, freeType: false };
  }

  function modelRows(cfg, basis) {
    if (!basis) return [];
    return cat()[cfg.kind].filter((r) => r && r.model && String(r.make || r.label || '') === basis);
  }

  function currentTarget(cfg) {
    if (cfg.kind === 'modules') {
      const w = numOf($('moduleWattage') ? $('moduleWattage').value : '');
      return w !== null ? w : 545;
    }
    const k = numOf($('inverterKw') ? $('inverterKw').value : '');
    if (k !== null) return k;
    const cap = numOf($('capacity') ? $('capacity').value : '');
    return cap !== null ? cap : 7;
  }

  /* Nearest by rating; on a tie the larger model wins so the pick covers
     the project's load. */
  function closestRow(rows, target, key) {
    let best = null, bestScore = Infinity;
    rows.forEach((r) => {
      const v = numOf(r[key]);
      if (v === null) return;
      const score = Math.abs(v - target) * 2 + (v < target ? 1 : 0);
      if (score < bestScore) { bestScore = score; best = r; }
    });
    return best;
  }

  function syncModelSelect(modelId, opts) {
    opts = opts || {};
    const cfg = MODEL_OF[modelId];
    const sel = $(modelId), input = $(modelId + 'Custom');
    if (!sel || !input) return;
    const info = basisInfo(modelId);
    const rows = modelRows(cfg, info.basis);
    const wanted = opts.value === undefined || opts.value === null ? '' : String(opts.value);
    const manual = new Option('Custom…', input.value);
    manual.setAttribute('data-custom', '');
    if (info.freeType || rows.length === 0) {
      sel.replaceChildren(manual);
      let draft = wanted;
      if (draft === '' && opts.auto !== false && info.basis) {
        const pick = closestRow(rows, currentTarget(cfg), cfg.valueKey);
        if (pick) draft = pick.model;
      }
      input.value = draft; manual.value = draft; manual.selected = true;
    } else {
      const options = rows.slice()
        .sort((a, b) => (numOf(a[cfg.valueKey]) || 0) - (numOf(b[cfg.valueKey]) || 0))
        .map((r) => new Option(r.model + ' (' + r[cfg.valueKey] + ' ' + cfg.unit + ')', r.model));
      sel.replaceChildren(...options, manual);
      const byName = rows.find((r) => String(r.model) === wanted);
      if (byName) { sel.value = wanted; input.value = ''; }
      else if (wanted !== '') {
        const n = numOf(wanted);
        const byValue = n !== null ? closestRow(rows, n, cfg.valueKey) : null;
        if (byValue && Math.abs(numOf(byValue[cfg.valueKey]) - n) <= (cfg.kind === 'modules' ? 10 : 1)) { sel.value = byValue.model; input.value = ''; }
        else { input.value = wanted; manual.value = wanted; manual.selected = true; }
      } else if (opts.auto !== false) {
        const pick = closestRow(rows, currentTarget(cfg), cfg.valueKey);
        if (pick) { sel.value = pick.model; input.value = ''; }
        else manual.selected = true;
      } else manual.selected = true;
    }
    syncCustom(sel);
  }

  function fire(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function set(id, v) {
    const el = $(id);
    if (!el || v === undefined || v === null || v === '') return;
    el.value = v;
  }

  /* Datasheet figures only. Cells the catalogue leaves blank are not
     touched, so a model with no electrical detail never invents a voltage.
     Fields are set silently; one input event at the end makes the whole
     cascade a single render pass. */
  function applyModel(kind, row) {
    if (!row) return;
    if (kind === 'modules') {
      set('moduleWattage', row.wp);
      set('moduleLengthMm', row.lengthMm);
      set('moduleWidthMm', row.widthMm);
      /* Excel extract rows carry cellType; user-added rows carry tech. */
      const cellType = row.cellType || row.tech;
      if (cellType) setValue('moduleTech', cellType);
      set('moduleVoc', row.voc);
      set('moduleIsc', row.isc);
      set('moduleVmp', row.vmp);
      set('moduleImp', row.imp);
      set('moduleVocBetaPct', row.tempCoefVoc);
    } else {
      set('inverterKw', row.kw);
      set('inverterVmaxDc', row.vmaxDc);
      set('mpptMinV', row.mpptMin);
      set('mpptMaxV', row.mpptMax);
      const isc = firstNum(row.maxIscA);
      if (isc !== null) set('inverterMaxCurrentA', isc);
    }
    fire($(kind === 'modules' ? 'moduleModel' : 'inverterModel'));
  }

  function findModelRow(modelId, value) {
    const cfg = MODEL_OF[modelId];
    const info = basisInfo(modelId);
    return cat()[cfg.kind].find((r) => r && r.model === value && (!info.basis || String(r.make || r.label || '') === info.basis));
  }

  function applyMake(kind, makeSel) {
    const modelId = kind === 'modules' ? 'moduleModel' : 'inverterModel';
    const cfg = MODEL_OF[modelId];
    if (isCustom(makeSel)) { syncModelSelect(modelId, { value: '', auto: false }); return; }
    const value = makeSel.value;
    const eq = (EQUIVALENTS[kind] || []).find((e) => e.label === value);
    const basis = eq ? eq.basis : value;
    const rows = cat()[kind].filter((r) => r && String(r.make || r.label || '') === basis);
    const withModel = rows.filter((r) => r && r.model);
    if (withModel.length) {
      const pick = closestRow(withModel, currentTarget(cfg), cfg.valueKey);
      if (pick) {
        applyModel(kind, pick);
        syncModelSelect(modelId, { value: pick.model, auto: false });
      } else syncModelSelect(modelId, { value: '', auto: false });
    } else if (rows.length) {
      applyModel(kind, rows[0]);
      syncModelSelect(modelId, { value: '', auto: false });
    } else syncModelSelect(modelId, { value: '', auto: false });
  }

  /* Typing in the free-type model box: a wattage loads the nearest
     catalogue model (basis make for equivalents, any make for Custom);
     a model name loads that exact model. No match leaves the manual
     technical fields exactly as typed. */
  function matchTyped(modelId, text) {
    const cfg = MODEL_OF[modelId];
    const t = String(text).trim();
    if (!t) return;
    const info = basisInfo(modelId);
    let rows = cat()[cfg.kind].filter((r) => r && r.model);
    if (info.basis) rows = rows.filter((r) => String(r.make || r.label || '') === info.basis);
    let pick = null;
    if (/^\d+(\.\d+)?$/.test(t)) {
      const n = parseFloat(t);
      pick = closestRow(rows, n, cfg.valueKey);
      if (pick && Math.abs(numOf(pick[cfg.valueKey]) - n) > (cfg.kind === 'modules' ? 10 : 1)) pick = null;
    } else {
      pick = rows.find((r) => String(r.model).toLowerCase() === t.toLowerCase());
    }
    if (pick) applyModel(cfg.kind, pick);
  }

  /* Same resolution as matchTyped/syncModels, exposed for the tech-spec
     page: a typed wattage or model name wins, otherwise an equivalent's
     basis make contributes its nearest-kW model (Custom has no basis, so
     nothing is picked for it). */
  function datasheetRow(kind, makeValue, modelValue, target) {
    const t = String(modelValue || '').trim();
    let pool = cat()[kind].filter((r) => r && r.model);
    const make = MAKE_ALIASES[String(makeValue || '')] || String(makeValue || '');
    const eq = (EQUIVALENTS[kind] || []).find((e) => e.label === make);
    const known = cat()[kind].some((r) => String((r && r.make) || (r && r.label) || '').trim() === make);
    const basis = eq ? eq.basis : (known ? make : null);
    if (basis) pool = pool.filter((r) => String(r.make || r.label || '') === basis);
    const key = kind === 'modules' ? 'wp' : 'kw';
    const tol = kind === 'modules' ? 10 : 1;
    let pick = null;
    if (/^\d+(\.\d+)?$/.test(t)) {
      const n = parseFloat(t);
      pick = closestRow(pool, n, key);
      if (pick && Math.abs(numOf(pick[key]) - n) > tol) pick = null;
    } else if (t) {
      pick = pool.find((r) => String(r.model).toLowerCase() === t.toLowerCase());
    } else if (basis && Number.isFinite(target) && target > 0) {
      pick = closestRow(pool, target, key);
    }
    return pick;
  }

  function setValue(id, value) {
    if (!FIELDS.includes(id) || !$(id)) return false;
    if (MODEL_OF[id]) {
      syncModelSelect(id, { value: value == null ? '' : String(value), auto: false });
      return true;
    }
    fillSelect($(id), value, false, true);
    if (id === 'moduleMake') syncModelSelect('moduleModel', { value: '', auto: false });
    if (id === 'inverterMake') syncModelSelect('inverterModel', { value: '', auto: false });
    return true;
  }

  /* Called at the end of StateStore.applyForm: makes are already applied,
     so each model select is reconciled against the final proposal values.
     A saved model wins; otherwise the closest catalogue model fills the
     datasheet fields, exactly like the Excel INPUT sheet. */
  function syncModels(vals) {
    vals = vals || {};
    Object.keys(MODEL_OF).forEach((modelId) => {
      const cfg = MODEL_OF[modelId];
      if (vals[cfg.makeId] === undefined) return;
      if (vals[modelId] !== undefined && vals[modelId] !== null && vals[modelId] !== '') {
        syncModelSelect(modelId, { value: String(vals[modelId]), auto: false });
        return;
      }
      const info = basisInfo(modelId);
      const rows = modelRows(cfg, info.basis);
      if (info.basis && rows.length) {
        const pick = closestRow(rows, currentTarget(cfg), cfg.valueKey);
        if (pick) {
          applyModel(cfg.kind, pick);
          syncModelSelect(modelId, { value: pick.model, auto: false });
          return;
        }
      }
      syncModelSelect(modelId, { value: '', auto: false });
    });
  }

  function refreshSelects() {
    FIELDS.forEach((id) => {
      const sel = $(id);
      if (!sel) return;
      if (MODEL_OF[id]) syncModelSelect(id, { value: sel.value, auto: false });
      else fillSelect(sel, sel.value, isCustom(sel), false);
    });
  }

  function wire() {
    FIELDS.forEach((id) => {
      const sel = $(id), input = $(id + 'Custom');
      if (!sel || !input) return;
      sel.addEventListener('input', () => syncCustom(sel));
      sel.addEventListener('change', (event) => {
        syncCustom(sel);
        if (MODEL_OF[id]) {
          const row = findModelRow(id, sel.value);
          if (!isCustom(sel) && row) applyModel(MODEL_OF[id].kind, row);
          return;
        }
        if (isCustom(sel)) { if (event.isTrusted) input.focus(); return; }
        if (id === 'moduleMake') applyMake('modules', sel);
        if (id === 'inverterMake') applyMake('inverters', sel);
      });
      const update = () => {
        const manual = sel.querySelector('option[data-custom]');
        if (!manual) return;
        manual.value = input.value;
        manual.selected = true;
        if (MODEL_OF[id]) matchTyped(id, input.value);
        // The normal bubbling form event handles render/autosave; do not
        // fire a catalog-selection change event for typed text.
      };
      input.addEventListener('input', update);
      input.addEventListener('change', update);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Retained for older embedders: no local CRUD, no destructive migration. */
  function renderManager(container) {
    if (container) container.textContent = 'Equipment is managed in the connected Excel workbook. Save your changes there, then sync the catalogue.';
  }
  function legacyInfo() {
    const u = userRows();
    return { count: ['modules','inverters','structures','cables'].reduce((n, kind) => n + u[kind].length, 0) };
  }

  root.EquipmentStore = { cat, datasheetRow, save, refreshSelects, setValue, syncModels, wire, renderManager, legacyInfo, importCloud, cloudInfo, KEY, CLOUD_KEY };
})(typeof self !== 'undefined' ? self : this);

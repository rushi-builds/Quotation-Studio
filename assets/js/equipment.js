/* ==========================================================================
   Quotation Studio - Equipment Catalog
   --------------------------------------------------------------------------
   Built-in master data (modules / inverters / cables) ships in
   catalogue-data.js, generated from the company Excel workbook's
   MODULE_DB / INVERTER_DB / CABLE_DB tables. User-added rows live in
   localStorage under the same key as before; legacy seed rows are
   migrated out (superseded by the Excel extract).

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

  let userCache = null, merged = null;
  function userRows() { if (!userCache) userCache = loadUser(); return userCache; }
  function cat() {
    if (!merged) {
      const b = builtin(), u = userRows();
      merged = {
        modules: b.modules.concat(u.modules),
        inverters: b.inverters.concat(u.inverters),
        structures: b.structures.concat(u.structures),
        cables: b.cables.concat(u.cables)
      };
    }
    return merged;
  }

  function save() {
    try {
      const b = builtin();
      const keyOf = (r) => String(r && (r.make || r.label || '') + '\u0001' + (r.model || ''));
      const bm = new Set(b.modules.map(keyOf));
      const bi = new Set(b.inverters.map(keyOf));
      const bs = new Set(b.structures.map((r) => String(r.label || r.make || '')));
      const bc = new Set(b.cables.map(keyOf));
      const c = cat(), u = userRows();
      u.modules = c.modules.filter((r) => !bm.has(keyOf(r)));
      u.inverters = c.inverters.filter((r) => !bi.has(keyOf(r)));
      u.structures = c.structures.filter((r) => !bs.has(String(r.label || r.make || '')));
      u.cables = c.cables.filter((r) => !bc.has(keyOf(r)));
      u._v = 2;
      root.localStorage.setItem(KEY, JSON.stringify(u));
      merged = null;
    } catch (e) { /* quota */ }
  }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

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
  /* Catalog manager UI (user-added rows only - the Excel extract is the */
  /* built-in master and cannot be edited here)                          */
  /* ------------------------------------------------------------------ */
  function renderManager(container, onChange) {
    if (!container) return;
    const u = userRows();
    const notify = () => { save(); refreshSelects(); if (onChange) onChange(); };
    const esc = (v) => String(v === undefined || v === null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const inp = (val, attrs, cls) => '<input type="text" value="' + esc(val) + '" ' + (attrs || '') + ' class="' + (cls || '') + '">';

    const b = builtin();
    let html = '<div class="eq-head">Built-in catalogue from the Excel workbook: ' +
      b.modules.length + ' modules · ' + b.inverters.length + ' inverters · ' +
      b.cables.length + ' cables' + (b.version ? ' (' + b.version + ')' : '') +
      '. Add company-specific rows below.</div>';

    html += '<div class="eq-head">Solar modules (yours)</div>';
    u.modules.forEach((m, idx) => {
      html += '<div class="eq-row" data-kind="module" data-idx="' + idx + '">' +
        inp(m.make, 'data-f="make" placeholder="Make / equivalent"', 'eq-grow') +
        inp(m.wp, 'data-f="wp" placeholder="Wp" class="num"', 'eq-sm') +
        inp(m.lengthMm, 'data-f="lengthMm" placeholder="L mm"', 'eq-sm') +
        inp(m.widthMm, 'data-f="widthMm" placeholder="W mm"', 'eq-sm') +
        inp(m.tech, 'data-f="tech" placeholder="Technology"', 'eq-md') +
        '<button type="button" class="eq-del" data-kind="module" data-idx="' + idx + '" title="Remove">×</button></div>';
    });
    html += '<button type="button" class="link-btn eq-add" data-kind="module">+ Add module</button>';

    html += '<div class="eq-head">Inverters (yours)</div>';
    u.inverters.forEach((iv, idx) => {
      html += '<div class="eq-row" data-kind="inverter" data-idx="' + idx + '">' +
        inp(iv.make, 'data-f="make" placeholder="Make / equivalent"', 'eq-grow') +
        inp(iv.kw, 'data-f="kw" placeholder="Rated kW (blank = sized to project)"', 'eq-sm') +
        '<button type="button" class="eq-del" data-kind="inverter" data-idx="' + idx + '" title="Remove">×</button></div>';
    });
    html += '<button type="button" class="link-btn eq-add" data-kind="inverter">+ Add inverter</button>';

    html += '<div class="eq-head">Mounting structures (yours)</div>';
    u.structures.forEach((s, idx) => {
      html += '<div class="eq-row" data-kind="structure" data-idx="' + idx + '">' +
        inp(s.label, 'data-f="label"', 'eq-grow') +
        '<button type="button" class="eq-del" data-kind="structure" data-idx="' + idx + '" title="Remove">×</button></div>';
    });
    html += '<button type="button" class="link-btn eq-add" data-kind="structure">+ Add structure</button>';

    html += '<div class="eq-head">Cabling &amp; protection (yours)</div>';
    u.cables.forEach((s, idx) => {
      html += '<div class="eq-row" data-kind="cable" data-idx="' + idx + '">' +
        inp(s.label, 'data-f="label"', 'eq-grow') +
        '<button type="button" class="eq-del" data-kind="cable" data-idx="' + idx + '" title="Remove">×</button></div>';
    });
    html += '<button type="button" class="link-btn eq-add" data-kind="cable">+ Add cable</button>';

    container.innerHTML = html;

    container.querySelectorAll('.eq-row input').forEach((input) => {
      input.addEventListener('input', () => {
        const row = input.closest('.eq-row');
        const listKey = row.dataset.kind === 'module' ? 'modules'
          : row.dataset.kind === 'inverter' ? 'inverters'
          : row.dataset.kind === 'structure' ? 'structures' : 'cables';
        const entry = u[listKey][parseInt(row.dataset.idx, 10)];
        if (!entry) return;
        entry[input.dataset.f] = input.value;
        notify();
      });
    });
    container.querySelectorAll('.eq-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.kind;
        if (k === 'module') u.modules.push({ id: uid('m'), make: 'New module', model: '', wp: '', tech: '', lengthMm: '', widthMm: '', efficiency: '', voc: '', isc: '', vmp: '', imp: '' });
        if (k === 'inverter') u.inverters.push({ id: uid('i'), make: 'New inverter', model: '', kw: '', mppt: '', efficiency: '' });
        if (k === 'structure') u.structures.push({ id: uid('s'), label: 'New structure' });
        if (k === 'cable') u.cables.push({ id: uid('c'), label: 'New cable' });
        notify();
        renderManager(container, onChange);
      });
    });
    container.querySelectorAll('.eq-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.kind;
        const idx = parseInt(btn.dataset.idx, 10);
        if (k === 'module') u.modules.splice(idx, 1);
        if (k === 'inverter') u.inverters.splice(idx, 1);
        if (k === 'structure') u.structures.splice(idx, 1);
        if (k === 'cable') u.cables.splice(idx, 1);
        notify();
        renderManager(container, onChange);
      });
    });
  }

  root.EquipmentStore = { cat, save, refreshSelects, setValue, syncModels, wire, renderManager, KEY };
})(typeof self !== 'undefined' ? self : this);

/* ==========================================================================
   Quotation Studio — Equipment Catalog  (Phase 1 foundation)
   --------------------------------------------------------------------------
   Company-level master data for modules, inverters, structures and cables.
   The editable System Design suggestions are populated from this catalog,
   while also accepting proposal-specific free text.

   Data integrity rule (per product blueprint):
     - the catalog ships with the entries the company already quotes with
     - electrical detail fields (Voc/Isc/Vmp/Imp/efficiency/MPPT…) are left
       BLANK until the team enters datasheet values — nothing is invented
     - selecting a module fills its rating/dimensions/technology into the
       form; selecting an inverter fills its rating only when one is set
   ========================================================================== */
'use strict';

(function (root) {
  const KEY = 'qstudio.equipment';

  function seed() {
    return {
      modules: [
        { id: 'm1', make: 'Panasonic / Waaree / Adani or Equivalent', model: '', wp: 545, tech: 'Mono PERC Half-Cut', lengthMm: 2278, widthMm: 1134, efficiency: '', voc: '', isc: '', vmp: '', imp: '' },
        { id: 'm2', make: 'Premier Energies or Equivalent', model: '', wp: 545, tech: 'Mono PERC Half-Cut', lengthMm: 2278, widthMm: 1134, efficiency: '', voc: '', isc: '', vmp: '', imp: '' },
        { id: 'm3', make: 'Vikram Solar or Equivalent', model: '', wp: 545, tech: 'Mono PERC Half-Cut', lengthMm: 2278, widthMm: 1134, efficiency: '', voc: '', isc: '', vmp: '', imp: '' }
      ],
      inverters: [
        { id: 'i1', make: 'Deye or Equivalent', model: '', kw: '', mppt: '', efficiency: '' },
        { id: 'i2', make: 'Growatt or Equivalent', model: '', kw: '', mppt: '', efficiency: '' },
        { id: 'i3', make: 'Luminous or Equivalent', model: '', kw: '', mppt: '', efficiency: '' }
      ],
      structures: [
        { id: 's1', label: 'Hot-Dip GI / Aluminum-ARS Solartech make' },
        { id: 's2', label: 'Hot-Dip GI — In-house KTM manufactured' }
      ],
      cables: [
        { id: 'c1', label: 'Polycab / KEI or Equivalent' },
        { id: 'c2', label: 'Havells or Equivalent' }
      ]
    };
  }

  function load() {
    try {
      const raw = root.localStorage.getItem(KEY);
      if (!raw) return seed();
      const cat = JSON.parse(raw);
      /* shallow-merge with seed so new fields appear after upgrades */
      const base = seed();
      return {
        modules: cat.modules || base.modules,
        inverters: cat.inverters || base.inverters,
        structures: cat.structures || base.structures,
        cables: cat.cables || base.cables
      };
    } catch (e) { return seed(); }
  }

  let catalog = null;
  function cat() { if (!catalog) catalog = load(); return catalog; }
  function save() {
    try { root.localStorage.setItem(KEY, JSON.stringify(cat())); } catch (e) { /* quota */ }
  }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------------------------ */
  /* Select wiring                                                       */
  /* ------------------------------------------------------------------ */
  function fillSelect(sel, entries, current) {
    if (!sel) return;
    const choices = sel.tagName === 'SELECT' ? sel : sel.list;
    if (!choices) return;
    const labels = [...new Set(entries.map((e) => e.make || e.label).filter(Boolean))];
    if (current && !labels.includes(current)) labels.push(current); /* keep historical/custom values */
    // DOM properties preserve literal ampersands, quotes and markup safely.
    choices.replaceChildren(...labels.map(label => new Option(String(label), String(label))));
    if (sel.tagName === 'SELECT' && current) sel.value = current;
    // Never rewrite a text input during a catalog refresh: keep its value/caret.
  }

  function refreshSelects() {
    const c = cat();
    fillSelect($('moduleMake'), c.modules, $('moduleMake') && $('moduleMake').value);
    fillSelect($('inverterMake'), c.inverters, $('inverterMake') && $('inverterMake').value);
    fillSelect($('mountMake'), c.structures, $('mountMake') && $('mountMake').value);
    fillSelect($('cableMake'), c.cables, $('cableMake') && $('cableMake').value);
  }

  function fire(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function applyModuleDefaults() {
    const sel = $('moduleMake');
    const entry = cat().modules.find((m) => m.make === sel.value);
    if (!entry) return;
    if (entry.wp) $('moduleWattage').value = entry.wp;
    if (entry.lengthMm) $('moduleLengthMm').value = entry.lengthMm;
    if (entry.widthMm) $('moduleWidthMm').value = entry.widthMm;
    if (entry.tech) $('moduleTech').value = entry.tech;
    ['moduleWattage', 'moduleLengthMm', 'moduleWidthMm', 'moduleTech'].forEach((id) => fire($(id)));
  }

  function applyInverterDefaults() {
    const sel = $('inverterMake');
    const entry = cat().inverters.find((i) => i.make === sel.value);
    if (!entry) return;
    if (entry.kw) { $('inverterKw').value = entry.kw; fire($('inverterKw')); }
  }

  function wire() {
    const m = $('moduleMake');
    const i = $('inverterMake');
    if (m) m.addEventListener('change', applyModuleDefaults);
    if (i) i.addEventListener('change', applyInverterDefaults);
  }

  /* ------------------------------------------------------------------ */
  /* Catalog manager UI                                                  */
  /* ------------------------------------------------------------------ */
  function renderManager(container, onChange) {
    const c = cat();
    const notify = () => { save(); refreshSelects(); if (onChange) onChange(); };

    const head = (txt) => '<div class="eq-head">' + txt + '</div>';
    const inp = (val, attrs, cls) =>
      '<input type="text" value="' + String(val === undefined || val === null ? '' : val).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '" ' + (attrs || '') + ' class="' + (cls || '') + '">';

    let html = '';
    /* modules */
    html += head('Solar modules');
    c.modules.forEach((m, idx) => {
      html += '<div class="eq-row" data-kind="module" data-idx="' + idx + '">' +
        inp(m.make, 'data-f="make" placeholder="Make / equivalent"', 'eq-grow') +
        inp(m.wp, 'data-f="wp" placeholder="Wp" class="num"', 'eq-sm') +
        inp(m.lengthMm, 'data-f="lengthMm" placeholder="L mm"', 'eq-sm') +
        inp(m.widthMm, 'data-f="widthMm" placeholder="W mm"', 'eq-sm') +
        inp(m.tech, 'data-f="tech" placeholder="Technology"', 'eq-md') +
        '<button type="button" class="eq-del" data-kind="module" data-idx="' + idx + '" title="Remove">×</button></div>';
    });
    html += '<button type="button" class="link-btn eq-add" data-kind="module">+ Add module</button>';

    /* inverters */
    html += head('Inverters');
    c.inverters.forEach((iv, idx) => {
      html += '<div class="eq-row" data-kind="inverter" data-idx="' + idx + '">' +
        inp(iv.make, 'data-f="make" placeholder="Make / equivalent"', 'eq-grow') +
        inp(iv.kw, 'data-f="kw" placeholder="Rated kW (blank = sized to project)"', 'eq-sm') +
        '<button type="button" class="eq-del" data-kind="inverter" data-idx="' + idx + '" title="Remove">×</button></div>';
    });
    html += '<button type="button" class="link-btn eq-add" data-kind="inverter">+ Add inverter</button>';

    /* structures */
    html += head('Mounting structures');
    c.structures.forEach((s, idx) => {
      html += '<div class="eq-row" data-kind="structure" data-idx="' + idx + '">' +
        inp(s.label, 'data-f="label"', 'eq-grow') +
        '<button type="button" class="eq-del" data-kind="structure" data-idx="' + idx + '" title="Remove">×</button></div>';
    });
    html += '<button type="button" class="link-btn eq-add" data-kind="structure">+ Add structure</button>';

    /* cables */
    html += head('Cabling & protection');
    c.cables.forEach((s, idx) => {
      html += '<div class="eq-row" data-kind="cable" data-idx="' + idx + '">' +
        inp(s.label, 'data-f="label"', 'eq-grow') +
        '<button type="button" class="eq-del" data-kind="cable" data-idx="' + idx + '" title="Remove">×</button></div>';
    });
    html += '<button type="button" class="link-btn eq-add" data-kind="cable">+ Add cable</button>';

    container.innerHTML = html;

    /* edit handlers */
    container.querySelectorAll('.eq-row input').forEach((input) => {
      input.addEventListener('input', () => {
        const row = input.closest('.eq-row');
        const listKey = row.dataset.kind === 'module' ? 'modules'
          : row.dataset.kind === 'inverter' ? 'inverters'
          : row.dataset.kind === 'structure' ? 'structures' : 'cables';
        const entry = cat()[listKey][parseInt(row.dataset.idx, 10)];
        if (!entry) return;
        const f = input.dataset.f;
        entry[f] = input.value;
        notify();
      });
    });
    /* add */
    container.querySelectorAll('.eq-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.kind;
        if (k === 'module') cat().modules.push({ id: uid('m'), make: 'New module', model: '', wp: '', tech: '', lengthMm: '', widthMm: '', efficiency: '', voc: '', isc: '', vmp: '', imp: '' });
        if (k === 'inverter') cat().inverters.push({ id: uid('i'), make: 'New inverter', model: '', kw: '', mppt: '', efficiency: '' });
        if (k === 'structure') cat().structures.push({ id: uid('s'), label: 'New structure' });
        if (k === 'cable') cat().cables.push({ id: uid('c'), label: 'New cable' });
        notify();
        renderManager(container, onChange); /* redraw rows */
      });
    });
    /* remove */
    container.querySelectorAll('.eq-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.kind;
        const idx = parseInt(btn.dataset.idx, 10);
        if (k === 'module') cat().modules.splice(idx, 1);
        if (k === 'inverter') cat().inverters.splice(idx, 1);
        if (k === 'structure') cat().structures.splice(idx, 1);
        if (k === 'cable') cat().cables.splice(idx, 1);
        notify();
        renderManager(container, onChange);
      });
    });
  }

  root.EquipmentStore = { load, save, cat, refreshSelects, wire, renderManager, seed, KEY };
})(typeof self !== 'undefined' ? self : this);

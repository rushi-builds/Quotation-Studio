/* ==========================================================================
   Quotation Studio - Equipment Catalog  (Phase 1 foundation)
   --------------------------------------------------------------------------
   Company-level master data for modules, inverters, structures and cables.
   System Design dropdowns use this catalog, with a final Custom option
   that reveals a proposal-specific manual entry below the dropdown.

   Data integrity rule:
     - company-entered catalogue rows stay separate from manufacturer-verified
       reference models; verified module data comes from direct datasheets
     - make and model are separate selections; an exact model fills only the
       specs its record actually contains
     - unknown/custom products keep user-entered values, but are not described
       as manufacturer-verified; no efficiency is inferred from technology
     - bifaciality is a separate module property, never an STC rear-gain bonus
     - selecting an inverter fills its rating and any sourced DC limits
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
  const MODULE_MODEL_CUSTOM_SENTINEL = '__qstudio_custom_module_model__';
  const FIELDS = ['moduleMake', 'moduleModel', 'moduleTech', 'inverterMake', 'mountMake', 'cableMake', 'roofType'];
  const CATALOG_FIELDS = {moduleMake:'modules', inverterMake:'inverters', mountMake:'structures', cableMake:'cables'};
  let baseSelectOptions = null;
  function originalSelectOptions() {
    if (!baseSelectOptions) baseSelectOptions = Object.fromEntries(FIELDS.map(id => [id,
      Array.from($(id)?.options || []).filter(option => !option.hasAttribute('data-custom'))
        .map(option => ({ value: option.value, label: option.textContent }))
    ]));
    return baseSelectOptions;
  }
  function isCustom(sel) { return !!sel?.selectedOptions[0]?.hasAttribute('data-custom'); }
  function syncCustom(sel) {
    if (!sel) return;
    const active = isCustom(sel), input = $(sel.id + 'Custom'), wrap = $(sel.id + 'CustomWrap');
    if (wrap) wrap.hidden = !active;
    if (input) input.disabled = !active;
  }
  function referenceModules() { return root.ModuleReferenceCatalog?.list?.() || []; }
  function workbookInverters() { return root.ModuleReferenceCatalog?.listInverters?.() || []; }
  function workbookCables() { return root.ModuleReferenceCatalog?.listCables?.() || []; }
  function workbookProtection() { return root.ModuleReferenceCatalog?.listProtection?.() || []; }
  function allModuleEntries() { return [...cat().modules, ...referenceModules()]; }
  function allInverterEntries() { return [...cat().inverters, ...workbookInverters()]; }
  function allCableEntries() { return [...cat().cables, ...workbookCables()]; }
  function entriesForSelect(id) {
    if (id === 'moduleMake') return allModuleEntries();
    if (id === 'inverterMake') return allInverterEntries();
    if (id === 'cableMake') return allCableEntries();
    if (id === 'mountMake') return cat().structures;
    return [];
  }
  function moduleEntriesForMake(make) {
    const seen = new Set();
    return [...referenceModules(), ...cat().modules].filter(entry => {
      const model = String(entry?.model || '').trim();
      if (!entry || entry.make !== make || !model || seen.has(model)) return false;
      seen.add(model); return true;
    });
  }
  function findModule(make, model) {
    const name = String(model || '').trim();
    if (name) {
      const verified = root.ModuleReferenceCatalog?.find?.(make, name);
      if (verified) return verified;
      return cat().modules.find(entry => entry.make === make && String(entry.model || '').trim() === name) || null;
    }
    return cat().modules.find(entry => entry.make === make && !String(entry.model || '').trim()) || null;
  }
  function fillModuleModel(value, keepCustom, clearDraft) {
    const sel = $('moduleModel'), input = $('moduleModelCustom');
    if (!sel || !input) return;
    value = value == null ? '' : String(value);
    const records = moduleEntriesForMake($('moduleMake')?.value || '');
    const placeholder = new Option(records.length ? 'Select a model…' : 'No exact model listed', '');
    placeholder.setAttribute('data-placeholder', '');
    const models = records.map(entry => {
      const label = entry.modelLabel || (entry.wp ? entry.model + ' · ' + entry.wp + ' Wp' : entry.model);
      return new Option(label, entry.model);
    });
    const manual = new Option('Custom model…', input.value || MODULE_MODEL_CUSTOM_SENTINEL);
    manual.setAttribute('data-custom', '');
    sel.replaceChildren(placeholder, ...models, manual);
    if (keepCustom && value && records.some(entry => entry.model === value)) {
      sel.value = value;
      input.value = '';
    } else if (keepCustom) {
      const customValue = value === MODULE_MODEL_CUSTOM_SENTINEL ? input.value : value;
      manual.value = customValue || MODULE_MODEL_CUSTOM_SENTINEL;
      input.value = customValue;
      manual.selected = true;
    } else if (value && records.some(entry => entry.model === value)) {
      sel.value = value;
      if (clearDraft) input.value = '';
    } else if (value) {
      input.value = value;
      manual.value = value;
      manual.selected = true;
    } else {
      if (clearDraft) input.value = '';
      placeholder.selected = true;
    }
    syncCustom(sel);
    if (!isCustom(sel)) sel.dataset.appliedModel = sel.value;
  }
  function fillSelect(sel, value, keepCustom, clearDraft) {
    const input = $(sel.id + 'Custom');
    const dynamicEntries = CATALOG_FIELDS[sel.id] ? entriesForSelect(sel.id).map(entry => entry.make || entry.label) : [];
    // Preserve the authored “Or Equivalent” options while adding exact workbook makes.
    const labels = [...new Set([
      ...(originalSelectOptions()[sel.id] || []).map(option => option.value),
      ...dynamicEntries.filter(Boolean).map(String)
    ])];
    value = value == null ? '' : String(value);
    if (clearDraft && input) input.value = '';
    const manual = new Option('Custom…', input?.value || '');
    manual.setAttribute('data-custom', '');
    // Real strings remain the canonical select value. No UI sentinel is saved
    // or rendered as an equipment name, including while Custom is empty.
    sel.replaceChildren(...labels.map(label => new Option(label, label)), manual);
    if (!keepCustom && labels.includes(value)) sel.value = value;
    else {
      if (input) input.value = value;
      manual.value = value;
      manual.selected = true;
    }
    syncCustom(sel);
  }
  function setValue(id, value) {
    if (!FIELDS.includes(id) || !$(id)) return false;
    // Restore/import/preset transitions must never carry another proposal's draft.
    if (id === 'moduleModel') fillModuleModel(value, false, true);
    else {
      fillSelect($(id), value, false, true);
      if (id === 'moduleMake') fillModuleModel('', false, true);
    }
    return true;
  }
  function refreshSelects() {
    FIELDS.forEach(id => {
      const sel = $(id);
      if (!sel) return;
      if (id === 'moduleModel') {
        const customValue = isCustom(sel) ? ($('moduleModelCustom')?.value || '') : sel.value;
        fillModuleModel(customValue, isCustom(sel), false);
      } else fillSelect(sel, sel.value, isCustom(sel), false);
    });
    refreshWorkbookProductSelectors();
  }

  function fire(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function productSnapshot(id) {
    const value = String($(id)?.value || '');
    if (!value || value.length > 30000) return null;
    try {
      const entry = JSON.parse(value);
      return entry && typeof entry === 'object' && entry.id ? entry : null;
    } catch (_) { return null; }
  }
  function writeProductSnapshot(id, entry) {
    const input = $(id);
    if (!input) return;
    input.value = entry ? JSON.stringify(entry) : '';
    fire(input);
  }
  function makeMatches(recordMake, selectedMake) {
    const target = String(recordMake || '').trim().toLowerCase();
    const selected = String(selectedMake || '').trim().toLowerCase();
    if (!target || !selected) return false;
    if (target === selected) return true;
    const choices = selected.replace(/or equivalent/gi, '').split(/[|,]/).flatMap(part => part.split('/'))
      .map(part => part.trim()).filter(Boolean);
    return choices.some(choice => choice === target || choice.startsWith(target + ' ') || target.startsWith(choice + ' '));
  }
  function workbookOptionLabel(entry, type) {
    if (type === 'inverter') return [entry.make, entry.model, entry.acKw && entry.acKw + ' kW', entry.phase && entry.phase + ' phase', entry.sourceRow && 'row ' + entry.sourceRow].filter(Boolean).join(' · ');
    if (type === 'cable') return [entry.make, entry.category, entry.sizeMm2 + ' sq.mm', entry.material, entry.cores, entry.insulation, entry.armoured === 'Yes' ? 'armoured' : '', entry.sourceRow && 'row ' + entry.sourceRow].filter(Boolean).join(' · ');
    return [entry.make, entry.model, entry.catalogNumber, entry.ratedCurrentA && entry.ratedCurrentA + ' A', entry.ratedVoltageV && entry.ratedVoltageV + ' V', entry.poles, entry.sourceRow && 'row ' + entry.sourceRow].filter(Boolean).join(' · ');
  }
  function fillWorkbookPicker(id, entries, snapshot, type, placeholderText) {
    const select = $(id);
    if (!select) return;
    const placeholder = new Option(placeholderText, '');
    const options = entries.map(entry => new Option(workbookOptionLabel(entry, type), entry.id));
    const snapshotId = snapshot && snapshot.id ? String(snapshot.id) : '';
    if (snapshotId && !entries.some(entry => entry.id === snapshotId)) {
      options.push(new Option('Saved proposal product: ' + (snapshot.modelLabel || snapshot.model || snapshot.category || 'catalogue row') + ' (not in latest sync)', snapshotId));
    }
    select.replaceChildren(placeholder, ...options);
    select.value = snapshotId || '';
  }
  function refreshWorkbookProductSelectors() {
    const inverterSnapshot = productSnapshot('inverterProductSnapshot');
    const inverterRows = workbookInverters().filter(entry => makeMatches(entry.make, $('inverterMake')?.value));
    fillWorkbookPicker('inverterWorkbookModel', inverterRows, inverterSnapshot, 'inverter',
      inverterRows.length ? 'Choose an exact model from INVERTER_DB…' : 'No matching workbook inverter — keep equivalent / manual');
    const cableSnapshot = productSnapshot('cableProductSnapshot');
    fillWorkbookPicker('workbookCableProduct', workbookCables(), cableSnapshot, 'cable', 'No exact cable product selected');

    const protectionSnapshot = productSnapshot('protectionProductSnapshot');
    const categories = root.ModuleReferenceCatalog?.listProtectionCategories?.() || [];
    const categorySelect = $('workbookProtectionCategory');
    const selectedCategory = categorySelect?.value || protectionSnapshot?.category || '';
    if (categorySelect) {
      const options = [new Option('Choose a category…', ''), ...categories.map(category => new Option(category, category))];
      if (protectionSnapshot?.category && !categories.includes(protectionSnapshot.category)) {
        options.push(new Option('Saved category: ' + protectionSnapshot.category + ' (not in latest sync)', protectionSnapshot.category));
      }
      categorySelect.replaceChildren(...options);
      categorySelect.value = selectedCategory;
    }
    const protectionRows = selectedCategory ? (root.ModuleReferenceCatalog?.listProtection?.(selectedCategory) || []) : [];
    fillWorkbookPicker('workbookProtectionProduct', protectionRows, protectionSnapshot, 'protection',
      selectedCategory ? 'No exact protection product selected' : 'Choose a category first');
  }

  const MODULE_FIELD_MAP = [
    ['wp', 'moduleWattage'], ['lengthMm', 'moduleLengthMm'], ['widthMm', 'moduleWidthMm'],
    ['efficiency', 'moduleEfficiency'], ['tech', 'moduleTech'],
    ['moduleType', 'moduleType'], ['bifaciality', 'moduleBifaciality'],
    ['voc', 'moduleVoc'], ['vmp', 'moduleVmp'], ['isc', 'moduleIsc'], ['imp', 'moduleImp'],
    ['vocBetaPct', 'moduleVocBetaPct'], ['vmpBetaPct', 'moduleVmpBetaPct'],
    ['iscAlphaPct', 'moduleIscAlphaPct'], ['pmaxBetaPct', 'modulePmaxBetaPct'],
    ['weightKg', 'moduleWeightKg']
  ];
  function applyModuleDefaults(entry) {
    if (!entry) return false;
    const touched = [];
    // Clear values from the previously selected product first. A missing field
    // stays blank; it is never carried over from a different module model.
    MODULE_FIELD_MAP.forEach(([, id]) => { const el = $(id); if (el) { el.value = ''; touched.push(id); } });
    MODULE_FIELD_MAP.forEach(([from, id]) => {
      const el = $(id), value = entry[from];
      if (!el || value === '' || value === undefined || value === null) return;
      if (id === 'moduleTech') setValue(id, value);
      else el.value = value;
    });
    touched.forEach(id => fire($(id)));
    return true;
  }
  function clearModuleDefaults() {
    const touched = [];
    MODULE_FIELD_MAP.forEach(([, id]) => {
      const el = $(id);
      if (!el) return;
      if (id === 'moduleTech') setValue(id, '');
      else el.value = '';
      touched.push(id);
    });
    touched.forEach(id => fire($(id)));
  }
  function handleModuleMakeChange() {
    const make = $('moduleMake')?.value || '';
    fillModuleModel('', false, true);
    const generic = cat().modules.find(entry => entry.make === make && !String(entry.model || '').trim());
    if (generic) applyModuleDefaults(generic);
    else if (moduleEntriesForMake(make).length) clearModuleDefaults();
  }
  function handleModuleModelChange() {
    const sel = $('moduleModel');
    if (!sel) return;
    const previous = sel.dataset.appliedModel || '';
    if (isCustom(sel)) return;
    if (!sel.value) {
      if (previous && findModule($('moduleMake')?.value || '', previous)) clearModuleDefaults();
      sel.dataset.appliedModel = '';
      return;
    }
    const entry = findModule($('moduleMake')?.value || '', sel.value);
    if (entry) applyModuleDefaults(entry);
    sel.dataset.appliedModel = sel.value;
  }

  const INVERTER_PRODUCT_FIELDS = ['inverterKw', 'inverterVmaxDc', 'mpptMinV', 'mpptMaxV', 'inverterMaxCurrentA'];
  function clearInverterWorkbookSelection(clearModel, clearFields) {
    writeProductSnapshot('inverterProductSnapshot', null);
    const model = $('inverterModel');
    if (model && clearModel) model.value = '';
    const select = $('inverterWorkbookModel');
    if (select) select.value = '';
    if (clearFields) INVERTER_PRODUCT_FIELDS.forEach(id => {
      const input = $(id);
      if (input) { input.value = ''; fire(input); }
    });
    if (model && clearModel) fire(model);
  }
  function applyWorkbookInverter(entry) {
    if (!entry || !entry.id) return false;
    setValue('inverterMake', entry.make);
    const model = $('inverterModel');
    if (model) model.value = entry.model || '';
    writeProductSnapshot('inverterProductSnapshot', entry);
    INVERTER_PRODUCT_FIELDS.forEach(id => { const input = $(id); if (input) input.value = ''; });
    [
      ['acKw', 'inverterKw'], ['maxDcVoltageV', 'inverterVmaxDc'],
      ['mpptMinV', 'mpptMinV'], ['mpptMaxV', 'mpptMaxV'],
      ['maxInputCurrentPerMpptA', 'inverterMaxCurrentA']
    ].forEach(([from, to]) => {
      const value = entry[from], input = $(to);
      if (!input || value === '' || value === undefined || value === null) return;
      const text = String(value).trim(), number = Number(text);
      // An MPPT current written as “22 / 12” is not one limit; keep it in the
      // proposal snapshot, but do not collapse it into an unsafe scalar input.
      if (text && !text.includes('/') && Number.isFinite(number)) input.value = number;
    });
    if (model) fire(model);
    INVERTER_PRODUCT_FIELDS.forEach(id => fire($(id)));
    refreshWorkbookProductSelectors();
    return true;
  }
  function applyInverterDefaults() {
    const sel = $('inverterMake');
    const entry = cat().inverters.find(item => item.make === sel.value);
    if (!entry) return;
    if (entry.kw) { $('inverterKw').value = entry.kw; fire($('inverterKw')); }
    // Company-entered legacy defaults remain supported; they are not mixed
    // with the read-only workbook rows or marked manufacturer-verified.
    [['vmaxDc', 'inverterVmaxDc'], ['mpptMin', 'mpptMinV'], ['mpptMax', 'mpptMaxV'], ['maxCurrent', 'inverterMaxCurrentA']]
      .forEach(([from, to]) => {
        if (entry[from] === '' || entry[from] === undefined || entry[from] === null) return;
        const el = $(to);
        if (!el) return;
        el.value = entry[from];
        fire(el);
      });
  }

  function wire() {
    FIELDS.forEach(id => {
      const sel = $(id), input = $(id + 'Custom');
      if (!sel || !input) return;
      sel.addEventListener('input', () => syncCustom(sel));
      sel.addEventListener('change', event => {
        syncCustom(sel);
        if (id === 'inverterMake') {
          const selected = productSnapshot('inverterProductSnapshot');
          if (selected && !makeMatches(selected.make, sel.value)) clearInverterWorkbookSelection(true, true);
          applyInverterDefaults();
          refreshWorkbookProductSelectors();
        }
        if (id === 'cableMake') {
          const selected = productSnapshot('cableProductSnapshot');
          if (selected && selected.make !== sel.value) {
            writeProductSnapshot('cableProductSnapshot', null);
            if ($('workbookCableProduct')) $('workbookCableProduct').value = '';
          }
        }
        if (isCustom(sel)) { if (event.isTrusted) input.focus(); return; }
        if (id === 'moduleMake') handleModuleMakeChange();
        if (id === 'moduleModel') handleModuleModelChange();
      });
      const update = () => {
        const manual = sel.querySelector('option[data-custom]');
        if (!manual) return;
        manual.value = id === 'moduleModel' && !input.value
          ? MODULE_MODEL_CUSTOM_SENTINEL : input.value;
        manual.selected = true;
      };
      input.addEventListener('input', update);
      input.addEventListener('change', update);
    });
    $('inverterWorkbookModel')?.addEventListener('change', () => {
      const entry = root.ModuleReferenceCatalog?.findInverter?.($('inverterWorkbookModel').value);
      if (entry) applyWorkbookInverter(entry);
      else if (!$('inverterWorkbookModel').value && productSnapshot('inverterProductSnapshot')) clearInverterWorkbookSelection(true, true);
    });
    $('inverterModel')?.addEventListener('input', event => {
      const selected = productSnapshot('inverterProductSnapshot');
      if (selected && String(event.target.value || '').trim() !== String(selected.model || '').trim()) {
        clearInverterWorkbookSelection(false, true);
      }
    });
    $('workbookCableProduct')?.addEventListener('change', () => {
      const entry = root.ModuleReferenceCatalog?.findCable?.($('workbookCableProduct').value);
      if (entry) {
        writeProductSnapshot('cableProductSnapshot', entry);
        setValue('cableMake', entry.make);
      } else if (!$('workbookCableProduct').value && productSnapshot('cableProductSnapshot')) writeProductSnapshot('cableProductSnapshot', null);
    });
    $('workbookProtectionCategory')?.addEventListener('change', () => refreshWorkbookProductSelectors());
    $('workbookProtectionProduct')?.addEventListener('change', () => {
      const entry = root.ModuleReferenceCatalog?.findProtection?.($('workbookProtectionProduct').value);
      if (entry) writeProductSnapshot('protectionProductSnapshot', entry);
      else if (!$('workbookProtectionProduct').value && productSnapshot('protectionProductSnapshot')) writeProductSnapshot('protectionProductSnapshot', null);
    });
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
        inp(m.model, 'data-f="model" placeholder="Model"', 'eq-md') +
        inp(m.wp, 'data-f="wp" placeholder="Wp" class="num"', 'eq-sm') +
        inp(m.lengthMm, 'data-f="lengthMm" placeholder="L mm"', 'eq-sm') +
        inp(m.widthMm, 'data-f="widthMm" placeholder="W mm"', 'eq-sm') +
        inp(m.efficiency, 'data-f="efficiency" placeholder="Eff %"', 'eq-sm') +
        inp(m.tech, 'data-f="tech" placeholder="Technology"', 'eq-md') +
        '<button type="button" class="eq-del" data-kind="module" data-idx="' + idx + '" title="Remove">×</button></div>';
    });
      html += '<div class="hint">Connected Excel product rows and manufacturer-datasheet references are separate from this editable company list. Workbook values are not independently datasheet-verified and will not overwrite company data.</div>';
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
        if (k === 'module') cat().modules.push({ id: uid('m'), make: 'New module', model: '', wp: '', tech: '', lengthMm: '', widthMm: '', efficiency: '', moduleType: '', bifaciality: '', weightKg: '', voc: '', isc: '', vmp: '', imp: '', vocBetaPct: '', vmpBetaPct: '', iscAlphaPct: '', pmaxBetaPct: '' });
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

  root.EquipmentStore = { load, save, cat, refreshSelects, refreshWorkbookProductSelectors,
    setValue, wire, renderManager, seed, KEY,
    listModules: allModuleEntries, modelEntriesForMake: moduleEntriesForMake, findModule,
    applyModuleDefaults, clearModuleDefaults, applyWorkbookInverter };
})(typeof self !== 'undefined' ? self : this);

/* Proposal pages 5 (Proposed Solution) and 6 (Technical Specification) -
   the 2026 layout. Runs after every render and only re-arranges what the
   renderer already wrote: headings, cards, table values and notes keep their
   ids, so the editor, Document Studio and every test that reads them keep
   working. The specification table stays in the DOM (hidden) as the single
   source; the cards are rebuilt from its rows, so an edit to a row shows on
   its card. The legacy SVG diagram also stays in the DOM because the power
   report (experience.js) reads it. */
'use strict';
(function (root) {
  const doc = root.document;
  if (!doc || !root.Render) return;
  const $ = (id) => doc.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IMG = 'assets/images/';

  /* Line icons (24 px grid, stroke = currentColor). */
  const ICON = {
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" stroke="none"/>',
    bars: '<path d="M4 20h17" /><rect x="5" y="13" width="3" height="7" fill="currentColor" stroke="none"/><rect x="10" y="9" width="3" height="11" fill="currentColor" stroke="none"/><rect x="15" y="5" width="3" height="15" fill="currentColor" stroke="none"/><path d="M5 9l5-4 4 3 6-5"/>',
    panel: '<path d="M4.5 4h15l2 10h-19z"/><path d="M3.3 9h17.4M9 4l-.8 10M15 4l.8 10M12 14v4M8 20h8"/>',
    inverter: '<rect x="5" y="3" width="14" height="16" rx="2"/><rect x="8" y="6.5" width="8" height="5" rx="1"/><path d="M9.5 9.3c.8-1.4 1.6-1.4 2.5 0s1.7 1.4 2.5 0M9 22v-3M15 22v-3"/>',
    structure: '<path d="M3 11 13 5h8l-10 6z"/><path d="M5 11v9M9.5 11v9M19 5v15M14.5 8v12M3 20h18"/>',
    /* Maintenance walkway: a platform deck with its handrail above it. Four
       strokes only - this is drawn at 14px in a key cell, where a busier glyph
       turns to mush. */
    walkway: '<path d="M3 15h18M3 21h18"/><path d="M5 15V9.5h14V15"/><path d="M5 21v-6M19 21v-6"/>',
    shieldCheck: '<path d="M12 21.5s7.5-3.6 7.5-9.5V5.5L12 2.5l-7.5 3V12c0 5.9 7.5 9.5 7.5 9.5z"/><path d="m8.8 12 2.2 2.2 4.3-4.4"/>',
    shield: '<path d="M12 21.5s7.5-3.6 7.5-9.5V5.5L12 2.5l-7.5 3V12c0 5.9 7.5 9.5 7.5 9.5z"/>',
    landmark: '<path d="M3 21h18M5 18h14M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 3l9 5H3z"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="m8.6 13.8-1.6 8.2 5-2.8 5 2.8-1.6-8.2"/><path d="m9.6 9 1.7 1.7 3.2-3.2"/>',
    compass: '<circle cx="12" cy="4.5" r="2"/><path d="M11 6.3 4.5 21M13 6.3 19.5 21M6.4 16.5h11.2M12 2.5V1"/>',
    layers: '<path d="m12 3 9.5 4.8L12 12.6 2.5 7.8z"/><path d="m2.5 12.2 9.5 4.8 9.5-4.8"/><path d="m2.5 16.4 9.5 4.8 9.5-4.8"/>',
    calendarCheck: '<rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/><path d="m8.8 15.5 2.2 2.2 4.3-4.4"/>',
    factory: '<path d="M2.5 21V10l5 3.2V10l5 3.2V6.5h3.5L18 3h2l1.5 18z"/><path d="M2.5 21h19M7 17h2M12 17h2"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.6" stroke-width="3.4" stroke-dasharray="2.6 2.4"/><circle cx="12" cy="12" r="6"/>',
    grid: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9.7h18M3 14.3h18M9 5v14M15 5v14"/>',
    expand: '<path d="M8.5 3H3v5.5M15.5 3H21v5.5M21 15.5V21h-5.5M3 15.5V21h5.5M3 3l6 6M21 3l-6 6M21 21l-6-6M3 21l6-6"/>',
    wave: '<path d="M2 12c2.5-7 5-7 7.5 0s5 7 7.5 0c1.2-3.4 2.5-5 5-3"/>',
    gauge: '<path d="M3.5 18a8.5 8.5 0 1 1 17 0"/><path d="m12 18 4.5-6.5M6.5 13.5l1 .6M12 8.5v1.2M17.5 13.5l-1 .6"/>',
    link: '<path d="M10 13.5a4.6 4.6 0 0 0 6.6.4l2.9-2.9a4.6 4.6 0 0 0-6.5-6.5l-1.3 1.3"/><path d="M14 10.5a4.6 4.6 0 0 0-6.6-.4L4.5 13a4.6 4.6 0 0 0 6.5 6.5l1.3-1.3"/>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19.3" r="1.2" fill="currentColor" stroke="none"/>',
    cable: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M20.5 12H23"/>',
    earth: '<path d="M12 2.5v9.5M4 12h16M7 16h10M10 20h4"/>',
    lightning: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    doc: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M8 12.5h8M8 16.5h6"/>',
    wind: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
    pencil: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="m7.5 16.5 1-3.5 6.5-6.5 2.5 2.5-6.5 6.5z"/>',
    pin: '<path d="M12 21.5s7-6.6 7-11.5a7 7 0 1 0-14 0c0 4.9 7 11.5 7 11.5z"/><circle cx="12" cy="10" r="2.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18M4.6 7.5h14.8M4.6 16.5h14.8"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    tower: '<path d="M12 1.5 7.5 22.5M12 1.5l4.5 21M5 6h14M4 10.5h16M8.6 10.5l6.5 5.5M15.4 10.5 8.9 16M8.3 16h7.4M7.7 19.5l7.6-3.5M16.3 19.5 8.7 16M5 6 3.5 8M19 6l1.5 2M4 10.5 3 12.5M20 10.5l1 2M10.3 6l3.4 4.5M13.7 6l-3.4 4.5"/>'
  };
  function icon(name, size, cls, sw) {
    return '<svg class="' + (cls || 'pv2-svg') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      (sw || 1.7) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || ICON.check) + '</svg>';
  }
  /* One arrow, three meanings. DC runs green and AC runs orange, the same pair the
     badges use, so a reader can follow the colour across the page. The meter and
     the grid send power both ways, so that link is drawn two-headed and carries
     Import / Export under it. */
  const ARROW_COLOUR = { dc: '#1E9E63', ac: '#F2811D', bi: '#3A7BC8' };
  function arrow(dir, tone) {
    const c = ARROW_COLOUR[tone] || ARROW_COLOUR.ac;
    const head = (x1, x2) => '<path d="' + x1 + ' 2.5 ' + x2 + ' 7 ' + x1 + ' 11.5" fill="none" stroke="' + c +
      '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
    /* Both heads point outward from the shaft's ends: right at the far end, left
       at the near one. */
    const heads = dir === 'both' ? head(26.5, 20) + head(5.5, 12) : head(21, 27.5);
    return '<svg width="30" height="14" viewBox="0 0 30 14" aria-hidden="true">' +
      '<path d="M2 7h26" stroke="' + c + '" stroke-width="2.2" stroke-linecap="round"/>' + heads + '</svg>';
  }
  const SWOOSH = '<svg class="pv2-swoosh" viewBox="0 0 794 88" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M0 40C0 28 10 22 26 22H470C600 22 700 16 794 2V88H0Z" fill="#14263A"/>' +
    '<path d="M430 22.5C590 21 700 14 794 0V7C700 21 600 27 470 26.5Z" fill="#F2811D"/></svg>';

  /* ---------------- shared chrome: header banner + navy footer -------------- */
  function chrome(page) {
    /* Header and footer stay the proposal's standard ones; drop anything an
       earlier version of this layout injected. */
    page.classList.add('pv2');
    page.querySelectorAll('.pv2-doc,.pv2-swoosh').forEach((n) => n.remove());
  }
  function accent(h) {
    if (!h || h.querySelector('em')) return;
    const words = (h.textContent || '').trim().split(/\s+/);
    if (words.length < 2) return;
    const last = words.pop();
    /* Two balanced lines, as in the design: the last three words drop together. */
    const tail = words.length >= 4 ? words.splice(words.length - 2) : [];
    h.textContent = words.join(' ') + ' ';
    if (tail.length) { h.append(doc.createElement('br'), doc.createTextNode(tail.join(' ') + ' ')); }
    const em = doc.createElement('em'); em.textContent = last; h.append(em);
  }
  function label(text, extra) {
    return '<div class="pv2-label' + (extra ? ' ' + extra : '') + '"><i aria-hidden="true"></i><span>' + esc(text) + '</span></div>';
  }
  /* The value row keeps the proposal's own two-tone marks (ProposalMarks), the
     same artwork every other page's footer uses, in the same four-palette
     rotation. Falling back to the line icons only if that file is absent. */
  const PALETTES = ['warm', 'sage', 'lavender', 'blue'];
  function valueMark(ic, i) {
    const M = root.ProposalMarks;
    return M && M.get ? M.get(ic, 26, PALETTES[i % 4]) : icon(ic, 26, 'pv2-svg', 1.4);
  }
  /* Same markup shape as .proposal-value-footer .pv-values on the other pages:
     inline mark + copy, one copy span per label. Only the artwork and the words
     differ, so the two bands read as one component. */
  function values(items) {
    return '<ul class="pv2-values">' + items.map(([ic, a, b], i) =>
      '<li><span class="pv2-mark">' + valueMark(ic, i) + '</span>' +
      '<span class="pv2-label">' + esc(a) + '<br>' + esc(b) + '</span></li>').join('') + '</ul>';
  }

  /* --------------------------- PAGE 5 ------------------------------------- */
  function cardIcon(i, title) {
    if (i === 0) return 'bolt'; if (i === 1) return 'bars'; if (i === 2) return 'panel';
    const t = String(title || '').toLowerCase();
    if (/inverter/.test(t)) return 'inverter';
    if (/mount|structure/.test(t)) return 'structure';
    if (/balance|bos|protection/.test(t)) return 'shieldCheck';
    if (/net|subsid|meter/.test(t)) return 'landmark';
    if (/warrant/.test(t)) return 'award';
    return 'check';
  }
  function flowDiagram(s, f) {
    const P = (root.CONTENT && root.CONTENT.pageTechSpec && root.CONTENT.pageTechSpec.diagramLabels) || {};
    const count = f && f.moduleCount, watt = f && f.moduleWattage;
    const nodes = [
      { img: 'flow-panel.webp', cls: 'is-panel', t: P.array || 'Rooftop Solar', d: count && watt ? count + ' × ' + watt + ' Wp Modules' : 'Solar modules' },
      { img: 'flow-db.webp', cls: 'is-box', t: P.dcdb || 'DCDB', d: 'DC Protection', badge: 'DC' },
      { img: 'flow-inverter.webp', cls: 'is-inv', t: P.inverter || 'Inverter', d: f && f.inverterKw ? f.inverterKw + ' kW' : '' },
      { img: 'flow-db.webp', cls: 'is-box', t: P.acdb || 'ACDB', d: 'AC Protection', badge: 'AC' },
      { img: 'flow-house.webp', cls: 'is-house', t: P.home || 'Your Property', d: '(Load Use)' },
      { img: 'flow-meter.webp', cls: 'is-meter', t: P.meter || 'Bi-Directional Meter', d: 'Net Metering' },
      { svg: 'tower', cls: 'is-grid', t: 'Utility Grid', d: P.grid ? '(' + String(P.grid).replace(/\s*\(([^)]*)\)\s*$/, ' / $1') + ')' : '(DISCOM)' }
    ];
    /* Link i joins node i-1 to node i. DCDB -> inverter is still DC, so the first
       two links are green; everything from the inverter outwards is AC. The meter
       and the grid trade power in both directions. */
    const links = [
      { tone: 'dc' },
      { tone: 'dc' },
      { tone: 'ac' },
      { tone: 'ac' },
      { tone: 'ac' },
      { tone: 'bi', dir: 'both', note: 'Import / Export' }
    ];
    return '<div class="pv2-flow">' + nodes.map((n, i) => {
      const link = i ? links[i - 1] || {} : null;
      return (link ? '<span class="pv2-arrow' + (link.note ? ' has-note' : '') + '">' +
        arrow(link.dir || 'right', link.tone) +
        (link.note ? '<i>' + esc(link.note) + '</i>' : '') + '</span>' : '') +
      '<div class="pv2-node ' + n.cls + '">' +
      (n.badge ? '<span class="pv2-badge is-' + n.badge.toLowerCase() + '">' + n.badge + '</span>' : '') +
      '<div class="pv2-node-art">' + (n.svg ? icon(n.svg, 62, 'pv2-tower', 1.25) : '<img src="' + IMG + 'proposal/' + n.img + '" alt="" decoding="sync">') + '</div>' +
      '<b>' + esc(n.t) + '</b>' + (n.d ? '<small>' + esc(n.d) + '</small>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function solution(s, f) {
    const page = $('pageSolution'); if (!page) return;
    chrome(page); page.classList.add('pv2-solution');
    const body = page.querySelector(':scope > .pg-body'); if (!body) return;
    const intro = body.querySelector('.intro-col');
    const rule = intro && intro.querySelector('.rule-orange');
    if (intro && rule && intro.firstElementChild !== rule) intro.prepend(rule);
    accent($('v_soHeading'));
    const photo = page.querySelector(':scope > .photo-top');
    if (photo && !photo.querySelector('.pv2-strip')) {
      photo.insertAdjacentHTML('beforeend', '<span class="pv2-strip a" aria-hidden="true"></span><span class="pv2-strip b" aria-hidden="true"></span>');
    }
    const specs = $('v_soSpecs');
    if (specs) [...specs.querySelectorAll('.spec-card')].forEach((card, i) => {
      card.classList.toggle('pv2-metric', i < 3); card.classList.toggle('pv2-feature', i >= 3);
      const title = card.querySelector('.spec-t');
      const old = card.querySelector(':scope > :not(.spec-t):not(.card-desc):not(.pv2-ic)');
      const want = cardIcon(i, title && title.textContent);
      let ic = card.querySelector(':scope > .pv2-ic');
      if (!ic || ic.dataset.icon !== want) {
        if (ic) ic.remove();
        ic = doc.createElement('span'); ic.className = 'pv2-ic'; ic.dataset.icon = want; ic.setAttribute('aria-hidden', 'true');
        ic.innerHTML = icon(want, 26, 'pv2-svg', i < 3 && i !== 2 ? 1.7 : 1.6);
        card.prepend(ic);
      }
      if (old) old.remove();
    });
    let ov = body.querySelector(':scope > .pv2-overview');
    if (!ov) {
      ov = doc.createElement('div'); ov.className = 'pv2-overview'; ov.dataset.docAdded = 'true';
      body.insertBefore(ov, $('v_soScopeNote') || null);
    }
    const P = (root.CONTENT && root.CONTENT.pageTechSpec) || {};
    ov.innerHTML = label(P.diagramTitle || 'SYSTEM OVERVIEW') + '<div class="pv2-ov-box">' + flowDiagram(s, f) + '</div>';
    let vals = body.querySelector(':scope > .pv2-values-wrap');
    if (!vals) {
      vals = doc.createElement('div'); vals.className = 'pv2-values-wrap'; vals.dataset.docAdded = 'true';
      body.append(vals);
      vals.innerHTML = values([['target', 'Site-fit', 'Design'], ['gear', 'Specified', 'Equipment'], ['shield', 'Design', 'Safety'], ['check', 'Planned', 'Handover']]);
    }
    fit(page, ['pv2-fit-1', 'pv2-fit-2', 'pv2-fit-3']);
  }

  /* --------------------------- PAGE 6 ------------------------------------- */
  /* Manufacturer marks, cut from the owner's brand sheet into
     assets/images/brands/<name>.webp. A make the sheet does not carry (or a
     custom make the user typed) still gets its name set in type, so the card
     never shows an empty badge. */
  const BRAND_LOGOS = {
    waaree: 'waaree', adani: 'adani', longi: 'longi', tata: 'tata', vikram: 'vikram',
    premier: 'premier', renew: 'renew', renewsys: 'renewsys', panasonic: 'anchor', anchor: 'anchor',
    growatt: 'growatt', fronius: 'fronius', deye: 'deye', huawei: 'huawei', fusionsolar: 'huawei',
    solis: 'solis', sungrow: 'sungrow',
    /* The structure card's own make. Drafted from the owner's mark, not a logo
       of a foreign brand, so it rides the same badge as the rest. */
    ars: 'ars-solartech'
  };
  const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  /* One photograph per card, taken from the owner's page 5/6 set. Modules,
     structure and safety keep a single shot each; the inverter card carries the
     studio shot of the make the quotation actually names where the set has one,
     because these renders print their own logo on the product. */
  const CARD_PHOTO = {
    module: IMG + 'equipment/cards/solar-module-card.webp',
    inverter: IMG + 'equipment/cards/solis-inverter.webp',
    mount: IMG + 'equipment/cards/mount-structure-callouts.webp',
    standards: IMG + 'equipment/cards/design-is-standards.webp',
    design: IMG + 'equipment/cards/earthing-safety-3pit.webp'
  };
  const INVERTER_PHOTO = {
    huawei: IMG + 'equipment/cards/inverter-huawei.webp',
    solis: IMG + 'equipment/cards/solis-inverter.webp',
    sungrow: IMG + 'equipment/cards/inverter-sungrow.webp',
    growatt: IMG + 'equipment/cards/inverter-growatt.webp',
    fronius: IMG + 'equipment/cards/inverter-fronius.webp',
    deye: IMG + 'equipment/cards/inverter-deye.webp'
  };
  function photoFor(kind, brand) {
    if (kind === 'inverter' && brand) {
      const key = slug(brand).split('-')[0];
      if (INVERTER_PHOTO[key]) return INVERTER_PHOTO[key];
    }
    if (kind === 'design') return CARD_PHOTO.standards;
    return CARD_PHOTO[kind] || IMG + 'equipment/cards/earthing-safety-3pit.webp';
  }
  function rowIcon(k) {
    const t = String(k || '').toLowerCase();
    const map = [[/^make|brand/, 'factory'], [/technolog|^model/, 'layers'], [/^type/, 'wave'], [/rated|output|power$/, 'bolt'],
      [/efficien|dc input/, 'gauge'], [/mppt|ratio/, 'link'],
      /* Before `protection`: "Cabling & Protection" is a cable row that happens to
         end in the word, and it was drawing a shield. */
      [/cabling/, 'cable'], [/protection$/, 'shield'], [/warrant/, 'shield'], [/monitor/, 'wifi'],
      [/quantity/, 'grid'], [/array size/, 'grid'], [/area/, 'expand'], [/^structure$/, 'structure'],
      [/walkway/, 'walkway'],
      [/earthing/, 'earth'], [/lightning/, 'lightning'], [/standard/, 'doc'], [/life/, 'compass'], [/wind/, 'wind'],
      [/proposal|design/, 'pencil'], [/location/, 'pin'], [/resource|solar|ghi/, 'sun']];
    for (const [re, ic] of map) if (re.test(t)) return ic;
    return 'check';
  }
  function readGroups(table) {
    const groups = []; let cur = null;
    [...table.rows].forEach((r) => {
      if (r.classList.contains('spec-group')) { cur = { name: (r.textContent || '').trim(), rows: [] }; groups.push(cur); return; }
      const k = r.querySelector('.spec-k'), v = r.querySelector('.spec-v');
      if (cur && k && v) cur.rows.push([k.textContent.trim(), v.textContent.trim()]);
    });
    return groups;
  }
  const kindOf = (name) => /MODULE/i.test(name) ? 'module' : /INVERTER/i.test(name) ? 'inverter' : /MOUNT|CABL/i.test(name) ? 'mount'
    : /DESIGN|ENGINEER/i.test(name) ? 'design' : /^SITE DATA/i.test(name) ? 'sitedata' : /^SITE/i.test(name) ? 'site' : 'other';
  function brandMark(kind, brand) {
    /* Card 04 is the card of codes: it has no manufacturer, so it carries no
       badge. The IS / IEC badge that used to sit here was read as noise - the
       card title and its own rows already say what it is. */
    if (kind === 'design') return '';
    if (!brand) return '';
    const key = slug(brand).split('-')[0];
    if (key === 'ars' || key === 'solartech' || key === 'solar') brand = 'ARS Solar Tech';
    const logo = BRAND_LOGOS[key] || BRAND_LOGOS[slug(brand)];
    if (logo) {
      return '<div class="pv2-brand is-logo"><img src="' + IMG + 'brands/' + logo + '.webp" alt="' + esc(brand) + '" decoding="sync"></div>';
    }
    return '<div class="pv2-brand is-plain"><b>' + esc(brand) + '</b></div>';
  }
  function techSpec() {
    const page = $('pageTechSpec'); if (!page) return;
    chrome(page); page.classList.add('pv2-tech');
    /* The legacy fit ladder measured the old table layout; this page fits itself. */
    ['is-tight-spec', 'is-tighter-spec', 'is-lead-trim', 'is-diagram-spec', 'is-diagram-tighter', 'is-diagram-tiny', 'is-diagram-min', 'is-table-min']
      .forEach((c) => page.classList.remove(c));
    const body = page.querySelector(':scope > .pg-body'); const table = $('v_tsTable');
    if (!body || !table) return;
    /* The section opener used to shout "DETAILED SPECIFICATION" in a dark slab.
       Page 6 is the friendly half of the pair: one quiet line that says what the
       four cards are for, with two of its phrases picked out in orange. Kept as
       plain quotes so the sentence stays copy, not markup. */
    const groupsLabel = $('v_tsGroupsLabel');
    if (groupsLabel) {
      groupsLabel.classList.add('pv2-eyebrow');
      if (groupsLabel.dataset.pv2Copy !== 'spec-intro') {
        groupsLabel.dataset.pv2Copy = 'spec-intro';
        groupsLabel.innerHTML = '<span>Every component below is chosen for '
          + '<em>compatibility</em>, <em>certified performance</em> and long-term reliability.</span>';
      }
    }
    const groups = readGroups(table);
    const cards = []; const byKind = {};
    groups.forEach((g) => {
      const kind = kindOf(g.name);
      if (kind === 'site' || kind === 'sitedata') { (byKind['_' + kind] = byKind['_' + kind] || []).push(...g.rows); return; }
      const card = { kind, name: g.name, rows: g.rows.slice() };
      byKind[kind] = card; cards.push(card);
    });
    /* Site rows read best beside the structure they size; measured site data
       belongs with the design basis it feeds. Nothing is dropped. */
    if (byKind._site) (byKind.mount || cards[cards.length - 1] || {}).rows?.push(...byKind._site);
    if (byKind._sitedata) (byKind.design || cards[cards.length - 1] || {}).rows?.push(...byKind._sitedata);
    const html = cards.map((c, i) => {
      const val = (re) => (c.rows.find(([k]) => re.test(k)) || [])[1] || '';
      let brand = '';
      if (c.kind === 'module' || c.kind === 'inverter') brand = val(/^(make|brand)$/i);
      else if (c.kind === 'mount') brand = 'ARS';
      brand = brand.replace(/\s+/g, ' ').trim();
      const photo = photoFor(c.kind, brand);
      const title = c.name.charAt(0) + c.name.slice(1).toLowerCase();
      return '<article class="pv2-card is-' + c.kind + '">' +
        /* Number OR icon, not both - two devices side by side read as decoration.
           The number is quiet set type, so it orders the cards without shouting. */
        '<header class="pv2-card-head"><span class="pv2-num">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<h3>' + esc(c.name.toUpperCase() === c.name ? c.name : title) + '</h3>' + brandMark(c.kind, brand) + '</header>' +
        '<div class="pv2-card-body"><div class="pv2-rows">' + c.rows.map(([k, v]) =>
          '<div class="pv2-row"><div class="pv2-k">' + icon(rowIcon(k), 14, 'pv2-svg', 1.6) + '<span>' + esc(k) + '</span></div><div class="pv2-v">' + esc(v) + '</div></div>').join('') +
        '</div><figure class="pv2-photo"><img src="' + esc(photo) + '" alt="' + esc((brand || c.name) + ' equipment') + '" decoding="sync"></figure></div></article>';
    }).join('');
    let wrap = body.querySelector(':scope > .pv2-spec');
    if (!wrap) { wrap = doc.createElement('div'); wrap.className = 'pv2-spec'; wrap.dataset.docAdded = 'true'; table.after(wrap); }
    if (wrap.dataset.html !== html) { wrap.innerHTML = html; wrap.dataset.html = html; }
    fit(page, ['pv2-fit-1', 'pv2-fit-2', 'pv2-fit-3', 'pv2-fit-4']);
  }

  /* Measured, never assumed: tighten step by step until the last block sits
     clear of the footer. jsdom has no layout, so this is inert there. */
  function fit(page, steps) {
    steps.forEach((c) => page.classList.remove(c));
    const foot = page.querySelector(':scope > .pg-foot'); const body = page.querySelector(':scope > .pg-body');
    if (!foot || !body || !page.getBoundingClientRect().height) return;
    const ok = () => {
      const limit = foot.getBoundingClientRect().top + 12 * (page.getBoundingClientRect().height / page.offsetHeight);
      let low = 0; for (const kid of body.children) { const r = kid.getBoundingClientRect(); if (r.height && r.bottom > low) low = r.bottom; }
      return low <= limit;
    };
    for (let i = 0; i < steps.length && !ok(); i++) page.classList.add(steps[i]);
  }

  let busy = false;
  function sync() {
    const s = root.Render.lastState; if (!s || busy) return;
    busy = true;
    try {
      let f = null; try { f = root.Finance && root.Finance.compute ? root.Finance.compute(s) : null; } catch (e) { f = null; }
      solution(s, f); techSpec(); watch();
    } finally { busy = false; }
  }
  const previous = root.Render.renderAll;
  root.Render.renderAll = function (...args) { const out = previous.apply(this, args); sync(); return out; };
  let frame = 0;
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(sync); };
  root.addEventListener('resize', schedule);
  doc.fonts && doc.fonts.ready.then(schedule);
  doc.addEventListener('DOMContentLoaded', schedule);
  /* Document Studio edits land on the hidden table; mirror them onto the cards. */
  const watch = () => {
    const t = $('v_tsTable'); if (!t || t.dataset.pv2Watch) return;
    t.dataset.pv2Watch = '1';
    new MutationObserver(schedule).observe(t, { childList: true, subtree: true, characterData: true });
  };
  doc.addEventListener('DOMContentLoaded', watch); watch();
  root.ProposalV2 = { sync };
  if (root.Render.lastState) schedule();
})(window);

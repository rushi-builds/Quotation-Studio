/* ==========================================================================
   Quotation Studio — Inline SVG Icon Set
   --------------------------------------------------------------------------
   Emoji glyphs render inconsistently in html2canvas/PDF, so every icon in
   the proposal is a small inline SVG. Colours are emitted as explicit
   attributes (never `currentColor`) so they survive html2canvas SVG
   serialisation during PDF export.

   Usage: Icons.get('sun', 18, '#F2811D') → '<svg …>…</svg>'
          Icons.chip('sun', 34) → icon in the orange circular chip
   ========================================================================== */
'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.Icons = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {

  /* Element format: [tag, attrs, opts]
     opts.plain → no default stroke applied (element controls its own paint) */
  const P = (d) => ['path', { d }];
  const C = (attrs, opts) => ['circle', attrs, opts];
  const R = (attrs) => ['rect', attrs];

  const ICONS = {
    sun: [C({ cx: 12, cy: 12, r: 4.2 }), P('M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M4.9 4.9l1.9 1.9M17.2 17.2l1.9 1.9M19.1 4.9l-1.9 1.9M6.8 17.2l-1.9 1.9')],
    panel: [R({ x: 3, y: 4, width: 18, height: 12, rx: 1.2 }), P('M3 10h18M9 4v12M15 4v12M12 16v4M8.5 20h7')],
    bolt: [P('M13 2.5 4.5 13.5h6L11 21.5l8.5-11h-6z')],
    rupee: [P('M7 3.5h10M7 8h10M15.5 3.5c0 3.6-3.4 4.5-8.5 4.5 4 0 7.5 3.5 8 8')],
    leaf: [P('M5 19C5 9 12 4 20 4c0 9-4.5 15-12.5 15'), P('M5 19c2-5.5 5.5-9 11-11')],
    shield: [P('M12 2.8 4.5 5.6v6.1c0 4.7 3.2 8 7.5 9.5 4.3-1.5 7.5-4.8 7.5-9.5V5.6z'), P('m8.8 11.6 2.3 2.3 4.2-4.4')],
    check: [C({ cx: 12, cy: 12, r: 9 }), P('m7.8 12.3 2.8 2.8 5.6-6')],
    badge: [R({ x: 4.5, y: 3.5, width: 15, height: 17, rx: 1.6 }), P('M8.5 8h7M8.5 12h7M8.5 16h4.2')],
    doc: [P('M7 3.5h7l4 4v13H7z'), P('M14 3.5V8h4M9.8 12.5h4.4M9.8 16h4.4')],
    award: [C({ cx: 12, cy: 9, r: 5.2 }), P('m9.2 13.5-1.7 7 4.5-2.6 4.5 2.6-1.7-7')],
    star: [P('m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z')],
    gear: [C({ cx: 12, cy: 12, r: 3.2 }), P('M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1')],
    wrench: [P('M14.5 6.5a4.5 4.5 0 0 0-6 5.6L3 17.6 6.4 21l5.5-5.5a4.5 4.5 0 0 0 5.6-6l-3 3-2.5-2.5z')],
    drone: [R({ x: 5, y: 5, width: 4, height: 4 }), R({ x: 15, y: 5, width: 4, height: 4 }), R({ x: 5, y: 15, width: 4, height: 4 }), R({ x: 15, y: 15, width: 4, height: 4 }), P('M9 7h6M7 9v6M17 9v6M9 17h6')],
    phone: [P('M6 3.5h4l1.5 4.5-2.2 1.7a12 12 0 0 0 5 5l1.7-2.2 4.5 1.5v4a1.8 1.8 0 0 1-2 1.8A16.5 16.5 0 0 1 4.2 5.5a1.8 1.8 0 0 1 1.8-2z')],
    mail: [R({ x: 3, y: 5, width: 18, height: 14, rx: 1.8 }), P('m3.5 6.5 8.5 6.5 8.5-6.5')],
    pin: [P('M12 21.5s-7-6.2-7-11.3A7 7 0 0 1 19 10.2c0 5.1-7 11.3-7 11.3z'), C({ cx: 12, cy: 10, r: 2.6 })],
    globe: [C({ cx: 12, cy: 12, r: 9 }), P('M3 12h18M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9z')],
    home: [P('m3.5 11.5 8.5-7.5 8.5 7.5'), P('M5.5 10v10h13V10M10 20v-5.5h4V20')],
    building: [P('M5 20.5V4.5h9v16M14 9.5h5v11M5 20.5h16'), P('M8 8h3M8 11.5h3M8 15h3M16.5 13h.01')],
    factory: [P('M4 20.5V9.5l5 3.2V9.5l5 3.2V6l6 3.5v11z'), P('M8 17h.01M12.5 17h.01M17 17h.01')],
    chart: [P('M4 4v16h16'), P('M8 15v-4M12 15V8M16 15v-6')],
    trend: [P('m3.5 16.5 5-5 3.5 3.5 7.5-7.5'), P('M15.5 7.5h4v4')],
    clock: [C({ cx: 12, cy: 12, r: 9 }), P('M12 6.5V12l3.5 2.5')],
    calendar: [R({ x: 3.5, y: 5, width: 17, height: 15.5, rx: 1.8 }), P('M3.5 10h17M8 3v4M16 3v4')],
    cable: [P('M7 3.5v4M17 3.5v4'), P('M5 7.5h4v5a3 3 0 0 0 6 0v-5h4'), P('M12 15.5v5')],
    wifi: [P('M4 9.5a12 12 0 0 1 16 0M6.8 13a8 8 0 0 1 10.4 0M9.7 16.3a4 4 0 0 1 4.6 0'), C({ cx: 12, cy: 19.3, r: 1.1, fill: '{S}' }, { plain: true })],
    key: [C({ cx: 8, cy: 14.5, r: 4 }), P('m11 11.5 8.5-8.5M16 7l2.5 2.5M13.5 9.5 16 12')],
    spark: [P('M12 2.5c.6 4.8 2.7 6.9 7.5 7.5-4.8.6-6.9 2.7-7.5 7.5-.6-4.8-2.7-6.9-7.5-7.5 4.8-.6 6.9-2.7 7.5-7.5z'), P('M18.6 14.5c.25 2 1.1 2.85 3.1 3.1-2 .25-2.85 1.1-3.1 3.1-.25-2-1.1-2.85-3.1-3.1 2-.25 2.85-1.1 3.1-3.1z')],
    users: [C({ cx: 9, cy: 8.5, r: 3.4 }), P('M3.5 20a5.5 5.5 0 0 1 11 0'), P('M15.5 5.4a3.4 3.4 0 0 1 0 6.2M17.5 14.9a5.5 5.5 0 0 1 3 4.6')],
    target: [C({ cx: 12, cy: 12, r: 9 }), C({ cx: 12, cy: 12, r: 5.4 }), C({ cx: 12, cy: 12, r: 1.8, fill: '{S}' }, { plain: true })],
    download: [P('M12 3.5v11M7.5 10.5 12 15l4.5-4.5'), P('M4 17.5V20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2.5')],
    inverter: [R({ x: 4, y: 4, width: 16, height: 16, rx: 1.8 }), P('M13.5 7.5 9.5 13h3l-1 3.5 4-5.5h-3z')],
    meter: [C({ cx: 12, cy: 12, r: 9 }), P('m12 12 3.5-3.5'), P('M12 3v1.8M21 12h-1.8M12 21v-1.8M3 12h1.8')]
  };

  const DEFAULT_PRIMARY = '#1C2B3F';
  const DEFAULT_ACCENT = '#F2811D';

  function escAttrs(attrs, S) {
    let out = '';
    for (const k in attrs) {
      const v = String(attrs[k]).replace('{S}', S);
      out += ' ' + k + '="' + v + '"';
    }
    return out;
  }

  /**
   * @param {string}  name    icon key
   * @param {number}  size    rendered square size in px
   * @param {string}  primary main stroke colour
   * @param {string}  accent  unused stroke placeholder for future two-tone icons
   * @param {boolean} halo    draw a soft accent halo behind the icon
   */
  function get(name, size, primary, accent, halo) {
    const els = ICONS[name] || ICONS.check;
    size = size || 18;
    const S = primary || DEFAULT_PRIMARY;
    const sw = 1.7;
    let body = '';
    if (halo) {
      body += '<circle cx="12" cy="12" r="10.6" fill="' + (accent || DEFAULT_ACCENT) +
        '" fill-opacity="0.13" stroke="none"/>';
    }
    for (const [tag, attrs, opts] of els) {
      let a = escAttrs(attrs, S);
      if (!(opts && opts.plain)) {
        a += ' fill="none" stroke="' + S + '" stroke-width="' + sw +
          '" stroke-linecap="round" stroke-linejoin="round"';
      }
      body += '<' + tag + a + '/>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  }

  /** Icon inside the standard circular chip used across pages. */
  function chip(name, chipSize, bg, fg) {
    chipSize = chipSize || 34;
    bg = bg || 'var(--orange)';
    return '<span class="icon-chip" style="width:' + chipSize + 'px;height:' + chipSize +
      'px;background:' + bg + ';">' +
      get(name, Math.round(chipSize * 0.54), fg || '#FFFFFF') + '</span>';
  }

  return { get, chip, names: Object.keys(ICONS) };
}));

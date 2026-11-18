/* Custom equipment artwork - the logo and photograph a make the brand sheet does
   not carry has to be given by the owner.

   Two kinds of picture with opposite demands:
     - a LOGO is a mark on transparency. Nothing may ever be cut from it, so it is
       trimmed of its empty margin and then fitted inside the badge box.
     - a PHOTO is a product shot that has to fill a tile. It is cropped to that
       tile's shape, and the owner can drag/zoom the crop before it is stored.

   Everything happens in the browser: the owner drops a phone photo straight from
   the camera roll and the app does the work. Nothing leaves the machine, and the
   stored result is small enough to live in the proposal blob (<= ~60 KB logo,
   <= ~400 KB photo) so it survives save, load, share and the PDF.

   Storage is deliberately NOT the form: state.js `collectForm` skips anything
   marked `data-equipment-custom`, so artwork rides `window.__qsPageImages` - the
   same map the cover/closing/about photo overrides already use, which app.js
   writes into the saved proposal as the fifth argument of Proposals.saveActive.
*/
'use strict';
(function (root) {
  const $ = (id) => document.getElementById(id);

  /* The page-6 badge is 30px tall and at most 132px wide (proposal-v2.css:244),
     so 4x those numbers is the most any screen or printer can use. Storing more
     than that only bloats the proposal. */
  const LOGO = { boxH: 30, boxW: 132, scale: 4, maxEdge: 400, quality: 0.9, budget: 60000 };
  /* Page-6 tiles are roughly 1.3-1.9:1 and print around 150px wide, so 1200px on
     the long edge is still ~4x print resolution. */
  const PHOTO = { maxEdge: 1200, quality: 0.9, budget: 400000, aspect: 1.45 };
  const MAX_IN = 5 * 1024 * 1024;

  const state = { moduleLogo: '', inverterLogo: '', inverterPhoto: '' };
  /* Crop sessions live here so the drag handlers do not have to re-decode the
     file on every pointer move. */
  const crops = new Map();

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* "Near white" and "near transparent" are one test: a logo exported on white
     and a logo exported on alpha are the same mark, and either way the margin is
     not the mark. 246/255 leaves room for JPEG noise inside a flat white field
     without eating a pale background that is actually part of the design. */
  function isMargin(d) {
    const a = d[3];
    if (a < 12) return true;
    return a >= 250 && d[0] >= 246 && d[1] >= 246 && d[2] >= 246;
  }

  function canvasOf(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /* Decode whatever the owner dropped. SVG has no natural pixel size until it is
     given one, so it is rasterised through an <img> and a canvas like the rest -
     which also means a hostile SVG cannot reach the page as markup. */
  function decode(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|svg)$/i.test(file.name || '')) {
        reject(new Error('That file is not an image. Use PNG, WebP, JPEG or SVG.'));
        return;
      }
      if (file.size > MAX_IN) {
        reject(new Error('That image is ' + (file.size / 1048576).toFixed(1) + ' MB. Please use one under 5 MB.'));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        URL.revokeObjectURL(url);
        if (!w || !h) { reject(new Error('That image could not be read. Try another file.')); return; }
        resolve({ img, w, h });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('That image could not be opened. Try another file.'));
      };
      img.src = url;
    });
  }

  /* ------------------------------- logo ---------------------------------- */

  /* Trim the empty margin, then fit - never crop. A logo that is wider than the
     badge is scaled down; a tall one is scaled down by height. The aspect ratio
     is preserved exactly, which is the only thing an owner will notice. */
  function logoFrom(src) {
    const full = canvasOf(src.w, src.h);
    const fctx = full.getContext('2d', { willReadFrequently: true });
    fctx.drawImage(src.img, 0, 0, full.width, full.height);
    let data;
    try { data = fctx.getImageData(0, 0, full.width, full.height); }
    catch (e) { throw new Error('That image cannot be read in this browser. Try a PNG.'); }

    const { width: w, height: h } = full;
    const px = data.data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!isMargin(px.slice((y * w + x) * 4, (y * w + x) * 4 + 4))) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    /* An image that is one flat colour has no mark to find; keep the whole frame
       rather than storing a 1px sliver. */
    if (maxX < 0) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }
    const cw = maxX - minX + 1, ch = maxY - minY + 1;

    const boxH = LOGO.boxH * LOGO.scale, boxW = LOGO.boxW * LOGO.scale;
    const scale = Math.min(boxW / cw, boxH / ch, LOGO.maxEdge / Math.max(cw, ch));
    const out = canvasOf(cw * scale, ch * scale);
    const octx = out.getContext('2d');
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(full, minX, minY, cw, ch, 0, 0, out.width, out.height);

    /* WebP keeps alpha and is ~30% smaller than PNG at the same quality. Safari
       before 14 returns a PNG data URL from toDataURL('image/webp'), which is a
       perfectly good result, so no browser sniffing is needed. */
    let url = out.toDataURL('image/webp', LOGO.quality);
    if (url.length > LOGO.budget) url = out.toDataURL('image/webp', 0.75);
    if (url.length > LOGO.budget * 2) {
      const small = canvasOf(out.width * 0.7, out.height * 0.7);
      small.getContext('2d').drawImage(out, 0, 0, small.width, small.height);
      url = small.toDataURL('image/webp', 0.8);
    }
    if (url.length > LOGO.budget * 4) url = out.toDataURL('image/png');
    return { url, w: out.width, h: out.height, trimmed: { from: [w, h], to: [cw, ch] } };
  }

  /* ------------------------------- photo --------------------------------- */

  /* The crop frame is drawn at a fixed working size and everything is expressed
     as a fraction of the source, so the same numbers can be re-applied at full
     resolution when the owner presses Save. */
  function openCrop(kind, src) {
    const frameW = 260;
    const frameH = Math.round(frameW / PHOTO.aspect);
    const cover = src.w / src.h > PHOTO.aspect;
    crops.set(kind, {
      src, frameW, frameH,
      /* Start with the whole picture visible: a "fit" session begins at 1 and a
         "cover" session begins at the smallest zoom that fills the frame. */
      zoom: 1, mode: 'cover',
      offsetX: 0.5, offsetY: 0.5,
      minZoom: 1, coverZoom: cover ? src.h / src.w * PHOTO.aspect : (src.w / src.h) / PHOTO.aspect
    });
    const c = crops.get(kind);
    c.minZoom = c.mode === 'cover' ? Math.min(1, c.coverZoom) : Math.min(1, c.coverZoom);
    c.zoom = c.mode === 'cover' ? Math.max(1, c.coverZoom) : 1;
    c.coverZoom = Math.max(0.01, c.coverZoom);
    return c;
  }

  function paintCrop(kind, canvas) {
    const c = crops.get(kind);
    if (!c || !canvas) return;
    canvas.width = c.frameW;
    canvas.height = c.frameH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, c.frameW, c.frameH);
    ctx.fillStyle = '#EEF1F5';
    ctx.fillRect(0, 0, c.frameW, c.frameH);
    /* Scale so the source spans the frame at zoom 1 in fit mode, and fills it in
       cover mode. */
    const base = c.mode === 'cover'
      ? Math.max(c.frameW / c.src.w, c.frameH / c.src.h)
      : Math.min(c.frameW / c.src.w, c.frameH / c.src.h);
    const s = base * c.zoom;
    const dw = c.src.w * s, dh = c.src.h * s;
    const dx = (c.frameW - dw) * c.offsetX;
    const dy = (c.frameH - dh) * c.offsetY;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c.src.img, dx, dy, dw, dh);
  }

  function photoFrom(kind) {
    const c = crops.get(kind);
    if (!c) throw new Error('Nothing to save yet.');
    const base = c.mode === 'cover'
      ? Math.max(c.frameW / c.src.w, c.frameH / c.src.h)
      : Math.min(c.frameW / c.src.w, c.frameH / c.src.h);
    const s = base * c.zoom;
    const dw = c.src.w * s, dh = c.src.h * s;
    const dx = (c.frameW - dw) * c.offsetX;
    const dy = (c.frameH - dh) * c.offsetY;

    /* Work out the full-resolution rectangle that the on-screen frame is showing,
       then draw just that. Anything outside the frame is genuinely not wanted. */
    const fx = c.mode === 'cover' ? c.frameW : c.frameW;
    const fy = c.mode === 'cover' ? c.frameH : c.frameH;
    let scale = Math.min(PHOTO.maxEdge / (fx / s), PHOTO.maxEdge / (fy / s));
    scale = Math.min(scale, 4);
    const out = canvasOf(fx * scale, fy * scale);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (c.mode === 'cover') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, out.width, out.height);
    }
    ctx.drawImage(c.src.img, dx * scale, dy * scale, dw * scale, dh * scale);

    let url = out.toDataURL('image/jpeg', PHOTO.quality);
    if (url.length > PHOTO.budget) url = out.toDataURL('image/jpeg', 0.8);
    if (url.length > PHOTO.budget) {
      const small = canvasOf(out.width * 0.75, out.height * 0.75);
      small.getContext('2d').drawImage(out, 0, 0, small.width, small.height);
      url = small.toDataURL('image/jpeg', 0.8);
    }
    if (url.length > PHOTO.budget * 2) url = out.toDataURL('image/webp', 0.8);
    return { url, w: out.width, h: out.height };
  }

  /* ------------------------------- wiring -------------------------------- */

  const ZONES = [
    { zone: 'moduleLogo', key: 'moduleLogo', kind: 'logo', label: 'Logo' },
    { zone: 'inverterLogo', key: 'inverterLogo', kind: 'logo', label: 'Logo' },
    { zone: 'inverterPhoto', key: 'inverterPhoto', kind: 'photo', label: 'Inverter photo' }
  ];

  function say(text, bad) {
    const box = $('customArtStatus');
    if (!box) return;
    box.textContent = text || '';
    box.hidden = !text;
    box.classList.toggle('is-bad', !!bad);
  }

  function showThumb(zoneKey, info) {
    const wrap = $('customArt' + zoneKey[0].toUpperCase() + zoneKey.slice(1));
    if (!wrap) return;
    const img = wrap.querySelector('img');
    const empty = wrap.querySelector('[data-custom-art-empty]');
    const filled = wrap.querySelector('[data-custom-art-filled]');
    const name = wrap.querySelector('[data-custom-art-name]');
    if (info && info.url) {
      if (img) img.src = info.url;
      if (empty) empty.hidden = true;
      if (filled) filled.hidden = false;
      if (name) name.textContent = info.w + ' x ' + info.h + ' px';
    } else {
      if (img) img.removeAttribute('src');
      if (empty) empty.hidden = false;
      if (filled) filled.hidden = true;
    }
  }

  function commit(zoneKey) {
    if (root.__qsPageImages) root.__qsPageImages[zoneKey] = state[zoneKey] || '';
    /* The cards are painted from the page-image map, so a redraw is all that is
       needed to show or drop the artwork. */
    root.Render?.renderAll?.();
  }

  async function accept(zoneKey, spec, file) {
    say('Reading ' + (file.name || 'image') + '…');
    try {
      const src = await decode(file);
      if (spec.kind === 'logo') {
        const info = logoFrom(src);
        state[zoneKey] = info.url;
        showThumb(zoneKey, info);
        commit(zoneKey);
        say('Logo ready - ' + Math.round(info.url.length / 1024) + ' KB. ' +
          'Trimmed from ' + info.trimmed.from.join('x') + ' to ' + info.trimmed.to.join('x') + '.');
      } else {
        const c = openCrop(zoneKey, src);
        const panel = $('customArtCrop');
        if (panel) panel.hidden = false;
        Object.assign(state, { __cropZone: zoneKey, __cropSpec: spec });
        paintCrop(zoneKey, $('customArtCropCanvas'));
        say('Drag the picture to choose the crop, then press Use this crop.');
      }
    } catch (err) {
      say(err.message || 'That image could not be used.', true);
    }
  }

  function wireZone(spec) {
    const zone = $('customArt' + spec.zone[0].toUpperCase() + spec.zone.slice(1));
    if (!zone || zone.dataset.wired) return;
    zone.dataset.wired = '1';
    const input = zone.querySelector('input[type=file]');

    zone.addEventListener('click', (e) => {
      if (e.target.closest('[data-custom-art-remove]')) return;
      input?.click();
    });
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input?.click(); }
    });
    input?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) accept(spec.zone, spec, file);
    });

    ['dragenter', 'dragover'].forEach((type) => zone.addEventListener(type, (e) => {
      e.preventDefault(); zone.classList.add('is-dragging');
    }));
    ['dragleave', 'drop'].forEach((type) => zone.addEventListener(type, (e) => {
      e.preventDefault(); zone.classList.remove('is-dragging');
    }));
    zone.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) accept(spec.zone, spec, file);
    });

    /* Paste only while this zone is the last thing touched, so Ctrl+V of ordinary
       text elsewhere in the form is never hijacked. */
    zone.addEventListener('focusin', () => { state.__pasteZone = spec.zone; });
    zone.querySelector('[data-custom-art-remove]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state[spec.zone] = '';
      crops.delete(spec.zone);
      showThumb(spec.zone, null);
      commit(spec.zone);
      say('Removed.');
    });
  }

  /* ------------------------------ crop UI -------------------------------- */

  function wireCrop() {
    const panel = $('customArtCrop');
    if (!panel || panel.dataset.wired) return;
    panel.dataset.wired = '1';
    const canvas = $('customArtCropCanvas');
    let drag = null;

    const start = (x, y) => { drag = { x, y }; };
    const move = (x, y) => {
      const c = crops.get(state.__cropZone);
      if (!drag || !c) return;
      c.offsetX = clamp(c.offsetX + (x - drag.x) / 240, 0, 1);
      c.offsetY = clamp(c.offsetY + (y - drag.y) / 180, 0, 1);
      drag = { x, y };
      paintCrop(state.__cropZone, canvas);
    };

    canvas?.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      start(e.clientX, e.clientY);
    });
    canvas?.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
    canvas?.addEventListener('pointerup', () => { drag = null; });
    canvas?.addEventListener('pointercancel', () => { drag = null; });

    $('customArtCropZoom')?.addEventListener('input', (e) => {
      const c = crops.get(state.__cropZone);
      if (!c) return;
      c.zoom = Math.max(c.minZoom, Number(e.target.value) || 1);
      paintCrop(state.__cropZone, canvas);
    });
    $('customArtCropFit')?.addEventListener('change', (e) => {
      const c = crops.get(state.__cropZone);
      if (!c) return;
      c.mode = e.target.checked ? 'fit' : 'cover';
      c.zoom = c.mode === 'cover' ? Math.max(1, c.coverZoom) : 1;
      const zoom = $('customArtCropZoom');
      if (zoom) zoom.value = String(c.zoom);
      paintCrop(state.__cropZone, canvas);
    });
    $('customArtCropCancel')?.addEventListener('click', () => {
      panel.hidden = true;
      crops.delete(state.__cropZone);
      say('Crop cancelled.');
    });
    $('customArtCropSave')?.addEventListener('click', () => {
      const zoneKey = state.__cropZone;
      try {
        const info = photoFrom(zoneKey);
        state[zoneKey] = info.url;
        showThumb(zoneKey, info);
        commit(zoneKey);
        panel.hidden = true;
        crops.delete(zoneKey);
        say('Photo ready - ' + Math.round(info.url.length / 1024) + ' KB at ' + info.w + 'x' + info.h + '.');
      } catch (err) {
        say(err.message || 'That crop could not be saved.', true);
      }
    });
  }

  function wirePaste() {
    if (document.dataset.custArtPaste) return;
    document.dataset.custArtPaste = '1';
    document.addEventListener('paste', (e) => {
      const zoneKey = state.__pasteZone;
      if (!zoneKey) return;
      const spec = ZONES.find((z) => z.zone === zoneKey);
      const file = [...(e.clipboardData?.files || [])][0];
      if (!spec || !file) return;
      e.preventDefault();
      accept(zoneKey, spec, file);
    });
  }

  /* Put whatever is already saved back on screen - this runs on load and after a
     cloud document is opened. */
  function sync() {
    const map = root.__qsPageImages || {};
    ZONES.forEach((spec) => {
      const url = map[spec.zone] || '';
      state[spec.zone] = url;
      showThumb(spec.zone, url ? { url, w: '—', h: '—' } : null);
      if (url) {
        const wrap = $('customArt' + spec.zone[0].toUpperCase() + spec.zone.slice(1));
        const name = wrap?.querySelector('[data-custom-art-name]');
        if (name) name.textContent = 'Saved';
      }
    });
  }

  function wire() {
    ZONES.forEach(wireZone);
    wireCrop();
    wirePaste();
    sync();
  }

  root.CustomArt = { wire, sync, state, logoFrom, photoFrom, openCrop, paintCrop, crops, say };
})(typeof self !== 'undefined' ? self : this);

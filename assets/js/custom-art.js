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
  /* The zones keep their short names. The page-image map is a different namespace:
     the card renderer (proposal-v2.js) reads customModuleLogo / customInverterLogo /
     customInverterPhoto and app.js restores exactly those on reopen. Translating in
     one place is the whole point - this used to write `moduleLogo`, so a logo was
     uploaded, trimmed and saved, and then never reached the card. */
  const mapKey = (zone) => 'custom' + zone[0].toUpperCase() + zone.slice(1);

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

  /* One step, no decisions: a dropped photo is cropped to the tile's shape by the
     app and the result is what gets stored and printed.

     The crop is a "cover" crop anchored at the centre, which is what the page-6
     tiles themselves do with `object-fit: cover` - so the picture the owner sees
     in the preview is the picture that prints, with nothing left to drag, zoom or
     confirm. The whole picture is still reachable: `fit` (letterboxed, nothing cut)
     is used automatically when a cover crop would throw away more than half the
     frame, because at that point the product itself is being cut off and a centred
     strip is not a better answer than a smaller whole shot. */
  const CROP_KEEP = 0.5;   /* cover crop must keep at least this much of the source */

  function cropPlan(src) {
    const frameW = PHOTO.maxEdge;
    const frameH = Math.round(frameW / PHOTO.aspect);
    const coverScale = Math.max(frameW / src.w, frameH / src.h);
    const fitScale = Math.min(frameW / src.w, frameH / src.h);
    /* What fraction of the source survives a centred cover crop. */
    const coveredW = frameW / coverScale, coveredH = frameH / coverScale;
    const kept = (coveredW * coveredH) / (src.w * src.h);
    const mode = kept >= CROP_KEEP ? 'cover' : 'fit';
    const scale = mode === 'cover' ? coverScale : fitScale;
    return {
      frameW, frameH, mode,
      srcW: src.w * scale, srcH: src.h * scale,
      /* Centre both: the product is almost always in the middle of the frame. */
      offsetX: 0.5, offsetY: 0.5
    };
  }

  function photoFrom(src) {
    const plan = cropPlan(src);
    const out = canvasOf(plan.frameW, plan.frameH);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (plan.mode === 'fit') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, out.width, out.height);
    }
    const dx = (plan.frameW - plan.srcW) * plan.offsetX;
    const dy = (plan.frameH - plan.srcH) * plan.offsetY;
    ctx.drawImage(src.img, dx, dy, plan.srcW, plan.srcH);

    let url = out.toDataURL('image/jpeg', PHOTO.quality);
    if (url.length > PHOTO.budget) url = out.toDataURL('image/jpeg', 0.8);
    if (url.length > PHOTO.budget) {
      const small = canvasOf(out.width * 0.75, out.height * 0.75);
      small.getContext('2d').drawImage(out, 0, 0, small.width, small.height);
      url = small.toDataURL('image/jpeg', 0.8);
    }
    if (url.length > PHOTO.budget * 2) url = out.toDataURL('image/webp', 0.8);
    return { url, w: out.width, h: out.height, mode: plan.mode };
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
    if (root.__qsPageImages) root.__qsPageImages[mapKey(zoneKey)] = state[zoneKey] || '';
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
        /* No panel, no confirm: the crop is decided and applied here. */
        const info = photoFrom(src);
        state[zoneKey] = info.url;
        showThumb(zoneKey, info);
        commit(zoneKey);
        say('Photo ready - ' + Math.round(info.url.length / 1024) + ' KB at ' +
          info.w + 'x' + info.h + (info.mode === 'fit'
            ? '. The whole picture is kept, with bars at the edges.'
            : '. Cropped to the card shape.'));
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
      showThumb(spec.zone, null);
      commit(spec.zone);
      say('Removed.');
    });
  }

  function wirePaste() {
    /* `<html>` carries the dataset, not `document` - `document.dataset` does not
       exist, and reading it throws a TypeError that would abort wire() at boot
       and take the whole editor down with it. */
    const el = document.documentElement;
    if (el.dataset.custArtPaste) return;
    el.dataset.custArtPaste = '1';
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
      const url = map[mapKey(spec.zone)] || '';
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
    wirePaste();
    sync();
  }

  root.CustomArt = { wire, sync, state, logoFrom, photoFrom, cropPlan, say };
})(typeof self !== 'undefined' ? self : this);

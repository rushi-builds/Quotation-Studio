/* Presentation only: extend edge colours OUTSIDE the untouched source photo.
 * Raster feathering also survives html2canvas without CSS blur/mask support. */
'use strict';
(function () {
  const heroes = '.system-page .sp-system-hero,.bess-page .bess-hero';
  const painted = new WeakMap();
  function size(frame, image) {
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) return;
    frame.style.setProperty('--system-photo-ratio', String(image.naturalWidth / image.naturalHeight));
    const edge = frame.querySelector('.sp-hero-shade');
    if (!edge) return;
    const w = Math.round(frame.clientWidth * 2), h = Math.round(frame.clientHeight * 2);
    if (!w || !h) return;
    const key = image.currentSrc + ':' + w + ':' + h;
    if (painted.get(frame) === key) return;
    const x = 24, y = 20, canvas = document.createElement('canvas');
    canvas.width = w + x * 2; canvas.height = h + y * 2;
    const c = canvas.getContext('2d');
    if (!c) return;
    const nw = image.naturalWidth, nh = image.naturalHeight;
    // Extrude just the outermost source pixels, never paint over the photo.
    c.drawImage(image, 0, 0, 1, nh, 0, y, x, h);
    c.drawImage(image, nw - 1, 0, 1, nh, x + w, y, x, h);
    c.drawImage(image, 0, 0, nw, 1, x, 0, w, y);
    c.drawImage(image, 0, nh - 1, nw, 1, x, y + h, w, y);
    [[0,0,0,0],[nw-1,0,x+w,0],[0,nh-1,0,y+h],[nw-1,nh-1,x+w,y+h]].forEach(([sx,sy,dx,dy]) => c.drawImage(image,sx,sy,1,1,dx,dy,x,y));
    c.globalCompositeOperation = 'destination-in';
    const horizontal = c.createLinearGradient(0, 0, canvas.width, 0);
    horizontal.addColorStop(0, 'transparent'); horizontal.addColorStop(x / canvas.width, 'white');
    horizontal.addColorStop(1 - x / canvas.width, 'white'); horizontal.addColorStop(1, 'transparent');
    c.fillStyle = horizontal; c.fillRect(0, 0, canvas.width, canvas.height);
    const vertical = c.createLinearGradient(0, 0, 0, canvas.height);
    vertical.addColorStop(0, 'transparent'); vertical.addColorStop(y / canvas.height, 'white');
    vertical.addColorStop(1 - y / canvas.height, 'white'); vertical.addColorStop(1, 'transparent');
    c.fillStyle = vertical; c.fillRect(0, 0, canvas.width, canvas.height);
    try {
      edge.style.backgroundImage = 'url("' + canvas.toDataURL('image/png') + '")';
      painted.set(frame, key);
    } catch (_) {
      // A future cross-origin source without CORS stays sharp, with no halo.
      edge.style.backgroundImage = 'none';
    }
  }
  function refresh() {
    document.querySelectorAll(heroes).forEach(hero => {
      const image = hero.querySelector('img');
      if (!image) return;
      let frame = image.closest('.sp-photo-frame');
      if (!frame) {
        frame = document.createElement('div'); frame.className = 'sp-photo-frame';
        image.before(frame); frame.append(image);
        const edge = hero.querySelector('.sp-hero-shade');
        if (edge) { edge.setAttribute('aria-hidden', 'true'); frame.append(edge); }
        image.addEventListener('load', () => size(frame, image));
      }
      size(frame, image);
    });
  }
  refresh();
  new MutationObserver(refresh).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['src']
  });
  window.addEventListener('resize', refresh);
})();

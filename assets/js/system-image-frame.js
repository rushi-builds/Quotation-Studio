/* Presentation only: a source-ratio frame lets a tiny edge gradient render in
 * both the browser and html2canvas PDFs. No source pixels, state or APIs change. */
'use strict';
(function () {
  const heroes = '.system-page .sp-system-hero,.bess-page .bess-hero';
  function size(frame, image) {
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      frame.style.setProperty('--system-photo-ratio', String(image.naturalWidth / image.naturalHeight));
    }
  }
  function refresh() {
    document.querySelectorAll(heroes).forEach(hero => {
      const image = hero.querySelector('img');
      if (!image) return;
      let frame = image.closest('.sp-photo-frame');
      if (!frame) {
        frame = document.createElement('div');
        frame.className = 'sp-photo-frame';
        image.before(frame);
        frame.append(image);
        const edge = hero.querySelector('.sp-hero-shade');
        if (edge) { edge.setAttribute('aria-hidden', 'true'); frame.append(edge); }
        image.addEventListener('load', () => size(frame, image));
      }
      size(frame, image);
    });
  }
  refresh();
  // Frozen renderers replace the hero markup; saved/customer/export views use
  // the same enhancement. Cloned frames retain their source-ratio CSS variable.
  new MutationObserver(refresh).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['src']
  });
})();

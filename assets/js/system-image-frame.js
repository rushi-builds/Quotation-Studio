/* Presentation only: preserve native image proportions inside a rounded frame.
 * No source pixels, state, network calls or renderer/exporter logic change. */
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
        image.addEventListener('load', () => size(frame, image));
      }
      size(frame, image);
    });
  }
  refresh();
  // Frozen renderers replace markup; cloned frames retain the source ratio.
  new MutationObserver(refresh).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['src']
  });
})();

/* Public project gallery — rendering, filtering, detail view, likes and share.
 *
 * The project list itself stays inline in gallery.html (PROJECTS / SECTORS /
 * PROJECT_IMAGES) so the page still has its copy without JavaScript; this file
 * only builds the cards, opens a project, and talks to the likes API through
 * GalleryLikes. */
'use strict';
(function () {
  var D = window.GalleryDetails;
  var L = window.GalleryLikes;
  var grid = document.getElementById('galleryProjects');
  var filters = document.getElementById('galleryFilters');
  var countEl = document.getElementById('galleryCount');
  var dialog = document.getElementById('photoViewer');
  var heroCount = document.getElementById('heroProjectCount');
  var heroCapacity = document.getElementById('heroCapacity');
  if (!grid || !filters || !dialog) return;

  var items = (window.PROJECTS || []).map(function (p) {
    var detail = D.detailFor(p);
    return { p: p, id: detail.id, detail: detail };
  });
  var byId = {};
  items.forEach(function (it) { byId[it.id] = it; });

  /* Server truth for likes. Empty until the first batch answers. */
  var state = { counts: {}, mine: {}, available: null };
  var active = -1;
  var opener = null;
  var closeBtn = document.getElementById('closePhoto');

  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="heart-fill" d="M12 20.6S3.9 15.8 2.1 11.3A5.5 5.5 0 0 1 12 6.2a5.5 5.5 0 0 1 9.9 5.1c-1.8 4.5-9.9 9.3-9.9 9.3Z"/></svg>';
  var SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.4 10.7 15.6 6.4M8.4 13.3l7.2 4.3"/></svg>';
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 6.6"/></svg>';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function kindOf(p) {
    return p.installation || (p.sector === 'Residential' ? 'Rooftop solar' : 'Rooftop solar');
  }
  function metaLine(p) {
    var parts = ['<b>' + esc(p.capacity) + '</b>', esc(kindOf(p))];
    if (p.location) parts.push(esc(p.location));
    return parts.join(' · ');
  }
  function detailUrl(id) {
    return location.origin + location.pathname + '#p-' + encodeURIComponent(id);
  }

  /* ---------- cards ---------- */
  function cardFor(it, index) {
    var p = it.p, d = it.detail;
    var card = document.createElement('article');
    card.className = 'gallery-card';
    card.setAttribute('data-project', p.img);
    card.setAttribute('data-id', it.id);
    card.style.transitionDelay = Math.min(index, 8) * 40 + 'ms';

    var photo = document.createElement('button');
    photo.type = 'button';
    photo.className = 'project-photo';
    photo.setAttribute('aria-label', 'Open ' + p.name + ', ' + p.capacity + (p.location ? ', ' + p.location : ''));
    var img = document.createElement('img');
    img.src = window.PROJECT_IMAGES ? (window.PROJECT_IMAGES[p.img] || p.img) : p.img;
    img.alt = [p.name, p.capacity, p.installation, p.location].filter(Boolean).join(' · ');
    img.loading = 'lazy';
    img.width = 600;
    img.height = 400;
    if (img.complete) img.classList.add('is-ready');
    else img.addEventListener('load', function () { img.classList.add('is-ready'); }, { once: true });
    /* Some published photographs are hosted on the WordPress site. If one does
       not load, the card keeps its shape and names the project rather than
       leaving an empty grey frame. */
    img.addEventListener('error', function () {
      photo.classList.add('is-missing');
      photo.setAttribute('data-fallback', p.name);
    }, { once: true });
    var badge = document.createElement('span');
    badge.className = 'sector-badge';
    badge.textContent = p.sector || 'Solar';

    /* The hint lives inside the photograph so it never covers the like and
       share controls underneath it. */
    var hint = document.createElement('span');
    hint.className = 'open-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = 'View project <span aria-hidden="true">↗</span>';

    photo.append(img, badge, hint);
    photo.addEventListener('click', function () { openProject(it, photo); });

    var body = document.createElement('div');
    body.className = 'card-body';
    var h3 = document.createElement('h3');
    h3.textContent = p.name;
    var meta = document.createElement('p');
    meta.className = 'card-meta';
    meta.innerHTML = metaLine(p);
    body.append(h3, meta);

    var actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.append(likeButton(it), shareButton(it));

    card.append(photo, body, actions);
    return card;
  }

  function likeButton(it) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'act like';
    btn.setAttribute('data-like', it.id);
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', 'Like ' + it.p.name + ' (0 likes so far)');
    btn.setAttribute('data-label', it.p.name);
    btn.title = 'Like this project';
    btn.innerHTML = HEART + '<span class="like-count">0</span>';
    btn.addEventListener('click', function () { toggleLike(it, btn); });
    return btn;
  }

  function shareButton(it) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'act share';
    btn.setAttribute('data-share', it.id);
    btn.setAttribute('aria-label', 'Share this project: ' + it.p.name);
    btn.title = 'Share this project';
    btn.innerHTML = SHARE + '<span>Share</span>';
    btn.addEventListener('click', function () { shareProject(it); });
    return btn;
  }

  function render(category) {
    grid.replaceChildren();
    var shown = items.filter(function (it) {
      return category === -1 || it.p.sector === window.SECTORS[category];
    });
    countEl.textContent = shown.length + (shown.length === 1 ? ' project photograph' : ' project photographs');
    shown.forEach(function (it, index) { grid.appendChild(cardFor(it, index)); });
    Array.prototype.forEach.call(filters.children, function (b, i) {
      b.setAttribute('aria-pressed', String(i - 1 === category));
    });
    reveal();
    loadCounts(shown.map(function (it) { return it.id; }));
  }

  /* Cards fade in as they enter the viewport; reduced-motion users get them
     immediately (the CSS handles the transform, this only starts it). */
  function reveal() {
    var cards = grid.querySelectorAll('.gallery-card');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(cards, function (c) { c.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.08 });
    Array.prototype.forEach.call(cards, function (c) { io.observe(c); });
  }

  /* ---------- likes ---------- */
  function paintLikes(ids) {
    (ids || []).forEach(function (id) {
      var btn = grid.querySelector('[data-like="' + cssEscape(id) + '"]');
      var count = state.counts[id] || 0;
      var liked = !!state.mine[id];
      if (btn) {
        var name = btn.getAttribute('data-label') || 'this project';
        btn.setAttribute('aria-pressed', String(liked));
        btn.querySelector('.like-count').textContent = String(count);
        btn.setAttribute('aria-label',
          (liked ? 'Remove your like from ' : 'Like ') + name + ' (' + count + (count === 1 ? ' like' : ' likes') + ')');
        btn.title = liked ? 'Unlike this project' : 'Like this project';
        if (state.available === false) {
          btn.classList.add('is-offline');
          btn.title = 'Likes need the live site';
          btn.setAttribute('aria-disabled', 'true');
        } else {
          btn.classList.remove('is-offline');
          btn.removeAttribute('aria-disabled');
        }
      }
      var detailBtn = dialog.querySelector('[data-like="' + cssEscape(id) + '"]');
      if (detailBtn) {
        var inner = detailBtn.querySelector('.like-count');
        var word = detailBtn.querySelector('.like-word');
        var detailName = detailBtn.getAttribute('data-label') || 'this project';
        detailBtn.setAttribute('aria-pressed', String(liked));
        detailBtn.setAttribute('aria-label',
          (liked ? 'Remove your like from ' : 'Like ') + detailName + ' (' + count + (count === 1 ? ' like' : ' likes') + ')');
        if (inner) inner.textContent = String(count);
        if (word) word.textContent = count === 1 ? ' like' : ' likes';
      }
    });
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
  }

  var countsLoaded = {};
  function loadCounts(ids) {
    var fresh = ids.filter(function (id) { return !countsLoaded[id]; });
    if (!fresh.length) { paintLikes(ids); return; }
    fresh.forEach(function (id) { countsLoaded[id] = true; });
    L.fetchCounts(ids).then(function (res) {
      state.available = res.available;
      Object.keys(res.counts).forEach(function (id) { state.counts[id] = res.counts[id]; });
      res.mine.forEach(function (id) { state.mine[id] = true; });
      paintLikes(ids);
    });
  }

  function toggleLike(it, btn) {
    if (state.available === false) {
      L.toast('Likes need the live site. This copy of the gallery is offline.');
      return;
    }
    var next = !state.mine[it.id];
    btn.classList.add('is-loading');
    L.setLike(it.id, next).then(function (res) {
      btn.classList.remove('is-loading');
      if (!res.ok) {
        L.toast('Could not save that like. Check your connection and try again.');
        return;
      }
      state.counts[it.id] = res.count;
      state.mine[it.id] = res.liked;
      paintLikes([it.id]);
      if (res.liked) {
        btn.classList.add('is-pop');
        L.burst(btn);
        setTimeout(function () { btn.classList.remove('is-pop'); }, 560);
      }
    });
  }

  function shareProject(it) {
    var url = detailUrl(it.id);
    L.share({
      title: it.p.name + ' · ' + it.p.capacity + ' | KTM Energy Experts',
      text: it.p.name + ' — ' + it.p.capacity + (it.p.location ? ', ' + it.p.location : '') + ' · KTM Energy Experts',
      url: url
    }).then(function (result) {
      if (result === 'copied') L.toast('Link copied — paste it in WhatsApp or anywhere else.');
    });
  }

  /* ---------- detail view ---------- */
  function openProject(it, from) {
    opener = from || null;
    var p = it.p, d = it.detail;
    var liked = !!state.mine[it.id];
    var count = state.counts[it.id] || 0;
    var tags = [
      '<span>' + esc(p.capacity) + '</span>',
      '<span>' + esc(kindOf(p)) + '</span>',
      p.location ? '<span>' + esc(p.location) + '</span>' : '',
      '<span class="date">Installed ' + esc(d.installed) + '</span>'
    ].filter(Boolean).join('');

    dialog.innerHTML =
      '<button type="button" id="closePhoto" aria-label="Close project">×</button>' +
      '<div class="detail">' +
        '<div class="detail-media"><img id="largePhoto" alt="' + esc(p.name + ' · ' + p.capacity) + '" src="' +
          esc((window.PROJECT_IMAGES ? window.PROJECT_IMAGES[p.img] : p.img) || p.img) + '"></div>' +
        '<div class="detail-body">' +
          '<span class="section-kicker">' + esc(p.sector || 'SOLAR') + ' PROJECT</span>' +
          '<h2 id="detailTitle">' + esc(p.name) + '</h2>' +
          '<div class="detail-tags">' + tags + '</div>' +
          '<p class="detail-summary">' + esc(d.summary) + '</p>' +
          '<ul class="detail-points">' + d.points.map(function (point) {
            return '<li>' + CHECK + '<span>' + esc(point) + '</span></li>';
          }).join('') + '</ul>' +
          '<p id="photoCaption" class="visually-hidden">' +
            esc([p.name, p.capacity, p.installation, p.location].filter(Boolean).join(' · ')) +
          '</p>' +
          '<div class="detail-actions">' +
            '<button type="button" class="act like" data-like="' + esc(it.id) + '" aria-pressed="' + liked +
              '" data-label="' + esc(p.name) + '" aria-label="Like this project"><span class="like-ico">' + HEART + '</span><span class="like-count">' + count + '</span>' +
              '<span class="like-word">' + (count === 1 ? ' like' : ' likes') + '</span></button>' +
            '<button type="button" class="btn primary" data-detail-share="' + esc(it.id) + '">' + SHARE + 'Share project</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    var close = dialog.querySelector('#closePhoto');
    if (close) close.addEventListener('click', function () { dialog.close(); });
    var likeBtn = dialog.querySelector('[data-like]');
    if (likeBtn) likeBtn.addEventListener('click', function () { toggleLike(it, likeBtn); });
    var shareBtn = dialog.querySelector('[data-detail-share]');
    if (shareBtn) shareBtn.addEventListener('click', function () { shareProject(it); });

    dialog.setAttribute('aria-labelledby', 'detailTitle');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    if (history.replaceState) history.replaceState(null, '', '#p-' + encodeURIComponent(it.id));
    paintLikes([it.id]);
    var focusTarget = dialog.querySelector('#closePhoto');
    if (focusTarget) focusTarget.focus();
    document.body.style.overflow = 'hidden';
  }

  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', function () {
    document.body.style.overflow = '';
    if (location.hash.indexOf('#p-') === 0 && history.replaceState) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (opener && opener.focus) opener.focus();
  });

  /* ---------- filters + hero figures ---------- */
  var names = ['All projects'].concat(window.SECTORS);
  names.forEach(function (name, index) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.addEventListener('click', function () { active = index - 1; render(active); });
    filters.appendChild(b);
  });
  render(-1);

  /* Hero numbers are read off the published list, never typed in. */
  var heroSectors = document.getElementById('heroSectorCount');
  if (heroCount) heroCount.textContent = String(items.length);
  if (heroSectors) heroSectors.textContent = String((window.SECTORS || []).length);
  if (heroCapacity) {
    /* Published capacities mix "kWp" (our own installations) and "kW" (the
       older web listings). Both are the installed DC capacity of the project,
       so the total adds them as published - nothing is re-estimated. */
    var totalKw = items.reduce(function (sum, it) {
      var n = parseFloat(String(it.p.capacity).replace(/[^0-9.]/g, ''));
      return sum + (isFinite(n) ? n : 0);
    }, 0);
    heroCapacity.textContent = totalKw >= 1000
      ? (Math.round(totalKw / 100) / 10).toLocaleString('en-IN') + ' MWp'
      : Math.round(totalKw).toLocaleString('en-IN') + ' kWp';
  }

  /* A shared link carries the project in the hash, so a recipient lands on the
     same photograph instead of the top of the page. */
  (function openFromHash() {
    var match = location.hash.match(/^#p-(.+)$/);
    if (!match) return;
    var id = decodeURIComponent(match[1]);
    if (!byId[id]) return;
    setTimeout(function () {
      var card = grid.querySelector('[data-id="' + cssEscape(id) + '"] .project-photo');
      openProject(byId[id], card);
    }, 60);
  })();
})();

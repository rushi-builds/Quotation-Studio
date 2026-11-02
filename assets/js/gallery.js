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
  var BOLT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4.5 13.5H11l-.6 8.5L20 10h-6.6L13 2Z"/></svg>';
  var ROOF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/><path d="M9.5 20v-5h5v5"/></svg>';
  var PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>';
  var CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';
  var LAYERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>';
  var PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M13.5 6.5l4 4"/></svg>';
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
    /* Nothing is laid over the photograph. The sector used to ride on it as a
       pill, which covered the top of every image; it now lives in the detail
       view's kicker and in the filter row, where it never hides a photo. */
    var hint = document.createElement('span');
    hint.className = 'open-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = 'View project <span aria-hidden="true">↗</span>';

    photo.append(img, hint);
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
    btn.setAttribute('aria-label', 'Like ' + it.p.name);
    btn.setAttribute('data-label', it.p.name);
    btn.title = 'Like this project';
    /* A dash until the server answers: on a page without the API (a static
       copy, a preview without the backend) an invented 0 would read as
       "nobody has liked this", which is a claim this page cannot make. */
    btn.innerHTML = '<span class="like-ico">' + HEART + '</span>' +
      '<span class="like-count">–</span>';
    btn.classList.add('is-loading');
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
    btn.innerHTML = SHARE + '<span class="act-word">Share</span>';
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
        var countEl2 = btn.querySelector('.like-count');
        btn.setAttribute('aria-pressed', String(liked));
        btn.classList.remove('is-loading');
        if (state.available === false) {
          /* No API here: show that the count is unknown instead of 0. */
          if (countEl2) countEl2.textContent = '–';
          btn.classList.add('is-offline');
          btn.title = 'Likes need the live site';
          btn.setAttribute('aria-disabled', 'true');
          btn.setAttribute('aria-label', 'Likes are unavailable here: ' + name);
        } else {
          if (countEl2) countEl2.textContent = String(count);
          btn.classList.remove('is-offline');
          btn.removeAttribute('aria-disabled');
          btn.setAttribute('aria-label',
            (liked ? 'Remove your like from ' : 'Like ') + name + ' (' + count + (count === 1 ? ' like' : ' likes') + ')');
          btn.title = liked ? 'Unlike this project' : 'Like this project';
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
        L.heartBurst(btn);
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
    var known = state.available !== false;
    var count = known ? (state.counts[it.id] || 0) : '–';
    var countWord = known ? (count === 1 ? ' like' : ' likes') : ' likes';
    /* Four facts, each shown once: the photograph used to repeat them in a
       footer bar, so that bar is gone and the chips are the single source. */
    var facts = [
      '<span class="tag"><i class="tag-ico cap">' + BOLT + '</i><span class="tag-txt"><b>' +
        esc(p.capacity) + '</b><em>Capacity</em></span></span>',
      '<span class="tag"><i class="tag-ico type">' + ROOF + '</i><span class="tag-txt"><b>' +
        esc(kindOf(p)) + '</b><em>Installation</em></span></span>',
      p.location ? '<span class="tag"><i class="tag-ico where">' + PIN + '</i><span class="tag-txt"><b>' +
        esc(p.location) + '</b><em>Location</em></span></span>' : '',
      '<span class="tag date"><i class="tag-ico when">' + CAL + '</i><span class="tag-txt"><b>Installed ' +
        esc(d.installed) + '</b><em>Commissioned</em></span></span>'
    ].filter(Boolean).join('');

    dialog.innerHTML =
      '<button type="button" id="closePhoto" aria-label="Close project">×</button>' +
      '<div class="detail">' +
        '<div class="detail-media">' +
          /* A blurred copy of the same photograph fills the letterbox, so the
             whole area reads as the image instead of empty navy bands. */
          '<img class="detail-blur" aria-hidden="true" alt="" src="' +
            esc((window.PROJECT_IMAGES ? window.PROJECT_IMAGES[p.img] : p.img) || p.img) + '">' +
          '<img id="largePhoto" alt="' + esc(p.name + ' · ' + p.capacity) + '" src="' +
            esc((window.PROJECT_IMAGES ? window.PROJECT_IMAGES[p.img] : p.img) || p.img) + '"' +
            ' data-project="' + esc(p.img) + '">' +
          '<span class="media-tag">' + LAYERS + 'Project portfolio</span>' +
        '</div>' +
        '<div class="detail-body">' +
          '<span class="detail-kicker"><b>' + esc(p.sector || 'SOLAR') + ' PROJECT</b><i aria-hidden="true"></i></span>' +
          '<h2 id="detailTitle">' + esc(p.name) + '</h2>' +
          '<p class="detail-summary">' + esc(d.summary) + '</p>' +
          '<div class="detail-tags">' + facts + '</div>' +
          '<h3 class="detail-h"><i aria-hidden="true"></i>Project highlights</h3>' +
          '<ul class="detail-points">' + d.points.map(function (point) {
            return '<li><span class="tick">' + CHECK + '</span><span>' + esc(point) + '</span></li>';
          }).join('') + '</ul>' +
          '<p id="photoCaption" class="visually-hidden">' +
            esc([p.name, p.capacity, p.installation, p.location].filter(Boolean).join(' · ')) +
          '</p>' +
          '<div class="detail-actions">' +
            '<button type="button" class="act like" data-like="' + esc(it.id) + '" aria-pressed="' + liked +
              '" data-label="' + esc(p.name) + '" aria-label="Like this project"><span class="like-ico">' + HEART + '</span><span class="like-count">' + count + '</span>' +
              '<span class="like-word">' + countWord + '</span></button>' +
            '<button type="button" class="btn primary" data-detail-share="' + esc(it.id) + '">' + SHARE + 'Share project</button>' +
            '<button type="button" class="btn feedback" data-detail-feedback="' + esc(it.id) + '">' + PENCIL + 'Give feedback</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    var close = dialog.querySelector('#closePhoto');
    if (close) close.addEventListener('click', function () { dialog.close(); });
    var likeBtn = dialog.querySelector('[data-like]');
    if (likeBtn) likeBtn.addEventListener('click', function () { toggleLike(it, likeBtn); });
    var shareBtn = dialog.querySelector('[data-detail-share]');
    if (shareBtn) shareBtn.addEventListener('click', function () { shareProject(it); });
    var feedbackBtn = dialog.querySelector('[data-detail-feedback]');
    if (feedbackBtn) feedbackBtn.addEventListener('click', function () { openFeedback(it); });

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

  /* ---------- feedback ----------
     One small form, opened from a project (and from the page-level button in
     the context section). The dialog never invents a success: if the API is
     unreachable the typed note stays and the reason is shown. */
  var feedbackBox = document.getElementById('feedbackBox');
  var feedbackForm = document.getElementById('feedbackForm');
  var feedbackMessage = document.getElementById('feedbackMessage');
  var feedbackName = document.getElementById('feedbackName');
  var feedbackError = document.getElementById('feedbackError');
  var feedbackSend = document.getElementById('feedbackSend');
  var feedbackLede = document.getElementById('feedbackLede');
  var feedbackTarget = '';
  var feedbackRating = 0;

  function setStars(value) {
    feedbackRating = value;
    Array.prototype.forEach.call(feedbackBox.querySelectorAll('[data-star]'), function (b) {
      b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-star')) <= value));
    });
  }

  /* Replaces the form with a short, quiet thank-you. The dialog stays open
     just long enough to read it, then closes itself. */
  function showThanks() {
    var card = feedbackForm;
    if (!card) return;
    var old = card.querySelector('.feedback-thanks');
    if (old) old.parentNode.removeChild(old);
    var panel = document.createElement('div');
    panel.className = 'feedback-thanks';
    panel.innerHTML =
      '<span class="thanks-mark" aria-hidden="true">✓</span>' +
      '<h3>Thank you for your valuable feedback</h3>' +
      '<p>Your note is on its way to the studio — it genuinely helps us build better.</p>';
    card.appendChild(panel);
    card.classList.add('is-thanked');
  }

  function clearThanks() {
    if (!feedbackForm) return;
    feedbackForm.classList.remove('is-thanked');
    var old = feedbackForm.querySelector('.feedback-thanks');
    if (old) old.parentNode.removeChild(old);
  }

  function openFeedback(it) {
    if (!feedbackBox) return;
    clearThanks();
    feedbackTarget = it ? it.id : '';
    if (feedbackError) { feedbackError.hidden = true; feedbackError.textContent = ''; }
    if (feedbackLede) {
      feedbackLede.textContent = it
        ? 'About ' + it.p.name.replace(/\.$/, '') + ' — a sentence is enough. Your note goes to the studio, not to other visitors.'
        : 'A sentence is enough. Your note goes to the studio, not to other visitors.';
    }
    setStars(0);
    if (feedbackMessage) feedbackMessage.value = '';
    if (feedbackName) feedbackName.value = '';
    if (typeof feedbackBox.showModal === 'function') feedbackBox.showModal();
    else feedbackBox.setAttribute('open', '');
    if (feedbackMessage) feedbackMessage.focus();
  }

  if (feedbackBox) {
    Array.prototype.forEach.call(feedbackBox.querySelectorAll('[data-star]'), function (b) {
      b.addEventListener('click', function () {
        var value = Number(b.getAttribute('data-star'));
        setStars(feedbackRating === value ? 0 : value);
        /* The rating answers in motion: coloured stars lift off the chosen one,
           and five stars let a party popper go with them. */
        if (feedbackRating) {
          b.classList.remove('is-pop');
          void b.offsetWidth;
          b.classList.add('is-pop');
          L.starBurst(b, { party: value === 5 });
        }
      });
    });
    var feedbackCancel = document.getElementById('feedbackCancel');
    if (feedbackCancel) feedbackCancel.addEventListener('click', function () { feedbackBox.close(); });
    feedbackBox.addEventListener('click', function (event) { if (event.target === feedbackBox) feedbackBox.close(); });
    feedbackForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!feedbackBox.open) return;
      var message = (feedbackMessage.value || '').trim();
      if (message.length < 4) {
        feedbackError.hidden = false;
        feedbackError.textContent = 'Write a few words first.';
        feedbackMessage.focus();
        return;
      }
      if (feedbackSend) { feedbackSend.disabled = true; feedbackSend.textContent = 'Sending…'; }
      L.feedback({ message: message, name: feedbackName ? feedbackName.value : '', project: feedbackTarget, rating: feedbackRating })
        .then(function (res) {
          if (feedbackSend) { feedbackSend.disabled = false; feedbackSend.textContent = 'Send feedback'; }
          if (!res.ok) {
            feedbackError.hidden = false;
            feedbackError.textContent = res.error || 'Could not send that just now.';
            return;
          }
          /* The note is stored first; the card then thanks the visitor in its
             own words before closing itself. */
          showThanks();
          setTimeout(function () {
            if (feedbackBox.open) feedbackBox.close();
          }, 1700);
        });
    });
  }

  /* Page-level entry point, next to the copy that explains the page. */
  var pageFeedback = document.getElementById('pageFeedback');
  if (pageFeedback) pageFeedback.addEventListener('click', function () { openFeedback(null); });

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

/* Real likes and plain sharing for the public gallery.
 *
 * Counts come from the server, never from the page: GET /api/gallery/likes for
 * a batch of ids and POST /api/gallery/likes to toggle one. The visitor id is
 * a random, cookie-scoped string - no account, no email, nothing personal -
 * and the server enforces one like per visitor per project.
 *
 * When the API cannot be reached (a static copy of the page, no backend) the
 * buttons say so instead of showing an invented number.
 */
'use strict';
(function (root) {
  var API = '/api/gallery/likes';
  var COOKIE = 'qs_gallery_visitor';

  function readCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }
  function writeCookie(name, value) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=63072000; SameSite=Lax' + secure;
  }
  /* One random id per browser. It is what the server counts, so it must stay
     stable; clearing site data resets it, which is the same as a new visitor. */
  function visitorId() {
    var existing = readCookie(COOKIE);
    if (/^[a-z0-9]{16,40}$/.test(existing)) return existing;
    var bytes = new Uint8Array(16);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    var id = Array.prototype.map.call(bytes, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
    writeCookie(COOKIE, id);
    return id;
  }

  /* Every browser this page supports has fetch; a page opened in an unusual
     embedded viewer, or a test harness without it, says "offline" instead of
     throwing on first paint. */
  function canReachApi() {
    return typeof root.fetch === 'function';
  }

  var visitor = null;
  function headers() {
    visitor = visitor || visitorId();
    return { 'Content-Type': 'application/json', 'X-Gallery-Visitor': visitor };
  }

  function fetchCounts(ids) {
    var list = (ids || []).filter(Boolean);
    if (!list.length) return Promise.resolve({ counts: {}, mine: [], available: true });
    if (!canReachApi()) return Promise.resolve({ counts: {}, mine: [], available: false });
    var url = API + '?ids=' + encodeURIComponent(list.join(','));
    return fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: headers() })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (body) {
        return {
          counts: (body && body.counts) || {},
          mine: Array.isArray(body && body.mine) ? body.mine : [],
          available: true
        };
      })
      .catch(function () {
        return { counts: {}, mine: [], available: false };
      });
  }

  function setLike(id, liked) {
    if (!canReachApi()) return Promise.resolve({ ok: false });
    return fetch(API, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: headers(),
      body: JSON.stringify({ id: id, liked: !!liked })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (body) {
        return { ok: true, count: Math.max(0, Number(body && body.count) || 0), liked: !!(body && body.liked) };
      })
      .catch(function () {
        return { ok: false };
      });
  }

  /* A like answers with three hearts drifting up from the button, slowly and
     softly. They are drawn as SVG rather than emoji so the colour and the shape
     are the same everywhere. Purely decorative. */
  var HEART_INKS = ['#E5304A', '#F2618A', '#FF7A59'];
  var HEART_PATH = 'M12 20.4S3.9 15.6 2.2 11.2A5.4 5.4 0 0 1 12 6.1a5.4 5.4 0 0 1 9.8 5.1c-1.7 4.4-9.8 9.2-9.8 9.2Z';
  function heartBurst(host) {
    if (!host || !host.isConnected) return;
    var box = document.createElement('span');
    box.className = 'heart-burst';
    box.setAttribute('aria-hidden', 'true');
    var spread = Math.max(22, Math.min(58, (host.offsetWidth || 80) * 0.8));
    for (var i = 0; i < 3; i++) {
      var heart = document.createElement('i');
      var size = 12 + Math.round(Math.random() * 5);
      heart.style.color = HEART_INKS[i % HEART_INKS.length];
      /* The like sits at the left edge of a card, so the hearts always
         drift right and up - never off the card. */
      heart.style.setProperty('--dx', Math.round(spread * (0.35 + i * 0.45) + (Math.random() * 8 - 4)) + 'px');
      heart.style.setProperty('--dy', (-34 - Math.round(Math.random() * 20)) + 'px');
      heart.style.setProperty('--rot', (i === 1 ? 0 : (i - 1) * 14) + 'deg');
      heart.style.left = (42 + i * 8) + '%';
      heart.style.animationDelay = (i * 90) + 'ms';
      heart.innerHTML = '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
        '" aria-hidden="true"><path fill="currentColor" d="' + HEART_PATH + '"/></svg>';
      box.appendChild(heart);
    }
    host.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 1800);
  }
  /* Kept for any caller that still wants text glyphs. */
  var GLYPHS = ['❤️', '💖', '💗'];
  /* `count` lets a caller keep the burst small (the like uses three). */
  function burst(host, glyphs, count) {
    if (!host || !host.isConnected) return;
    var set = (glyphs && glyphs.length) ? glyphs : GLYPHS;
    var box = document.createElement('span');
    box.className = 'heart-burst';
    box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < (count || Math.max(6, set.length)); i++) {
      var heart = document.createElement('i');
      heart.textContent = set[i % set.length];
      /* Small hosts (a star button) get a tighter burst than a wide pill. */
      var spread = Math.max(16, Math.min(46, (host.offsetWidth || 90) * 0.55));
      heart.style.setProperty('--dx', (Math.round((Math.random() * 2 - 1) * spread)) + 'px');
      heart.style.setProperty('--dy', (-52 - Math.round(Math.random() * 46)) + 'px');
      heart.style.left = (38 + Math.round(Math.random() * 30)) + '%';
      heart.style.animationDelay = (i * 55) + 'ms';
      heart.style.fontSize = (13 + Math.round(Math.random() * 7)) + 'px';
      box.appendChild(heart);
    }
    host.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 1800);
  }

  /* The rating stars answer in colour: small stars in the brand palette (plus
     pink and violet) rise from the star that was chosen and turn as they go.
     Five stars also throw a single party popper - the one emoji the moment
     deserves. */
  var STAR_INKS = ['#F6A21D', '#F2618A', '#8B5CF6', '#2FA97C', '#F2C14E', '#E8577E'];
  function starBurst(host, opts) {
    if (!host || !host.isConnected) return;
    opts = opts || {};
    var box = document.createElement('span');
    box.className = 'star-burst';
    box.setAttribute('aria-hidden', 'true');
    var spread = Math.max(26, Math.min(62, (host.offsetWidth || 42) * 1.6));
    var total = opts.count || 8;
    for (var i = 0; i < total; i++) {
      var bit = document.createElement('i');
      var size = 11 + Math.round(Math.random() * 9);
      bit.className = 'star-bit';
      bit.style.color = STAR_INKS[i % STAR_INKS.length];
      bit.style.setProperty('--dx', Math.round((Math.random() * 2 - 1) * spread) + 'px');
      bit.style.setProperty('--dy', (-40 - Math.round(Math.random() * 22)) + 'px');
      bit.style.setProperty('--rot', Math.round((Math.random() * 2 - 1) * 150) + 'deg');
      bit.style.left = (34 + Math.round(Math.random() * 32)) + '%';
      bit.style.animationDelay = (i * 40) + 'ms';
      bit.innerHTML = '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
        '" aria-hidden="true"><path fill="currentColor" d="M12 2.4l2.95 6.02 6.65.95-4.8 4.66 1.14 6.6L12 17.5l-5.94 3.13 1.14-6.6-4.8-4.66 6.65-.95z"/></svg>';
      box.appendChild(bit);
    }
    if (opts.party) {
      var pop = document.createElement('i');
      pop.className = 'star-party';
      pop.textContent = '🎉';
      box.appendChild(pop);
    }
    host.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 1900);
  }

  var toastEl = null, toastTimer = 0;
  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'gallery-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  /* Share: the OS sheet where the browser has one (phones), the clipboard
     otherwise, and a selectable prompt as the last resort so the link can
     always be copied rather than silently failing. */
  function share(payload) {
    var url = payload.url || location.href;
    var title = payload.title || document.title;
    var text = payload.text || 'A KTM Energy Experts solar installation';
    if (navigator.share) {
      return navigator.share({ title: title, text: text, url: url })
        .then(function () { return 'shared'; })
        .catch(function (err) { return err && err.name === 'AbortError' ? 'cancelled' : copy(url); });
    }
    return copy(url);
  }

  function copy(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(url).then(function () {
        toast('Link copied — paste it in WhatsApp or anywhere else.');
        return 'copied';
      }).catch(function () {
        window.prompt('Copy this link', url);
        return 'prompted';
      });
    }
    window.prompt('Copy this link', url);
    return Promise.resolve('prompted');
  }

  /* Feedback: a short plain-text note about a project (or the page). The same
     anonymous visitor id as the likes travels with it, and the server caps the
     length and the rate. Errors are returned, never thrown, so the form can
     keep the typed text. */
  var FEEDBACK_API = '/api/gallery/feedback';
  function feedback(payload) {
    if (!canReachApi()) return Promise.resolve({ ok: false, error: 'Feedback needs the live site.' });
    var body = {
      message: String((payload && payload.message) || '').slice(0, 1000),
      name: String((payload && payload.name) || '').slice(0, 120),
      project: (payload && payload.project) || '',
      rating: payload && payload.rating ? payload.rating : null
    };
    return fetch(FEEDBACK_API, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: headers(),
      body: JSON.stringify(body)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) return { ok: false, error: (data && data.error) || 'Could not send that just now.' };
          return { ok: true, id: data && data.id };
        });
      })
      .catch(function () { return { ok: false, error: 'Could not reach the site. Check your connection.' }; });
  }

  root.GalleryLikes = {
    feedback: feedback,
    visitorId: visitorId,
    fetchCounts: fetchCounts,
    setLike: setLike,
    burst: burst,
    heartBurst: heartBurst,
    starBurst: starBurst,
    toast: toast,
    share: share
  };
})(window);

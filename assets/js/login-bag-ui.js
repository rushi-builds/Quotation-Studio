/**
 * Login Bag UI — visual / animation layer only.
 * No authentication, no Visme, no network calls.
 *
 * Usage:
 *   const bagUi = window.QSLoginBagUI.mount({ root: document.getElementById('authScreen') });
 *   bagUi.setMood('cover' | 'peek' | 'open' | 'happy' | 'shy' | 'success' | 'loading' | 'idle');
 *   bagUi.setLoading(true|false);
 *   bagUi.destroy();
 */
(function (global) {
  'use strict';

  var MOODS = ['is-open', 'is-peek', 'is-cover', 'is-happy', 'is-shy', 'is-success', 'is-loading'];

  function $(root, id) {
    if (!root) return null;
    if (root.id === id) return root;
    return root.querySelector('#' + id) || document.getElementById(id);
  }

  function clearMood(bag) {
    if (!bag) return;
    MOODS.forEach(function (c) { bag.classList.remove(c); });
  }

  function setMood(bag, mood) {
    if (!bag) return;
    clearMood(bag);
    if (!mood || mood === 'idle') return;
    if (mood === 'loading') {
      bag.classList.add('is-open', 'is-loading');
      return;
    }
    if (mood === 'success') {
      bag.classList.add('is-open', 'is-happy', 'is-success');
      return;
    }
    if (mood === 'shy' || mood === 'error') {
      bag.classList.add('is-open', 'is-shy', 'is-cover');
      return;
    }
    if (mood === 'cover') {
      bag.classList.add('is-open', 'is-cover');
      return;
    }
    if (mood === 'peek') {
      bag.classList.add('is-open', 'is-peek');
      return;
    }
    if (mood === 'happy') {
      bag.classList.add('is-open', 'is-happy', 'is-peek');
      return;
    }
    if (mood === 'open') {
      bag.classList.add('is-open');
    }
  }

  function moodFromInput(el) {
    if (!el) return 'idle';
    var kind = el.getAttribute('data-bag') || '';
    var type = (el.type || '').toLowerCase();
    if (kind === 'password' || type === 'password') {
      return type === 'password' ? 'cover' : 'happy';
    }
    if (kind === 'email' || type === 'email' || type === 'text') {
      return 'peek';
    }
    return 'open';
  }

  /**
   * @param {object} opts
   * @param {HTMLElement} [opts.root] - #authScreen (or any container with #loginBag + form)
   * @param {HTMLElement} [opts.bag]
   * @param {HTMLElement} [opts.form]
   * @param {boolean} [opts.followPointer=true]
   */
  function mount(opts) {
    opts = opts || {};
    var root = opts.root || document.getElementById('authScreen');
    var bag = opts.bag || (root && root.querySelector('#loginBag')) || document.getElementById('loginBag');
    var form = opts.form || (root && root.querySelector('#authForm')) || document.getElementById('authForm');
    if (!bag) {
      return {
        setMood: function () {},
        setLoading: function () {},
        happy: function () {},
        shy: function () {},
        destroy: function () {},
        el: null
      };
    }

    var pupils = bag.querySelectorAll('.bag-eye i');
    var followPointer = opts.followPointer !== false;
    var destroyed = false;
    var loading = false;
    var onMove = null;
    var inputCleanups = [];

    function applyFromTarget(el) {
      if (destroyed || loading) return;
      setMood(bag, moodFromInput(el));
    }

    function onFocus(ev) {
      applyFromTarget(ev.target);
    }

    function onBlur() {
      setTimeout(function () {
        if (destroyed || loading) return;
        var a = document.activeElement;
        if (!form || !form.contains(a)) setMood(bag, 'idle');
        else applyFromTarget(a);
      }, 30);
    }

    function onInput(ev) {
      if (destroyed || loading || !pupils.length) return;
      var inp = ev.target;
      var len = (inp.value || '').length;
      var x = Math.min(4, Math.max(-4, (len % 9) - 4));
      pupils.forEach(function (p) {
        p.style.transform = 'translate(' + x + 'px, 2px)';
      });
      if (inp.getAttribute('data-bag') === 'email' || inp.type === 'email') {
        setMood(bag, 'peek');
      }
    }

    if (form) {
      form.querySelectorAll('input').forEach(function (inp) {
        inp.addEventListener('focus', onFocus);
        inp.addEventListener('blur', onBlur);
        inp.addEventListener('input', onInput);
        inputCleanups.push(function () {
          inp.removeEventListener('focus', onFocus);
          inp.removeEventListener('blur', onBlur);
          inp.removeEventListener('input', onInput);
        });
      });
    }

    if (followPointer) {
      onMove = function (ev) {
        if (destroyed || loading || !pupils.length) return;
        if (bag.classList.contains('is-cover')) return;
        if (root && (root.hidden || root.style.display === 'none' || root.classList.contains('is-hidden'))) return;
        var rect = bag.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 3;
        var dx = Math.max(-5, Math.min(5, (ev.clientX - cx) / 28));
        var dy = Math.max(-3, Math.min(4, (ev.clientY - cy) / 36));
        pupils.forEach(function (p) {
          p.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        });
      };
      document.addEventListener('mousemove', onMove);
    }

    var api = {
      el: bag,
      root: root,
      setMood: function (mood) {
        if (destroyed) return;
        if (loading && mood !== 'loading' && mood !== 'success' && mood !== 'error' && mood !== 'shy') return;
        setMood(bag, mood);
      },
      setLoading: function (on) {
        if (destroyed) return;
        loading = !!on;
        if (loading) setMood(bag, 'loading');
        else setMood(bag, 'open');
      },
      happy: function () {
        loading = false;
        setMood(bag, 'success');
      },
      shy: function () {
        loading = false;
        setMood(bag, 'shy');
        setTimeout(function () {
          if (!destroyed) bag.classList.remove('is-shy');
        }, 600);
      },
      /** Password visibility toggle feedback */
      onPasswordVisible: function (visible) {
        if (destroyed || loading) return;
        if (visible) setMood(bag, 'happy');
        else setMood(bag, 'cover');
      },
      destroy: function () {
        destroyed = true;
        if (onMove) document.removeEventListener('mousemove', onMove);
        inputCleanups.forEach(function (fn) { fn(); });
        inputCleanups = [];
      }
    };

    return api;
  }

  /** Build bag markup string (optional — pages can also hardcode HTML). */
  function bagMarkup() {
    return [
      '<div class="login-bag" id="loginBag" aria-hidden="true">',
      '  <div class="bag-handle"><span class="bag-handle-bar"></span></div>',
      '  <div class="bag-flap">',
      '    <div class="bag-flap-face">',
      '      <div class="bag-eyes"><span class="bag-eye"><i></i></span><span class="bag-eye"><i></i></span></div>',
      '      <div class="bag-smile"></div>',
      '      <div class="bag-badge">KTM</div>',
      '    </div>',
      '    <div class="bag-flap-edge"></div>',
      '  </div>',
      '  <div class="bag-hands"><span class="bag-hand bag-hand-l"></span><span class="bag-hand bag-hand-r"></span></div>',
      '  <div class="bag-body">',
      '    <div class="bag-pocket"></div>',
      '    <div class="bag-zip"><span></span><span></span><span></span><span></span><span></span>',
      '    <span></span><span></span><span></span><span></span><span></span>',
      '    <i class="bag-zip-pull" aria-hidden="true"></i></div>',
      '    <div class="bag-strap bag-strap-l"></div>',
      '    <div class="bag-strap bag-strap-r"></div>',
      '  </div>',
      '  <div class="bag-shadow"></div>',
      '</div>'
    ].join('');
  }

  global.QSLoginBagUI = {
    mount: mount,
    bagMarkup: bagMarkup,
    MOODS: MOODS.slice()
  };
})(typeof window !== 'undefined' ? window : globalThis);

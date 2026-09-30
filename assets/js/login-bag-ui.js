/**
 * Login scene UI — character + briefcase + green card poses.
 * Recreates the Visme reference choreography without Visme runtime.
 * No authentication / no network.
 *
 * Poses: walk → place → present → think | loading | success | shy
 */
(function (global) {
  'use strict';

  var POSES = ['walk', 'place', 'idle', 'present', 'think', 'loading', 'success', 'shy'];

  function setPose(scene, pose) {
    if (!scene) return;
    if (POSES.indexOf(pose) < 0) pose = 'present';
    scene.setAttribute('data-pose', pose);
  }

  function moodToPose(mood) {
    switch (mood) {
      case 'idle': return 'present';
      case 'open':
      case 'peek':
      case 'cover':
      case 'happy': return 'think';
      case 'loading': return 'loading';
      case 'success': return 'success';
      case 'shy':
      case 'error': return 'shy';
      default: return mood || 'present';
    }
  }

  /**
   * @param {object} opts
   * @param {HTMLElement} [opts.root] #authScreen
   * @param {HTMLElement} [opts.scene] #loginBagScene
   * @param {HTMLElement} [opts.form] #authForm
   * @param {boolean} [opts.intro=true] play walk → place → present on mount
   */
  function mount(opts) {
    opts = opts || {};
    var root = opts.root || document.getElementById('authScreen');
    var scene = opts.scene ||
      (root && root.querySelector('#loginBagScene')) ||
      document.getElementById('loginBagScene');
    var form = opts.form ||
      (root && root.querySelector('#authForm')) ||
      document.getElementById('authForm');

    if (!scene) {
      return {
        setMood: function () {},
        setPose: function () {},
        setLoading: function () {},
        happy: function () {},
        shy: function () {},
        onPasswordVisible: function () {},
        destroy: function () {},
        el: null
      };
    }

    var destroyed = false;
    var loading = false;
    var introDone = false;
    var timers = [];
    var inputCleanups = [];

    function later(fn, ms) {
      var id = setTimeout(function () {
        if (!destroyed) fn();
      }, ms);
      timers.push(id);
      return id;
    }

    function playIntro() {
      if (opts.intro === false) {
        setPose(scene, 'present');
        introDone = true;
        return;
      }
      setPose(scene, 'walk');
      later(function () {
        setPose(scene, 'place');
      }, 900);
      later(function () {
        setPose(scene, 'present');
        introDone = true;
      }, 1600);
    }

    function applyThink() {
      if (destroyed || loading || !introDone) return;
      setPose(scene, 'think');
    }

    function applyPresent() {
      if (destroyed || loading || !introDone) return;
      setPose(scene, 'present');
    }

    if (form) {
      form.querySelectorAll('input').forEach(function (inp) {
        function onFocus() { applyThink(); }
        function onBlur() {
          later(function () {
            if (destroyed || loading) return;
            var a = document.activeElement;
            if (!form.contains(a)) applyPresent();
            else applyThink();
          }, 40);
        }
        function onInput() { applyThink(); }
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

    playIntro();

    return {
      el: scene,
      root: root,
      setPose: function (pose) {
        if (destroyed) return;
        setPose(scene, pose);
      },
      setMood: function (mood) {
        if (destroyed) return;
        if (loading && mood !== 'loading' && mood !== 'success' && mood !== 'error' && mood !== 'shy') return;
        setPose(scene, moodToPose(mood));
      },
      setLoading: function (on) {
        if (destroyed) return;
        loading = !!on;
        if (loading) setPose(scene, 'loading');
        else if (introDone) setPose(scene, 'present');
      },
      happy: function () {
        loading = false;
        setPose(scene, 'success');
      },
      shy: function () {
        loading = false;
        setPose(scene, 'shy');
        later(function () {
          if (!destroyed) setPose(scene, 'present');
        }, 700);
      },
      onPasswordVisible: function () {
        if (destroyed || loading) return;
        applyThink();
      },
      destroy: function () {
        destroyed = true;
        timers.forEach(clearTimeout);
        timers = [];
        inputCleanups.forEach(function (fn) { fn(); });
        inputCleanups = [];
      }
    };
  }

  function bagMarkup() {
    return '<!-- scene markup lives in dashboard.html -->';
  }

  global.QSLoginBagUI = {
    mount: mount,
    bagMarkup: bagMarkup,
    POSES: POSES.slice()
  };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * Login Auth controller — Arena / Quotation Studio platform auth.
 * Depends on:
 *   - window.PlatformAPI (platform-api.js) for /api/auth/*
 *   - window.QSLoginBagUI (login-bag-ui.js) for animation only
 *
 * Auth logic is swappable: pass a custom `api` adapter to mount().
 * Animation is never imported into the API layer.
 */
(function (global) {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function defaultApi() {
    var p = global.PlatformAPI;
    if (!p) throw new Error('Platform API not loaded (assets/js/platform-api.js).');
    return {
      login: function (email, password) { return p.login(email, password); },
      register: function (name, email, password, role) { return p.register(name, email, password, role); },
      forgotPassword: function (email) { return p.forgotPassword(email); },
      resetPassword: function (email, code, password) { return p.resetPassword(email, code, password); },
      setSessionToken: function (token) {
        if (p.setSessionToken) p.setSessionToken(token);
      },
      me: function () { return p.me ? p.me() : Promise.resolve(null); },
      logout: function () { return p.logout ? p.logout() : Promise.resolve(); }
    };
  }

  function validateEmail(email) {
    if (!email || !String(email).trim()) return 'Enter your work email.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return 'Enter a valid email address.';
    return null;
  }

  function validatePassword(password, { required }) {
    if (!required) return null;
    if (!password) return 'Enter your password.';
    if (/\s/.test(password)) return 'Password cannot contain spaces.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password.length > 128) return 'Password is too long.';
    return null;
  }

  /**
   * @param {object} opts
   * @param {object} [opts.api] - auth adapter (defaults to QSPlatform)
   * @param {object} [opts.bagUi] - result of QSLoginBagUI.mount()
   * @param {HTMLElement} [opts.root]
   * @param {function} [opts.onAuthenticated] - called with { user, token, mode }
   * @param {function} [opts.onLogout]
   * @param {function} [opts.onToast] - (msg) => void
   */
  function mount(opts) {
    opts = opts || {};
    var root = opts.root || $('authScreen');
    var api = opts.api || defaultApi();
    var bagUi = opts.bagUi || null;
    if (!bagUi && global.QSLoginBagUI) {
      bagUi = global.QSLoginBagUI.mount({ root: root });
    }

    var mode = 'login';
    var busy = false;

    function setSubmitLabel(text) {
      var label = $('authSubmitLabel');
      if (label) label.textContent = text;
      else if ($('authSubmit')) $('authSubmit').textContent = text;
    }

    function clearMessages() {
      var err = $('authError');
      if (err) {
        err.textContent = '';
        err.classList.remove('on');
      }
      var ok = $('authOk');
      if (ok) {
        ok.style.display = 'none';
        ok.textContent = '';
        ok.classList.remove('on');
      }
    }

    function showError(msg) {
      clearMessages();
      var err = $('authError');
      if (!err) return;
      err.textContent = msg || 'Something went wrong';
      err.classList.add('on');
      if (bagUi) bagUi.shy();
    }

    function showOk(msg) {
      clearMessages();
      var ok = $('authOk');
      if (!ok) return;
      ok.textContent = msg || '';
      ok.style.display = msg ? 'block' : 'none';
      ok.classList.add('on');
    }

    function setLoading(on) {
      busy = !!on;
      var btn = $('authSubmit');
      if (btn) {
        btn.disabled = busy;
        btn.classList.toggle('is-loading', busy);
      }
      var tabs = root ? root.querySelectorAll('.auth-tabs button') : [];
      tabs.forEach(function (t) { t.disabled = busy; });
      if (bagUi) bagUi.setLoading(busy);
    }

    function setMode(next) {
      mode = next || 'login';
      var isLogin = mode === 'login';
      var isRegister = mode === 'register';
      var isForgot = mode === 'forgot';
      var isReset = mode === 'reset';

      if ($('tabLogin')) $('tabLogin').classList.toggle('on', isLogin);
      if ($('tabRegister')) $('tabRegister').classList.toggle('on', isRegister);
      if ($('nameField')) $('nameField').hidden = !isRegister;
      if ($('roleField')) $('roleField').hidden = !isRegister;
      if ($('passwordField')) $('passwordField').hidden = isForgot;
      if ($('resetCodeField')) $('resetCodeField').hidden = !isReset;
      if ($('newPasswordField')) $('newPasswordField').hidden = !isReset;

      if ($('authPassword')) {
        $('authPassword').required = isLogin || isRegister;
        $('authPassword').autocomplete = isLogin ? 'current-password' : 'new-password';
      }
      if ($('authResetCode')) $('authResetCode').required = isReset;
      if ($('authNewPassword')) $('authNewPassword').required = isReset;
      if ($('btnForgot')) $('btnForgot').hidden = !(isLogin || isForgot);
      if ($('btnBackSignIn')) $('btnBackSignIn').hidden = isLogin || isRegister;

      var tabs = root ? root.querySelector('.auth-tabs') : document.querySelector('.auth-tabs');
      if (tabs) tabs.style.display = (isForgot || isReset) ? 'none' : '';

      if (isLogin) {
        if ($('authHeading')) $('authHeading').textContent = 'Sign in';
        if ($('authSub')) $('authSub').textContent = 'Open the bag — enter work email & password.';
        setSubmitLabel('Sign in');
      } else if (isRegister) {
        if ($('authHeading')) $('authHeading').textContent = 'Create account';
        if ($('authSub')) $('authSub').textContent = 'Type your role when you register. Each work email can sign up once.';
        setSubmitLabel('Create account');
      } else if (isForgot) {
        if ($('authHeading')) $('authHeading').textContent = 'Forgot password';
        if ($('authSub')) $('authSub').textContent = 'Enter the email for your account. If it exists, a one-time recovery code will be shown (email delivery is not configured yet).';
        setSubmitLabel('Get recovery code');
      } else if (isReset) {
        if ($('authHeading')) $('authHeading').textContent = 'Set new password';
        if ($('authSub')) $('authSub').textContent = 'Enter the recovery code and choose a new password (minimum 8 characters, no spaces).';
        setSubmitLabel('Update password & sign in');
      }
      clearMessages();
    }

    function keepSession(r) {
      if (r && r.token && api.setSessionToken) api.setSessionToken(r.token);
    }

    function toast(msg) {
      if (typeof opts.onToast === 'function') opts.onToast(msg);
    }

    async function handleSubmit(ev) {
      if (ev) ev.preventDefault();
      if (busy) return;
      clearMessages();

      var email = ($('authEmail') && $('authEmail').value || '').trim();
      var password = $('authPassword') ? $('authPassword').value : '';
      var name = $('authName') ? $('authName').value.trim() : '';
      var code = $('authResetCode') ? $('authResetCode').value.trim() : '';
      var newPass = $('authNewPassword') ? $('authNewPassword').value : '';

      var emailErr = validateEmail(email);
      if (emailErr) {
        showError(emailErr);
        return;
      }

      if (mode === 'login' || mode === 'register') {
        var pwErr = validatePassword(password, { required: true });
        if (pwErr) {
          showError(pwErr);
          return;
        }
      }
      if (mode === 'register') {
        if (!name) {
          showError('Please enter your name.');
          return;
        }
        var roleTyped = ($('authRole') && $('authRole').value || '').trim();
        if (!roleTyped) {
          showError('Enter your role (for example Owner, Sales, Viewer, or Project lead).');
          return;
        }
      }
      if (mode === 'reset') {
        if (!code) {
          showError('Enter the recovery code.');
          return;
        }
        var npErr = validatePassword(newPass, { required: true });
        if (npErr) {
          showError(npErr);
          return;
        }
      }

      setLoading(true);
      try {
        if (mode === 'login') {
          var rLogin = await api.login(email, password);
          keepSession(rLogin);
          if (bagUi) bagUi.happy();
          toast('Signed in');
          if (typeof opts.onAuthenticated === 'function') {
            await opts.onAuthenticated({ user: rLogin.user, token: rLogin.token, mode: 'login', response: rLogin });
          }
        } else if (mode === 'register') {
          var role = ($('authRole') && $('authRole').value || '').trim();
          var rReg = await api.register(name, email, password, role);
          keepSession(rReg);
          if (bagUi) bagUi.happy();
          toast('Account created');
          if (typeof opts.onAuthenticated === 'function') {
            await opts.onAuthenticated({ user: rReg.user, token: rReg.token, mode: 'register', response: rReg });
          }
        } else if (mode === 'forgot') {
          var rForgot = await api.forgotPassword(email);
          if (rForgot.recoveryCode) {
            if ($('authResetCode')) $('authResetCode').value = rForgot.recoveryCode;
            setMode('reset');
            showOk(
              'Recovery code: ' + rForgot.recoveryCode +
              '. It expires in 30 minutes and works once. Enter it below with your new password.'
            );
            if (bagUi) bagUi.setMood('happy');
          } else {
            setMode('reset');
            showOk(rForgot.message || 'If that account exists, follow the recovery steps provided by your administrator.');
          }
        } else if (mode === 'reset') {
          var rReset = await api.resetPassword(email, code, newPass);
          keepSession(rReset);
          if (bagUi) bagUi.happy();
          toast(rReset.message || 'Password updated');
          if (typeof opts.onAuthenticated === 'function') {
            await opts.onAuthenticated({ user: rReset.user, token: rReset.token, mode: 'reset', response: rReset });
          }
        }
      } catch (err) {
        showError((err && err.message) || 'Authentication failed');
      } finally {
        setLoading(false);
      }
    }

    /* wire DOM */
    if ($('tabLogin')) $('tabLogin').addEventListener('click', function () { setMode('login'); });
    if ($('tabRegister')) $('tabRegister').addEventListener('click', function () { setMode('register'); });
    if ($('btnForgot')) $('btnForgot').addEventListener('click', function () { setMode('forgot'); });
    if ($('btnBackSignIn')) $('btnBackSignIn').addEventListener('click', function () { setMode('login'); });

    if ($('btnTogglePwd') && $('authPassword')) {
      $('btnTogglePwd').addEventListener('click', function () {
        var inp = $('authPassword');
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        $('btnTogglePwd').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        $('btnTogglePwd').title = show ? 'Hide password' : 'Show password';
        if (bagUi && bagUi.onPasswordVisible) bagUi.onPasswordVisible(show);
      });
    }

    if ($('authForm')) {
      $('authForm').addEventListener('submit', handleSubmit);
    }

    setMode('login');

    return {
      setMode: setMode,
      getMode: function () { return mode; },
      showError: showError,
      showOk: showOk,
      setLoading: setLoading,
      submit: handleSubmit,
      bagUi: bagUi,
      api: api,
      show: function () {
        if (root) {
          root.hidden = false;
          root.style.display = '';
          root.classList.remove('is-hidden');
        }
      },
      hide: function () {
        if (root) {
          root.style.display = 'none';
          root.classList.add('is-hidden');
        }
      },
      destroy: function () {
        if (bagUi && bagUi.destroy) bagUi.destroy();
      }
    };
  }

  global.QSLoginAuth = {
    mount: mount,
    validateEmail: validateEmail,
    validatePassword: validatePassword
  };
})(typeof window !== 'undefined' ? window : globalThis);

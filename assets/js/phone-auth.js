'use strict';
/* Phone OTP sign-in (Firebase Authentication).
   The SMS code never touches our servers: Firebase verifies the number and
   hands the browser an ID token, which POST /api/auth/phone/verify checks
   cryptographically before creating a Studio session. */
(function () {
  var SDK_VER = '10.14.1';
  var S = { cfg: null, modal: null, confirm: null, verifier: null, resendAt: 0, timer: null, busy: false };

  function message(text) {
    if (typeof window.toast === 'function') window.toast(text, true);
    var el = document.getElementById('socialMessage');
    if (el) { el.textContent = text; el.hidden = false; }
  }
  function friendly(err) {
    var code = (err && err.code) || '';
    if (code === 'auth/invalid-phone-number') return 'Enter a valid phone number with country code (for example +91 98765 43210).';
    if (code === 'auth/missing-phone-number') return 'Enter your phone number first.';
    if (code === 'auth/quota-exceeded') return 'SMS limit reached for now. Try again later or use email sign-in.';
    if (code === 'auth/user-disabled') return 'This sign-in is disabled. Contact support.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes, then try again.';
    if (code === 'auth/code-expired') return 'That code expired. Request a fresh code.';
    if (code === 'auth/invalid-verification-code') return 'Wrong code. Check the SMS and try again.';
    if (code === 'auth/captcha-check-failed' || code === 'auth/missing-recaptcha-token') return 'Security check failed. Reload the page and try again.';
    if (code === 'auth/invalid-app-credential') return 'Security check failed. Reload the page and try again.';
    if (code === 'auth/operation-not-allowed') return 'Phone sign-in is not enabled yet. It is not live yet.';
    if (code === 'auth/unauthorized-domain') return 'This website is not authorized for phone sign-in yet. Contact support.';
    return (err && err.message) || 'Could not complete phone sign-in. Try again.';
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var s = document.createElement('script');
      s.src = src; s.async = true;
      var to = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, 25000);
      s.onload = function () { if (!done) { done = true; clearTimeout(to); resolve(); } };
      s.onerror = function () { if (!done) { done = true; clearTimeout(to); reject(new Error('load')); } };
      document.head.appendChild(s);
    });
  }
  async function ensureFirebase(cfg) {
    if (window.firebase && window.firebase.auth && window.firebase.apps && window.firebase.apps.length) return;
    if (!window.firebase) await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VER + '/firebase-app-compat.js');
    if (!window.firebase.auth) await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VER + '/firebase-auth-compat.js');
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId });
    }
  }
  function css() {
    if (document.getElementById('qsPhoneCss')) return;
    var st = document.createElement('style');
    st.id = 'qsPhoneCss';
    st.textContent = [
      '#qsPhoneWrap{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.66);backdrop-filter:blur(3px);padding:16px}',
      '#qsPhoneBox{width:min(400px,100%);background:linear-gradient(160deg,#1c2436,#121826);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:22px;color:#eef2f7;box-shadow:0 24px 60px rgba(0,0,0,.5)}',
      '#qsPhoneBox h3{margin:0 0 4px;font-size:18px}',
      '#qsPhoneBox .sub{margin:0 0 14px;font-size:13px;color:#aeb8cc}',
      '#qsPhoneBox label{display:block;font-size:12px;color:#aeb8cc;margin:10px 0 6px}',
      '#qsPhoneBox input{width:100%;box-sizing:border-box;background:#0e1524;border:1px solid rgba(255,255,255,.16);color:#fff;border-radius:10px;padding:11px 12px;font-size:16px;letter-spacing:.5px}',
      '#qsPhoneBox input:focus{outline:none;border-color:#f5a623}',
      '#qsPhoneBox .row{display:flex;gap:10px;margin-top:16px}',
      '#qsPhoneBox button{flex:1;border:0;border-radius:10px;padding:12px;font-size:15px;font-weight:700;cursor:pointer}',
      '#qsPhoneGo{background:#f5a623;color:#231603}',
      '#qsPhoneGo:disabled{opacity:.55;cursor:wait}',
      '#qsPhoneBack{background:rgba(255,255,255,.1);color:#eef2f7}',
      '#qsPhoneErr{display:none;margin-top:12px;font-size:13px;color:#ffb4ab}',
      '#qsPhoneTimer{margin-top:10px;font-size:12px;color:#aeb8cc}',
      '#qsPhoneTimer button{background:none;border:0;color:#f5a623;font-size:12px;cursor:pointer;padding:0}',
      '#qsPhoneTimer button:disabled{color:#67708a;cursor:default}'
    ].join('\n');
    document.head.appendChild(st);
  }
  function close() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    if (S.verifier) { try { S.verifier.clear(); } catch (e) {} S.verifier = null; }
    if (S.modal && S.modal.parentNode) S.modal.parentNode.removeChild(S.modal);
    S.modal = null; S.confirm = null; S.busy = false;
  }
  function showStep(which) {
    var s1 = document.getElementById('qsPhoneStep1');
    var s2 = document.getElementById('qsPhoneStep2');
    if (s1) s1.style.display = which === 1 ? '' : 'none';
    if (s2) s2.style.display = which === 2 ? '' : 'none';
    var go = document.getElementById('qsPhoneGo');
    if (go) { go.textContent = which === 1 ? 'Send code' : 'Verify & sign in'; go.disabled = false; }
    setErr('');
  }
  function setErr(t) {
    var e = document.getElementById('qsPhoneErr');
    if (e) { e.textContent = t || ''; e.style.display = t ? 'block' : 'none'; }
  }
  function tick() {
    var left = Math.max(0, Math.ceil((S.resendAt - Date.now()) / 1000));
    var b = document.getElementById('qsPhoneResend');
    var s = document.getElementById('qsPhoneSecs');
    if (b) b.disabled = left > 0;
    if (s) s.textContent = left > 0 ? ' in ' + left + 's' : '';
    if (left <= 0 && S.timer) { clearInterval(S.timer); S.timer = null; }
  }
  function openModal() {
    css();
    close();
    var wrap = document.createElement('div');
    wrap.id = 'qsPhoneWrap';
    wrap.innerHTML =
      '<div id="qsPhoneBox" role="dialog" aria-modal="true" aria-labelledby="qsPhoneTitle">' +
      '<h3 id="qsPhoneTitle">Sign in with Phone</h3>' +
      '<p class="sub">We will text you a one-time code. Message rates may apply.</p>' +
      '<div id="qsPhoneStep1"><label for="qsPhoneNum">Mobile number with country code</label>' +
      '<input id="qsPhoneNum" type="tel" inputmode="tel" autocomplete="tel" maxlength="18" value="+91 " placeholder="+91 98765 43210"></div>' +
      '<div id="qsPhoneStep2" style="display:none"><label for="qsPhoneOtp">6-digit code from SMS</label>' +
      '<input id="qsPhoneOtp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="••••••">' +
      '<div id="qsPhoneTimer">Didn\'t get it?<button type="button" id="qsPhoneResend">Resend code</button><span id="qsPhoneSecs"></span></div></div>' +
      '<div id="qsRecaptcha"></div><div id="qsPhoneErr" role="alert"></div>' +
      '<div class="row"><button type="button" id="qsPhoneBack">Cancel</button><button type="button" id="qsPhoneGo">Send code</button></div></div>';
    document.body.appendChild(wrap);
    S.modal = wrap;
    document.getElementById('qsPhoneBack').addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape' && S.modal) { close(); document.removeEventListener('keydown', esc); }
    });
    document.getElementById('qsPhoneGo').addEventListener('click', onGo);
    document.getElementById('qsPhoneResend').addEventListener('click', onResend);
    showStep(1);
    var n = document.getElementById('qsPhoneNum');
    if (n) { n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch (e) {} }
  }
  function cleanPhone(raw) {
    return String(raw || '').replace(/[\s\-()]/g, '');
  }
  async function sendCode(phone) {
    var auth = window.firebase.auth();
    if (S.verifier) { try { S.verifier.clear(); } catch (e) {} }
    S.verifier = new window.firebase.auth.RecaptchaVerifier('qsRecaptcha', { size: 'invisible' });
    S.confirm = await auth.signInWithPhoneNumber(phone, S.verifier);
  }
  async function onGo() {
    if (S.busy) return;
    var step1 = document.getElementById('qsPhoneStep1').style.display !== 'none';
    var go = document.getElementById('qsPhoneGo');
    try {
      S.busy = true; if (go) go.disabled = true; setErr('');
      if (step1) {
        var phone = cleanPhone(document.getElementById('qsPhoneNum').value);
        if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw { code: 'auth/invalid-phone-number' };
        await sendCode(phone);
        showStep(2);
        S.resendAt = Date.now() + 60000;
        if (S.timer) clearInterval(S.timer);
        S.timer = setInterval(tick, 500); tick();
        var o = document.getElementById('qsPhoneOtp');
        if (o) o.focus();
      } else {
        var code = String(document.getElementById('qsPhoneOtp').value || '').replace(/\D/g, '');
        if (code.length < 4) throw { code: 'auth/invalid-verification-code' };
        if (!S.confirm) throw new Error('Session expired. Request a fresh code.');
        var cred = await S.confirm.confirm(code);
        var idToken = await cred.user.getIdToken();
        var api = window.PlatformAPI;
        if (!api || typeof api.phoneVerify !== 'function') throw new Error('Sign-in service unavailable. Reload and try again.');
        await api.phoneVerify(idToken);
        if (go) go.textContent = 'Signed in…';
        if (typeof window.toast === 'function') window.toast('Signed in. Opening your workspace…');
        setTimeout(function () { location.href = 'dashboard.html'; }, 650);
        return;
      }
    } catch (e) {
      var msg = friendly(e && e.code ? e : (e && e.message ? { message: String(e.message).slice(0, 160) } : null));
      // Backend failures surface as plain Errors from PlatformAPI; keep them generic.
      if (e && !e.code && e.message) msg = 'Phone verification failed. Try again or use another sign-in method.';
      setErr(msg); message(msg);
      if (go) { go.disabled = false; }
    } finally { S.busy = false; }
  }
  async function onResend() {
    if (S.busy || Date.now() < S.resendAt) return;
    var go = document.getElementById('qsPhoneGo');
    try {
      S.busy = true; setErr('');
      var phone = cleanPhone(document.getElementById('qsPhoneNum').value);
      await sendCode(phone);
      S.resendAt = Date.now() + 60000;
      if (S.timer) clearInterval(S.timer);
      S.timer = setInterval(tick, 500); tick();
    } catch (e) { setErr(friendly(e)); }
    finally { S.busy = false; if (go) go.disabled = false; }
  }
  async function start() {
    var btn = document.getElementById('btnPhone');
    try {
      if (!S.cfg) {
        var r = await fetch('/api/auth/phone/config', { headers: { Accept: 'application/json' } });
        S.cfg = await r.json();
      }
      if (!S.cfg || !S.cfg.enabled) {
        message('Phone sign-in needs administrator setup. It is not live yet.');
        return;
      }
      if (btn) btn.disabled = true;
      try { await ensureFirebase(S.cfg); }
      catch (e) { message('Could not load phone sign-in. Check your connection and try again.'); return; }
      openModal();
    } catch (e) { message('Unable to check phone sign-in. Email sign-in is unchanged.'); }
    finally { if (btn) btn.disabled = false; }
  }
  function bind() {
    var btn = document.getElementById('btnPhone');
    if (btn && !btn.dataset.qsBound) { btn.dataset.qsBound = '1'; btn.addEventListener('click', start); }
  }
  window.StudioPhone = { start: start };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

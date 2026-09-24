/* ==========================================================================
   Quotation Studio — Platform API client (Phase A + session bearer)
   --------------------------------------------------------------------------
   Talks to /api/* on the same origin (Cloudflare Worker or local-server).
   Safe no-op helpers when the API is unreachable so the offline studio still
   works on localStorage alone.
   ========================================================================== */
'use strict';

(function (root) {
  const BASE = ''; /* same-origin */

  /* Session token: memory + localStorage + sessionStorage.
     Preview iframes often block cookies; some also restrict sessionStorage.
     Memory always works for the tab lifetime; localStorage survives refresh
     on the same origin. Cookie auth still works when the browser accepts it. */
  const TOKEN_KEY = 'qs.sessionToken';
  let memoryToken = '';
  function readToken() {
    if (memoryToken) return memoryToken;
    try {
      const ls = localStorage.getItem(TOKEN_KEY);
      if (ls) { memoryToken = ls; return ls; }
    } catch (_) {}
    try {
      const ss = sessionStorage.getItem(TOKEN_KEY);
      if (ss) { memoryToken = ss; return ss; }
    } catch (_) {}
    return '';
  }
  function writeClientCookie(token) {
    try {
      /* Non-HttpOnly cookie the JS can set inside the preview frame.
         Secure+SameSite=None helps when the frame is HTTPS. */
      const secure = (typeof location !== 'undefined' && location.protocol === 'https:') ? '; Secure' : '';
      if (token) {
        document.cookie = 'qs_client=' + encodeURIComponent(token) +
          '; Path=/; SameSite=None' + secure + '; Max-Age=2592000';
      } else {
        document.cookie = 'qs_client=; Path=/; SameSite=None' + secure + '; Max-Age=0';
      }
    } catch (_) {}
  }
  function writeToken(token) {
    memoryToken = token ? String(token) : '';
    try {
      if (memoryToken) localStorage.setItem(TOKEN_KEY, memoryToken);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
    try {
      if (memoryToken) sessionStorage.setItem(TOKEN_KEY, memoryToken);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
    writeClientCookie(memoryToken);
  }
  function clearToken() { writeToken(''); }

  async function request(method, path, body) {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: {}
    };
    const token = readToken();
    if (token) {
      opts.headers['Authorization'] = 'Bearer ' + token;
      opts.headers['X-QS-Session'] = token;
    }
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(BASE + path, opts);
    } catch (err) {
      const e = new Error('Cannot reach the platform server. Is it running?');
      e.code = 'NETWORK';
      e.cause = err;
      throw e;
    }
    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); }
      catch (_) { data = { raw: text }; }
    }
    if (!res.ok) {
      /* Only drop a stored token when we actually sent it and the server
         rejected it — avoids wiping a good token on an unrelated 401. */
      if (res.status === 401 && token) clearToken();
      const e = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
      e.status = res.status;
      e.data = data;
      throw e;
    }
    if (data && data.token) writeToken(data.token);
    return data;
  }

  const api = {
    async health() {
      try { return await request('GET', '/api/health'); }
      catch (_) { return null; }
    },
    me() { return request('GET', '/api/auth/me'); },
    register(name, email, password, role, roleCustom) {
      const body = { name, email, password, role: role || 'sales' };
      if (role === 'custom' && roleCustom) body.roleCustom = roleCustom;
      return request('POST', '/api/auth/register', body);
    },
    login(email, password) {
      return request('POST', '/api/auth/login', { email, password });
    },
    async logout() {
      try { return await request('POST', '/api/auth/logout', {}); }
      finally { clearToken(); }
    },
    forgotPassword(email) {
      return request('POST', '/api/auth/forgot-password', { email });
    },
    resetPassword(email, code, password) {
      return request('POST', '/api/auth/reset-password', { email, code, password });
    },
    changePassword(currentPassword, newPassword) {
      return request('POST', '/api/auth/change-password', { currentPassword, newPassword });
    },
    updateProfile(payload) {
      return request('POST', '/api/auth/profile', payload || {});
    },
    summary() { return request('GET', '/api/dashboard/summary'); },
    listProposals() { return request('GET', '/api/proposals'); },
    getProposal(id) { return request('GET', '/api/proposals/' + encodeURIComponent(id)); },
    createProposal(payload) { return request('POST', '/api/proposals', payload); },
    updateProposal(id, payload) {
      return request('PUT', '/api/proposals/' + encodeURIComponent(id), payload);
    },
    deleteProposal(id) {
      return request('DELETE', '/api/proposals/' + encodeURIComponent(id));
    },
    duplicateProposal(id) {
      return request('POST', '/api/proposals/' + encodeURIComponent(id) + '/duplicate', {});
    },
    publishProposal(id, payload) {
      return request('POST', '/api/proposals/' + encodeURIComponent(id) + '/publish', payload || {});
    },
    listVersions(id) {
      return request('GET', '/api/proposals/' + encodeURIComponent(id) + '/versions');
    },
    listLinks(id) {
      return request('GET', '/api/proposals/' + encodeURIComponent(id) + '/links');
    },
    createLink(id, payload) {
      return request('POST', '/api/proposals/' + encodeURIComponent(id) + '/links', payload || {});
    },
    revokeLink(linkId) {
      return request('POST', '/api/links/' + encodeURIComponent(linkId) + '/revoke', {});
    },
    listEvents(id) {
      return request('GET', '/api/proposals/' + encodeURIComponent(id) + '/events');
    },
    sendPreview(id) {
      return request('GET', '/api/proposals/' + encodeURIComponent(id) + '/send-preview');
    },
    listSends(proposalId) {
      if (proposalId) {
        return request('GET', '/api/proposals/' + encodeURIComponent(proposalId) + '/sends');
      }
      return request('GET', '/api/sends');
    },
    createSend(proposalId, payload) {
      return request('POST', '/api/proposals/' + encodeURIComponent(proposalId) + '/sends', payload || {});
    },
    updateSendState(sendId, state, note) {
      return request('POST', '/api/sends/' + encodeURIComponent(sendId) + '/state', {
        state: state,
        note: note || undefined
      });
    },
    listNotifications(unreadOnly) {
      return request('GET', '/api/notifications' + (unreadOnly ? '?unread=1' : ''));
    },
    markNotificationRead(id) {
      return request('POST', '/api/notifications/' + encodeURIComponent(id) + '/read', {});
    },
    markAllNotificationsRead() {
      return request('POST', '/api/notifications/read-all', {});
    },
    listActivity() {
      return request('GET', '/api/activity');
    },
    listTasks(status) {
      return request('GET', '/api/tasks' + (status ? ('?status=' + encodeURIComponent(status)) : ''));
    },
    createTask(payload) {
      return request('POST', '/api/tasks', payload || {});
    },
    updateTask(id, payload) {
      return request('PUT', '/api/tasks/' + encodeURIComponent(id), payload || {});
    },
    deleteTask(id) {
      return request('DELETE', '/api/tasks/' + encodeURIComponent(id));
    },
    reportSummary() {
      return request('GET', '/api/reports/summary');
    },
    listTeam() {
      return request('GET', '/api/team/members');
    },
    setTeamRole(userId, role) {
      return request('POST', '/api/team/role', { userId, role });
    },
    /** Persist a session token returned by login/register/reset. */
    setSessionToken(token) {
      if (token) writeToken(token);
    },
    clearSession() { clearToken(); },
    /** Current session user or null (never throws for 401). */
    async currentUser() {
      try {
        const r = await this.me();
        return r && r.user ? r.user : null;
      } catch (err) {
        if (err && err.status === 401) return null;
        throw err;
      }
    },
    /** True when /api/health answers. */
    async isAvailable() {
      const h = await this.health();
      return !!(h && h.ok);
    }
  };

  root.PlatformAPI = api;
})(typeof self !== 'undefined' ? self : this);

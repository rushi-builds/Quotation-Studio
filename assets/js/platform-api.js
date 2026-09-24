/* ==========================================================================
   Quotation Studio — Platform API client (Phase A)
   --------------------------------------------------------------------------
   Talks to /api/* on the same origin (Cloudflare Worker or local-server).
   Safe no-op helpers when the API is unreachable so the offline studio still
   works on localStorage alone.
   ========================================================================== */
'use strict';

(function (root) {
  const BASE = ''; /* same-origin */

  async function request(method, path, body) {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: {}
    };
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
      const e = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data;
  }

  const api = {
    async health() {
      try { return await request('GET', '/api/health'); }
      catch (_) { return null; }
    },
    me() { return request('GET', '/api/auth/me'); },
    register(name, email, password) {
      return request('POST', '/api/auth/register', { name, email, password });
    },
    login(email, password) {
      return request('POST', '/api/auth/login', { email, password });
    },
    logout() { return request('POST', '/api/auth/logout', {}); },
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

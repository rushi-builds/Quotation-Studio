/* Studio Pulse production data adapter.
   Supplies the workspace state shape used by business-pulse.js from the REAL,
   permission-scoped Studio APIs (platform-api.js). No fixtures, no sample data,
   no demo identity. Collections below exist in shape only; Pulse renders honest
   empty/unavailable states until their Studio backend exists. */
'use strict';
(() => {
  const api = window.PlatformAPI;
  const E = window.BusinessEngine;
  const zero = v => (Array.isArray(v) ? v : []);
  const IST = { timeZone: 'Asia/Kolkata' };
  const dayOf = value => {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('en-CA', IST).format(d) : null;
  };
  const timeOf = value => {
    const d = new Date(value);
    return Number.isFinite(d.getTime())
      ? new Intl.DateTimeFormat('en-GB', { ...IST, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
      : null;
  };
  const today = new Intl.DateTimeFormat('en-CA', IST).format(new Date());

  /* Portal event vocabulary mirrors assets/js/dashboard.js EVENT_LABELS. */
  const EVENT_LABELS = {
    link_opened: 'Quotation link opened',
    survey_requested: 'Survey requested',
    version_published: 'Revision published',
    version_created: 'Revision created',
    consent_acknowledged: 'Customer consent acknowledged',
    status_changed: 'Quotation status updated',
    comment_posted: 'Portal comment posted',
    response_submitted: 'Customer response submitted'
  };

  async function create() {
    const [tasksRes, activityRes, proposalsRes, reportRes] = await Promise.allSettled([
      api.listTasks(), api.listActivity(), api.listProposals(), api.reportSummary()
    ]);
    const proposals = proposalsRes.status === 'fulfilled' ? zero(proposalsRes.value && proposalsRes.value.proposals) : [];
    const titleOf = {};
    proposals.forEach(p => { titleOf[p.id] = p.customer || p.title || 'Quotation'; });

    /* Real Studio tasks → engine follow-up rows. Studio tasks are not lead-CRM
       records, so leadId stays null; pulse-operations desks them as real
       overdue-task signals with the linked quotation title. */
    const tasks = zero(tasksRes.status === 'fulfilled' && tasksRes.value && tasksRes.value.tasks)
      .filter(t => t.status === 'open' || t.status === 'done')
      .map(t => ({
        id: 'studio-' + t.id,
        sourceTaskId: t.id,
        leadId: null,
        company: t.proposalId ? (titleOf[t.proposalId] || 'Linked quotation') : 'Studio task',
        title: t.title || 'Studio follow-up',
        type: 'Studio task',
        date: t.dueAt ? dayOf(t.dueAt) : today,
        time: t.dueAt ? (timeOf(t.dueAt) || '12:00') : '12:00',
        owner: 'Unassigned',
        status: t.status === 'done' ? 'done' : 'open',
        completedAt: t.completedAt || null
      }));

    /* Real activity → recent-events feed (texts, not fabricated counters). */
    const events = zero(activityRes.status === 'fulfilled' && activityRes.value && activityRes.value.events)
      .slice(0, 40)
      .map(e => ({
        id: 'event-' + e.id,
        leadId: null,
        date: e.createdAt ? dayOf(e.createdAt) : today,
        time: e.createdAt ? (timeOf(e.createdAt) || '00:00') : '00:00',
        text: (EVENT_LABELS[e.type] || e.type) + (e.proposalId && titleOf[e.proposalId] ? ' · ' + titleOf[e.proposalId] : ''),
        kind: 'Studio event'
      }));

    const report = reportRes.status === 'fulfilled' ? reportRes.value : null;

    /* Shape-compatible workspace. Missing-domain collections are EMPTY by
       definition (leads CRM, provider metrics, threads, calendar, rules) —
       Pulse renders its built-in unavailable/empty states for them. */
    const data = {
      today,
      range: E.period('6m', today),
      leads: [],
      daily: [],
      posts: [],
      acquisition: [],
      tasks,
      threads: [],
      events,
      calendar: [],
      rules: [],
      /* production extras (non-fixture): */
      report,
      writable: false,
      ownerName: 'Owner',
      persistence: 'none'
    };
    return data;
  }

  /* Real signed-in identity → governance access model. Roles mirror
     pulse-governance.roles; flags come from the server's publicUser payload —
     never from a dropdown or meta tag. */
  function mapUser(user) {
    if (!user || !user.id) return null;
    let role = 'Viewer';
    if (user.role === 'owner') role = 'Owner';
    else if (user.isAdmin || user.canManageTeam) role = 'Admin';
    else if (user.effectiveCanWrite || user.canWrite) role = 'Member';
    return {
      id: user.id,
      name: user.name || user.email || user.id,
      role,
      ownerName: user.roleLabel || user.role || user.name
    };
  }

  window.PulseData = Object.freeze({
    create,
    mapUser,
    eventLabels: EVENT_LABELS,
    writable: false
  });
})();

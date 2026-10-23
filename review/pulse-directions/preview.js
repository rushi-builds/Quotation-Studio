/* Isolated visual exploration. No APIs, storage, forms, identity or business data. */
'use strict';
(() => {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 18 5-5 4 3 4-7 5 9"/>',
    pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.2"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    chart: '<path d="M4 18V6m0 12h16M8 14l4-5 4 2 4-7"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    quote: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
    shield: '<path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7z"/><path d="m8 12 3 3 5-5"/>',
    inbox: '<path d="M4 4h16l2 13v3H2v-3zM2 15h6l2 3h4l2-3h6"/>',
    layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.layers}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
  const tabs = [['overview', 'Overview'], ['desk', 'Action desk'], ['leads', 'Leads & pipeline'], ['performance', 'Performance'], ['communications', 'Communications'], ['automations', 'Automations'], ['channels', 'Channel status']];
  const query = new URLSearchParams(location.search);
  let current = tabs.some(([id]) => id === query.get('view')) ? query.get('view') : 'overview';
  const look = document.documentElement.dataset.look;
  const channelNames = [['Gmail', 'gmail'], ['WhatsApp', 'whatsapp'], ['Instagram', 'instagram'], ['Outlook', 'outlook']];
  const logo = (name, file) => `<span class="channel-logo"><img src="/assets/js/pulse/brand-icons/${file}.svg" alt="${name}"></span>`;
  const manage = label => `<button class="text-button" data-preview-note>${label}${icon('arrow')}</button>`;
  const state = text => `<div class="state-line">${icon('shield')}<span>${text}</span></div>`;
  const segment = '<div class="segmented" role="group" aria-label="Chart layout grouping"><button data-group aria-pressed="true">Month</button><button data-group aria-pressed="false">Year</button></div>';
  function metrics(items) {
    return `<div class="snapshot">${items.map(([title, note]) => `<div class="metric"><div class="metric-label"><span></span>${title}</div><strong>—</strong><small>${note}</small></div>`).join('')}</div>`;
  }
  function history() {
    return `<div class="section-header"><div><h2>Business momentum</h2><p>Recorded activity over time. No invented history.</p></div>${segment}</div><div class="legend"><span><i></i>Quotations</span><span><i></i>Leads</span><span><i></i>Wins</span></div><div class="chart" role="img" aria-label="Empty chart placement: no history loaded"><div class="chart-center">${icon('chart')}<strong>A place for the bigger picture.</strong><small>History is not loaded in this design preview.</small></div></div><div class="chart-labels" aria-hidden="true"><span>Earlier</span><span>Recorded history</span><span>Latest</span></div><p class="chart-caption">Missing data is unavailable, not a measured zero. Quoted value is not revenue.</p>`;
  }
  function overview() {
    return `<div class="surface"><div class="surface-top"><span class="section-kicker">Your business, in focus</span><span class="dot-tag">Current snapshot · preview only</span></div>${metrics([['Quotations managed', 'All recorded statuses'], ['Quoted value', 'Recorded prices · <em>not revenue</em>'], ['Follow-ups overdue', 'Open tasks past their due date'], ['New leads', 'CRM source required']])}<div class="overview-grid"><section class="history">${history()}</section><section class="next-up"><div class="section-header"><h2>Your next moves</h2><button class="text-button" data-view="desk">Action desk ${icon('arrow')}</button></div>${[['clock', 'Follow-ups', 'Recorded due dates will appear here.'], ['quote', 'Quotation updates', 'Keep the next customer step in sight.'], ['users', 'Team ownership', 'See who owns the next action.']].map(([i, title, note]) => `<div class="queue-row"><span class="queue-icon">${icon(i)}</span><div><strong>${title}</strong><p>${note}</p></div><span>—</span></div>`).join('')}<p class="queue-foot">One prioritised queue, not another wall of cards.<br>No tasks or customer records loaded in this preview.</p></section></div><div class="lower-grid"><section class="recent"><div class="section-header"><h2>The latest from Studio</h2><span class="micro">Activity feed</span></div><div class="recent-line"><span class="timeline-line"><i></i></span><div><strong>One continuous customer story.</strong><p>Quotation activity and follow-ups, together.<br>Actual customer events will appear here once loaded.</p></div></div></section><section class="channels"><div class="section-header"><h2>Your channels</h2><span class="dot-tag">Not connected</span></div><div class="channel-strip">${channelNames.map(([name, file]) => logo(name, file)).join('')}</div><p>Business activity belongs in Pulse.<br>Account management stays in Settings.</p>${manage('Settings / Connections')}</section></div></div>`;
  }
  function filters(labels) { return `<div class="row-filters" role="group" aria-label="Preview view filters">${labels.map((text, i) => `<button data-filter aria-pressed="${i === 0}">${text}</button>`).join('')}</div>`; }
  function empty(name, title, description) { return `<div class="empty-section">${icon(name)}<h3>${title}</h3><p>${description}</p><span class="micro">No records loaded · design preview only</span></div>`; }
  function intro(kicker, title, description, action = '') {
    return `<header class="view-intro"><div><span class="eyebrow">${kicker}</span><h2>${title}</h2><p>${description}</p></div>${action}</header>`;
  }
  const views = {
    overview,
    desk: () => `<div class="surface">${intro('YOUR NEXT BEST ACTION', 'Make the next move count.', 'One clear queue for overdue follow-ups, missing ownership and the next customer step.')} ${filters(['All signals', 'Overdue', 'No owner', 'No next step', 'Stalled'])}<div class="table-head"><span>CUSTOMER / CONTEXT</span><span>NEXT ACTION</span><span>OWNER</span><span>DUE</span></div>${empty('clock', 'A calmer action desk.', 'Real tasks will sit in compact, separated rows here. No floating cards or made-up customer records.')}${state('Viewing a design, not a live queue. Nothing is completed, assigned or saved here.')}</div>`,
    leads: () => `<div class="surface">${intro('CUSTOMER CONTEXT', 'Every relationship, one view.', 'A simple pipeline and customer list, with the same quiet visual language.', '<button class="primary" disabled>+ Lead</button>')}${filters(['All leads', 'My leads', 'New enquiries', 'No next step'])}<div class="table-head"><span>CUSTOMER</span><span>STAGE / INTEREST</span><span>OWNER</span><span>RECORDED</span></div>${empty('users', 'Room for real relationships.', 'Lead persistence is not connected in this preview. No synthetic customer list is displayed.')}${state('No records are created. A visual change does not add a CRM backend.')}</div>`,
    performance: () => `<div class="surface">${intro('RESULTS, WITHOUT THE NOISE', 'See the trend. Keep the context.', 'A continuous reporting surface, instead of separate white boxes for every metric.')}${metrics([['Recorded quotations', 'Summary feed required'], ['Quoted value', 'Never labelled revenue'], ['Lead sources', 'Unavailable until connected'], ['Portal engagement', 'Native definitions retained']])}<section class="history" style="border-right:0">${history()}</section>${state('The graph is an empty layout placement, not a fabricated business trend.')}</div>`,
    communications: () => `<div class="surface">${intro('CONVERSATIONS WITH CONTEXT', 'The conversation, not the clutter.', 'One channel queue with clear ownership and customer context. No account management duplicated here.')}${filters(['All channels', 'WhatsApp', 'Gmail', 'Outlook'])}${empty('inbox', 'A clearer inbox starts here.', 'Connected business conversations will appear in this continuous list. No private messages are loaded or imported.')}${state('Mail and calendar permissions are separate. No messages or invitations can be sent here.')}</div>`,
    automations: () => `<div class="surface">${intro('AUTOMATION CONTROL ROOM', 'A thoughtful flow. Always in control.', 'Draft, review and inspect in one calm workspace. Human approval remains separate from provider readiness.', '<button class="primary" disabled>+ Rule</button>')}${filters(['Rules', 'Outbox', 'History'])}<div class="table-head"><span>RULE / PURPOSE</span><span>TRIGGER</span><span>STATUS</span><span>OWNER</span></div>${empty('layers', 'Less manual work. No blind automation.', 'This view demonstrates the layout only. No rules are active and no scheduled jobs are created.')}${state('All sending and mutation actions remain unavailable in this isolated preview.')}</div>`,
    channels: () => `<div class="surface">${intro('CHANNEL STATUS', 'Connected insights. One management home.', 'Pulse shows activity and status. Connections, sync and access settings stay in Settings / Connections.') }<div class="channel-list">${channelNames.map(([name, file]) => `<div class="channel-item">${logo(name, file)}<div><strong>${name}</strong><small>Business account · no account linked in this preview</small></div><span>Not connected</span></div>`).join('')}</div><div class="surface-top" style="border-top:1px solid var(--line);border-bottom:0"><span class="micro">No duplicated connection cards or setup forms.</span>${manage('Manage in Settings')}</div></div>`
  };
  function render(focus = false) {
    document.querySelector('.pulse-tabs').innerHTML = tabs.map(([id, name]) => `<button role="tab" id="tab-${id}" data-view="${id}" aria-selected="${current === id}" aria-controls="previewContent" tabindex="${current === id ? '0' : '-1'}">${name}</button>`).join('');
    const content = document.getElementById('previewContent');
    content.setAttribute('aria-labelledby', `tab-${current}`);
    content.innerHTML = views[current]();
    document.getElementById('lookIndicator').textContent = look === 'dark' ? '03 / PREMIUM DARK' : '01 / CLEAN WORKSPACE';
    document.querySelectorAll('[data-look-link]').forEach(link => {
      link.href = `?style=${link.dataset.lookLink}&view=${current}`;
      if (link.dataset.lookLink === look) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    window.history.replaceState(null, '', `${location.pathname}?style=${look}&view=${current}`);
    if (focus) document.getElementById(`tab-${current}`).focus();
  }
  function select(id, focus = false) {
    if (!Object.hasOwn(views, id)) return;
    current = id; render(focus);
  }
  // No storage or network. This toast explains non-live controls without fake success.
  let toastTimer;
  function note() {
    document.querySelector('.preview-toast')?.remove();
    const toast = document.createElement('div'); toast.className = 'preview-toast'; toast.role = 'status';
    toast.textContent = 'Preview only. Settings / Connections stays unchanged; no account is opened or connected.';
    document.body.appendChild(toast); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.remove(), 5000);
  }
  document.addEventListener('click', event => {
    const view = event.target.closest('[data-view]'); if (view) select(view.dataset.view);
    const filter = event.target.closest('[data-filter],[data-group]');
    if (filter) { filter.parentElement.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button === filter))); }
    if (event.target.closest('[data-preview-note]')) note();
  });
  document.querySelector('.pulse-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const index = tabs.findIndex(([id]) => id === current);
    select(tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length][0], true);
  });
  const dialog = document.getElementById('previewDialog');
  document.getElementById('previewInfo').addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('click', event => { if (event.target === dialog || event.target.closest('.dialog-close,.dialog-done')) dialog.close(); });
  render();
})();

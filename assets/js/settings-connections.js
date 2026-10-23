/* Settings → Connections. Presentation only: no OAuth, token storage, sends or
   provider API calls. The service catalogue is NOT a list of connected accounts.
   Live connection records, ACLs and sync controls require a server-side adapter. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const services = Object.freeze([
    { id: 'gmail', name: 'Gmail', category: 'Email', description: 'Business conversations, with the customer context close at hand.', purpose: 'Authorised business-mailbox history and replies, once an approved adapter is available.', requirement: 'Google OAuth, approved mailbox permissions and a secure server-side adapter. Password-recovery email delivery is separate from a Gmail inbox connection.' },
    { id: 'outlook', name: 'Outlook', category: 'Email', description: 'Your business mailbox, connected to the work that matters.', purpose: 'Authorised Microsoft business-mailbox conversations and folder updates.', requirement: 'Microsoft consent, appropriate account or tenant permissions, and a secure Graph adapter. Calendar access needs separate permission.' },
    { id: 'whatsapp', name: 'WhatsApp', category: 'Messaging', description: 'Business conversations and reported message status, together.', purpose: 'Eligible WhatsApp Business conversations and provider-reported delivery events.', requirement: 'Official Business Platform onboarding, eligible business number, signed webhooks and approved permissions. Personal inbox scraping and unrestricted chat-history import are not supported.' },
    { id: 'instagram', name: 'Instagram', category: 'Social', description: 'Professional account insights. A clearer picture of your reach.', purpose: 'Authorised professional-account insights, with native metric definitions preserved.', requirement: 'Eligible professional account, approved application access and the permissions required by the chosen official Instagram API. Available history depends on provider rules.' },
    { id: 'linkedin', name: 'LinkedIn', category: 'Social', description: 'Company-page performance, without losing the source of a metric.', purpose: 'Authorised company-page and post analytics; not unrestricted member messaging.', requirement: 'Eligible application access, company-page authorisation and current reporting permissions. Personal inbox import is not part of this integration.' },
    { id: 'website', name: 'Website', category: 'Analytics', description: 'Visits, sources and enquiry events. No invented attribution.', purpose: 'Approved website analytics, source / medium and configured enquiry events.', requirement: 'An authorised analytics property, consent-aware tracking and explicitly configured events. A contact click is not a verified conversation or a sale.' },
    { id: 'google-calendar', name: 'Google Calendar', category: 'Calendars', description: 'Keep site visits and meetings in view, alongside your follow-ups.', purpose: 'Selected calendar events, with timezone and recurrence context.', requirement: 'Google Calendar consent and a selected calendar. Studio tasks do not become calendar invitations; event creation requires separate write approval.' },
    { id: 'outlook-calendar', name: 'Outlook Calendar', category: 'Calendars', description: 'A shared view of the day, with the right calendar permissions.', purpose: 'Authorised Microsoft calendar events and meeting context.', requirement: 'Microsoft calendar consent, calendar selection and a server-side sync adapter. No meeting invitations are sent by this interface.' }
  ].map(service => Object.freeze(service)));
  const categories = ['All services', 'Email', 'Messaging', 'Social', 'Calendars', 'Analytics'];
  let category = 'All services';
  let query = '';
  let returnFocus = null;

  function open() { window.QSDash?.showSettings('connections', true); }
  function badge(name) { return window.PulseBrand.badge(name, 'card'); }
  function icon(name) { return window.PulseBrand.symbol(name); }
  function card(service) {
    return `<article class="sc-service" data-service="${service.id}">
      <div class="sc-service-head"><span class="sc-logo">${badge(service.name)}</span><span class="sc-category">${service.category}</span></div>
      <h3>${service.name}</h3><p class="sc-description">${service.description}</p>
      <span class="sc-status"><i aria-hidden="true"></i>Not connected</span>
      <div class="sc-service-actions"><button type="button" class="sc-details" data-connection-details="${service.id}" aria-label="View ${service.name} connection details">View details ${icon('arrow')}</button><button type="button" class="sc-connect" disabled aria-label="${service.name} connection unavailable: secure adapter required" title="Account linking requires a secure provider adapter">Connect ${icon('plus')}</button></div>
    </article>`;
  }
  function renderCards() {
    const visible = services.filter(service => (category === 'All services' || category === service.category) &&
      `${service.name} ${service.category} ${service.description}`.toLowerCase().includes(query.trim().toLowerCase()));
    $('connectionsCount').textContent = `${visible.length} ${visible.length === 1 ? 'service' : 'services'}`;
    $('connectionsGrid').innerHTML = visible.map(card).join('') + (visible.length ? '' :
      '<div class="sc-no-results"><span aria-hidden="true">⌕</span><h3>No matching services</h3><p>Try another name or category.</p><button type="button" class="btn btn-secondary btn-sm" data-connections-reset>Clear filters</button></div>');
    $('connectionsAdd').hidden = category !== 'All services' || Boolean(query.trim());
  }
  function mount() {
    const root = $('connectionsContent');
    if (!root) return;
    root.innerHTML = `
      <div class="sc-overview"><div class="sc-overview-icon">${icon('layers')}</div><div><h3>One home for your business tools.</h3><p>Manage accounts, sync and access here. Studio Pulse is where their business activity will come together.</p></div><span class="sc-overview-note">SET UP HERE<br><strong>Work in Pulse</strong></span></div>
      <div class="sc-availability" role="note">${icon('shield')}<p><strong>No external accounts are connected through this hub.</strong> Account linking and sync are not enabled yet. Explore the services below; no credentials are requested and no messages are sent.</p></div>
      <div class="sc-toolbar"><label class="sc-search">${icon('globe')}<span class="sc-sr-only">Search connection services</span><input type="search" id="connectionsSearch" placeholder="Find a service…" autocomplete="off" maxlength="100"></label><span id="connectionsCount" role="status" aria-live="polite" aria-atomic="true"></span></div>
      <div class="sc-filters" role="group" aria-label="Service category">${categories.map(name => `<button type="button" data-connection-category="${name}" aria-pressed="${name === category}">${name}</button>`).join('')}</div>
      <div class="sc-grid" id="connectionsGrid"></div>
      <div class="sc-add-row" id="connectionsAdd"><div><strong>More than one account? There’s room.</strong><p>Additional services and accounts will be managed here when account linking is enabled.</p></div><button type="button" class="btn btn-secondary" disabled title="Additional accounts require the connection backend">${icon('plus')} Add account</button></div>
      <details class="sc-access"><summary>${icon('shield')} Access, privacy & control <span aria-hidden="true">+</span></summary><div class="sc-access-body"><p>These are the requirements for future connections, not permissions already granted by this screen.</p><div class="sc-access-grid"><div><strong>Company-owned tools</strong><p>Only explicitly authorised team members should access a company connection.</p></div><div><strong>Individual business accounts</strong><p>Access stays with the assigned user and explicitly authorised colleagues. Personal chats stay outside Studio.</p></div><div><strong>Separate permissions</strong><p>Viewing, configuring and sending need separate server-enforced permissions. A display title does not grant access.</p></div><div><strong>A clear handover</strong><p>Disconnect, revocation, account handover and changes need a backend audit trail before connections are enabled.</p></div></div></div></details>
      <p class="sc-footnote">Profile social links and system services such as password-recovery email are separate. They do not grant mailbox access or enable channel sync.</p>`;
    const dialog = document.createElement('dialog');
    dialog.id = 'connectionDetails';
    dialog.className = 'sc-dialog';
    dialog.setAttribute('aria-labelledby', 'connectionDetailTitle');
    dialog.setAttribute('aria-describedby', 'connectionDetailDescription');
    document.body.appendChild(dialog);
    root.addEventListener('input', event => {
      if (event.target.id === 'connectionsSearch') { query = event.target.value; renderCards(); }
    });
    root.addEventListener('click', event => {
      const filter = event.target.closest('[data-connection-category]');
      if (filter) {
        category = filter.dataset.connectionCategory;
        root.querySelectorAll('[data-connection-category]').forEach(button => button.setAttribute('aria-pressed', String(button === filter)));
        renderCards();
      }
      if (event.target.closest('[data-connections-reset]')) {
        category = 'All services'; query = ''; $('connectionsSearch').value = '';
        root.querySelectorAll('[data-connection-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.connectionCategory === category)));
        renderCards(); $('connectionsSearch').focus();
      }
      const detail = event.target.closest('[data-connection-details]');
      if (detail) showDetails(detail.dataset.connectionDetails, detail);
    });
    dialog.addEventListener('click', event => {
      if (event.target.closest('[data-close-connection]') || event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
    renderCards();
  }
  function showDetails(id, trigger) {
    const service = services.find(item => item.id === id);
    if (!service) return;
    const dialog = $('connectionDetails');
    returnFocus = trigger;
    dialog.innerHTML = `<div class="sc-dialog-head"><span class="sc-logo">${badge(service.name)}</span><button type="button" class="sc-close" data-close-connection aria-label="Close connection details" autofocus>${icon('close')}</button></div>
      <span class="sc-category">${service.category}</span><h2 id="connectionDetailTitle">${service.name}</h2><p id="connectionDetailDescription">${service.purpose}</p>
      <dl class="sc-detail-status"><div><dt>Account</dt><dd>Not connected</dd></div><div><dt>Last successful sync</dt><dd>Not available</dd></div><div><dt>Account access</dt><dd>No access granted here</dd></div></dl>
      <section class="sc-requirement"><h3>Before connecting</h3><p>${service.requirement}</p></section>
      <div class="sc-dialog-note">${icon('shield')}<p>Account linking is not enabled. This is service information, not an authorisation flow. No account, sync job or access permission is created.</p></div>
      <div class="sc-dialog-actions"><button type="button" class="btn btn-secondary" data-close-connection>Done</button><button type="button" class="btn btn-primary" disabled>Connection unavailable</button></div>`;
    dialog.showModal();
  }
  function statusMarkup() {
    return `<section class="sc-pulse-status"><div class="sc-status-logos" aria-hidden="true">${['Gmail', 'WhatsApp', 'Instagram', 'Outlook'].map(badge).join('')}</div><span class="eyebrow">CHANNEL STATUS</span><h2>Your tools connect here.<br>Your work comes together in Pulse.</h2><p>No external account is connected through the Connections hub. Provider sync is not enabled; unavailable channel data is not a measured zero.</p><button type="button" class="btn btn-primary" data-open-connections>Manage in Settings ${icon('arrow')}</button><small>Settings → Connections · one place for accounts, sync and access</small></section>`;
  }
  document.addEventListener('click', event => {
    if (event.target.closest('[data-open-connections]')) { event.preventDefault(); open(); }
  });
  window.StudioConnections = Object.freeze({ open, statusMarkup });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();

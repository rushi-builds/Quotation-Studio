/* Local brand assets + small consistent UI symbols. No network or state changes. */
'use strict';
(() => {
  const brands = Object.freeze({
    Instagram: ['instagram', '#c13584'], LinkedIn: ['linkedin', '#0a66c2'],
    WhatsApp: ['whatsapp', '#168a50'], Gmail: ['gmail', '#c74236'],
    Outlook: ['outlook', '#0078d4'], 'Google Calendar': ['google_calendar', '#4285f4'],
    'Outlook Calendar': ['outlook', '#0078d4'], Website: ['website', '#247e78']
  });
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    shield: '<path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7z"/><path d="m8 12 3 3 5-5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    edit: '<path d="m4 16 12-12 4 4L8 20H4zM13 7l4 4"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    chat: '<path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0zM7 9h9M7 13h6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>'
  };
  const actions = {
    'new-lead': 'plus', 'new-task': 'plus', 'new-event': 'plus', 'new-rule': 'plus', compose: 'chat',
    'lead-export': 'download', 'report-export': 'download', 'desk-export': 'download', 'audit-export': 'download', backup: 'download',
    connection: 'settings', rule: 'settings', 'quiet-hours': 'clock', simulate: 'play', 'run-internal': 'play',
    'open-desk': 'arrow', 'edit-record': 'edit', permission: 'shield', 'pause-customer': 'pause',
    'optout-customer': 'shield', 'job-cancel': 'close', 'job-approve': 'check', 'job-detail': 'arrow'
  };
  function symbol(name) {
    if (!paths[name]) return '';
    return '<svg class="pulse-ui-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths[name] + '</svg>';
  }
  function badge(name, size = '') {
    const brand = brands[name]; if (!brand) return '';
    return '<span class="pulse-provider-mark ' + (['mini','selector','card'].includes(size) ? 'pulse-mark-'+size : '') + '"><img src="concept-preview/brand-icons/' + brand[0] + '.svg" width="32" height="32" alt="" aria-hidden="true" decoding="async"></span>';
  }
  function action(name) { return symbol(actions[name]); }
  function buttonLabel(name, label) { const icon = action(name); return icon + '<span>' + (icon ? label.replace(/^\+\s*/, '').replace(actions[name]==='arrow'?/\s*→$/:/$^/,'') : label) + '</span>'; }
  window.PulseBrand = Object.freeze({ badge, action, symbol, buttonLabel, known: name => Object.hasOwn(brands, name), color: name => brands[name]?.[1] || '#247e78' });
})();

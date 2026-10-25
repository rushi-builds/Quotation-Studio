/* Excel-first catalogue controller. Metadata checks never run a data sync.
   All API calls use the existing session + Vercel-preview safety boundary. */
'use strict';
(function (root) {
  const $ = id => document.getElementById(id);
  const labels = { 'up-to-date': 'System up to date', outdated: 'Excel updated · Sync now',
    'not-synced': 'Sync needed', unknown: 'Not verified', checking: 'Checking…', syncing: 'Syncing…', error: 'Retry sync' };
  let started = false, checking = false, busy = false, canSync = false, current = null, timer = null, workbookReturnPending = false;
  function display(state, message, compact) {
    const label = compact || labels[state] || labels.unknown;
    $('catalogueStatusLink').dataset.state = state;
    $('catalogueStatusLink').setAttribute('aria-label', 'Excel workbook. ' + label + '. Open catalogue sync');
    $('catalogueStatusLink').title = message;
    $('catalogueHeaderStatus').textContent = label;
    $('catalogueSyncStatus').textContent = label;
    $('catalogueSyncStatus').dataset.state = state;
    $('catalogueSyncStatus').title = [message, $('catalogueLastSync').textContent].filter(Boolean).join('\n');
  }
  function date(value) {
    const stamp = new Date(value);
    return value && !isNaN(stamp) ? stamp.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  }
  function controls() {
    $('syncCatalogueBtn').disabled = busy || checking || !canSync;
    $('syncCatalogueBtn').textContent = busy ? 'Syncing…' : 'Sync';
    const link = $('openCatalogueExcel'), url = current && current.workbookUrl;
    const valid = !busy && typeof url === 'string' && /^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view$/.test(url);
    if (valid) link.href = url; else link.removeAttribute('href');
    link.setAttribute('aria-disabled', String(!valid));
    link.tabIndex = valid ? 0 : -1;
  }
  function navigate() {
    // Navigation only: never sync, enable an option, or edit quotation values.
    const panel = $('excelCataloguePanel');
    for (let node = panel; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true;
    panel.scrollIntoView({ behavior: 'auto', block: 'start' });
    $('eqCatalog').focus({ preventScroll: true });
  }
  function api() {
    if (!root.PlatformAPI || !root.PlatformAPI.catalogueStatus) throw new Error('Catalogue connection is unavailable.');
    return root.PlatformAPI;
  }
  async function refresh(fresh = false) {
    if (!started || checking || busy) return;
    checking = true;
    let verifiedMetadata = false;
    display('checking', 'Checking the connected workbook…'); controls();
    try {
      const needsFresh = fresh === true || workbookReturnPending;
      const data = await api().catalogueStatus(needsFresh);
      if (!data || !data.ok || !['up-to-date','outdated','not-synced','unknown'].includes(data.status)) throw new Error('Catalogue status is unavailable.');
      verifiedMetadata = true;
      if (needsFresh) workbookReturnPending = false;
      current = data; canSync = data.canSync === true;
      $('catalogueWorkbook').textContent = data.fileName || 'Excel workbook';
      $('catalogueWorkbook').hidden = false;
      const local = root.EquipmentStore.cloudInfo();
      // Another owner/browser may have synced the shared catalogue. Download
      // only that saved JSON copy; this GET does not fetch/sync the workbook.
      const kinds = ['modules','inverters','cables'];
      const countsMatch = kinds.every(kind => local[kind] > 0 && local[kind] === Number(data.counts && data.counts[kind]));
      if (data.sha && data.syncedAt && (local.sha !== data.sha || !countsMatch || local.persisted === false)) {
        const saved = await api().equipmentCatalogue();
        if (!saved || !saved.ok || !saved.catalogue || saved.catalogue.sha !== data.sha) throw new Error('The catalogue changed during this check. Check again shortly.');
        if (!kinds.every(kind => Array.isArray(saved.catalogue[kind]) && saved.catalogue[kind].length === Number(data.counts && data.counts[kind]))) {
          throw new Error('The saved catalogue is incomplete. The previous browser copy has been kept.');
        }
        root.EquipmentStore.importCloud(saved.catalogue);
      }
      const info = root.EquipmentStore.cloudInfo();
      const count = data.counts || {};
      const parts = [];
      if (data.syncedAt) parts.push('Last synced ' + date(data.syncedAt));
      if (data.checkedAt) parts.push('Checked ' + date(data.checkedAt));
      if (data.syncedAt) parts.push((Number(count.modules) || 0) + ' modules · ' + (Number(count.inverters) || 0) + ' inverters · ' + (Number(count.cables) || 0) + ' cables');
      $('catalogueLastSync').textContent = parts.join(' · ');
      if (info.persisted === false) {
        display('unknown', 'Catalogue loaded for this tab, but browser storage is unavailable. Your saved quotations have not been changed.', 'Storage unavailable');
      } else if (data.status === 'up-to-date' && (!data.sha || info.sha !== data.sha)) {
        display('unknown', 'The catalogue could not be verified in this browser. Sync or check again.');
      } else {
        const messages = {
          'up-to-date': 'Catalogue up to date with the connected Excel workbook at the last check.',
          outdated: 'The workbook has changed since the last catalogue sync. Save your Excel changes, then sync here.',
          'not-synced': 'Sync once to load the connected Excel catalogue. The last saved or bundled catalogue is being used until then.',
          unknown: data.reason || 'Workbook changes could not be verified. The last saved catalogue is still available.'
        };
        display(data.status, messages[data.status] + (!canSync ? ' Ask the workspace owner to sync when needed.' : ''));
      }
    } catch (error) {
      if (!verifiedMetadata) current = null;
      const code = error && error.code;
      let compact = 'Not verified';
      let message = verifiedMetadata
        ? 'The saved catalogue could not be loaded or verified. Your previous browser copy is still available. Sync the catalogue to refresh it.'
        : 'Workbook status could not be checked. The last saved catalogue is still available. Checks retry when you return to this tab.';
      if (code === 'PREVIEW_BACKEND_DISABLED') { canSync = false; compact = 'Not verified'; message = 'Workbook status cannot be verified here. Open the connected workspace to check it.'; }
      else if (error && error.status === 401) { canSync = false; compact = 'Sign in'; message = 'Sign in to check your connected Excel workbook.'; }
      else if (code === 'NOT_CONFIGURED') { canSync = false; compact = 'Not connected'; message = 'The Excel catalogue connection is not configured. Ask the workspace owner to connect the workbook.'; }
      display('unknown', message, compact);
      if (!verifiedMetadata) $('catalogueWorkbook').hidden = true;
    } finally { checking = false; controls(); }
  }
  async function sync() {
    if (busy || checking || !canSync) return;
    busy = true; display('syncing', 'Syncing the connected Excel catalogue. Saved quotation values will not be changed.'); controls();
    let success = false;
    try {
      const result = await api().syncEquipmentCatalogue();
      if (!result || !result.ok || !result.catalogue) throw new Error('The catalogue was not returned.');
      root.EquipmentStore.importCloud(result.catalogue);
      success = true;
    } catch (error) {
      if (error && (error.status === 401 || error.status === 403)) canSync = false;
      display('error', error && error.status === 403 ? 'Only the workspace owner or an elevated admin can sync the catalogue.' :
        'Sync could not be confirmed. Your last browser catalogue is still available. Save the workbook, check the connection and retry.');
    } finally { busy = false; controls(); }
    if (success) await refresh();
  }
  function init() {
    if (started || !$('excelCataloguePanel')) return;
    started = true;
    const old = root.EquipmentStore.legacyInfo();
    if (old.count) {
      // Keep archive details available for diagnostics without panel clutter.
      $('catalogueLegacyNotice').textContent = old.count + ' legacy browser ' + (old.count === 1 ? 'entry is' : 'entries are') + ' preserved, but no longer override the Excel catalogue. Saved quotation values are unchanged.';
    }
    $('catalogueStatusLink').addEventListener('click', navigate);
    $('syncCatalogueBtn').addEventListener('click', sync);
    $('openCatalogueExcel').addEventListener('click', event => {
      if (event.currentTarget.getAttribute('aria-disabled') === 'true') { event.preventDefault(); return; }
      workbookReturnPending = true;
      display('unknown', 'Save your updates in Excel, then return here to sync. Workbook status is checked when this tab regains focus.');
    });
    root.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    timer = root.setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    root.addEventListener('pagehide', () => { root.clearInterval(timer); timer = null; });
    root.addEventListener('pageshow', () => { if (!timer) { timer = root.setInterval(() => { if (!document.hidden) refresh(); }, 60000); refresh(); } });
    refresh();
  }
  root.ExcelCatalogue = { refresh, navigate, sync };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof self !== 'undefined' ? self : this);

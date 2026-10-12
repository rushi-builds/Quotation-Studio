/* ==========================================================================
   Quotation Studio - Site estimates with source tracking (pure, no DOM)
   --------------------------------------------------------------------------
   Every automatically derived site value carries its source, its date and
   a status. Nothing is shown as VERIFIED unless a site measurement or
   verified record says so.

   Status values
     VERIFIED   confirmed by a site survey / measured record
     ESTIMATE   derived from a named dataset plus a stated assumption
     STALE      source older than the allowed age; must be refreshed
     MISSING    no usable input; the value is not invented

   Generation estimate (specific yield, first-year, before degradation)
     E_kWh/kWp/yr = H_annual × PR
     H_annual     = GHI (kWh/m²/day, daily mean) × 365
     PR           performance ratio, an explicit assumption (default 0.75)
   ========================================================================== */
(function (root) {
  'use strict';

  const DAYS_IN_YEAR = 365;
  const PR_MIN = 0.5;
  const PR_MAX = 0.9;
  const DEFAULT_PR = 0.75;
  const DEFAULT_MAX_AGE_DAYS = 365;

  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  const DAY_MS = 86400000;

  /* Attach source metadata to a value and compute its status. */
  function sourced(value, meta, now) {
    const v = num(value);
    if (!Number.isFinite(v)) {
      return { value: null, unit: meta?.unit || '', source: meta?.source || '', asOf: meta?.asOf || '', status: 'MISSING' };
    }
    let status = meta?.status || 'ESTIMATE';
    const maxAge = Number.isFinite(num(meta?.maxAgeDays)) ? num(meta.maxAgeDays) : DEFAULT_MAX_AGE_DAYS;
    const asOf = meta?.asOf ? Date.parse(meta.asOf) : NaN;
    const reference = Number.isFinite(num(now)) ? num(now) : Date.now();
    if (status !== 'VERIFIED' && Number.isFinite(asOf) && (reference - asOf) / DAY_MS > maxAge) {
      status = 'STALE';
    }
    return { value: v, unit: meta?.unit || '', source: meta?.source || '', asOf: meta?.asOf || '', status };
  }

  /* Specific yield from a GHI daily mean and a performance ratio. */
  function generationEstimate(input) {
    const ghi = num(input?.ghiKwhPerM2Day);
    const pr = Number.isFinite(num(input?.pr)) ? num(input.pr) : DEFAULT_PR;
    if (!Number.isFinite(ghi) || ghi <= 0) return null;
    if (!Number.isFinite(pr) || pr < PR_MIN || pr > PR_MAX) return null;
    const hAnnual = ghi * DAYS_IN_YEAR;
    return {
      kwhPerKwpYear: hAnnual * pr,
      hAnnualKwhPerM2: hAnnual,
      pr,
      // Always an estimate: the PR is an assumption, never a measured yield.
      status: 'ESTIMATE',
      assumption: 'PR ' + pr.toFixed(2) + ' (performance ratio assumption)'
    };
  }

  const api = { sourced, generationEstimate, DEFAULT_PR, PR_MIN, PR_MAX, DAYS_IN_YEAR };
  root.SiteEstimate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);

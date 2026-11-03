/* One inbox for the two kinds of feedback the studio collects.
 *
 * Projects: a visitor on the public gallery leaves a note about a project (or
 * the page itself). Stored in gallery_feedback, no account needed.
 * Quotations: a customer who opened a shared proposal leaves a rating and a
 * comment. Stored as a portal_events row with event_type 'proposal_feedback'.
 *
 * Both land in the same list so the workspace has one place to read them, one
 * average rating and one "handled" marker. This module is pure: the Worker and
 * the local server hand it rows and it returns items plus statistics, so the
 * two backends cannot drift apart and the maths is unit-testable.
 *
 * Nothing here invents data: a note without a rating is counted separately
 * from a 1-star note, and an unknown project id is shown by its id rather than
 * silently dropped.
 */
'use strict';

export const HANDLED_TABLE = 'feedback_state';

/* Item ids are prefixed so one PATCH route can address either source without a
   second table: "project:gfb_123" / "quotation:fb_ab12". */
export function itemKey(source, id) {
  return String(source) + ':' + String(id);
}
export function parseKey(key) {
  const text = String(key || '');
  const at = text.indexOf(':');
  if (at < 1) return null;
  const source = text.slice(0, at);
  const id = text.slice(at + 1);
  if ((source !== 'project' && source !== 'quotation') || !id) return null;
  return { source, id };
}

function text(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function when(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : 0;
}

function meta(row) {
  try {
    const parsed = JSON.parse(row && row.meta_json ? row.meta_json : '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function ratingOf(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/* A project note. `projects` is the generated catalogue (id -> project), which
   is what turns a stored slug back into the name staff recognise. */
export function projectItem(row, projects, handled) {
  const id = String((row && row.id) || '');
  if (!id) return null;
  const projectId = String(row.project_id || '');
  const project = (projects && projects[projectId]) || null;
  return {
    id: itemKey('project', id),
    source: 'project',
    sourceLabel: 'Project',
    rawId: id,
    rating: ratingOf(row.rating),
    message: text(row.message, 1200),
    name: text(row.name, 60),
    createdAt: row.created_at || '',
    handledAt: handled || null,
    project: {
      id: projectId || null,
      name: project ? project.name : projectId || 'Gallery page',
      capacity: project ? project.capacity : '',
      sector: project ? project.sector : '',
      image: project ? project.img || '' : ''
    },
    proposal: null,
    nextStep: '',
    contactRequested: false
  };
}

/* A customer's note on a shared quotation. */
export function quotationItem(row, handled) {
  const id = String((row && row.id) || '');
  if (!id) return null;
  const m = meta(row);
  return {
    id: itemKey('quotation', id),
    source: 'quotation',
    sourceLabel: 'Quotation',
    rawId: id,
    rating: ratingOf(m.rating),
    message: text(m.comment, 1600),
    name: text(m.customerName || row.customer_name, 120),
    createdAt: row.created_at || '',
    handledAt: handled || null,
    project: null,
    proposal: {
      id: row.proposal_id || m.proposalId || '',
      ref: text(row.ref || m.proposalRef, 120),
      title: text(row.title, 160),
      customer: text(row.customer_name || m.customerName, 120),
      version: text(m.versionLabel, 60)
    },
    nextStep: text(m.nextStep, 40),
    contactRequested: m.contactRequested === true
  };
}

function mean(sum, count) {
  return count ? Math.round((sum / count) * 10) / 10 : null;
}

/* Build the unified inbox.
   rows.projectFeedback  gallery_feedback rows
   rows.proposalFeedback portal_events rows joined to proposals (type feedback)
   rows.likes            { project_id, created_at } for every saved like
   rows.state            { source, item_id, handled_at }
   rows.projects         catalogue map id -> { name, capacity, sector, img }
   rows.now              ms clock, injectable for tests */
export function buildInbox(rows = {}) {
  const projects = rows.projects || {};
  const handledMap = new Map();
  (rows.state || []).forEach((s) => {
    if (!s || !s.source || !s.item_id) return;
    if (s.handled_at) handledMap.set(itemKey(s.source, s.item_id), s.handled_at);
  });

  const items = []
    .concat((rows.projectFeedback || []).map((r) => projectItem(r, projects, handledMap.get(itemKey('project', r && r.id)))))
    .concat((rows.proposalFeedback || []).map((r) => quotationItem(r, handledMap.get(itemKey('quotation', r && r.id)))))
    .filter(Boolean)
    .sort((a, b) => when(b.createdAt) - when(a.createdAt));

  const now = Number.isFinite(rows.now) ? rows.now : Date.now();
  const day = 86400000;
  const buckets = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const sourceStats = {
    project: { count: 0, rated: 0, ratingSum: 0, avg: null },
    quotation: { count: 0, rated: 0, ratingSum: 0, avg: null }
  };
  let rated = 0;
  let ratingSum = 0;
  let fresh = 0;
  let handled = 0;
  let week = 0;
  let today = 0;
  let contactRequested = 0;

  items.forEach((item) => {
    const bucket = sourceStats[item.source];
    if (!bucket) return;
    bucket.count += 1;
    if (item.rating) {
      bucket.rated += 1;
      bucket.ratingSum += item.rating;
      buckets[item.rating] += 1;
      rated += 1;
      ratingSum += item.rating;
    }
    const at = when(item.createdAt);
    if (at && now - at <= 7 * day) week += 1;
    if (at && now - at <= day) today += 1;
    if (item.contactRequested) contactRequested += 1;
    if (item.handledAt) handled += 1;
    else fresh += 1;
  });
  sourceStats.project.avg = mean(sourceStats.project.ratingSum, sourceStats.project.rated);
  sourceStats.quotation.avg = mean(sourceStats.quotation.ratingSum, sourceStats.quotation.rated);

  return {
    items,
    stats: {
      total: items.length,
      fresh,
      handled,
      rated,
      avgRating: mean(ratingSum, rated),
      buckets,
      week,
      today,
      contactRequested,
      sources: sourceStats,
      likes: likeStats(rows.likes, projects, now)
    }
  };
}

/* Likes: a leaderboard the studio can act on ("which project do visitors
   actually like?"). Counted from gallery_likes rows, never estimated. */
export function likeStats(rows, projects = {}, now = Date.now()) {
  const day = 86400000;
  const byProject = new Map();
  let week = 0;
  let today = 0;
  (rows || []).forEach((row) => {
    const id = String((row && row.project_id) || '');
    if (!id) return;
    byProject.set(id, (byProject.get(id) || 0) + 1);
    const at = when(row.created_at);
    if (at && now - at <= 7 * day) week += 1;
    if (at && now - at <= day) today += 1;
  });
  const total = (rows || []).length;
  const top = [...byProject.entries()]
    .map(([id, count]) => ({
      id,
      name: (projects[id] && projects[id].name) || id,
      capacity: (projects[id] && projects[id].capacity) || '',
      image: (projects[id] && projects[id].img) || '',
      count,
      share: total ? Math.round((count / total) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);
  return { total, week, today, projects: byProject.size, top };
}

/* Server-side filtering keeps the response small on a phone. Stats are always
   computed from the whole inbox - a filter changes what you read, never what
   the numbers say. */
export function filterItems(items, opts = {}) {
  const source = String(opts.source || 'all');
  const status = String(opts.status || 'all');
  const rating = Number(opts.rating) || 0;
  const q = String(opts.q || '').trim().toLowerCase();
  const proposal = String(opts.proposal || '');
  const project = String(opts.project || '');
  return (items || []).filter((item) => {
    if (source !== 'all' && item.source !== source) return false;
    if (status === 'new' && item.handledAt) return false;
    if (status === 'handled' && !item.handledAt) return false;
    if (rating && item.rating !== rating) return false;
    if (proposal && (!item.proposal || item.proposal.id !== proposal)) return false;
    if (project && (!item.project || item.project.id !== project)) return false;
    if (q) {
      const haystack = [
        item.message,
        item.name,
        item.project && item.project.name,
        item.proposal && item.proposal.ref,
        item.proposal && item.proposal.customer,
        item.proposal && item.proposal.title
      ].filter(Boolean).join(' ').toLowerCase();
      if (haystack.indexOf(q) === -1) return false;
    }
    return true;
  });
}

/* CSV for the studio's own records. Quoted properly so a note containing a
   comma or a quote survives the round trip. */
export function inboxCsv(items) {
  const cell = (value) => {
    const raw = value == null ? '' : String(value);
    return /[",\n\r]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw;
  };
  const head = ['Source', 'Rating', 'Name', 'Subject', 'Message', 'Received', 'Handled', 'Next step', 'Contact requested'];
  const lines = [head.join(',')];
  (items || []).forEach((item) => {
    const subject = item.source === 'project'
      ? (item.project && (item.project.name + (item.project.capacity ? ' · ' + item.project.capacity : ''))) || ''
      : (item.proposal && [item.proposal.ref || item.proposal.title, item.proposal.customer].filter(Boolean).join(' · ')) || '';
    lines.push([
      item.sourceLabel,
      item.rating || '',
      item.name,
      subject,
      item.message,
      item.createdAt,
      item.handledAt || 'No',
      item.nextStep,
      item.contactRequested ? 'Yes' : 'No'
    ].map(cell).join(','));
  });
  return lines.join('\r\n') + '\r\n';
}

/* The PATCH body is deliberately tiny: only the handled flag may change. */
export function readHandledPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Send a JSON object.' };
  }
  if (typeof body.handled !== 'boolean') {
    return { error: 'Say whether the note is handled.' };
  }
  return { handled: body.handled };
}

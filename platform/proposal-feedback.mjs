/* Private customer feedback. Reuses portal_events + notifications: no schema,
   permissions, payment, delivery-provider or company-access changes. */
import { createHash } from 'node:crypto';
const hash = text => createHash('sha256').update(String(text)).digest('hex');
export const FEEDBACK_LIMIT = 6;
const NEXT = new Set(['', 'interested', 'changes', 'question', 'later']);
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export function validateFeedback(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Feedback must be an object.');
  if (JSON.stringify(body).length > 8192) fail(413, 'Feedback is too large.');
  if (typeof body.token !== 'string' || !/^[a-z\d_-]{32,128}$/i.test(body.token)) fail(404, 'This customer link is unavailable. Ask the sender for a new link.');
  if (typeof body.submissionId !== 'string' || !/^[a-z\d_-]{20,80}$/i.test(body.submissionId)) fail(400, 'A valid submission ID is required.');
  const rating = body.rating == null ? null : body.rating;
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) fail(400, 'Choose a rating from 1 to 5.');
  if (body.comment != null && typeof body.comment !== 'string') fail(400, 'Write your feedback as text.');
  const comment = String(body.comment || '').replace(/\r\n?/g, '\n').trim();
  if (comment.length > 1500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(comment)) fail(400, 'Use up to 1,500 characters of plain text.');
  if (rating === null && !comment) fail(400, 'Choose a rating or write a message.');
  const nextStep = body.nextStep == null ? '' : body.nextStep;
  if (!NEXT.has(nextStep)) fail(400, 'Choose a valid next step.');
  if (body.contactRequested != null && typeof body.contactRequested !== 'boolean') fail(400, 'Choose whether you want the team to contact you.');
  return { rating, comment, nextStep, contactRequested: body.contactRequested === true };
}
export async function submitFeedback(store, body, at = new Date().toISOString()) {
  const feedback = validateFeedback(body);
  const token = await store.token(body.token);
  if (!token || token.revoked_at || (token.expires_at && (!Number.isFinite(Date.parse(token.expires_at)) || Date.parse(token.expires_at) <= Date.parse(at)))) fail(404, 'This customer link is unavailable. Ask the sender for a new link.');
  const version = await store.version(token.version_id);
  const proposal = await store.proposal(token.proposal_id);
  if (!version || !proposal || version.proposal_id !== token.proposal_id || !proposal.owner_id) fail(404, 'This proposal is no longer available.');
  const id = 'fb_' + hash(token.id + ':' + body.submissionId).slice(0, 40);
  const payloadHash = hash(JSON.stringify(feedback));
  const existing = await store.event(id);
  function receipt(row, duplicate) {
    let meta; try { meta = JSON.parse(row.meta_json); } catch (_) { fail(500, 'The saved feedback could not be verified.'); }
    if (row.token_id !== token.id || meta.payloadHash !== payloadHash) fail(409, 'This submission was already used for different feedback. Please refresh and try again.');
    return { ok: true, feedback: { id: row.id, savedAt: row.created_at, duplicate } };
  }
  if (existing) return receipt(existing, true);
  const meta = { ...feedback, payloadHash, versionId: version.id, versionLabel: version.version_label || null, customerName: String(proposal.customer_name || '').slice(0,160), proposalRef: String(proposal.ref || '').slice(0,120) };
  const event = { id, token_id: token.id, version_id: version.id, proposal_id: token.proposal_id, owner_id: proposal.owner_id, event_type: 'proposal_feedback', meta_json: JSON.stringify(meta), created_at: at };
  const who = String(proposal.customer_name || proposal.ref || 'Customer').slice(0, 120);
  const summary = [who, feedback.rating ? feedback.rating + '/5' : 'Message received', feedback.contactRequested ? 'Contact requested' : ''].filter(Boolean).join(' · ');
  const notification = { id: 'ntf_' + id, owner_id: proposal.owner_id, proposal_id: token.proposal_id, event_id: id, kind: 'feedback', title: 'Customer proposal feedback', body: summary, read_at: null, created_at: at };
  const since = new Date(Date.parse(at) - 3600000).toISOString();
  // The adapter commits the event AND notification atomically, with a rate
  // predicate inside the write (not just a race-prone read-before-write).
  await store.commit(event, notification, since, FEEDBACK_LIMIT);
  const saved = await store.event(id);
  if (!saved) fail(429, 'Too many submissions for this link. Your draft is still here; please try again later.');
  return receipt(saved, false);
}
export function d1FeedbackStore(db) {
  const one = (sql, ...args) => db.prepare(sql).bind(...args).first();
  return {
    token: raw => one('SELECT * FROM access_tokens WHERE token_hash = ?', hash(raw.toLowerCase())),
    version: id => one('SELECT id,proposal_id,owner_id,version_label FROM proposal_versions WHERE id = ?', id),
    proposal: id => one('SELECT id,owner_id,customer_name,ref FROM proposals WHERE id = ?', id),
    event: id => one('SELECT * FROM portal_events WHERE id = ?', id),
    commit: (e, n, since, limit) => db.batch([
      db.prepare(`INSERT INTO portal_events (id,token_id,version_id,proposal_id,owner_id,event_type,meta_json,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM portal_events WHERE token_id=? AND event_type='proposal_feedback' AND created_at>=?) < ?
        ON CONFLICT(id) DO NOTHING`).bind(e.id,e.token_id,e.version_id,e.proposal_id,e.owner_id,e.event_type,e.meta_json,e.created_at,e.token_id,since,limit),
      db.prepare(`INSERT INTO notifications (id,owner_id,proposal_id,event_id,kind,title,body,read_at,created_at)
        SELECT ?,?,?,?,?,?,?,NULL,? WHERE EXISTS (SELECT 1 FROM portal_events WHERE id=?) ON CONFLICT(id) DO NOTHING`)
        .bind(n.id,n.owner_id,n.proposal_id,n.event_id,n.kind,n.title,n.body,n.created_at,e.id)
    ])
  };
}
/* Local adapter: the commit callback must reload + synchronously save the
   latest store. No await inside that critical section, so concurrent retries
   cannot clobber unrelated writes in the file-backed local server. */
export function localFeedbackStore(load, save) {
  return {
    token: raw => load().tokens.find(t => t.token_hash === hash(raw)),
    version: id => load().versions.find(v => v.id === id),
    proposal: id => load().proposals.find(p => p.id === id),
    event: id => load().events.find(e => e.id === id),
    commit(e, n, since, limit) {
      const db = load();
      if (db.events.some(row => row.id === e.id)) return;
      if (db.events.filter(row => row.token_id === e.token_id && row.event_type === 'proposal_feedback' && row.created_at >= since).length >= limit) return;
      db.events.push(e); db.notifications.push(n); save(db);
    }
  };
}

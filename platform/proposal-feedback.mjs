/* Private customer feedback. Reuses portal_events + notifications: no schema,
   permissions, payment, delivery-provider or company-access changes. */
import { createHash } from 'node:crypto';
const hash = text => createHash('sha256').update(String(text)).digest('hex');
export const FEEDBACK_LIMIT = 6;
const SOURCES = new Set(['portal', 'whatsapp', 'email', 'customer']);
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
  /* Where the feedback came from — shown to the team with an icon. */
  const source = body.source == null ? 'portal' : String(body.source);
  if (!SOURCES.has(source)) fail(400, 'Choose a valid feedback source.');
  /* Optional customer contact so the team can reply over WhatsApp or email. */
  const customerPhone = String(body.customerPhone || '').trim().slice(0, 40);
  const customerEmail = String(body.customerEmail || '').trim().toLowerCase().slice(0, 160);
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) fail(400, 'Enter a valid email address.');
  return { rating, comment, nextStep, contactRequested: body.contactRequested === true, source, customerPhone, customerEmail };
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
    return { ok: true, feedback: { id: row.id, savedAt: row.created_at, duplicate, source: meta.source, customerPhone: meta.customerPhone, customerEmail: meta.customerEmail } };
  }
  if (existing) return receipt(existing, true);
  const who = String(proposal.customer_name || proposal.ref || 'Customer').slice(0, 120);
  const meta = { ...feedback, payloadHash, versionId: version.id, versionLabel: version.version_label || null, customerName: String(proposal.customer_name || '').slice(0,160), proposalRef: String(proposal.ref || '').slice(0,120) };
  const event = { id, token_id: token.id, version_id: version.id, proposal_id: token.proposal_id, owner_id: proposal.owner_id, event_type: 'proposal_feedback', meta_json: JSON.stringify(meta), created_at: at };
  const summary = [who, feedback.rating ? feedback.rating + '/5' : 'Message received', feedback.source === 'whatsapp' ? 'WhatsApp' : feedback.source === 'email' ? 'Email' : feedback.source === 'customer' ? 'Customer visit' : 'Portal', feedback.contactRequested ? 'Contact requested' : ''].filter(Boolean).join(' · ');
  const notification = { id: 'ntf_' + id, owner_id: proposal.owner_id, proposal_id: token.proposal_id, event_id: id, kind: 'feedback', title: 'Customer proposal feedback', body: summary, read_at: null, created_at: at };
  const since = new Date(Date.parse(at) - 3600000).toISOString();
  /* Auto-reply thank-you is queued as a notification so the team can see it
     and send it over WhatsApp / email from the feedback inbox. */
  const autoReply = { id: 'ar_' + id, owner_id: proposal.owner_id, proposal_id: token.proposal_id, event_id: id, kind: 'feedback_autoreply', title: 'Thank you for your feedback', body: 'Thanks for sharing your thoughts on your proposal. Our team will review your input and get back to you soon.', read_at: null, created_at: at, customerPhone: feedback.customerPhone || null, customerEmail: feedback.customerEmail || null };
  await store.commit(event, notification, autoReply, since, FEEDBACK_LIMIT);
  const saved = await store.event(id);
  if (!saved) fail(429, 'Too many submissions for this link. Your draft is still here; please try again later.');
  return receipt(saved, false);
}
/* Reply to a customer's feedback — staff sends a message back over
   WhatsApp or email using the contact the customer left. */
export async function submitReply(store, feedbackId, body, at = new Date().toISOString()) {
  if (!feedbackId || typeof feedbackId !== 'string' || !/^fb_[a-f\d]{40}$/i.test(feedbackId)) fail(400, 'Invalid feedback id.');
  const event = await store.event(feedbackId);
  if (!event || event.event_type !== 'proposal_feedback') fail(404, 'Feedback not found.');
  const meta = JSON.parse(event.meta_json || '{}');
  const proposal = await store.proposal(event.proposal_id);
  if (!proposal || !proposal.owner_id) fail(404, 'Proposal not available.');
  const { channel, message } = body || {};
  if (!channel || !['whatsapp','email'].includes(channel)) fail(400, 'Choose WhatsApp or email.');
  if (typeof message !== 'string' || !message.trim() || message.trim().length > 1000) fail(400, 'Write a reply (up to 1,000 characters).');
  const target = channel === 'whatsapp' ? meta.customerPhone : meta.customerEmail;
  if (!target) fail(400, 'The customer did not leave a ' + (channel === 'whatsapp' ? 'phone number' : 'email address') + ', so there is nothing to send to.');
  const reply = { id: 'r_' + hash(feedbackId + ':' + at).slice(0, 40), feedback_id: feedbackId, owner_id: proposal.owner_id, proposal_id: event.proposal_id, channel, message: message.trim(), target, created_at: at };
  await store.commitReply(reply);
  const notification = { id: 'ntf_r_' + reply.id, owner_id: proposal.owner_id, proposal_id: event.proposal_id, event_id: feedbackId, kind: 'feedback_reply', title: 'Reply sent to customer', body: (channel === 'whatsapp' ? 'WhatsApp' : 'Email') + ' reply sent · ' + target.slice(0, 60), read_at: null, created_at: at };
  await store.commitNotification(notification);
  return { ok: true, reply: { id: reply.id, channel, target, sentAt: reply.created_at } };
}
export function feedbackSourceLabel(source) {
  const labels = { portal: 'Proposal portal', whatsapp: 'WhatsApp', email: 'Email', customer: 'Customer visit' };
  return labels[source] || 'Portal';
}
export function feedbackSourceIcon(source) {
  const icons = { portal: '🌐', whatsapp: '💬', email: '📧', customer: '🤝' };
  return icons[source] || '🌐';
}
export function feedbackSourceColor(source) {
  const colors = { portal: '#6b7280', whatsapp: '#25d366', email: '#1a73e8', customer: '#7b2cbF' };
  return colors[source] || '#6b7280';
}
export function d1FeedbackStore(db) {
  const one = (sql, ...args) => db.prepare(sql).bind(...args).first();
  return {
    token: raw => one('SELECT * FROM access_tokens WHERE token_hash = ?', hash(raw.toLowerCase())),
    version: id => one('SELECT id,proposal_id,owner_id,version_label FROM proposal_versions WHERE id = ?', id),
    proposal: id => one('SELECT id,owner_id,customer_name,ref FROM proposals WHERE id = ?', id),
    event: id => one('SELECT * FROM portal_events WHERE id = ?', id),
    commit: (e, n, autoReply, since, limit) => db.batch([
      db.prepare(`INSERT INTO portal_events (id,token_id,version_id,proposal_id,owner_id,event_type,meta_json,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM portal_events WHERE token_id=? AND event_type='proposal_feedback' AND created_at>=?) < ?
        ON CONFLICT(id) DO NOTHING`).bind(e.id,e.token_id,e.version_id,e.proposal_id,e.owner_id,e.event_type,e.meta_json,e.created_at,e.token_id,since,limit),
      db.prepare(`INSERT INTO notifications (id,owner_id,proposal_id,event_id,kind,title,body,read_at,created_at)
        SELECT ?,?,?,?,?,?,?,NULL,? WHERE EXISTS (SELECT 1 FROM portal_events WHERE id=?) ON CONFLICT(id) DO NOTHING`)
        .bind(n.id,n.owner_id,n.proposal_id,n.event_id,n.kind,n.title,n.body,n.created_at,e.id),
      db.prepare(`INSERT INTO notifications (id,owner_id,proposal_id,event_id,kind,title,body,read_at,created_at)
        SELECT ?,?,?,?,?,?,?,NULL,? WHERE EXISTS (SELECT 1 FROM portal_events WHERE id=?) ON CONFLICT(id) DO NOTHING`)
        .bind(autoReply.id,autoReply.owner_id,autoReply.proposal_id,autoReply.event_id,autoReply.kind,autoReply.title,autoReply.body,autoReply.created_at,e.id)
    ]),
    commitReply: (reply, notification) => db.batch([
      db.prepare(`INSERT INTO feedback_replies (id,feedback_id,owner_id,proposal_id,channel,message,target,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).bind(reply.id,reply.feedback_id,reply.owner_id,reply.proposal_id,reply.channel,reply.message,reply.target,reply.created_at),
      db.prepare(`INSERT INTO notifications (id,owner_id,proposal_id,event_id,kind,title,body,read_at,created_at)
        VALUES (?,?,?,?,?,?,?,NULL,?)`).bind(notification.id,notification.owner_id,notification.proposal_id,notification.event_id,notification.kind,notification.title,notification.body,notification.created_at)
    ]),
    commitNotification: (notification) => db.prepare(`INSERT INTO notifications (id,owner_id,proposal_id,event_id,kind,title,body,read_at,created_at)
      VALUES (?,?,?,?,?,?,?,NULL,?)`).bind(notification.id,notification.owner_id,notification.proposal_id,notification.event_id,notification.kind,notification.title,notification.body,notification.created_at)
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
    commit(e, n, autoReply, since, limit) {
      const db = load();
      if (db.events.some(row => row.id === e.id)) return;
      if (db.events.filter(row => row.token_id === e.token_id && row.event_type === 'proposal_feedback' && row.created_at >= since).length >= limit) return;
      db.events.push(e); db.notifications.push(n); db.notifications.push(autoReply); save(db);
    },
    commitReply(reply, notification) {
      const db = load();
      if (!db.feedbackReplies) db.feedbackReplies = [];
      db.feedbackReplies.push(reply); db.notifications.push(notification); save(db);
    },
    commitNotification(notification) {
      const db = load(); db.notifications.push(notification); save(db);
    }
  };
}

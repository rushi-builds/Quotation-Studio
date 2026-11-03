/* Real, private customer feedback. A successful HTTP save + receipt is the
   only success state. Source tracking, customer contact for replies, and
   send-over-WhatsApp/email options. No fabricated averages. Session drafts
   never contain the bearer token. */
'use strict';
(function (root) {
  const $ = id => document.getElementById(id);
  const PRODUCTION_VERCEL_HOSTS = [
    'quotation-studio-two.vercel.app',
    'quotation-studio-rushi-builds.vercel.app'
  ];
  function isProductionVercelHost(host) {
    if (PRODUCTION_VERCEL_HOSTS.indexOf(host) !== -1) return true;
    return /^quotation-studio-git-main-[a-z0-9-]+\.vercel\.app$/.test(host);
  }
  function isUnisolatedVercelPreview() {
    try {
      const host = String(location.hostname || '').toLowerCase();
      return host.endsWith('.vercel.app') && !isProductionVercelHost(host);
    } catch (_) { return false; }
  }
  const SOURCES = [
    { id: 'portal', label: 'Proposal portal', icon: '🌐', color: '#6b7280' },
    { id: 'whatsapp', label: 'WhatsApp', icon: '💬', color: '#25d366' },
    { id: 'email', label: 'Email', icon: '📧', color: '#1a73e8' },
    { id: 'customer', label: 'Customer visit', icon: '🤝', color: '#7b2cbf' }
  ];
  async function mount({ token, available, snapshot, preview = false }) {
    const host = $('proposalFeedback'); if (!host) return;
    const form = $('proposalFeedbackForm'), fieldset = $('feedbackFields'), submit = $('feedbackSubmit'), status = $('feedbackStatus');
    const ratingInputs = [...form.querySelectorAll('[name="proposalRating"]')];
    let pending = false, submissionId = '', lastPayload = '', storageKey = '', retryNextStep = '';
    const setStatus = (message, error = false) => { status.textContent = message; status.classList.toggle('is-error', error); };
    const previewHost = isUnisolatedVercelPreview();
    if (!preview && (!available || previewHost)) {
      fieldset.disabled = true; submit.disabled = true;
      setStatus('Feedback is not available on this link yet. You can still discuss the proposal using the company contact details.');
      return;
    }
    try {
      if (!preview) {
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
        storageKey = 'qs.feedback.draft.' + [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
      }
    } catch (_) { /* Draft remains in memory if storage/crypto is restricted. */ }
    /* Source selector + contact fields are injected once into the form. */
    const sourceBox = document.createElement('div');
    sourceBox.className = 'feedback-source';
    sourceBox.innerHTML =
      '<div class="feedback-step-label"><span class="feedback-step-number">00</span><span>FEEDBACK REACHES US VIA</span></div>' +
      '<div class="feedback-source-pills">' +
      SOURCES.map(s => '<label class="feedback-source-pill"><input type="radio" name="feedbackSource" value="' + s.id + '" aria-label="' + s.label + '"><span class="feedback-source-icon" style="color:' + s.color + '">' + s.icon + '</span><span class="feedback-source-text">' + s.label + '</span></label>').join('') +
      '</div>';
    const contactBox = document.createElement('div');
    contactBox.className = 'feedback-contact-fields';
    contactBox.innerHTML =
      '<div class="feedback-step-label"><span class="feedback-step-number">00</span><span>SO WE CAN REPLY (OPTIONAL)</span></div>' +
      '<div class="feedback-contact-row">' +
      '<input type="tel" id="feedbackCustomerPhone" placeholder="WhatsApp number" maxlength="40" autocomplete="tel" />' +
      '<input type="email" id="feedbackCustomerEmail" placeholder="Email address" maxlength="160" autocomplete="email" />' +
      '</div>' +
      '<small class="feedback-contact-note">Only if you want the team to reply over WhatsApp or email.</small>';
    const ratingSection = host.querySelector('.feedback-rating');
    ratingSection.parentNode.insertBefore(sourceBox, ratingSection);
    ratingSection.parentNode.insertBefore(contactBox, ratingSection.nextSibling);
    const sourceInputs = [...sourceBox.querySelectorAll('[name="feedbackSource"]')];
    /* Default to portal. */
    if (sourceInputs.length) sourceInputs.find(i => i.value === 'portal').checked = true;
    const current = () => ({
      rating: Number(ratingInputs.find(input => input.checked)?.value) || null,
      comment: $('feedbackComment').value,
      nextStep: retryNextStep,
      contactRequested: $('feedbackContact').checked,
      source: sourceBox.querySelector('[name="feedbackSource"]:checked')?.value || 'portal',
      customerPhone: $('feedbackCustomerPhone') ? $('feedbackCustomerPhone').value : '',
      customerEmail: $('feedbackCustomerEmail') ? $('feedbackCustomerEmail').value : ''
    });
    const ratingResponses = [
      ['A LITTLE PERSPECTIVE', 'Your view makes a difference.', 'A quick rating or a thoughtful note. Both are welcome.'],
      ['LET’S REFINE IT', 'Let’s make it better.', 'Tell us what didn’t work for you, and what you’d change.'],
      ['ROOM TO IMPROVE', 'A little more clarity?', 'Which part needs a clearer explanation or a rethink?'],
      ['A HELPFUL START', 'Getting closer.', 'What would make this proposal more useful for you?'],
      ['LOOKING GOOD', 'That’s lovely to hear.', 'Tell us what worked well, or anything we could refine.'],
      ['THAT’S A FIVE!', 'Hurray! Glad you liked it.', 'We’d love to know what stood out for you.']
    ];
    const commentPrompts = [
      "A thought, a question, or a change you'd like us to consider…",
      "What didn't work for you? Tell us what we should improve.",
      'What could we improve or explain more clearly?',
      'What would make this proposal more useful for you?',
      "What worked well? Anything you'd like us to refine?",
      "What would you like to do next? Share your plans, questions, or anything you'd like us to help with."
    ];
    function paint() {
      const selected = current().rating || 0;
      ratingInputs.forEach(input => {
        const label = input.closest('label');
        label.classList.toggle('is-filled', Number(input.value) <= selected);
        label.classList.toggle('is-selected', Number(input.value) === selected);
      });
      $('feedbackRatingText').textContent = selected ? selected + ' out of 5' : 'Optional — you can leave just a message';
      const response = ratingResponses[selected];
      const panel = host.querySelector('.feedback-rating');
      const responseChanged = panel && panel.dataset.rating !== String(selected);
      if (responseChanged) {
        panel.dataset.rating = String(selected);
        $('feedbackComment').placeholder = commentPrompts[selected];
      }
      if (responseChanged && $('feedbackResponseTitle')) {
        $('feedbackResponseKicker').textContent = response[0];
        const responseTitle = $('feedbackResponseTitle');
        responseTitle.textContent = response[1];
        const accentWord = ['difference.', 'better.', 'clarity?', 'closer.', 'lovely', 'Hurray!'][selected];
        const accentAt = response[1].indexOf(accentWord);
        const accent = document.createElement('span'); accent.className = 'feedback-response-accent';
        accent.textContent = accentWord;
        responseTitle.replaceChildren(document.createTextNode(response[1].slice(0, accentAt)), accent, document.createTextNode(response[1].slice(accentAt + accentWord.length)));
        $('feedbackResponseCopy').textContent = response[2];
      }
      $('feedbackCount').textContent = $('feedbackComment').value.length + ' / 1500';
    }
    function saveDraft() {
      if (!storageKey) return;
      try { sessionStorage.setItem(storageKey, JSON.stringify({ ...current(), submissionId, lastPayload, at: Date.now() })); } catch (_) {}
    }
    try {
      const draft = storageKey && JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (draft && Date.now() - draft.at < 7200000) {
        ratingInputs.forEach(input => input.checked = Number(input.value) === draft.rating);
        $('feedbackComment').value = String(draft.comment || '').slice(0, 1500);
        $('feedbackContact').checked = draft.contactRequested === true;
        const s = draft.source; if (s && sourceInputs.find(i => i.value === s)) sourceInputs.find(i => i.value === s).checked = true;
        if ($('feedbackCustomerPhone')) $('feedbackCustomerPhone').value = String(draft.customerPhone || '');
        if ($('feedbackCustomerEmail')) $('feedbackCustomerEmail').value = String(draft.customerEmail || '');
        submissionId = typeof draft.submissionId === 'string' ? draft.submissionId : '';
        lastPayload = typeof draft.lastPayload === 'string' ? draft.lastPayload : '';
        try {
          const prior = JSON.parse(lastPayload), data = current();
          if (submissionId && ['interested','changes','question','later'].includes(prior.nextStep) &&
              prior.rating === data.rating && prior.comment === data.comment.trim() && prior.contactRequested === data.contactRequested) retryNextStep = prior.nextStep;
        } catch (_) {}
        setStatus('Your unsent draft was restored on this tab.');
      } else if (storageKey) sessionStorage.removeItem(storageKey);
    } catch (_) {}
    form.addEventListener('input', () => { retryNextStep = ''; paint(); saveDraft(); if (!pending) setStatus(''); });
    $('feedbackClearRating').addEventListener('click', () => { retryNextStep = ''; ratingInputs.forEach(input => input.checked = false); paint(); saveDraft(); });
    sourceInputs.forEach(input => input.addEventListener('change', () => { paint(); saveDraft(); }));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (preview) {
        form.hidden = true; $('feedbackSuccess').hidden = false;
        $('feedbackReceipt').textContent = 'Sample receipt · nothing was sent';
        $('feedbackSuccess').focus(); setStatus('');
        return;
      }
      if (pending) return;
      const data = current(); data.comment = data.comment.trim();
      if (!data.rating && !data.comment) { setStatus('Choose a rating or write a message before sending.', true); return; }
      if (data.comment.length > 1500) { setStatus('Please keep your message within 1,500 characters.', true); return; }
      if (!root.crypto?.getRandomValues) { setStatus('This browser cannot submit securely. Please use an up-to-date browser.', true); return; }
      const payload = JSON.stringify(data);
      if (!submissionId || lastPayload !== payload) {
        submissionId = 'feedback_' + [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
        lastPayload = payload;
      }
      saveDraft(); pending = true; fieldset.disabled = true; submit.disabled = true;
      submit.textContent = 'Sending feedback…'; setStatus('Saving your feedback securely…');
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch('/api/portal/feedback', {
          method: 'POST', credentials: 'omit', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ token, submissionId, ...data })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Feedback was not confirmed saved. Please retry.');
        if (result.ok !== true || !/^fb_[a-f\d]{40}$/.test(result.feedback?.id || '') || !Number.isFinite(Date.parse(result.feedback?.savedAt))) throw new Error('The server did not confirm a saved receipt. Please retry.');
        try { if (storageKey) sessionStorage.removeItem(storageKey); } catch (_) {}
        form.hidden = true; $('feedbackSuccess').hidden = false;
        /* Day first, always: the visitor's receipt must not depend on which
           locale order the browser happens to prefer. */
        const saved = new Date(result.feedback.savedAt);
        const pad2 = n => String(n).padStart(2, '0');
        let clock = '';
        try { clock = saved.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); } catch (_) { clock = ''; }
        const src = SOURCES.find(s => s.id === result.feedback.source) || SOURCES[0];
        $('feedbackReceipt').textContent = 'Receipt ' + result.feedback.id.slice(3, 15) + ' · ' +
          pad2(saved.getDate()) + '/' + pad2(saved.getMonth() + 1) + '/' + saved.getFullYear() + (clock ? ', ' + clock : '');
        /* Source badge + reply options on the receipt. */
        const receipt = $('feedbackReceipt');
        const badge = document.createElement('span');
        badge.className = 'feedback-receipt-source';
        badge.style.color = src.color;
        badge.innerHTML = src.icon + ' via ' + src.label;
        receipt.parentNode.insertBefore(badge, receipt.nextSibling);
        /* Reply-over-WhatsApp/Email options if the customer left contact. */
        const hasPhone = result.feedback.customerPhone;
        const hasEmail = result.feedback.customerEmail;
        if (hasPhone || hasEmail) {
          const replyBox = document.createElement('div');
          replyBox.className = 'feedback-reply-options';
          replyBox.innerHTML =
            '<div class="feedback-reply-head"><strong>Want us to reply to you?</strong><small>Choose how and we will send your thank-you right away.</small></div>' +
            '<div class="feedback-reply-buttons">' +
            (hasPhone ? '<button type="button" class="feedback-reply-btn feedback-reply-wa" data-channel="whatsapp"><span style="color:#25d366">💬</span> Reply on WhatsApp</button>' : '') +
            (hasEmail ? '<button type="button" class="feedback-reply-btn feedback-reply-email" data-channel="email"><span style="color:#1a73e8">📧</span> Reply by email</button>' : '') +
            '</div>';
          receipt.parentNode.insertBefore(replyBox, badge.nextSibling);
          replyBox.querySelectorAll('.feedback-reply-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const channel = btn.getAttribute('data-channel');
              const target = channel === 'whatsapp' ? hasPhone : hasEmail;
              btn.disabled = true; btn.textContent = 'Sending…';
              try {
                const res = await fetch('/api/portal/feedback/' + result.feedback.id + '/reply', {
                  method: 'POST', credentials: 'omit',
                  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                  body: JSON.stringify({ channel, message: 'Thank you for your feedback on your KTM Energy Experts proposal. We have received your message and will get back to you soon.' })
                });
                const out = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(out.error || 'Could not send reply. Please retry.');
                btn.textContent = 'Sent ✓';
                btn.classList.add('is-sent');
                setStatus('Thank-you sent on ' + (channel === 'whatsapp' ? 'WhatsApp' : 'email') + '.');
              } catch (err) {
                btn.disabled = false;
                btn.textContent = channel === 'whatsapp' ? 'Reply on WhatsApp' : 'Reply by email';
                setStatus(err.message || 'Could not send reply.', true);
              }
            });
          });
        }
        $('feedbackSuccess').focus(); setStatus('');
      } catch (error) {
        setStatus(error.name === 'AbortError' ? 'The connection timed out. Your draft is still here. Retry safely — the same submission will not be saved twice.' : (error.message || 'Could not send feedback. Your draft is still here; please retry.'), true);
        fieldset.disabled = false; submit.disabled = false; submit.textContent = 'Retry sending feedback';
      } finally { clearTimeout(timer); pending = false; }
    });
    function jump() {
      host.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => ($('feedbackSuccess').hidden ? ratingInputs[0] : $('feedbackSuccess')).focus({ preventScroll: true }), 150);
    }
    const jumpButton = $('requestJump');
    if (jumpButton) { jumpButton.disabled = false; jumpButton.addEventListener('click', () => { location.hash = 'proposalFeedback'; jump(); }); }
    const onHash = () => { if (['#proposalFeedback','#shareAcceptWrap'].includes(location.hash)) jump(); };
    window.addEventListener('hashchange', onHash); requestAnimationFrame(onHash);
    const ref = snapshot?.ref || snapshot?.form?.propRef || '';
    $('feedbackContext').textContent = ref ? 'Private feedback for proposal ' + ref : 'Private feedback for your proposal';
    const portalMain = document.getElementById('portalMain');
    if (!preview && portalMain && ['#proposalFeedback', '#shareAcceptWrap'].includes(location.hash)) {
      portalMain.classList.add('feedback-first');
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'feedback-full-pill';
      pill.textContent = 'View full proposal';
      host.prepend(pill);
      pill.addEventListener('click', () => {
        portalMain.classList.remove('feedback-first');
        pill.remove();
        try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    paint(); fieldset.disabled = false; submit.disabled = false;
    if (preview) {
      submit.textContent = 'Preview the confirmation';
      $('feedbackContext').textContent = 'A quick rating, a thought, or a question—every perspective helps.';
      setStatus('');
    }
  }
  root.ProposalFeedback = { mount };
})(window);

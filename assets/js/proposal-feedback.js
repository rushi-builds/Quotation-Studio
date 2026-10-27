/* Real, private customer feedback. A successful HTTP save + receipt is the
   only success state. No send-via-WhatsApp surrogate, fabricated average or
   client-side 'submitted' flag. Session drafts never contain the bearer token. */
'use strict';
(function (root) {
  const $ = id => document.getElementById(id);
  async function mount({ token, available, snapshot, preview = false }) {
    const host = $('proposalFeedback'); if (!host) return;
    const form = $('proposalFeedbackForm'), fieldset = $('feedbackFields'), submit = $('feedbackSubmit'), status = $('feedbackStatus');
    const ratingInputs = [...form.querySelectorAll('[name="proposalRating"]')];
    let pending = false, submissionId = '', lastPayload = '', storageKey = '', retryNextStep = '';
    const setStatus = (message, error = false) => { status.textContent = message; status.classList.toggle('is-error', error); };
    const previewHost = location.hostname.endsWith('.vercel.app') && location.hostname !== 'quotation-studio-taupe.vercel.app';
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
    const current = () => ({
      rating: Number(ratingInputs.find(input => input.checked)?.value) || null,
      comment: $('feedbackComment').value,
      nextStep: retryNextStep,
      contactRequested: $('feedbackContact').checked
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
        // Colour emphasis is presentation only; keep the same accessible copy.
        if (selected === 0 || selected === 5) {
          const split = selected === 0 ? response[1].lastIndexOf(' ') : response[1].indexOf(' ');
          const accent = document.createElement('span'); accent.className = 'feedback-response-accent';
          if (selected === 0) { accent.textContent = response[1].slice(split + 1); responseTitle.replaceChildren(document.createTextNode(response[1].slice(0, split + 1)), accent); }
          else { accent.textContent = response[1].slice(0, split); responseTitle.replaceChildren(accent, document.createTextNode(response[1].slice(split))); }
        }
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
        submissionId = typeof draft.submissionId === 'string' ? draft.submissionId : '';
        lastPayload = typeof draft.lastPayload === 'string' ? draft.lastPayload : '';
        // The removed preference is never attached to new feedback. Only retain
        // an identical already-attempted payload for a safe pre-upgrade retry.
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
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (preview) { setStatus('Form preview only. Nothing has been sent or saved to Studio.'); return; }
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
        $('feedbackReceipt').textContent = 'Receipt ' + result.feedback.id.slice(3, 15) + ' · ' + new Date(result.feedback.savedAt).toLocaleString();
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
    paint(); fieldset.disabled = false; submit.disabled = preview;
    if (preview) {
      submit.textContent = 'Preview — sending disabled';
      $('feedbackContext').textContent = 'Preview of the customer feedback experience';
      setStatus('');
    }
  }
  root.ProposalFeedback = { mount };
})(window);

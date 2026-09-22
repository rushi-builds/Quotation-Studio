/* On-demand proposal narration. Deterministic, localized scripts use the same
   Finance state as the PDF, never an exploratory slider or an external LLM.
   Web Speech voices are device/provider-dependent; never substitute a language. */
'use strict';
(function(root) {
  const $ = id => document.getElementById(id);
  const locales={en:'en-IN',hi:'hi-IN',mr:'mr-IN'};
  const names={en:'English',hi:'Hindi',mr:'Marathi'};
  function scriptFor(s, language='en') {
    const lang=locales[language]?language:'en', f=root.Finance.compute(s);
    const n=(value,digits=0)=>new Intl.NumberFormat(locales[lang],{useGrouping:false,maximumFractionDigits:digits}).format(Number.isFinite(Number(value))?Number(value):0);
    const kw=n(f.capacity,2), count=n(f.moduleCount), watts=n(f.moduleWattage), generation=n(f.annualGen);
    const gross=n(f.grossTotal), net=n(f.netInvestment), subsidy=n(f.subsidy), saving=n(f.lifetimeSaving), years=n(f.payback,1);
    const company=String(s.companyName||'').trim();
    if(lang==='hi') return [
      company?'नमस्कार। '+company+' की ओर से आपके रूफटॉप सौर ऊर्जा प्रस्ताव का यह संक्षिप्त परिचय है।':'नमस्कार। आपके रूफटॉप सौर ऊर्जा प्रस्ताव का यह संक्षिप्त परिचय है।',
      'प्रस्तावित प्रणाली की क्षमता '+kw+' किलोवाट पीक है। इसमें '+count+' सौर मॉड्यूल हैं, जिनमें से प्रत्येक की क्षमता '+watts+' वाट पीक है।',
      'पहले वर्ष में अनुमानित बिजली उत्पादन '+generation+' किलोवाट घंटे है।',
      'जीएसटी सहित कुल कीमत '+gross+' रुपये है। अनुमानित शुद्ध निवेश '+net+' रुपये है।',
      f.subsidy>0?'इस अनुमान में '+subsidy+' रुपये की संभावित सब्सिडी शामिल है, जो पात्रता और स्वीकृति पर निर्भर है।':'इस अनुमान में कोई सब्सिडी शामिल नहीं है।',
      'प्रस्ताव की बिजली दर और मान्यताओं के आधार पर पच्चीस वर्षों की अनुमानित कुल बचत '+saving+' रुपये है।',
      Number.isFinite(f.payback)?'अनुमानित निवेश वसूली अवधि '+years+' वर्ष है।':'वर्तमान गणना के अनुसार पच्चीस वर्षों के भीतर निवेश की वसूली नहीं होती है।',
      'ये अनुमान हैं। बिजली उत्पादन, बिल में बचत या सब्सिडी की स्वीकृति की गारंटी नहीं है। आगे बढ़ने से पहले लिखित प्रस्ताव पढ़ें और स्थल का आकलन करवाएँ।'
    ];
    if(lang==='mr') return [
      company?'नमस्कार. '+company+' तर्फे आपल्या रूफटॉप सौर ऊर्जा प्रस्तावाचा हा संक्षिप्त आढावा आहे.':'नमस्कार. आपल्या रूफटॉप सौर ऊर्जा प्रस्तावाचा हा संक्षिप्त आढावा आहे.',
      'प्रस्तावित यंत्रणेची क्षमता '+kw+' किलोवॅट पीक आहे. यामध्ये प्रत्येकी '+watts+' वॅट पीक क्षमतेची '+count+' सौर मॉड्यूल्स आहेत.',
      'पहिल्या वर्षातील अंदाजित वीजनिर्मिती '+generation+' किलोवॅट तास आहे.',
      'जीएसटीसह एकूण किंमत '+gross+' रुपये आहे. अंदाजित निव्वळ गुंतवणूक '+net+' रुपये आहे.',
      f.subsidy>0?'या अंदाजात '+subsidy+' रुपयांच्या संभाव्य अनुदानाचा समावेश आहे. अनुदान पात्रता आणि मंजुरीच्या अधीन आहे.':'या अंदाजात कोणत्याही अनुदानाचा समावेश नाही.',
      'प्रस्तावातील वीजदर आणि गृहीतकांनुसार पंचवीस वर्षांतील अंदाजित एकूण बचत '+saving+' रुपये आहे.',
      Number.isFinite(f.payback)?'अंदाजित गुंतवणूक वसुलीचा कालावधी '+years+' वर्षे आहे.':'सध्याच्या गणनेनुसार पंचवीस वर्षांत गुंतवणुकीची वसुली होत नाही.',
      'हे केवळ अंदाज आहेत. वीजनिर्मिती, वीजबिलातील बचत किंवा अनुदान मंजुरीची हमी नाही. पुढे जाण्यापूर्वी लेखी प्रस्ताव वाचा आणि जागेचे मूल्यांकन करून घ्या.'
    ];
    return [
      company?'Welcome to your rooftop solar proposal from '+company+'.':'Welcome to your rooftop solar proposal.',
      'The proposed system capacity is '+kw+' kilowatts peak, using '+count+' modules rated at '+watts+' watts peak each.',
      'The estimated first-year generation is '+generation+' kilowatt hours.',
      'The total price including GST is '+gross+' rupees. The estimated net investment is '+net+' rupees.',
      f.subsidy>0?'This estimate includes a potential subsidy of '+subsidy+' rupees, subject to eligibility and approval.':'No subsidy is included in this estimate.',
      'The estimated cumulative savings over twenty-five years are '+saving+' rupees, based on the quoted tariff and assumptions.',
      Number.isFinite(f.payback)?'Estimated payback is '+years+' years.':'The current model does not reach payback within twenty-five years.',
      'These are estimates, not guaranteed generation, bill savings or subsidy approval. Review the written proposal and arrange a site assessment before proceeding.'
    ];
  }
  let host, state=null, stateKey='', language='en', mode='idle', revision=0, timer;
  let chunks=[], chunkIndex=0, pendingNext=false, currentUtterance=null;
  const synthesis=()=>root.speechSynthesis;
  const supported=()=>!!(synthesis() && root.SpeechSynthesisUtterance);
  function voiceFor(lang) {
    if(!supported()) return null;
    // Prefer an Indian/local voice, but require the exact language family.
    return synthesis().getVoices().filter(v=>v.lang?.toLowerCase().replace(/_/g,'-').split('-')[0]===lang)
      .sort((a,b)=>(Number(b.lang.toLowerCase()===locales[lang].toLowerCase())*2+Number(b.localService))-(Number(a.lang.toLowerCase()===locales[lang].toLowerCase())*2+Number(a.localService)))[0] || null;
  }
  function availability() {
    if(!supported()) return 'Audio playback is not supported in this browser. You can read the briefing below.';
    const voice=voiceFor(language);
    return voice?'Ready in '+names[language]+' · '+voice.name+'. Press Play to begin.':names[language]+' voice unavailable in this browser on this device. Read the '+names[language]+' briefing below, or choose an available audio language.';
  }
  function controls(message) {
    if(!host) return;
    $('briefingPlay').disabled=mode!=='idle' || !voiceFor(language);
    $('briefingPause').disabled=!['playing','paused'].includes(mode);
    $('briefingPause').textContent=mode==='paused'?'Resume':'Pause';
    $('briefingStop').disabled=mode==='idle';
    const missing = !voiceFor(language);
    if ($('briefingVoiceHelp')) $('briefingVoiceHelp').hidden = !missing;
    if ($('briefingRefresh')) $('briefingRefresh').disabled = !supported();
    if ($('briefingUseEnglish')) $('briefingUseEnglish').hidden = !missing || language === 'en' || !voiceFor('en');
    host.querySelectorAll('[data-briefing-language]').forEach(button => {
      const available = !!voiceFor(button.dataset.briefingLanguage);
      button.title = names[button.dataset.briefingLanguage] + (available ? ': audio and written briefing available' : ': written briefing available; no matching browser voice');
    });
    if(message && $('briefingStatus').textContent!==message) $('briefingStatus').textContent=message;
  }
  function stop(message) {
    const active=mode!=='idle'; revision++; clearTimeout(timer);
    mode='idle'; pendingNext=false; currentUtterance=null;
    if(active && supported()) synthesis().cancel();
    controls(message || availability());
  }
  function updateTranscript() {
    if(!host || !state) return;
    const transcript=$('briefingText'); transcript.lang=language;
    transcript.textContent=scriptFor(state,language).join('\n\n');
    host.querySelectorAll('[data-briefing-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.briefingLanguage===language)));
    controls(availability());
  }
  function speakChunk(token, voice) {
    if(token!==revision) return;
    if(chunkIndex>=chunks.length) {mode='idle';currentUtterance=null;controls('Briefing complete. You can play it again or read the written proposal.');return;}
    const utterance=new root.SpeechSynthesisUtterance(chunks[chunkIndex]);
    currentUtterance=utterance; // retain a reference while some engines speak
    utterance.lang=locales[language]; utterance.voice=voice; utterance.rate=0.95;
    utterance.onstart=()=>{if(token!==revision)return;clearTimeout(timer);mode='playing';controls('Playing in '+names[language]+' · quotation values.');};
    utterance.onend=()=>{
      if(token!==revision)return;clearTimeout(timer);chunkIndex++;
      if(mode==='paused') {pendingNext=true;return;}
      speakChunk(token,voice);
    };
    utterance.onerror=()=>{if(token===revision)stop('Audio could not play. Please retry or read the briefing below.');};
    clearTimeout(timer);
    timer=setTimeout(()=>{if(token===revision)stop('The voice did not start. Please retry or read the briefing below.');},12000);
    try {synthesis().speak(utterance);} catch (_) {stop('Audio could not play. Please retry or read the briefing below.');}
  }
  function play() {
    if(!state || mode!=='idle') return;
    const voice=voiceFor(language); if(!voice) {controls(availability());return;}
    // Short utterances avoid long-text stalls in mobile speech engines.
    chunks=scriptFor(state,language); chunkIndex=0; pendingNext=false;
    synthesis().cancel(); synthesis().resume();
    mode='starting'; controls('Starting '+names[language]+' briefing…');
    speakChunk(++revision,voice);
  }
  function attach(el) {
    host=el;
    host.querySelectorAll('[data-briefing-language]').forEach(button=>button.addEventListener('click',()=>{
      stop(); language=button.dataset.briefingLanguage; updateTranscript(); revealFallback();
    }));
    $('briefingPlay').addEventListener('click',play);
    $('briefingRefresh')?.addEventListener('click',()=>{ controls(availability()); revealFallback(); });
    $('briefingUseEnglish')?.addEventListener('click',()=>{
      stop(); language='en'; updateTranscript(); // Language choice never autoplays.
    });
    $('briefingStop').addEventListener('click',()=>stop('Stopped. Press Play to restart from the beginning.'));
    $('briefingPause').addEventListener('click',()=>{
      if(mode==='playing') {synthesis().pause();mode='paused';controls('Paused. Resume or stop the briefing.');}
      else if(mode==='paused') {
        mode='playing'; synthesis().resume();controls('Playing in '+names[language]+' · quotation values.');
        if(pendingNext) {pendingNext=false;speakChunk(revision,voiceFor(language));}
      }
    });
    // Closing the player must not leave hidden narration running.
    host.addEventListener('toggle',()=>{
      if(!host.open && mode!=='idle')stop();
      else if(host.open && mode==='idle') {controls(availability());revealFallback();}
    });
  }
  function revealFallback() {
    if (host?.open && !voiceFor(language)) host.querySelector('.briefing-transcript').open = true;
  }
  function sync() {
    const el=$('proposalBriefing'), next=root.Render?.lastState; if(!el || !next)return;
    if(el!==host) {stop();attach(el);stateKey='';}
    const key=JSON.stringify(next), changed=key!==stateKey, active=mode!=='idle';
    if(changed) {stop();state=JSON.parse(key);stateKey=key;updateTranscript();}
    host.hidden=next.briefingEnabled===false;
    if(host.hidden) {stop();host.open=false;}
    else if(changed && active) controls('Proposal updated. Press Play to hear the latest quotation values.');
  }
  if(supported()) synthesis().addEventListener?.('voiceschanged',()=>{
    if(mode!=='idle' && !voiceFor(language))stop('The selected voice is no longer available. Read the briefing or select another language.');
    else if(mode==='idle'){controls(availability());revealFallback();}
  });
  root.addEventListener('focus',()=>{if(mode==='idle')controls(availability());});
  root.addEventListener('pagehide',()=>stop());
  root.addEventListener('beforeprint',()=>stop());
  document.addEventListener('visibilitychange',()=>{if(document.hidden && mode!=='idle')stop('Stopped while this page was in the background. Press Play to restart.');});
  document.addEventListener('qs:rendered',sync);
  root.Briefing={scriptFor,voiceFor,stop};
})(window);

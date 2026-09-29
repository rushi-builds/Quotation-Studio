/* On-demand proposal narration. Deterministic, localized scripts use the same
   Finance state as the PDF, never an exploratory slider or an external LLM.

   Web Speech voices are device/provider-dependent, and a Marathi (mr) voice
   exists on almost no desktop: Chrome desktop ships none, and Windows only
   installs one when the Marathi language pack is added. Refusing to play in
   that situation leaves the reader with silence; reading Devanagari with an
   English voice would be gibberish. So playback follows a stated chain -
   Marathi, else Hindi (same script, closest installed), and the same in
   reverse - and the status line always names the voice that is actually
   speaking, so a substitute is never passed off as the real thing. English
   text is only ever read by an English voice. */
'use strict';
(function(root) {
  const $ = id => document.getElementById(id);
  const locales={en:'en-IN',hi:'hi-IN',mr:'mr-IN'};
  const names={en:'English',hi:'Hindi',mr:'Marathi'};
  function solarScriptFor(s, language='en') {
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
  function scriptFor(s, language='en') {
    const script=solarScriptFor(s,language);
    if(root.Bess.included(s)) {
      const note=language==='hi'?'नीचे बताए गए मूल्य, बचत और भुगतान केवल सौर प्रणाली के लिए हैं। बैटरी स्टोरेज अलग कीमत वाला विकल्प है। उसकी क्षमता, अतिरिक्त लागत, बैकअप की शर्तें और आकलन प्रस्ताव के बैटरी पृष्ठों पर देखें। बैटरी की बचत को सौर बचत में न जोड़ें।':language==='mr'?'पुढे सांगितलेल्या किंमती, बचत आणि देयके केवळ सौर यंत्रणेसाठी आहेत. बॅटरी स्टोरेज हा स्वतंत्र किमतीचा पर्याय आहे. क्षमता, अतिरिक्त किंमत, बॅकअपच्या अटी आणि अंदाज प्रस्तावातील बॅटरी पृष्ठांवर पाहा. बॅटरीची बचत सौर बचतीत मिळवू नका.':'The prices, savings and payments below are solar-only. Optional battery storage is priced separately. See the battery pages for capacity, additional investment, backup conditions and the storage-only assessment. Do not add its savings to the solar estimate.';
      script.splice(1,0,note);
    }
    if(root.AdditionalSystems.included(s))script.splice(1,0,language==='hi'?'अतिरिक्त प्रणाली अलग कीमत पर प्रस्तावित है। सौर गणना में उसके प्रभाव शामिल नहीं हैं।':language==='mr'?'अतिरिक्त यंत्रणा स्वतंत्र किमतीत प्रस्तावित आहे. सौर गणनेत तिचे परिणाम समाविष्ट नाहीत.':'An additional system is proposed and priced separately. Its effects on generation or consumption are not included in the solar calculations.');
    return script;
  }
  let host, state=null, stateKey='', language='en', mode='idle', revision=0, timer;
  let chunks=[], chunkIndex=0, pendingNext=false, currentUtterance=null;
  const synthesis=()=>root.speechSynthesis;
  const supported=()=>!!(synthesis() && root.SpeechSynthesisUtterance);
  /* Which voice families may read which language. Devanagari scripts are
     mutually legible to a TTS engine at the grapheme level, so Marathi and
     Hindi may stand in for each other - with the substitution stated on
     screen. Latin-script English is never read by, or used for, an Indic
     voice. */
  const VOICE_CHAIN={en:['en'],hi:['hi','mr'],mr:['mr','hi']};
  const normalize=v=>String(v?.lang||'').toLowerCase().replace(/_/g,'-');
  function voiceList(){ if(!supported()) return []; try{ return synthesis().getVoices()||[]; }catch(_){ return []; } }
  function voicePlan(lang) {
    const wanted=locales[lang]?lang:'en';
    if(!supported()) return {voice:null,exact:false,family:null};
    const voices=voiceList();
    for(const family of VOICE_CHAIN[wanted]) {
      const pool=voices.filter(v=>normalize(v).split('-')[0]===family);
      if(!pool.length) continue;
      /* Within the family, prefer the Indian locale and a locally installed
         voice over a region-less or network-only one. */
      const score=v=>Number(normalize(v)===locales[family].toLowerCase())*2+Number(!!v.localService);
      const best=pool.slice().sort((a,b)=>score(b)-score(a))[0];
      return {voice:best,exact:family===wanted,family};
    }
    return {voice:null,exact:false,family:null};
  }
  function voiceFor(lang) { return voicePlan(lang).voice; }
  function fallbackLanguage() {
    const order=language==='mr'?['hi','en']:language==='hi'?['mr','en']:[];
    for(const l of order) { if(voicePlan(l).exact) return l; }
    return null;
  }
  /* Some engines answer getVoices() with an empty list until the platform has
     finished enumerating them, and a few never fire voiceschanged at all. Say
     that voices are still being checked instead of reporting a missing voice
     that is merely late. */
  let voicesLoaded=false, voicesPoll=null, voicesGaveUp=false;
  function markVoices(){
    if(voicesLoaded) return true;
    if(voiceList().length){voicesLoaded=true;clearInterval(voicesPoll);voicesPoll=null;}
    return voicesLoaded;
  }
  /* Settled means the platform has answered: either a list arrived, or the
     wait is over and the honest answer is "this device has none". */
  function voicesSettled(){ return markVoices() || voicesGaveUp; }
  function watchVoices(){
    if(!supported()||voicesPoll) return;
    const deadline=Date.now()+10000;
    voicesPoll=setInterval(()=>{
      if(markVoices()||Date.now()>deadline){
        if(!voicesLoaded) voicesGaveUp=true;
        clearInterval(voicesPoll);voicesPoll=null;
        if(mode==='idle'){controls(availability());revealFallback();}
      }
    },250);
  }
  function availability() {
    if(!supported()) return 'Audio playback is not supported in this browser. You can read the briefing below.';
    markVoices();
    const plan=voicePlan(language);
    if(plan.voice && plan.exact) return 'Ready in '+names[language]+' · '+plan.voice.name+'. Press Play to begin.';
    if(plan.voice) return 'No '+names[language]+' voice is installed on this device — playback will use '+plan.voice.name+
      ' (a '+names[plan.family]+' voice, the closest available). The written '+names[language]+' briefing is below.';
    if(!voicesSettled()) return 'Checking the voices installed on this device… If nothing appears in a few seconds, press Check voices again.';
    const neither=language==='mr'?' — neither a Marathi nor a Hindi voice is installed':
                  language==='hi'?' — neither a Hindi nor a Marathi voice is installed':'';
    return names[language]+' voice unavailable in this browser on this device'+neither+
      '. Install a voice in the operating system (Windows: Settings → Time & language → Speech → Add voices), press Check voices again, or read the '+names[language]+' briefing below.';
  }
  function playingNote() {
    const plan=voicePlan(language);
    return plan.voice && !plan.exact
      ? 'Playing the '+names[language]+' text with a '+names[plan.family]+' voice · quotation values.'
      : 'Playing in '+names[language]+' · quotation values.';
  }
  function controls(message) {
    if(!host) return;
    const plan=voicePlan(language), alternate=fallbackLanguage();
    $('briefingPlay').disabled=mode!=='idle' || !plan.voice;
    $('briefingPause').disabled=!['playing','paused'].includes(mode);
    $('briefingPause').textContent=mode==='paused'?'Resume':'Pause';
    $('briefingStop').disabled=mode==='idle';
    /* The help block explains a substitute voice as well as a missing one. */
    if ($('briefingVoiceHelp')) $('briefingVoiceHelp').hidden = !!plan.exact;
    if ($('briefingRefresh')) $('briefingRefresh').disabled = !supported();
    if ($('briefingUseEnglish')) {
      $('briefingUseEnglish').hidden = plan.exact || !alternate;
      if (alternate) $('briefingUseEnglish').textContent = 'Switch to '+names[alternate]+' audio';
    }
    host.querySelectorAll('[data-briefing-language]').forEach(button => {
      const p=voicePlan(button.dataset.briefingLanguage);
      button.title = names[button.dataset.briefingLanguage] + (p.exact ? ': audio and written briefing available'
        : p.voice ? ': audio will use the closest installed voice ('+p.voice.name+'); written briefing available'
        : ': written briefing available; no matching browser voice');
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
    /* The voice decides the phonetic model, so a substitute speaks with its own
       locale rather than a locale whose voice the engine cannot find. */
    utterance.lang=voice.lang||locales[language]; utterance.voice=voice; utterance.rate=0.95;
    utterance.onstart=()=>{if(token!==revision)return;clearTimeout(timer);mode='playing';controls(playingNote());};
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
    const voice=voicePlan(language).voice; if(!voice) {controls(availability());return;}
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
    $('briefingRefresh')?.addEventListener('click',()=>{ markVoices(); controls(availability()); revealFallback(); });
    /* A manual re-check restarts the wait, so a slow platform can still answer. */
    $('briefingRefresh')?.addEventListener('click',()=>{ if(!voiceList().length){voicesGaveUp=false;watchVoices();} });
    /* The recovery button (legacy id) switches to whichever language can
       actually be spoken here — Hindi for a Marathi reader when that is what
       the device has, English otherwise. Language choice never autoplays. */
    $('briefingUseEnglish')?.addEventListener('click',()=>{
      const target=fallbackLanguage()||'en';
      stop(); language=target; updateTranscript();
    });
    $('briefingStop').addEventListener('click',()=>stop('Stopped. Press Play to restart from the beginning.'));
    $('briefingPause').addEventListener('click',()=>{
      if(mode==='playing') {synthesis().pause();mode='paused';controls('Paused. Resume or stop the briefing.');}
      else if(mode==='paused') {
        mode='playing'; synthesis().resume();controls(playingNote());
        if(pendingNext) {pendingNext=false;speakChunk(revision,voicePlan(language).voice);}
      }
    });
    // Closing the player must not leave hidden narration running.
    host.addEventListener('toggle',()=>{
      if(!host.open && mode!=='idle')stop();
      else if(host.open && mode==='idle') {controls(availability());revealFallback();}
    });
  }
  function revealFallback() {
    if (host?.open && !voicePlan(language).exact) host.querySelector('.briefing-transcript').open = true;
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
    markVoices();
    /* A substitute keeps the narration alive; only losing every usable voice
       stops it. */
    if(mode!=='idle' && !voicePlan(language).voice)stop('The selected voice is no longer available. Read the briefing or select another language.');
    else if(mode==='idle'){controls(availability());revealFallback();}
  });
  watchVoices();
  root.addEventListener('focus',()=>{if(mode==='idle')controls(availability());});
  root.addEventListener('pagehide',()=>stop());
  root.addEventListener('beforeprint',()=>stop());
  document.addEventListener('visibilitychange',()=>{if(document.hidden && mode!=='idle')stop('Stopped while this page was in the background. Press Play to restart.');});
  document.addEventListener('qs:rendered',sync);
  root.Briefing={scriptFor,voiceFor,voicePlan,fallbackLanguage,stop};
})(window);

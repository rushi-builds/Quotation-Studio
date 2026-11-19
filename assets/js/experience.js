/* Public gallery QR, isolated customer scenarios and the compact seven-page Power Proposal.
   No customer data is put in a QR URL; scenarios never write proposal state. */
'use strict';
(function(root) {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const F = root.Finance;
  const POWER_PAGE_COUNT = 7;
  const tariffNumber = value => Number.isFinite(Number(value)) ? Math.max(0,Number(value)) : 0;
  const payback = f => Number.isFinite(f.payback) ? f.payback.toFixed(1) + ' years' : 'Not reached within 25 years';
  function publicUrl(value) {
    try {
      const u = new URL(value);
      const h = u.hostname.toLowerCase();
      if (u.protocol !== 'https:' || u.username || u.password || u.href.length > 250 ||
          !h.includes('.') || /(^|\.)(localhost|local|test|invalid)$/.test(h) ||
          /^(127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.includes(':') ||
          /(^|\/)share\.html$/i.test(u.pathname)) return '';
      return u.href;
    } catch (_) { return ''; }
  }
  function galleryUrl(s) {
    // Never assume a deployment URL is public: Vercel previews can require login.
    // A customer-facing destination must be explicitly supplied and tested.
    return publicUrl(String(s.galleryUrl || '').trim());
  }
  function destinationCopy(s) {
    const copy = {
      gallery: {heading:'EXPLORE OUR PROJECTS', action:'Explore our projects ↗', detail:'Project photographs & available media', name:'project gallery'},
      video: {heading:'WATCH OUR PROJECTS', action:'Open video / playlist ↗', detail:'Watch on the linked video platform', name:'video or playlist'},
      website: {heading:'VISIT OUR WEBSITE', action:'Visit our website ↗', detail:'Explore the linked company website', name:'company website'},
      custom: {heading:'OPEN YOUR LINK', action:'Open the link ↗', detail:'Opens your linked destination', name:'linked destination'}
    };
    return copy[s.qrDestinationType] || copy.gallery;
  }
  function portfolioDestination(s) {
    /* The deployment that serves this page also serves gallery.html
       (platform/cloudflare/wrangler.git.toml, sync-public.js), so the printed
       QR points at the public gallery there rather than an older personal
       Worker host. */
    return galleryUrl(s)||(!String(s.galleryUrl||'').trim()?'https://qs-studio-rushi.ktmenergyexperts.workers.dev/gallery.html':'');
  }
  /* Tap-cursor line icon with ripple arcs (stroke-only, transparent background). */
  const TAP_ICON = '<svg class="tap-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M16.4 10.4a3 3 0 0 1 3-3" opacity=".9"/><path d="M13.8 10.4a5.6 5.6 0 0 1 5.6-5.6" opacity=".55"/><path d="M11.2 10.4a8.2 8.2 0 0 1 8.2-8.2" opacity=".3"/>'
    + '<path d="M4.4 3.2 19.4 10.4l-6.6 2.6-2.6 6.6z"/></svg>';
  function portfolioCard(s) {
    const url=portfolioDestination(s);
    return url?'<div class="portfolio-link power-portfolio-link"><div><span>THE KTM PROJECT PORTFOLIO</span><h2>See our work in detail.</h2><p>Explore installation photographs and available project media.</p><a class="tap-link" href="'+esc(url)+'">'+TAP_ICON+'<span>Click here to explore our projects</span></a></div><a class="power-gallery" href="'+esc(url)+'"><canvas width="320" height="320"></canvas><span>Scan to explore</span></a></div>':'';
  }
  let projectsReady=Promise.resolve(),allQrReady=Promise.resolve(),projectsRevision=0;
  function renderProjectsGallery(s) {
    const host=$('projectsPortfolio');if(!host)return;
    const html=portfolioCard(s);
    if(host.dataset.markup===html)return;
    host.dataset.markup=html;host.innerHTML=html;
    const revision=++projectsRevision,target=host.querySelector('canvas'),url=portfolioDestination(s);
    projectsReady=new Promise(resolve=>{
      if(!target||!root.QRCode){resolve();return;}
      const canvas=document.createElement('canvas');
      try {root.QRCode.toCanvas(canvas,url,{width:320,margin:4,errorCorrectionLevel:'M'},error=>{
        if(!error&&revision===projectsRevision){target.width=canvas.width;target.height=canvas.height;target.getContext('2d').drawImage(canvas,0,0);}
        resolve();
      });}catch(_){resolve();}
    });
  }
  let qrReady = Promise.resolve(), qrRevision = 0;
  function renderGallery(s) {
    const card = $('closingGallery');
    if (!card) return;
    const url = galleryUrl(s), status = $('galleryStatus'), copy = destinationCopy(s);
    card.querySelector('span').textContent=copy.heading;
    card.querySelector('strong').textContent=copy.action;
    card.querySelector('small').textContent=copy.detail;
    card.setAttribute('aria-label','Open '+copy.name);
    if (status) status.textContent = url ? 'QR opens '+copy.name+': '+url : '';
    if (card.dataset.destination === url && !card.hidden) return;
    const revision = ++qrRevision;
    card.hidden = true; card.removeAttribute('href'); card.dataset.destination = url;
    card.closest('.closing-banner').classList.remove('has-gallery');
    if (!url || !root.QRCode) { qrReady = Promise.resolve(); return; }
    // Draw off-DOM first so stale asynchronous callbacks cannot publish the wrong QR.
    qrReady = new Promise(resolve => {
      const canvas = document.createElement('canvas');
      try {
        root.QRCode.toCanvas(canvas, url, {width:320,margin:4,errorCorrectionLevel:'M',color:{dark:'#071A2E',light:'#FFFFFF'}}, error => {
          if (revision === qrRevision && !error) {
            const target = card.querySelector('canvas'); target.width=canvas.width; target.height=canvas.height;
            target.getContext('2d').drawImage(canvas,0,0);
            card.href=url; card.hidden=false; card.closest('.closing-banner').classList.add('has-gallery');
          }
          if (error && status && revision===qrRevision) status.textContent='QR could not be generated. Check or shorten the gallery URL.';
          resolve();
        });
      } catch (_) { resolve(); }
    });
  }
  let scenarioState = null, scenarioKey = '';
  function drawScenario(tariff) {
    if (!scenarioState) return;
    const f=F.compute({...scenarioState,tariff:String(tariff)}), base=F.compute(scenarioState);
    $('scenarioRate').textContent='₹'+Number(tariff).toFixed(2)+' / kWh';
    $('scenarioSaving').textContent=F.fmtINRshort(f.lifetimeSaving);
    $('scenarioPayback').textContent=payback(f);
    $('scenarioOriginal').textContent='Quotation tariff: ₹'+tariffNumber(scenarioState.tariff).toFixed(2)+' / kWh · estimated 25-year savings '+F.fmtINRshort(base.lifetimeSaving);
    const max=Math.max(1,...f.series.cumSaving,...base.series.cumSaving);
    const points=values=>['20,126',...values.map((v,i)=>(20+(i+1)*560/25).toFixed(1)+','+(126-v/max*108).toFixed(1))].join(' ');
    $('scenarioChart').innerHTML='<title>Estimated cumulative savings over 25 years</title><path d="M20 18V126H580" fill="none" stroke="#D9E2EA"/><polyline points="'+points(base.series.cumSaving)+'" fill="none" stroke="#7890A3" stroke-width="2" stroke-dasharray="5 4"/><polyline points="'+points(f.series.cumSaving)+'" fill="none" stroke="#F7941D" stroke-width="3"/><text x="20" y="148" font-size="10" fill="#64788A">Year 0</text><text x="548" y="148" font-size="10" fill="#64788A">Year 25</text>';
  }
  function renderScenario(s) {
    const host=$('savingsExplorer'); if(!host) return;
    const key=JSON.stringify(s); if(key===scenarioKey) return;
    scenarioKey=key; scenarioState=JSON.parse(key);
    const tariff=tariffNumber(s.tariff);
    host.hidden=false;
    host.innerHTML='<div class="experience-eyebrow">EXPLORE, WITHOUT CHANGING YOUR QUOTATION</div><h2 id="scenarioTitle">What if your electricity tariff changes?</h2><p>Move the slider to compare estimated savings. Your saved proposal and both PDF formats remain at the quotation tariff.</p><div class="scenario-controls"><label for="scenarioTariff">Electricity tariff <strong id="scenarioRate"></strong></label><button id="scenarioReset" type="button">Reset to quotation</button></div><input id="scenarioTariff" type="range" step="0.01" aria-label="Scenario electricity tariff in rupees per kWh"><div class="scenario-results" aria-live="polite" aria-atomic="true"><div><span>Estimated 25-year savings</span><strong id="scenarioSaving"></strong></div><div><span>Estimated payback</span><strong id="scenarioPayback"></strong></div></div><svg id="scenarioChart" viewBox="0 0 600 156" role="img" aria-label="Quotation and scenario cumulative savings"></svg><div class="scenario-legend"><span>- Scenario</span><span>┄ Quotation</span></div><p id="scenarioOriginal"></p><small>Same generation, escalation and degradation assumptions as your proposal. Savings are modelled energy value, not a guaranteed bill reduction or investment return. Fixed charges, settlement rules and site performance affect actual results.</small>';
    const slider=$('scenarioTariff'); slider.min=String(Math.min(10,tariff)); slider.max=String(Math.max(18,tariff)); slider.value=String(tariff);
    slider.addEventListener('input',()=>drawScenario(slider.value));
    $('scenarioReset').addEventListener('click',()=>{slider.value=String(tariff);drawScenario(tariff);});
    drawScenario(tariff);
  }
  function sync() {
    const s=root.Render?.lastState; if(!s) return;
    renderGallery(s); renderProjectsGallery(s); allQrReady=Promise.all([qrReady,projectsReady]); renderScenario(s);
    root.Exporter?.updateLabel?.();
  }
  const row=(label,value)=>'<div class="power-row"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';
  const metric=(label,value,detail)=>'<div class="power-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></div>';
  // These charts consume the existing Finance series; no second projection model.
  function powerChart(values, label, money, bars, reference) {
    const data=values.map(v=>Number.isFinite(v)?v:0), W=680,H=172,L=62,R=18,T=16,B=27;
    const min=Math.min(0,...data), max=Math.max(1,...data,Number.isFinite(reference)&&reference>0?reference:0);
    const x=i=>L+(W-L-R)*i/Math.max(1,data.length-1), y=v=>T+(H-T-B)*(max-v)/(max-min);
    const tick=v=>money?F.fmtINRshort(v):F.fmtNum(v);
    let drawing='';
    for(let i=0;i<=3;i++) {const v=min+(max-min)*i/3,yy=y(v);drawing+='<path d="M'+L+' '+yy+'H'+(W-R)+'" stroke="#e3e9ef"/><text x="'+(L-8)+'" y="'+(yy+3)+'" text-anchor="end" font-size="9" fill="#64788a">'+esc(tick(v))+'</text>';}
    if(bars) {
      const slot=(W-L-R)/Math.max(1,data.length);
      data.forEach((v,i)=>{const top=Math.min(y(0),y(v));drawing+='<rect x="'+(L+i*slot+slot*.2)+'" y="'+top+'" width="'+(slot*.6)+'" height="'+Math.max(.5,Math.abs(y(v)-y(0)))+'" rx="2" fill="'+(i===0?'#F7941D':'#17354A')+'"/>';});
    } else {
      const points=data.map((v,i)=>x(i)+','+y(v)).join(' ');
      drawing+='<polygon points="'+L+','+y(0)+' '+points+' '+(W-R)+','+y(0)+'" fill="#fff1df"/><polyline points="'+points+'" fill="none" stroke="#e3851c" stroke-width="2.5"/>';
    }
    if(Number.isFinite(reference)&&reference>0) drawing+='<path d="M'+L+' '+y(reference)+'H'+(W-R)+'" stroke="#64788a" stroke-width="1.4" stroke-dasharray="5 4"/>';
    [0,4,9,14,19,24].filter(i=>i<data.length).forEach(i=>{const xx=bars?L+(W-L-R)*(i+.5)/data.length:x(i);drawing+='<text x="'+xx+'" y="'+(H-7)+'" text-anchor="middle" font-size="9" fill="#64788a">Yr '+(i+1)+'</text>';});
    return '<svg class="power-series-chart" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+esc(label)+'" data-series="'+data.join(',')+'"><title>'+esc(label)+'</title>'+drawing+'</svg>';
  }
  /* Seven A4 sheets extracted from the Detailed Proposal. The original pages are
     cloned, preserving their artwork and shared chrome; only the page-4 extract is
     composed inside its clone from EPC Scope and Warranty source content. */
  const POWER_BASE_PAGES=['pageCover','pageSolution','pageTechSpec','pageScope','pageSavings','pageInvestment','pageClosing'];
  const POWER_STYLE_PAGES=[...POWER_BASE_PAGES];
  function powerSourcePages(){return [...POWER_BASE_PAGES];}
  function prepareScopeWarrantySheet(copy){
    const body=copy.querySelector('.pg-body'),intro=body?.querySelector('.intro-col');
    if(!body||!intro)throw new Error('Scope, Warranty & Handover source sheet is incomplete.');
    copy.classList.add('power-scope-warranty');
    /* The source-page value band repeats scope/handover language and occupies the
       lower content area. Drop it only from this composed clone to make room for
       the source proposal's concrete pre-handover checks; the original stays intact. */
    copy.querySelector('.proposal-value-footer')?.remove();
    intro.querySelector('.pg-title').textContent='Scope, Warranty & Handover';
    intro.querySelector('.pg-sub').textContent='Clear inclusions. Transparent coverage. Guided delivery.';
    intro.querySelector('.body-para').textContent='A concise guide to the EPC work, equipment warranties and customer inputs for this proposal. Final project-specific inclusions and exclusions are confirmed in the agreed quotation.';
    body.replaceChildren(intro);
    const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
    const section=(label,className,gridClass)=>{const wrap=make('section','sw-section '+className),heading=make('div','sec-label sw-section-label',label),grid=make('div',gridClass);wrap.append(heading,grid);body.appendChild(wrap);return grid;};
    const scopeCards=[
      ['Equipment supply','Solar modules, inverter, mounting structure and balance of system.'],
      ['Engineering & installation','Site engineering, system design and rooftop installation.'],
      ['Electrical safety','Electrical works, earthing and lightning protection.'],
      ['Testing & commissioning','System checks, grid synchronisation and commissioning.'],
      ['Net metering & subsidy process','Application assistance; approvals and benefits remain subject to the DISCOM and applicable scheme.'],
      ['Handover & customer training','System handover, operating guidance and customer training.']
    ];
    const scope=section('TURNKEY EPC SCOPE','sw-scope-section','sw-scope-grid');
    scopeCards.forEach(([title,detail],i)=>{const card=make('article','sw-card sw-scope-card'),number=make('span','sw-number',String(i+1).padStart(2,'0')),copyText=make('div','sw-card-copy');copyText.append(make('h3','sw-card-title',title),make('p','sw-card-detail',detail));card.append(number,copyText);scope.appendChild(card);});
    const warranties=section('WARRANTY COVERAGE','sw-warranty-section','sw-warranty-grid');
    CONTENT.pageWarranty.warranties.forEach((item,i)=>{const card=make('article','sw-card sw-warranty-card'),number=make('span','sw-warranty-icon',String(i+1).padStart(2,'0')),copyText=make('div','sw-card-copy');copyText.append(make('h3','sw-card-title',item.title),make('p','sw-card-detail',item.b1),make('p','sw-card-detail sw-muted',item.b2));card.append(number,copyText);warranties.appendChild(card);});
    const milestones=[
      ['Order & site survey','Agreement · access · project kickoff'],
      ['Engineering & approvals','Survey · drawings · DISCOM process'],
      ['Material delivery','Modules · inverter · balance of system'],
      ['Installation','Structure · modules · electrical works'],
      ['Testing & commissioning','Safety checks · grid synchronisation'],
      ['Metering & handover','Metering process · walkthrough · training']
    ];
    const journey=section('FROM ORDER TO HANDOVER','sw-journey-section','sw-journey-grid');
    milestones.forEach(([title,detail],i)=>{const card=make('article','sw-card sw-journey-card'),step=make('span','sw-step',String(i+1).padStart(2,'0')),copyText=make('div','sw-card-copy');copyText.append(make('h3','sw-card-title',title),make('p','sw-card-detail',detail));card.append(step,copyText);journey.appendChild(card);});
    const quality=section(CONTENT.pageQuality.checklistLabel,'sw-quality-section','sw-quality-grid');
    CONTENT.pageQuality.checklist.slice(0,4).forEach((item,i)=>{const card=make('article','sw-card sw-quality-card'),step=make('span','sw-quality-mark',String(i+1).padStart(2,'0')),copyText=make('div','sw-card-copy');copyText.append(make('h3','sw-card-title',item.title),make('p','sw-card-detail',item.desc));card.append(step,copyText);quality.appendChild(card);});
    body.appendChild(make('p','sw-legal-note','Customer: safe roof access, structurally adequate roof, utilities and permissions; internet/service access may be needed. Structural or load upgrades, extra internal electrical work and DISCOM statutory charges/deposits are excluded unless listed. Warranty follows OEM/agreed terms; metering and subsidy remain subject to authority approval.'));
    const values=make('aside','sw-value-row');
    values.setAttribute('aria-label','Project commitments');
    const valueItems=[['doc','Defined scope'],['gear','Careful installation'],['check','Clear handover'],['users','Agreed responsibilities']];
    valueItems.forEach(([icon,label],i)=>{const item=make('div','sw-value-item'),mark=make('span','sw-value-mark'),text=make('span','sw-value-label',label);mark.setAttribute('aria-hidden','true');mark.innerHTML=root.ProposalMarks?.get(icon,23,['warm','sage','lavender','blue'][i])||'';item.append(mark,text);values.appendChild(item);});
    body.appendChild(values);
  }
  function buildPowerPages(s) {
    const sourcePages=powerSourcePages(s);
    const host=document.createElement('div');
    host.className='pdf-snapshot power-proposal-snapshot';
    host.setAttribute('aria-hidden','true');
    /* Several reference stylesheets scope rules to their source page ID. These
       aliases preserve those exact rules without duplicate IDs in the live document. */
    const rewrite=selector=>POWER_STYLE_PAGES.reduce((text,id)=>
      text.replace(new RegExp('#'+id+'(?![\\w-])','g'),':is(#'+id+', [data-source-page="'+id+'"])'),selector);
    const collect=rules=>{
      let css='';
      for(const rule of rules){
        try{
          if(rule.type===1){
            if(POWER_STYLE_PAGES.some(id=>new RegExp('#'+id+'(?![\\w-])').test(rule.selectorText)))
              css+=rewrite(rule.selectorText)+'{'+rule.style.cssText+'}';
          }else if(rule.cssRules){
            const nested=collect(rule.cssRules);
            if(nested){const brace=rule.cssText.indexOf('{');css+=rule.cssText.slice(0,brace)+'{'+nested+'}';}
          }
        }catch(e){/* A cross-origin @import must not discard later local rules. */}
      }
      return css;
    };
    const aliases=[];
    for(const sheet of document.styleSheets){try{aliases.push(collect(sheet.cssRules));}catch(e){/* Ignore inaccessible third-party stylesheets. */}}
    const aliasStyle=document.createElement('style');
    aliasStyle.dataset.powerSourceAliases='';
    aliasStyle.textContent=aliases.join('\n');
    sourcePages.forEach((sourceId,index)=>{
      const source=$(sourceId);
      if(!source)throw new Error('Power Proposal source page is missing: '+sourceId);
      const copy=source.cloneNode(true);
      copy.id='powerPage'+(index+1);
      copy.classList.add('power-page','power-clone');
      copy.dataset.sourcePage=sourceId;
      copy.dataset.powerIndex=String(index+1);
      copy.style.transform='none';
      copy.style.margin='0';
      copy.querySelectorAll('[data-head-ref],[data-foot-company],[data-foot-tagline]').forEach(node=>{
        node.removeAttribute('data-head-ref');node.removeAttribute('data-foot-company');node.removeAttribute('data-foot-tagline');
      });
      copy.querySelectorAll('img[data-print-src]').forEach(img=>{
        img.src=img.getAttribute('data-print-src');img.removeAttribute('srcset');img.removeAttribute('sizes');
      });
      copy.querySelectorAll('canvas').forEach((canvas,i)=>{
        const original=source.querySelectorAll('canvas')[i];
        if(original?.width&&original?.height)try{canvas.getContext('2d').drawImage(original,0,0);}catch(e){}
      });
      if(sourceId==='pageScope')prepareScopeWarrantySheet(copy);
      const number=copy.querySelector('.pf-right');
      if(number)number.textContent='Page '+(index+1)+' of '+POWER_PAGE_COUNT;
      host.appendChild(copy);
    });
    /* Keep helper CSS inside the first extracted sheet, not as a pseudo-page at
       the snapshot root; the document editor and PDF exporter both enumerate pages. */
    host.querySelector('.power-page')?.prepend(aliasStyle);
    document.body.appendChild(host);
    return host;
  }
  document.addEventListener('qs:rendered',sync);
  root.Experience={POWER_PAGE_COUNT,publicUrl,galleryUrl,destinationCopy,buildPowerPages,sync,whenReady:()=>allQrReady};
})(window);

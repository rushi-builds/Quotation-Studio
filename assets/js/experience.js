/* Public gallery QR, isolated customer scenarios and an optional two-page brief.
   No customer data is put in a QR URL; scenarios never write proposal state. */
'use strict';
(function(root) {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const F = root.Finance;
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
      website: {heading:'VISIT OUR WEBSITE', action:'Visit our website ↗', detail:'Explore the linked company website', name:'company website'}
    };
    return copy[s.qrDestinationType] || copy.gallery;
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
    if (status) status.textContent = url ? 'QR opens '+copy.name+': '+url : 'QR setup ready. Add a public HTTPS destination later; no placeholder is printed.';
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
    host.innerHTML='<div class="experience-eyebrow">EXPLORE, WITHOUT CHANGING YOUR QUOTATION</div><h2 id="scenarioTitle">What if your electricity tariff changes?</h2><p>Move the slider to compare estimated savings. Your saved proposal and both PDF formats remain at the quotation tariff.</p><div class="scenario-controls"><label for="scenarioTariff">Electricity tariff <strong id="scenarioRate"></strong></label><button id="scenarioReset" type="button">Reset to quotation</button></div><input id="scenarioTariff" type="range" step="0.01" aria-label="Scenario electricity tariff in rupees per kWh"><div class="scenario-results" aria-live="polite" aria-atomic="true"><div><span>Estimated 25-year savings</span><strong id="scenarioSaving"></strong></div><div><span>Estimated payback</span><strong id="scenarioPayback"></strong></div></div><svg id="scenarioChart" viewBox="0 0 600 156" role="img" aria-label="Quotation and scenario cumulative savings"></svg><div class="scenario-legend"><span>— Scenario</span><span>┄ Quotation</span></div><p id="scenarioOriginal"></p><small>Same generation, escalation and degradation assumptions as your proposal. Savings are modelled energy value, not a guaranteed bill reduction or investment return. Fixed charges, settlement rules and site performance affect actual results.</small>';
    const slider=$('scenarioTariff'); slider.min=String(Math.min(10,tariff)); slider.max=String(Math.max(18,tariff)); slider.value=String(tariff);
    slider.addEventListener('input',()=>drawScenario(slider.value));
    $('scenarioReset').addEventListener('click',()=>{slider.value=String(tariff);drawScenario(tariff);});
    drawScenario(tariff);
  }
  function sync() {
    const s=root.Render?.lastState; if(!s) return;
    renderGallery(s); renderScenario(s);
    root.Exporter?.updateLabel?.();
  }
  const row=(label,value)=>'<div class="power-row"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';
  const metric=(label,value,detail)=>'<div class="power-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></div>';
  function buildPowerPages(s) {
    const f=F.compute(s), url=galleryUrl(s), destination=destinationCopy(s);
    const battery=root.Bess.compute(s,f),hasBattery=root.Bess.included(s);
    const storageNote=hasBattery?'<p class="power-note power-storage"><strong>Optional storage:</strong> '+esc(s.bessMake||'Model pending')+' · '+(battery.capacity!==null?esc(battery.capacity)+' kWh':'Capacity pending')+' · '+(battery.power!==null?esc(battery.power)+' kW':'Output pending')+'. Additional installed price: '+(battery.cost!==null?esc(F.fmtINR(battery.cost)):'not entered')+'. Solar prices, savings and milestones below exclude storage. Refer to the two battery pages in the detailed proposal; backup design and separate storage terms require confirmation.</p>':'';
    const host=document.createElement('div'); host.className='pdf-snapshot'; host.setAttribute('aria-hidden','true');
    const header=n=>'<header class="power-head"><img src="assets/images/ktm-logo-light.png" alt="Company logo"><div>POWER PROPOSAL · '+n+' / 2<br><span>'+esc(s.propRef)+' · v'+esc(s.propVersion)+'</span></div></header>';
    const foot=n=>'<footer class="power-foot"><span>'+esc(s.companyName)+' · '+esc(s.companyPhone)+'</span><span>Power Proposal · '+n+' / 2</span></footer>';
    const diagram=$('v_tsDiagram')?.innerHTML.replace(/qs-system|qs-metal|qs-panels|qs-dc-arrow|qs-ac-arrow/g, m=>'power-'+m) || '';
    const photo=$('img_solution')?.getAttribute('src') || 'assets/images/page-solution.jpg';
    const valid=F.fmtDate(F.addDays(s.propDate,s.validityDays)) || 'To be confirmed';
    const scope=CONTENT.pageScope;
    const scopeList=(items)=>'<ul>'+items.map(item=>'<li>'+esc(item.title)+'</li>').join('')+'</ul>';
    const refs=[['PVsyst report',s.pvsystUrl],['Arka layout',s.arkaUrl]].filter(([,u])=>root.Render.safeHttpUrl(u)).map(([label,u])=>'<a href="'+esc(root.Render.safeHttpUrl(u))+'">'+label+' ↗</a>').join(' · ');
    host.innerHTML='<section class="page power-page" id="powerPage1">'+header(1)+'<div class="power-kicker">YOUR SOLAR PROJECT, AT A GLANCE</div><h1>A clearer path to solar.</h1><div class="power-customer"><strong>'+esc(s.custName)+'</strong><span>'+esc(s.custAddress)+'</span></div><div class="power-hero"><div><span>PROPOSED SYSTEM</span><strong>'+esc(f.capacity)+' <small>kWp</small></strong><p>'+esc(f.moduleCount)+' × '+esc(f.moduleWattage)+' Wp modules<br>'+esc(f.inverterKw)+' kW inverter</p></div><img src="'+esc(photo)+'" alt="Illustrative solar installation"></div><p class="power-caption">Installation image is illustrative; final layout follows site engineering.</p><div class="power-metrics">'+metric(hasBattery?'Solar-only net investment':'Estimated net investment',F.fmtINR(f.netInvestment),'After estimated subsidy, if applicable')+metric('Estimated annual generation',F.fmtNum(f.annualGen)+' kWh','Year 1 · site verification required')+metric('Estimated 25-year savings',F.fmtINRshort(f.lifetimeSaving),'Modelled energy value, before investment')+metric('Estimated payback',payback(f),'Based on the proposal assumptions')+'</div><h2>How your system connects</h2><div class="power-diagram">'+diagram+'</div><div class="power-assumptions">'+row('Tariff / annual escalation','₹'+s.tariff+' per kWh / '+s.escalation+'%')+row('Generation basis / annual degradation',s.genFactor+' kWh/kWp/year / '+s.degradation+'%')+'</div><p class="power-note">Conceptual grid-tied flow, not an installation wiring plan. Actual output and bill savings depend on shading, site conditions, consumption and DISCOM settlement; fixed charges may remain.</p>'+foot(1)+'</section>'+
      '<section class="page power-page'+(hasBattery?' power-with-storage':'')+'" id="powerPage2">'+header(2)+'<div class="power-kicker">EQUIPMENT · INVESTMENT · NEXT STEPS</div><h1>The basis of your proposal.</h1>'+storageNote+'<div class="power-columns"><section><h2>Selected equipment</h2>'+row('Modules',s.moduleMake)+row('Technology',s.moduleTech)+row('Inverter',s.inverterMake)+row('Structure',s.mountMake)+row('Cabling',s.cableMake)+row('Roof',s.roofType)+'</section><section class="power-cost"><h2>Investment overview</h2>'+row('Project cost before GST',F.fmtINR(f.projectCost))+row('GST ('+f.gstPercent+'%)',F.fmtINR(f.gstAmount))+row('Total including GST',F.fmtINR(f.grossTotal))+row('Estimated subsidy — not approved',F.fmtINR(f.subsidy))+'<div class="power-total">Estimated net investment<strong>'+esc(F.fmtINR(f.netInvestment))+'</strong></div><small>Subsidy eligibility, approval and disbursement are subject to the applicable scheme and authority.</small></section></div><h2>Payment milestones</h2><p class="power-caption">Calculated on the total including GST; displayed amounts are rounded.</p><div class="power-pay">'+['advance','dispatch','completion'].map(key=>{const p=f.pay[key];return metric(key[0].toUpperCase()+key.slice(1),p.pct+'%',F.fmtINR(p.amount));}).join('')+'</div>'+(Math.abs(f.pay.sumPct-100)>.001?'<p class="power-note power-warning">Payment schedule totals '+esc(f.pay.sumPct)+'%. Confirm percentages totalling 100% before approval.</p>':'')+'<div class="power-columns power-scope"><section><h2>Scope highlights</h2>'+scopeList(scope.deliverables)+'</section><section><h2>Additional scope, if required</h2>'+scopeList(scope.addl)+'</section></div><div class="power-terms">'+row('Proposal date / valid until',F.fmtDate(s.propDate)+' / '+valid)+row('Indicative delivery',s.durationText)+row('Jurisdiction',s.jurisdiction)+(refs?'<div class="power-refs">Supplied engineering references: '+refs+'</div>':'')+'</div><p class="power-note"><strong>Warranty highlights:</strong> '+esc(CONTENT.pageWarranty.warranties.map(w=>w.title+': '+w.b1).join(' · '))+'. Subject to OEM and agreed project terms.</p><div class="power-next"><div><h2>Review → discuss → confirm scope</h2><p>Contact '+esc(s.companyName)+' to request a site review and agree engineering scope, fees and timing.</p><strong>'+esc(s.companyPhone)+'</strong><p>'+esc(s.companyEmail)+'</p></div>'+(url?'<a class="power-gallery" href="'+esc(url)+'"><canvas width="320" height="320"></canvas><span>'+esc(destination.action)+'</span></a>':'')+'</div><p class="power-note">Summary only, not an installation order. Read the detailed proposal for complete scope, exclusions, warranties, payment terms and any financing or alternative-system illustrations. Approvals, subsidies, generation, savings and zero bills are not guaranteed.</p>'+foot(2)+'</section>';
    if(root.AdditionalSystems.included(s)){const note=document.createElement('p');note.className='power-note power-storage';note.textContent='Additional system: '+(s.systemName||'Custom system')+' — separately priced at '+(root.AdditionalSystems.price(s)!==null?F.fmtINR(root.AdditionalSystems.price(s)):'price to be confirmed')+'. Not included in the solar totals or savings. Refer to the system supplement for scope and engineering conditions.';host.querySelector('#powerPage2 h1').after(note);host.querySelector('#powerPage2').classList.add('power-with-storage','power-with-multiple');}
    document.body.appendChild(host);
    // A modest amount of flexibility for genuinely longer equipment/terms copy.
    host.querySelectorAll('.power-page').forEach(page=>{
      if(page.lastElementChild.previousElementSibling.getBoundingClientRect().bottom>page.querySelector('footer').getBoundingClientRect().top-8) page.classList.add('power-compact');
    });
    const canvas=host.querySelector('.power-gallery canvas');
    if(canvas && url && root.QRCode) {
      root.QRCode.toCanvas(canvas,url,{width:320,margin:4,errorCorrectionLevel:'M'});
      canvas.style.width='94px'; canvas.style.height='94px';
    }
    return host;
  }
  document.addEventListener('qs:rendered',sync);
  root.Experience={publicUrl,galleryUrl,destinationCopy,buildPowerPages,sync,whenReady:()=>qrReady};
})(window);

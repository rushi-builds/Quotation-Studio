/* Public gallery QR, isolated customer scenarios and an optional five-page Power Proposal.
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
      website: {heading:'VISIT OUR WEBSITE', action:'Visit our website ↗', detail:'Explore the linked company website', name:'company website'},
      custom: {heading:'OPEN YOUR LINK', action:'Open the link ↗', detail:'Opens your linked destination', name:'linked destination'}
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
    renderGallery(s); renderScenario(s);
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
  function buildPowerPages(s) {
    const f=F.compute(s),url=galleryUrl(s),destination=destinationCopy(s);
    const hasBattery=root.Bess.included(s),hasSystem=root.AdditionalSystems.included(s),separate=hasBattery||hasSystem;
    const battery=root.Bess.compute(s,f),safe=v=>esc(v==null||v===''?'To be confirmed':v);
    const precise=v=>Number.isFinite(v)?v.toLocaleString('en-IN',{maximumFractionDigits:3}):'-';
    const paybackText=f.netInvestment<=0?'Not applicable':payback(f);
    const header=n=>'<header class="power-head"><img src="assets/images/ktm-logo-light.png" alt="Company logo"><div>POWER PROPOSAL · '+n+' / 5<br><span>'+esc(s.propRef)+' · v'+esc(s.propVersion)+'</span></div></header>';
    const foot=n=>'<footer class="power-foot"><span>'+esc(s.companyName)+' · '+esc(s.companyPhone)+'</span><span>Power Proposal · '+n+' / 5</span></footer>';
    const page=(n,kicker,title,lead,body)=>'<section class="page power-page power-five" id="powerPage'+n+'">'+header(n)+'<div class="power-kicker">'+kicker+'</div><h1>'+title+'</h1><p class="power-lead">'+lead+'</p><div class="power-body">'+body+'</div>'+foot(n)+'</section>';
    const diagram=$('v_tsDiagram')?.innerHTML.replace(/qs-system|qs-metal|qs-panels|qs-dc-arrow|qs-ac-arrow/g,m=>'power-'+m)||'';
    const photo=['commercial','industrial','rwa'].includes(s.customerType)?'assets/images/cover-'+s.customerType+'-scene.jpg':($('img_solution')?.getAttribute('src')||'assets/images/page-solution.jpg');
    const valid=F.fmtDate(F.addDays(s.propDate,s.validityDays))||'To be confirmed';
    const scope=CONTENT.pageScope,warranty=CONTENT.pageWarranty;
    const list=items=>'<ul>'+items.map(item=>'<li>'+esc(item.title)+'</li>').join('')+'</ul>';
    const refs=[['PVsyst report',s.pvsystUrl],['Arka layout',s.arkaUrl]].filter(([,u])=>root.Render.safeHttpUrl(u)).map(([label,u])=>'<a href="'+esc(root.Render.safeHttpUrl(u))+'">'+label+' ↗</a>').join(' · ');
    const manual=s.subsidyOverride!==''&&s.subsidyOverride!=null&&Number.isFinite(parseFloat(s.subsidyOverride));
    const subsidyNote=s.customerType==='rwa'
      ? 'RWA/GHS: ₹18,000 per eligible installed DC kWp; capped at 500 kWp and 3 kWp per house, inclusive of individual resident rooftop systems. '+(f.rwaEligibilityConfirmed?'Entered eligible capacity: '+precise(f.rwaEligibleKwp)+' kWp; preparer-supplied, not authority approval.':'Provisional estimate: household count and individual rooftop allowance still require verification.')
      : s.customerType==='residential'?'Residential subsidy is an estimate on installed DC capacity, subject to scheme eligibility, approved equipment and DISCOM verification.'+(f.stateTopUp>0?' Entered state top-up: '+F.fmtINR(f.stateTopUp)+'; eligibility and approval must be verified.':''):'No automatic central residential subsidy is applied to this customer category.';
    const qualification=(manual?'Manual subsidy override: '+F.fmtINR(f.subsidy)+'. ':'')+subsidyNote;
    const investmentWarning=f.netInvestment<0?'<p class="power-note power-warning">The entered subsidy exceeds the gross price. Negative net investment is not a promised payout; verify the override before issuing this quotation.</p>':'';
    const optional=(hasBattery?'<div class="power-supplement"><strong>Optional battery storage · separately priced</strong><p>'+safe(s.bessMake)+' · '+(battery.capacity!==null?esc(battery.capacity)+' kWh':'Capacity pending')+' · '+(battery.power!==null?esc(battery.power)+' kW':'Output pending')+' · '+(battery.cost!==null?F.fmtINR(battery.cost):'Price to be confirmed')+'. Backup compatibility and installation terms require confirmation. Refer to the Storage Assessment.</p></div>':'')+(hasSystem?'<div class="power-supplement"><strong>Additional system · separately priced</strong><p>'+safe(s.systemName)+' · '+(root.AdditionalSystems.price(s)!==null?F.fmtINR(root.AdditionalSystems.price(s)):'Price to be confirmed')+'. Refer to the system supplement for scope, exclusions and engineering conditions.</p></div>':'');
    const host=document.createElement('div');host.className='pdf-snapshot';host.setAttribute('aria-hidden','true');
    host.innerHTML=
      page(1,'01 / PROJECT OVERVIEW','Your roof. Your energy.','A considered rooftop solar proposal, built around your selected system and site assumptions.',
        '<div class="power-customer"><strong>'+safe(s.custName)+'</strong><span>'+safe(s.custAddress)+'</span></div>'+
        '<div class="power-hero"><div><span>PROPOSED SYSTEM</span><strong>'+precise(f.capacity)+' <small>kWp</small></strong><p>'+f.moduleCount+' × '+precise(f.moduleWattage)+' Wp modules<br>'+precise(f.inverterKw)+' kW inverter</p><span>DESIGN · SUPPLY · INSTALLATION</span></div><img src="'+esc(photo)+'" alt="Illustrative solar architecture; not a verified project photograph"></div><p class="power-caption">Illustrative architecture. The final equipment layout follows site and structural verification.</p>'+
        '<div class="power-metrics">'+metric('Installed solar capacity',precise(f.installedKwp)+' kWp','Actual whole-module DC array')+metric('Average monthly generation',F.fmtNum(f.annualGen/12)+' kWh','Year-one average, not a seasonal forecast')+metric('Year-one generation',F.fmtNum(f.annualGen)+' kWh','Based on the entered yield assumption')+metric('25-year generation',precise(f.lifetimeGen/1000)+' MWh','Includes the entered annual degradation')+'</div>'+
        '<div class="power-highlight"><strong>24/7 remote monitoring access</strong><span>With compatible equipment, power and internet. Not staffed support.</span></div>'+
        '<h2>A complete proposal in five pages</h2><div class="power-roadmap"><div><b>DESIGN</b><p>Selected equipment, installed array and system connection.</p></div><div><b>PERFORMANCE</b><p>Energy projections, cumulative value and stated assumptions.</p></div><div><b>DELIVERY</b><p>Investment, payment milestones, scope and next steps.</p></div></div>'+
        '<p class="power-note">'+(separate?'Solar-only overview. Optional upgrades are identified separately on page 5. ':'')+'Generation depends on roof conditions, shading, equipment and maintenance. This proposal is not a site-specific simulation or a guarantee of output.</p>')+
      page(2,'02 / EQUIPMENT & SYSTEM DESIGN','The system behind the numbers.','Selected components and a transparent distinction between contracted capacity and installed solar capacity.',
        '<div class="power-columns"><section><h2>Solar array & installation</h2>'+row('Module make',s.moduleMake||'To be confirmed')+row('Module technology',s.moduleTech||'To be confirmed')+row('Modules / rating',f.moduleCount+' × '+precise(f.moduleWattage)+' Wp')+row('Installed DC array',precise(f.installedKwp)+' kWp')+row('Module area',precise(f.arrayArea)+' m²')+'</section><section><h2>Conversion & balance of system</h2>'+row('Inverter make',s.inverterMake||'To be confirmed')+row('Inverter rating',precise(f.inverterKw)+' kW')+row('DC / AC ratio',Number.isFinite(f.dcAcRatio)&&f.dcAcRatio>0?f.dcAcRatio.toFixed(2)+' : 1':'-')+row('Mounting structure',s.mountMake||'To be confirmed')+row('Cables & protection',s.cableMake||'To be confirmed')+'</section></div>'+
        '<h2>How your system connects</h2><div class="power-diagram">'+diagram+'</div><p class="power-caption">Conceptual grid-tied flow, not an installation wiring drawing. Grid-tied solar alone does not provide outage backup.</p>'+
        '<div class="power-metrics power-metrics-three">'+metric('Roof type',s.roofType||'To be confirmed','Site conditions to be confirmed')+metric('Indicative roof requirement',precise(f.requiredArea)+' m²','Includes modelled layout clearance')+metric('Contracted capacity',precise(f.contractedKwp)+' kWp','Pricing basis; whole modules may deliver more DC')+'</div>'+
        '<div class="power-design-note"><h2>Engineering before installation</h2><p>Confirm roof dimensions, shading, structural capacity, string voltage/current limits, cable routes, earthing and utility approvals before finalising installation drawings.</p><p>Selected makes and ratings follow this quotation. Datasheets, compatibility, product availability and OEM warranty terms must be checked during engineering.</p></div>'+
        (refs?'<div class="power-refs">Supplied engineering references: '+refs+'</div>':'<p class="power-note">No external PVsyst report or layout reference has been supplied in this quotation.</p>'))+
      page(3,'03 / GENERATION & SAVINGS','See the long-term picture.','Modelled energy and financial value across 25 years—not a promise of electricity-bill savings.',
        '<div class="power-metrics power-metrics-three">'+metric('Year-one energy value',F.fmtINR(f.annualSaving),'Generation × entered tariff')+metric('25-year energy value',F.fmtINRshort(f.lifetimeSaving),'Before investment and operating costs')+metric('Estimated payback',paybackText,f.netInvestment<=0?'Net investment is not positive':'Interpolated from cumulative energy value')+'</div>'+
        '<div class="power-chart-card"><h2>Projected annual generation <small>kWh / year</small></h2>'+powerChart(f.series.gen,'Projected annual generation over 25 years in kWh',false,true)+'</div>'+
        '<div class="power-chart-card"><h2>Cumulative energy value <small>— projected value &nbsp; ┄ net investment</small></h2>'+powerChart(f.series.cumSaving,'Cumulative energy value over 25 years in rupees',true,false,f.netInvestment)+'</div>'+
        '<table class="power-projection-table"><thead><tr><th>Year</th><th>Generation</th><th>Annual energy value</th><th>Cumulative value</th></tr></thead><tbody>'+[0,4,9,14,24].map(i=>'<tr><td>'+f.series.years[i]+'</td><td>'+F.fmtNum(f.series.gen[i])+' kWh</td><td>'+F.fmtINR(f.series.saving[i])+'</td><td>'+F.fmtINR(f.series.cumSaving[i])+'</td></tr>').join('')+'</tbody></table>'+
        '<div class="power-columns power-assumptions"><div>'+row('Yield basis',safe(s.genFactor)+' kWh/kWp/year')+row('Annual degradation',safe(s.degradation)+'%')+'</div><div>'+row('Electricity tariff','₹'+safe(s.tariff)+' per kWh')+row('Annual tariff escalation',safe(s.escalation)+'%')+'</div></div>'+
        '<p class="power-note">Assumes generated units have the entered tariff value. Self-consumption, export settlement, fixed charges and site performance affect actual bills. O&M, replacements, financing interest and discounting are not deducted from these savings/payback projections.'+(separate?' Battery/additional-system benefits are not included.':'')+'</p>')+
      page(4,'04 / INVESTMENT & PAYMENT PLAN','A transparent investment.','All amounts follow this quotation’s selected price, tax inputs and subsidy assumptions.',
        '<div class="power-columns"><section class="power-cost"><h2>'+(separate?'Solar-only investment':'Investment overview')+'</h2>'+row('Project cost before GST',F.fmtINR(f.projectCost))+row('GST ('+f.gstPercent+'%)',F.fmtINR(f.gstAmount))+row('Total including GST',F.fmtINR(f.grossTotal))+row('Estimated subsidy - not approved',F.fmtINR(f.subsidy))+'<div class="power-total">Estimated net investment<strong>'+F.fmtINR(f.netInvestment)+'</strong></div></section><section><h2>Basis of the offer</h2>'+row('Contracted system',precise(f.capacity)+' kWp')+row('Quoted base rate','₹'+precise(f.costPerWp)+' / Wp')+row('Estimated payback',paybackText)+row('Proposal valid until',valid)+'<p class="power-note">Subsidy eligibility, approval and disbursement are subject to the applicable scheme and authority. GST is calculated using the entered rate; confirm the applicable tax treatment.</p></section></div>'+
        '<div class="power-chart-card power-cost-chart"><h2>From project cost to net investment</h2><canvas id="powerCostChart" aria-label="Cost, GST, subsidy and net investment chart" width="680" height="180"></canvas></div>'+
        '<h2>Payment milestones</h2><p class="power-caption">Calculated on gross including GST, not net after subsidy. Displayed amounts are rounded.</p><div class="power-pay">'+['advance','dispatch','completion'].map(key=>metric(key[0].toUpperCase()+key.slice(1),f.pay[key].pct+'%',F.fmtINR(f.pay[key].amount))).join('')+'</div>'+
        (Math.abs(f.pay.sumPct-100)>.001?'<p class="power-note power-warning">Payment schedule totals '+precise(f.pay.sumPct)+'%. Confirm percentages totalling 100% before approval.</p>':'')+
        (f.financing?'<div class="power-financing"><h2>Optional financing illustration</h2><div class="power-columns"><div>'+row('Loan / interest',F.fmtINR(f.financing.loan)+' / '+f.financing.ratePct+'% p.a.')+row('Term / monthly EMI',f.financing.months+' months / '+F.fmtINR(f.financing.emi))+'</div><div>'+row('Total loan repayment',F.fmtINR(f.financing.totalPaid))+row('Total loan interest',F.fmtINR(f.financing.totalInterest))+'</div></div><p class="power-caption">Illustration only; lender approval, fees and final terms apply. Interest is not deducted from solar payback above.</p></div>':'<p class="power-note">No complete loan inputs supplied. This proposal does not assume financing or lender approval.</p>')+
        '<p class="power-note power-subsidy-note">'+esc(qualification)+'</p>'+investmentWarning)+
      page(5,'05 / SCOPE, ASSURANCES & NEXT STEPS','From proposal to installation.','Clear responsibilities, confirmed engineering and agreed terms come before execution.',
        '<div class="power-columns power-scope"><section><h2>Included EPC scope</h2>'+list(scope.deliverables)+'</section><section><h2>Additional scope, if required</h2>'+list(scope.addl)+'</section></div>'+
        '<div class="power-warranties"><h2>Warranty highlights</h2><div class="power-columns">'+warranty.warranties.map(w=>'<div><strong>'+esc(w.title)+'</strong><p>'+esc(w.b1)+' · '+esc(w.b2)+'</p></div>').join('')+'</div><p class="power-caption">Subject to selected OEM/model terms and the agreed project contract.</p></div>'+
        optional+
        (!separate?'<h2>Delivery sequence</h2><div class="power-journey">'+warranty.steps.map((step,i)=>'<div><b>'+String(i+1).padStart(2,'0')+'</b><span>'+esc(step.title)+'</span></div>').join('')+'</div>':'')+
        '<div class="power-terms">'+row('Proposal date / valid until',F.fmtDate(s.propDate)+' / '+valid)+row('Indicative delivery',s.durationText||'To be confirmed')+row('Jurisdiction',s.jurisdiction||'To be confirmed')+'</div>'+
        '<p class="power-note"><strong>Customer readiness:</strong> '+scope.resp.map(r=>esc(r.title)).join(' · ')+'. Final site requirements must be agreed before mobilisation.</p>'+
        '<div class="power-next"><div><h2>Review → discuss → confirm scope</h2><p>Contact '+esc(s.companyName)+' to arrange a site review and agree engineering scope, fees, approvals and installation timing.</p><strong>'+safe(s.companyPhone)+'</strong><p>'+safe(s.companyEmail)+'</p></div>'+(url?'<a class="power-gallery" href="'+esc(url)+'"><canvas width="320" height="320"></canvas><span>'+esc(destination.action)+'</span></a>':'')+'</div>'+
        '<p class="power-note">This five-page report is not an installation order. Read the Detailed Proposal for complete terms, exclusions, options and any separate supplements. Solar totals, charts and payment milestones exclude separately priced battery/additional systems. Approvals, subsidies, generation, savings and zero bills are not guaranteed.</p>');
    document.body.appendChild(host);
    root.Charts.bridge(host.querySelector('#powerCostChart'),f);
    host.querySelectorAll('.power-page').forEach(p=>{
      if(p.querySelector('.power-body').getBoundingClientRect().bottom>p.querySelector('footer').getBoundingClientRect().top-8)p.classList.add('power-compact');
    });
    const canvas=host.querySelector('.power-gallery canvas');
    if(canvas&&url&&root.QRCode){root.QRCode.toCanvas(canvas,url,{width:320,margin:4,errorCorrectionLevel:'M'});canvas.style.width='94px';canvas.style.height='94px';}
    return host;
  }
  document.addEventListener('qs:rendered',sync);
  root.Experience={publicUrl,galleryUrl,destinationCopy,buildPowerPages,sync,whenReady:()=>qrReady};
})(window);

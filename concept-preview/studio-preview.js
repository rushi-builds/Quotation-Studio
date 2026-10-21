/* Small enhancements on the original Studio, never a second dashboard. */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>window.Finance.fmtINR(n);
  const copy=x=>JSON.parse(JSON.stringify(x));
  const responses=new Map();
  let snapshot=null, responseKey='', frame=null;
  const labels={interested:'Interested / discuss next steps',changes:'Request changes',declined:'Not proceeding'};
  function notify(text){const node=$('offerToast');node.textContent=text;node.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>node.hidden=true,4000);}
  function summary(){
    const s=window.Render.lastState||window.Render.readState(), f=window.Finance.compute(s), rows=[];
    if(window.AdditionalSystems.included(s)){
      const included=window.AdditionalSystems.inBase(s), confirmed=!included||s.systemBaseReviewed===true;
      const amount=included?null:window.AdditionalSystems.price(s);
      rows.push({name:window.AdditionalSystems.name(s),amount,included,pending:!confirmed||(!included&&amount===null),text:included?(confirmed?'Included in Solar EPC':'Included basis—confirmation pending'):amount===null?'To be confirmed':money(amount),basis:included?'No second charge':'Separately quoted'});
    }
    if(window.Rainwater.included(s)){
      const included=s.systemWaterPriceMode==='included', confirmed=!included||s.systemWaterPriceReviewed===true, amount=included?null:window.Rainwater.price(s);
      rows.push({name:'Rainwater collection',amount,included,pending:!confirmed||(!included&&amount===null),text:included?(confirmed?'In selected system / base quote':'Included basis—confirmation pending'):amount===null?'To be confirmed':money(amount),basis:included?'No second charge':'Separately quoted'});
    }
    if(window.Bess.enabled(s)&&s.bessInclude!==false){const b=window.Bess.compute(s,f), amount=Number.isFinite(b.cost)?b.cost:null;rows.push({name:'Battery Energy Storage',amount,included:false,pending:amount===null,text:amount===null?'To be confirmed':money(amount),basis:'Separately quoted'});}
    const priced=rows.filter(r=>!r.included&&r.amount!==null), pending=rows.filter(r=>r.pending), total=priced.reduce((a,r)=>a+r.amount,0);
    return {state:copy(s),gross:f.grossTotal,rows,pending,priced,total,extra:priced.length?money(total):rows.some(r=>!r.included)?'To be confirmed':rows.length?'Included scope only':'No additional scope'};
  }
  function currentKey(){return JSON.stringify(window.StateStore.collectForm());}
  function update(){
    const data=summary(),node=$('offerScopeLine');
    node.classList.toggle('has-pending',data.pending.length>0);
    $('offerScopeValue').textContent=data.rows.length?data.extra+' · separate from solar':'No additional scope selected';
    if(data.rows.length&&data.rows.every(r=>r.included))$('offerScopeValue').textContent=data.pending.length?'Inclusion confirmation pending':'Included in entered Solar EPC price';
    $('offerScopeDetail').textContent=data.pending.length?data.pending.length+' scope item(s) need a price or confirmation. Not counted as ₹0.':data.rows.length?'Priced separate scope only. Solar total above stays unchanged.':'Select an optional system under Advanced Systems when needed.';
    const r=responses.get(currentKey());
    $('offerResponsePill').hidden=!r;
    if(r)$('offerResponsePill').textContent='Demo customer response: '+labels[r.choice]+' · v'+r.version+' · this exact preview only';
    $('offerOlderResponse').hidden=!!r||responses.size===0;
  }
  function focusScope(){
    const input=$('advancedSystemSelect'), section=input?.closest('details');
    if(section)section.open=true;
    if(input){input.scrollIntoView({behavior:'smooth',block:'center'});input.focus({preventScroll:true});input.classList.add('offer-highlight');setTimeout(()=>input.classList.remove('offer-highlight'),2000);}
  }
  function cloneDocument(){
    const host=document.createElement('div');
    for(const definition of window.Render.lastVisible){
      const source=$(definition.id);if(!source)continue;
      const clone=source.cloneNode(true);
      const canvases=source.querySelectorAll('canvas');
      clone.querySelectorAll('canvas').forEach((canvas,i)=>{try{const img=document.createElement('img');img.src=canvases[i].toDataURL('image/png');img.className=canvas.className;img.setAttribute('style',canvas.getAttribute('style')||'');img.width=canvases[i].width;img.height=canvases[i].height;canvas.replaceWith(img);}catch(_){canvas.remove();}});
      clone.querySelectorAll('script,iframe,object,embed,form,[data-builder-only]').forEach(n=>n.remove());
      clone.querySelectorAll('*').forEach(node=>{
        for(const a of [...node.attributes])if(a.name.startsWith('on')||a.name==='contenteditable')node.removeAttribute(a.name);
        ['data-head-ref','data-foot-company','data-foot-tagline','data-edit-key','data-engineering-open'].forEach(a=>node.removeAttribute(a));
        if(node.matches('a')){node.removeAttribute('href');node.removeAttribute('target');}
        if(node.matches('button'))node.disabled=true;
      });
      const wrap=document.createElement('div');wrap.className='page-wrap';wrap.append(clone);host.append(wrap);
    }
    return '<!doctype html><html><head><meta charset="utf-8"><base href="'+esc(document.baseURI)+'"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\' data: blob:; style-src \'self\' \'unsafe-inline\'; font-src \'self\' data:; connect-src \'none\'; script-src \'none\'; form-action \'none\'; base-uri \'self\'"><link rel="stylesheet" href="assets/css/app.css"><link rel="stylesheet" href="assets/css/bess.css"><link rel="stylesheet" href="assets/css/experience.css"><style>html,body{margin:0;background:#edf1f5}body{padding:10px 0;box-sizing:border-box}main{display:flex;flex-direction:column;align-items:center;gap:16px}.page-wrap{margin:0 auto;flex-shrink:0}.page{margin:0}[contenteditable]{outline:none!important}.screen-only{display:none!important}</style></head><body><main>'+host.innerHTML+'</main></body></html>';
  }
  function fitCustomerDocument(){
    if(!frame?.isConnected||!frame.contentDocument?.documentElement)return;
    const doc=frame.contentDocument,scale=Math.min(1,(frame.clientWidth-12)/794);
    doc.documentElement.style.setProperty('--page-scale',Math.max(.1,scale));
    doc.querySelectorAll('.page-wrap').forEach(w=>w.style.height=(1123*scale+8)+'px');
    frame.style.height=Math.ceil(doc.documentElement.scrollHeight+16)+'px';
  }
  function openCustomer(){
    snapshot=summary();responseKey=currentKey();
    const existing=responses.get(responseKey), s=snapshot.state;
    $('offerCustomerTitle').textContent=(s.custName||'Customer quotation')+' · v'+(s.propVersion||'1.0');
    $('offerCustomerRef').textContent=(s.propRef||'Preview')+' · frozen snapshot · sample only';
    $('offerCustomerSummary').innerHTML='<span class="offer-kicker">THE SAME QUOTATION · CUSTOMER VIEW</span><h2>'+esc(s.companyName)+'</h2><p>Prepared for '+esc(s.custName||'your customer')+'. The report below is a frozen copy of the original Studio preview.</p><div class="offer-customer-totals"><div><span>Solar EPC · including GST</span><strong>'+money(snapshot.gross)+'</strong><small>Before estimated subsidy · original Finance output</small></div><div><span>Additional scope</span><strong>'+esc(snapshot.rows.length&&snapshot.rows.every(r=>r.included)?'Included':snapshot.extra)+'</strong><small>'+(snapshot.rows.length&&snapshot.rows.every(r=>r.included)?'No second charge. Inclusion must be confirmed.':'Priced separate items only. No combined total.')+'</small></div></div><div class="offer-customer-items">'+snapshot.rows.map(r=>'<div class="offer-customer-item"><span>'+esc(r.name)+'<br>'+esc(r.basis)+'</span><strong>'+esc(r.text)+'</strong></div>').join('')+'</div>'+(snapshot.pending.length?'<p class="offer-customer-pending">Additional scope needs pricing / inclusion confirmation. Missing prices are not ₹0.</p>':'');
    $('offerResponseForm').reset();$('offerResponseContent').hidden=!!existing;$('offerResponseSuccess').hidden=!existing;
    if(existing)$('offerResponseSuccess').textContent=labels[existing.choice]+' · v'+existing.version+' · sample response stored in this tab only.';
    $('offerResponse').open=false;
    frame=$('offerDocument');frame.style.height='500px';frame.onload=()=>{fitCustomerDocument();const doc=frame.contentDocument;doc.fonts?.ready.then(fitCustomerDocument);doc.querySelectorAll('img').forEach(img=>img.addEventListener('load',fitCustomerDocument,{once:true}));};
    frame.srcdoc=cloneDocument();
    $('offerCustomerDialog').showModal();
    setTimeout(fitCustomerDocument,50);
  }
  function customerRows(){
    const data=summary(),s=data.state;
    return [['SAMPLE CUSTOMER QUOTATION — NOT A COMMERCIAL OFFER',''],['Reference',s.propRef||''],['Version',s.propVersion||''],['Customer',s.custName||''],['Address',s.custAddress||''],['Solar capacity (kWp)',s.capacity],['Solar EPC including GST (INR)',data.gross],['Module make / wattage',(s.moduleMake||'')+' / '+(s.moduleWattage||'')+' Wp'],['Inverter make / capacity',(s.inverterMake||'')+' / '+(s.inverterKw||'')+' kW'],...data.rows.map(r=>[r.name+' — '+r.basis,r.amount!==null?r.amount:r.text]),['Pricing note','Solar and additional scope remain separate. Missing prices are not zero.'],['Additional price status',data.pending.length?'Pricing / inclusion confirmation pending':'Entered prices only; not engineering or order approval'],['Snapshot note','Values-only file. Changes in Excel do not update Studio.']];
  }
  function downloadExcel(){
    const rows=customerRows(),ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:55},{wch:90}];
    rows.forEach((r,i)=>{if(typeof r[1]==='number')ws[XLSX.utils.encode_cell({r:i,c:1})].z='"₹" #,##0';});
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Customer quotation');XLSX.writeFile(wb,'Studio_Sample_Customer_Quotation.xlsx',{compression:true});notify('Sample customer Excel downloaded. Private notes and internal costs are excluded.');
  }
  function boot(){
    if(!window.__originalStudioSandbox||!window.Render||!document.querySelector('.studio-overview'))return;
    // Seed only this memory-isolated original builder. Its Finance defaults are unchanged.
    $('custName').value='Demo Customer';$('custAddress').value='Pune, Maharashtra · sample site';$('propRef').value='DEMO-PREVIEW-001';$('propVersion').value='1.0';
    $('briefingEnabled').checked=false;
    const picker=$('advancedSystemSelect');picker.value='weatherproof';picker.dispatchEvent(new Event('change',{bubbles:true}));
    $('systemPrice').value='84000';$('systemPrice').dispatchEvent(new Event('input',{bubbles:true}));
    const overview=document.querySelector('.studio-overview');
    const line=document.createElement('div');line.id='offerScopeLine';line.className='offer-scope-line';line.innerHTML='<div><strong id="offerScopeValue"></strong><small id="offerScopeDetail"></small></div><button type="button" id="offerReviewScope">Review scope</button>';overview.append(line);
    const pill=document.createElement('div');pill.id='offerResponsePill';pill.className='offer-response-pill';pill.hidden=true;overview.after(pill);
    const old=document.createElement('p');old.id='offerOlderResponse';old.className='offer-quiet-hint';old.textContent='An earlier demo response belongs to a different snapshot. This edited offer needs a fresh response.';old.hidden=true;pill.after(old);
    const excel=document.createElement('button');excel.type='button';excel.id='offerExcel';excel.className='link-btn offer-tools-excel';excel.textContent='Download customer Excel';document.querySelector('.studio-tools').append(excel);
    const hint=document.createElement('p');hint.className='offer-quiet-hint';hint.textContent='Preview only: sample Leak Proof price ₹84,000. Use the existing fields to change it.';document.querySelector('.studio-heading').append(hint);
    const toast=document.createElement('div');toast.id='offerToast';toast.className='offer-toast';toast.setAttribute('role','status');toast.hidden=true;document.body.append(toast);
    const modal=document.createElement('dialog');modal.id='offerCustomerDialog';modal.className='offer-customer-dialog';modal.setAttribute('aria-labelledby','offerCustomerTitle');
    modal.innerHTML='<header class="offer-customer-head"><div><strong id="offerCustomerTitle"></strong><small id="offerCustomerRef"></small></div><div class="offer-customer-actions"><button type="button" class="offer-primary" id="offerRespond">Respond</button><button type="button" id="offerBack">Back to Studio</button></div></header><div class="offer-customer-scroll"><section class="offer-customer-summary" id="offerCustomerSummary"></section><details class="offer-respond" id="offerResponse"><summary>How would you like to proceed?</summary><p>This response refers to this exact preview snapshot, not a signed order or payment authorisation.</p><div id="offerResponseContent"><form id="offerResponseForm"><div class="offer-response-choices"><label><input type="radio" name="choice" value="interested" required>Interested / next steps</label><label><input type="radio" name="choice" value="changes">Request changes</label><label><input type="radio" name="choice" value="declined">Not proceeding</label></div><label class="offer-field">Your name · use a sample name<input type="text" name="name" maxlength="100" required autocomplete="off"></label><label class="offer-field">Comment · optional<textarea name="comment" maxlength="600"></textarea></label><label class="offer-consent"><input type="checkbox" name="consent" required>I understand this is a demo acknowledgement of this quotation snapshot, not a verified signature, order or payment authorisation.</label><button class="offer-primary" type="submit">Record demo response</button></form></div><div id="offerResponseSuccess" class="offer-response-success" hidden></div><p>No server storage. No customer identity verification. Refresh clears this preview.</p></details><div class="offer-doc-label">Your actual Studio report · read-only snapshot</div><iframe class="offer-original-document" id="offerDocument" title="Original quotation report snapshot" sandbox="allow-same-origin"></iframe></div>';
    document.body.append(modal);
    $('offerReviewScope').addEventListener('click',focusScope);
    $('offerExcel').addEventListener('click',downloadExcel);
    $('offerReset').addEventListener('click',()=>{if(confirm('Reset this isolated preview? Existing quotations are not affected.'))location.reload();});
    $('offerBack').addEventListener('click',()=>modal.close());
    $('offerRespond').addEventListener('click',()=>{$('offerResponse').open=true;$('offerResponse').scrollIntoView({behavior:'smooth',block:'start'});});
    $('offerResponseForm').addEventListener('submit',e=>{
      e.preventDefault();const form=new FormData(e.target),choice=form.get('choice'),name=String(form.get('name')||'').trim();if(!labels[choice]||!name||!form.has('consent'))return;
      const r={choice,name,comment:String(form.get('comment')||'').trim(),version:snapshot.state.propVersion||'1.0'};responses.set(responseKey,r);
      $('offerResponseContent').hidden=true;$('offerResponseSuccess').hidden=false;$('offerResponseSuccess').textContent=labels[choice]+' · v'+r.version+' · sample response recorded in this tab only. Not a verified acceptance.';update();
    });
    document.addEventListener('click',e=>{
      if(e.target.closest('#custViewBtn,[data-engineering-open]')){e.preventDefault();e.stopImmediatePropagation();openCustomer();}
    },true);
    ['waShare','siteFetchBtn'].forEach(id=>{if($(id)){$(id).disabled=true;$(id).title='Live sharing / external data is disabled in this isolated preview.';}});
    const previewSaveLabel=()=>{if($('saveIndicator').textContent!=='Preview tab only')$('saveIndicator').textContent='Preview tab only';};
    new MutationObserver(previewSaveLabel).observe($('saveIndicator'),{childList:true,subtree:true});previewSaveLabel();
    document.addEventListener('qs:rendered',update);
    window.addEventListener('resize',fitCustomerDocument);
    window.Render.renderAll();
    // Keep the normal original Essentials layout. No new navigation or sections.
    const first=$('custName').closest('details.studio-section');if(first)first.open=true;
    window.__studioOfferPreviewReady=true;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(boot));else requestAnimationFrame(boot);
})();

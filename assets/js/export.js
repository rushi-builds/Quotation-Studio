/* PDF export: snapshot the selected document before any asynchronous capture.
   All formats use the saved quotation, never the customer scenario slider. */
'use strict';
(function(root) {
  const $=id=>document.getElementById(id);
  let busy=false;
  const formats={bess:{title:'BESS Report',ids:['pageBessOverview','pageBessAssessment']},system:{title:'Additional System Report',ids:['pageSystemOverview','pageSystemDetail']},'system-power':{title:'System Power Proposal',ids:['pageSystemOverview']}};
  function updateLabel() {
    const s=root.Render.lastState||{},select=$('pdfFormat');
    if(select){for(const option of select.options){option.disabled=option.value==='bess'?!root.Bess.enabled(s):option.value.startsWith('system')?!root.AdditionalSystems.enabled(s):false;}if(select.selectedOptions[0]?.disabled)select.value='full';}
    const format=select?.value||'full',count=root.Render.lastVisible?.length||15,label=$('downloadLabel');
    if(label)label.textContent=format==='power'?'Download Power Proposal (2 Pages)':formats[format]?'Download '+formats[format].title+' ('+formats[format].ids.length+' Pages)':'Generate & Download PDF ('+count+' Pages)';
  }
  function snapshotFull(selected,standaloneTitle) {
    const host=document.createElement('div'); host.className='pdf-snapshot'; host.setAttribute('aria-hidden','true');
    const pages=selected|| (root.Render.lastVisible?.length ? root.Render.lastVisible : root.Render.PAGES);
    pages.forEach((p,index)=>{
      const source=$(p.id), copy=source.cloneNode(true);
      copy.style.transform='none';
      if(standaloneTitle){copy.querySelector('.pf-right').textContent='Page '+(index+1)+' of '+pages.length;copy.querySelector('.pg-head-meta').textContent=standaloneTitle+' · '+(root.Render.lastState.propRef||'');}
      // Live chrome updates use document-wide data bindings; detach those from
      // the snapshot so later form edits cannot rewrite captured metadata.
      copy.querySelectorAll('[data-head-ref],[data-foot-company],[data-foot-tagline]').forEach(el=>{
        ['data-head-ref','data-foot-company','data-foot-tagline'].forEach(key=>el.removeAttribute(key));
      });
      // cloneNode does not preserve chart / QR canvas pixels.
      const canvases=source.querySelectorAll('canvas');
      copy.querySelectorAll('canvas').forEach((canvas,i)=>canvas.getContext('2d').drawImage(canvases[i],0,0));
      host.appendChild(copy);
    });
    document.body.appendChild(host); return host;
  }
  async function exportPdf(statusCb, options={}) {
    if(busy) throw new Error('A PDF export is already in progress.');
    busy=true; let snapshot;
    const set=m=>{if(statusCb) statusCb(m);};
    try {
      const format=options.format||'full';
      if(!['full','power',...Object.keys(formats)].includes(format))throw new Error('Unknown PDF format.');
      if(document.fonts?.ready) await document.fonts.ready;
      if(root.Experience) {
        let pending;
        do { pending=root.Experience.whenReady(); await pending; } while(pending!==root.Experience.whenReady());
      }
      const s=JSON.parse(JSON.stringify(root.Render.lastState || root.Render.readState()));
      if(format==='bess'&&!root.Bess.enabled(s))throw new Error('Enable BESS to download its report.');
      if(format.startsWith('system')&&!root.AdditionalSystems.enabled(s))throw new Error('Enable an additional system to download its report.');
      snapshot=format==='power'?root.Experience.buildPowerPages(s):formats[format]?snapshotFull(root.Render.PAGES.filter(p=>formats[format].ids.includes(p.id)),formats[format].title):snapshotFull();
      const pages=[...snapshot.children];
      await Promise.all([...snapshot.querySelectorAll('img')].map(img=>new Promise((resolve,reject)=>{
        // `complete` is also true for failed/empty images. Do not silently issue
        // a professional PDF with missing artwork or a broken uploaded photo.
        let timer;
        const finish=()=>{
          clearTimeout(timer);
          img.onload=null; img.onerror=null;
          if(img.naturalWidth>0 && img.naturalHeight>0) resolve();
          else reject(new Error('An image could not be loaded. Check the image source and try again.'));
        };
        if(img.complete) {finish();return;}
        img.onload=finish; img.onerror=finish;
        timer=setTimeout(()=>{
          img.onload=null; img.onerror=null;
          reject(new Error('An image did not load. Check the image source and try again.'));
        },20000);
      })));
      if(format==='power') pages.forEach(page=>{
        const footer=page.querySelector('footer'),last=footer.previousElementSibling;
        if(last.getBoundingClientRect().bottom>footer.getBoundingClientRect().top-4 || page.scrollHeight>1124)
          throw new Error('This proposal has too much text for the two-page summary. Please use the detailed PDF or shorten the equipment / delivery text.');
      });
      // Supplements accept user-authored text. Never silently clip a long scope or model name.
      pages.filter(p=>p.classList.contains('bess-page')||p.classList.contains('system-page')).forEach(page=>{
        const foot=page.querySelector('.pg-foot'),body=page.querySelector('.pg-body');
        if(page.scrollHeight>1124||[...body.children].some(el=>el.getBoundingClientRect().bottom>foot.getBoundingClientRect().top-3))throw new Error('Supplement content exceeds the page. Shorten the name, equipment, scope or notes before downloading.');
      });
      const {jsPDF}=root.jspdf, pdf=new jsPDF({unit:'pt',format:'a4',compress:true});
      const pageW=pdf.internal.pageSize.getWidth(),pageH=pdf.internal.pageSize.getHeight();
      for(let i=0;i<pages.length;i++) {
        set('Rendering page '+(i+1)+' of '+pages.length+'…');
        const el=pages[i];
        const canvas=await root.html2canvas(el,{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false,onclone:doc=>doc.body.classList.add('qs-pdf-capture')});
        if(i>0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg',.92),'JPEG',0,0,pageW,pageH,undefined,'FAST');
        // QR destinations and supplied engineering references are also clickable.
        const bounds=el.getBoundingClientRect();
        el.querySelectorAll('a[href]').forEach(a=>{
          const url=root.Render.safeHttpUrl(a.href),r=a.getBoundingClientRect();
          if(url && r.width && r.height && r.top>=bounds.top && r.bottom<=bounds.bottom)
            pdf.link((r.left-bounds.left)/bounds.width*pageW,(r.top-bounds.top)/bounds.height*pageH,r.width/bounds.width*pageW,r.height/bounds.height*pageH,{url});
        });
      }
      const cust=(s.custName||'Customer').replace(/[^a-z0-9]+/gi,'_'),ref=(s.propRef||'').replace(/[^a-z0-9]+/gi,'-');
      pdf.setProperties({title:(formats[format]?.title||(format==='power'?'Power Proposal':'Solar Proposal'))+' — '+s.custName+' ('+s.capacity+' kWp)',subject:'Rooftop solar EPC proposal '+ref+' v'+s.propVersion,author:s.companyName,creator:s.companyName+' — Quotation Studio'});
      pdf.save((formats[format]?formats[format].title.replace(/ /g,'_')+'_':format==='power'?'Power_Proposal_':'Proposal_')+cust+'_'+s.capacity+'kWp_'+ref+'.pdf');
      set('Downloaded ✓ ('+pages.length+' pages)');
    } finally {snapshot?.remove();busy=false;}
  }
  function wire() {
    const btn=$('downloadBtn'),status=$('statusMsg');
    if(btn) btn.addEventListener('click',async()=>{
      btn.disabled=true;btn.classList.add('busy');
      try {await exportPdf(m=>{status.textContent=m;},{format:$('pdfFormat')?.value});}
      catch(err){console.error(err);status.textContent=err.message || 'PDF generation failed. Please try again.';}
      finally {btn.disabled=false;btn.classList.remove('busy');setTimeout(()=>{status.textContent='';},8000);}
    });
    document.querySelectorAll('[data-export-format]').forEach(button=>button.addEventListener('click',async()=>{
      const old=button.textContent;button.disabled=true;
      try{await exportPdf(m=>{if(status)status.textContent=m;},{format:button.dataset.exportFormat});}
      catch(e){if(status)status.textContent=e.message;}
      finally{button.disabled=false;button.textContent=old;root.Bess.syncControls(root.Render.lastState);root.AdditionalSystems.sync(root.Render.lastState);}
    }));
    $('pdfFormat')?.addEventListener('change',updateLabel);updateLabel();
  }
  root.Exporter={exportPdf,wire,updateLabel};
})(typeof self!=='undefined'?self:this);

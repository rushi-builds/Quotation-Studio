/* Optional page-specific value footers: never move or shrink proposal content. */
'use strict';
(function(root){
 const definitions={
  pageExec:{contentKey:'exec',items:[['target','System overview'],['sun','Generation basis'],['chart','Project summary'],['doc','Defined scope']]},
  pageOptions:{items:[['doc','Like-for-like scope'],['coins','Transparent comparison'],['target','Informed choice'],['shield','Scope alignment']]},
  pageSolution:{items:[['target','Site-fit design'],['gear','Specified equipment'],['shield','Design basis'],['check','Planned handover']]},
  pageTechSpec:{items:[['doc','Datasheet\nRatings'],['gear','Certified\nComponents'],['shield','Structure\nGuarantee'],['check','IS-Code\nCompliance']]},
  pageSavings:{items:[['sun','Generation estimate'],['rupee','Energy-value basis'],['chart','Long-term view'],['leaf','Clean energy']]},
  pageInvestment:{items:[['doc','Itemised scope'],['coins','Cost clarity'],['payment','Defined milestones'],['target','Agreed inclusions']]},
  pageFinance:{items:[['chart','Stated assumptions'],['coins','Finance illustration'],['doc','Informed decisions'],['target','Scenario basis']]},
  pageProjects:{items:[['target','Site context'],['doc','Project scope'],['leaf','Practical application'],['gear','Installation approach']]},
  pageAbout:{items:[['users','People first'],['target','Thoughtful planning'],['leaf','Responsible energy'],['shield','Clear communication']]},
  pageWhySolar:{items:[['sun','Clean generation'],['rupee','Energy value'],['leaf','Lower emissions'],['gear','Roof utilisation']]},
  pageScope:{items:[['doc','Defined scope'],['gear','Careful installation'],['check','Clear handover'],['users','Agreed responsibilities']]},
  pageQuality:{items:[['shield','Safe practices'],['wrench','Neat workmanship'],['check','Careful checks'],['doc','Documented checks']]},
  pageWhyKtm:{items:[['users','Personal attention'],['target','Practical expertise'],['leaf','Long-term thinking'],['check','Clear guidance']]},
  pageWarranty:{items:[['shield','OEM warranties'],['wrench','Workmanship terms'],['doc','Clear support scope'],['check','Handover guidance']]},
  pageTerms:{items:[['leaf','Reliable\nSolutions'],['users','Experienced\nTeam'],['shield','Quality\nExecution'],['chart','Long-Term\nValue']]}
 };
 for(const def of Object.values(definitions))def.items=def.items.map(([icon,label])=>[icon,label.includes('\n')?label:label.replace(/ (\S+)$/,'\n$1')]);
 const palettes=['warm','sage','lavender','blue'];
 const visible=n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden';
 // Equipment photos for the technical-specification cards.
 //
 // Drop the file into assets/images/equipment/ and add one line: the key is
 // "kind:brand" (lower case, dashes), the value is the file name. Anything not
 // listed falls back to the neutral render of its kind, so a brand that has no
 // photo yet still gets a picture instead of a hole.
 //
 //   'module:waaree'   : 'waaree-module.webp',
 //   'module:panasonic': 'panasonic-module.webp',
 //   'inverter:sungrow': 'sungrow-inverter.webp',
 //   'mount:solartech' : 'solartech-structure.webp',
 //   'module'          : 'module-generic.webp',   // any brand
 //
 // Keys are tried most specific first: kind:brand:model, then kind:brand, then
 // kind, then the neutral render that ships with the site.
 const PHOTO_BASE='assets/images/equipment/';
 const PHOTO_MAP={
  /* Solar modules - one product shot per brand the quotation can carry. Every
     entry is a file in assets/images/equipment/, cropped to the panel itself so
     the sheet shows the product, not a marketing poster. */
  'module:waaree':'waaree-module.webp',
  'module:panasonic':'panasonic-module.webp',
  'module:anchor':'panasonic-module.webp',
  'module:renewsys':'renewsys-module.webp',
  'module:tata':'tata-module.webp',
  'module:tata-power':'tata-module.webp',
  'module:tata-power-solar':'tata-module.webp',
  'module:vikram':'vikram-module.webp',
  'module:vikram-solar':'vikram-module.webp',
  'module:adani':'adani-module.webp',
  'module:adani-solar':'adani-module.webp',
  'module:premier':'premier-module.webp',
  'module:premier-energies':'premier-module.webp',
  'module:renew':'renew-module.webp',
  'module:renew-by-photovoltaic':'renew-module.webp',
  'module:longi':'longi-module.webp',
  /* Inverters - the brand's own range shot, cropped to the units themselves. */
  'inverter:growatt':'growatt-inverter.webp',
  'inverter:sungrow':'sungrow-inverter.webp',
  'inverter:fronius':'fronius-inverter.webp',
  'inverter:deye':'deye-inverter.webp',
  'inverter:huawei':'huawei-inverter.webp',
  'inverter:fusionsolar':'huawei-inverter.webp',
  'inverter:huawei-fusionsolar':'huawei-inverter.webp',
  'inverter:solis':'solis-inverter.webp',
  /* Mounting structure - the make the sheet names on the STRUCTURE row. */
  'mount:ars':'ars-structure.webp',
  'mount:ars-solar-tech':'ars-structure.webp',
  'mount:ars-solartech':'ars-structure.webp',
  'mount:solartech':'ars-structure.webp',
  'mount:solar-tech':'ars-structure.webp',
  /* Cabling, earthing and protection. One card carries the whole "Mounting &
     Cabling" group, so the card shows the structure when it has one and the
     cable the sheet names when it does not; earthing is the quiet default. */
  'other:havells':'havells-cable.webp',
  'other:polycab':'polycab-cable.webp',
  'other:earthing':'earthing.webp',
  'other:acdb':'acdb-dcdb.webp'
 };
 const PHOTO_FALLBACK={
  modules:'assets/images/inc-modules.png',
  module:'assets/images/inc-modules.png',
  inverter:'assets/images/inc-inverter.png',
  mount:'assets/images/inc-mount.png',
  other:'assets/images/equipment/earthing.webp'
 };
 const slug=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 function equipmentPhoto(kind,brand,model){
  /* The sheet groups modules as "modules"; the catalogue keys them as "module".
     Without this the module card never found its own brand photograph. */
  if(kind==='modules')kind='module';
  const keys=[slug(brand)&&slug(model)&&(kind+':'+slug(brand)+':'+slug(model)),
              slug(brand)&&(kind+':'+slug(brand)),kind].filter(Boolean);
  for(const key of keys){const file=PHOTO_MAP[key];if(file)return PHOTO_BASE+file;}
  return PHOTO_FALLBACK[kind]||PHOTO_FALLBACK.other||'';
 }
 // Each technical-specification group is a card. The chip on its head names the
 // equipment the customer is actually getting, read straight off the "Make" row
 // (or the structure's make), so the sheet never has to be edited by hand and
 // never shows a brand the quotation does not carry.
 // What each card leads with, in the language the sheet already speaks: an
 // icon for the band, and three facts lifted from the card's own rows - never
 // invented copy, and never a number that is not in the table beside it.
 const CARD_LOOK={
  modules:{icon:'panel',points:[['High Efficiency','MODULE EFFICIENCY','sun'],
                                ['Rated Power','RATED POWER','panel'],
                                ['Performance Cover','PERFORMANCE WARRANTY','shield']]},
  inverter:{icon:'inverter',points:[['Conversion','MAX. DC INPUT & EFFICIENCY','bolt'],
                                    ['Rated Output','RATED OUTPUT','chart'],
                                    ['Protection','PROTECTION','shield']]},
  mount:{icon:'wrench',points:[['Structure','STRUCTURE','wrench'],
                               ['Cabling','CABLING','cable'],
                               ['Earthing','EARTHING','shield']]},
  design:{icon:'gear',points:[['Standards','DESIGN STANDARDS','badge'],
                              ['Design Life','STRUCTURE LIFE','clock'],
                              ['Wind Load','BASIC WIND SPEED','gear']]}
 };
 function cardLook(kind){return CARD_LOOK[kind==='modules'?'modules':kind]||CARD_LOOK.design;}
 function iconSvg(name,size,color){
  const I=root.Icons;return I&&I.get?I.get(name,size,color):'';
 }
 // Each card leads with the equipment itself: a photograph as tall as the rows
 // it stands beside. The cell spans every data row of its card and the picture
 // is placed absolutely inside it, so the rows keep their exact heights and the
 // page gains nothing from the picture.
 function setCardPhoto(table,rows,headIndex,photo,alt,kind,read){
  const head=rows[headIndex];
  let first=null,count=0;
  for(let j=headIndex+1;j<rows.length;j++){const r=rows[j];
   if(r.classList.contains('spec-group'))break;
   if(!r.cells.length)continue;
   if(!first)first=r;count++;}
  if(!first||!count||!photo)return;
  let cell=first.querySelector(':scope > td.spec-photo');
  if(!cell){cell=document.createElement('td');cell.className='spec-photo';first.append(cell);}
  cell.rowSpan=count;
  let img=cell.querySelector('img');
  if(!img){img=document.createElement('img');img.alt='';cell.append(img);}
  img.setAttribute('alt',alt?alt+' equipment':'');
  img.setAttribute('src',photo);
  if(head&&head.cells[0]){
   const look=cardLook(kind);
   head.cells[0].colSpan=3;
   if(!head.cells[0].querySelector('.ts-ico')){
    const chip=document.createElement('span');chip.className='ts-ico';chip.setAttribute('aria-hidden','true');
    chip.innerHTML=iconSvg(look.icon,13,'#41627E');
    head.cells[0].insertBefore(chip,head.cells[0].firstChild);
   }
  }
  if(!table.querySelector('colgroup')){
   const cg=document.createElement('colgroup');
   ['','','photo'].forEach((n)=>{const c=document.createElement('col');if(n)c.className='col-'+n;cg.append(c);});
   table.insertBefore(cg,table.firstChild);
  }
 }
 function decorateSpecCards(){
  const page=document.getElementById('pageTechSpec');if(!page)return;
  const table=page.querySelector('#v_tsTable');if(!table||!table.rows)return;
  const rows=[...table.rows];
  const read=(from,test)=>{for(let j=from+1;j<rows.length;j++){const r=rows[j];if(r.classList.contains('spec-group'))break;
   const k=r.cells[0],v=r.cells[1];if(k&&v&&test(k.textContent.trim()))return v.textContent.trim();}return '';};
  for(let i=0;i<rows.length;i++){
   const row=rows[i];if(!row.classList.contains('spec-group'))continue;
   const name=(row.textContent||'').toUpperCase();
   const kind=/MODULE/.test(name)?'modules':/INVERTER/.test(name)?'inverter':/MOUNT|CABL/.test(name)?'mount':/DESIGN|ENGINEER/.test(name)?'design':'other';
   row.dataset.kind=kind;
   let brand='';
   if(kind==='modules'||kind==='inverter')brand=read(i,k=>/^(MAKE|BRAND)$/i.test(k));
   else if(kind==='mount'){
    const structure=read(i,k=>/^STRUCTURE$/i.test(k));
    const m=structure.match(/([A-Za-z][A-Za-z-]{2,})\s+make/i);brand=m?m[1]:'';
   }else if(kind==='design')brand='IS / IEC';
   brand=brand.replace(/\s+/g,' ').trim();
   if(brand)row.dataset.brand=brand.length>32?brand.slice(0,31).trim()+'\u2026':brand;
   else delete row.dataset.brand;
   /* The band carries the brand at its right end, level with the title. */
   if(row.cells[0]){if(brand)row.cells[0].dataset.brand=row.dataset.brand||brand;
    else delete row.cells[0].dataset.brand;}
   const head=row.cells[0];if(head){
    const model=read(i,k=>/^(MODEL|MODULE)$/i.test(k));
    let photo=equipmentPhoto(kind,brand,model);
    /* The mounting card covers structure, cable, earthing and protection at
       once. If the structure's make has no photo of its own, the cable the
       quotation names is the next most useful picture on that card. */
    if(kind==='mount'&&!PHOTO_MAP[kind+':'+slug(brand)]){
     const cabling=slug(read(i,k=>/^CABLING/i.test(k))).split('-')[0];
     const other=cabling&&equipmentPhoto('other',cabling,'');
     if(other&&other.indexOf('equipment/')>=0)photo=other;
    }
    setCardPhoto(table,rows,i,photo,brand||row.textContent.trim(),kind,read);
   }
  }
 }
 // The system drawing belongs to the page that proposes the system, not to the
 // specification sheet - and moving it there is what gives the sheet room for
 // the product photographs. The drawing keeps its id, so the renderer keeps
 // painting into it; only its parent changes.
 function relocateDiagram(){
  const host=document.getElementById('pageSolution');
  const body=host&&host.querySelector(':scope > .pg-body');
  const diagram=document.getElementById('v_tsDiagram');
  if(!body||!diagram)return;
  let box=body.querySelector(':scope > .solution-system');
  if(!box){
   box=document.createElement('div');box.className='solution-system';
   /* Above the closing cross-reference, which stays the page's last line. */
   body.insertBefore(box,body.querySelector('#v_soScopeNote')||null);
  }
  if(diagram.parentElement!==box){
   const title=document.getElementById('v_tsDiagramTitle');
   if(title)box.append(title);
   box.append(diagram);
   /* Four short lines say what the drawing shows, in the order the power flows.
      They are the page's own words - the specification sheet lists ratings, not
      the route those ratings take. */
   if(!box.querySelector('.solution-points')){
    const list=document.createElement('ul');list.className='solution-points';
    [['Array to DC','Modules, DC cabling, fuses and surge protection'],
     ['Inverter','MPPT conversion to 230 / 415 V AC output'],
     ['AC protection','ACDB, RCCB and surge protection before the load'],
     ['Metering and grid','Bi-directional net meter, DISCOM approval and import/export']]
     .forEach(([t,d])=>{const li=document.createElement('li');
      const b=document.createElement('b');b.textContent=t;
      const sp=document.createElement('span');sp.textContent=d;
      li.append(b,sp);list.append(li);});
    box.append(list);
   }
   root.Render?.refreshDiagramScale?.();
  }
 }
 function sync(){
  if(!root.Render?.lastState||!root.ProposalMarks)return;
  relocateDiagram();
  decorateSpecCards();
  for(const [id,def] of Object.entries(definitions)){
   const page=document.getElementById(id);if(!page)continue;
   let band=page.querySelector(':scope>.proposal-value-footer');
   if(!band){band=document.createElement('aside');band.className='proposal-value-footer pv-quiet';band.setAttribute('aria-label','Our approach');band.dataset.docAdded='true';page.append(band);}
   // Hide before measuring: the decoration must never influence available space.
   band.hidden=true;
   const body=page.querySelector(':scope>.pg-body'),foot=page.querySelector(':scope>.pg-foot'),rect=page.getBoundingClientRect();
   if(!body||!foot||rect.width<=0||!visible(page)||page.scrollHeight>page.clientHeight+2)continue;
   band.replaceChildren();
   const list=document.createElement('ul');list.className='pv-values';list.style.gridTemplateColumns='repeat('+def.items.length+',minmax(0,1fr))';if(id==='pageTerms')list.id='v_tmFooterValues';
   const content=CONTENT[def.contentKey||id];
   def.items.forEach(([icon,label],i)=>{
    const item=content?.footerValues?.[i],text=String(item?.label??label);if(!text.trim())return;
    const li=document.createElement('li'),mark=document.createElement('span'),copy=document.createElement('span');
    mark.className='pv-mark';mark.setAttribute('aria-hidden','true');mark.innerHTML=root.ProposalMarks.get(item?.icon||icon,26,palettes[i%4]);
    copy.className='pv-label';copy.textContent=text;li.append(mark,copy);list.append(li);
   });
   if(!list.children.length)continue;
   list.style.gridTemplateColumns='repeat('+list.children.length+',minmax(0,1fr))';
   band.append(list);band.hidden=false;
   const scale=rect.width/page.offsetWidth;
   // Attach every fitting icon row directly to the contact footer. Closing copy
   // stays in ordinary body flow above the icons, never underneath them.
   const limit=(foot.getBoundingClientRect().top-rect.top)/scale;
   const top=limit-band.offsetHeight;
   const furniture=[...page.children].filter(n=>!n.matches('.pg-body,.pg-head,.pg-foot,.proposal-value-footer,script,style'));
   const roots=[...body.children,...furniture].filter(n=>visible(n)&&!n.matches('.spacer'));
   // Measure actual descendants too: floated/absolute content must be protected.
   const contentNodes=roots.flatMap(n=>[n,...n.querySelectorAll('*')]).filter(visible);
   const bottom=Math.max(0,...contentNodes.map(n=>(n.getBoundingClientRect().bottom-rect.top)/scale));
   band.style.top=top+'px';
   if(top-bottom<24||top<70||band.scrollWidth>band.clientWidth+1||list.scrollHeight>list.clientHeight+1||[...list.querySelectorAll('.pv-label')].some(n=>n.scrollWidth>n.clientWidth+1||n.getBoundingClientRect().bottom>band.getBoundingClientRect().bottom+1))band.hidden=true;
  }
 }
 const previous=root.Render.renderAll;
 root.Render.renderAll=function(...args){const result=previous.apply(this,args);sync();return result;};
 let frame=0;
 const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(sync);};
 window.addEventListener('resize',schedule);
 document.fonts?.ready.then(schedule);
 document.addEventListener('load',e=>{if(e.target.matches?.('.preview-panel img,#sharePages img'))schedule();},true);
 document.addEventListener('DOMContentLoaded',schedule);
 root.ProposalValueFooters={definitions,sync};
 if(root.Render.lastState)schedule();
})(window);

/* Proposal-local document presentation layer. Original calculation, render and
 * export FILES remain unchanged. Render's public registry is extended only for
 * user-added / continuation pages. No HTML supplied by a user is executed. */
'use strict';
(function(root){
 const $=id=>document.getElementById(id), KEY='documentStudio';
 const basePages=root.Render.PAGES.slice(), originalRender=root.Render.renderAll;
 const originalVisibility=new Map(basePages.map(p=>[p,p.visible]));
 let undo=[], extensions=[], busy=false, ownEdit=false, uiOwner='', selected='pageExec', report='full', samples=new Map(), status='', history=[], future=[];
 const canonicalPower=root.Experience.buildPowerPages;
 const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const uid=()=>root.crypto.randomUUID().replace(/-/g,'').slice(0,14);
 const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 const store=()=>CONTENT[KEY]&&CONTENT[KEY].version===1&&plain(CONTENT[KEY].pages)?CONTENT[KEY]:{version:1,pages:{},customPages:[]};
 const customPages=()=>Array.isArray(store().customPages)?store().customPages.filter((p,i,a)=>p&&/^studioPage-[a-zA-Z0-9-]{1,60}$/.test(p.id)&&typeof p.title==='string'&&p.title.length<=300&&a.findIndex(x=>x?.id===p.id)===i).slice(0,30):[];
 function ancestor(id){id=id.replace(/-continuation-\d+$/,'');const seen=new Set();let item;while((item=customPages().find(p=>p.id===id))&&!seen.has(id)){seen.add(id);id=item.after||'pageClosing';}return id;}
 function sourceEnabled(id,s){const base=basePages.find(p=>p.id===ancestor(id)),condition=base&&originalVisibility.get(base);return !condition||condition(s);}
 const belongs=(page,format)=>{const id=ancestor(page.id);return format==='bess'?/^pageBess/.test(id):format==='system'?/^pageSystem|^pageRainwater/.test(id):format==='system-power'?id==='pageSystemOverview':true;};
 const config=id=>Object.prototype.hasOwnProperty.call(store().pages||{},id)&&store().pages[id]&&typeof store().pages[id]==='object'?store().pages[id]:{};
 const scope=id=>/^page(Bess|System|Rainwater)/.test(id)?(root.Render.lastState?.systemTemplate||'none')+':'+(root.Render.lastState?.bessEnabled?'battery':'solar'):'default';
 const variant=id=>{const raw=config(id).variants?.[scope(id)]||{};return {...raw,texts:plain(raw.texts)?raw.texts:{},hidden:Array.isArray(raw.hidden)?raw.hidden.filter(k=>typeof k==='string'):[],blocks:Array.isArray(raw.blocks)?raw.blocks.filter(b=>b&&/^[a-zA-Z0-9-]{1,60}$/.test(b.id)&&typeof b.body==='string'&&b.body.length<=100000&&typeof b.title==='string'&&b.title.length<=300&&['text','list','image'].includes(b.kind)):[]};};
 function change(fn){
  const before=JSON.stringify(store());CONTENT[KEY]=store();CONTENT[KEY].customPages=customPages();fn();
  history.push(before);if(history.length>30)history.shift();future=[];
  ownEdit=true;try{root.Render.renderAll();}finally{ownEdit=false;}
  root.__qsScheduleSave?.();updateStatus();
 }
 function edit(id,fn){change(()=>{const d=CONTENT[KEY]=store();if(!plain(d.pages[id]))d.pages[id]={};if(!plain(d.pages[id].variants))d.pages[id].variants={};const v=variant(id);d.pages[id].variants[scope(id)]={...v,texts:{...v.texts},hidden:[...v.hidden],blocks:[...v.blocks]};fn(d.pages[id].variants[scope(id)],d.pages[id],d);});}
 function remember(fn){undo.push(fn);}
 function reset(){
  for(let i=undo.length-1;i>=0;i--)undo[i]();undo=[];
  extensions.forEach(p=>{$(p.id)?.closest('.page-wrap')?.remove();const i=root.Render.PAGES.indexOf(p);if(i>=0)root.Render.PAGES.splice(i,1);});extensions=[];
  document.querySelectorAll('.preview-panel [data-doc-added],#sharePages [data-doc-added]').forEach(e=>e.remove());
 }
 function move(node,parent,before=null){const slot=document.createComment('document position');node.before(slot);remember(()=>{if(slot.parentNode)slot.replaceWith(node);});parent.insertBefore(node,before);}
 function classOn(node,name){const had=node.classList.contains(name);node.classList.add(name);remember(()=>{if(!had)node.classList.remove(name);});}
 function style(node,key,value){const prev=node.style[key];node.style[key]=value;remember(()=>node.style[key]=prev);}
 function path(node,page){
  if(node.id)return '#'+CSS.escape(node.id);
  const parts=[];for(let n=node;n&&n!==page;n=n.parentElement){if(n.id){parts.unshift('#'+CSS.escape(n.id));break;}const tag=n.tagName.toLowerCase(),index=[...n.parentElement.children].filter(e=>e.tagName===n.tagName).indexOf(n)+1;parts.unshift(tag+':nth-of-type('+index+')');}
  return parts.join(' > ');
 }
 const staticText=new Map();
 function indexStatic(doc){for(const record of basePages){const page=doc.getElementById(record.id);if(!page)continue;const walker=doc.createTreeWalker(page,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){if(!node.nodeValue.trim()||node.parentElement.closest('script,style,noscript'))continue;staticText.set(record.id+'|'+path(node.parentElement,page)+'::'+[...node.parentNode.childNodes].indexOf(node),node.nodeValue.trim());}}}
 indexStatic(document);
 let sourceVerified=!root.QS_SHARE;
 const sourceReady=root.QS_SHARE?fetch('quotation.html').then(response=>{if(!response.ok)throw new Error('Could not verify static captions.');return response.text();}).then(html=>{indexStatic(new DOMParser().parseFromString(html,'text/html'));sourceVerified=true;if(root.Render.lastState&&hasEdits()&&!busy)root.Render.renderAll(root.Render.lastState);}).catch(()=>{status='Static-caption verification unavailable. Reload before issuing.';}):Promise.resolve();
 function contentStrings(value,result=new Set()){
  if(typeof value==='string'&&value.trim())result.add(value.trim());
  else if(Array.isArray(value))value.forEach(v=>contentStrings(v,result));
  else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>{if(k!==KEY)contentStrings(v,result);});return result;
 }
 function scan(page,id){
  const strings=contentStrings(CONTENT),sources=Object.entries(root.Render.lastState||root.StateStore?.collectForm?.()||{}).filter(([key,v])=>typeof v==='string'&&v.trim()&&(/^(cust|company|propRef)/.test(key)||v.trim().length>=3));
  const texts=[],blocks=[],body=page.querySelector('.pg-body,.power-body')||page;
  // Top-level sections and individual cards/list items are independently removable.
  const candidates=id==='pageCover'?[]:[...body.children];
  if(id!=='pageCover')body.querySelectorAll('*').forEach(parent=>{if(getComputedStyle(parent).display==='grid')for(const child of parent.children)if(!candidates.includes(child))candidates.push(child);});
  if(id!=='pageCover')body.querySelectorAll('tbody>tr').forEach(row=>{if(!candidates.includes(row))candidates.push(row);});
  if(id!=='pageCover')body.querySelectorAll('li,.item-block,.proj-card,.warranty-card,.journey-step,.hero-tile,.kpi-card,.inc-card,.sp-panel').forEach(e=>{if(!candidates.includes(e))candidates.push(e);});
  candidates.filter(e=>!e.matches('script,style,.spacer,.rule-orange')&&(e.textContent.trim()||e.querySelector('img,canvas,svg')||e.matches('img,canvas,svg'))).forEach(node=>{
   const key=path(node,page),labels={'v_exKpis':'System key figures','v_exIncluded':'Included scope','v_abStats':'Company figures','v_abFeatures':'Company features'};
   const preferred=node.matches('h1,h2,h3,.sec-label,.sp-section-label')?node.textContent:labels[node.id]||node.querySelector('.ht-l,.kpi-l,.inc-t,.sp-section-label,h1,h2,h3,strong,b')?.textContent;
   blocks.push({key,node,label:(preferred||node.querySelector('img')?.alt||node.textContent||'Chart / diagram').trim().slice(0,100)});
  });
  const walk=document.createTreeWalker(page,NodeFilter.SHOW_TEXT);let node;
  while((node=walk.nextNode())){
   const text=node.nodeValue.trim(),parent=node.parentElement;if(!text||!parent||parent.closest('script,style,noscript,[data-doc-added]'))continue;
   let hidden=false;for(let n=parent;n&&n!==page;n=n.parentElement)if(n.hidden||getComputedStyle(n).display==='none'){hidden=true;break;}if(hidden)continue;
   const chrome=!!parent.closest('.pg-head,.pg-foot,footer,.power-header,.power-head');
   const staticKey=id+'|'+path(parent,page)+'::'+[...parent.childNodes].indexOf(node),authored=strings.has(text)||staticText.get(staticKey)===text;
   const source=sources.find(([key,value])=>!['propVersion','validityDays'].includes(key)&&(value.trim()===text||!authored&&text.includes(value.trim())));
   const numeric=/[0-9₹%]/.test(text)&&!strings.has(text)&&staticText.get(staticKey)!==text;
   const graphic=!!parent.closest('svg,canvas');
   const live=chrome||!!source||numeric||!!parent.closest('[data-head-ref],[data-foot-company],.ht-v,.kpi-v,.sp-metric>strong,.sp-row>b,.sp-price,.metric-value,.inv-total-value,.ktm-cover__preparer');
   const key=path(parent,page)+'::'+[...parent.childNodes].indexOf(node);
   texts.push({key,node,from:node.nodeValue,label:text,locked:live||graphic,reason:graphic?'Diagram / chart output':chrome?'Live page furniture':source?'Linked quotation input':numeric?'Live / derived value':'Calculated value',source:source?.[0]});
  }
  const images=[...page.querySelectorAll('img')].map(n=>({label:n.alt||'Page photograph',src:n.getAttribute('src')}));
  return {texts,blocks,images};
 }
 function createPage(id,title,origin){
  const page=el('section','page studio-continuation');page.id=id;
  const template=$(origin)||$('pageExec');
  for(const selector of [':scope > .pg-head',':scope > .pg-foot']){
   const n=template?.querySelector(selector)||$('pageExec')?.querySelector(selector);if(n){const c=n.cloneNode(true);c.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));c.removeAttribute('id');page.append(c);}
  }
  const body=el('div','pg-body');page.insertBefore(body,page.querySelector('footer'));
  const wrap=el('div','page-wrap');wrap.dataset.page=id;wrap.dataset.docAdded='true';
  wrap.append(el('div','page-label',title),page);
  const source=$(origin)?.closest('.page-wrap');if(source)source.after(wrap);else (document.querySelector('.preview-panel')||$('sharePages')).append(wrap);
  return page;
 }
 function installCustom(){
  basePages.forEach(p=>{const original=originalVisibility.get(p);p.visible=s=>!config(p.id).excluded&&(!original||original(s));});
  customPages().filter(p=>p.format!=='power').forEach(item=>{
   const page=createPage(item.id,item.title,item.after||'pageClosing');
   const heading=el('h2','pg-title',item.title);page.querySelector('.pg-body').append(heading);
   const p={id:item.id,nav:escapeHtml(item.title),title:item.title,visible:s=>!config(item.id).excluded&&sourceEnabled(item.id,s),render:()=>{}};
   let at=root.Render.PAGES.findIndex(p=>p.id===item.after);root.Render.PAGES.splice(at<0?root.Render.PAGES.length:at+1,0,p);extensions.push(p);
  });
 }
 function addBlock(body,b){
  const section=el('section','doc-user-block');section.dataset.docAdded='true';section.id='docBlock-'+b.id;
  if(b.title)section.append(el('h3','',b.title));
  if(b.kind==='image'&&/^data:image\/(png|jpeg|webp);base64,/.test(b.image||'')){const img=el('img');if(b.width&&b.height){img.width=b.width;img.height=b.height;}img.src=b.image;img.alt=b.title||'Supplied photograph';section.append(img);}
  else if(b.kind==='list'){const ul=el('ul');b.body.split('\n').filter(Boolean).forEach(line=>ul.append(el('li','',line)));section.append(ul);}
  else b.body.split(/\n\s*\n/).filter(Boolean).forEach(t=>section.append(el('p','',t)));
  body.append(section);return section;
 }
 function fragments(node){
  if(node.matches('table')){
   const rows=[...node.querySelectorAll(':scope>tbody>tr')];
   const tableFor=row=>{const table=node.cloneNode(false);table.removeAttribute('id');for(const chrome of node.querySelectorAll(':scope>colgroup,:scope>thead'))table.append(chrome.cloneNode(true));const body=el('tbody');body.append(row);table.append(body);table.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));return table;};
   if(rows.length>1)return rows.map(row=>tableFor(row.cloneNode(true)));
   if(rows.length===1&&!rows[0].querySelector('svg,canvas,img')){
    const cells=[...rows[0].children],cell=cells.slice().sort((a,b)=>b.textContent.length-a.textContent.length)[0];
    if(cell){const p=el('p','',cell.textContent),parts=fragments(p);if(parts?.length>1)return parts.map((part,i)=>{const row=rows[0].cloneNode(true);[...row.children].forEach((c,j)=>{if(j===cells.indexOf(cell))c.textContent=part.textContent;else if(i)c.textContent='';});return tableFor(row);});}
   }return null;
  }
  // Only break oversized text at word boundaries, never split a chart/image.
  if(node.matches('p,li,h1,h2,h3,h4')&&!node.querySelector('img,svg,canvas,table')){
   const words=node.textContent.match(/\S+\s*|\s+/g)||[],out=[];
   const size=Math.min(65,Math.ceil(words.length/2));
   if(words.length===1&&words[0].length>120){const letters=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(words[0])].map(s=>s.segment);for(let i=0;i<letters.length;i+=120){const c=node.cloneNode(false);c.removeAttribute('id');c.textContent=letters.slice(i,i+120).join('');out.push(c);}return out;}
   for(let i=0;i<words.length;i+=size){const c=node.cloneNode(false);c.removeAttribute('id');c.textContent=words.slice(i,i+size).join('');out.push(c);}return out;
  }
  if(!node.matches('svg,canvas,img,table')&&node.children.length===1){
   const childParts=fragments(node.firstElementChild);
   if(childParts?.length>1)return childParts.map(child=>{const c=node.cloneNode(false);c.removeAttribute('id');c.style.height='auto';c.style.minHeight='0';c.style.overflow='visible';c.append(child);return c;});
  }
  if(!node.matches('svg,canvas,img,table')&&node.children.length>1){
   return [...node.childNodes].filter(n=>n.nodeType===1||n.nodeType===3&&n.nodeValue.trim()).map(child=>{const c=node.cloneNode(false);c.removeAttribute('id');c.style.height='auto';c.style.minHeight='0';c.style.overflow='visible';c.append(child.cloneNode(true));return c;});
  }return null;
 }
 const layoutErrors=[];let powerErrors=[];
 function paginate(page,id,addContinuation){
  const body=page.querySelector('.pg-body,.power-body');if(!body)return;
  classOn(page,'doc-flow');
  const scale=page.getBoundingClientRect().width/page.offsetWidth||1;
  let current=page,target=body,index=0;
  const fits=()=>{
   const footer=current.querySelector('footer'),limit=(footer?.getBoundingClientRect().top||current.getBoundingClientRect().bottom-34)-8*scale;
   return [...target.children].every(n=>!n.getClientRects().length||n.getBoundingClientRect().bottom<=limit+1)&&current.scrollHeight<=current.clientHeight+2;
  };
  const next=()=>{
   if(index>=60||extensions.length>=100)throw new Error('Document is too long (60 continuation pages). Split the content into smaller sections.');
   current=addContinuation(++index);target=current.querySelector('.pg-body,.power-body');classOn(current,'doc-flow');
  };
  function place(node,depth=0){
   target.append(node);
   if(fits())return;
   node.remove();
   if(target.children.length){next();target.append(node);if(fits())return;node.remove();}
   const parts=depth<10?fragments(node):null;
   if(parts&&parts.length>1){parts.forEach(part=>place(part,depth+1));return;}
   target.append(node);layoutErrors.push({page:id,message:'A graphic/table or single block cannot fit readably. Split/remove that block before exporting.'});
  }
  // A placeholder restores moved original nodes before the next canonical render.
  const nodes=[...body.children].filter(n=>getComputedStyle(n).display!=='none');
  nodes.forEach(n=>{if(n.hasAttribute('data-doc-added'))n.remove();else {const slot=document.createComment('document flow');n.before(slot);remember(()=>{if(slot.parentNode)slot.replaceWith(n);});n.remove();}});
  try{nodes.forEach(n=>place(n));}catch(e){layoutErrors.push({page:id,message:e.message});}
 }
 function reindex(){
  const s=root.Render.lastState||{},pages=root.Render.PAGES.filter(p=>!p.visible||p.visible(s));
  root.Render.lastVisible.splice(0,root.Render.lastVisible.length,...pages);
  pages.forEach((p,i)=>{
   const node=$(p.id),wrap=node?.closest('.page-wrap');if(wrap)wrap.style.display='';
   if(wrap?.querySelector('.page-label'))wrap.querySelector('.page-label').textContent='Page '+(i+1)+' of '+pages.length+' — '+p.title;
   const number=node?.querySelector('.pf-right,footer .power-page-number');if(number)number.textContent='Page '+(i+1)+' of '+pages.length;
  });
  basePages.filter(p=>!pages.includes(p)).forEach(p=>{const w=$(p.id)?.closest('.page-wrap');if(w)w.style.display='none';});
  document.querySelectorAll('.studio-page-count').forEach(e=>e.textContent=pages.length+' pages');
  if(root.Bess.included(s)){const battery=pages.map((p,i)=>({id:p.id,n:i+1})).filter(p=>belongs(p,'bess')),sub=$('v_exSub');if(sub)sub.textContent='Solar system highlights • '+(battery.length?'battery supplement on '+(battery.length===1?'page '+battery[0].n:'pages '+battery[0].n+'–'+battery.at(-1).n):'battery supplement omitted');}
 }
 function apply(page,id,continuation){
  const scanResult=scan(page,id);samples.set(id,scanResult);
  const v=variant(id),textMap=v.texts||{},hidden=new Set(v.hidden||[]);
  let changed=false;
  for(const item of scanResult.texts){const saved=textMap[item.key];if(!saved||item.locked||typeof saved.from!=='string'||typeof saved.value!=='string'||saved.value.length>20000)continue;
   if(saved.from.trim()!==item.from.trim()){status='Some source wording changed. Review overrides before issuing.';continue;}
   const old=item.node.nodeValue;item.node.nodeValue=saved.value;remember(()=>item.node.nodeValue=old);if(!item.node.parentElement.textContent.trim()&&!item.node.parentElement.querySelector('img,canvas,svg'))style(item.node.parentElement,'display','none');changed=true;
  }
  scanResult.blocks.forEach(b=>{if(hidden.has(b.key)){
   style(b.node,'display','none');changed=true;
   const label=b.node.previousElementSibling;if(label?.matches('.sec-label,.sp-section-label'))style(label,'display','none');
   const parent=b.node.parentElement;if(getComputedStyle(parent).display==='grid')classOn(parent,'doc-reflow-grid');
  }});
  let body=page.querySelector('.pg-body,.power-body');
  const additions=(v.blocks||[]).filter(b=>!b.removed);
  if(changed||additions.length){
   if(!body&&id!=='pageCover'){
    body=el('div','pg-body');page.insertBefore(body,page.querySelector('footer'));const temporary=body;remember(()=>temporary.remove());
    [...page.children].filter(n=>n!==body&&!n.matches('header,footer')).forEach(n=>move(n,body));
   }
   if(body){const photo=page.querySelector(':scope > .photo-top');if(photo)move(photo,body,body.firstChild);if(id==='pageClosing'){const hero=body.querySelector('.closing-banner>.closing-hero'),banner=body.querySelector('.closing-banner');if(hero)move(hero,body,banner.nextSibling);}}
  }
  if(id==='pageCover'&&additions.length){
   const first=continuation(1),target=first.querySelector('.pg-body');additions.forEach(b=>addBlock(target,b));
   paginate(first,id,index=>continuation(index+1));return;
  }
  if(body)(v.blocks||[]).filter(b=>!b.removed).forEach(b=>{addBlock(body,b);changed=true;});
  if(changed&&body){
   // Collapse empty card wrappers as well as their removed children.
   [...body.querySelectorAll('*')].reverse().forEach(parent=>{if(parent.children.length&&[...parent.children].every(n=>getComputedStyle(n).display==='none')&&![...parent.childNodes].some(n=>n.nodeType===3&&n.nodeValue.trim())){style(parent,'display','none');const label=parent.previousElementSibling;if(label?.matches('.sec-label,.sp-section-label'))style(label,'display','none');}});
   paginate(page,id,continuation);
  }
 }
 // Renderer-compatible optional cover metadata. Keep the original artwork
 // and calculation/render files unchanged; blank/whitespace names show nothing.
 function syncCoverPreparer(){
  const row=$('v_coverPrepRow'),name=$('v_coverPrepBy'),artwork=$('coverArtwork')?.parentElement;
  if(!row||!name||!artwork)return;
  const value=String(root.Render.lastState?.prepName||'').trim();
  row.hidden=!value;row.style.display=value?'flex':'none';name.textContent=value;
  if(!value){name.removeAttribute('title');return;}
  const start=14*artwork.clientWidth/1060;
  let size=start;name.style.fontSize=size+'px';
  while(size>7.5&&(name.scrollHeight>name.clientHeight+1||name.scrollWidth>name.clientWidth+1)){
   size=Math.max(7.5,size-.25);name.style.fontSize=size+'px';
  }
  name.title=value;
 }
 function applyDetailed(){
  syncCoverPreparer();
  layoutErrors.length=0;status='';
  const originals=root.Render.PAGES.slice();
  originals.forEach(p=>{
   const page=$(p.id);if(!page)return;
   apply(page,p.id,index=>{
    const id=p.id+'-continuation-'+index,created=createPage(id,p.title+' · continued',p.id);
    const previous=$(p.id+'-continuation-'+(index-1))?.closest('.page-wrap');if(previous)previous.after(created.closest('.page-wrap'));
    const record={id,title:p.title+' · continued',nav:p.nav+' +'+index,render:()=>{},visible:s=>!config(p.id).excluded&&sourceEnabled(p.id,s)};
    const at=root.Render.PAGES.indexOf(p)+index;root.Render.PAGES.splice(at,0,record);extensions.push(record);return created;
   });
  });
  if(CONTENT[KEY]){reindex();const label=$('downloadLabel');if(label&&$('pdfFormat')?.value==='full')label.textContent='Generate & Download PDF ('+root.Render.lastVisible.length+' Pages)';}
  if(hasEdits())updateDocumentLabels();
  updateStatus();
  if(!ownEdit&&$('documentStudio'))buildEditor();
 }
 root.Render.renderAll=function(...args){reset();installCustom();return originalRender.apply(root.Render,args);};
 document.addEventListener('qs:rendered',applyDetailed);
 function ensurePower(){
  const host=canonicalPower(root.Render.lastState||root.Render.readState());host.dataset.docAdded='true';
  [...host.children].forEach((page,i)=>page.dataset.docKey='power'+(i+1));
  customPages().filter(p=>p.format==='power').forEach(item=>{
   const page=el('section','page power-page power-six');page.dataset.docKey=item.id;
   const template=host.firstElementChild;page.append(template.querySelector('header').cloneNode(true));const body=el('div','power-body');body.append(el('h2','',item.title));page.append(body,template.querySelector('footer').cloneNode(true));
   const after=[...host.children].find(p=>p.dataset.docKey===item.after);if(after)after.after(page);else host.append(page);
  });
  [...host.children].forEach(page=>samples.set(page.dataset.docKey,scan(page,page.dataset.docKey)));
  return host;
 }
 function powerDocument(){
  const savedUndo=undo,savedErrors=layoutErrors.slice();undo=[];layoutErrors.length=0;
  const host=ensurePower(),pages=[...host.children];
  pages.forEach(p=>{const key=p.dataset.docKey;if(config(key).excluded){p.remove();return;}apply(p,key,index=>{
   const c=el('section','page power-page power-six studio-continuation');
   const head=p.querySelector('header')?.cloneNode(true),foot=p.querySelector('footer')?.cloneNode(true);if(head)c.append(head);c.append(el('div','power-body'));if(foot)c.append(foot);
   const after=[...host.children].filter(n=>n===p||n.dataset.docOrigin===key).at(-1);after.after(c);c.dataset.docOrigin=key;return c;
  });});
  [...host.children].forEach((p,i)=>{const n=p.querySelector('footer span:last-child,.pf-right');if(n)n.textContent='Page '+(i+1)+' of '+host.children.length;const h=p.querySelector('.power-head>div')?.firstChild;if(h?.nodeType===3)h.nodeValue='POWER PROPOSAL · '+(i+1)+' / '+host.children.length;});powerErrors=layoutErrors.slice();layoutErrors.splice(0,layoutErrors.length,...savedErrors);undo=savedUndo;return host;
 }
 function pageList(){return [...basePages,...customPages().filter(p=>p.format!=='power').map(p=>({id:p.id,title:p.title}))];}
 function heading(text){return el('h3','doc-editor-heading',text);}
 function button(text,fn){const b=el('button','link-btn',text);b.type='button';b.addEventListener('click',fn);return b;}
 function field(parent,label,value,handler,readonly=false,maxLength=20000){
  const w=el('div','field'),l=el('label','',label),t=el('textarea');t.rows=value.length>100?3:2;t.value=value;t.maxLength=maxLength;t.readOnly=readonly;
  const id='docEdit-'+uid();t.id=id;l.htmlFor=id;
  t.addEventListener('input',e=>{e.stopPropagation();if(!readonly)handler(t.value);});w.append(l,t);parent.append(w);return t;
 }
 function updateStatus(){const n=$('documentStudioStatus'),errors=report==='power'?powerErrors:layoutErrors;if(n)n.textContent=errors.length?errors.map(e=>e.message).join(' '):status||'Changes stay with this proposal. Extra content continues on another A4 page.';}
 function refreshEditor(){ownEdit=false;buildEditor();}
 function buildEditor(){
  const host=$('documentStudio');if(!host)return;
  const owner=root.Proposals?.activeId?.()||'share',ownerChanged=uiOwner!==owner;if(ownerChanged){uiOwner=owner;history=[];future=[];}
  const active=host.contains(document.activeElement),oldFocus=document.activeElement;if(!ownerChanged&&active&&oldFocus?.matches('textarea'))return;
  host.replaceChildren();host.append(heading('Pages, sections & text'));
  const controls=el('div','doc-editor-controls'),format=el('select'),picker=el('select');
  format.setAttribute('aria-label','Document format to edit');format.add(new Option('Detailed proposal & system reports','full'));format.add(new Option('Power proposal','power'));format.value=report;
  format.addEventListener('change',()=>{report=format.value;selected=report==='power'?'power1':'pageExec';if(report==='power'){const h=ensurePower();h.remove();}refreshEditor();});
  picker.setAttribute('aria-label','Page to edit');
  const pages=report==='power'?[...Array.from({length:6},(_,i)=>({id:'power'+(i+1),title:'Power '+(i+1)})),...customPages().filter(p=>p.format==='power')]:pageList();
  if(!pages.some(p=>p.id===selected))selected=pages[0].id;
  pages.forEach(p=>picker.add(new Option(p.title+(config(p.id).excluded?' · removed':''),p.id)));picker.value=selected;
  picker.addEventListener('change',()=>{selected=picker.value;refreshEditor();});controls.append(format,picker);host.append(controls);
  const tools=el('div','doc-editor-actions');
  tools.append(button('Undo',()=>{if(!history.length)return;future.push(JSON.stringify(store()));CONTENT[KEY]=JSON.parse(history.pop());root.Render.renderAll();root.__qsScheduleSave?.();}),button('Redo',()=>{if(!future.length)return;history.push(JSON.stringify(store()));CONTENT[KEY]=JSON.parse(future.pop());root.Render.renderAll();root.__qsScheduleSave?.();}),button('Refresh page text',refreshEditor));host.append(tools);
  const note=el('p','hint');note.id='documentStudioStatus';host.append(note);updateStatus();
  {
   const removed=!!config(selected).excluded;
   host.append(button(removed?'Restore this page':'Remove this page',()=>{edit(selected,(v,c)=>c.excluded=!removed);refreshEditor();}));
   host.append(button('Add a page after this',()=>{if(customPages().length>=30){status='This document already has 30 custom pages. Restore or edit an existing page.';updateStatus();return;}const id='studioPage-'+uid();change(()=>{const d=CONTENT[KEY]||(CONTENT[KEY]={version:1,pages:{},customPages:[]});d.customPages.push({id,title:'New page',after:selected,format:report});});selected=id;refreshEditor();}));
  }
  tools.append(button('View page ↗',()=>{
   if(report==='full'){const page=$(selected);if(page?.closest('.page-wrap').style.display!=='none')page?.scrollIntoView({block:'start',behavior:'smooth'});return;}
   const preview=powerDocument(),dialog=el('dialog','doc-preview-dialog');preview.classList.add('doc-power-preview');dialog.append(button('Close preview',()=>dialog.close()),preview);dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
  }));
  if(report==='power'){const power=ensurePower();power.remove();}
  const base=basePages.find(p=>p.id===ancestor(selected)),condition=base&&originalVisibility.get(base);
  if(condition&&!condition(root.Render.lastState||{})){
   host.append(el('p','hint','This optional page is not populated for the current setup. Enable its original system/financing/comparison controls first.'));
   const source=/Bess|System|Rainwater/.test(ancestor(selected))?'advancedSystemSelect':ancestor(selected)==='pageFinance'?'loanAmt':'optName';host.append(button('Open source controls',()=>root.__qsPreflight?.reveal?.(source)));return;
  }
  const custom=customPages().find(p=>p.id===selected);
  if(custom)field(host,'New page title',custom.title,value=>{change(()=>{CONTENT[KEY].customPages.find(p=>p.id===selected).title=value.slice(0,300);});});
  const sample=samples.get(selected);
  if(!sample){host.append(el('p','hint','Enable this optional system/report in its original controls to populate this page.'));return;}
  const sections=el('details','doc-editor-panel');sections.open=false;sections.append(el('summary','','Sections & cards'));
  const hidden=new Set(variant(selected).hidden||[]);
  sample.blocks.forEach(b=>{const row=el('div','doc-block-row');row.append(el('span','',(b.node.parentElement===b.node.closest('.pg-body,.power-body')?'':'↳ ')+(b.label||'Section')),button(hidden.has(b.key)?'Restore':'Remove',()=>{edit(selected,v=>{const set=new Set(v.hidden||[]);set.has(b.key)?set.delete(b.key):set.add(b.key);v.hidden=[...set];});refreshEditor();}));sections.append(row);});host.append(sections);
  const words=el('details','doc-editor-panel');words.open=true;words.append(el('summary','','Every rendered text · '+sample.texts.length+' entries'));
  const filter=el('input');filter.type='search';filter.id='docTextSearch';filter.placeholder='Find any word on this page…';filter.setAttribute('aria-label','Find page text');
  filter.addEventListener('input',event=>{event.stopPropagation();const q=filter.value.toLocaleLowerCase();words.querySelectorAll('[data-doc-text-key]').forEach(row=>{row.hidden=!(row.dataset.docSearch||'').includes(q);if(q&&!row.hidden&&row.closest('.doc-protected-text'))row.closest('.doc-protected-text').open=true;});});words.append(filter);
  words.append(el('p','hint','Live numbers/linked details are protected. Edit them in the original quotation controls. Image lettering stays fixed.'));
  const protectedText=el('details','doc-protected-text');protectedText.append(el('summary','','Linked / calculated entries · '+sample.texts.filter(t=>t.locked).length));
  const textMap=variant(selected).texts||{};
  sample.texts.forEach(item=>{
   const saved=textMap[item.key],value=saved&&typeof saved.from==='string'&&typeof saved.value==='string'&&saved.value.length<=20000&&saved.from.trim()===item.from.trim()?saved.value:item.from;
   const t=field(item.locked?protectedText:words,item.locked?item.reason:item.label.slice(0,75),value,value=>edit(selected,v=>{v.texts||={};v.texts[item.key]={from:item.from,value};}),item.locked);
   t.parentElement.dataset.docTextKey=item.key;t.parentElement.dataset.docSearch=(item.label+' '+value).toLocaleLowerCase();
   if(item.locked){t.classList.add('doc-live-value');if(item.source&&$(item.source))t.after(button('Go to '+item.source,()=>{root.__qsPreflight?.reveal?.(item.source);}));}
   else t.after(button('Restore original wording',()=>{edit(selected,v=>delete v.texts?.[item.key]);refreshEditor();}));
  });words.append(protectedText);host.append(words);
  const additions=el('details','doc-editor-panel');additions.open=true;additions.append(el('summary','','New sections'));
  (variant(selected).blocks||[]).forEach(b=>{
   const card=el('div','doc-user-editor');card.append(button(b.removed?'Restore section':'Remove section',()=>{edit(selected,v=>v.blocks.find(x=>x.id===b.id).removed=!b.removed);refreshEditor();}));
   if(!b.removed){field(card,'Section heading',b.title,value=>edit(selected,v=>v.blocks.find(x=>x.id===b.id).title=value),false,300);if(b.kind!=='image')field(card,b.kind==='list'?'One bullet per line':'Paragraphs (blank line between)',b.body,value=>edit(selected,v=>v.blocks.find(x=>x.id===b.id).body=value));}additions.append(card);
  });
  for(const kind of ['text','list'])additions.append(button(kind==='text'?'+ Text section':'+ Bullet list',()=>{edit(selected,v=>{v.blocks||=[];v.blocks.push({id:uid(),kind,title:'New section',body:'Enter your text here.'});});refreshEditor();}));
  const upload=el('input');upload.type='file';upload.accept='image/png,image/jpeg,image/webp';upload.setAttribute('aria-label','Add a photograph section');
  upload.addEventListener('change',async()=>{const file=upload.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1024*1024){status='Use a PNG, JPEG or WebP under 1 MB.';updateStatus();return;}
   const owner=root.Proposals.activeId(),pageId=selected;let data;try{data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}catch{status='The photograph could not be read. Choose the file again.';updateStatus();return;}
   if(root.Proposals.activeId()!==owner||selected!==pageId)return;
   const image=new Image();image.src=data;try{await image.decode();if(image.naturalWidth*image.naturalHeight>20000000)throw new Error('Too many pixels');}catch{status='This image could not be decoded.';updateStatus();return;}
   if(root.Proposals.activeId()!==owner||selected!==pageId)return;
   edit(selected,v=>{v.blocks||=[];v.blocks.push({id:uid(),kind:'image',title:file.name.replace(/\.[^.]+$/,''),body:'',image:data,width:image.naturalWidth,height:image.naturalHeight});});refreshEditor();
  });additions.append(upload);host.append(additions);
  host.append(el('p','hint',sample.images.length+' existing photograph(s)/artwork kept unchanged. Use Page photographs or project uploads to replace originals.'));
 }
 function hasEdits(){return !!(customPages().length||Object.keys(store().pages).length);}
 async function exportDocument(format='full',statusCb=()=>{}){
  if(busy)throw new Error('A document export is already running.');busy=true;let snapshot,power;
  try{
   root.Render.renderAll(root.QS_SHARE?root.Render.lastState:undefined);
   const signature=()=>JSON.stringify([root.Proposals?.activeId?.(),CONTENT,root.Render.lastState,root.__qsPageImages]),before=signature();
   const ensureUnchanged=()=>{if(signature()!==before)throw new Error('Quotation changed while preparing the PDF. Download again to capture the current proposal.');};
   await sourceReady;if(!sourceVerified)throw new Error('Could not verify static captions. Reload before issuing.');await document.fonts.ready;await root.Experience.whenReady();
   await Promise.all([...document.querySelectorAll('.preview-panel img,#sharePages img')].filter(i=>i.currentSrc||i.src).map(i=>i.decode().catch(()=>{})));
   ensureUnchanged();root.Render.renderAll(root.QS_SHARE?root.Render.lastState:undefined);
   let pending;do{pending=root.Experience.whenReady();await pending;}while(pending!==root.Experience.whenReady());ensureUnchanged();
   const savedState=JSON.parse(JSON.stringify(root.Render.lastState));
   if(format==='power'){power=powerDocument();snapshot=power;if(!power.children.length)throw new Error('Restore at least one Power page before exporting.');}
   else{
    const s=root.Render.lastState;let pages=root.Render.lastVisible;
    if(format==='bess'&&!root.Bess.enabled(s))throw new Error('Enable BESS first.');
    if(format.startsWith('system')&&!root.AdditionalSystems.enabled(s))throw new Error('Enable an additional system first.');
    if(format==='bess')pages=pages.filter(p=>belongs(p,'bess'));
    if(format==='system')pages=pages.filter(p=>belongs(p,'system'));
    if(format==='system-power')pages=pages.filter(p=>belongs(p,'system-power'));
    if(!pages.length)throw new Error('Restore at least one page before exporting.');
    snapshot=el('div','pdf-snapshot');snapshot.dataset.docAdded='true';
    pages.forEach(p=>{const src=$(p.id),copy=src.cloneNode(true);copy.style.transform='none';copy.querySelectorAll('img[data-print-src]').forEach(i=>{i.src=i.dataset.printSrc;i.removeAttribute('srcset');i.removeAttribute('sizes');});
     copy.querySelectorAll('[data-head-ref],[data-foot-company],[data-foot-tagline]').forEach(n=>['data-head-ref','data-foot-company','data-foot-tagline'].forEach(a=>n.removeAttribute(a)));
     copy.querySelectorAll('[data-engineering-open]').forEach(btn=>{const a=el('a',btn.className.replace(/\bscreen-only\b/g,''));a.append(...[...btn.childNodes].map(n=>n.cloneNode(true)));const url=root.Render.requestFormUrl();if(url)a.href=url;btn.replaceWith(a);});
     const originals=src.querySelectorAll('canvas');copy.querySelectorAll('canvas').forEach((c,i)=>c.getContext('2d').drawImage(originals[i],0,0));snapshot.append(copy);});document.body.append(snapshot);
   }
   const relevant=format==='power'?powerErrors:layoutErrors;
   if(relevant.length)throw new Error(relevant.map(e=>e.message).join(' '));
   await Promise.all([...snapshot.querySelectorAll('img')].map(i=>Promise.race([i.decode(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('An image did not load in time.')),20000))])));
   const pages=[...snapshot.children];
   if(format!=='power')pages.forEach((page,index)=>{const number=page.querySelector('.pf-right');if(number)number.textContent='Page '+(index+1)+' of '+pages.length;});
   const pdf=new root.jspdf.jsPDF({unit:'pt',format:'a4',compress:true}),w=pdf.internal.pageSize.getWidth(),h=pdf.internal.pageSize.getHeight();
   for(let i=0;i<pages.length;i++){
    const page=pages[i];if(page.scrollHeight>page.clientHeight+2)throw new Error('Content does not fit. Split the oversized section before exporting.');
    statusCb('Rendering page '+(i+1)+' of '+pages.length+'…');const canvas=await root.html2canvas(page,{scale:2,useCORS:true,backgroundColor:'#fff',logging:false});if(i)pdf.addPage();pdf.addImage(canvas.toDataURL('image/jpeg',.92),'JPEG',0,0,w,h,undefined,'FAST');
    const bounds=page.getBoundingClientRect();page.querySelectorAll('a[href]').forEach(a=>{const url=root.Render.safeHttpUrl(a.href),r=a.getBoundingClientRect();if(url&&r.width&&r.height)pdf.link((r.left-bounds.left)/bounds.width*w,(r.top-bounds.top)/bounds.height*h,r.width/bounds.width*w,r.height/bounds.height*h,{url});});
   }
   pdf.setProperties({title:'Solar Proposal — '+(savedState.custName||'Customer'),author:savedState.companyName,creator:'Quotation Studio'});
   pdf.save((format==='power'?'Power_Proposal_':format==='full'?'Proposal_':'System_Report_')+(savedState.custName||'Customer').replace(/[^a-z0-9]/gi,'_')+'.pdf');statusCb('Downloaded ✓ ('+pages.length+' pages)');
  }finally{snapshot?.remove();busy=false;}
 }
 let powerCountCache={key:'',count:6};
 function updateDocumentLabels(){
  const d=store(),powerCustom=customPages().filter(p=>p.format==='power'),powerKeys=new Set(powerCustom.map(p=>p.id)),powerConfigs=Object.entries(d.pages).filter(([id])=>/^power[1-6]$/.test(id)||powerKeys.has(id));
  let count=6;
  if(powerCustom.length||powerConfigs.length){const key=JSON.stringify([root.Render.lastState,powerConfigs,powerCustom]);if(key!==powerCountCache.key){const host=powerDocument();powerCountCache={key,count:host.children.length};host.remove();}count=powerCountCache.count;}
  const pages=root.Render.lastVisible||[],counts={full:pages.length,power:count,bess:pages.filter(p=>belongs(p,'bess')).length,system:pages.filter(p=>belongs(p,'system')).length,'system-power':pages.filter(p=>belongs(p,'system-power')).length};
  const select=$('pdfFormat'),format=select?.value||'full';
  if(select){for(const option of select.options){const n=counts[option.value];if(option.value==='power')option.textContent='Power Proposal - '+n+'-page report';else if(option.value!=='full')option.textContent=option.textContent.replace(/ · \d+ pages?$/,' · '+n+(n===1?' page':' pages'));}}
  const label=$('downloadLabel');if(label)label.textContent=(format==='full'?'Generate & Download PDF':format==='power'?'Download Power Proposal':'Download report')+' ('+counts[format]+' Pages)';
  document.querySelectorAll('[data-export-format]').forEach(b=>{const n=counts[b.dataset.exportFormat];if(n!==undefined)b.textContent=b.textContent.replace(/ · \d+ pages?$/,' · '+n+(n===1?' page':' pages'));});
 }
 const legacyUpdateLabel=root.Exporter.updateLabel;
 root.Exporter.updateLabel=function(){legacyUpdateLabel.apply(this,arguments);if(hasEdits())updateDocumentLabels();};
 document.addEventListener('change',event=>{if(event.target.id==='pdfFormat'&&hasEdits())updateDocumentLabels();});
 function reviewExport(issues){
  return new Promise(resolve=>{
   const dialog=el('dialog','doc-export-review');dialog.id='docExportReview';const blocking=issues.blocking||[],advisory=issues.advisory||[];
   const title=el('h2','',blocking.length?'Fix these issues before downloading':'Review before downloading');title.id='docExportReviewTitle';dialog.setAttribute('aria-labelledby',title.id);dialog.append(title);
   const list=el('ul');for(const issue of [...blocking,...advisory])list.append(el('li','',issue.message));dialog.append(list);
   const actions=el('div','doc-editor-toolbar');const settle=ok=>{dialog.remove();resolve(ok);};
   if(blocking.length)actions.append(button('Fix the first issue',()=>{settle(false);root.__qsPreflight?.reveal?.(blocking[0].id||'advancedPanel');}));
   else actions.append(button('Download anyway',()=>settle(true)));
   actions.append(button('Close',()=>settle(false)));dialog.append(actions);dialog.addEventListener('cancel',e=>{e.preventDefault();settle(false);});document.body.append(dialog);
   try{dialog.showModal();}catch{settle(!blocking.length&&root.confirm(title.textContent+'\n\n'+advisory.map(i=>i.message).join('\n')));}
  });
 }
 const legacyExport=root.Exporter.exportPdf;
 root.Exporter.exportPdf=function(callback,options){return hasEdits()?exportDocument(options?.format||'full',callback):legacyExport.apply(this,arguments);};
 function boot(){
  const panel=$('advancedPanel');if(panel){
   const host=el('section','document-studio');host.id='documentStudio';
   const legacy=el('details','doc-editor-panel');legacy.append(el('summary','','Template wording & project photographs'),$('advContainer'));panel.append(host,legacy);buildEditor();
  }
  const preflight=root.__qsPreflight;if(preflight){for(const name of ['run','issues']){const original=preflight[name];preflight[name]=function(...args){const value=original.apply(preflight,args),errors=$('pdfFormat')?.value==='power'?powerErrors:layoutErrors;return {...value,blocking:[...(value.blocking||[]),...errors.map(e=>({id:'advancedPanel',message:e.message}))]};};}}
  let gatePending=false;
  document.addEventListener('click',async event=>{
   if(!hasEdits())return;const button=event.target.closest('#downloadBtn,[data-export-format]');if(!button)return;
   event.preventDefault();event.stopImmediatePropagation();if(busy||gatePending)return;gatePending=true;
   try{
    const format=button.dataset.exportFormat||$('pdfFormat')?.value||'full';if(format==='power')powerDocument().remove();
    const issues=root.__qsPreflight?.run?.()||{};
    if((issues.blocking?.length||issues.advisory?.length)&&!await reviewExport(issues))return;
    root.__qsSaveNow?.();button.disabled=true;button.classList.add('busy');
    await exportDocument(format,m=>{if($('statusMsg'))$('statusMsg').textContent=m;});
   }catch(e){status=e.message;updateStatus();if($('statusMsg'))$('statusMsg').textContent=e.message;}
   finally{button.disabled=false;button.classList.remove('busy');gatePending=false;}
  },true);
 }
 document.addEventListener('DOMContentLoaded',boot);
 function setText(id,key,value){const item=samples.get(id)?.texts.find(t=>t.key===key);if(!item||item.locked)throw new Error('Live/calculated output is protected. Use the original quotation input.');if(typeof value!=='string'||value.length>20000)throw new Error('Use up to 20,000 characters per text entry.');edit(id,v=>{v.texts||={};v.texts[key]={from:item.from,value};});}
 function addTextBlock(id,title,body,kind='text'){if(!['text','list'].includes(kind)||typeof body!=='string'||body.length>100000)throw new Error('Use text/list sections up to 100,000 characters.');const blockId=uid();edit(id,v=>{v.blocks||=[];v.blocks.push({id:blockId,title:String(title).slice(0,300),body,kind});});return blockId;}
 function searchEntries(){const result=[];for(const [pageId,sample] of samples){if(pageId.startsWith('power'))continue;const page=pageList().find(p=>p.id===pageId);if(!page)continue;for(const t of sample.texts){if(t.locked)continue;result.push({label:t.label,section:page.title+' › Page text',activate(){report='full';selected=pageId;$('advancedPanel').open=true;buildEditor();const row=[...$('documentStudio').querySelectorAll('[data-doc-text-key]')].find(e=>e.dataset.docTextKey===t.key);if(row){row.closest('details').open=true;row.scrollIntoView({block:'center'});row.querySelector('textarea').focus({preventScroll:true});}}});}}return result;}
 const loadedImages=new Set();let imageFrame=0;
 document.addEventListener('load',event=>{const image=event.target;if(!hasEdits()||!image.matches?.('.preview-panel img,#sharePages img')||!image.complete||!image.naturalWidth||loadedImages.has(image.currentSrc||image.src))return;loadedImages.add(image.currentSrc||image.src);cancelAnimationFrame(imageFrame);imageFrame=requestAnimationFrame(()=>root.Render.renderAll(root.QS_SHARE?root.Render.lastState:undefined));},true);
 root.DocumentStudio={searchEntries,inventory:id=>samples.get(id),setText,addTextBlock,hideBlock:(id,key)=>edit(id,v=>{v.hidden=[...new Set([...(v.hidden||[]),key])];}),excludePage:(id,excluded)=>edit(id,(v,c)=>{c.excluded=!!excluded;}),exportPdf:exportDocument,refresh:refreshEditor,hasEdits,scan,store,errors:format=>(format==='power'?powerErrors:layoutErrors).slice(),restorePage:id=>edit(id,(v,c)=>{c.excluded=false;c.variants={};})};
})(window);

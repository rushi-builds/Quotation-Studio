/* Optional page-specific value footers: never move or shrink proposal content. */
'use strict';
(function(root){
 const definitions={
  pageExec:{contentKey:'exec',style:'editorial',kicker:'AT A GLANCE',items:[['target','System overview'],['sun','Generation basis'],['chart','Project summary']]},
  pageOptions:{style:'quiet',items:[['doc','Like-for-like scope'],['coins','Transparent comparison'],['target','Informed choice']]},
  pageSolution:{style:'assurance',items:[['target','Site-fit design'],['gear','Specified equipment'],['shield','Design basis']]},
  pageTechSpec:{style:'precise',kicker:'SPECIFIED WITH CARE',items:[['doc','Technical clarity'],['target','Stated ratings'],['check','Traceable details']]},
  pageSavings:{style:'horizon',items:[['sun','Generation estimate'],['rupee','Energy-value basis'],['chart','Long-term view']]},
  pageInvestment:{style:'precise',kicker:'QUOTE CLARITY',items:[['doc','Itemised scope'],['coins','Cost clarity'],['payment','Defined milestones']]},
  pageFinance:{style:'continuity',kicker:'ILLUSTRATIVE BASIS',items:[['chart','Stated assumptions'],['coins','Finance illustration'],['doc','Informed decisions']]},
  pageProjects:{style:'assurance',items:[['target','Site context'],['doc','Project scope'],['leaf','Practical application']]},
  pageAbout:{style:'editorial',kicker:'BUILT ON TRUST',items:[['users','People first'],['target','Thoughtful planning'],['leaf','Responsible energy']]},
  pageWhySolar:{style:'editorial',kicker:'THE SOLAR ADVANTAGE',items:[['sun','Clean generation'],['rupee','Energy value'],['leaf','Lower emissions']]},
  pageScope:{style:'precise',kicker:'SCOPE TO HANDOVER',items:[['doc','Defined scope'],['gear','Careful installation'],['check','Clear handover']]},
  pageQuality:{style:'editorial',kicker:'BUILT WITH CARE',items:[['shield','Safe practices'],['wrench','Neat workmanship'],['check','Careful checks']]},
  pageWhyKtm:{style:'editorial',kicker:'DISTINCTLY KTM',items:[['users','Personal attention'],['target','Practical expertise'],['leaf','Long-term thinking']]},
  pageWarranty:{style:'continuity',kicker:'CARE & COVERAGE',items:[['shield','OEM warranties'],['wrench','Workmanship terms'],['doc','Clear support scope']]},
  pageTerms:{style:'quiet',items:[['leaf','Reliable\nSolutions'],['users','Experienced\nTeam'],['shield','Quality\nExecution'],['chart','Long-Term\nValue']]}
 };
 const palettes=['warm','sage','lavender','blue'];
 const visible=n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden';
 function sync(){
  if(!root.Render?.lastState||!root.ProposalMarks)return;
  for(const [id,def] of Object.entries(definitions)){
   const page=document.getElementById(id);if(!page)continue;
   let band=page.querySelector(':scope>.proposal-value-footer');
   if(!band){band=document.createElement('aside');band.className='proposal-value-footer pv-'+def.style;band.setAttribute('aria-label','Our approach');band.dataset.docAdded='true';page.append(band);}
   // Hide before measuring: the decoration must never influence available space.
   band.hidden=true;
   const body=page.querySelector(':scope>.pg-body'),foot=page.querySelector(':scope>.pg-foot'),rect=page.getBoundingClientRect();
   if(!body||!foot||rect.width<=0||!visible(page)||page.scrollHeight>page.clientHeight+2)continue;
   band.replaceChildren();
   if(def.kicker){const kicker=document.createElement('span');kicker.className='pv-kicker';kicker.textContent=def.kicker;band.append(kicker);}
   const list=document.createElement('ul');list.className='pv-values';list.style.gridTemplateColumns='repeat('+def.items.length+',minmax(0,1fr))';if(id==='pageTerms')list.id='v_tmFooterValues';
   const content=CONTENT[def.contentKey||id];
   def.items.forEach(([icon,label],i)=>{
    const item=content?.footerValues?.[i],text=String(item?.label??label);if(!text.trim())return;
    const li=document.createElement('li'),mark=document.createElement('span'),copy=document.createElement('span');
    mark.className='pv-mark';mark.setAttribute('aria-hidden','true');mark.innerHTML=root.ProposalMarks.get(item?.icon||icon,def.style==='horizon'?28:26,palettes[i%4]);
    copy.className='pv-label';copy.textContent=text;li.append(mark,copy);list.append(li);
   });
   if(!list.children.length)continue;
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

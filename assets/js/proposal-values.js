/* Uniform floating footers: one panel size, with source text and contacts preserved. */
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
  pageWhySolar:{style:'horizon',items:[['sun','Clean generation'],['rupee','Energy value'],['leaf','Lower emissions']]},
  pageScope:{style:'precise',kicker:'SCOPE TO HANDOVER',items:[['doc','Defined scope'],['gear','Careful installation'],['check','Clear handover']]},
  pageQuality:{style:'assurance',items:[['shield','Safe practices'],['wrench','Neat workmanship'],['check','Careful checks']]},
  pageWhyKtm:{style:'editorial',kicker:'DISTINCTLY KTM',items:[['users','Personal attention'],['target','Practical expertise'],['leaf','Long-term thinking']]},
  pageWarranty:{style:'continuity',kicker:'CARE & COVERAGE',items:[['shield','OEM warranties'],['wrench','Workmanship terms'],['doc','Clear support scope']]},
  pageTerms:{style:'quiet',items:[['leaf','Reliable\nSolutions'],['users','Experienced\nTeam'],['shield','Quality\nExecution'],['chart','Long-Term\nValue']]}
 };
 const palettes=['warm','sage','lavender','blue'];
 function sync(){
  if(!root.Render?.lastState||!root.ProposalMarks)return;
  // One fixed floating panel per page. Never add an expanded second tier.
  document.querySelectorAll('.page:not(#pageCover):not(#pageClosing)').forEach(page=>{
   page.classList.remove('has-value-surface');
   page.querySelectorAll(':scope>.proposal-value-footer').forEach(old=>old.remove());
   const foot=page.querySelector(':scope>.pg-foot');if(!foot)return;
   const id=page.id.replace(/-continuation-\d+$/,''),def=definitions[id];
   let meta=foot.querySelector('.floating-footer-meta');
   if(!meta){meta=document.createElement('div');meta.className='floating-footer-meta';[...foot.children].forEach(n=>meta.append(n));foot.append(meta);}
   let list=foot.querySelector(':scope>.proposal-value-footer');
   if(!list){list=document.createElement('ul');list.className='proposal-value-footer';list.setAttribute('aria-label','Our approach');foot.prepend(list);}
   if(page.id==='pageTerms')list.id='v_tmFooterValues';
   const defaults=def?.items||[['doc','Engineering excellence'],['shield','Trusted performance']];
   const content=CONTENT[def?.contentKey||id];list.replaceChildren();
   defaults.forEach(([icon,label],i)=>{
    const item=content?.footerValues?.[i],text=String(item?.label??label);if(!text.trim())return;
    const li=document.createElement('li'),mark=document.createElement('span'),copy=document.createElement('span');
    mark.className='pv-mark';mark.setAttribute('aria-hidden','true');mark.innerHTML=root.ProposalMarks.get(item?.icon||icon,16,palettes[i%4]).replaceAll('#28465f','#edf3f5').replace(/#(?:fbf0e1|edf4f0|f2eef8|edf3f8)/g,'#244c5e').replaceAll('#b77d40','#d9b380').replaceAll('#668d80','#a7c8b6').replaceAll('#8b7ba7','#c7b7df').replaceAll('#648ca8','#acc9dd').replaceAll('fill="#fff"','fill="#244c5e"');
    copy.className='pv-label';copy.textContent=text;li.append(mark,copy);list.append(li);
   });
   list.style.gridTemplateColumns='repeat('+Math.max(list.children.length,1)+',minmax(0,1fr))';list.hidden=!list.children.length;
   // Retain authored labels in data; omit the optional row rather than clip it.
   if(foot.getBoundingClientRect().width&&list.scrollHeight>list.clientHeight+1)list.hidden=true;
  });
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

'use strict';
(function(){
  const projects=portfolioCategories().flatMap((category,index)=>category.projects.map(p=>({...p,category:index,installation:p.installation || (index===0?'Rooftop Solar':'')})));
  const names=['All projects','Industrial','Commercial','Residential & specialty'];
  const grid=document.getElementById('galleryProjects'),filters=document.getElementById('galleryFilters'),dialog=document.getElementById('photoViewer');
  let opener;
  function render(category){
    grid.replaceChildren();
    const shown=projects.filter(p=>category===-1 || p.category===category);
    document.getElementById('galleryCount').textContent=shown.length+' project photographs';
    shown.forEach(p=>{
      const card=document.createElement('article'),button=document.createElement('button'),img=document.createElement('img');
      card.dataset.project=p.img;
      const caption=[p.name,p.capacity,p.installation,p.location].filter(Boolean).join(' · ');
      button.type='button';button.className='project-photo';button.setAttribute('aria-label','Enlarge photograph: '+caption);
      img.src=PROJECT_IMAGES[p.img];img.alt=caption;img.loading='lazy';img.width=600;img.height=400;button.append(img);
      button.addEventListener('click',()=>{opener=button;document.getElementById('largePhoto').src=img.src;document.getElementById('largePhoto').alt=img.alt;document.getElementById('photoCaption').textContent=caption;dialog.showModal();});
      const body=document.createElement('div'),h=document.createElement('h3'),desc=document.createElement('p');
      body.className='project-description';h.textContent=p.name;
      desc.textContent=[p.capacity,p.installation,p.location].filter(Boolean).join(' · ');body.append(h,desc);
      card.append(button,body);grid.append(card);
    });
    [...filters.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i-1===category)));
  }
  names.forEach((name,index)=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.addEventListener('click',()=>render(index-1));filters.append(b);});render(-1);
  document.getElementById('closePhoto').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>opener?.focus());
  const videos=(window.GALLERY_VIDEOS||[]).filter(video=>{try{const u=new URL(video.url);return u.protocol==='https:' && !u.username && !u.password;}catch(_){return false;}});
  if(videos.length){document.getElementById('videos').hidden=false;videos.forEach(video=>{
    const a=document.createElement('a');a.className='video-card';a.href=video.url;a.target='_blank';a.rel='noopener noreferrer';
    if(/^assets\/images\/[\w.-]+$/.test(video.poster||'')){const img=document.createElement('img');img.src=video.poster;img.alt='';img.loading='lazy';a.append(img);}
    const label=document.createElement('strong');label.textContent='▶ '+video.title;a.append(label);document.getElementById('videoCards').append(a);
  });}
})();

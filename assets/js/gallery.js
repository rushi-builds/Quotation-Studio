'use strict';
(function(){
  const projects=CONTENT.pageProjects.categories.flatMap((category,index)=>category.projects.map(p=>({...p,category:index})));
  const names=['All projects','Industrial','Commercial','Residential & specialty'];
  const grid=document.getElementById('galleryProjects'),filters=document.getElementById('galleryFilters'),dialog=document.getElementById('photoViewer');
  let opener;
  function render(category){
    grid.replaceChildren();
    const shown=projects.filter(p=>category===-1 || p.category===category);
    document.getElementById('galleryCount').textContent=shown.length+' project photographs';
    shown.forEach(p=>{
      const card=document.createElement('article'),button=document.createElement('button'),img=document.createElement('img');
      button.type='button';button.className='project-photo';button.setAttribute('aria-label','Enlarge photograph: '+p.name);
      img.src=PROJECT_IMAGES[p.img];img.alt=p.name+' solar installation';img.loading='lazy';img.width=600;img.height=400;button.append(img);
      button.addEventListener('click',()=>{opener=button;document.getElementById('largePhoto').src=img.src;document.getElementById('largePhoto').alt=img.alt;document.getElementById('photoCaption').textContent=p.name+' · '+p.location+' · '+p.capacity;dialog.showModal();});
      const h=document.createElement('h3'),desc=document.createElement('p');h.textContent=p.name;desc.textContent=p.location+' · '+p.capacity;card.append(button,h,desc);grid.append(card);
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

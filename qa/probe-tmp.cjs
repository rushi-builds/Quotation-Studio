const {JSDOM}=require('./node_modules/jsdom');
const stub=(w)=>{
  const ctx=new Proxy({},{
    get:(t,k)=>{
      if(k==='measureText')return ()=>({width:10});
      if(k==='createLinearGradient'||k==='createRadialGradient')return ()=>({addColorStop(){}});
      if(k==='getImageData')return ()=>({data:new Uint8ClampedArray(4)});
      return ()=>{};
    },
    set:()=>true
  });
  w.HTMLCanvasElement.prototype.getContext=function(){return ctx;};
  w.HTMLCanvasElement.prototype.toDataURL=function(){return 'data:image/png;base64,';};
};
module.exports={load:async(url)=>{
  const dom=await JSDOM.fromURL(url,{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true});
  stub(dom.window);
  await new Promise(r=>setTimeout(r,5000));
  const w=dom.window;
  try{w.StateStore.applyForm({});w.Render.renderAll();}catch(e){}
  return w;
}};

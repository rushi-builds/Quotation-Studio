/* Must run before original model/state modules. Isolate, never read real storage. */
'use strict';
(() => {
  const memoryStorage=()=>{const map=new Map();return Object.freeze({get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(String(k))?map.get(String(k)):null,setItem:(k,v)=>{map.set(String(k),String(v));},removeItem:k=>{map.delete(String(k));},clear:()=>map.clear()});};
  try {
    Object.defineProperty(window,'localStorage',{value:memoryStorage(),configurable:false});
    Object.defineProperty(window,'sessionStorage',{value:memoryStorage(),configurable:false});
    window.__originalStudioSandbox=true;
  } catch (_) {
    // Fail closed before any original application script can run.
    document.documentElement.textContent='This browser cannot open the isolated preview safely.';
    window.stop();
    throw new Error('Preview isolation unavailable');
  }
  // Existing shortcuts must not leave the sandbox or launch live share flows.
  document.addEventListener('click',e=>{
    const anchor=e.target.closest('a[href]');
    const href=anchor?.getAttribute('href')||'';
    const localDownload=anchor?.hasAttribute('download')&&href.startsWith('blob:'+location.origin+'/');
    if(anchor&&!href.startsWith('#')&&!localDownload){e.preventDefault();e.stopImmediatePropagation();}
    if(e.target.closest('#waShare,#siteFetchBtn')){e.preventDefault();e.stopImmediatePropagation();}
  },true);
})();

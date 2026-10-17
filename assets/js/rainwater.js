/* Roof collection scenarios only. Not pipe sizing, potable-water or recharge approval. */
'use strict';
(function(root){
 const DEFAULTS={systemWaterEnabled:false,systemWaterAreaM2:'',systemWaterRainMm:'',systemWaterRunoffPct:'',systemWaterEfficiencyPct:'',systemWaterIntensity:'',systemWaterEventMm:'',systemWaterFirstFlushMm:'',systemWaterTankL:'',systemWaterRoute:'pending',systemWaterRainSource:'',systemWaterNotes:'',systemWaterPriceMode:'separate',systemWaterPrice:'',systemWaterPriceReviewed:false};
 const enabled=s=>s?.systemEnabled===true&&s.systemTemplate==='weatherproof'&&s.systemWaterEnabled===true;
 const included=s=>enabled(s)&&(s.systemInclude===undefined||s.systemInclude===true);
 const decimal=v=>['string','number'].includes(typeof v)&&/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(String(v).trim())&&Number.isFinite(Number(v))?Number(v):null;
 const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const fmt=(n,unit='',digits=0)=>Number.isFinite(n)?n.toLocaleString('en-IN',{maximumFractionDigits:digits})+unit:'Inputs required';
 const route=s=>({__proto__:null,storage:'Filtered storage',recharge:'Recharge routing',pending:'Collection route pending'})[s?.systemWaterRoute]||'Collection route pending';
 const price=s=>{const n=decimal(s?.systemWaterPrice);return n!==null&&n>=0?n:null;};
 const priceText=s=>s.systemWaterPriceMode==='included'?(s.systemWaterPriceReviewed===true?'In selected system / base quote':'Included basis proposed; review pending'):price(s)===null?'Price to be confirmed':(root.Finance?.fmtINR||((n)=>'₹'+fmt(n)))(price(s));
 function compute(s={}){
  const errors=[],missing=[];
  const get=(key,label,min=0,max=Infinity,positive=false)=>{const raw=s[key];if(raw===undefined||raw===null||String(raw).trim()===''){missing.push(label);return null;}const n=decimal(raw);if(n===null||n<min||n>max||(positive&&n===0)){errors.push(label+' is invalid.');return null;}return n;};
  const explicit=String(s.systemWaterAreaM2??'').trim()!=='';
  const area=get(explicit?'systemWaterAreaM2':'systemAreaM2','Catchment area',0,Infinity,true),rain=get('systemWaterRainMm','Annual rainfall'),runoff=get('systemWaterRunoffPct','Runoff capture assumption',0,100),efficiency=get('systemWaterEfficiencyPct','Filter / conveyance recovery',0,100);
  const intensity=get('systemWaterIntensity','Design storm intensity',0,Infinity,true),event=get('systemWaterEventMm','Event rainfall',0,Infinity,true),flush=get('systemWaterFirstFlushMm','First-flush depth'),tank=s.systemWaterRoute==='storage'?get('systemWaterTankL','Tank capacity',0,Infinity,true):null;
  const finite=n=>n===null?null:Number.isFinite(n)?n:(errors.push('Collection arithmetic exceeds numeric limits.'),null);
  const annual=area!==null&&rain!==null&&runoff!==null&&efficiency!==null?finite(area*rain*runoff/100*efficiency/100):null;
  const peak=area!==null&&intensity!==null&&runoff!==null?finite(area*intensity*runoff/100/3600):null;
  const eventRunoff=area!==null&&event!==null&&runoff!==null?finite(area*event*runoff/100):null;
  const diversion=area!==null&&flush!==null?finite(area*flush):null;
  const eventDelivered=eventRunoff!==null&&diversion!==null&&efficiency!==null?finite(Math.max(0,eventRunoff-diversion)*efficiency/100):null;
  const tankCapture=s.systemWaterRoute==='storage'&&tank!==null&&eventDelivered!==null?Math.min(tank,eventDelivered):null;
  return {enabled:enabled(s),area,areaSource:explicit?'Entered collection footprint':'Entered covered roof footprint',rain,runoff,efficiency,intensity,event,flush,tank,annual:enabled(s)?annual:null,peak:enabled(s)?peak:null,eventRunoff:enabled(s)?eventRunoff:null,diversion:enabled(s)?diversion:null,eventDelivered:enabled(s)?eventDelivered:null,tankCapture:enabled(s)?tankCapture:null,errors:[...new Set(errors)],missing};
 }
 function diagram(s={}){
  const dest=s.systemWaterRoute==='storage'?'FILTERED STORAGE':s.systemWaterRoute==='recharge'?'RECHARGE OPTION':'ROUTE TO BE AGREED';
  const terminal=s.systemWaterRoute==='recharge'?'<path d="M455 150h127v74H455z M462 172h112 M462 189h112 M462 206h112" fill="#edf5f2" stroke="#759e8f"/><path d="m480 212 0 24m28-24v24m28-24v24" stroke="#759e8f" stroke-dasharray="3 3"/>':'<rect x="455" y="150" width="127" height="77" rx="9" fill="#edf5f2" stroke="#759e8f"/><path d="M465 187h107v29H465" fill="#cbe1d8"/>';
  return '<svg class="rw-diagram" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 275" role="img" aria-label="Roof to gutter, downpipe, first-flush diversion, filter and proposed collection route. Schematic only."><rect x="1" y="1" width="638" height="273" rx="12" fill="#f6faf9" stroke="#dce8e4"/><path d="m42 98 157-65 110 51-157 65z" fill="#314e62" stroke="#678597"/><path d="m80 83 111-46m-61 67 112-46m-67 69 113-47M95 76l113 51m-72-68 114 51" stroke="#9eb0bb"/><path d="m42 106 110 52 158-66" stroke="#b78d51" stroke-width="8" fill="none"/><path d="M310 91v81h65" stroke="#548f82" stroke-width="8" fill="none"/><path d="M337 172v59" stroke="#a98858" stroke-width="7"/><rect x="321" y="214" width="32" height="25" rx="4" fill="#f3e9d6" stroke="#a98858"/><rect x="374" y="151" width="45" height="44" rx="6" fill="#e1eee9" stroke="#548f82"/><path d="M419 172h36" stroke="#548f82" stroke-width="7"/>'+terminal+'<g fill="#36576a" font-family="Arial,sans-serif" font-size="11"><text x="38" y="24">PV roof + sealed roofing assembly</text><text x="53" y="188">Gutter along roof low edge</text><text x="320" y="119">Downpipe</text><text x="370" y="139">Filter</text><text x="280" y="257">First-flush diversion</text><text x="448" y="139">'+dest+'</text><text x="462" y="252">Overflow / bypass</text></g><path d="M582 172h31v55m-5-7 5 7 5-7" fill="none" stroke="#8fa6ab" stroke-width="3"/></svg>';
 }
 function summary(s){const c=compute(s);return route(s)+' · '+(c.annual!==null?fmt(c.annual,' L/year')+' collection scenario':'collection assessment pending');}
 function sync(s){
  const card=document.getElementById('systemWaterCard');if(!card)return;
  card.hidden=!(s.systemEnabled===true&&s.systemTemplate==='weatherproof');
  document.getElementById('systemWaterFields').hidden=!enabled(s);
  document.getElementById('systemWaterPriceField').hidden=s.systemWaterPriceMode==='included';
  document.getElementById('systemWaterReviewField').hidden=s.systemWaterPriceMode!=='included';
  document.getElementById('systemWaterTankField').hidden=s.systemWaterRoute!=='storage';
  const c=compute(s),status=document.getElementById('systemWaterResult');status.textContent=enabled(s)?(c.annual!==null?'Annual potential: '+fmt(c.annual,' L/year')+' · before event losses':(c.errors[0]||'Enter area, annual rainfall and collection assumptions.')):'';
  document.getElementById('systemWaterDiagram').innerHTML=enabled(s)?diagram(s):'';
 }
 const api={DEFAULTS,enabled,included,compute,decimal,fmt,route,price,priceText,summary,diagram,sync};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.Rainwater=api;
})(typeof self!=='undefined'?self:this);

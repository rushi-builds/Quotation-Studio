/* Single-workspace access service shared by the local API and Worker.
 * Provider authorisation is intentionally separate: preparations contain NO
 * credentials and never imply OAuth consent, a sync, a send or delivery.
 */
import { randomUUID } from 'node:crypto';

export const workspacePermissions = Object.freeze({
  member: 'Company membership',
  'metrics.read': 'Company metrics',
  'finance.read': 'Company quoted-value reports',
  'pricing.read': 'Own quotation pricing and snapshots',
  'followups.read': 'Shared company follow-ups'
});
const providers = Object.freeze({
  gmail: ['inbox.read','messages.send','connection.manage'],
  outlook: ['inbox.read','messages.send','connection.manage'],
  whatsapp: ['inbox.read','messages.send','connection.manage'],
  instagram: ['metrics.read','connection.manage'],
  linkedin: ['metrics.read','connection.manage'],
  website: ['metrics.read','connection.manage'],
  'google-calendar': ['calendar.read','calendar.write','connection.manage'],
  'outlook-calendar': ['calendar.read','calendar.write','connection.manage']
});
export const permissionLabels = Object.freeze({...workspacePermissions,
  'inbox.read':'Read conversations','messages.send':'Send replies',
  'calendar.read':'Read calendar','calendar.write':'Create calendar events',
  'connection.manage':'Manage account preparation'
});
export const emptyAccess = () => ({revision:0,connections:[],grants:[],requests:[],audit:[]});
const problem = (status,message,code='ACCESS_DENIED') => {throw Object.assign(new Error(message),{status,code});};
const text = (v,max=100) => typeof v==='string' ? v.trim().slice(0,max) : '';
const live = (r,now) => !r.expiresAt || Date.parse(r.expiresAt)>now;
const decision = (s,uid,resource,permission,now) => s.grants.find(g=>g.userId===uid&&g.resource===resource&&g.permission===permission&&live(g,now))?.decision;
export const connectionPermissions = provider => providers[provider] || [];
export function member(s,a,now=Date.now()) {
  if(a.manager)return true;
  const d=decision(s,a.id,'workspace','member',now);
  return d ? d==='allow' : Boolean(a.writer);
}
export function permitted(s,a,resource,permission,now=Date.now()) {
  if(!a?.id)return false;
  if(resource==='workspace'){
    if(!Object.hasOwn(workspacePermissions,permission))return false;
    if(a.manager)return true;
    if(permission==='member')return member(s,a,now);
    if(!member(s,a,now))return false;
    const d=decision(s,a.id,resource,permission,now);
    if(d)return d==='allow';
    return permission==='metrics.read'||permission==='pricing.read'&&Boolean(a.writer);
  }
  const c=s.connections.find(c=>c.id===resource);
  if(!c||c.archived||!connectionPermissions(c.provider).includes(permission))return false;
  // Even a company owner has no implicit read of somebody's personal account.
  if(c.scope==='personal'&&c.ownerId===a.id)return true;
  if(c.scope==='company'&&!member(s,a,now))return false;
  if(c.scope==='company'&&a.manager)return true;
  const d=decision(s,a.id,resource,permission,now);
  if(d)return d==='allow';
  return c.scope==='company'&&permission==='metrics.read';
}
const authority = (s,a,resource) => resource==='workspace' ? a.manager : (()=>{
  const c=s.connections.find(c=>c.id===resource);
  return c&&(c.scope==='personal'?c.ownerId===a.id:a.manager);
})();
function visibleConnection(s,a,c) {
  return c.scope==='company' ? member(s,a) : c.ownerId===a.id||connectionPermissions(c.provider).some(p=>permitted(s,a,c.id,p));
}
function validateResource(s,a,resource,permission,{request=false}={}) {
  if(resource==='workspace'){
    if(!Object.hasOwn(workspacePermissions,permission))problem(400,'Unknown permission.','INVALID_PERMISSION');
    if(permission!=='member'&&!member(s,a))problem(403,'Company membership must be approved first.');
    return;
  }
  const c=s.connections.find(c=>c.id===resource&&!c.archived);
  if(!c||!visibleConnection(s,a,c))problem(404,'Account preparation not found.','NOT_FOUND');
  if(!connectionPermissions(c.provider).includes(permission))problem(400,'Permission does not apply to this service.','INVALID_PERMISSION');
  // Private sharing is initiated by its owner, never by a guessed account ID.
  if(request&&c.scope==='personal')problem(403,'The personal account owner must explicitly share this account.');
}
function prune(s,now){
  for(const r of s.requests)if(r.status==='pending'&&!live(r,now))r.status='expired';
  // Retain pending requests and the latest 500 decisions; audit has explicit
  // bounded retention, documented in docs/workspace-access.md.
  const closed=s.requests.filter(r=>r.status!=='pending').slice(-500);
  s.requests=[...closed,...s.requests.filter(r=>r.status==='pending')];
  s.audit=s.audit.slice(-1000);
}
function audit(s,a,action,detail,now){s.audit.push({id:randomUUID(),actorId:a.id,actorName:a.name,action,detail,at:new Date(now).toISOString()});}
function setGrant(s,a,input,now){
  const {userId,resource,permission,decision:choice,days=30}=input;
  if(!['allow','deny'].includes(choice))problem(400,'Choose allow or revoke.','INVALID_INPUT');
  if(![7,30,90,0].includes(days))problem(400,'Choose 7, 30, 90 days or until revoked.','INVALID_INPUT');
  if(!authority(s,a,resource))problem(403,'Only the company owner/admin or personal account owner may change this access.');
  const prior=s.grants.find(g=>g.userId===userId&&g.resource===resource&&g.permission===permission);
  const g={id:prior?.id||randomUUID(),userId,resource,permission,decision:choice,expiresAt:choice==='allow'&&days?new Date(now+days*86400000).toISOString():null,by:a.id,at:new Date(now).toISOString()};
  s.grants=s.grants.filter(g=>!(g.userId===userId&&g.resource===resource&&g.permission===permission));s.grants.push(g);
  audit(s,a,choice==='allow'?'Access granted':'Access revoked',{userId,resource,permission,expiresAt:g.expiresAt},now);
  return g;
}
export async function accessView(s,a,store) {
  const now=Date.now(),connections=s.connections.filter(c=>visibleConnection(s,a,c)).map(c=>({...c,
    permissions:Object.fromEntries(connectionPermissions(c.provider).map(p=>[p,permitted(s,a,c.id,p,now)])),
    canShare:Boolean(authority(s,a,c.id)),canManage:!c.archived&&permitted(s,a,c.id,'connection.manage',now)||Boolean(authority(s,a,c.id))
  }));
  const requests=s.requests.filter(r=>r.userId===a.id||authority(s,a,r.resource)).map(r=>({...r,status:r.status==='pending'&&!live(r,now)?'expired':r.status}));
  const reviewable=r=>Boolean(authority(s,a,r.resource));
  const users=member(s,a,now)?(await store.users()).map(u=>({id:u.id,name:u.name})):[];
  return {revision:s.revision,self:{id:a.id,manager:Boolean(a.manager),member:member(s,a,now)},
    permissions:Object.fromEntries(Object.keys(workspacePermissions).map(p=>[p,permitted(s,a,'workspace',p,now)])),
    connections,requests,pendingReviews:requests.filter(r=>r.status==='pending'&&reviewable(r)).length,
    grants:s.grants.filter(g=>g.userId===a.id||authority(s,a,g.resource)),
    audit:s.audit.filter(e=>a.manager&&(!e.detail?.resource||e.detail.resource==='workspace'||s.connections.some(c=>c.id===e.detail.resource&&c.scope==='company'))||e.actorId===a.id||e.detail?.userId===a.id).slice(-100).reverse(),
    users,permissionLabels,workspacePermissions,providers,providerAdaptersReady:false};
}
export async function accessNotifications(store,a) {
  try {
    const s=await store.load(),now=Date.now();
    return s.requests.filter(r=>r.status==='pending'&&live(r,now)&&authority(s,a,r.resource)).map(r=>({
      id:'access-'+r.id,kind:'access_request',accessRequestId:r.id,title:r.userName+' requested access',
      body:r.resourceLabel+' · '+(permissionLabels[r.permission]||r.permission),createdAt:r.createdAt,unread:true,proposalId:null
    }));
  }catch{return []; /* Old installations without migration keep legacy notifications. New access routes fail closed. */}
}
export async function membershipAccess(store,a){
  if(a.manager)return true;
  try{return member(await store.load(),a);}catch{return false;}
}
export const companyRoute=parts=>parts[0]==='gallery'||parts[0]==='team'&&parts[1]==='members';
export async function pricingAccess(store,a){
  if(a.manager)return true; // Existing quotation routes retain their OWN-scope checks.
  try{return permitted(await store.load(),a,'workspace','pricing.read');}catch{return false;}
}
export function financialRoute(parts,method) {
  return parts[0]==='proposals'&&!(method==='GET'&&parts.length===1)||['sends','links','versions','assistant'].includes(parts[0]);
}
export async function handleWorkspace({store,actor:a,route,method,body={}}) {
  try{
    if(!a?.id)problem(401,'Sign in required.','SIGN_IN_REQUIRED');
    const s=await store.load(),now=Date.now();
    if(method==='GET'&&route.length===0)return {status:200,body:await accessView(s,a,store)};
    if(method==='GET'&&route[0]==='pulse'&&route.length===1){
      if(!permitted(s,a,'workspace','metrics.read'))problem(403,'Request company membership to view company metrics.');
      return {status:200,body:{metrics:await store.companyMetrics(),channels:s.connections.filter(c=>c.scope==='company'&&!c.archived&&permitted(s,a,c.id,'metrics.read')).map(c=>({id:c.id,label:c.label,provider:c.provider,status:'not_connected',metrics:null})),financeAllowed:permitted(s,a,'workspace','finance.read'),followupsAllowed:permitted(s,a,'workspace','followups.read')}};
    }
    if(method==='GET'&&route[0]==='finance'&&route.length===1){
      if(!permitted(s,a,'workspace','finance.read'))problem(403,'Company financial reports require explicit access.');
      return {status:200,body:await store.companyFinance()};
    }
    if(method==='GET'&&route[0]==='followups'&&route.length===1){
      if(!permitted(s,a,'workspace','followups.read'))problem(403,'Shared follow-ups require explicit access.');
      return {status:200,body:{tasks:await store.companyFollowups(),readOnly:true}};
    }
    if(method==='GET'&&route[0]==='connections'&&route[2]==='data'&&route.length===4){
      if(!permitted(s,a,route[1],route[3]))problem(403,'This account action requires explicit access.');
      return {status:503,body:{error:'Provider adapter is not connected. No data fetched or action performed.',code:'PROVIDER_NOT_CONNECTED'}};
    }
    if(method!=='POST')problem(404,'Access route not found.','NOT_FOUND');
    if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>4096)problem(400,'Invalid access request.','INVALID_INPUT');
    const schemas={connections:['revision','provider','label','scope'],requests:['revision','resource','permission','reason'],review:['revision','requestId','decision','reason','days'],grant:['revision','userId','resource','permission','decision','days','reason'],archive:['revision','connectionId','archived','reason']};
    const command=route.length===1?route[0]:'';
    if(!Object.hasOwn(schemas,command))problem(404,'Access route not found.','NOT_FOUND');
    if(Object.keys(body).some(k=>!schemas[command].includes(k)))problem(400,'Unexpected fields. Never submit provider credentials here.','INVALID_INPUT');
    if(!Number.isSafeInteger(body.revision)||(body.revision!==s.revision&&['grant','review','archive'].includes(command)))problem(409,'Access settings changed. Refresh and review again.','ACCESS_CONFLICT');
    prune(s,now);
    if(command==='connections'){
      if(!member(s,a,now))problem(403,'Company membership must be approved before preparing accounts.');
      if(s.connections.length>=500)problem(409,'Workspace account preparation history limit reached. Contact the owner.');
      if(s.connections.filter(c=>c.ownerId===a.id&&c.scope==='personal'&&!c.archived).length>=20)problem(409,'Maximum 20 active personal preparations. Archive unused accounts first.');
      if(!Object.hasOwn(providers,body.provider)||!['company','personal'].includes(body.scope)||!text(body.label)||body.label.length>100)problem(400,'Choose a service, account name and company/personal scope.','INVALID_INPUT');
      if(body.scope==='company'&&!a.manager)problem(403,'Only the company owner/admin can prepare a company account.');
      if(s.connections.filter(c=>!c.archived).length>=100)problem(409,'Active account preparation limit reached.');
      if(s.connections.some(c=>!c.archived&&c.provider===body.provider&&c.scope===body.scope&&c.label.toLowerCase()===text(body.label).toLowerCase()&&(c.scope==='company'||c.ownerId===a.id)))problem(409,'This account is already prepared.');
      const c={id:randomUUID(),provider:body.provider,label:text(body.label),scope:body.scope,ownerId:a.id,archived:false,status:'not_connected',createdAt:new Date(now).toISOString()};
      s.connections.push(c);audit(s,a,'Account prepared',{resource:c.id,label:c.label,scope:c.scope},now);
    }
    if(command==='requests'){
      const resource=text(body.resource),permission=text(body.permission);
      validateResource(s,a,resource,permission,{request:true});
      if(permitted(s,a,resource,permission,now))problem(409,'You already have this access.');
      if(text(body.reason,500).length<5||typeof body.reason!=='string'||body.reason.length>500)problem(400,'Add a reason (5–500 characters).','INVALID_INPUT');
      if(s.requests.some(r=>r.userId===a.id&&r.resource===resource&&r.permission===permission&&r.status==='pending'))problem(409,'This request is already pending.');
      if(s.requests.filter(r=>r.userId===a.id&&r.status==='pending').length>=5||s.requests.filter(r=>r.status==='pending').length>=1000)problem(429,'Too many pending requests.');
      const label=resource==='workspace'?'KTM workspace':s.connections.find(c=>c.id===resource).label;
      const r={id:randomUUID(),userId:a.id,userName:a.name,resource,resourceLabel:label,permission,reason:text(body.reason,500),status:'pending',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+7*86400000).toISOString()};
      s.requests.push(r);audit(s,a,'Access requested',{resource,permission,userId:a.id},now);
    }
    if(command==='review'){
      const r=s.requests.find(r=>r.id===body.requestId);
      if(!r||!authority(s,a,r.resource))problem(404,'Review request not found.','NOT_FOUND');
      if(r.status!=='pending'||!live(r,now))problem(409,'This request is no longer pending.');
      if(r.userId===a.id)problem(403,'You cannot approve your own request.');
      if(!['approve','reject'].includes(body.decision)||text(body.reason,500).length<5)problem(400,'Choose approve/reject and record a reason.','INVALID_INPUT');
      if(!(await store.user(r.userId)))problem(404,'The requesting member no longer exists.','NOT_FOUND');
      if(body.decision==='approve'){
        validateResource(s,a,r.resource,r.permission);
        const target=await store.actor(r.userId);
        if((r.resource==='workspace'&&r.permission!=='member'||r.resource!=='workspace'&&s.connections.find(c=>c.id===r.resource)?.scope==='company')&&!member(s,target))problem(409,'Approve company membership first.');
        setGrant(s,a,{...r,decision:'allow',days:body.days??30},now);
      }
      r.status=body.decision==='approve'?'approved':'rejected';r.reviewedBy=a.id;r.reviewedAt=new Date(now).toISOString();r.reviewReason=text(body.reason,500);
      audit(s,a,'Access request '+r.status,{resource:r.resource,permission:r.permission,userId:r.userId,requestId:r.id,reason:r.reviewReason},now);
    }
    if(command==='grant'){
      if(!authority(s,a,body.resource))problem(403,'You cannot manage this access.');
      const target=await store.actor(body.userId);
      if(!target)problem(404,'Member not found.','NOT_FOUND');
      validateResource(s,a,body.resource,body.permission);
      if(text(body.reason,500).length<5)problem(400,'A reason is required (at least 5 characters).','INVALID_INPUT');
      if(body.decision==='allow'&&body.resource!=='workspace'&&s.connections.find(c=>c.id===body.resource)?.scope==='company'&&!member(s,target))problem(409,'Approve company membership first.');
      if(body.decision==='allow'&&body.resource==='workspace'&&body.permission!=='member'&&!member(s,target))problem(409,'Approve company membership first.');
      setGrant(s,a,body,now);audit(s,a,'Access decision recorded',{resource:body.resource,userId:body.userId,reason:text(body.reason,500)},now);
    }
    if(command==='archive'){
      const c=s.connections.find(c=>c.id===body.connectionId);
      if(!c||!(authority(s,a,c.id)||permitted(s,a,c.id,'connection.manage')))problem(404,'Account preparation not found.','NOT_FOUND');
      if(typeof body.archived!=='boolean'||text(body.reason,500).length<5)problem(400,'Archive/restore needs a reason.','INVALID_INPUT');
      if(c.archived===body.archived)problem(409,'Account already has this status.');
      c.archived=body.archived;
      if(c.archived){for(const g of s.grants.filter(g=>g.resource===c.id)){g.decision='deny';g.expiresAt=null;}for(const r of s.requests.filter(r=>r.resource===c.id&&r.status==='pending'))r.status='cancelled';}
      audit(s,a,c.archived?'Account archived':'Account restored',{resource:c.id,reason:text(body.reason,500)},now);
    }
    const revision=s.revision;s.revision++;prune(s,now);
    if(!await store.save(s,revision))problem(409,'Another access decision was saved. Refresh and review again.','ACCESS_CONFLICT');
    return {status:200,body:await accessView(s,a,store)};
  }catch(e){return {status:e.status||503,body:{error:e.status?e.message:'Access storage is unavailable. No permission changed.',code:e.code||'ACCESS_UNAVAILABLE'}};}
}

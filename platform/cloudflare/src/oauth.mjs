/* OIDC authorization-code sign-in. Provider tokens never reach browser storage.
   Configured providers only; no email-based account merging or role promotion. */
import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import { randomBytes, createHash } from 'node:crypto';
export const providers = ['google', 'microsoft', 'apple'];
export const digest = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const names = { google:'Google', microsoft:'Microsoft', apple:'Apple' };
const response = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const redirect = (path,cookies=[]) => {const headers=new Headers({'Location':path,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});cookies.forEach(c=>headers.append('Set-Cookie',c));return new Response(null,{status:303,headers});};
const error = code => Object.assign(new Error(code),{oauthCode:code});
const keys = new Map();
function configuration(env, provider) {
 if(!providers.includes(provider))return null;
 let origin;
 try {const u=new URL(env.OAUTH_PUBLIC_ORIGIN);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return null;origin=u.origin;}catch{return null;}
 const prefix=provider.toUpperCase();
 const clientId=String(env[prefix+'_CLIENT_ID']||''),secret=String(env[prefix+'_CLIENT_SECRET']||'');
 if(env['OAUTH_'+prefix+'_ENABLED']!=='true'||!clientId||!secret)return null;
 const tenant=String(env.MICROSOFT_TENANT_ID||'common');
 if(provider==='microsoft'&&!/^(common|organizations|consumers|[a-f0-9-]{36})$/i.test(tenant))return null;
 if(provider==='apple'){try{const exp=decodeJwt(secret).exp;if(!Number.isFinite(exp)||exp<=Date.now()/1000+60)return null;}catch{return null;}}
 const definitions={
  google:{authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',jwks:'https://www.googleapis.com/oauth2/v3/certs'},
  microsoft:{authorize:`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,token:`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,jwks:`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`},
  apple:{authorize:'https://appleid.apple.com/auth/authorize',token:'https://appleid.apple.com/auth/token',jwks:'https://appleid.apple.com/auth/keys'}
 };
 return {provider,origin,clientId,secret,tenant,...definitions[provider],callback:origin+'/api/auth/oauth/'+provider+'/callback'};
}
export function providerStatus(env) {return providers.map(id=>({id,name:names[id],configured:!!configuration(env,id)}));}
function cookie(provider,value,maxAge=600){return `__Host-qs-oauth-${provider}=${value}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;}
function readCookie(request,provider){const name='__Host-qs-oauth-'+provider+'=';return (request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name))?.slice(name.length)||'';}
export async function verifiedIdentity(c, token, nonce, keyResolver) {
 if(typeof token!=='string'||token.length>24000)throw error('INVALID_IDENTITY');
 let resolver=keyResolver;
 if(!resolver){if(!keys.has(c.jwks))keys.set(c.jwks,createRemoteJWKSet(new URL(c.jwks),{timeoutDuration:8000,cooldownDuration:30000,cacheMaxAge:300000}));resolver=keys.get(c.jwks);}
 const issuer=c.provider==='google'?['https://accounts.google.com','accounts.google.com']:c.provider==='apple'?'https://appleid.apple.com':undefined;
 const {payload:p}=await jwtVerify(token,resolver,{algorithms:['RS256'],audience:c.clientId,...(issuer?{issuer}:{}),requiredClaims:['sub','iss','aud','exp','iat','nonce'],maxTokenAge:'10m',clockTolerance:30});
 if(p.nonce!==nonce||typeof p.sub!=='string'||!p.sub||p.sub.length>512)throw error('INVALID_IDENTITY');
 if(Array.isArray(p.aud)&&p.aud.length>1&&p.azp!==c.clientId)throw error('INVALID_IDENTITY');
 if(p.azp&&p.azp!==c.clientId)throw error('INVALID_IDENTITY');
 if(c.provider==='microsoft'){
  if(typeof p.tid!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(p.tid)||p.iss!==`https://login.microsoftonline.com/${p.tid}/v2.0`)throw error('INVALID_IDENTITY');
  if(!['common','organizations','consumers'].includes(c.tenant)&&p.tid.toLowerCase()!==c.tenant.toLowerCase())throw error('INVALID_IDENTITY');
  const personal=p.tid.toLowerCase()==='9188040d-6c67-4c5b-b112-36a304b66dad';
  if(c.tenant==='consumers'&&!personal||c.tenant==='organizations'&&personal)throw error('INVALID_IDENTITY');
 }
 // Email is contact metadata, never the authentication key. Existing email matches
 // require an explicit signed-in link. Microsoft does not guarantee email_verified.
 const email=typeof p.email==='string'?p.email.trim().toLowerCase():'';
 const usable=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254&&
  (c.provider==='microsoft'?(p.email_verified===undefined||p.email_verified===true||p.email_verified==='true'):p.email_verified===true||p.email_verified==='true');
 return {provider:c.provider,subject:digest((c.provider==='google'?'https://accounts.google.com':p.iss)+'\n'+p.sub),email:usable?email:'',name:typeof p.name==='string'?p.name.trim().slice(0,120):''};
}
async function boundedText(request,max=20000){
 if(!request.body)return '';const reader=request.body.getReader();let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw error('SIGNIN_FAILED');}chunks.push(value);}}finally{reader.releaseLock();}
 const joined=new Uint8Array(size);let pos=0;for(const chunk of chunks){joined.set(chunk,pos);pos+=chunk.length;}return new TextDecoder().decode(joined);
}
export async function handleOAuth(request,env,store,auth,dependencies={}) {
 const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean);
 if(parts[0]!=='api'||parts[1]!=='auth'||parts[2]!=='oauth')return null;
 const provider=parts[3],action=parts[4];
 if(provider==='providers'&&parts.length===4&&request.method==='GET'){
  const user=await auth.user(request);
  const linked=user?await store.linked(user.id):[];
  return response({providers:providerStatus(env).map(p=>({...p,linked:linked.includes(p.id)})),passwordLogin:user?!String(user.password_hash).startsWith('oauth-only$'):null});
 }
 if(!providers.includes(provider)||parts.length!==5)return response({error:'Unknown sign-in provider.'},404);
 const c=configuration(env,provider);
 if(!c||url.origin!==c.origin)return response({error:'This sign-in provider requires administrator setup. Use email and password for now.',code:'PROVIDER_NOT_CONFIGURED'},503);
 const validAction=action==='start'&&request.method==='POST'||action==='callback'&&(provider==='apple'?request.method==='POST':request.method==='GET');
 if(!validAction)return response({error:'Unsupported sign-in request.'},405);
 try {
  if(action==='start'){
   if(request.headers.get('origin')!==c.origin)return response({error:'Open sign-in from the Studio website.'},403);
   const text=await boundedText(request,4096);if(text.length>4096)return response({error:'Request too large.'},413);
   const body=JSON.parse(text||'{}');const link=body.link===true;
   const user=link?await auth.user(request):null;if(link&&!user)return response({error:'Sign in before linking another account.'},401);
   if(!await store.allowStart(digest(auth.rateKey||'unknown')))return response({error:'Too many sign-in attempts. Try again in a few minutes.'},429);
   if(link&&!await auth.canLink(user,String(body.currentPassword||''),request))return response({error:'Confirm your current Studio password, or sign in again with your connected provider before linking.',code:'LINK_REAUTH_REQUIRED'},401);
   const state=random(),binding=random(),nonce=random(),verifier=random();
   await store.put({stateHash:digest(state),bindingHash:digest(binding),provider,expires:Date.now()+600000,payload:{nonce,verifier,linkUserId:user?.id||null,linkToken:link?auth.token(request):null}});
   const q=new URLSearchParams({client_id:c.clientId,redirect_uri:c.callback,response_type:'code',scope:provider==='apple'?'name email':'openid email profile',state,nonce});
   if(provider!=='apple'){q.set('code_challenge',createHash('sha256').update(verifier).digest('base64url'));q.set('code_challenge_method','S256');q.set('prompt','select_account');}
   else q.set('response_mode','form_post');
   const r=response({url:c.authorize+'?'+q});r.headers.append('Set-Cookie',cookie(provider,binding));return r;
  }
  const raw=request.method==='POST'?await boundedText(request):url.search.slice(1);
  if(raw.length>20000)throw error('SIGNIN_FAILED');
  const params=new URLSearchParams(raw),state=params.get('state')||'',binding=readCookie(request,provider);
  if(!/^[\w-]{43}$/.test(state)||!/^[\w-]{43}$/.test(binding))throw error('SIGNIN_EXPIRED');
  const attempt=await store.take(digest(state),digest(binding),provider,Date.now());
  if(!attempt)throw error('SIGNIN_EXPIRED');
  if(params.has('error'))throw error('SIGNIN_CANCELLED');
  const code=params.get('code');if(!code||code.length>10000)throw error('SIGNIN_FAILED');
  if(attempt.linkUserId){const user=await auth.userByToken(attempt.linkToken);if(!user||user.id!==attempt.linkUserId)throw error('LINK_SESSION_EXPIRED');}
  const form=new URLSearchParams({client_id:c.clientId,client_secret:c.secret,code,redirect_uri:c.callback,grant_type:'authorization_code'});
  if(provider!=='apple')form.set('code_verifier',attempt.verifier);
  const tokenResponse=await (dependencies.fetch||fetch)(c.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form,redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!tokenResponse.ok)throw error('SIGNIN_FAILED');
  const tokenText=await tokenResponse.text();if(tokenText.length>64000)throw error('SIGNIN_FAILED');
  const tokens=JSON.parse(tokenText);
  const identity=await verifiedIdentity(c,tokens.id_token,attempt.nonce,dependencies.keyResolver);
  // Apple supplies name only on first consent, outside the signed token. Treat it
  // strictly as untrusted, editable display text; never use it for authorization.
  if(provider==='apple'&&params.get('user')){try{const n=JSON.parse(params.get('user')).name;identity.name=[n?.firstName,n?.lastName].filter(x=>typeof x==='string').join(' ').trim().slice(0,120);}catch{}}
  const user=await store.resolve(identity,attempt.linkUserId);
  const session=await auth.session(user);
  return redirect('/oauth-complete.html',[auth.cookie(session.token,request),cookie(provider,'',0)]);
 }catch(e){
  const allowed=['ACCOUNT_EXISTS','IDENTITY_IN_USE','EMAIL_UNAVAILABLE','SIGNIN_EXPIRED','LINK_SESSION_EXPIRED','SIGNIN_CANCELLED'];
  const code=allowed.includes(e.oauthCode)?e.oauthCode:'SIGNIN_FAILED';
  // Never expose provider payloads, authorization codes, secrets or DB errors.
  if(action==='callback')return redirect('/index.html?oauth_error='+code,[cookie(provider,'',0)]);
  return response({error:'Could not start sign-in. Please try again.',code},400);
 }
}
export { configuration, error };

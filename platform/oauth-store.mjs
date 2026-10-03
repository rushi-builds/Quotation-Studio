import { randomBytes } from 'node:crypto';
const id=prefix=>prefix+'_'+randomBytes(16).toString('hex');
const fail=code=>{throw Object.assign(new Error(code),{oauthCode:code});};
const newUser=identity=>{
 if(!identity.email)fail('EMAIL_UNAVAILABLE');
 const now=new Date().toISOString();
 return {id:id('usr'),email:identity.email,name:identity.name||identity.email.split('@')[0],password_hash:'oauth-only$'+randomBytes(32).toString('hex'),role:'viewer',role_custom:null,created_at:now,updated_at:now};
};
export const schema=[
 `CREATE TABLE IF NOT EXISTS oauth_rate_limits (scope TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS oauth_attempts (state_hash TEXT PRIMARY KEY, binding_hash TEXT NOT NULL, provider TEXT NOT NULL, expires INTEGER NOT NULL, payload TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS oauth_identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, linked_at TEXT NOT NULL, PRIMARY KEY(provider,subject), UNIQUE(user_id,provider))`
];
const schemas=new WeakMap();
export function d1OAuthStore(db){
 const run=(s,...v)=>db.prepare(s).bind(...v).run(),one=(s,...v)=>db.prepare(s).bind(...v).first();
 const ensure=()=>{if(!schemas.has(db))schemas.set(db,db.batch(schema.map(s=>db.prepare(s))).catch(e=>{schemas.delete(db);throw e;}));return schemas.get(db);};
 const user=uid=>one('SELECT * FROM users WHERE id = ?',uid);
 return {
  async allowStart(scope){await ensure();const now=Date.now();await run('DELETE FROM oauth_rate_limits WHERE expires <= ?',now);
   const key=scope+':'+Math.floor(now/300000);
   return !!(await one('INSERT INTO oauth_rate_limits (scope,count,expires) VALUES (?,1,?) ON CONFLICT(scope) DO UPDATE SET count=count+1 WHERE count<30 RETURNING count',key,now+600000));},
  async linked(uid){await ensure();const r=await db.prepare('SELECT provider FROM oauth_identities WHERE user_id = ?').bind(uid).all();return r.results.map(x=>x.provider);},
  async put(a){await ensure();await run('DELETE FROM oauth_attempts WHERE expires <= ?',Date.now());await run('INSERT INTO oauth_attempts (state_hash,binding_hash,provider,expires,payload) VALUES (?,?,?,?,?)',a.stateHash,a.bindingHash,a.provider,a.expires,JSON.stringify(a.payload));},
  async take(state,binding,provider,now){await ensure();const r=await one('DELETE FROM oauth_attempts WHERE state_hash = ? AND binding_hash = ? AND provider = ? AND expires > ? RETURNING payload',state,binding,provider,now);return r?JSON.parse(r.payload):null;},
  async resolve(identity,linkId){
   await ensure();const {provider,subject}=identity;
   const linked=await one('SELECT user_id FROM oauth_identities WHERE provider = ? AND subject = ?',provider,subject);
   if(linked){if(linkId&&linked.user_id!==linkId)fail('IDENTITY_IN_USE');const u=await user(linked.user_id);if(!u)fail('SIGNIN_FAILED');return u;}
   if(linkId){
    const u=await user(linkId);if(!u)fail('LINK_SESSION_EXPIRED');
    await run('INSERT OR IGNORE INTO oauth_identities (provider,subject,user_id,linked_at) VALUES (?,?,?,?)',provider,subject,linkId,new Date().toISOString());
    const saved=await one('SELECT user_id FROM oauth_identities WHERE provider = ? AND subject = ?',provider,subject);
    if(saved?.user_id!==linkId)fail('IDENTITY_IN_USE');return u;
   }
   const u=newUser(identity);
   if(await one('SELECT id FROM users WHERE email = ? COLLATE NOCASE',u.email))fail('ACCOUNT_EXISTS');
   // D1 batch is transactional. Concurrent callbacks cannot create orphan users or
   // bind an identity to an account selected by email. The generated ID owns both inserts.
   await db.batch([
    db.prepare(`INSERT OR IGNORE INTO users (id,email,name,password_hash,role,role_custom,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM oauth_identities WHERE provider = ? AND subject = ?)`)
     .bind(u.id,u.email,u.name,u.password_hash,u.role,u.role_custom,u.created_at,u.updated_at,provider,subject),
    db.prepare(`INSERT INTO oauth_identities (provider,subject,user_id,linked_at)
      SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)`)
     .bind(provider,subject,u.id,u.created_at,u.id)
   ]);
   const saved=await one('SELECT user_id FROM oauth_identities WHERE provider = ? AND subject = ?',provider,subject);
   if(!saved)fail('ACCOUNT_EXISTS');return user(saved.user_id);
  }
 };
}
export function localOAuthStore(load,save){
 const read=()=>{const db=load();db.oauthAttempts ||= [];db.oauthIdentities ||= [];return db;};
 return {
  async allowStart(scope){const db=read(),now=Date.now();db.oauthRateLimits ||= {};for(const [k,v] of Object.entries(db.oauthRateLimits))if(v.expires<=now)delete db.oauthRateLimits[k];const key=scope+':'+Math.floor(now/300000);const v=db.oauthRateLimits[key]||{count:0,expires:now+600000};if(v.count>=30)return false;v.count++;db.oauthRateLimits[key]=v;save(db);return true;},
  async linked(uid){return read().oauthIdentities.filter(x=>x.user_id===uid).map(x=>x.provider);},
  async put(a){const db=read();db.oauthAttempts=db.oauthAttempts.filter(x=>x.expires>Date.now());db.oauthAttempts.push(a);save(db);},
  async take(state,binding,provider,now){const db=read(),i=db.oauthAttempts.findIndex(x=>x.stateHash===state&&x.bindingHash===binding&&x.provider===provider&&x.expires>now);if(i<0)return null;const [a]=db.oauthAttempts.splice(i,1);save(db);return a.payload;},
  async resolve(identity,linkId){
   // No awaits between the fresh read and write: serialized in the local server.
   const db=read(),existing=db.oauthIdentities.find(x=>x.provider===identity.provider&&x.subject===identity.subject);
   if(existing){if(linkId&&existing.user_id!==linkId)fail('IDENTITY_IN_USE');const u=db.users.find(x=>x.id===existing.user_id);if(!u)fail('SIGNIN_FAILED');return u;}
   let u;
   if(linkId){u=db.users.find(x=>x.id===linkId);if(!u)fail('LINK_SESSION_EXPIRED');if(db.oauthIdentities.some(x=>x.user_id===linkId&&x.provider===identity.provider))fail('IDENTITY_IN_USE');}
   else {u=newUser(identity);if(db.users.some(x=>x.email.toLowerCase()===u.email))fail('ACCOUNT_EXISTS');db.users.push(u);}
   db.oauthIdentities.push({provider:identity.provider,subject:identity.subject,user_id:u.id,linked_at:new Date().toISOString()});save(db);return u;
  }
 };
}

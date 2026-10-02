import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url).pathname;
const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const data=await mkdtemp(join(tmpdir(),'qs-ai-test-'));
const child=spawn(process.execPath,['platform/local-server/server.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',QS_DATA_DIR:data,GEMINI_ENABLED:'true',GEMINI_API_KEY:'test-only-never-used',GEMINI_MODEL:'gemini-3.1-flash-lite'},stdio:['ignore','pipe','pipe']});
try {
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);child.stdout.on('data',b=>{if(b.toString().includes('Quotation Studio platform')){clearTimeout(timer);resolve()}});child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code))})});
 const api=async(path,body,token,extra={})=>{const res=await fetch(`http://127.0.0.1:${port}/api/${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{'X-QS-Session':token}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return{status:res.status,data:await res.json()}};
 assert.equal((await api('assistant/status')).status,401);
 assert.equal((await api('assistant/chat',{message:'Hi',consent:true})).status,401);
 const register=async(email)=> (await api('auth/register',{email,name:'Test',password:'TestPass!123',role:'sales'})).data;
 const a=await register('a@example.test'),b=await register('b@example.test');
 const proposal=await api('proposals',{form:{custName:'Private customer',capacity:'100'}},b.token);
 assert.equal((await api('assistant/status',undefined,a.token)).data.enabled,true);
 assert.equal((await api('assistant/chat',{message:'Summarise',consent:true,proposalId:proposal.data.proposal.id},a.token)).status,404,'cannot read another owner record');
 assert.equal((await api('assistant/chat',{message:'Hi'},a.token)).status,400,'consent mandatory');
 assert.equal((await api('assistant/chat',{message:'x'.repeat(18000),consent:true},a.token)).status,413,'bounded request');
 assert.equal((await api('assistant/chat',{message:'Hi',consent:true},null,{Cookie:'qs_session='+a.token})).status,403,'explicit session header required');
 console.log('PASS: authenticated routes, missing consent, oversized body, cross-owner denial, cookie-only CSRF guard. No provider requests made.');
} finally {child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));await rm(data,{recursive:true,force:true});}

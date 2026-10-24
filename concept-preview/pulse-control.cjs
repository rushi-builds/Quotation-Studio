'use strict';
// JSON stdin/stdout bridge, invoked only with the server's trusted sample actor.
const fs=require('node:fs'),G=require('./pulse-governance.js');
try{const input=JSON.parse(fs.readFileSync(0,'utf8'));G.execute(input.data,input.actor,input.command);process.stdout.write(JSON.stringify({data:input.data}));}
catch(error){process.stdout.write(JSON.stringify({error:error.message}));}

// Run locally; keep the .p8 key outside the repository. Pipe stdout directly to
// Cloudflare secret storage. Never paste the key/JWT into chat or commit it.
import fs from 'node:fs';
import {importPKCS8,SignJWT} from '../../vendor/jose.mjs';
const {APPLE_TEAM_ID,APPLE_KEY_ID,APPLE_CLIENT_ID,APPLE_PRIVATE_KEY_FILE}=process.env;
if(!APPLE_TEAM_ID||!APPLE_KEY_ID||!APPLE_CLIENT_ID||!APPLE_PRIVATE_KEY_FILE){console.error('Set APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID and APPLE_PRIVATE_KEY_FILE locally.');process.exit(1);}
try{
 const key=await importPKCS8(fs.readFileSync(APPLE_PRIVATE_KEY_FILE,'utf8'),'ES256');
 const token=await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:APPLE_KEY_ID}).setIssuer(APPLE_TEAM_ID).setSubject(APPLE_CLIENT_ID).setAudience('https://appleid.apple.com').setIssuedAt().setExpirationTime('30d').sign(key);
 process.stdout.write(token);
}catch{console.error('Could not create the Apple client secret. Check the local signing key and identifiers.');process.exit(1);}

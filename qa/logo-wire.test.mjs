import { buildMailMessage } from '../platform/cloudflare/src/worker.js';
import { readFileSync } from 'node:fs';

const png = new Uint8Array(readFileSync('../assets/images/ktm-logo-light.png'));

/* Same construction as b64bytes in worker.js */
let bin = '';
for (let i = 0; i < png.length; i++) bin += String.fromCharCode(png[i]);
const data = btoa(bin);

console.log('png bytes      =', png.length);
console.log('base64 length  =', data.length);

const related = [{ cid: 'ktm-logo', type: 'image/png', data }];
const msg = buildMailMessage(
  'ktmenergyexperts@gmail.com', 'rushi@example.test',
  'KTM Studio - password reset code',
  '<p><img src="cid:ktm-logo" width="150" alt="KTM Energy Experts"></p><p>614285</p>',
  related
);

console.log('whole message  =', msg.length, 'octets');

const cut = msg.indexOf('\r\n\r\n');
const body = msg.slice(cut + 4);
const idAt = body.indexOf('Content-ID: <ktm-logo>');
const after = body.slice(idAt).split('\r\n');
const b64lines = after.filter((l) => /^[A-Za-z0-9+/=]+$/.test(l));

console.log('base64 on wire =', b64lines.join('').length, 'chars in', b64lines.length, 'lines');
console.log('longest line   =', Math.max(...b64lines.map((l) => l.length)), '(cap 76)');
console.log('first line     =', b64lines[0] ? b64lines[0].slice(0, 24) + '...' : '(EMPTY)');
console.log('decodes back   =', Buffer.from(b64lines.join(''), 'base64').length, 'bytes');

if (b64lines.join('').length < 1000) {
  console.log('>>> BUG: the image bytes are NOT on the wire');
  process.exit(1);
}
console.log('>>> OK: the full logo rides with the message');

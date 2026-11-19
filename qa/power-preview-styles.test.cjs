const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=name=>fs.readFileSync(require('node:path').join(__dirname,'..',name),'utf8');
const styles=source=>[...source.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map(match=>match[1]);
const proposal=styles(html('quotation.html'));
const preview=styles(html('power-preview.html'));
assert.deepEqual(preview,proposal,'Power preview must load the exact ordered stylesheet stack used by the real proposal and PDF export');
console.log('PASS: Power preview uses the same complete ordered stylesheet stack as quotation.html');

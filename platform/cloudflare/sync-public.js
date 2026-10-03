/* Sync repo front-end into ./public for Workers Assets (Windows + Mac + Linux). */
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../..');
fs.writeFileSync(path.join(ROOT,'platform/studio-knowledge.mjs'),require('../../scripts/build-assistant-knowledge.cjs').generate());
const PUB = path.join(HERE, 'public');

function rm(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}
function mkdir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function copyFile(src, dest) {
  mkdir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  mkdir(dest);
  for (const name of fs.readdirSync(src)) {
    if (name === 'node_modules' || name === '.git') continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
}

rm(PUB);
mkdir(path.join(PUB, 'assets'));

const files = [
  'index.html', 'dashboard.html', 'quotation.html',
  'portal.html', 'share.html', 'gallery.html', 'oauth-complete.html'
];
for (const f of files) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) copyFile(src, path.join(PUB, f));
}
copyDir(path.join(ROOT, 'assets'), path.join(PUB, 'assets'));

function countFiles(dir) {
  let n = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) n += countFiles(p);
    else n += 1;
  }
  return n;
}
console.log('Synced public/ from repo root (' + countFiles(PUB) + ' files)');

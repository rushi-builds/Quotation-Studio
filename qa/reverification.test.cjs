'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../assets/js/engineering.js');
test('2015 wind table does not underestimate taller roofs; interpolation and range guard', () => {
  const rows = [[20,1.12,1.07,1.01,.80],[30,1.15,1.12,1.06,.97],[50,1.20,1.17,1.12,1.10],[100,1.26,1.24,1.20,1.20],[500,1.35,1.35,1.35,1.34]];
  for (const [height,...factors] of rows) factors.forEach((factor,i)=>assert.equal(E.k2For(String(i+1),height).k2,factor));
  assert.ok(Math.abs(E.k2For('3',40).k2-1.09)<1e-12);
  const w=E.wind({windSpeed:39,buildingHeightM:100,terrainCategory:'3',roofZone:'interior',netUpliftCp:1});
  assert.ok(Math.abs(w.pz-.6*(39*1.2)**2)<1e-9);
  for (const height of [-1,501,1000]) {
    const invalid=E.wind({windSpeed:39,buildingHeightM:height});
    assert.equal(invalid.ok,false);assert.equal(invalid.pz,undefined);
  }
  assert.equal(E.wind({windSpeed:0}).ok,false);
});
test('negative cable runs and zero/negative cross-sections cannot report a pass',()=>{
  const ctx={dcCurrentA:10,dcVoltageV:600,acCurrentA:20,acVoltageV:230};
  for (const [length,size] of [[-1,4],[30,0],[30,-4]]) {
    const c=E.cable({dcCableLengthM:length,dcCableSizeMm2:size,acCableLengthM:length,acCableSizeMm2:size},ctx);
    assert.equal(c.dc.ok,false);assert.equal(c.ac.ok,false);
    assert.notEqual(c.dc.pass,true);assert.notEqual(c.ac.pass,true);
  }
  const zero=E.cable({dcCableLengthM:0,dcCableSizeMm2:4,acCableLengthM:0,acCableSizeMm2:4},ctx);
  assert.equal(zero.dc.percent,0);assert.equal(zero.ac.percent,0);
  assert.match(zero.limits,/Project screening targets/);
});

test('builder and both customer entry points load the same engineering dependency before finance',()=>{
  const fs=require('node:fs'),path=require('node:path');
  for(const name of ['quotation.html','share.html','portal.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
    assert.ok(html.indexOf('assets/js/engineering.js?v=reverify1')>=0);
    assert.ok(html.indexOf('assets/js/engineering.js')<html.indexOf('assets/js/finance.js'));
  }
});

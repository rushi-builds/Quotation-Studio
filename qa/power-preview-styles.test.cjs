const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=name=>fs.readFileSync(require('node:path').join(__dirname,'..',name),'utf8');
const styles=source=>[...source.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map(match=>match[1]);
const proposal=styles(html('quotation.html'));
const previewHtml=html('power-preview.html');
const preview=styles(previewHtml);
assert.deepEqual(preview,proposal,'Power preview must load the exact ordered stylesheet stack used by the real proposal and PDF export');
assert.match(previewHtml,/\.report\s*\{[^}]*flex-direction\s*:\s*column/s,'A4 sheets must stack vertically for natural page-by-page scrolling');
assert.doesNotMatch(previewHtml,/flex-direction\s*:\s*row|width\s*:\s*max-content/,'the preview must not lay pages out side-by-side');
const experience=html('assets/js/experience.js');
assert.match(experience,/POWER_BASE_PAGES=\['pageCover','pageSolution','pageTechSpec','pageScope','pageSavings','pageInvestment','pageClosing'\]/,'the short proposal must select the seven original sheets with the combined scope/warranty sheet at position four');
assert.match(experience,/function powerSourcePages\(\)\{return \[\.\.\.POWER_BASE_PAGES\];\}/,'Power Proposal must remain a fixed extract from the Detailed Proposal, without substituting optional report pages');
assert.match(experience,/dataset\.powerSourceAliases/,'source-page ID-scoped styles must also apply to compact PDF clones');
const compactCss=html('assets/css/experience.css');
assert.match(compactCss,/\.power-page\[data-source-page="pageInvestment"\] #v_inPayWarn\{[^}]*font-size:9px;[^}]*\}/,'a payment-warning investment page gets compact-only breathing room before the fixed footer');
const routing=experience.match(/\s*const POWER_BASE_PAGES=[^;]+;\s*const POWER_STYLE_PAGES=[^;]+;\s*function powerSourcePages\(\)\{[^}]+\}/)?.[0];
assert.ok(routing,'optional page routing must remain a self-contained function');
const vm=require('node:vm'),select=state=>JSON.parse(vm.runInNewContext(`${routing}; JSON.stringify(powerSourcePages(s));`,{
  s:state,root:{Bess:{included:x=>!!x.bessIncluded},Rainwater:{included:x=>!!x.rainIncluded},AdditionalSystems:{included:x=>!!x.systemIncluded}}
}));
const base=['pageCover','pageSolution','pageTechSpec','pageScope','pageSavings','pageInvestment','pageClosing'];
for(const [name,flags] of [
  ['base',{}],['standalone BESS',{bessEnabled:true,bessIncluded:false}],
  ['included BESS',{bessIncluded:true}],['rainwater with system',{rainIncluded:true,systemIncluded:true}],
  ['additional system',{systemIncluded:true}]
]){const pages=select(flags);assert.equal(pages.length,7,name+' keeps seven sheets');assert.deepEqual(pages,base,name+' stays an exact extract from the main 15-page proposal');}
assert.deepEqual(select({}),base,'the seven named source pages stay in the agreed order');
console.log('PASS: Power preview matches the full proposal stylesheet stack, scrolls vertically, and extracts the seven approved source sheets');

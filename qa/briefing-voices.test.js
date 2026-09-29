/* Voice selection is the difference between a Marathi briefing that plays and
   one that can never play: Chrome desktop ships no Marathi voice, and Windows
   installs one only with the Marathi language pack. The chain that decides
   which voice speaks is pure logic, so it is checked here on every test run
   rather than only in the browser suite. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ FAIL: ' + name + ' → ' + e.message); }
};
function boot(voices) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      const speech = new EventTarget();
      speech.voices = voices;
      speech.getVoices = () => speech.voices;
      speech.speak = () => {}; speech.cancel = () => {}; speech.pause = () => {}; speech.resume = () => {};
      Object.defineProperty(w, 'speechSynthesis', { value: speech, configurable: true });
      Object.defineProperty(w, 'SpeechSynthesisUtterance', { value: class { constructor(t) { this.text = t; } }, configurable: true });
      w.__speech = speech;
    }
  });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/js/salutation.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/js/briefing.js'), 'utf8'));
  return w;
}
const names = { en: 'English test voice', hi: 'Hindi test voice', mr: 'Marathi test voice' };
const voice = (lang, local) => ({ name: names[String(lang).split('-')[0]] || lang, lang, localService: !!local });

console.log('\n— briefing voice selection —');

check('a Marathi voice is used as-is when the device has one', () => {
  const { Briefing } = boot([voice('en-IN', true), voice('hi-IN', true), voice('mr-IN', true)]);
  const plan = Briefing.voicePlan('mr');
  assert.equal(plan.exact, true);
  assert.equal(plan.voice.name, 'Marathi test voice');
});

check('Marathi without a Marathi voice falls back to Hindi, and says so', () => {
  const { Briefing } = boot([voice('en-IN', true), voice('hi-IN', true)]);
  const plan = Briefing.voicePlan('mr');
  assert.equal(plan.exact, false);
  assert.equal(plan.family, 'hi');
  assert.equal(plan.voice.name, 'Hindi test voice');
});

check('Hindi text falls back the same way when only Marathi is installed', () => {
  const { Briefing } = boot([voice('mr-IN', true)]);
  const plan = Briefing.voicePlan('hi');
  assert.equal(plan.exact, false);
  assert.equal(plan.family, 'mr');
  assert.equal(plan.voice.name, 'Marathi test voice');
});

check('English text is never handed to an Indic voice', () => {
  const { Briefing } = boot([voice('hi-IN', true), voice('mr-IN', true)]);
  assert.equal(Briefing.voicePlan('en').voice, null);
  assert.equal(Briefing.voicePlan('mr').exact, true);
});

check('no English substitution for Marathi either — that would be gibberish', () => {
  const { Briefing } = boot([voice('en-IN', true)]);
  assert.equal(Briefing.voicePlan('mr').voice, null);
  assert.equal(Briefing.voicePlan('en').exact, true);
});

check('a device with no voices at all yields no voice rather than an error', () => {
  const { Briefing } = boot([]);
  ['en', 'hi', 'mr'].forEach((lang) => assert.equal(Briefing.voicePlan(lang).voice, null));
});

check('a region-less language tag still counts as the family', () => {
  const { Briefing } = boot([{ name: 'Marathi (no region)', lang: 'mr', localService: true }]);
  assert.equal(Briefing.voicePlan('mr').exact, true);
});

check('within a family the Indian locale beats a foreign one', () => {
  const { Briefing } = boot([{ name: 'Hindi (IN)', lang: 'hi-IN', localService: false }, voice('en-IN', true)]);
  assert.equal(Briefing.voicePlan('mr').voice.name, 'Hindi (IN)');
});

check('within the same locale a locally installed voice beats a network one', () => {
  const { Briefing } = boot([
    { name: 'Hindi network', lang: 'hi-IN', localService: false },
    { name: 'Hindi local', lang: 'hi-IN', localService: true },
    voice('en-IN', true)
  ]);
  assert.equal(Briefing.voicePlan('mr').voice.name, 'Hindi local');
});

check('English prefers en-IN over en-US', () => {
  const { Briefing } = boot([{ name: 'English US', lang: 'en-US', localService: true }, voice('en-IN', true)]);
  assert.equal(Briefing.voicePlan('en').voice.name, 'English test voice');
});

check('underscore tags from some engines are read the same as hyphen tags', () => {
  const { Briefing } = boot([{ name: 'Marathi underscore', lang: 'mr_IN', localService: true }]);
  assert.equal(Briefing.voicePlan('mr').exact, true);
});

check('a voice with no lang tag cannot be mistaken for a match', () => {
  const { Briefing } = boot([{ name: 'Mystery voice', localService: true }]);
  assert.equal(Briefing.voicePlan('en').voice, null);
  assert.equal(Briefing.voicePlan('mr').voice, null);
});

check('the legacy voiceFor() still answers with the voice that will speak', () => {
  const { Briefing } = boot([voice('hi-IN', true)]);
  assert.equal(Briefing.voiceFor('mr').lang, 'hi-IN');
  assert.equal(Briefing.voiceFor('en'), null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

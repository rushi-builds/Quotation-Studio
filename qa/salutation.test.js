/* The spoken greeting is a promise to the customer: the right honourific for
   the right person, and never a guess dressed up as knowledge. Every rule in
   salutation.js — titles, the organisation guard, the unisex list, both
   dictionaries, every ending, the dealer override and the per-language lines
   — is pinned here. */
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
function bootSalutation() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/', runScripts: 'dangerously'
  });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/js/salutation.js'), 'utf8'));
  return w;
}
/* briefing.js booted with the number engines stubbed, so the greeting and the
   closing can be verified inside the real script pipeline. */
function bootBriefing() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      const speech = new EventTarget();
      speech.voices = [{ name: 'v', lang: 'en-IN', localService: true }];
      speech.getVoices = () => speech.voices;
      speech.speak = () => {}; speech.cancel = () => {}; speech.pause = () => {}; speech.resume = () => {};
      Object.defineProperty(w, 'speechSynthesis', { value: speech, configurable: true });
      Object.defineProperty(w, 'SpeechSynthesisUtterance', { value: class { constructor(t) { this.text = t; } }, configurable: true });
    }
  });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/js/salutation.js'), 'utf8'));
  w.eval('window.Finance={compute:()=>({capacity:7,moduleCount:13,moduleWattage:545,annualGen:10220,grossTotal:445410,netInvestment:407051,subsidy:78000,lifetimeSaving:123456,payback:3.7})};' +
         'window.Bess={included:()=>false};window.AdditionalSystems={included:()=>false};');
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/js/briefing.js'), 'utf8'));
  return w;
}

const { Salutation } = bootSalutation();

console.log('\n— salutation: display name —');

check('full name speaks the first name only', () => {
  assert.equal(Salutation.displayName('Rushikesh Joshi'), 'Rushikesh');
});
check('lowercase input is capitalised for speech', () => {
  assert.equal(Salutation.displayName('priya shah'), 'Priya');
});
check('an honourific is never spoken as the name', () => {
  assert.equal(Salutation.displayName('Mr. Rushikesh Joshi'), 'Rushikesh');
  assert.equal(Salutation.displayName('Smt. Anita Deshmukh'), 'Anita');
  assert.equal(Salutation.displayName('Dr. Kiran Rao'), 'Kiran');
});
check('single-letter initials are skipped', () => {
  assert.equal(Salutation.displayName('R. Rushikesh'), 'Rushikesh');
});
check('the mercantile M/s is not read as "Ms."', () => {
  assert.equal(Salutation.displayName('M/s Tata Power'), 'Tata');
});
check('trailing punctuation is trimmed', () => {
  assert.equal(Salutation.displayName('Rushikesh,'), 'Rushikesh');
});
check('Devanagari names are preserved as typed', () => {
  assert.equal(Salutation.displayName('स्नेहा जोशी'), 'स्नेहा');
});
check('blank and whitespace-only names display nothing', () => {
  assert.equal(Salutation.displayName(''), '');
  assert.equal(Salutation.displayName('   '), '');
});

console.log('\n— salutation: explicit titles prove gender —');

check('Mr. / Shri prove male before any name rule runs', () => {
  assert.equal(Salutation.detectGender('Mr. Anyone'), 'male');
  assert.equal(Salutation.detectGender('Shri Ganesh Kulkarni'), 'male');
});
check('Mrs. / Smt. / Sau. / Kumari / Ms. prove female', () => {
  assert.equal(Salutation.detectGender('Mrs. Priya Shah'), 'female');
  assert.equal(Salutation.detectGender('Smt. Anita Deshmukh'), 'female');
  assert.equal(Salutation.detectGender('Sau. Sunita Patil'), 'female');
  assert.equal(Salutation.detectGender('Kumari Sneha Kulkarni'), 'female');
  assert.equal(Salutation.detectGender('Ms. Neha Verma'), 'female');
});
check('Dr. carries no gender; the name after it still decides', () => {
  assert.equal(Salutation.detectGender('Dr. Sneha Kulkarni'), 'female');
  assert.equal(Salutation.detectGender('Dr. Rahul Deshmukh'), 'male');
});
check('Dr. followed by a unisex name stays neutral', () => {
  assert.equal(Salutation.detectGender('Dr. Kiran Rao'), null);
});

console.log('\n— salutation: organisations get no honourific —');

check('company tokens veto the greeting title', () => {
  assert.equal(Salutation.detectGender('Tata Power'), null);
  assert.equal(Salutation.detectGender('Green Energy Solutions'), null);
  assert.equal(Salutation.detectGender('Pune Vidyut Pvt Ltd'), null);
  assert.equal(Salutation.detectGender('Shree Ganesh Industries'), null);
  assert.equal(Salutation.detectGender('Sneha Builders'), null);
});

console.log('\n— salutation: unisex names are never a coin flip —');

check('unisex names resolve to no title', () => {
  assert.equal(Salutation.detectGender('Kiran Rao'), null);
  assert.equal(Salutation.detectGender('Kamal Hasan'), null);
  assert.equal(Salutation.detectGender('Sonu Nigam'), null);
  assert.equal(Salutation.detectGender('Vimal Kumar'), null);
});

console.log('\n— salutation: the name dictionary —');

check('dictionary males, including the weak-ending traps', () => {
  assert.equal(Salutation.detectGender('Ravi Kulkarni'), 'male');   // ends in i
  assert.equal(Salutation.detectGender('Krishna Iyer'), 'male');    // ends in a
  assert.equal(Salutation.detectGender('Raja Bhosale'), 'male');    // ends in a
  assert.equal(Salutation.detectGender('Datta Kale'), 'male');      // ends in a
  assert.equal(Salutation.detectGender('Hari Pawar'), 'male');      // ends in i
  assert.equal(Salutation.detectGender('Rahul Deshmukh'), 'male');
  assert.equal(Salutation.detectGender('Rushikesh Joshi'), 'male');
});
check('dictionary females', () => {
  assert.equal(Salutation.detectGender('Priya Shah'), 'female');
  assert.equal(Salutation.detectGender('Sneha Kulkarni'), 'female');
  assert.equal(Salutation.detectGender('Jyoti Deshpande'), 'female');
  assert.equal(Salutation.detectGender('Anita Deshmukh'), 'female');
  assert.equal(Salutation.detectGender('Pooja Patil'), 'female');
  assert.equal(Salutation.detectGender('Komal Sharma'), 'female');   // -al matches no rule
  assert.equal(Salutation.detectGender('Snehal Desai'), 'female');
});

console.log('\n— salutation: ending heuristics —');

check('strong feminine endings', () => {
  assert.equal(Salutation.detectGender('Bhagyashree Patil'), 'female'); // -shree (dictionary)
  assert.equal(Salutation.detectGender('Bhagyashri Patil'), 'female');  // -shri (rule)
  assert.equal(Salutation.detectGender('Malini Kulkarni'), 'female');   // -ini (rule)
  assert.equal(Salutation.detectGender('Ritika Shah'), 'female');       // -ika (rule)
  assert.equal(Salutation.detectGender('Prabha Kale'), 'female');       // -abha (rule)
});
check('weak feminine endings catch ordinary -a and -i names', () => {
  assert.equal(Salutation.detectGender('Lavanya Joshi'), 'female');     // -a (rule)
  assert.equal(Salutation.detectGender('Sharvari Patil'), 'female');    // -i (rule)
  assert.equal(Salutation.detectGender('Madhavi Patil'), 'female');     // -i (rule)
  assert.equal(Salutation.detectGender('Kavita Joshi'), 'female');      // dictionary
  assert.equal(Salutation.detectGender('Swara Kulkarni'), 'female');    // dictionary
});
check('strong masculine endings', () => {
  assert.equal(Salutation.detectGender('Suresh Patil'), 'male');        // -esh (dictionary)
  assert.equal(Salutation.detectGender('Rajneesh Kulkarni'), 'male');   // -esh (rule)
  assert.equal(Salutation.detectGender('Surendra Kale'), 'male');       // -endra (rule)
  assert.equal(Salutation.detectGender('Ajeet Pawar'), 'male');         // -jeet (rule)
  assert.equal(Salutation.detectGender('Gurdeep Singh'), 'male');       // -deep (rule)
  assert.equal(Salutation.detectGender('Chandrakant Deshmukh'), 'male');// -ant (rule)
  assert.equal(Salutation.detectGender('Shriram Joshi'), 'male');       // dictionary
});
check('weak masculine endings', () => {
  assert.equal(Salutation.detectGender('Chandak Pawar'), 'male');       // -ak (rule)
  assert.equal(Salutation.detectGender('Sushil Pawar'), 'male');        // -il (rule)
  assert.equal(Salutation.detectGender('Abhay Kulkarni'), 'male');      // -ay (rule)
  assert.equal(Salutation.detectGender('Prabhav Joshi'), 'male');       // -av (rule)
  assert.equal(Salutation.detectGender('Samraj Patil'), 'male');        // -aj (rule)
  assert.equal(Salutation.detectGender('Sudhakar Kale'), 'male');       // -ar (rule)
  assert.equal(Salutation.detectGender('Gulshan Pawar'), 'male');       // -an (rule)
  assert.equal(Salutation.detectGender('Deepak Pawar'), 'male');        // dictionary
});
check('nothing matched means no title, not a guess', () => {
  assert.equal(Salutation.detectGender('Zylox Fern'), null);
  assert.equal(Salutation.detectGender('Bo Kite'), null);
  assert.equal(Salutation.detectGender('A'), null);
  assert.equal(Salutation.detectGender(''), null);
});
check('Devanagari names never hit the Latin endings', () => {
  assert.equal(Salutation.detectGender('स्नेहा जोशी'), null);
});

console.log('\n— salutation: the dealer override always wins —');

check('fixed overrides beat detection', () => {
  assert.equal(Salutation.honorMode('Rushikesh Joshi', 'female'), 'female');
  assert.equal(Salutation.honorMode('Priya Shah', 'male'), 'male');
  assert.equal(Salutation.honorMode('Anyone', 'neutral'), 'neutral');
  assert.equal(Salutation.honorMode('Rushikesh Joshi', 'none'), 'none');
});
check('auto and unknown values fall back to detection', () => {
  assert.equal(Salutation.honorMode('Rushikesh Joshi', 'auto'), 'male');
  assert.equal(Salutation.honorMode('Priya Shah', 'bogus'), 'female');
  assert.equal(Salutation.honorMode('Kiran Rao', 'auto'), 'neutral');
  assert.equal(Salutation.honorMode('', 'auto'), 'neutral');
});

console.log('\n— salutation: composed greetings —');

const hi = (name, sal) => Salutation.composeGreeting('hi', { companyName: 'KTM Energy Experts', custName: name, custSalutation: sal });
const mr = (name, sal) => Salutation.composeGreeting('mr', { companyName: 'KTM Energy Experts', custName: name, custSalutation: sal });
const en = (name, sal) => Salutation.composeGreeting('en', { companyName: 'KTM Energy Experts', custName: name, custSalutation: sal });

check('Hindi greets every gender with ji, names in Devanagari', () => {
  assert.ok(hi('Rushikesh Joshi', 'auto').startsWith('नमस्कार रुशिकेश जी।'));
  assert.ok(hi('Priya Shah', 'auto').startsWith('नमस्कार प्रिया जी।'));
  assert.ok(hi('Kiran Rao', 'auto').startsWith('नमस्कार किरण जी।'));
  assert.ok(hi('Rushikesh Joshi', 'auto').includes('KTM Energy Experts की ओर से'));
});
check('Hindi with no title speaks the name bare', () => {
  assert.ok(hi('Rushikesh Joshi', 'none').startsWith('नमस्कार रुशिकेश।'));
  assert.ok(!hi('Rushikesh Joshi', 'none').includes('जी'));
});
check('Hindi without a name keeps the legacy line exactly', () => {
  assert.equal(Salutation.composeGreeting('hi', { companyName: '', custName: '', custSalutation: 'auto' }),
    'नमस्कार। आपके रूफटॉप सौर ऊर्जा प्रस्ताव का यह संक्षिप्त परिचय है।');
  assert.equal(Salutation.composeGreeting('hi', { companyName: 'KTM Energy Experts', custName: '', custSalutation: 'auto' }),
    'नमस्कार। KTM Energy Experts की ओर से आपके रूफटॉप सौर ऊर्जा प्रस्ताव का यह संक्षिप्त परिचय है।');
});
check('Marathi splits sir / madam and falls back to ji, names in Devanagari', () => {
  assert.ok(mr('Rushikesh Joshi', 'auto').startsWith('नमस्कार रुशिकेश सर.'));
  assert.ok(mr('Priya Shah', 'auto').startsWith('नमस्कार प्रिया मॅडम.'));
  assert.ok(mr('Kiran Rao', 'auto').startsWith('नमस्कार किरण जी.'));
  assert.ok(mr('Rushikesh Joshi', 'auto').includes('KTM Energy Experts तर्फे'));
});
check('Marathi with no title speaks the name bare', () => {
  assert.ok(mr('Rushikesh Joshi', 'none').startsWith('नमस्कार रुशिकेश.'));
  assert.ok(!mr('Rushikesh Joshi', 'none').includes('सर'));
});
check('Marathi without a name keeps the legacy line exactly', () => {
  assert.equal(Salutation.composeGreeting('mr', { companyName: '', custName: '', custSalutation: 'auto' }),
    'नमस्कार. आपल्या रूफटॉप सौर ऊर्जा प्रस्तावाचा हा संक्षिप्त आढावा आहे.');
});
check('English answers sir / ma\u2019am / ji', () => {
  assert.ok(en('Rushikesh Joshi', 'auto').startsWith('Welcome, Rushikesh sir, to your rooftop solar proposal'));
  assert.ok(en('Priya Shah', 'auto').startsWith('Welcome, Priya ma\u2019am, to your rooftop solar proposal'));
  assert.ok(en('Kiran Rao', 'auto').startsWith('Welcome, Kiran ji, to your rooftop solar proposal'));
  assert.ok(en('Rushikesh Joshi', 'auto').endsWith('from KTM Energy Experts.'));
});
check('English with no title speaks the name bare', () => {
  assert.ok(en('Rushikesh Joshi', 'none').startsWith('Welcome, Rushikesh, to your rooftop solar proposal'));
});
check('English without a name keeps the legacy line exactly', () => {
  assert.equal(Salutation.composeGreeting('en', { companyName: '', custName: '', custSalutation: 'auto' }),
    'Welcome to your rooftop solar proposal.');
  assert.equal(Salutation.composeGreeting('en', { companyName: 'KTM Energy Experts', custName: '', custSalutation: 'auto' }),
    'Welcome to your rooftop solar proposal from KTM Energy Experts.');
});

console.log('\n— salutation: script matching — every voice reads its own script —');

check('Devanagari is Latinised for the English greeting', () => {
  assert.equal(Salutation.toLatin('रुशिकेश'), 'Rushikesh');
  assert.equal(Salutation.toLatin('रमेश'), 'Ramesh');
  assert.equal(Salutation.toLatin('स्नेहा'), 'Sneha');
  assert.equal(Salutation.toLatin('अनिता'), 'Anita');
  assert.equal(Salutation.toLatin('प्रिया'), 'Priya');
  assert.equal(Salutation.toLatin('पूर्णिमा'), 'Purnima');
  assert.equal(Salutation.toLatin('जोशी'), 'Joshi');
  assert.equal(Salutation.toLatin('कविता'), 'Kavita');
});
check('Latin is Devanagarised for the Hindi/Marathi greeting', () => {
  assert.equal(Salutation.toDevanagari('Rushikesh'), 'रुशिकेश');
  assert.equal(Salutation.toDevanagari('Ramesh'), 'रमेश');
  assert.equal(Salutation.toDevanagari('Priya'), 'प्रिया');
  assert.equal(Salutation.toDevanagari('Anita'), 'अनिता');
  assert.equal(Salutation.toDevanagari('Kavita'), 'कविता');
  assert.equal(Salutation.toDevanagari('Deepak'), 'दीपक');
  assert.equal(Salutation.toDevanagari('Sunil'), 'सुनील');
});
check('exception names keep their spoken schwas', () => {
  assert.equal(Salutation.toDevanagari('Kiran'), 'किरण');
  assert.equal(Salutation.toDevanagari('Sneha'), 'स्नेहा');
  assert.equal(Salutation.toDevanagari('Krishna'), 'कृष्ण');
  assert.equal(Salutation.toDevanagari('Komal'), 'कोमल');
});
check('common names match the spelling a Marathi speaker would write', () => {
  /* The exact point Google Translate was checked against: vowel lengths are
     lexical, so the verified dictionary carries these, not the rules. */
  assert.equal(Salutation.toDevanagari('Radhika'), 'राधिका');
  assert.equal(Salutation.toDevanagari('Rakesh'), 'राकेश');
  assert.equal(Salutation.toDevanagari('Rajesh'), 'राजेश');
  assert.equal(Salutation.toDevanagari('Sunil'), 'सुनील');
  assert.equal(Salutation.toDevanagari('Sudhir'), 'सुधीर');
  assert.equal(Salutation.toDevanagari('Sunita'), 'सुनीता');
  assert.equal(Salutation.toDevanagari('Madhuri'), 'माधुरी');
  assert.equal(Salutation.toDevanagari('Shivaji'), 'शिवाजी');
  assert.equal(Salutation.toDevanagari('Prakash'), 'प्रकाश');
  assert.equal(Salutation.toDevanagari('Kailash'), 'कैलाश');
  assert.equal(Salutation.toDevanagari('Vaishali'), 'वैशाली');
  assert.equal(Salutation.toDevanagari('Kiran'), 'किरण');
});
check('the greeting now matches Google for the same name', () => {
  const s = { companyName: 'KTM Energy Experts', custName: 'Radhika', custSalutation: 'auto' };
  assert.ok(Salutation.composeGreeting('mr', s).startsWith('नमस्कार राधिका मॅडम.'));
  assert.ok(Salutation.composeGreeting('hi', s).startsWith('नमस्कार राधिका जी।'));
  assert.ok(Salutation.composeGreeting('en', s).startsWith('Welcome, Radhika ma\u2019am,'));
});
check('anusvara, inherent schwas and explicit final "a" land correctly', () => {
  assert.equal(Salutation.toDevanagari('Sanjay'), 'संजय');
  assert.equal(Salutation.toDevanagari('Mahendra'), 'महेंद्र');
  assert.equal(Salutation.toDevanagari('Raja'), 'राजा');
});
check('unknown letters refuse transliteration instead of guessing', () => {
  assert.equal(Salutation.toDevanagari('Zylox Fern'), 'Zylox Fern');
});
check('a Devanagari name plays out loud in English because it is Latinised', () => {
  const s = { companyName: 'KTM Energy Experts', custName: 'Rushikesh Joshi', custSpokenName: 'रुशिकेश', custSalutation: 'male' };
  assert.ok(Salutation.composeGreeting('en', s).startsWith('Welcome, Rushikesh sir,'));
});
check('a Latin name speaks Devanagari in Hindi and Marathi', () => {
  const s = { companyName: 'KTM Energy Experts', custName: 'Priya Shah', custSalutation: 'auto' };
  assert.ok(Salutation.composeGreeting('mr', s).startsWith('नमस्कार प्रिया मॅडम.'));
  assert.ok(Salutation.composeGreeting('hi', s).startsWith('नमस्कार प्रिया जी।'));
});
check('already-matching scripts pass through untouched', () => {
  const s = { companyName: '', custName: 'रुशिकेश जोशी', custSalutation: 'neutral' };
  assert.ok(Salutation.composeGreeting('mr', s).startsWith('नमस्कार रुशिकेश जी.'));
  assert.ok(Salutation.composeGreeting('en', s).startsWith('Welcome, Rushikesh ji,'));
});
check('organisations keep their typed name and never get a title', () => {
  const s = { companyName: '', custName: 'Tata Power', custSalutation: 'auto' };
  assert.equal(Salutation.composeGreeting('en', s), 'Welcome, Tata Power, to your rooftop solar proposal.');
  assert.equal(Salutation.composeGreeting('mr', s), 'नमस्कार Tata Power. आपल्या रूफटॉप सौर ऊर्जा प्रस्तावाचा हा संक्षिप्त आढावा आहे.');
});

console.log('\n— salutation: the dealer\u2019s phonetic spelling —');

check('a typed "say the name as" is honoured in every language', () => {
  const s = { companyName: 'KTM Energy Experts', custName: 'Rushikesh Joshi', custSpokenName: 'रुशिकेश', custSalutation: 'male' };
  assert.ok(Salutation.composeGreeting('mr', s).startsWith('नमस्कार रुशिकेश सर.'));
  assert.ok(Salutation.composeGreeting('hi', s).startsWith('नमस्कार रुशिकेश जी।'));
  assert.ok(Salutation.composeGreeting('en', s).startsWith('Welcome, Rushikesh sir,'));
});
check('auto detection runs on the spoken name when it is the only name', () => {
  const s = { companyName: '', custName: 'R. Sharma', custSpokenName: 'Priya', custSalutation: 'auto' };
  assert.ok(Salutation.composeGreeting('en', s).startsWith('Welcome, Priya ma\u2019am,'));
});
check('an empty phonetic spelling changes nothing', () => {
  const s = { companyName: 'KTM Energy Experts', custName: 'Rushikesh Joshi', custSpokenName: '   ', custSalutation: 'auto' };
  assert.ok(Salutation.composeGreeting('en', s).startsWith('Welcome, Rushikesh sir,'));
});
check('a Devanagari spoken name with no detection keeps the neutral ji', () => {
  const s = { companyName: '', custName: 'Rushikesh Joshi', custSpokenName: 'रुशिकेश', custSalutation: 'auto' };
  assert.ok(Salutation.composeGreeting('mr', s).startsWith('नमस्कार रुशिकेश जी.'));
});

console.log('\n— salutation: the closing —');

check('every language ends with thanks', () => {
  assert.equal(Salutation.composeClosing('hi'), 'आपके समय के लिए धन्यवाद।');
  assert.equal(Salutation.composeClosing('mr'), 'आपल्या वेळेसाठी धन्यवाद.');
  assert.equal(Salutation.composeClosing('en'), 'Thank you for your time.');
});

console.log('\n— salutation: inside the real briefing script —');

check('the briefing opens with the personal greeting and ends with thanks', () => {
  const { Briefing } = bootBriefing();
  const s = { companyName: 'KTM Energy Experts', custName: 'Rushikesh Joshi', custSalutation: 'auto', capacity: '7' };
  for (const [lang, open, close] of [
    ['en', 'Welcome, Rushikesh sir, to your rooftop solar proposal from KTM Energy Experts.', 'Thank you for your time.'],
    ['hi', 'नमस्कार रुशिकेश जी। KTM Energy Experts की ओर से आपके रूफटॉप सौर ऊर्जा प्रस्ताव का यह संक्षिप्त परिचय है।', 'आपके समय के लिए धन्यवाद।'],
    ['mr', 'नमस्कार रुशिकेश सर. KTM Energy Experts तर्फे आपल्या रूफटॉप सौर ऊर्जा प्रस्तावाचा हा संक्षिप्त आढावा आहे.', 'आपल्या वेळेसाठी धन्यवाद.']
  ]) {
    const script = Briefing.scriptFor(s, lang);
    assert.equal(script[0], open, lang + ' opening');
    assert.equal(script[script.length - 1], close, lang + ' closing');
  }
});
check('a female customer flips sir to ma\u2019am / madam', () => {
  const { Briefing } = bootBriefing();
  const s = { companyName: 'KTM Energy Experts', custName: 'Priya Shah', custSalutation: 'auto', capacity: '7' };
  assert.ok(Briefing.scriptFor(s, 'en')[0].startsWith('Welcome, Priya ma\u2019am,'));
  assert.ok(Briefing.scriptFor(s, 'mr')[0].startsWith('नमस्कार प्रिया मॅडम.'));
});
check('no name means the legacy greeting survives unchanged', () => {
  const { Briefing } = bootBriefing();
  const s = { companyName: 'KTM Energy Experts', custName: '', custSalutation: 'auto', capacity: '7' };
  assert.equal(Briefing.scriptFor(s, 'en')[0], 'Welcome to your rooftop solar proposal from KTM Energy Experts.');
  assert.equal(Briefing.scriptFor(s, 'hi')[0], 'नमस्कार। KTM Energy Experts की ओर से आपके रूफटॉप सौर ऊर्जा प्रस्ताव का यह संक्षिप्त परिचय है।');
  assert.equal(Briefing.scriptFor(s, 'mr')[0], 'नमस्कार. KTM Energy Experts तर्फे आपल्या रूफटॉप सौर ऊर्जा प्रस्तावाचा हा संक्षिप्त आढावा आहे.');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

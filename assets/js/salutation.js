/* Audio greeting salutation: a personal "Namaskar Rushikesh sir" instead of a
   faceless "Namaskar".

   The greeting spoken by the briefing needs an honourific, and the form never
   asks for gender. So this module derives one from the customer's name — and
   follows the same discipline as the engineering pages: state what the data
   proves, never guess out loud.

   Detection pipeline (first given name only; surnames are unreliable):
     1. explicit honourifics   — "Mr." / "Shri" prove male, "Mrs." / "Smt." /
                                 "Kumari" prove female; "Dr." / "Prof." carry
                                 no gender and are skipped.
     2. organisation guard     — "Pvt", "Ltd", "Industries" and friends mean a
                                 company name, never a person: no honourific.
     3. unisex dictionary      — Kiran, Kamal, Sonu… are spoken both ways; a
                                 coin flip here would be a guess, so no title.
     4. name dictionary        — common Indian / Marathi first names.
     5. ending heuristics      — strong endings (-esh, -endra, -ini, -ika,
                                 -shri…) then weak ones (-a, -i for feminine;
                                 -ak, -il, -ay, -av for masculine).
     6. nothing matched        — no title is spoken.

   When detection lands nothing, or the dealer picks it, the neutral "ji" is
   used: it is respectful and correct for every gender in English, Hindi and
   Marathi alike. The form's "Address customer as" control always wins over
   detection, so a wrong guess is one click away from being fixed.

   Devanagari input is supported for reading and display; gender endings are
   applied to Latin spellings only, so a Devanagari name that is not in the
   dictionary politely gets "ji" rather than a guess. */
'use strict';
(function (root) {

  /* ---- 1. explicit honourifics ---------------------------------------- */
  const TITLE_MALE = new Set(['mr', 'mister', 'shri', 'shree', 'sri', 'shriman']);
  const TITLE_FEMALE = new Set(['mrs', 'miss', 'ms', 'smt', 'sau', 'sow', 'kumari', 'ku']);
  /* Titles that say nothing about gender; they are skipped, not answered. */
  const TITLE_SKIP = new Set(['dr', 'prof', 'professor', 'er', 'adv', 'ca', 'cs',
    'col', 'maj', 'gen', 'capt', 'wing', 'sqn', 'hon', 'late']);

  /* ---- 3. spoken both ways — never a coin flip ------------------------- */
  const UNISEX = new Set(['kiran', 'kamal', 'sonu', 'vimal', 'prem', 'kanchan',
    'shashi', 'suman', 'chanda', 'bala', 'daya']);

  /* ---- 4. common Indian / Marathi first names -------------------------- */
  const MALE = new Set([
    'aadesh', 'abhinav', 'abhijit', 'abhishek', 'aditya', 'aakash', 'akash',
    'akshay', 'alok', 'amar', 'amit', 'amol', 'anand', 'anil', 'ankit',
    'ankush', 'arjun', 'arvind', 'ashish', 'ashok', 'ashwin', 'avinash',
    'balaji', 'bhavesh', 'bhushan', 'bhaskar', 'chetan', 'damodar', 'datta',
    'dayanand', 'deepak', 'devendra', 'dhananjay', 'dharmendra', 'dhiraj',
    'dhruv', 'dilip', 'dinesh', 'ganesh', 'ganpat', 'gaurav', 'girish',
    'gopal', 'govind', 'gurunath', 'hari', 'harish', 'hemant', 'hitesh',
    'hrishikesh', 'jagdish', 'jayant', 'jayesh', 'jeevan', 'jignesh',
    'jitesh', 'kailash', 'kailas', 'kalyan', 'kamlesh', 'karan', 'kartik',
    'ketan', 'kishan', 'kishore', 'krishna', 'kunal', 'laxman', 'lokesh',
    'mahadev', 'mahendra', 'mahesh', 'madhav', 'madhukar', 'manish',
    'manoj', 'manohar', 'mayur', 'milind', 'mohan', 'mohit', 'mukesh',
    'mukund', 'murali', 'nagesh', 'naresh', 'navin', 'naveen', 'nikhil',
    'nilesh', 'niranjan', 'nitin', 'paresh', 'pandurang', 'pankaj',
    'parth', 'prabhu', 'pradeep', 'prakash', 'pramod', 'pranav', 'prashant',
    'pratap', 'pravin', 'praveen', 'prateek', 'pavan', 'pawan', 'raghav',
    'rahul', 'raj', 'raja', 'rajan', 'rajesh', 'rajendra', 'rajiv', 'rakesh',
    'ram', 'raman', 'ramesh', 'ravi', 'ravindra', 'rishi', 'ritesh', 'rohan',
    'rohit', 'rudra', 'sachin', 'sagar', 'sameer', 'samir', 'sandeep',
    'sandip', 'sangram', 'sanjay', 'sanket', 'santosh', 'satish',
    'satyajeet', 'saurabh', 'shankar', 'shantanu', 'sharad', 'shashank',
    'shekhar', 'shirish', 'shivaji', 'shreyas', 'shriram', 'shyam',
    'sidharth', 'siddhartha', 'somnath', 'srikant', 'subhash', 'sudhir',
    'suhas', 'suresh', 'suraj', 'swapnil', 'tanaji', 'tejas', 'uday',
    'ulhas', 'umesh', 'uttam', 'vaibhav', 'vikas', 'vikram', 'vinay',
    'vinod', 'vishal', 'vishnu', 'vishwas', 'vivek', 'yash', 'yashwant',
    'yogesh'
  ]);
  const FEMALE = new Set([
    'aarti', 'arti', 'amruta', 'amita', 'ananya', 'anita', 'anjali',
    'anushka', 'archana', 'asha', 'avani', 'bhagyashree', 'bhairavi',
    'bhavana', 'bhavna', 'chaitali', 'darshana', 'deepa', 'deepti',
    'devika', 'dhanashree', 'dipali', 'durga', 'gauri', 'gayatri', 'geeta',
    'gita', 'girija', 'harshada', 'hema', 'himani', 'indira', 'ishita',
    'jyoti', 'kajal', 'kalpana', 'kalyani', 'kamla', 'kanika', 'karishma',
    'kashmira', 'kavita', 'kavya', 'kirti', 'kritika', 'kusum', 'lakshmi',
    'lalita', 'lata', 'latika', 'madhuri', 'mahima', 'mala', 'mallika',
    'manasi', 'manisha', 'manju', 'meena', 'meera', 'megha', 'meghana',
    'mira', 'monika', 'mridula', 'mrunal', 'mrunmayee', 'mukti', 'naina',
    'namrata', 'nanda', 'nandini', 'neelam', 'neha', 'nilima', 'nisha',
    'nita', 'nitika', 'padma', 'pallavi', 'pooja', 'puja', 'poonam',
    'prachi', 'pragati', 'pragya', 'prajakta', 'pranali', 'pranoti',
    'prerna', 'priya', 'priyanka', 'purnima', 'pushpa', 'radha', 'radhika',
    'ragini', 'rajashree', 'ranjana', 'rashmi', 'reema', 'reena', 'rekha',
    'revati', 'richa', 'rina', 'ritu', 'rohini', 'roopa', 'rupa', 'rukmini',
    'sabita', 'sakshi', 'samiksha', 'sandhya', 'sarita', 'savita', 'seema',
    'shabana', 'shalini', 'shanta', 'shanti', 'sharada', 'sheetal', 'shilpa',
    'shraddha', 'shreya', 'shweta', 'shobha', 'siddhi', 'simran', 'sital',
    'smita', 'sneha', 'snehal', 'komal', 'sonal', 'sonali', 'sonia',
    'sunita', 'sushma', 'swara', 'swapna', 'swati', 'tanvi', 'tejal',
    'tulsi', 'uma', 'urmila', 'ujjwala', 'vaishali', 'vandana', 'varsha',
    'vasudha', 'vedika', 'vibha', 'vidya', 'vijaya', 'vimala', 'vina',
    'vinaya', 'vishakha', 'vrunda', 'yamini', 'yashashree', 'yashoda',
    'zoya'
  ]);

  /* ---- 2. organisation guard -------------------------------------------
     A quotation to "Tata Power" must never open with "ma'am". */
  const COMPANY_TOKENS = new Set(['pvt', 'ltd', 'llc', 'llp', 'co', 'corp',
    'corporation', 'company', 'inc', 'incorporated', 'industries', 'industry',
    'infra', 'infrastructure', 'enterprises', 'enterprise', 'solutions',
    'solution', 'services', 'service', 'group', 'associates', 'associate',
    'builders', 'builder', 'developers', 'developer', 'constructions',
    'construction', 'traders', 'trader', 'agency', 'bank', 'school',
    'college', 'institute', 'university', 'academy', 'hospital', 'clinic',
    'trust', 'society', 'club', 'hotel', 'resort', 'apartments', 'apartment',
    'housing', 'estates', 'estate', 'mills', 'mill', 'textiles', 'pharma',
    'labs', 'lab', 'motors', 'automobiles', 'electronics', 'electricals',
    'electrical', 'electric', 'electricity', 'vidyut', 'power', 'energy',
    'solar', 'renewable', 'renewables', 'utilities', 'utility',
    'manufacturing', 'manufacturers', 'manufacturer', 'distributors',
    'distributor', 'suppliers', 'supplier', 'stores', 'store', 'mart',
    'bazaar', 'foundation', 'ngo', 'classes', 'technologies', 'technology',
    'tech', 'engineering', 'engg', 'fabricators', 'fabricator', 'steel',
    'cement', 'chemicals', 'chemical', 'foods', 'agro', 'ventures',
    'venture', 'holdings', 'capital', 'finance', 'financial', 'investments',
    'consultants', 'consultant', 'consultancy', 'architects', 'interiors',
    'packaging', 'plastics', 'cables', 'wires', 'switchgear', 'transformers',
    'pumps', 'hardware', 'tools', 'machinery', 'communications',
    'telecom', 'media']);

  const DEVANAGARI = /[\u0900-\u097F]/;

  /* Lower-cased tokens with punctuation stripped. "M/s" is the mercantile
     prefix, not "Ms.", and is removed before any title is read. */
  function tokensOf(rawName) {
    return String(rawName || '')
      .replace(/m\/s\.?/gi, ' ')
      .toLowerCase()
      .split(/\s+/)
      .map(t => t.replace(/[^a-z\u0900-\u097F]/g, ''))
      .filter(Boolean);
  }

  /* The name actually spoken in the greeting: the first token that is not an
     honourific and not a single-letter initial. Devanagari is preserved
     as-typed; Latin names get their first letter raised. */
  function displayName(rawName) {
    const parts = String(rawName || '').replace(/m\/s\.?/gi, ' ').trim().split(/\s+/);
    for (const part of parts) {
      const core = part.replace(/[.,!?;:]+$/, '').replace(/^[.,!?;:]+/, '').trim();
      if (!core) continue;
      const lower = core.toLowerCase().replace(/[^a-z\u0900-\u097F]/g, '');
      if (!lower || lower.length <= 1) continue;
      if (TITLE_MALE.has(lower) || TITLE_FEMALE.has(lower) || TITLE_SKIP.has(lower)) continue;
      if (DEVANAGARI.test(core)) return core;
      return core.charAt(0).toUpperCase() + core.slice(1);
    }
    return '';
  }

  /* ---- 5. ending heuristics --------------------------------------------
     Strong endings are near-never wrong; weak ones are right often enough
     that a dealer's one-click override is cheaper than a silent greeting.
     Dictionaries and the unisex list ran first, so known exceptions
     (Krishna, Raja, Ravi, Datta…) never reach the weak rules. */
  const FEMALE_ENDINGS_STRONG = ['abha', 'shree', 'shri', 'ini', 'ika', 'rani', 'devi', 'usha'];
  const FEMALE_ENDINGS_WEAK = ['ee', 'i', 'a'];
  const MALE_ENDINGS_STRONG = ['endra', 'andra', 'prasad', 'kumar', 'datta',
    'gopal', 'jeet', 'deep', 'dip', 'kant', 'nath', 'bhan', 'veer', 'vir',
    'esh', 'ant', 'rao', 'jit', 'das', 'dev', 'lal'];
  const MALE_ENDINGS_WEAK = ['ay', 'av', 'ak', 'il', 'aj', 'ar', 'an'];

  function detectGender(rawName) {
    const toks = tokensOf(rawName);
    if (!toks.length) return null;
    if (toks.some(t => COMPANY_TOKENS.has(t))) return null;
    let given = null;
    for (const t of toks) {
      if (given) break;
      if (TITLE_MALE.has(t)) return 'male';
      if (TITLE_FEMALE.has(t)) return 'female';
      if (TITLE_SKIP.has(t) || t.length <= 1) continue;
      given = t;
    }
    if (!given) return null;
    if (UNISEX.has(given)) return null;
    if (MALE.has(given)) return 'male';
    if (FEMALE.has(given)) return 'female';
    if (DEVANAGARI.test(given)) return null; // readable, but no ending rules for Devanagari
    if (given.length < 3) return null;
    for (const e of FEMALE_ENDINGS_STRONG) if (given.endsWith(e)) return 'female';
    for (const e of MALE_ENDINGS_STRONG) if (given.endsWith(e)) return 'male';
    for (const e of FEMALE_ENDINGS_WEAK) if (given.endsWith(e)) return 'female';
    for (const e of MALE_ENDINGS_WEAK) if (given.endsWith(e)) return 'male';
    return null;
  }

  /* The form's choice is the source of truth; detection is only the default.
     'none' means the dealer wants the name spoken bare, no honourific; an
     organisation never gets one either. */
  const MODES = ['male', 'female', 'neutral', 'none'];
  function honorMode(rawName, override) {
    if (override === 'custom') return 'custom';
    if (MODES.includes(override)) return override;
    if (isOrganisation(rawName)) return 'none';
    return detectGender(rawName) || 'neutral';
  }

  /* The spoken honourific per language. Hindi answers every gender with "जी"
     by design; English and Marathi split sir/ma'am, with "ji"/"जी" as the
     safe middle when nothing is known. */
  const HONORS = {
    en: { male: 'sir', female: 'ma\u2019am', neutral: 'ji' },
    hi: { male: 'जी', female: 'जी', neutral: 'जी' },
    mr: { male: 'सर', female: 'मॅडम', neutral: 'जी' }
  };

  /* ---- script matching ----------------------------------------------------
     Voices only read their own script: an English voice falls silent on
     Devanagari, and an Indic voice stumbles over Latin-spelled Indian names.
     So the greeting always meets the voice in its own script — Devanagari is
     Latinised for English ("रुशिकेश" → "Rushikesh") and Latin is Devanagari-
     sed for Hindi/Marathi ("Rushikesh" → "रुशिकेश"). Both directions are
     plain letter arithmetic with a small exception list for the few names
     whose spoken form no rule captures (Krishna, Kiran, Sneha…). */
  const D_CONS = { 'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'च': 'ch', 'छ': 'chh',
    'ज': 'j', 'झ': 'jh', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'ph',
    'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
    'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l', 'ञ': 'n', 'ङ': 'n' };
  const D_MATRA = { 'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
    'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au' };
  const D_VOWEL = { 'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u',
    'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au' };

  function toLatin(dev) {
    const chars = [...String(dev || '')];
    let out = '';
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i], nx = chars[i + 1];
      if (D_CONS[c]) {
        if (nx === '्') { out += D_CONS[c]; i++; continue; }            // conjunct, no vowel
        if (nx && D_MATRA[nx]) { out += D_CONS[c] + D_MATRA[nx]; i++; continue; }
        if (nx && (D_CONS[nx] || D_VOWEL[nx] || nx === 'ं' || nx === 'ँ')) { out += D_CONS[c] + 'a'; continue; }
        out += D_CONS[c];                                              // word-final: no trailing schwa
        continue;
      }
      if (D_VOWEL[c]) { out += D_VOWEL[c]; continue; }
      if (c === 'ं' || c === 'ँ') { out += 'n'; continue; }
      if (c === 'ः') { out += 'h'; continue; }
      if (c === '्') continue;
      if (/\s/.test(c)) { out += ' '; continue; }
      if (/[A-Za-z0-9.,'-]/.test(c)) { out += c; continue; }
    }
    return out.replace(/\s+/g, ' ').trim()
      /* Names come back capitalised: "joshi" would read like a word, not a person. */
      .replace(/(^|\s)([a-z])/g, (_, sp, c) => sp + c.toUpperCase());
  }

  /* Longest-match first, so "chh" wins over "ch", "aa" over "a". */
  const C_ORDER = ['chh', 'sh', 'kh', 'gh', 'jh', 'th', 'dh', 'ph', 'bh', 'gy',
    'ch', 'k', 'g', 'j', 't', 'd', 'n', 'p', 'b', 'm', 'y', 'r', 'l', 'v', 'w', 's', 'h'];
  const V_ORDER = ['aa', 'ee', 'oo', 'ai', 'au', 'ri', 'a', 'i', 'u', 'e', 'o'];
  const V_MATRA = { aa: 'ा', i: 'ि', ee: 'ी', u: 'ु', oo: 'ू', ri: 'ृ', e: 'े', ai: 'ै', o: 'ो', au: 'ौ' };
  const V_IND = { aa: 'आ', a: 'अ', ee: 'ई', i: 'इ', oo: 'ऊ', u: 'उ', ri: 'ऋ', e: 'ए', ai: 'ऐ', o: 'ओ', au: 'औ' };
  /* Latin script does not write vowel length — "Radhika" is राधिका but
     "Kavita" is कविता, same shape, different sound. That is lexical, not
     rule-able, so the common names carry their own verified Devanagari,
     matching what Google Translate and a Marathi speaker would write. The
     rules below remain the fallback for names not listed here. */
  const NAME_DEV = {
    /* female */
    aarti: 'आरती', amruta: 'अमृता', anita: 'अनिता', anjali: 'अंजली', anushka: 'अनुष्का',
    archana: 'अर्चना', asha: 'आशा', avani: 'अवनी', bhagyashree: 'भाग्यश्री',
    bhairavi: 'भैरवी', bhavana: 'भावना', chaitali: 'चैताली', darshana: 'दर्शना',
    deepa: 'दीपा', deepti: 'दीप्ती', devika: 'देविका', dhanashree: 'धनश्री',
    dipali: 'दिपाली', durga: 'दुर्गा', gauri: 'गौरी', gayatri: 'गायत्री', geeta: 'गीता',
    harshada: 'हर्षदा', hema: 'हेमा', himani: 'हिमानी', indira: 'इंदिरा', jyoti: 'ज्योति',
    kajal: 'काजल', kalpana: 'कल्पना', kalyani: 'कल्याणी', kamla: 'कमला', kanika: 'कनिका',
    karishma: 'करिश्मा', kavita: 'कविता', kavya: 'काव्या', kirti: 'कीर्ती', komal: 'कोमल',
    kusum: 'कुसुम', lakshmi: 'लक्ष्मी', lalita: 'ललिता', lata: 'लता', madhuri: 'माधुरी',
    mahima: 'महिमा', mala: 'माला', mallika: 'मल्लिका', manasi: 'मानसी', manisha: 'मनीषा',
    manju: 'मंजू', meena: 'मीना', meera: 'मीरा', megha: 'मेघा', meghana: 'मेघना',
    monika: 'मोनिका', mridula: 'मृदुला', mrunal: 'मृणाल', mukti: 'मुक्ती', naina: 'नैना',
    namrata: 'नम्रता', nandini: 'नंदिनी', neelam: 'नीलम', neha: 'नेहा', nilima: 'नीलिमा',
    nisha: 'निशा', nita: 'नीता', padma: 'पद्मा', pallavi: 'पल्लवी', pooja: 'पूजा',
    poonam: 'पूनम', prachi: 'प्राची', pragati: 'प्रगती', pragya: 'प्रज्ञा',
    prajakta: 'प्राजक्ता', pranali: 'प्रणाली', prerna: 'प्रेरणा', priya: 'प्रिया',
    priyanka: 'प्रियांका', purnima: 'पूर्णिमा', pushpa: 'पुष्पा', radha: 'राधा',
    radhika: 'राधिका', ragini: 'रागिनी', ranjana: 'रंजना', rashmi: 'रश्मी', rekha: 'रेखा',
    revati: 'रेवती', richa: 'ऋचा', ritu: 'ऋतू', rohini: 'रोहिणी', roopa: 'रूपा',
    rukmini: 'रुक्मिणी', sakshi: 'साक्षी', sandhya: 'संध्या', sarita: 'सरीता',
    savita: 'सविता', seema: 'सीमा', shalini: 'शालिनी', shanta: 'शांता', shanti: 'शांती',
    sharada: 'शारदा', sheetal: 'शीतल', shilpa: 'शिल्पा', shraddha: 'श्रद्धा',
    shreya: 'श्रेया', shweta: 'श्वेता', shobha: 'शोभा', siddhi: 'सिद्धी', simran: 'सिमरन',
    smita: 'स्मिता', sneha: 'स्नेहा', snehal: 'स्नेहल', sonali: 'सोनाली', sonia: 'सोनिया',
    sunita: 'सुनीता', sushma: 'सुषमा', swara: 'स्वरा', swapna: 'स्वप्ना', swati: 'स्वाती',
    tanvi: 'तन्वी', tejal: 'तेजल', tulsi: 'तुलसी', uma: 'उमा', urmila: 'उर्मिला',
    ujjwala: 'उज्ज्वला', vaishali: 'वैशाली', vandana: 'वंदना', varsha: 'वर्षा',
    vasudha: 'वसुधा', vedika: 'वेदिका', vibha: 'विभा', vidya: 'विद्या', vijaya: 'विजया',
    vrunda: 'वृंदा', yamini: 'यामिनी', yashashree: 'यशश्री', yashoda: 'यशोदा',
    /* unisex */
    kiran: 'किरण', kamal: 'कमल', suman: 'सुमन', vimal: 'विमल', bala: 'बाला',
    kanchan: 'कंचन', prem: 'प्रेम', shashi: 'शशी', chanda: 'चंदा', sonu: 'सोनू',
    /* male */
    abhijit: 'अभिजित', abhishek: 'अभिषेक', aditya: 'आदित्य', aakash: 'आकाश',
    akshay: 'अक्षय', alok: 'आलोक', amar: 'अमर', amit: 'अमित', amol: 'अमोल',
    anand: 'आनंद', anil: 'अनिल', ankit: 'अंकित', ankur: 'अंकुर', anushay: 'अनुशय',
    arjun: 'अर्जुन', arvind: 'अरविंद', ashish: 'आशिष', ashok: 'अशोक', ashwin: 'अश्विन',
    avinash: 'अविनाश', balaji: 'बालाजी', bhaushan: 'भूषण', bhushan: 'भूषण',
    chetan: 'चेतन', datta: 'दत्ता', dayanand: 'दयानंद', deepak: 'दीपक',
    devendra: 'देवेंद्र', dhananjay: 'धनंजय', dhiraj: 'धीरज', dhruv: 'ध्रुव',
    dilip: 'दिलीप', dinesh: 'दिनेश', ganesh: 'गणेश', ganpat: 'गणपत', gaurav: 'गौरव',
    girish: 'गिरीश', gopal: 'गोपाल', govind: 'गोविंद', hari: 'हरी', harish: 'हरीश',
    hemant: 'हेमंत', hrishikesh: 'हृषिकेश', jayant: 'जयंत', jayesh: 'जयेश',
    jeevan: 'जीवन', jignesh: 'जिग्नेश', jitesh: 'जितेश', kailash: 'कैलाश',
    kailas: 'कैलास', kalyan: 'कल्याण', kamlesh: 'कमलेश', karan: 'करण', kartik: 'कार्तिक',
    ketan: 'केतन', kishan: 'किशन', kishore: 'किशोर', krishna: 'कृष्ण', kunal: 'कुणाल',
    laxman: 'लक्ष्मण', lokesh: 'लोकेश', mahadev: 'महादेव', mahendra: 'महेंद्र',
    mahesh: 'महेश', madhav: 'माधव', madhukar: 'मधुकर', manish: 'मनीष', manoj: 'मनोज',
    manohar: 'मनोहर', mayur: 'मयूर', milind: 'मिलिंद', mohan: 'मोहन', mohit: 'मोहित',
    mukesh: 'मुकेश', mukund: 'मुकुंद', murali: 'मुरली', nagesh: 'नागेश', naresh: 'नरेश',
    navin: 'नवीन', naveen: 'नवीन', nikhil: 'निखिल', nilesh: 'निलेश', nitin: 'नितीन',
    pandurang: 'पांडुरंग', pankaj: 'पंकज', parth: 'पार्थ', prabhakar: 'प्रभाकर',
    pradeep: 'प्रदीप', prakash: 'प्रकाश', pramod: 'प्रमोद', pranav: 'प्रणव',
    prashant: 'प्रशांत', pratap: 'प्रताप', pravin: 'प्रवीण', praveen: 'प्रवीण',
    prateek: 'प्रतीक', pavan: 'पवन', pawan: 'पवन', raghav: 'राघव', rahul: 'राहुल',
    raj: 'राज', raja: 'राजा', rajan: 'राजन', rajesh: 'राजेश', rajendra: 'राजेंद्र',
    rajiv: 'राजीव', rakesh: 'राकेश', ram: 'राम', raman: 'रमन', ramesh: 'रमेश',
    ravi: 'रवि', ravindra: 'रवींद्र', ritesh: 'रितेश', rohan: 'रोहन', rohit: 'रोहित',
    rudra: 'रुद्र', rushikesh: 'रुशिकेश', sachin: 'सचिन', sagar: 'सागर', sameer: 'समीर',
    samir: 'समीर', sandeep: 'संदीप', sandip: 'संदीप', sangram: 'संग्राम', sanjay: 'संजय',
    sanket: 'संकेत', santosh: 'संतोष', satish: 'सतीश', saurabh: 'सौरभ', shankar: 'शंकर',
    sharad: 'शरद', shashank: 'शशांक', shekhar: 'शेखर', shivaji: 'शिवाजी',
    shriram: 'श्रीराम', shyam: 'श्याम', sidharth: 'सिद्धार्थ', siddhartha: 'सिद्धार्थ',
    somnath: 'सोमनाथ', srikant: 'श्रीकांत', subhash: 'सुभाष', sudhir: 'सुधीर',
    suhas: 'सुहास', suresh: 'सुरेश', suraj: 'सुरज', sunil: 'सुनील', swapnil: 'स्वप्निल', tanaji: 'तानाजी',
    tejas: 'तेजस', uday: 'उदय', ulhas: 'उल्हास', umesh: 'उमेश', uttam: 'उत्तम',
    vaibhav: 'वैभव', vikas: 'विकास', vikram: 'विक्रम', vinay: 'विनय', vinod: 'विनोद',
    vishal: 'विशाल', vishnu: 'विष्णु', vivek: 'विवेक', yash: 'यश', yashwant: 'यशवंत',
    yogesh: 'योगेश'
  };

  function tokenizeWord(word) {
    const toks = [];
    let i = 0;
    while (i < word.length) {
      let hit = null;
      for (const c of C_ORDER) { if (word.startsWith(c, i)) { hit = { t: 'c', v: c }; break; } }
      if (!hit) for (const v of V_ORDER) { if (word.startsWith(v, i)) { hit = { t: 'v', v }; break; } }
      if (!hit) return null;                       // unknown letter → refuse, caller keeps the original
      toks.push(hit);
      i += hit.v.length;
    }
    return toks;
  }
  function buildWord(toks) {
    let out = '';
    for (let j = 0; j < toks.length; j++) {
      const tok = toks[j], nx = toks[j + 1];
      if (tok.t === 'v') {
        /* A vowel only stands alone at the start of the word; everywhere
           else it is a matra owned by the consonant before it. */
        out += j === 0 ? V_IND[tok.v] : V_MATRA[tok.v];
        continue;
      }
      const base = { chh: 'छ', sh: 'श', kh: 'ख', gh: 'घ', jh: 'झ', th: 'थ', dh: 'ध',
        ph: 'फ', bh: 'भ', gy: 'ज्ञ', ch: 'च', k: 'क', g: 'ग', j: 'ज', t: 'त', d: 'द',
        n: 'न', p: 'प', b: 'ब', m: 'म', y: 'य', r: 'र', l: 'ल', v: 'व', w: 'व',
        s: 'स', h: 'ह' }[tok.v];
      if (nx && nx.t === 'v') {
        if (nx.v === 'a') {
          const after = toks[j + 2];
          if (!after) {
            /* Explicit final "a" sounds "aa" (Sneha → स्नेहा, Raja → राजा) —
               unless the name closes on a conjunct, where Hindi/Marathi drop
               the schwa (Mahendra → महेंद्र). */
            const prev = out[out.length - 1];
            if (prev === '्' || prev === 'ं') { out += base; j++; continue; }
            out += base + 'ा'; j++; continue;
          }
          out += base; j++; continue;                          // inherent schwa
        }
        out += base + V_MATRA[nx.v]; j++; continue;
      }
      if (nx && nx.t === 'c') {
        /* A nasal before a consonant is written as anusvara in ordinary
           Hindi/Marathi (Sanjay → संजय, Chandra → चंद्र). */
        out += (tok.v === 'n' || tok.v === 'm') ? 'ं' : base + '्';
        continue;
      }
      out += base;                                               // word-final: no halant; schwa deletion reads it bare
    }
    return out;
  }
  function toDevanagari(latin) {
    return String(latin || '').trim().split(/\s+/).map(word => {
      const lower = word.toLowerCase().replace(/[.,!?;:]+$/, '');
      if (NAME_DEV[lower]) return NAME_DEV[lower];
      const toks = tokenizeWord(lower);
      if (!toks || !toks.length) return word;
      return buildWord(toks);
    }).join(' ');
  }

  /* A name meets the voice in the voice's own script. */
  function nameInScript(rawName, lang) {
    const name = String(rawName || '');
    if (!name) return '';
    if (lang === 'en') return DEVANAGARI.test(name) ? (toLatin(name) || name) : name;
    return DEVANAGARI.test(name) ? name : (toDevanagari(name) || name);
  }

  function isOrganisation(rawName) {
    const toks = tokensOf(rawName);
    return toks.length > 0 && toks.some(t => COMPANY_TOKENS.has(t));
  }

  function composeGreeting(lang, s) {
    const company = String((s && s.companyName) || '').trim();
    /* "Say the name as" is the dealer's phonetic spelling: whatever is typed
       there is the name, verbatim; empty falls back to the detected first
       name. Script matching hands each voice a name it can actually read;
       organisations keep their typed name and never get a title. */
    const spoken = String((s && s.custSpokenName) || '').trim();
    const fullName = spoken || String((s && s.custName) || '').trim();
    const org = isOrganisation(fullName);
    const source = org ? fullName : (spoken || displayName(s && s.custName));
    const name = !source ? '' : org ? source : nameInScript(source, lang);
    const mode = honorMode(source, s && s.custSalutation);
    /* "Custom" is the dealer's own address, spoken verbatim (script-matched
       so every voice can read it); blank falls back to the safe neutral. */
    const customHonor = mode === 'custom'
      ? (nameInScript(String((s && s.custSalutationCustom) || '').trim(), lang) || HONORS[lang].neutral)
      : HONORS[lang][mode];
    const honor = name && mode !== 'none' && !org ? customHonor : '';
    if (lang === 'hi') {
      const lead = name ? 'नमस्कार ' + name + (honor ? ' ' + honor : '') + '।' : 'नमस्कार।';
      return lead + ' ' + (company
        ? company + ' की ओर से आपके रूफटॉप सौर ऊर्जा प्रस्ताव का यह संक्षिप्त परिचय है।'
        : 'आपके रूफटॉप सौर ऊर्जा प्रस्ताव का यह संक्षिप्त परिचय है।');
    }
    if (lang === 'mr') {
      const lead = name ? 'नमस्कार ' + name + (honor ? ' ' + honor : '') + '.' : 'नमस्कार.';
      return lead + ' ' + (company
        ? company + ' तर्फे आपल्या रूफटॉप सौर ऊर्जा प्रस्तावाचा हा संक्षिप्त आढावा आहे.'
        : 'आपल्या रूफटॉप सौर ऊर्जा प्रस्तावाचा हा संक्षिप्त आढावा आहे.');
    }
    const lead = name ? 'Welcome, ' + name + (honor ? ' ' + honor : '') + ',' : 'Welcome';
    return lead + ' to your rooftop solar proposal' + (company ? ' from ' + company : '') + '.';
  }

  /* Every briefing ends with thanks, in the language it was spoken. */
  function composeClosing(lang) {
    if (lang === 'hi') return 'आपके समय के लिए धन्यवाद।';
    if (lang === 'mr') return 'आपल्या वेळेसाठी धन्यवाद.';
    return 'Thank you for your time.';
  }

  root.Salutation = { displayName, detectGender, honorMode, isOrganisation,
    toLatin, toDevanagari, nameInScript, composeGreeting, composeClosing };
})(typeof self !== 'undefined' ? self : this);

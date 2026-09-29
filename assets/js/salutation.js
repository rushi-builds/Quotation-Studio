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
     'none' means the dealer wants the name spoken bare, no honourific. */
  const MODES = ['male', 'female', 'neutral', 'none'];
  function honorMode(rawName, override) {
    if (MODES.includes(override)) return override;
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

  function composeGreeting(lang, s) {
    const company = String((s && s.companyName) || '').trim();
    const name = displayName(s && s.custName);
    const mode = honorMode(s && s.custName, s && s.custSalutation);
    const honor = name && mode !== 'none' ? HONORS[lang][mode] : '';
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

  root.Salutation = { displayName, detectGender, honorMode, composeGreeting, composeClosing };
})(typeof self !== 'undefined' ? self : this);

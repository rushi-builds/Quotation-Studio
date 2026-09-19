/* ==========================================================================
   Quotation Studio — Content Data
   --------------------------------------------------------------------------
   All editable brochure text lives here. The app renders every page from
   this object, and the "Advanced Edit" panel writes back into it.

   This file is DATA ONLY — no logic. Template placeholders (replaced at
   render time by finance.js / render.js):
     {capacity}    e.g. "7 kWp"         {annualGen}  e.g. "10,220 kWh"
     {co2Annual}   e.g. "8.1"           {treesAnnual} e.g. "138"
     {company}     company name from the Branding section
   ========================================================================== */
'use strict';

const CONTENT = {

  /* Elements shared across pages (edited once, applied everywhere) */
  shared: {
    footerTagline: 'Engineering Excellence • Premium Quality • Trusted Performance',
    warrantyLine: '25-Year Module Performance Warranty'
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 2 — Executive Proposal Summary                                 */
  /* ------------------------------------------------------------------ */
  exec: {
    eyebrow: 'PROPOSAL SUMMARY',
    heading: 'Your Solar Proposal at a Glance',
    sub: 'Everything you need to know about your rooftop solar investment — on one page.',
    heroLabels: {
      netInvestment: 'Your Net Investment',
      year1Saving: 'Saving in Year 1',
      payback: 'Payback Period',
      lifetime: 'Savings over 25 Years'
    },
    kpiSectionLabel: 'YOUR SYSTEM BY THE NUMBERS',
    kpis: {
      capacity: 'System Capacity',
      annualGen: 'Year-1 Generation',
      modules: 'Solar Modules',
      arrayArea: 'Module Area',
      irr: 'Estimated IRR',
      billOffset: 'Bill Offset',
      co2: 'CO₂ Offset / Year',
      effective: 'Effective Solar Cost'
    },
    journeySectionLabel: 'YOUR INVESTMENT JOURNEY',
    journeyNote: 'Cumulative savings are projected from your generation, tariff and escalation inputs and cross your net investment in year {payback}.',
    includedSectionLabel: 'WHAT YOU ARE GETTING',
    includedIntro: 'A complete turnkey rooftop solar system — engineered, supplied, installed and commissioned by {company}:',
    effectiveHint: 'Net investment ÷ 25-year generation — compare with your grid tariff of ₹{tariff}/unit.'
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 3 — About the company                                          */
  /* ------------------------------------------------------------------ */
  pageAbout: {
    eyebrow: 'ABOUT {companyCaps}',
    heading1: 'Engineering Excellence.',
    heading2: 'Powering Homes. Building Trust.',
    para1: 'KTM Energy Experts Pvt. Ltd. is a leading solar EPC company based in Pune, specialising in premium rooftop solar solutions for residential, commercial and industrial customers.',
    para2: 'With 11+ years of engineering excellence and 200+ executed projects, we deliver complete turnkey solutions — from design and engineering to installation, commissioning and after-sales support.',
    para3: 'Every project is engineered for maximum performance and long-term reliability, ensuring customers receive the highest value from their solar investment.',
    sectionLabel: 'WHY CUSTOMERS CHOOSE KTM',
    stats: [
      { icon: 'award',    value: '11+ Years',  title: 'Engineering Excellence', desc: 'Delivering reliable solar solutions since 2015' },
      { icon: 'sun',      value: '200+ Projects', title: 'Solar Projects Executed', desc: 'Across residential, commercial and industrial sectors.' },
      { icon: 'bolt',     value: '20+ MW',     title: 'Installed Projects', desc: 'Powering businesses and homes across India' },
      { icon: 'gear',     value: 'In-House',   title: 'Engineering & Structure Manufacturing', desc: 'Design, fabrication and installation under one roof.' }
    ],
    features: [
      { icon: 'drone',   title: 'Drone Survey', desc: 'Precision site mapping' },
      { icon: 'chart',   title: 'PVsyst Simulation', desc: 'Yield optimised design' },
      { icon: 'spark',   title: 'Innovative Projects', desc: 'Solar carport, solar trees, solar leakproof roof' },
      { icon: 'panel',   title: 'Tier-1 Components', desc: 'Global-grade equipment' },
      { icon: 'shield',  title: 'After-Sales Support', desc: 'Dedicated lifetime care' },
      { icon: 'badge',   title: 'ISO Certified Company', desc: 'ISO 9001, ISO 14001, ISO 45001' }
    ]
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 4 — Why Rooftop Solar                                          */
  /* ------------------------------------------------------------------ */
  pageWhySolar: {
    heading: 'Why Rooftop Solar?',
    sub: 'One Smart Decision. 25+ Years of Savings.',
    para: 'Rooftop solar is more than an environmentally responsible choice — it is a long-term financial investment that reduces electricity expenses, protects against rising energy costs and increases the value of your property. With government incentives and a system life exceeding 25 years, there has never been a better time to invest in solar.',
    benefits: [
      { icon: 'rupee',  title: 'Save on Electricity Bills', desc: 'Eliminate up to 90% of your monthly electricity bill from day one of commissioning.' },
      { icon: 'shield', title: 'Protection Against Rising Tariffs', desc: 'Grid tariffs rise 5–8% annually. Solar locks your energy cost at near-zero for 25+ years.' },
      { icon: 'home',   title: 'Increase Property Value', desc: 'Solar-equipped properties command a measurable premium in resale and rental valuation.' },
      { icon: 'leaf',   title: 'Reduce Carbon Footprint', desc: 'A {capacity} system offsets approximately {co2Annual} tonnes of CO₂ annually — equivalent to planting {treesAnnual}+ trees.' },
      { icon: 'phone',  title: 'Smart Mobile Monitoring', desc: 'Real-time generation data, alerts and performance analytics — right on your smartphone.' },
      { icon: 'doc',    title: 'Government Subsidy & Net Metering', desc: 'Avail PM Surya Ghar subsidies and earn credits by exporting surplus power to the grid.' }
    ],
    highlight: 'A professionally designed {capacity} rooftop solar system can generate approximately {annualGen} units annually and deliver reliable clean energy for more than 25 years.'
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 5 — Proposed Solution                                          */
  /* ------------------------------------------------------------------ */
  pageSolution: {
    heading: 'Your Proposed Solar Power Solution',
    sub: 'Designed Specifically for Your Property',
    para: 'Every KTM solar installation begins with a precision site assessment and PVsyst energy simulation — ensuring your system is engineered for maximum yield, not just installed for minimum cost. The following specifications have been tailored to your roof geometry, orientation and local solar radiation data.',
    /* First spec cards (capacity, generation, modules) are generated automatically */
    specs: [
      { title: 'Inverter', desc: 'High-efficiency hybrid/string inverter with real-time Wi-Fi monitoring' },
      { title: 'Module Mounting Structure', desc: 'Hot-dip galvanized steel or aluminium — engineered for monsoon wind loads' },
      { title: 'Balance of System', desc: 'DC/AC protection, earthing and lightning arrestor included' },
      { title: 'Net Metering & Government Subsidy', desc: 'DISCOM-approved, end-to-end liaisoning included' },
      { title: 'Warranty', desc: '25 years module performance warranty' }
    ],
    includedLabel: "WHAT'S INCLUDED",
    /* mode:* descriptions follow the System Specification dropdowns in the form */
    included: [
      { icon: 'panel',  title: 'Premium Solar Modules', mode: 'module' },
      { icon: 'bolt',   title: 'Smart Inverter', mode: 'inverter' },
      { icon: 'gear',   title: 'Durable Mounting Structure', mode: 'mount' },
      { icon: 'cable',  title: 'Cables & Protection', mode: 'cable' },
      { icon: 'wrench', title: 'Professional Installation', desc: 'Certified engineers, leakproof roof penetration and clean cable management.' },
      { icon: 'phone',  title: 'Monitoring & Support', desc: 'Wi-Fi generation monitoring with dedicated after-sales support.' }
    ]
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 6 — Technical System Specification                             */
  /* ------------------------------------------------------------------ */
  pageTechSpec: {
    heading: 'Technical System Specification',
    sub: 'The Components Behind Your Generation',
    para: 'Every component in your system is specified below — selected for compatibility, certified performance and long-term reliability. This is the exact equipment basis on which your generation estimate and quotation are built.',
    diagramTitle: 'SYSTEM OVERVIEW',
    diagramLabels: {
      array: 'Solar Array',
      dc: 'DC',
      inverter: 'Inverter',
      ac: 'AC',
      meter: 'Bi-Directional Meter',
      grid: 'DISCOM Grid',
      home: 'Your Property',
      arrayValue: '{moduleCount} × {moduleWattage} Wp modules',
      inverterValue: '{inverterRating}',
      note: 'Surplus generation is exported to the grid and credited via net metering.'
    },
    groupsLabel: 'DETAILED SPECIFICATION',
    noteLabel: 'NOTE',
    note: 'Exact module and inverter models are confirmed at order confirmation. Substitutions, if any, are made only with equal or better certified products and communicated in writing.'
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 7 — EPC Scope                                                  */
  /* ------------------------------------------------------------------ */
  pageScope: {
    heading: "What's Included in Your Solar Solution",
    sub: 'Complete Turnkey EPC Scope',
    para: 'Every KTM Energy Experts installation is a fully managed, end-to-end EPC engagement. The following scope covers everything required to deliver a safe, certified and high-performing rooftop solar system.',
    delivLabel: 'OUR TURNKEY EPC DELIVERABLES',
    deliverables: [
      { title: 'Supply of Solar Modules, Inverter, Module Mounting Structure & Balance of System (BOS)' },
      { title: 'Design, Engineering & Installation' },
      { title: 'Electrical Works, Earthing & Lightning Protection' },
      { title: 'Testing & Commissioning' },
      { title: 'Net Metering Arrangement & Subsidy Procedure' },
      { title: 'System Handover & Customer Training' }
    ],
    respLabel: 'CLIENT RESPONSIBILITIES',
    resp: [
      { icon: 'key',   title: 'Roof Access', desc: 'Safe and unobstructed rooftop access throughout the installation period.' },
      { icon: 'bolt',  title: 'Utilities at Site', desc: 'Water and electricity to be made available during installation.' },
      { icon: 'home',  title: 'Structural Adequacy', desc: 'Roof and building structure must be capable of bearing the system load.' },
      { icon: 'wifi',  title: 'Internet Service', desc: 'Internet service for remote monitoring of the system.' }
    ],
    addlLabel: 'ADDITIONAL SCOPE (IF REQUIRED)',
    addl: [
      { title: 'Civil Works', desc: 'Any civil or structural modifications beyond the agreed scope.' },
      { title: 'Load Enhancement', desc: 'DISCOM load enhancement charges, if applicable.' },
      { title: 'Electrical Modifications', desc: 'Additional internal electrical works beyond the agreed scope.' },
      { title: 'DISCOM Statutory Charges', desc: 'Statutory deposits, inspection fees and other DISCOM levies payable by the client.' }
    ],
    closing: 'Our integrated engineering, structure manufacturing and project execution capabilities ensure superior quality control, faster delivery and long-term system reliability.'
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 8 — Installation Quality                                       */
  /* ------------------------------------------------------------------ */
  pageQuality: {
    heading: 'Installation Quality',
    sub: 'Precision in Every Connection.',
    para: 'A solar system is only as good as the hands that install it. Every KTM installation follows a documented engineering standard — trained certified crews, torque-specified fastening, protected roof penetrations and dressing-level electrical work — so your system performs safely, day after day, for decades.',
    standardsLabel: 'THE KTM INSTALLATION STANDARD',
    standards: [
      { icon: 'gear',   title: 'Engineered Mounting', desc: 'Structures designed by in-house engineers and torqued to specification — built to withstand decades of monsoon wind loads.' },
      { icon: 'shield', title: 'Roof Protection', desc: 'Leakproof roof penetrations with sealed anchors and elevated structure design — your roof stays watertight.' },
      { icon: 'cable',  title: 'Neat Electrical Work', desc: 'Dressed cable trays, labelled connections and organised DC/AC routing — clean enough to inspect anytime.' },
      { icon: 'badge',  title: 'Safety First', desc: 'Certified crews with harnesses, helmets and PPE on every site — zero-compromise safety culture.' }
    ],
    checklistLabel: 'BEFORE WE HAND OVER',
    checklist: [
      { title: 'Torque Audit', desc: 'Every module clamp and structural bolt torque-checked against spec.' },
      { title: 'Earthing Test', desc: 'Earthing continuity and lightning protection resistance verified.' },
      { title: 'String Testing', desc: 'Open-circuit voltage and current of every string measured and logged.' },
      { title: 'Leak Check', desc: 'All roof penetrations water-tested — zero-leak confirmation.' },
      { title: 'Inverter Setup', desc: 'Grid settings, Wi-Fi monitoring and safety parameters configured.' },
      { title: 'Client Walkthrough', desc: 'System orientation, app monitoring and maintenance guidance demonstrated.' }
    ],
    promise: 'The KTM Workmanship Promise: every installation is covered by a 1-year workmanship warranty and a dedicated after-sales team — if anything is not right, we come back and make it right. No exceptions.'
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 9 — Generation & Savings Analysis (charts)                     */
  /* ------------------------------------------------------------------ */
  pageSavings: {
    heading: 'Generation & Savings Analysis',
    sub: 'Projected From Your Actual Inputs',
    para: 'The projections below are modelled from the generation estimate, tariff and escalation assumptions stated for this proposal — with panel degradation applied year on year. They show exactly when your system pays for itself and what it earns beyond that.',
    chips: {
      annualGen: 'Year-1 Generation',
      annualSaving: 'Saving in Year 1',
      year25Saving: 'Saving in Year 25',
      effective: 'Effective Solar Cost'
    },
    chartCumTitle: 'CUMULATIVE SAVINGS VS NET INVESTMENT',
    chartCumNote: 'Savings cross your net investment in year {payback} — every rupee beyond that point is return.',
    chartAnnualTitle: 'PROJECTED ANNUAL SAVINGS (25 YEARS)',
    chartAnnualNote: 'Annual savings grow with the assumed tariff escalation of {escalation}%/yr, partially offset by panel degradation of {degradation}%/yr.',
    tableTitle: 'MILESTONE PROJECTION',
    tableHeaders: { year: 'After Year', cumSaving: 'Cumulative Savings', netPosition: 'Net Position', roi: 'Return on Investment' },
    assumptionsLabel: 'ASSUMPTIONS USED IN THIS PROJECTION',
    note: 'Projections are engineering estimates. Actual generation depends on site conditions, shading and weather; actual savings depend on DISCOM tariffs and your consumption pattern.'
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 10 — Investment & Cost Breakdown                               */
  /* ------------------------------------------------------------------ */
  pageInvestment: {
    heading: 'Investment & Cost Breakdown',
    sub: 'Transparent Pricing. Outstanding Long-Term Returns.',
    desc: 'A professionally engineered {capacity} rooftop solar system is one of the highest-returning investments available to a property owner today — delivering guaranteed energy savings, government subsidies and inflation-proof returns for over 25 years.',
    cards: {
      projectCost: 'Project Cost',
      gstLine: 'GST',
      subsidy: 'Government Subsidy',
      subsidyCaptionAuto: 'PM Surya Ghar — auto-calculated',
      subsidyCaptionOverride: 'As per proposal',
      subsidyCaptionNA: 'Not applicable for this connection type',
      totalCost: 'Total Project Cost',
      totalCostCaption: 'Including GST',
      netInvestment: 'Net Investment',
      netInvestmentCaption: 'Payable after subsidy'
    },
    rateChip: 'Effective Rate',
    bridgeTitle: 'COST BUILD-UP',
    bomTitle: 'COST COMPOSITION',
    bomIntro: 'Indicative composition of the project cost (before GST), as entered for this proposal:',
    paymentLabel: 'PAYMENT SCHEDULE',
    paymentNote: 'Milestones as per agreement. Amounts shown against the total project cost including GST.',
    disclaimer: 'Figures above are engineering estimates based on the generation, tariff and subsidy assumptions entered for this proposal. Actual generation, savings, payback and returns depend on site conditions, shading, sanctioned load, DISCOM tariff and government policy applicable at the time of installation. Government subsidy shown per PM Surya Ghar Yojana slabs prevailing at proposal date — subject to change.'
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 11 — Why Choose KTM                                            */
  /* ------------------------------------------------------------------ */
  pageWhyKtm: {
    heading: 'Why Choose KTM Energy Experts?',
    sub: 'Engineering Excellence You Can Trust.',
    para: 'With over a decade of hands-on solar EPC experience, KTM Energy Experts brings a rare combination of in-house engineering capability, Tier-1 components and a customer-first philosophy to every project.',
    diffLabel: 'OUR DIFFERENTIATORS',
    differentiators: [
      { icon: 'badge',  title: '11+ Years of Engineering Excellence', desc: 'Over a decade of delivering certified, high-performance solar EPC projects across India.' },
      { icon: 'check',  title: '200+ Projects Successfully Executed', desc: 'A proven track record across residential, commercial and industrial installations.' },
      { icon: 'bolt',   title: '20+ MW Installed Capacity', desc: 'One of the most experienced rooftop solar EPC teams in the region.' },
      { icon: 'gear',   title: 'In-House Structure Manufacturing', desc: 'Precision-engineered HDGI mounting structures, designed and manufactured in-house.' },
      { icon: 'drone',  title: 'Drone Site Survey', desc: 'Precision aerial mapping for accurate shadow analysis, roof measurement and layout planning.' },
      { icon: 'chart',  title: 'PVsyst Energy Simulation', desc: 'Every system is yield-optimised using PVsyst software before a single panel is installed.' },
      { icon: 'shield', title: 'Quality & Safety First', desc: 'IS/IEC-compliant installations with rigorous internal quality audits at every stage.' },
      { icon: 'wrench', title: 'End-to-End EPC & After-Sales Support', desc: 'From design to commissioning to long-term AMC — we are with you for the life of the system.' },
      { icon: 'star',   title: '4.8-Star Rated on Google', desc: '400+ verified customer reviews across Maharashtra.' }
    ],
    commitLabel: 'Five Commitments. Every Project. No Exceptions.',
    commitments: [
      { icon: 'rupee',  title: 'Transparent Pricing', desc: 'No hidden costs. Fixed price.' },
      { icon: 'panel',  title: 'Premium Components', desc: 'Tier-1 modules, inverters and BOS from globally certified manufacturers.' },
      { icon: 'wrench', title: 'Professional Installation', desc: 'Certified engineers, clean workmanship and leakproof roof penetrations.' },
      { icon: 'clock',  title: 'On-Time Delivery', desc: 'Structured project timelines with daily progress updates and zero delays.' },
      { icon: 'shield', title: 'Long-Term Support', desc: 'Dedicated after-sale team, remote monitoring and priority AMC response.' }
    ]
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 12 — Projects Portfolio                                        */
  /* ------------------------------------------------------------------ */
  pageProjects: {
    heading: 'Projects That Speak for Themselves',
    sub: 'Over 200 Successful Solar Installations Across Residential, Commercial & Industrial Sectors',
    categories: [
      {
        label: 'INDUSTRIAL ROOFTOP PROJECTS',
        projects: [
          { name: 'Agarwal Technoplast Pvt. Ltd.', location: 'Pune, Maharashtra', capacity: '1,700 kWp', img: 'PROJ_1_1' },
          { name: 'Serum Institute of India', location: 'Pune, Maharashtra', capacity: '700 kWp', img: 'PROJ_1_2' },
          { name: 'GRP Limited', location: 'Solapur, Maharashtra', capacity: '1,000 kWp', img: 'PROJ_1_3' }
        ]
      },
      {
        label: 'COMMERCIAL & SPECIAL PROJECTS',
        projects: [
          { name: 'ReachGlobal India Pvt. Ltd.', location: 'Pune, Maharashtra', capacity: '350 kWp', img: 'PROJ_2_1' },
          { name: 'City Pride Multiplex', location: 'Ratnagiri, Maharashtra', capacity: '500 kWp', img: 'PROJ_2_2' },
          { name: 'PAR Formulations Pvt. Ltd.', location: 'Indore, Madhya Pradesh', capacity: '250 kWp', img: 'PROJ_2_3' }
        ]
      },
      {
        label: 'RESIDENTIAL & SPECIALTY PROJECTS',
        projects: [
          { name: 'Bramha Emerald County', location: 'Pune, Maharashtra', capacity: '160 kWp', img: 'PROJ_3_1' },
          { name: 'Prorigo Softwares Pvt. Ltd.', location: 'Pune, Maharashtra', capacity: '120 kWp', img: 'PROJ_3_2' },
          { name: 'Nerolac Paints', location: 'Bawal, Haryana', capacity: '65 kWp', img: 'PROJ_3_3' }
        ]
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 13 — Warranty & Installation Journey                           */
  /* ------------------------------------------------------------------ */
  pageWarranty: {
    heading: 'Warranty & Installation Journey',
    sub: 'Quality Assured. Professionally Delivered.',
    warrLabel: 'INDUSTRY-LEADING WARRANTY',
    warranties: [
      { icon: 'panel',  title: 'Solar Modules', b1: '25-Year Linear Performance Warranty', b2: '10-Year Product Warranty' },
      { icon: 'bolt',   title: 'Hybrid/String Inverter', b1: '5-Year Standard Warranty', b2: 'Extendable to 10 Years' },
      { icon: 'gear',   title: 'Mounting Structure', b1: '10-Year Structural Warranty', b2: 'Hot-dip galvanized GI' },
      { icon: 'shield', title: 'Installation Workmanship', b1: '1-Year KTM Workmanship Warranty', b2: 'Certified installation' }
    ],
    journeyLabel: 'YOUR INSTALLATION JOURNEY',
    steps: [
      { title: 'Order Confirmation', b1: 'Agreement signed', b2: 'Advance payment received', b3: 'Project kickoff initiated' },
      { title: 'Engineering', b1: 'DISCOM application filed', b2: 'Site survey completed', b3: 'Structural drawings finalised' },
      { title: 'Material Delivery', b1: 'Tier-1 modules delivered', b2: 'Inverter and BOS received', b3: 'Site inspection completed' },
      { title: 'Installation', b1: 'Structure erection', b2: 'Module mounting', b3: 'Cable routing and electrical works' },
      { title: 'Testing & Commissioning', b1: 'Insulation and grid sync check', b2: 'Performance verification', b3: '' },
      { title: 'Net Metering & Handover', b1: 'Bidirectional meter installed', b2: 'System handed over to client', b3: '' }
    ],
    closing: 'Every KTM rooftop solar system is engineered, installed and commissioned in accordance with industry best practices to ensure long-term safety, reliability and optimum performance.'
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 14 — Terms & Conditions                                        */
  /* ------------------------------------------------------------------ */
  pageTerms: {
    heading: 'Terms & Conditions',
    sub: 'Clear. Fair. In Writing.',
    intro: 'The following terms apply to this proposal. Anything specific to your project agreed separately will always be confirmed in writing and takes precedence.',
    itemsLabel: 'TERMS OF THIS PROPOSAL',
    /* {validity} {duration} {jurisdiction} {company} are filled from the form */
    items: [
      { title: 'Scope of Supply', desc: 'Supply, installation and commissioning of the rooftop solar system as described in the System Specification and EPC Scope sections of this proposal.' },
      { title: 'Price Basis', desc: 'Pricing is as per the Investment & Cost Breakdown section and excludes items listed under "Additional Scope", which are quoted separately if required.' },
      { title: 'Proposal Validity', desc: 'This proposal and its pricing are valid for {validity} from the proposal date.' },
      { title: 'Payment Schedule', desc: 'Payments follow the schedule stated in the Investment section. Material remains the property of {company} until full payment is realised.' },
      { title: 'Delivery & Commissioning', desc: '{duration} Timelines begin on receipt of advance payment and are indicative of DISCOM liaisoning durations.' },
      { title: 'Government Subsidy', desc: 'Subsidy is governed by PM Surya Ghar / MNRE guidelines applicable at the time of installation. Eligibility, amounts and disbursal timelines are determined by the government and DISCOM and are beyond company control.' },
      { title: 'Net Metering', desc: 'DISCOM application, feasibility approval and bidirectional meter installation are subject to DISCOM processes, timelines and prevailing regulations.' },
      { title: 'Warranties', desc: 'Equipment warranties are provided by the respective OEMs and pass through to the customer. Workmanship warranty is provided by {company} as stated in the Warranty section.' },
      { title: 'Exclusions', desc: 'Civil or structural works beyond the agreed scope, load enhancement, additional internal electrical works and DISCOM statutory deposits or fees are excluded unless expressly included.' },
      { title: 'Taxes & Statutory Charges', desc: 'GST is charged as stated. Any revision in tax rates or statutory levies after the proposal date shall be adjusted at actuals.' },
      { title: 'Force Majeure', desc: 'Neither party is liable for delays caused by events beyond reasonable control, including natural events, government actions or supply-chain disruptions.' },
      { title: 'Jurisdiction', desc: 'This proposal is subject to the jurisdiction of courts at {jurisdiction}.' }
    ],
    noteLabel: 'IMPORTANT NOTE',
    note: 'This document is a commercial proposal, not a tax or legal advice. Please read all sections of this proposal together — the technical, financial and warranty sections form part of these terms.'
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 15 — Acceptance, Next Steps & Contact                          */
  /* ------------------------------------------------------------------ */
  pageClosing: {
    bannerHeading: "Let's Build a Greener Future Together",
    bannerSub: 'Your Journey Towards Clean & Affordable Energy Starts Here.',
    nextLabel: 'YOUR NEXT STEPS',
    next: [
      { icon: 'doc',    title: '1. Accept This Proposal', desc: 'Sign below, or reply to us by email or WhatsApp — we take it from there.' },
      { icon: 'drone',  title: '2. Detailed Survey & Engineering', desc: '{surveyWindow} drone survey, shadow analysis and final engineering after acceptance.' },
      { icon: 'sun',    title: '3. Installation to Handover', desc: 'Material delivery, professional installation, DISCOM net metering and full handover — as per the Installation Journey.' }
    ],
    readyLabel: 'WHY ACT NOW',
    ready: [
      { icon: 'rupee',  title: 'Every Month Delayed Costs Money', desc: 'At the projected saving of {monthlySaving}/month, delay has a real price.' },
      { icon: 'doc',    title: 'Subsidy & Net-Metering Support', desc: 'We handle the complete PM Surya Ghar and DISCOM paperwork for you.' },
      { icon: 'calendar', title: 'Limited Installation Slots', desc: 'Crews are scheduled in order of confirmation — early sign-up secures your slot.' }
    ],
    cta: 'Call us today for a free site survey:',
    acceptLabel: 'ACCEPTANCE & AUTHORISATION',
    acceptIntro: 'Signing below indicates acceptance of this proposal and authorises {company} to proceed with the survey, engineering and installation on the terms stated herein.',
    signCustomer: 'Accepted by (Customer)',
    signCustomerSub: 'Name, Signature & Date',
    signCompany: 'For {company}',
    signCompanySub: 'Authorised Signatory & Date',
    para: 'Thank you for considering {company} for your rooftop solar project. We are committed to delivering a safe, high-performing and beautifully installed solar system that serves you reliably for 25+ years.',
    disclaimer: 'This proposal is confidential and intended solely for the recipient. All technical specifications, pricing and commercial terms are valid for the stated proposal validity period unless revised in writing by {company}.'
  },

  /* ------------------------------------------------------------------ */
  /* PAGE 3 — System Options (optional Good/Better/Best comparison)      */
  /* ------------------------------------------------------------------ */
  pageOptions: {
    heading: 'Choose Your System',
    sub: 'Three Ways to Go Solar. Same Engineering. Your Choice.',
    intro: 'Based on your roof and energy goals, we have prepared three system options. All of them use the same Tier-1 equipment and the same installation standard \u2014 the difference is capacity and investment. The detailed engineering pages of this proposal reflect the design marked \u201cIN THIS PROPOSAL\u201d.',
    chips: {
      invest: 'Net Investment',
      annual: 'Year-1 Saving',
      monthly: 'Saving / Month',
      payback: 'Payback',
      lifetime: '25-Yr Savings',
      gen: 'Units / Year',
      modules: 'Modules',
      recommended: 'RECOMMENDED',
      match: 'IN THIS PROPOSAL',
      notSet: 'Option not configured'
    },
    metricsLabel: 'SIDE-BY-SIDE COMPARISON',
    chartTitle: 'INVESTMENT VS 25-YEAR SAVINGS',
    note: 'All options use the same generation assumption ({genFactor} kWh/kWp/yr), tariff (\u20b9{tariff}/unit) and subsidy eligibility. Every amount is computed live from the assumptions stated for this proposal.'
  },

  /* Cover footer stats (page 1) */
  cover: {
    eyebrowByType: {
      residential: 'RESIDENTIAL SOLAR PROPOSAL',
      commercial: 'COMMERCIAL SOLAR PROPOSAL',
      industrial: 'INDUSTRIAL SOLAR PROPOSAL'
    },
    titleLine1: 'Rooftop Solar',
    titleLine2: 'Power Proposal',
    footerStat4: 'Pioneer in Net Metering — Maharashtra\u2019s First Net Metering Project',
    labels: {
      preparedFor: 'Prepared For',
      capacity: 'Project Capacity',
      date: 'Proposal Date',
      validTill: 'Valid Until',
      reference: 'Proposal Reference',
      preparedBy: 'Prepared By',
      version: 'Version'
    }
  }
};

/* --------------------------------------------------------------------------
   Portfolio thumbnails. Swap any file — or replace per project via
   Advanced Edit → Projects → each project block.
   -------------------------------------------------------------------------- */
const PROJECT_IMAGES = {
  PROJ_1_1: 'assets/images/site-agarwal.jpg',
  PROJ_1_2: 'assets/images/site-serum.jpg',
  PROJ_1_3: 'assets/images/site-grp.jpg',
  PROJ_2_1: 'assets/images/site-reachglobal.jpg',
  PROJ_2_2: 'assets/images/site-citypride.jpg',
  PROJ_2_3: 'assets/images/site-par.jpg',
  PROJ_3_1: 'assets/images/site-bramha.jpg',
  PROJ_3_2: 'assets/images/site-prorigo.jpg',
  PROJ_3_3: 'assets/images/site-nerolac.jpg'
};

/* Export for Node-based tests (ignored in the browser) */
if (typeof module !== 'undefined' && module.exports) { module.exports = { CONTENT, PROJECT_IMAGES }; }

/* ==========================================================================
   Quotation Studio — Content Data
   --------------------------------------------------------------------------
   All editable brochure text lives here. The app renders every page from this
   object, and the "Advanced Edit" panel writes back into it.

   Template placeholders (replaced at render time):
     {capacity}    e.g. "7 kWp"          {annualGen}  e.g. "10,220 kWh"
     {co2Annual}   e.g. "8.1"            {treesAnnual} e.g. "138"
     {company}     company name from the Branding section
   ========================================================================== */
'use strict';

const CONTENT = {
  /* Elements shared across pages (edited once, applied everywhere) */
  shared: {
    footerTagline: 'Engineering Excellence &nbsp;•&nbsp; Premium Quality &nbsp;•&nbsp; Trusted Performance'
  },

  page1: {
    eyebrow: 'ABOUT KTM ENERGY EXPERTS',
    heading1: 'Engineering Excellence.',
    heading2: 'Powering Homes. Building Trust.',
    para1: 'KTM Energy Experts Pvt. Ltd. is a leading solar EPC company based in Pune, specialising in premium rooftop solar solutions for residential, commercial and industrial customers.',
    para2: 'With 11+ years of engineering excellence and 200+ executed projects, we deliver complete turnkey solutions — from design and engineering to installation, commissioning and after-sales support.',
    para3: 'Every project is engineered for maximum performance and long-term reliability, ensuring customers receive the highest value from their solar investment.',
    sectionLabel: 'WHY CUSTOMERS CHOOSE KTM',
    stats: [
      { icon: '&#127942;', value: '11+ Years', title: 'Engineering Excellence', desc: 'Delivering reliable solar solutions since 2015' },
      { icon: '&#9728;', value: '200+ Projects', title: 'Solar Projects Executed', desc: 'Across residential, commercial and industrial sectors.' },
      { icon: '&#9889;', value: '20+ MW', title: 'Installed Projects', desc: 'Powering businesses and homes across India' },
      { icon: '&#9881;', value: 'In-House', title: 'Engineering & Structure Manufacturing', desc: 'Design, fabrication and installation under one roof.' }
    ],
    features: [
      { title: 'Drone Survey', desc: 'Precision site mapping' },
      { title: 'PVsyst Simulation', desc: 'Yield optimised design' },
      { title: 'Innovative Projects', desc: 'Solar carport, solar trees, solar leakproof roof' },
      { title: 'Tier-1 Components', desc: 'Global-grade equipment' },
      { title: 'After-Sales Support', desc: 'Dedicated lifetime care' },
      { title: 'ISO Certified Company', desc: 'ISO 9001, ISO 14001, ISO 45001' }
    ]
  },

  page3: {
    heading: 'Why Rooftop Solar?',
    sub: 'One Smart Decision. 25+ Years of Savings.',
    para: 'Rooftop solar is more than an environmentally responsible choice — it is a long-term financial investment that reduces electricity expenses, protects against rising energy costs and increases the value of your home. With government incentives and a system life exceeding 25 years, there has never been a better time to invest in solar.',
    benefits: [
      { title: 'Save on Electricity Bills', desc: 'Eliminate up to 90% of your monthly electricity bill from day one of commissioning.' },
      { title: 'Protection Against Rising Tariffs', desc: 'Grid tariffs rise 5–8% annually. Solar locks your energy cost at near-zero for 25+ years.' },
      { title: 'Increase Property Value', desc: 'Solar-equipped homes command a measurable premium in resale and rental valuation.' },
      { title: 'Reduce Carbon Footprint', desc: 'A {capacity} system offsets approximately {co2Annual} tonnes of CO₂ annually — equivalent to planting {treesAnnual}+ trees.' },
      { title: 'Smart Mobile Monitoring', desc: 'Real-time generation data, alerts and performance analytics — right on your smartphone.' },
      { title: 'Government Subsidy & Net Metering', desc: 'Avail PM Surya Ghar subsidies and earn credits by exporting surplus power to the grid.' }
    ],
    highlight: 'A professionally designed {capacity} rooftop solar system can generate approximately {annualGen} units annually and deliver reliable clean energy for more than 25 years.'
  },

  page4: {
    heading: 'Your Proposed Solar Power Solution',
    sub: 'Designed Specifically for Your Home',
    para: 'Every KTM solar installation begins with a precision site assessment and PVSyst energy simulation — ensuring your system is engineered for maximum yield, not just installed for minimum cost. The following specifications have been tailored to your roof geometry, orientation and local solar radiation data.',
    /* First two spec cards (capacity & generation) are generated automatically */
    specs: [
      { title: 'Modules', desc: 'Tier-1 Solar Modules' },
      { title: 'Hybrid/String Inverter', desc: 'High-efficiency hybrid/string inverter with real-time monitoring' },
      { title: 'Module Mounting Structure', desc: 'Hot-dip galvanized steel or aluminium' },
      { title: 'Wi-Fi Monitoring App', desc: 'Smart mobile dashboard' },
      { title: 'Net Metering & Government Subsidy', desc: 'DISCOM-approved, included' },
      { title: 'Warranty', desc: '25 years performance warranty' }
    ],
    includedLabel: "WHAT'S INCLUDED",
    /* mode:* descriptions follow the System Specification dropdowns above */
    included: [
      { title: 'Premium Solar Modules', mode: 'module' },
      { title: 'Smart Inverter', mode: 'inverter' },
      { title: 'Durable Mounting Structure', mode: 'mount' },
      { title: 'Cables', mode: 'cable' },
      { title: 'Professional Installation', desc: 'Certified engineers, leakproof roof penetration and clean cable management.' }
    ]
  },

  page5: {
    heading: "What's Included in Your Solar Solution",
    sub: 'Complete Turnkey EPC Scope',
    para: 'Every KTM Energy Experts installation is a fully managed, end-to-end EPC engagement. The following scope covers everything required to deliver a safe, certified and high-performing rooftop solar system at your home.',
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
      { title: 'Roof Access', desc: 'Safe and unobstructed rooftop access throughout the installation period.' },
      { title: 'Utilities at Site', desc: 'Water and electricity to be made available during installation.' },
      { title: 'Structural Adequacy', desc: 'Roof and building structure must be capable of bearing the system load.' },
      { title: 'Internet Service', desc: 'Internet service for remote monitoring of the system.' }
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

  page7: {
    heading: 'Why Choose KTM Energy Experts?',
    sub: 'Engineering Excellence You Can Trust.',
    para: 'With over a decade of hands-on solar EPC experience, KTM Energy Experts brings a rare combination of in-house engineering capability, Tier-1 components and a customer-first philosophy to every project.',
    diffLabel: 'OUR DIFFERENTIATORS',
    differentiators: [
      { title: '11+ Years of Engineering Excellence', desc: 'Over a decade of delivering certified, high-performance solar EPC projects across India.' },
      { title: '200+ Projects Successfully Executed', desc: 'A proven track record across residential, commercial and industrial installations.' },
      { title: '20+ MW Installed Capacity', desc: 'One of the most experienced rooftop solar EPC teams in the region.' },
      { title: 'In-House Structure Manufacturing', desc: 'Precision-engineered HDGI mounting structures, designed and manufactured in-house.' },
      { title: 'Drone Site Survey', desc: 'Precision aerial mapping for accurate shadow analysis, roof measurement and layout planning.' },
      { title: 'PVsyst Energy Simulation', desc: 'Every system is yield-optimised using PVsyst software before a single panel is installed.' },
      { title: 'Quality & Safety First', desc: 'IS/IEC-compliant installations with rigorous internal quality audits at every stage.' },
      { title: 'End-to-End EPC & After-Sales Support', desc: 'From design to commissioning to long-term AMC — we are with you for the life of the system.' }
    ],
    commitLabel: 'Five Commitments. Every Project. No Exceptions.',
    commitments: [
      { title: 'Transparent Pricing', desc: 'No hidden costs. Fixed price.' },
      { title: 'Premium Components', desc: 'Tier-1 modules, inverters and BOS from globally certified manufacturers.' },
      { title: 'Professional Installation', desc: 'Certified engineers, clean workmanship and leakproof roof penetrations.' },
      { title: 'On-Time Delivery', desc: 'Structured project timelines with daily progress updates and zero delays.' },
      { title: 'Long-Term Support', desc: 'Dedicated after-sale team, remote monitoring and priority AMC response.' }
    ]
  },

  page8: {
    heading: 'Warranty & Installation Journey',
    sub: 'Quality Assured. Professionally Delivered.',
    warrLabel: 'INDUSTRY-LEADING WARRANTY',
    warranties: [
      { title: 'Solar Modules', b1: '25-Year Linear Performance Warranty', b2: '10-Year Product Warranty' },
      { title: 'Hybrid/String Inverter', b1: '5-Year Standard Warranty', b2: 'Extendable to 10 Years' },
      { title: 'Mounting Structure', b1: '10-Year Structural Warranty', b2: 'Hot-dip galvanized GI' },
      { title: 'Installation Workmanship', b1: '1-Year KTM Workmanship Warranty', b2: 'Certified installation' }
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

  page9: {
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

  page10: {
    heading: "Let's Build a Greener Future Together",
    sub: 'Your Journey Towards Clean & Affordable Energy Starts Here.',
    para: 'Thank you for considering {company} for your rooftop solar project. We are committed to delivering a safe, high-performing and beautifully installed solar system that serves your home reliably for 25+ years.',
    readyLabel: 'READY TO GO SOLAR?',
    ready: [
      { title: 'Free Site Survey', desc: 'No-obligation drone-assisted roof assessment.' },
      { title: 'Customised System Design', desc: 'PVsyst-optimised layout tailored to your home.' },
      { title: 'Professional Installation', desc: 'Certified engineers. Leakproof. Clean. On-time.' }
    ],
    cta: 'Call us today for a free site survey:',
    disclaimer: 'This proposal is confidential and intended solely for the recipient. All technical specifications, pricing and commercial terms are valid for the stated proposal validity period unless revised in writing by {company}.'
  }
};

/* --------------------------------------------------------------------------
   Portfolio thumbnails (page 9). Replace these placeholder photos with real
   project photographs — either by swapping the files or via Advanced Edit.
   TODO: final art for PROJ_1_2…PROJ_3_3 is being produced; they temporarily
   reuse the first thumbnail so no image slot is ever broken.
   -------------------------------------------------------------------------- */
const TEMP_THUMB = 'assets/images/proj-industrial-1.jpg';
const PROJECT_IMAGES = {
  PROJ_1_1: 'assets/images/proj-industrial-1.jpg',
  PROJ_1_2: TEMP_THUMB, // TODO -> assets/images/proj-industrial-2.jpg
  PROJ_1_3: TEMP_THUMB, // TODO -> assets/images/proj-industrial-3.jpg
  PROJ_2_1: TEMP_THUMB, // TODO -> assets/images/proj-commercial-1.jpg
  PROJ_2_2: TEMP_THUMB, // TODO -> assets/images/proj-commercial-2.jpg
  PROJ_2_3: TEMP_THUMB, // TODO -> assets/images/proj-commercial-3.jpg
  PROJ_3_1: TEMP_THUMB, // TODO -> assets/images/proj-residential-1.jpg
  PROJ_3_2: TEMP_THUMB, // TODO -> assets/images/proj-residential-2.jpg
  PROJ_3_3: TEMP_THUMB  // TODO -> assets/images/proj-residential-3.jpg
};

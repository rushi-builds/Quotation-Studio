/* Project detail copy for the public gallery.
 *
 * Everything here is derived from facts the gallery already publishes - the
 * name, capacity, location and sector in gallery.html's PROJECTS list - plus
 * the installation date the owner is currently showing. No generated numbers,
 * savings figures or customer-specific claims: those belong in a proposal, not
 * on a public portfolio page.
 *
 * The owner plans to serve this from the backend later; until then every
 * value lives in this one object so it can be replaced in one place.
 */
'use strict';
(function (root) {
  /* Install dates render as DD/MM/YYYY. The owner asked for this single
     placeholder date until the backend supplies the real one per project. */
  var DEFAULT_INSTALLED = '01/01/2026';

  function slug(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  /* Stable public id: name + capacity, so the two Agarwal installations stay
     separate and a like keeps pointing at the same project after any reorder. */
  function projectId(p) {
    return slug(p && p.name) + '__' + slug(p && p.capacity);
  }

  /* Scope wording is chosen by what the installation actually is, so a CHS
     terrace and a 1,700 kWp factory roof never read the same. */
  var POINTS = {
    tracking: [
      'Ground-mounted structure with single-axis tracking rows',
      'Module rows spaced for tracker rotation and service access',
      'DC array, inverter and protection sized to the exported capacity',
      'Commissioning, net-metering coordination and handover documentation'
    ],
    industrial: [
      'Elevated module rows over the existing industrial roof',
      'Cabling, earthing and protection routed to the site distribution board',
      'Plant load coordinated with the DISCOM net-metering application',
      'Commissioning, generation checks and O&M handover'
    ],
    commercial: [
      'Rooftop array sized to the daytime commercial load',
      'Inverter and protection placed for safe service access',
      'Net-metering application and commissioning support',
      'Performance check at handover with the facility team'
    ],
    residential: [
      'Common-area rooftop array for lifts, pumps and lighting loads',
      'Shared metering coordinated with the society committee',
      'Structure and cabling detailed for safe terrace access',
      'Handover with a simple maintenance and cleaning guide'
    ],
    specialty: [
      'Array layout matched to the building\'s own load profile',
      'Protection and isolation arranged for a live working site',
      'Net-metering and inspection coordination',
      'Commissioning records, as-built notes and O&M handover'
    ]
  };

  /* Exact, project-specific detail for the installations the studio portfolio
     documents with its own photographs. Anything not listed falls back to the
     sector wording below, which only restates published facts. */
  var SUMMARY = {
    'agarwal-technoplast-pvt-ltd__1-700-kwp':
      'A 1,700 kWp rooftop installation across the plant sheds at Agarwal Technoplast, Pune. The array follows the existing roof geometry, with the DC runs and protection brought together at the site distribution room.',
    'grp-limited__1-000-kwp':
      'A 1,000 kWp rooftop system at GRP Limited, Solapur. Modules are laid out across multiple shed roofs, with cabling and earthing detailed for the plant\'s industrial load.',
    'serum-institute-of-india__700-kwp':
      'A 700 kWp rooftop installation at Serum Institute of India, Pune. The layout works around rooflights, ventilation and service access so the array sits inside the building\'s existing constraints.',
    'agarwal-technoplast-pvt-ltd__500-kwp':
      'A 500 kWp ground-mounted array using single-axis solar tracking at Agarwal Technoplast, Pune. The rows follow the site\'s open ground, keeping spacing for tracker movement and maintenance access.',
    'city-pride-multiplex__500-kwp':
      'A 500 kWp rooftop system at City Pride Multiplex, Ratnagiri. The array is laid over the cinema\'s large roof area and offsets the building\'s daytime air-conditioning and projection load.',
    'reachglobal-india-pvt-ltd__350-kwp':
      'A 350 kWp rooftop installation at ReachGlobal India, Pune. Module rows are spread across the office block roofs with the inverter and protection located for straightforward service access.',
    'par-formulations-pvt-ltd__250-kwp':
      'A 250 kWp rooftop system at PAR Formulations, Indore. The layout respects the plant\'s rooftop equipment and keeps clear service paths around the array.',
    'bramha-emerald-county__160-kwp':
      'A 160 kWp rooftop installation at Bramha Emerald County, Pune. The system serves the residential community\'s common-area loads through a shared metering arrangement.',
    'prorigo-softwares-pvt-ltd__120-kwp':
      'A 120 kWp rooftop system at Prorigo Softwares, Pune, sized around the office\'s daytime cooling and workstation load.',
    'nerolac-paints__65-kwp':
      'A 65 kWp rooftop installation at Nerolac Paints, Bawal. A compact array on the facility roof, with the protection and metering coordinated with the site team.'
  };

  function sectorKey(p) {
    if (/tracking/i.test(p.installation || '')) return 'tracking';
    var sector = String(p.sector || '').toLowerCase();
    if (sector === 'industrial') return 'industrial';
    if (sector === 'residential') return 'residential';
    if (sector === 'specialty') return 'specialty';
    return 'commercial';
  }

  /* Published facts plus one sector-specific sentence: different enough that
     neighbouring cards do not read as copies, and still only what the page
     already states about the project. */
  var SECTOR_LINE = {
    industrial: 'The array is laid out around the plant\'s roof equipment, with cabling and protection taken to the site distribution board and the industrial daytime load as the design basis.',
    commercial: 'The array is sized against the building\'s daytime commercial load, with the inverter and protection placed for straightforward service access.',
    residential: 'The array serves the community\'s shared loads - lifts, pumps and common lighting - with metering coordinated through the society committee.',
    specialty: 'The layout follows the facility\'s own operating pattern, with protection, isolation and inspection arrangements agreed with the site team.'
  };

  function fallbackSummary(p) {
    var key = sectorKey(p);
    var kind = p.installation || 'Rooftop solar';
    var where = p.location ? ' in ' + p.location : '';
    return p.capacity + ' ' + kind.toLowerCase() + ' installation' + where + '. ' + SECTOR_LINE[key];
  }

  function detailFor(p) {
    if (!p) return null;
    var id = projectId(p);
    var key = sectorKey(p);
    return {
      id: id,
      installed: (p.installed && String(p.installed)) || DEFAULT_INSTALLED,
      summary: (p.summary && String(p.summary)) || SUMMARY[id] || fallbackSummary(p),
      points: (Array.isArray(p.points) && p.points.length ? p.points : POINTS[key]).slice(0, 6)
    };
  }

  root.GalleryDetails = {
    DEFAULT_INSTALLED: DEFAULT_INSTALLED,
    projectId: projectId,
    detailFor: detailFor
  };
})(typeof window !== 'undefined' ? window : globalThis);

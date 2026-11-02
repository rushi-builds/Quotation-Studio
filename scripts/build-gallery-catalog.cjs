/* Builds the server-side project catalogue from the one list the browser uses.
 *
 * The public gallery keeps its projects in assets/js/gallery-projects.js. The
 * Worker needs the same names to turn a stored feedback/like id back into a
 * readable project, and to render a per-project share card. Duplicating the
 * list by hand would drift on the first edit, so this script reads the browser
 * file and writes a generated module; `platform/cloudflare/sync-public.js` runs
 * it on every build, and qa/gallery-catalog.test.cjs fails if the committed
 * copy is stale.
 *
 * Usage: node scripts/build-gallery-catalog.cjs [--check]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets/js/gallery-projects.js');
const TARGET = path.join(ROOT, 'platform/cloudflare/src/gallery-catalog.mjs');

function slug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/* Same id gallery-details.js builds: name + capacity, so the two Agarwal
   installations stay separate entries and a like keeps pointing at one. */
function projectId(project) {
  return slug(project && project.name) + '__' + slug(project && project.capacity);
}

function readProjects() {
  const source = fs.readFileSync(SOURCE, 'utf8');
  const window = {};
  // The file is plain data plus two assignments; this evaluates exactly that.
  new Function('window', source)(window);
  const projects = Array.isArray(window.PROJECTS) ? window.PROJECTS : [];
  if (!projects.length) throw new Error('gallery-projects.js has no PROJECTS list');
  return { projects, sectors: window.SECTORS || [] };
}

function build() {
  const { projects, sectors } = readProjects();
  const rows = projects.map((p) => {
    const id = projectId(p);
    return {
      id,
      name: String(p.name || '').slice(0, 160),
      capacity: String(p.capacity || '').slice(0, 40),
      sector: String(p.sector || '').slice(0, 40),
      location: String(p.location || '').slice(0, 120),
      /* A data: URI is not a usable share image and would bloat the Worker
         bundle, so the catalogue stores its path only when it is a real URL. */
      img: /^\s*data:/i.test(String(p.img || '')) ? '' : String(p.img || '').slice(0, 400),
      src: String(p.src || 'studio').slice(0, 20)
    };
  });
  const seen = new Set();
  rows.forEach((row) => {
    if (seen.has(row.id)) throw new Error('duplicate project id: ' + row.id);
    seen.add(row.id);
  });
  return (
    '/* GENERATED FILE - do not edit by hand.\n' +
    '   Source: assets/js/gallery-projects.js\n' +
    '   Build:  node scripts/build-gallery-catalog.cjs\n' +
    '   Used by the Worker for feedback ids, like leaderboards and per-project\n' +
    '   share cards. */\n' +
    "'use strict';\n\n" +
    'export const GALLERY_PROJECTS = ' + JSON.stringify(rows) + ';\n\n' +
    'export const GALLERY_SECTORS = ' + JSON.stringify(sectors) + ';\n\n' +
    'export const GALLERY_BY_ID = GALLERY_PROJECTS.reduce((map, project) => {\n' +
    '  map[project.id] = project;\n' +
    '  return map;\n' +
    '}, {});\n\n' +
    'export function galleryProject(id) {\n' +
    '  return GALLERY_BY_ID[String(id || "")] || null;\n' +
    '}\n'
  );
}

function main() {
  const output = build();
  const check = process.argv.includes('--check');
  const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : '';
  if (check) {
    if (current !== output) {
      console.error('gallery-catalog.mjs is out of date - run node scripts/build-gallery-catalog.cjs');
      process.exit(1);
    }
    console.log('gallery-catalog.mjs is current');
    return;
  }
  if (current === output) {
    console.log('gallery-catalog.mjs unchanged');
    return;
  }
  fs.writeFileSync(TARGET, output);
  console.log('wrote platform/cloudflare/src/gallery-catalog.mjs');
}

if (require.main === module) main();
module.exports = { build, readProjects, projectId, slug, TARGET };

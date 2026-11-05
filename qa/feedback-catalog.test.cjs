/* The generated project catalogue must match the gallery's own list.
   The Worker uses it for feedback ids, the like leaderboard and per-project
   share cards, so a stale copy would show an old project name or none at all. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const builder = require(path.join(root, 'scripts/build-gallery-catalog.cjs'));

const target = path.join(root, 'platform/cloudflare/src/gallery-catalog.mjs');
const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
const expected = builder.build();
assert.equal(current, expected, 'gallery-catalog.mjs is stale - run node scripts/build-gallery-catalog.cjs');

const { projects } = builder.readProjects();
assert.ok(projects.length >= 10, 'the gallery publishes every project');

/* The gallery feedback card asks for an optional name plus an email or
   WhatsApp number in the same single field, end to end at a 120-character
   cap: page copy, client payload slice and the Worker's server-side slice
   must agree, or a contact typed by a visitor is silently truncated. */
const galleryPage = fs.readFileSync(path.join(root, 'gallery.html'), 'utf8');
assert.ok(galleryPage.includes('Your name, email or WhatsApp no. <em>(optional)</em>'),
  'the gallery feedback name field must offer the email / WhatsApp option in its label');
assert.ok(galleryPage.includes('id="feedbackName" name="name" maxlength="120"'),
  'the gallery feedback name field must allow 120 characters');
const galleryLikes = fs.readFileSync(path.join(root, 'assets/js/gallery-likes.js'), 'utf8');
assert.match(galleryLikes, /name: String\(\(payload && payload\.name\) \|\| ''\)\.slice\(0, 120\)/,
  'the gallery feedback client payload must keep up to 120 name characters');
const workerSrc = fs.readFileSync(path.join(root, 'platform/cloudflare/src/worker.js'), 'utf8');
assert.match(workerSrc, /const name = String\(\(body && body\.name\) \|\| ''\)\.replace\(\/\\s\+\/g, ' '\)\.trim\(\)\.slice\(0, 120\)/,
  'the Worker must keep up to 120 gallery feedback name characters');

/* The catalogue is loaded as a module by both backends; check it really parses
   and resolves ids the same way the browser does. */
import(path.join('file://', target)).then((catalog) => {
  assert.equal(catalog.GALLERY_PROJECTS.length, projects.length);
  const ids = catalog.GALLERY_PROJECTS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');

  /* gallery-details.js builds the browser id; the catalogue must agree, or a
     like saved from the page would not resolve on the dashboard. */
  const details = fs.readFileSync(path.join(root, 'assets/js/gallery-details.js'), 'utf8');
  assert.ok(details.includes("slug(p && p.name) + '__' + slug(p && p.capacity)"),
    'gallery-details.js still builds ids as name__capacity');

  projects.forEach((project) => {
    const id = builder.projectId(project);
    assert.ok(catalog.galleryProject(id), 'catalogue resolves ' + id);
    assert.equal(catalog.galleryProject(id).name, project.name);
  });
  assert.equal(catalog.galleryProject('not-a-project'), null);

  /* A data: URI is not a shareable image, so it must never reach the bundle. */
  catalog.GALLERY_PROJECTS.forEach((project) => {
    assert.ok(!/^data:/i.test(project.img), 'no inline image data in the catalogue: ' + project.id);
  });
  assert.ok(catalog.GALLERY_SECTORS.length === 4, 'four sectors');

  console.log('gallery catalogue: ' + catalog.GALLERY_PROJECTS.length + ' projects, ids match the gallery');
}).catch((error) => {
  console.error(error && error.message);
  process.exit(1);
});

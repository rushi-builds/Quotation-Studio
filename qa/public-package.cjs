/* Test-only production packaging fixture. public/ is ignored build output, not
   a committed mirror. Run the unchanged production packager in a fresh temporary
   source workspace, never overwriting a developer's public/ or generated knowledge. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PARITY_FILES = Object.freeze([
  'assets/js/dashboard.js',
  'assets/js/dashboard-home.js',
  'assets/css/dashboard.css',
  'assets/css/workspace-fit.css',
  'assets/css/bess.css',
  'assets/js/system-image-frame.js',
  'assets/js/control-panel.js',
  'assets/js/document-studio.js',
  'assets/css/document-studio.css',
  'assets/css/control-panel.css',
  'dashboard.html',
  'assets/js/settings-connections.js',
  'assets/js/workspace-access.js',
  'assets/css/settings-connections.css',
  'assets/js/pulse/business-pulse.js',
  'assets/js/pulse/pulse-governance-ui.js'
]);
function publicParity(sourceRoot, publicRoot, files = PARITY_FILES) {
  return files.map(file => {
    const source = path.join(sourceRoot, file), output = path.join(publicRoot, file);
    return { file, ok: fs.existsSync(source) && fs.existsSync(output) &&
      fs.readFileSync(source).equals(fs.readFileSync(output)) };
  });
}
function buildPublic(sourceRoot) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-public-package-'));
  const cleanup = () => fs.rmSync(workspace, { recursive: true, force: true });
  try {
    const copy = relative => {
      const destination = path.join(workspace, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(path.join(sourceRoot, relative), destination, { recursive: true });
    };
    // Only the actual packager's public inputs and generator dependencies;
    // no .git, private configuration, environment files, local DB or credentials.
    for (const relative of [
      'assets', 'index.html', 'dashboard.html', 'quotation.html', 'portal.html',
      'share.html', 'gallery.html', 'oauth-complete.html',
      'platform/cloudflare/sync-public.js', 'scripts/build-assistant-knowledge.cjs',
      'docs/storage-catalogue.md'
    ]) copy(relative);
    const log = execFileSync(process.execPath, [path.join(workspace, 'platform/cloudflare/sync-public.js')], {
      cwd: workspace, encoding: 'utf8', timeout: 30000
    });
    return { workspace, publicRoot: path.join(workspace, 'platform/cloudflare/public'), log, cleanup };
  } catch (error) { cleanup(); throw error; }
}
module.exports = { buildPublic, publicParity, PARITY_FILES };

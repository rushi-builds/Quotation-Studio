// Diagnose why a social provider reports "not live yet" without exposing secrets.
// Usage: node platform/cloudflare/scripts/oauth-setup-check.mjs
// Reads the same environment variables the Worker uses (never prints values).
import { configurationIssues, providers } from '../src/oauth.mjs';

const env = process.env;
let enabledWithIssues = 0;
for (const provider of providers) {
  const flag = 'OAUTH_' + provider.toUpperCase() + '_ENABLED';
  const issues = configurationIssues(env, provider);
  if (issues.length === 0) {
    console.log(`[ready] ${provider}: configured`);
  } else {
    console.log(`[not live] ${provider}:`);
    for (const issue of issues) console.log(`  - ${issue}`);
    if (env[flag] === 'true') enabledWithIssues++;
  }
}
if (enabledWithIssues) {
  console.log(`\n${enabledWithIssues} enabled provider(s) cannot start until the above is fixed. See docs/social-sign-in-setup.md.`);
  process.exit(1);
} else {
  console.log('\nNo enabled provider is misconfigured. Unlisted providers are intentionally off.');
}

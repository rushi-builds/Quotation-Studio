/* Cloudflare entry alias — the single implementation lives in worker.js
   (wrangler.toml `main` points there; `npm run deploy` is the supported path).
   Kept as a thin re-export so older imports keep working without drifting. */
export { default } from './worker.js';

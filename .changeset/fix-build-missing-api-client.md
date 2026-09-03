---
"@codacy/codacy-cloud-cli": patch
---

Fix `npm run build` (and `npm test`, `npm run check-types`, `npm start`) failing with `Cannot find module '../api/client/**'` on a fresh clone. These scripts now auto-generate the gitignored API client via a new `ensure-api-client` `pre*` hook when `src/api/client/` is missing, instead of requiring `npm run update-api` to be run manually first.

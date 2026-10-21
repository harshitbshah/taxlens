# Changelog

All notable changes to TaxLens are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/). Entries reference spec requirement IDs where
applicable (e.g. `HM-3` → `docs/HOSTED_MODE_SPEC.md`).

History before 0.5.0 is not reconstructed here — see `docs/PROGRESS.md` (session log) and
`git log`.

## [0.5.0] — 2026-10-21 (Hosted mode)

Spec: [`docs/HOSTED_MODE_SPEC.md`](docs/HOSTED_MODE_SPEC.md)

### Added
- `src/lib/data-dir.ts` — `getDataDir()` / `dataPath()`, the single place the data directory is resolved (HM-1).
- Test-run isolation: `bun test` now preloads `tests/setup/isolate-data-dir.ts`, forcing all storage into a temp dir (HM-2).
- `src/server.ts` `createServer()` factory and `tests/helpers/test-server.ts`, enabling real HTTP route tests (HM-3).
- Hosted-mode config validation: with `TAXLENS_HOSTED=true` the server refuses to start (exit 1, all errors listed) unless `NODE_ENV=production`, absolute non-overlapping `TAX_UI_DATA_DIR`/`TAX_UI_STATIC_DIR`, `ANTHROPIC_API_KEY` set and `DEMO_MODE` off (HM-4).
- `TAXLENS_HOSTNAME` env var for the bind address (HM-9).
- Hosted mode disables `POST /api/config/key`, `POST /api/clear-data`, and browser-supplied `apiKey` on `/api/parse` / `/api/extract-year` (403), and never deletes the server's key on an invalid-key error (HM-7).
- `/api/config` now includes `isHosted`; the "Reset data" menu item is hidden in hosted mode (HM-7).
- `GET /api/health` → `{ ok: true }` liveness endpoint (HM-9).
- Production mode serves `index.html` for unknown non-API paths so client-side deep links load (HM-5).
- `Dockerfile` + `.dockerignore` for hosted mode (non-root, `/data` volume, healthcheck, no data or secrets in the build context) and `scripts/verify-image.sh` acceptance checks (HM-10).
- Deployment: `deploy/` (compose, Caddy snippet, env templates), `scripts/deploy-wizard.sh`, `scripts/smoke-hosted.sh`, `scripts/push-data-to-server.sh`, `scripts/tunnel.sh`, `scripts/data-files.txt`; `docs/HOSTING.md` rewritten as the runbook; README "Self-hosting" section (HM-11…HM-14).
- `scripts/backup-to-gdrive.sh --from-server` with dated snapshots; local mode now also backs up `.filing-costs.json`, `.forecast-cache.json`, `.forecast-profile.json` (HM-14).
- `docs/HOSTED_MODE_SPEC.md` — requirements HM-1 … HM-14 for running TaxLens on a self-hosted server behind a username/password.
- `CHANGELOG.md` (this file).

### Changed
- **Breaking (local data location):** `.filing-costs.json` now lives in the data dir (`TAX_UI_DATA_DIR`, default `cwd`) instead of `$HOME`. Copy `~/.filing-costs.json` into the project root once (HM-1).
- **Behaviour change:** the server now binds `127.0.0.1` by default instead of all interfaces, so TaxLens is no longer reachable from other devices on your network. Set `TAXLENS_HOSTNAME=0.0.0.0` to restore the old behaviour (HM-9). Playwright now targets `127.0.0.1:3005`.
- `@anthropic-ai/claude-code` moved from dependencies to devDependencies — the app never imports it (HM-10).
- `src/index.ts` is now a thin entry point; routes and `Bun.serve()` config moved to `src/server.ts` (HM-3). No behaviour change.
- All storage modules resolve their file path on every call instead of at import time (HM-1).

### Fixed
- Review fixes: `/api/config` derives `isDemo`/`isDev` from the validated server config; production static handler uses a prefix-safe containment check and accepts a relative `TAX_UI_STATIC_DIR`; `Origin: null` is always treated as cross-site; the test preload also clears mode switches (`TAXLENS_HOSTED`, `TAXLENS_HOSTNAME`, `DEMO_MODE`, `TAX_UI_STATIC_DIR`).
- Opening TaxLens on any hostname other than `localhost`/`127.0.0.1` showed the built-in sample data and never loaded your returns (leftover from upstream's public demo site). Demo mode is now decided only by the server (`DEMO_MODE`) or the dev override. If the initial load fails, the app shows an error instead of sample data (HM-6).
- **Security:** any website open in your browser could change or wipe TaxLens data (e.g. a hidden form POST to `/api/clear-data` on `localhost`). State-changing `/api/*` requests marked cross-site by the browser (`Sec-Fetch-Site`, or an `Origin` that doesn't match `Host`) now get 403 (HM-8).
- **Security:** the production static handler served dotfiles, so `/.env` (API key) and `/.tax-returns.json` were downloadable whenever they sat in the static dir. Dotfile path segments are now always 404, and any production start refuses a data dir inside the static dir (HM-5).
- `bun test` no longer reads or writes real data: the filing-costs tests had been modifying `~/.filing-costs.json`, and `forecast-cache.test.ts` had been deleting the real `.forecast-cache.json` (HM-1, HM-2).
- `bun test` no longer sees the real `ANTHROPIC_API_KEY` from `.env`; the test preload strips it so no test can make billable API calls (HM-2).


### Known issues
- Caddy `basic_auth` has no login-attempt limit; fail2ban on the Caddy log is a recommended follow-up.
- Cached forecasts were deleted by pre-0.5.0 test runs; regenerate them once.

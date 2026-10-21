# Changelog

All notable changes to TaxLens are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/). Entries reference spec requirement IDs where
applicable (e.g. `HM-3` → `docs/HOSTED_MODE_SPEC.md`).

History before 0.5.0 is not reconstructed here — see `docs/PROGRESS.md` (session log) and
`git log`.

## [Unreleased] — 0.5.0 (Hosted mode)

Spec: [`docs/HOSTED_MODE_SPEC.md`](docs/HOSTED_MODE_SPEC.md)

### Added
- `src/lib/data-dir.ts` — `getDataDir()` / `dataPath()`, the single place the data directory is resolved (HM-1).
- Test-run isolation: `bun test` now preloads `tests/setup/isolate-data-dir.ts`, forcing all storage into a temp dir (HM-2).
- `src/server.ts` `createServer()` factory and `tests/helpers/test-server.ts`, enabling real HTTP route tests (HM-3).
- Hosted-mode config validation: with `TAXLENS_HOSTED=true` the server refuses to start (exit 1, all errors listed) unless `NODE_ENV=production`, absolute non-overlapping `TAX_UI_DATA_DIR`/`TAX_UI_STATIC_DIR`, `ANTHROPIC_API_KEY` set and `DEMO_MODE` off (HM-4).
- `TAXLENS_HOSTNAME` env var for the bind address (HM-9).
- `docs/HOSTED_MODE_SPEC.md` — requirements HM-1 … HM-14 for running TaxLens on a self-hosted server behind a username/password.
- `CHANGELOG.md` (this file).

### Changed
- **Breaking (local data location):** `.filing-costs.json` now lives in the data dir (`TAX_UI_DATA_DIR`, default `cwd`) instead of `$HOME`. Copy `~/.filing-costs.json` into the project root once (HM-1).
- **Behaviour change:** the server now binds `127.0.0.1` by default instead of all interfaces, so TaxLens is no longer reachable from other devices on your network. Set `TAXLENS_HOSTNAME=0.0.0.0` to restore the old behaviour (HM-9). Playwright now targets `127.0.0.1:3005`.
- `src/index.ts` is now a thin entry point; routes and `Bun.serve()` config moved to `src/server.ts` (HM-3). No behaviour change.
- All storage modules resolve their file path on every call instead of at import time (HM-1).

### Fixed
- `bun test` no longer reads or writes real data: the filing-costs tests had been modifying `~/.filing-costs.json`, and `forecast-cache.test.ts` had been deleting the real `.forecast-cache.json` (HM-1, HM-2).
- `bun test` no longer sees the real `ANTHROPIC_API_KEY` from `.env`; the test preload strips it so no test can make billable API calls (HM-2).

### Known issues (to be fixed under this release)
- Frontend shows demo data on any non-localhost hostname (HM-6).

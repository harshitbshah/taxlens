# Hosted Mode — Spec

Status: **Approved 2026-10-21** — implementation in progress
Created: 2026-10-21
Target version: 0.5.0
Supersedes: the Authelia/Docker-network plan previously in `docs/HOSTING.md`

---

## 1. Background

TaxLens has only ever run on `localhost`. The goal is to run it on a personal OCI VM behind a
username/password, so it is reachable from any device without carrying the laptop.

A code review before writing this spec found that the app is **not safe or even functional** to
host as-is:

| Finding | Where | Consequence if hosted unchanged |
|---|---|---|
| Frontend treats any non-localhost hostname as the public demo site | `src/lib/env.ts` `isHostedEnvironment()`, `src/App.tsx` `fetchInitialState()` | Hosted app shows sample data and never fetches real data |
| Production static handler serves any file under `STATIC_ROOT` (defaults to the source dir) | `src/index.ts` `fetch:` handler | If data dir ever overlaps static root, `/.tax-returns.json` is downloadable |
| `POST /api/clear-data` wipes everything with no body or confirmation | `src/index.ts` | A cross-site form POST from any page the user visits can wipe data (browsers attach cached Basic-Auth credentials) |
| `POST /api/config/key` lets the browser replace or remove the Anthropic key | `src/index.ts`, `src/lib/storage.ts` | Anyone past the password can swap the billing key |
| Data dir is captured at module load in most storage modules; `filing-costs-cache.ts` also defaults to `$HOME` instead of `cwd` | `src/lib/*-cache.ts`, `storage.ts`, `filing-costs-cache.ts` | Tests that set `TAX_UI_DATA_DIR` in `beforeEach` silently read/write **real** data. On 2026-10-21 this corrupted `~/.filing-costs.json`; `forecast-cache.test.ts` had also been deleting the real `.forecast-cache.json` on every run |
| `Bun.serve()` has no `hostname`, so it binds all interfaces | `src/index.ts` | Local dev already exposes tax data to anyone on the same Wi-Fi |
| Routes are defined at module top level alongside `serve()` | `src/index.ts` | Routes can't be exercised over HTTP in tests; existing route tests grep the source text |

## 2. Goals

1. Run TaxLens at an HTTPS URL on the OCI VM, guarded by a username/password.
2. Real data persists across container restarts and rebuilds, and is backed up off-box.
3. Hosting must not change local-dev behaviour except where local dev was itself unsafe (bind address, cross-site writes).
4. Claude Code skills in `tax-planner` (`/parse-return`, `/analyze-taxes`) can still push data in, unchanged.
5. Every behaviour below is covered by an automated test written **before** the implementation.

## 3. Non-goals (this round)

- tax-planner pages, open-items tracker, document vault / Google Drive links (round 2)
- Multi-user support or per-user data
- Authelia / TOTP (possible later upgrade; see §9)
- CI-driven deploys (manual `docker compose build` for now)
- Electron build changes

## 4. Glossary

| Term | Meaning |
|---|---|
| **Hosted mode** | Server started with `TAXLENS_HOSTED=true`. Strict config validation, dangerous routes disabled. |
| **Demo mode** | Existing upstream behaviour: sample data, no server calls. Only enabled explicitly (`DEMO_MODE=true` or the dev override). |
| **Data dir** | Directory holding all `.*.json` data files and `.env`. `TAX_UI_DATA_DIR`, default `cwd`. |
| **Static dir** | Directory the production server serves frontend files from. `TAX_UI_STATIC_DIR`. |
| **Cross-site write** | A non-GET/HEAD request to `/api/*` initiated by a page on a different origin. |

---

## 5. Requirements

Each requirement has an ID used in test names, commit messages, and the CHANGELOG.
Acceptance criteria (AC) are the test cases. Implementation follows TDD: tests for a requirement
are committed failing (or written and shown failing) before the change that makes them pass.

### HM-1 — Data dir resolved at call time, in one place ✅

> Implemented 2026-10-21. `src/lib/data-dir.ts`; tests in `src/lib/data-dir.test.ts` (red: 9/10 modules wrote to the import-time dir — `analysis-cache` was already call-time). Local `~/.filing-costs.json` copied to the repo root; original kept as backup.

**Why:** Module-load capture is what let tests touch real data. One helper removes six copies of
the same expression and the `$HOME` inconsistency.

- New `src/lib/data-dir.ts` exporting `getDataDir(): string` and `dataPath(file: string): string`.
- `getDataDir()` returns `process.env.TAX_UI_DATA_DIR` if set and non-empty, else `process.cwd()`.
- Every storage/cache module calls `dataPath()` on each operation. No module-level path constants.
- `filing-costs-cache.ts` uses the same default as everything else (`cwd`, not `$HOME`).

AC:
1. `getDataDir()` reflects a change to `TAX_UI_DATA_DIR` made after import.
2. Empty-string `TAX_UI_DATA_DIR` falls back to `cwd`.
3. For each storage module (returns, India returns, country storage, forecast cache, insights
   cache, analysis cache, filing costs, forecast profile, retirement accounts, API-key `.env`):
   setting `TAX_UI_DATA_DIR` to a temp dir **after** import causes writes to land in that temp dir.
4. Source-level guard: no file in `src/lib/` contains a module-level
   `= process.env.TAX_UI_DATA_DIR` assignment.

**Migration:** the one existing `~/.filing-costs.json` must be copied to the project root (local)
and included in the server data migration (HM-12). Documented in `docs/HOSTING.md`.

### HM-2 — Test runs can never touch real data ✅

> Implemented 2026-10-21. `tests/setup/isolate-data-dir.ts` + `bunfig.toml` `[test] preload`. Verified: mtimes of all real data files identical before/after a full `bun test` (226 pass / 0 fail). Also found that `forecast-cache.test.ts` had been deleting the real `.forecast-cache.json` on every run; fixed by the same change.

**Why:** HM-1 fixes the known bug; HM-2 makes the whole class impossible, including in tests
written later that forget to isolate.

- `bunfig.toml` `[test] preload = ["./tests/setup/isolate-data-dir.ts"]`.
- The preload creates a fresh temp dir per test run, sets `TAX_UI_DATA_DIR` to it, and removes it
  on exit.
- Individual tests may still override with their own temp dir.

AC:
1. During `bun test`, `getDataDir()` resolves under `os.tmpdir()`.
2. A guard test asserts the resolved data dir is not the repo root and not `$HOME`.
3. The two previously failing `filing-costs cache` tests pass.
4. Manual check (documented in PROGRESS): `~/.filing-costs.json` and the repo's `.*.json`
   mtimes are unchanged after a full `bun test`.

### HM-3 — Server factory

**Why:** Needed so HM-5–HM-9 can be tested with real HTTP requests instead of regex on source.

- New `src/server.ts` exporting `createServer(options: { port: number; hostname: string; env: ServerEnv })`
  that returns the `Bun.Server`. Route definitions move here unchanged.
- `src/index.ts` becomes a thin entry: parse args/env → validate (HM-4) → `createServer()` → log.
- New `tests/helpers/test-server.ts`: starts a server on port 0 with a temp data dir and returns
  `{ url, stop }`.
- Existing `src/index.test.ts` source-level checks are re-pointed at `src/server.ts` and kept
  (they guard against real regressions) — plus one HTTP test proving `idleTimeout` is applied.

AC:
1. `GET /api/config` on a test server returns 200 JSON.
2. Existing source-level regression tests pass against `src/server.ts`.
3. `bun run dev` behaviour unchanged (manual check, documented).

### HM-4 — Hosted-mode config validation (fail fast)

**Why:** A misconfigured hosted server should refuse to start, not start insecurely.

- New `src/lib/hosted-config.ts` exporting pure `resolveServerEnv(env: Record<string, string | undefined>): { ok: true; config: ServerEnv } | { ok: false; errors: string[] }`.
- `ServerEnv` fields: `hosted: boolean`, `production: boolean`, `dataDir`, `staticDir`, `hostname`, `demo: boolean`.
- When `TAXLENS_HOSTED=true`, all of these must hold, else `ok: false` with one message each:
  - `NODE_ENV=production`
  - `TAX_UI_DATA_DIR` set and absolute
  - `TAX_UI_STATIC_DIR` set and absolute
  - data dir and static dir do not overlap (neither equal to nor nested in the other)
  - `ANTHROPIC_API_KEY` set
  - `DEMO_MODE` not `true`
- `src/index.ts` prints all errors and exits with code 1 when `ok: false`.

AC: one unit test per rule above (passing and failing case), plus:
- All errors are reported at once, not just the first.
- `TAXLENS_HOSTED` unset → no hosted rules applied (local dev unaffected).
- Overlap detection uses resolved paths (`/data/../app` style tricks are caught).

### HM-5 — Static file handler can't leak data

**Why:** Defence in depth for the production handler, hosted or not.

- In production mode (any), the overlap rule from HM-4 also applies (refuse to start).
- The static handler returns 404 for any path with a segment starting with `.`
  (covers `/.tax-returns.json`, `/.env`, `/assets/.hidden`).
- Unknown non-API paths return `index.html` (SPA fallback) instead of 404, so deep links work.

AC (HTTP, production test server with temp static dir containing `index.html` and a decoy `.env`):
1. `GET /` → 200 `index.html`.
2. `GET /.env`, `GET /.tax-returns.json`, `GET /%2e%65%6e%76` → 404.
3. `GET /../package.json` → 404.
4. `GET /some/deep/link` → 200 `index.html`.

### HM-6 — Frontend asks the server whether it is in demo mode

**Why:** Hostname sniffing makes any hosted deployment show sample data.

- `/api/config` response gains `isHosted: boolean`. `isDemo` stays the single source of truth for demo mode.
- `fetchInitialState()` always calls the server. Demo mode is decided by `resolveDemoMode(override, serverIsDemo)` only.
- `isHostedEnvironment()` is removed. If the server is unreachable, the UI shows an error state
  rather than silently falling back to demo (consistent with the silent-catch rule in CLAUDE.md).

AC:
1. `resolveDemoMode(null, false)` → false regardless of `window.location.hostname`.
2. `resolveDemoMode(null, true)` → true; dev override still wins in both directions.
3. `GET /api/config` on a hosted test server → `{ isHosted: true, isDemo: false }`.
4. Source-level guard: `isHostedEnvironment` no longer referenced in `src/`.

### HM-7 — Dangerous routes disabled in hosted mode

**Why:** Behind a single password, the key and the wipe button are the highest-impact actions.

- In hosted mode: `POST /api/config/key`, `DELETE /api/config/key` (if present), and
  `POST /api/clear-data` return **403** `{ "error": "Disabled in hosted mode" }` without side effects.
- `/api/config` exposes `isHosted`; Settings UI hides key management and the reset action when
  `isHosted` is true (display-only change, no test required per CLAUDE.md, covered by E2E smoke if convenient).

AC (HTTP):
1. Hosted: each route → 403, and the data files / `.env` in the temp data dir are unchanged.
2. Local: `POST /api/clear-data` still clears data (existing behaviour preserved).

### HM-8 — Reject cross-site writes (all modes)

**Why:** Browsers attach cached Basic-Auth credentials to cross-site form posts. This also
protects local dev from drive-by requests to `localhost:3005`.

- Pure `isCrossSiteWrite(req: Request): boolean` in `src/lib/request-guard.ts`.
- Applied to every `/api/*` request whose method is not GET/HEAD/OPTIONS.
- Rejected (403 `{ "error": "Cross-site request blocked" }`) when either:
  - `Sec-Fetch-Site` is `cross-site` or `same-site`, or
  - `Origin` is present and its host differs from the `Host` header.
- Allowed when neither header is present (curl, Claude Code skills over the SSH tunnel).

AC (unit, on constructed `Request`s): same-origin allowed; `Sec-Fetch-Site: none` allowed;
cross-site rejected; same-site rejected; mismatched Origin rejected; `Origin: null` rejected;
no headers allowed; GET with cross-site headers allowed.
AC (HTTP): cross-site `POST /api/clear-data` on a **local** test server → 403 and data intact.

### HM-9 — Bind address and health endpoint

**Why:** Local dev shouldn't listen on the LAN; containers need to listen on all interfaces
inside the container; Docker needs a liveness probe that exposes no data.

- `TAXLENS_HOSTNAME` env, default `127.0.0.1`. The container sets `0.0.0.0`; the host only
  publishes `127.0.0.1:3005`, so the port is reachable only via Caddy.
- `GET /api/health` → 200 `{ "ok": true }`, no other fields.

AC:
1. `resolveServerEnv({})` → `hostname: "127.0.0.1"`.
2. `GET /api/health` → exactly `{ ok: true }`.

### HM-10 — Container image

- `Dockerfile` (multi-stage, `oven/bun:<pinned 1.3.x>`, builds for `linux/arm64`):
  build stage runs `bun install --frozen-lockfile` + `bun run build`; runtime stage contains only
  `dist/`, `src/`, production `node_modules`, `package.json`.
- Runs as the non-root `bun` user. `ENV TAXLENS_HOSTED=true NODE_ENV=production TAX_UI_DATA_DIR=/data TAX_UI_STATIC_DIR=/app/dist TAXLENS_HOSTNAME=0.0.0.0`.
- `HEALTHCHECK` hits `/api/health`.
- `.dockerignore` excludes every `.*.json`, `.env*`, `node_modules`, `tests/`, `test-results/`,
  `docs/`, `.git`, `.claude/`.

AC — `scripts/verify-image.sh` (runs locally with Docker; not part of `bun test`):
1. Image builds.
2. Image contains no `.*.json` data files and no `.env` (`docker run --rm … find / -name ".tax-returns.json" -o -name ".env"` → empty).
3. Container started without `ANTHROPIC_API_KEY` exits non-zero with the HM-4 message.
4. Container with valid config becomes `healthy`.
5. Data written via `POST /api/returns` survives `docker compose down && up`.
6. Process runs as non-root.

### HM-11 — Deployment config

- `deploy/docker-compose.yml`: service `taxlens`, `ports: ["127.0.0.1:3005:3005"]`, named volume
  `taxlens-data:/data`, `env_file: .env` (on server only, never committed), `restart: unless-stopped`.
- `deploy/.env.example`: variable names only.
- `deploy/Caddyfile.snippet`: site block with `basic_auth` (placeholder hash), `encode`, security
  headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options: DENY`), `reverse_proxy 127.0.0.1:3005`.
- Real domain, server IP and password hash are **not committed** (public repo). Docs use
  `<TAXLENS_DOMAIN>` / `<OCI_HOST>` placeholders.

AC — `scripts/smoke-hosted.sh <url>` (manual, post-deploy):
1. No credentials → 401.
2. Valid credentials, `GET /api/health` → 200.
3. Valid credentials, cross-site `POST /api/clear-data` → 403.
4. Valid credentials, `POST /api/config/key` → 403.
5. `GET /.env` → 404.
6. Port 3005 not reachable from outside the VM.

### HM-12 — Data migration to the server

- `scripts/push-data-to-server.sh`: copies an explicit allowlist of data files (the same list as
  HM-14) into the `taxlens-data` volume via `ssh` + `docker cp`.
- Refuses if the remote volume already has data unless `--force`; with `--force` it takes a
  dated remote snapshot first.
- Prints a per-file checksum comparison after copying.

AC: dry-run mode (`--dry-run`) lists files and actions without changing anything; tested manually, documented.

### HM-13 — Pushing from Claude Code via SSH tunnel

- `scripts/tunnel.sh`: `ssh -N -L 3005:127.0.0.1:3005 <OCI_HOST>`, with a check that local port
  3005 is free (fails with "stop local dev server first").
- tax-planner's `/parse-return` and `/analyze-taxes` keep posting to `localhost:3005` unchanged;
  `docs/CLAUDE_CODE_IMPORT.md` documents the tunnel step.
- Tunnel requests carry no `Origin`/`Sec-Fetch-Site`, so HM-8 allows them.

AC: manual — with the tunnel up, `curl localhost:3005/api/health` → `{ ok: true }`.

### HM-14 — Backups

- `scripts/backup-to-gdrive.sh` gains `--from-server`: pulls the data files from the volume into
  `~/gdrive/.../taxlens/snapshots/YYYY-MM-DD/`, then updates `latest/`.
- Data-file allowlist is defined **once** (`scripts/data-files.txt`) and shared by HM-12 and HM-14.
  Adds the files the current script misses: `.filing-costs.json`, `.forecast-cache.json`,
  `.forecast-profile.json`.
- Uses `cp` then verifies, never `mv` (rclone mount: `mv` silently fails to delete source).
- Keeps the 30 most recent snapshots.
- Scheduling: manual (decided 2026-10-21). Laptop-driven because the Drive mount lives on the laptop.

AC: a unit-style shell test isn't worth it here; verified manually and documented, including a restore drill (restore a snapshot into a scratch volume and load it).

---

## 6. Design overview

```
Browser ──HTTPS──► Caddy (host systemd)           ← basic_auth, security headers, TLS
                     └─► 127.0.0.1:3005           ← only published on loopback
                           │
                     Docker: taxlens (non-root)
                       TAXLENS_HOSTED=true
                       src/index.ts → resolveServerEnv() → exit 1 on bad config
                                    → createServer()
                                        ├─ request guard (HM-8)
                                        ├─ hosted route blocks (HM-7)
                                        ├─ /api/* routes
                                        └─ static handler /app/dist (HM-5)
                       /data  ← named volume taxlens-data (HM-1 dataPath())

Laptop ──ssh -L 3005──► 127.0.0.1:3005            ← /parse-return, /analyze-taxes (HM-13)
Laptop ◄──ssh + docker cp── /data                 ← backups to ~/gdrive (HM-14)
```

### New environment variables

| Variable | Default | Hosted value | Purpose |
|---|---|---|---|
| `TAXLENS_HOSTED` | unset | `true` | Enables HM-4 validation and HM-7 route blocks |
| `TAXLENS_HOSTNAME` | `127.0.0.1` | `0.0.0.0` (inside container) | Bind address |
| `TAX_UI_DATA_DIR` | `cwd` | `/data` | Existing; now read per call |
| `TAX_UI_STATIC_DIR` | source dir | `/app/dist` | Existing |
| `ANTHROPIC_API_KEY` | from `.env` | from server `.env` | Existing; required in hosted mode |

### New / changed files

| File | Req | Change |
|---|---|---|
| `src/lib/data-dir.ts` (+ test) | HM-1 | new |
| `src/lib/*-cache.ts`, `storage.ts`, `india-storage.ts`, `country-storage.ts`, `forecast-profile.ts`, `retirement-accounts.ts` | HM-1 | use `dataPath()` |
| `tests/setup/isolate-data-dir.ts`, `bunfig.toml` | HM-2 | new preload |
| `src/server.ts`, `src/index.ts`, `tests/helpers/test-server.ts` | HM-3 | factory split |
| `src/lib/hosted-config.ts` (+ test) | HM-4, HM-9 | new |
| `src/server.ts` static handler (+ HTTP tests) | HM-5 | harden + SPA fallback |
| `src/lib/env.ts`, `src/App.tsx` (+ test) | HM-6 | remove hostname sniffing |
| `src/server.ts`, Settings UI | HM-7 | hosted route blocks |
| `src/lib/request-guard.ts` (+ test) | HM-8 | new |
| `Dockerfile`, `.dockerignore`, `scripts/verify-image.sh` | HM-10 | new |
| `deploy/*`, `scripts/smoke-hosted.sh` | HM-11 | new |
| `scripts/push-data-to-server.sh`, `scripts/data-files.txt` | HM-12 | new |
| `scripts/tunnel.sh` | HM-13 | new |
| `scripts/backup-to-gdrive.sh` | HM-14 | extend |

---

## 7. Implementation order

Dependencies drive the order; each step is red → green → refactor → lint/tsc/unit → commit.

| Step | Req | Depends on | Commit message prefix |
|---|---|---|---|
| 1 | HM-1 + HM-2 | — | `HM-1/HM-2:` (together — the preload is what makes HM-1's tests safe to write) |
| 2 | HM-3 | 1 | `HM-3:` |
| 3 | HM-4 + HM-9 | 2 | `HM-4/HM-9:` |
| 4 | HM-5 | 3 | `HM-5:` |
| 5 | HM-8 | 2 | `HM-8:` |
| 6 | HM-7 | 3 | `HM-7:` |
| 7 | HM-6 | 3 | `HM-6:` |
| 8 | HM-10 | 3–7 | `HM-10:` |
| 9 | HM-11–HM-14 | 8 | `HM-11:` … |
| 10 | Server deploy + `smoke-hosted.sh` | 9 | runbook in `docs/HOSTING.md` |

Checkpoint (per CLAUDE.md) after step 7 (all app code done) and after step 10 (deployed).

## 8. Test strategy

| Layer | Tool | Runs in | Covers |
|---|---|---|---|
| Unit | `bun test` | every commit | HM-1, 2, 4, 6, 8, 9 pure logic |
| HTTP integration | `bun test` + `tests/helpers/test-server.ts` (port 0, temp data dir) | every commit | HM-3, 5, 7, 8, 9 |
| Source-level guards | `bun test` | every commit | HM-1 no module-level data paths, HM-6 no hostname sniffing |
| Container | `scripts/verify-image.sh` | before deploy | HM-10 |
| Deployed smoke | `scripts/smoke-hosted.sh` | after deploy | HM-11 |
| Manual | documented in PROGRESS | per step | dev-server behaviour, tunnel, backup restore drill |

Rules:
- No test may read or write outside a temp dir (enforced by HM-2).
- HTTP tests never call the Anthropic API; hosted test servers use a dummy key.
- Baseline before this work: 207 pass / 2 fail (the HM-1 bug). Target: all green, count recorded in PROGRESS.

## 9. Decisions

| Decision | Alternatives | Why |
|---|---|---|
| Caddy `basic_auth` | Authelia one-factor; app-level login | Same pattern as other sites on the VM, zero app code, works for tunnel too. Authelia's portal currently lives on a paused domain. Upgrade path: swap the Caddy block for `forward_auth` — no app changes. |
| Cross-site protection in the app, not Caddy | Caddy header matchers | Unit-testable; also protects local dev. |
| Disable key/clear routes in hosted mode instead of adding confirmation | Confirmation dialogs; CSRF tokens | Removes the risk entirely; both actions are rare and can be done over SSH. |
| Default bind `127.0.0.1` locally | Keep `0.0.0.0` | Local dev was exposing tax data on the LAN. Behaviour change — noted in CHANGELOG. |
| SSH tunnel for pushes | API token header | No new auth code; skills unchanged. Token can be added later if needed. |
| Build on server | Registry (GHCR) | One machine, one user; avoids registry credentials. |
| Placeholders for domain/IP in repo | Commit real values | Public repo; don't advertise the endpoint. Real values live in the server `.env`/Caddyfile and private notes. |
| Laptop-driven backups | rclone on OCI | Drive mount already exists on laptop; avoids putting a Drive credential on the VM. |

## 10. Risks & rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| HM-1 refactor changes where data is read locally | `filing-costs` default moves from `$HOME` to `cwd` — one-time copy documented | Copy file back |
| HM-9 bind change breaks access from another local device | Documented; set `TAXLENS_HOSTNAME=0.0.0.0` to restore | env var |
| HM-6 breaks the upstream demo site behaviour | Not used by this fork; `DEMO_MODE=true` still works | revert commit |
| Server disk is ~90% full | Prune images/build cache before first build; image target < 400 MB | — |
| Basic Auth brute force | Long random password (20+ chars, password manager). fail2ban deferred (§12). | — |
| Bad deploy | `docker compose` keeps volume; previous image tag retained | `docker compose up -d` with previous tag |

## 11. Documentation deliverables

Updated alongside each step, not at the end:

| Doc | Content |
|---|---|
| `docs/HOSTING.md` | Rewritten as the runbook: prerequisites, first deploy, update, backup/restore, rollback, troubleshooting, secrets locations |
| `docs/ARCHITECTURE.md` | Deployment section, env var table, `server.ts`/`index.ts` split, request guard |
| `CLAUDE.md` | Hosted-mode rules, `dataPath()` rule, test-isolation rule, link to this spec |
| `README.md` | "Self-hosting" section |
| `docs/CLAUDE_CODE_IMPORT.md` | Tunnel step for pushing to the hosted instance |
| `CHANGELOG.md` | New file; `[Unreleased]` → `0.5.0` entries per requirement |
| `docs/PROGRESS.md` | Checkpoint entries |
| This spec | Status → Approved → Implemented; per-requirement ✅ as completed |

## 12. Resolved questions

| Question | Answer (2026-10-21) |
|---|---|
| Domain name | `taxlens.duckdns.org` (confirm availability at deploy; kept out of committed config per §9) |
| Backup schedule | Manual only. The optional `systemd --user` timer in HM-14 is dropped. |
| fail2ban | Deferred to a separate server-hardening task covering all sites on the VM (TaxLens, savvywatch, Wallos, SSH). A long random Basic-Auth password is the control for this round. |

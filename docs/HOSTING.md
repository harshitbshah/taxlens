# Hosting TaxLens — Runbook

How to run TaxLens on a self-hosted VM behind a username/password. Requirements and design
rationale: [`HOSTED_MODE_SPEC.md`](HOSTED_MODE_SPEC.md) (HM-1 … HM-14). Day-to-day use in plain language:
[`USER_GUIDE.md`](USER_GUIDE.md).

This repo is public, so real values never appear here. Placeholders:

| Placeholder | Meaning | Where the real value lives |
|---|---|---|
| `<OCI_HOST>` | VM public IP / SSH host | `deploy/local.env` on the laptop (gitignored) |
| `<TAXLENS_DOMAIN>` | Public hostname (DuckDNS) | `deploy/local.env`; `/etc/caddy/Caddyfile` on the VM |
| `<USERNAME>` / `<BCRYPT_HASH>` | Basic-auth login | hash in `deploy/local.env` + Caddyfile; password in your password manager |
| API key | Anthropic key used by the hosted app | `~/taxlens/deploy/.env` on the VM only (mode 600) |

---

## Architecture

```
Browser ──HTTPS──► Caddy (host systemd, /etc/caddy/Caddyfile)
                     ├─ basic_auth (bcrypt), security headers, automatic Let's Encrypt TLS
                     └─ reverse_proxy 127.0.0.1:3005   ← Host header passed through (HM-8 relies on it)
                                   │
                        Docker container "taxlens" (non-root, image taxlens:latest)
                          TAXLENS_HOSTED=true → config validated at start (HM-4), key/wipe routes off (HM-7)
                          /data ← named volume "taxlens-data"

Laptop ──ssh -L 3005──► 127.0.0.1:3005   scripts/tunnel.sh — /parse-return, /analyze-taxes (HM-13)
Laptop ◄──ssh + tar──── taxlens-data      scripts/backup-to-gdrive.sh --from-server (HM-14)
```

## Where the data lives

TaxLens stores **extracted data only** (JSON). The source PDFs are never uploaded to the server.

| Location | What | Role |
|---|---|---|
| VM: Docker volume `taxlens-data` → `/var/lib/docker/volumes/taxlens-data/_data/` (mounted as `/data` in the container) | All files in `scripts/data-files.txt` (`.tax-returns.json`, `.india-tax-returns.json`, caches, forecast profile, retirement accounts, filing costs) | **Source of truth** once hosted. Parent dir is root-only; files are owned by the container's `bun` user (uid 1000 — the host may display that uid under another name) |
| VM: `~/taxlens/deploy/.env` (mode 600) | `ANTHROPIC_API_KEY` for the hosted app | Kept outside the volume so backups never contain it |
| VM: `~/taxlens-snapshots/*.tar` | Pre-overwrite snapshots from `push-data-to-server.sh --force` | Rollback |
| Laptop: repo root (`./.tax-returns.json`, …) | The pre-hosting local copy | **Stale after the first push.** Local dev still reads it; changes there do not reach the server. Safe to delete once Drive backups exist |
| Google Drive: `…/Tax Return/USA/taxlens/latest/` and `…/taxlens/snapshots/<timestamp>/` | Backups pulled from the VM (`backup-to-gdrive.sh --from-server`, newest 30 kept) | Off-box copy / restore source |
| Google Drive: `…/Tax Return/USA/<year>/`, `…/Tax Return/India/`; laptop: tax-planner `years/<year>/source/` | Original PDFs (W-2s, 1099s, 26AS, filed returns) | Never on the VM. TaxLens only holds numbers extracted from them |

The container publishes **only** `127.0.0.1:3005`. The VM firewall (OCI security list +
iptables) exposes only 22/80/443; `scripts/smoke-hosted.sh` checks 3005 is unreachable.

## Files

| File | Committed | Purpose |
|---|---|---|
| `Dockerfile`, `.dockerignore` | yes | Image (HM-10). `.dockerignore` keeps every `.*.json` and `.env*` out of the build context |
| `deploy/docker-compose.yml` | yes | Service definition (HM-11) |
| `deploy/.env.example` → `deploy/.env` | template only | Server-side `ANTHROPIC_API_KEY` |
| `deploy/Caddyfile.snippet` | yes (placeholders) | Site block to append to `/etc/caddy/Caddyfile` |
| `deploy/local.env.example` → `deploy/local.env` | template only | Laptop-side host, domain, remote dir, basic-auth user + hash |
| `scripts/deploy-wizard.sh` | yes | Human-only steps: choose login, send API key to server |
| `scripts/verify-image.sh` | yes | Image acceptance checks (run locally, needs Docker) |
| `scripts/smoke-hosted.sh` | yes | Post-deploy live checks |
| `scripts/push-data-to-server.sh` | yes | Laptop data → server volume |
| `scripts/tunnel.sh` | yes | SSH tunnel for Claude Code pushes |
| `scripts/backup-to-gdrive.sh` | yes | Backups (local or `--from-server`) |
| `scripts/data-files.txt` | yes | The one list of data files (never `.env`) |

---

## First deploy

Prerequisites: SSH access to the VM as `ubuntu`, Docker + Compose and Caddy installed there,
the DuckDNS name pointing at the VM, Google Drive mounted on the laptop for backups.

1. **Laptop:** `cp deploy/local.env.example deploy/local.env` and fill in host, domain, remote dir.
2. **Laptop:** `./scripts/verify-image.sh` — all checks must pass.
3. **VM:** `git clone https://github.com/harshitbshah/taxlens.git ~/taxlens`
4. **VM:** `cd ~/taxlens && docker build -t taxlens:latest . && docker builder prune -f`
   (disk is tight on the free-tier VM; pruning frees ~1 GB of build cache).
5. **Laptop:** `./scripts/deploy-wizard.sh` — choose the login (hashed locally), store the
   password in your password manager, send the API key to `~/taxlens/deploy/.env`.
6. **VM:** `docker compose -f ~/taxlens/deploy/docker-compose.yml up -d`, then
   `docker ps` should show `taxlens` as `healthy`.
7. **Laptop:** `./scripts/push-data-to-server.sh --dry-run`, then without `--dry-run`.
   Checksums must all print `OK`.
8. **VM — Caddy:**
   ```bash
   sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S)
   # append deploy/Caddyfile.snippet with <TAXLENS_DOMAIN>, <USERNAME>, <BCRYPT_HASH> filled in
   sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   sudo systemctl reload caddy
   ```
   Caddy obtains the TLS certificate on the first request (needs ports 80/443 reachable).
9. **Laptop:** `./scripts/smoke-hosted.sh` — all checks must pass.
10. **Laptop:** `./scripts/backup-to-gdrive.sh --from-server` — first snapshot.

## fail2ban (login attempt limit)

Caddy's `basic_auth` has no attempt limit, so fail2ban watches Caddy's JSON access logs and
blocks an IP on ports 80/443 after **5 wrong passwords within 10 minutes** — 1 hour at first,
doubling for repeat offenders, up to a week. It counts only 401s on requests that *sent*
credentials: a browser's first visit always gets one credential-less 401 before the login prompt,
and those are ignored. Ubuntu's default `sshd` jail is also on.

| Piece | Where |
|---|---|
| Filter | `deploy/fail2ban/caddy-basic-auth.filter.conf` → `/etc/fail2ban/filter.d/caddy-basic-auth.conf` |
| Jail | `deploy/fail2ban/caddy-basic-auth.jail.local` → `/etc/fail2ban/jail.d/caddy-basic-auth.local` |
| Logs watched | `/var/log/caddy/*-access.log` (TaxLens and savvywatch; `log` block in each site) |
| Ban mechanism | nftables table `inet f2b-table` (Ubuntu 24.04 default `banaction = nftables`), hook `input`, before the iptables-nft rules |

**Install / reinstall** (VM):
```bash
sudo apt-get install -y fail2ban
sudo install -m 644 deploy/fail2ban/caddy-basic-auth.filter.conf /etc/fail2ban/filter.d/caddy-basic-auth.conf
sudo install -m 644 deploy/fail2ban/caddy-basic-auth.jail.local /etc/fail2ban/jail.d/caddy-basic-auth.local
# Log files must exist and be owned by caddy BEFORE validating/reloading Caddy:
sudo install -o caddy -g caddy -m 640 /dev/null /var/log/caddy/taxlens-access.log
sudo systemctl restart fail2ban
sudo fail2ban-regex /var/log/caddy/taxlens-access.log /etc/fail2ban/filter.d/caddy-basic-auth.conf
```

**Check / unban** (VM):
```bash
sudo fail2ban-client status caddy-basic-auth        # failures and current bans
sudo fail2ban-client set caddy-basic-auth unbanip <IP>
```
Locked yourself out after mistyping? SSH still works (only 80/443 are blocked) — unban as above,
or wait an hour. **Test a ban safely** with the reserved address `192.0.2.123`, never your own IP.

**Gotcha (hit on 2026-10-21):** `sudo caddy validate` opens the configured log files, creating
them root-owned; the following `systemctl reload caddy` then fails with "opening log writer".
Caddy keeps serving the previous config, so nothing goes down — fix with
`sudo chown caddy:caddy /var/log/caddy/*-access.log` and reload.

## Updating the app

```bash
# VM
cd ~/taxlens && git pull
docker tag taxlens:latest taxlens:previous        # rollback point
docker compose -f deploy/docker-compose.yml up -d --build
docker builder prune -f
# Laptop
./scripts/smoke-hosted.sh
```

Data lives in the `taxlens-data` volume and survives rebuilds (verified by `verify-image.sh`).

## Rollback

```bash
# VM — previous image
docker tag taxlens:previous taxlens:latest
docker compose -f ~/taxlens/deploy/docker-compose.yml up -d --no-build
# VM — previous Caddy config
sudo cp /etc/caddy/Caddyfile.bak-<timestamp> /etc/caddy/Caddyfile && sudo systemctl reload caddy
# VM — previous data (snapshots made by push-data-to-server.sh --force)
docker run --rm -i -v taxlens-data:/data --entrypoint sh taxlens:latest -c 'tar -xf - -C /data' < ~/taxlens-snapshots/<file>.tar
```

## Pushing new returns from Claude Code (tax-planner)

`/parse-return` and `/analyze-taxes` POST to `http://localhost:3005`. With hosted mode, the
server copy is the source of truth:

```bash
./scripts/tunnel.sh          # stop the local dev server first; Ctrl-C closes the tunnel
# in another terminal / Claude Code session:
/parse-return 2026
```

Tunnel requests skip Caddy (no password needed — SSH is the authentication) and carry no
browser headers, so the cross-site guard allows them.

## Backups (manual)

```bash
./scripts/backup-to-gdrive.sh --from-server
```

Writes `…/Tax Return/USA/taxlens/snapshots/<timestamp>/` and refreshes `…/taxlens/latest/`.
Keeps the newest 30 snapshots. The volume is mounted read-only for the export.

**Restore drill** (do once after the first backup):
```bash
docker volume create taxlens-restore-test
cat latest/.tax-returns.json | ssh <OCI_HOST> "docker run --rm -i -v taxlens-restore-test:/data --entrypoint sh taxlens:latest -c 'cat > /data/.tax-returns.json'"
# start a throwaway container on another port against that volume and load the app, then:
docker volume rm taxlens-restore-test
```

## Rotating secrets

- **Login password:** re-run `./scripts/deploy-wizard.sh` (stage 1), update the hash in
  `/etc/caddy/Caddyfile`, `caddy validate`, `systemctl reload caddy`.
- **API key:** revoke it in the Anthropic console, re-run the wizard (stage 2), then
  `docker compose -f ~/taxlens/deploy/docker-compose.yml up -d --force-recreate`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Container exits immediately, logs say "TaxLens refused to start" | HM-4 config validation — the log lists every problem. Usually `deploy/.env` missing or empty |
| Browser shows sample data | Should be impossible after HM-6; check `/api/config` returns `isDemo: false` |
| `403 Cross-site request blocked` from the app itself | Reverse proxy not passing the original `Host` header (Caddy does by default — check for `header_up Host` overrides) |
| `403 Disabled in hosted mode` | Expected for key changes / reset / browser-supplied keys — do these over SSH |
| TLS error on first visit | Caddy hasn't issued the certificate yet; check `journalctl -u caddy` and that 80/443 are open |
| Your own connection suddenly can't reach any of your sites | Likely a fail2ban ban after mistyped passwords — `sudo fail2ban-client status caddy-basic-auth`, then `unbanip` |
| `smoke-hosted.sh` "port 3005 reachable" fails | Compose `ports` must be `127.0.0.1:3005:3005`, never `3005:3005` |
| Disk full during build | `docker builder prune -f`; `docker image prune` |

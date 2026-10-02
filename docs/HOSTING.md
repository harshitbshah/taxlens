# TaxLens → OCI Migration Plan

**Goal:** Host taxlens at `https://taxlens.duckdns.org` on the existing OCI VM, protected by the existing Authelia instance (TOTP), with persistent data and zero code changes to the app.

---

## Architecture

```
Browser
  └─► taxlens.duckdns.org:443 (OCI public IP)
        └─► Caddy (existing reverse proxy)
              ├─► forward_auth ──► Authelia container (existing, port 9091)
              └─► reverse_proxy ──► taxlens container (new, port 3005)
                                          └─► /data volume (Docker named volume)
```

---

## Prerequisites

- [ ] `taxlens.duckdns.org` registered at duckdns.org → same OCI VM public IP
- [ ] Anthropic API key on hand
- [ ] SSH access to OCI VM
- [ ] taxlens repo cloned on OCI VM (or Docker image pushed to a registry)

---

## Phase 1 — App: Dockerize taxlens (~45 min)

**1.1 Write `Dockerfile`** in the taxlens repo root:
- Base image: `oven/bun:1` (multi-stage: build → runtime)
- Build stage: `bun install` + `bun run build` (produces `dist/`)
- Runtime stage: copy `src/`, `dist/`, `node_modules/`, config files
- `ENV TAX_UI_DATA_DIR=/data` and `ENV NODE_ENV=production`
- `EXPOSE 3005`, `CMD ["bun", "src/index.ts"]`

**1.2 Add `taxlens` service to existing `docker-compose.yml` on OCI:**
```
service:  taxlens
image:    built from repo (or registry)
env:      ANTHROPIC_API_KEY (from .env or OCI secret)
          TAX_UI_DATA_DIR=/data
          NODE_ENV=production
volume:   taxlens-data:/data
network:  caddy-net (same network as Caddy)
restart:  unless-stopped
```

**1.3 Migrate existing data** (one-time, before first run):
- Copy `.tax-returns.json`, `.india-tax-returns.json`, and any cache JSONs from local machine into the Docker volume

---

## Phase 2 — DNS (~5 min)

- Log in to duckdns.org → add new domain `taxlens` → set IP to OCI VM public IP
- Same IP as `mymindpalace` — Caddy already listens on 443 and will route by hostname

---

## Phase 3 — Authelia: add second cookie domain (~20 min)

Edit `~/authelia/configuration.yml` on OCI VM (sudo required):

**3.1 Add second session cookie block:**
```yaml
session:
  cookies:
    - domain: mymindpalace.duckdns.org   # existing, untouched
      name: authelia_session
      authelia_url: https://mymindpalace.duckdns.org/authelia
    - domain: taxlens.duckdns.org         # new
      name: authelia_session_taxlens
      authelia_url: https://mymindpalace.duckdns.org/authelia  # login portal stays on mindpalace
```

**3.2 Add access control rule:**
```yaml
access_control:
  rules:
    - domain: taxlens.duckdns.org
      policy: two_factor
```

**3.3 Restart Authelia container**

---

## Phase 4 — Caddy: add site block (~20 min)

Append to existing Caddyfile:
```
taxlens.duckdns.org {
    forward_auth authelia:9091 {
        uri /authelia/api/authz/forward-auth
        copy_headers Remote-User Remote-Groups Remote-Name Remote-Email
        header_up Host {host}
    }
    reverse_proxy taxlens:3005
}
```

Reload Caddy — it auto-provisions a TLS cert for `taxlens.duckdns.org` via Let's Encrypt.

---

## Phase 5 — Deploy & Smoke Test (~30 min)

1. `docker compose up -d taxlens` on OCI VM
2. Navigate to `https://taxlens.duckdns.org` → should redirect to Authelia login
3. Log in with TOTP → should land on taxlens app
4. Verify existing tax returns load from volume
5. Test PDF upload → Claude parse → data persists after container restart

---

## Data Backup (ongoing)

The Docker volume (`taxlens-data`) holds all state. Suggested cron on OCI VM:
```bash
# daily: copy taxlens data to gdrive
docker run --rm -v taxlens-data:/data -v ~/gdrive/Backups:/backup \
  alpine cp /data/.tax-returns.json /data/.india-tax-returns.json /backup/
```

---

## Risk & Rollback

| Risk | Mitigation |
|---|---|
| `taxlens.duckdns.org` unavailable | Check availability first; fallback name (e.g. `harshittaxlens`) |
| Authelia multi-cookie config breaks existing site | Edit is additive; existing cookie block is untouched; rollback = remove new block + restart |
| Data lost on first deploy | Migrate data *before* starting container; keep local copy as backup |
| Anthropic API key exposed | Pass via env file, never bake into image |

---

## Effort Summary

| Phase | Time |
|---|---|
| Dockerfile + compose | 45 min |
| DuckDNS registration | 5 min |
| Authelia config | 20 min |
| Caddy config | 20 min |
| Deploy + test | 30 min |
| **Total** | **~2 hours** |

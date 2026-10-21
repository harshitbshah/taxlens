# TaxLens — Your Hosted Setup: User Guide

A plain-language guide to using and looking after **your own hosted TaxLens**. For what each
screen does (Summary, By Year, Forecast, Chat…), see the **User Guide** section of the
[README](../README.md#user-guide). For the exact commands an operator runs, see
[`HOSTING.md`](HOSTING.md).

> This repo is public, so this guide never shows your real web address, server IP or
> password. Your address and server are in `deploy/local.env` on your laptop
> (`TAXLENS_DOMAIN`, `TAXLENS_SSH_HOST`); your password is in your password manager.

---

## 1. What you have

- TaxLens runs on your own cloud server (the OCI VM that also runs Wallos and your other sites).
- You open it in any browser, on any device, at `https://<your TaxLens address>`.
- A **username and password** stand in front of it. Without them, nobody sees anything — not
  even that TaxLens is there.
- The connection is encrypted (HTTPS). The certificate renews itself.
- The server's copy of your data is now **the real one**. Your laptop's old copy is out of date.

```
Your phone / laptop ──HTTPS + password──► your server ──► TaxLens ──► your tax data
Your laptop ──SSH tunnel──► TaxLens            (used by Claude Code to add new returns)
Your laptop ◄──backup──── your server ──► Google Drive
```

---

## 2. Opening TaxLens

1. Go to `https://<your TaxLens address>`.
2. The browser shows a login box. Username: **harshit**. Password: from your password manager.
3. Let the browser remember it if you like. It will stay logged in until you close the browser.

**On your phone:** open the address in Chrome or Safari → *Share / ⋮ menu* → **Add to Home
Screen**. It then opens like an app.

**Forgot the password?** Nothing is lost — your data isn't tied to it. On your laptop run
`./scripts/deploy-wizard.sh` (in a normal terminal, not through Claude), choose a new password,
then ask Claude to "update the TaxLens password in Caddy".

---

## 3. What's different from running it on your laptop

| You'll notice | Why |
|---|---|
| No **Reset data** option in the menu | Wiping everything from a browser is too risky on the internet. Done over SSH if ever needed. |
| You're never asked for an API key | The server has its own key (`taxlens-hosted`). It can't be changed from the browser. |
| A message *"Disabled in hosted mode"* | You tried one of the blocked actions above. Expected. |
| A message *"Cross-site request blocked"* | Something tried to change data from another website. Expected — it's the protection working. If TaxLens itself shows this, see §10. |
| A message *"Couldn't load your tax data"* | The page couldn't reach the server (server restarting, or offline). Reload in a minute. TaxLens never shows sample data in place of yours. |

---

## 4. Adding a new tax year

You have two ways. Pick one per return.

### Option A — Upload the PDF in the browser (simplest)
1. Open TaxLens and log in.
2. US: **Add return** in the sidebar menu → choose the PDF. India: switch to 🇮🇳, then **Import India ITR**.
3. Wait 30–90 seconds while Claude reads it.

Uses the server's Anthropic key, so it costs a little per return (cents to a dollar or so).

### Option B — Claude Code from tax-planner (free, more accurate checks)
Best right after you've filed, when tax-planner already has everything.
1. On your laptop, **stop** any local TaxLens (`bun run dev`) if it's running.
2. In a terminal: `cd ~/Projects/taxlens && ./scripts/tunnel.sh` — leave it open.
3. In Claude Code (tax-planner): `/parse-return <year>`, then `/analyze-taxes <year>`.
4. Close the tunnel with **Ctrl-C**.

Either way, **run a backup afterwards** (§6).

---

## 5. Things to redo once (after the 2026-10-21 move)

- **Forecasts:** open **Forecast** for US and for India and click **Generate** — the old cached
  forecasts were deleted by a bug in the test suite (now fixed).
- **2025 India filing costs:** re-enter the Zerodha charges (Cost of Compliance) — they were
  removed after the same bug wrote fake numbers.

---

## 6. Backups

Your data on the server is backed up to Google Drive **only when you run it** (manual by choice).

**When:** after adding a return or making changes, and before any app update.

**How:** on your laptop (Google Drive must be mounted — check with `ls ~/gdrive`):
```bash
cd ~/Projects/taxlens
./scripts/backup-to-gdrive.sh --from-server
```

**Where it goes:** Google Drive → `Important Documents/Documents/Tax Return/USA/taxlens/`
- `latest/` — always the newest backup
- `snapshots/<date-time>/` — one folder per backup, the newest 30 kept

(The files start with a dot, so they're hidden — press **Ctrl+H** in the file browser.)

**Restoring** from a backup: ask Claude to "restore TaxLens from the Drive snapshot of
<date>". The steps are in [`HOSTING.md`](HOSTING.md#rollback).

---

## 7. Where your data lives

| Place | What's there | Notes |
|---|---|---|
| Your server | The real, current data (numbers extracted from your returns) | Only root can read the folder |
| Google Drive `…/taxlens/` | Backups of the above | As fresh as your last backup |
| Your laptop, `~/Projects/taxlens/` | The **old** pre-hosting copy | Out of date; local TaxLens still reads it. Safe to delete later |
| Google Drive `…/Tax Return/USA/<year>/`, `India/`; tax-planner `years/<year>/source/` | The **original PDFs** | Never uploaded to the server |

The full table is in [`HOSTING.md` → Where the data lives](HOSTING.md#where-the-data-lives).

---

## 8. Updating TaxLens after code changes

When Claude (or you) changes the TaxLens code:
1. **Back up first** (§6).
2. Ask Claude to "deploy the latest TaxLens to the server". It will pull the code on the server,
   keep the current version as a rollback point, rebuild, and restart. Your data is untouched.
3. Run the check yourself, in a normal terminal (it asks for your password):
   ```bash
   cd ~/Projects/taxlens && ./scripts/smoke-hosted.sh
   ```
   You want **13 passed, 0 failed**.

If something's wrong, ask Claude to "roll back TaxLens to the previous version".

---

## 9. Changing the password or the API key

- **Password:** run `./scripts/deploy-wizard.sh` in a normal terminal (stage 1), then ask Claude
  to update Caddy. Minimum 8 characters; 16+ recommended (see §11).
- **API key** (e.g. if you think it leaked): revoke `taxlens-hosted` at
  console.anthropic.com → API keys, create a new one, run the wizard (stage 2), then ask Claude
  to restart TaxLens.

**Never paste your password or API key into a Claude chat**, and don't run the wizard or the
smoke test with `!` inside Claude Code — that would copy what's on screen into the conversation.

---

## 10. If something goes wrong

| What you see | What to do |
|---|---|
| Login box keeps reappearing | Wrong username/password. Username is `harshit`. Five wrong tries in 10 minutes blocks you for an hour (§11). |
| None of your sites load from home, but work on mobile data | You were blocked by fail2ban after wrong passwords. Wait an hour or ask Claude to unban your IP. |
| *"Couldn't load your tax data"* | Wait a minute and reload. If it persists, ask Claude to "check the TaxLens container on the server". |
| Browser warns the site isn't secure | Rare — certificate renewal problem. Ask Claude to check Caddy. |
| *"Cross-site request blocked"* when using TaxLens normally | Shouldn't happen. Ask Claude — the proxy may have stopped passing the right header. |
| Data looks old after adding a return via Claude Code | You probably had the local dev server running instead of the tunnel. Stop it, open `tunnel.sh`, re-run `/parse-return`. |
| Server disk full | Ask Claude to clean up Docker on the server. (`~/.openclaw` uses ~17 GB — your call.) |

More detail: [`HOSTING.md` → Troubleshooting](HOSTING.md#troubleshooting).

---

## 11. How safe is it? (plain words)

- **Who can see your data:** only someone with your username *and* password, or with SSH access
  to your server.
- **What's on the server:** the numbers TaxLens extracted. Not your PDFs, so no SSNs from the
  source documents.
- **What's protected even if someone gets past the password:** they can't change your API key,
  can't wipe all data from the browser, and can't download the raw data files.
- **Password guessing is limited:** after 5 wrong passwords in 10 minutes, that internet
  address is blocked from all your sites for an hour (longer if it keeps happening). Typing a
  wrong password once or twice is fine. If you lock yourself out, wait an hour or ask Claude to
  "unban my IP in fail2ban" — SSH still works while a ban is on.
- **The code is public on GitHub** (it's a fork). Your tax data files have never been in it.

---

## 12. Yearly routine (Jan–Apr)

1. **Jan:** collect documents into tax-planner `years/<year>/source/` (and Drive).
2. **Feb–Apr:** file using tax-planner (simulation → FreeTaxUSA). FBAR separately.
3. **After filing:** add the year to TaxLens (§4, Option B), then **back up** (§6).
4. **Jul–Dec:** file the India ITR to recover over-withheld TDS (FY deadline Jul 31; belated by Dec 31).

---

## 13. Open to-dos

- [x] Set up fail2ban for Caddy (§11) — done 2026-10-21
- [ ] Regenerate forecasts; re-enter 2025 India filing costs (§5)
- [ ] Rehearse a restore from a Drive snapshot once
- [ ] Decide on the public repo (see private notes)
- [ ] Round 2: bring tax-planner (filing notes, open items, document links) into TaxLens

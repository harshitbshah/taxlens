# Taxes

Tax return PDF parser using Claude API and Bun.

## Stack

- Bun with HTML imports (React frontend)
- Anthropic SDK for PDF parsing
- Tailwind CSS v4
- Zod for schema validation

## Commands

- `bun run dev` — Start dev server with HMR
- `bun run build` — Production build
- `bun run screenshots` — Capture all README screenshots via Playwright (dev server must be running with real data)

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — full system architecture, data flow, component map, model usage
- [`docs/FORECAST_SPEC.md`](docs/FORECAST_SPEC.md) — AI forecast + insights feature spec (5 phases, test requirements per phase)
- [`docs/FEATURES.md`](docs/FEATURES.md) — full feature backlog
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — session-by-session progress log
- [`docs/ADDING_COUNTRY_CONSTANTS.md`](docs/ADDING_COUNTRY_CONSTANTS.md) — how to add tax constants for a new country
- [`docs/ADDING_COUNTRY.md`](docs/ADDING_COUNTRY.md) — full guide to onboarding a new country (schema, parser, server plugin, client plugin, registration)
- [`docs/HOSTING.md`](docs/HOSTING.md) — OCI hosting plan (deferred)

## Architecture

### Country plugin system (added 2026-03-28)
- `src/lib/country-registry.ts` — `CountryServerPlugin` (server-only: parsing, storage, AI) and `CountryClientPlugin` (browser-only: React components) interfaces
- `src/countries/us/index.ts` + `views.tsx` — US server + client plugins
- `src/countries/india/index.ts` + `views.tsx` — India server + client plugins
- `src/countries/index.ts` — `SERVER_REGISTRY` (keyed by code, server-side)
- `src/countries/views.ts` — `CLIENT_REGISTRY` (keyed by code, browser-side)
- `src/lib/country-storage.ts` — generic storage using plugin.storageFile + schema + migrateReturn?
- To add a new country: see `docs/ADDING_COUNTRY.md`

### Server
- `src/index.ts` — Bun.serve() routes. Generic `/api/:country/*` routes serve all registered countries. US legacy routes (`/api/returns`, `/api/parse`, `/api/extract-year`) kept for backward compat and first-time key setup.
- `src/lib/storage.ts` — US returns + API key persistence; includes `migrate()` for old stored data (backfills missing array fields)
- `src/lib/india-storage.ts` — still used by `scripts/import-india.ts` CLI; app routes use generic storage now

### US returns
- `src/lib/parser.ts` — Claude API PDF parsing (two-pass Sonnet, reconcile() post-validation)

### India returns
- `src/lib/india-parser.ts` — ITR parsing: Haiku form-type detection, single-pass for ITR-1, two-pass Sonnet for ITR-2+; proactive token budget (60s sliding window on actual response.usage) to prevent 429s
- `src/lib/pdf-utils.ts` — `unwrapIfJavaSerialized()`: Indian IT portal wraps PDFs in Java object serialization (magic bytes `aced0005`); extracts real PDF by scanning for `%PDF`/`%%EOF`
- `src/lib/prompt.ts` — ITR-1 and ITR-2 extraction prompts; ITR-1 has no capital gains, 3% cess ≤AY2018-19, 4% from AY2019-20
- `scripts/import-india.ts` — CLI: parse India PDFs and save to `.india-tax-returns.json`

### Frontend
- `src/App.tsx` — React entry; `ActiveCountry = string`; `countryReturns: Record<string, Record<number, unknown>>` state; fetches all registered non-US countries on startup; `handleUploadCountryReturn(country, file)` / `handleDeleteCountryReturn(country, year)` generic handlers; `forecastProfiles: Record<string, ForecastProfile>` for per-country forecast inputs

### Forecast profile (US only)
- `src/lib/forecast-profile-schema.ts` — browser-safe: `ForecastProfile` type, `countFilledFields()`, `confidenceLevel()`. Import this in client components.
- `src/lib/forecast-profile.ts` — server-only (Bun I/O): `getForecastProfile(country)`, `saveForecastProfile(country, profile)`. Never import in browser code.
- `src/components/ForecastProfilePanel.tsx` — slide-in panel; shown as flex sibling to forecast content when `isUs && isPanelOpen`
- `/api/forecast-profile` GET/POST — reads/writes `.forecast-profile.json` in DATA_DIR
- `FORECAST_PROMPT_VERSION` in `forecast-cache.ts` — bump this whenever forecast prompt logic changes significantly to auto-invalidate stale caches

### Sidebar behaviour
- `onOpenStart` in Sidebar is country-aware: India tab triggers file input, other countries open onboarding modal. `onUploadIndia` prop no longer exists — do not re-add it.

### E2E tests
- `playwright.config.ts` — targets localhost:3005; `testMatch: "**/*.pw.ts"` keeps Playwright files invisible to `bun test`
- `tests/e2e/smoke.pw.ts` — functional smoke tests (app loads, nav, country UI, forecast, chat)
- `tests/e2e/screenshots.pw.ts` — screenshot capture script; run with `bun run screenshots`; outputs to `docs/screenshots/`

### Tax constants
- `src/lib/constants/` — per-country modules; each owns its type, data, getter, and prompt formatter
  - `shared.ts` — `BracketEntry` primitive
  - `us.ts` — `UsYearConstants`, `getUsConstants(year)`, `formatUsConstantsForPrompt(c)` — IRS data 2018–2026
  - `india.ts` — `IndiaYearConstants`, `getIndiaConstants(financialYear)`, `formatIndiaConstantsForPrompt(c)` — Income Tax India data FY 2018–2025 (both regimes, surcharge, cess, deduction caps)
  - `index.ts` — re-exports all registered countries
- To add a new country: see `docs/ADDING_COUNTRY_CONSTANTS.md`

## Components

Use shared components from `src/components/` instead of raw HTML:
- `Button` — all buttons (variants: primary, secondary, ghost, outline, danger, pill)
- `Dialog` — modals and dialogs (wraps Base UI Dialog)
- `Menu` / `MenuItem` — dropdown menus
- `Tooltip` — hover tooltips
- `Tabs` — use `@base-ui/react/tabs` for tab navigation

When adding new UI patterns, check if Base UI has a primitive first: https://base-ui.com

## Patterns

### Modal State
Use a single union state for mutually exclusive modals:
```tsx
const [openModal, setOpenModal] = useState<"settings" | "reset" | null>(null);
```
Not separate booleans for each modal.

## Parser and reconciliation

`src/lib/parser.ts` sends PDF pages to Claude Sonnet via the Anthropic SDK and extracts
structured data into `TaxReturn` (Zod schema). After extraction, `reconcile()` runs to
correct summary fields and catch large AI errors.

### What reconcile() does and why

**federal.refundOrOwed** — recomputed from `sum(payments) + sum(credits) - tax - sum(additionalTaxes)`.
- If diff > $1,000: AI likely missed line 37/35a entirely (caught a real $18,682 omission in 2024). Override.
- If diff < $1,000: likely Schedule 2 double-counting (parser extracts sub-items Medicare/NIIT
  AND the Schedule 2 line 21 total). Keep AI value, warn only.

**summary fields** — always recomputed from canonical sources, never trusted from AI:
- `federalAmount = federal.refundOrOwed`
- `stateAmounts` synced from `states[].refundOrOwed`
- `netPosition = federalAmount + sum(stateAmounts)`

### What reconcile() does NOT do (and why)

**income.total** — NOT recomputed from `sum(income.items)`.
The items array includes display-only entries not part of 1040 line 9: qualified dividends
(line 3a, a subset of ordinary dividends) and non-taxable pension/rollover gross amounts.
The AI's extracted total correctly matches 1040 line 9.

**federal.taxableIncome** — NOT recomputed from `agi - sum(deductions)`.
Some deductions are above-the-line (already baked into AGI, e.g. 2020 COVID charitable $300
on line 10b). Double-subtracting produces the wrong result. AI value matches 1040 line 15.

**State refundOrOwed** — NOT validated by formula.
The `adjustments` field mixes credits that reduce tax directly (NJ-COJ, NY credit for other
jurisdictions) with deductions that reduce taxable income. Any arithmetic formula produces
only false positives. State bottom-line values must be trusted from the AI extraction.

### Validation script

`scripts/validate-returns.ts` — runs `reconcile()` against all stored returns and prints
warnings. Use after any parser changes or manual JSON edits:
```
bun run scripts/validate-returns.ts
```

### Known data quirks in .tax-returns.json

- Qualified dividends appear as a separate income item in all years but are a subset of
  ordinary dividends (informational only). The income.total is still correct.
- 2020 pension/annuity $6,039 in income items was a non-taxable rollover (line 5b blank).
  income.total is still correct.
- 2021 additionalTaxes contains Medicare ($88) + NIIT ($47) + Schedule 2 total ($135),
  where the total already includes the sub-items. The refundOrOwed value is correct ($-2,050
  from 1040 line 37); the formula would over-subtract by $135.

## Code Style

- No comments that explain *what* code does — use clear naming instead.
- "Why" comments are allowed and encouraged when logic is non-obvious, references a specific tax form line (e.g. `// 1040 line 9`), or would otherwise be incorrectly "fixed" by someone reading it cold.
- Narrative explanations of architecture or decisions belong in `CLAUDE.md` or `docs/` — not in source.

## Testing

Every non-trivial change requires tests:
- New logic → unit test in `src/lib/__tests__/` or alongside the file
- Route/API change → integration test in `tests/`
- Pure UI-only or display-only components may skip tests

Run before committing:
- `bun run lint` (includes Prettier formatting checks)
- `bunx tsc --noEmit`

## Security

This is a public repo. Never commit or push:
- `.tax-returns.json` (already in `.gitignore` — user's actual tax data)
- `.env` or any file containing API keys
- Any file with PII, SSNs, account numbers, or real dollar amounts from actual returns

## Checkpoint

When the user says "checkpoint", do all of the following in order:

1. Add an entry to `docs/PROGRESS.md` — what was done, decisions made and why, known gaps, and what's next. Then update `CLAUDE.md` and any other relevant `docs/` files to reflect current state
2. Update memory files (`~/.claude/projects/.../memory/`) with any session learnings, decisions, or gotchas not already captured
3. Ensure tests exist and pass for all changes made since the last checkpoint
4. Run `bun run lint` and `bunx tsc --noEmit`
5. Verify no sensitive files are staged (`git status` — check against `.gitignore` before adding)
6. Commit all changes with a clear message summarizing what was done
7. Push to remote

The goal is that the next session can resume with full context from docs alone, with no rediscovery needed.

## Verification

After changes, run lint and type check:
- `bun run lint` (includes Prettier formatting checks)
- `bunx tsc --noEmit`

Do NOT run `bun run build` — the dev server uses HMR so builds are unnecessary during development.

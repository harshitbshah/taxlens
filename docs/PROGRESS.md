# Progress Log

One entry per checkpoint. Most recent first.

---

## 2026-04-11 (SOLID refactoring + Analysis tab: Claude Code generates, TaxLens renders)

**Done:**

**SOLID refactoring (`SummaryCharts.tsx`, `MainPanel.tsx`, `App.tsx`):**
- `GainLossBarChart` extracted in `SummaryCharts.tsx` — eliminated ~150 lines of duplicated recharts boilerplate; all three charts (Refund/Owed, Capital Gains, Tax-Advantaged P&L) now use it.
- `usReturns` removed from `CommonProps` in `MainPanel.tsx`; replaced with `activeReturns as Record<number, TaxReturn>` cast gated by `isUs`.
- `retirementAccounts?` / `onSaveRetirementAccounts?` moved out of `CommonProps` — now only on `ReceiptProps` and `SummaryProps` where they're actually needed.
- `App.tsx`: split `commonProps` into lean base (4 fields) + `usViewProps`; `usViewProps` only spread on summary/receipt renders.

**Analysis tab ("Claude Code generates, TaxLens renders" pattern):**

Architecture decision: dropped the original 6-sequential-Haiku-call analyzer.ts approach entirely. Claude Code subscription tokens are effectively free; a locally-run Claude Code session produces richer, more contextual analysis than any automated pipeline. TaxLens is now a pure viewer — it renders pre-generated JSON, makes no AI calls for analysis.

- **`src/lib/analysis-schema.ts`** (NEW) — `AnalysisSectionId`, `AnalysisSection`, `AnalysisResponse` types; `source: "claude_code" | "api"` audit trail; `parseAnalysisResponse(raw: unknown)` validator.
- **`src/lib/analysis-cache.ts`** (NEW) — `getAnalysisCache`, `saveAnalysisCache`, `clearAnalysisCache`; CACHE_FILE is a function (not module-level const) so `process.env.TAX_UI_DATA_DIR` override in tests works correctly.
- **`src/lib/analysis-schema.test.ts`** (NEW) — 18 tests; `parseAnalysisResponse` validation (8 cases) + cache operations (10 cases) with `mkdtemp`/`rm` isolation per test.
- **`src/components/AnalysisPanel.tsx`** (NEW) — states: loading | empty | loaded | error; empty state has "Copy prompt for Claude Code" (auto-builds prompt with return JSON + schema + POST URL), "Paste JSON" dialog; loaded state renders collapsible `SectionCard`s in canonical order via `react-markdown` + `remark-gfm`; "⟳ Regenerate" clears cache → empty state.
- **`src/components/MainPanel.tsx`** — added `"analysis"` to `YearViewMode`; `AnalysisPanel` rendered from MainPanel (not from country plugin views — it needs `year`, `country`, `returnData` props that don't fit the `{ data: unknown }` plugin shape).
- **`src/index.ts`** — `/api/analysis` GET/POST/DELETE route + `POST /api/returns` and `POST /api/:country/returns` import paths for Claude Code-generated return JSON.
- **`.gitignore`** — added `.analysis-cache.json`.
- **`docs/ANALYSIS_SPEC.md`** — full rewrite capturing the architectural decision and "Claude Code generates, TaxLens renders" design.
- **`docs/CLAUDE_CODE_IMPORT.md`** (NEW) — broader pattern doc; POST endpoint designs; `/parse-return` and `/analyze-taxes` skill specs.

**Decisions:**
- No `analyzer.ts`, no rate limiting, no prompt versioning for analysis — generation is external. ~4 days of planned work eliminated.
- `CACHE_FILE` as a function so env-var test override works (module-level consts are evaluated at import time, before `beforeEach` sets `TAX_UI_DATA_DIR`).
- AnalysisPanel in MainPanel (not plugin views) because its props are structural (`year`, `country`, `returnData`), not country-specific display.
- `source` field in `AnalysisResponse` as audit trail: "claude_code" vs "api". No prompt versioning needed — generation happens outside TaxLens.

**Known gaps:**
- `.claude/commands/parse-return.md` and `.claude/commands/analyze-taxes.md` Claude Code skills not yet written.
- 2025 ANALYSIS.md (in tax-planner project) not yet converted to `AnalysisResponse` JSON and POSTed — first real use of the tab pending.

**Next:** Convert 2025 ANALYSIS.md → AnalysisResponse JSON, POST to populate the tab. Write Claude Code skill files. Items from FEATURES.md.

---

## 2026-03-29 (Forecast profile panel, Sidebar fix, Playwright E2E, README overhaul)

**Done:**

**Forecast profile panel (US only):**
- **`src/lib/forecast-profile-schema.ts`** (NEW) — browser-safe types + utilities: `ForecastProfile` type, `TOTAL_PROFILE_FIELDS = 7`, `countFilledFields()`, `confidenceLevel()`. Split from server module to prevent `process is not defined` runtime error in browser bundle.
- **`src/lib/forecast-profile.ts`** (NEW, server-only) — re-exports schema + adds Bun file I/O: `getForecastProfile(country)`, `saveForecastProfile(country, profile)`. Writes to `.forecast-profile.json` in DATA_DIR.
- **`src/components/ForecastProfilePanel.tsx`** (NEW) — slide-in panel (w-80) with sections: Income (salary1/2, bonusLow/High 1/2, RSU), Retirement (k401_1/2, backdoor Roth radio), Withholding (ytdWithholding + month select + annualized pace), Capital events. "Save & Regenerate" triggers regeneration; "Clear all" resets.
- **`src/lib/forecaster.ts`** — added `buildProfileSection(profile, projectedYear)` injecting known inputs as constraints into prompt (e.g. don't suggest maxing 401k if already at limit). `FORECAST_PROMPT_VERSION` bumped `"3"` → `"4"`.
- **`src/index.ts`** — `/api/forecast-profile` GET/POST route; forecast POST now fetches profile and passes to `generateForecast`.
- **`src/components/ForecastView.tsx`** — `ConfidenceBanner` (filled count, label, toggle button); profile panel shown as flex sibling when `isUs && isPanelOpen`; empty state "add inputs" link.
- **`src/components/MainPanel.tsx`** + **`src/App.tsx`** — profile state (`forecastProfiles: Record<string, ForecastProfile>`), `handleSaveProfile`, passed through to ForecastView.

**Sidebar country-aware menu:**
- Removed `onUploadIndia` prop entirely from `Sidebar`. `onOpenStart` is now country-aware: India tab triggers the file input; other countries open the onboarding modal.
- Menu label is "Import India ITR" on India tab (when `hasUserData`), "Add return" on others, "Get started" when no data.

**Chat bug fix:**
- `effectiveReturns` (US-only) replaced with `activeReturns` (country-scoped) in two places in App.tsx — chat was always sending US data regardless of active country.

**Playwright E2E:**
- `playwright.config.ts` — targets localhost:3005, testDir `./tests/e2e`, `testMatch: "**/*.pw.ts"` (prevents Bun from picking them up).
- `tests/e2e/smoke.pw.ts` — 9 tests: app loads, sidebar nav, country-specific UI (Import India ITR guard), forecast tab, chat toggle.
- `tests/e2e/screenshots.pw.ts` — captures all 8 README screenshots: hero, summary, by-year-receipt, bracket-visualizer, what-if-simulator, insights-panel, forecast, forecast-profile. Setup: 1280×960, chat closed via localStorage, bottom+right fade-to-white overlay for clean crops.
- `package.json` — added `test:e2e` and `screenshots` scripts; `@playwright/test` devDependency.

**README overhaul:**
- Hero image replaced (old brianlovin dark-mode → current TaxLens UI, 1280×960).
- Intro rewritten as a narrative PRFAQ opener: the "file and forget" problem, timing trap, multi-year patterns, accountant gap, then TaxLens as the solution — country-agnostic throughout.
- "Forked from" moved to footnote at bottom.
- "2025 Inputs panel" → "Inputs panel" (de-year-hardcoded).
- "OBBBA" spelled out as "One Big Beautiful Bill Act".
- Forecast inputs panel added to Features list.
- Importing returns section made country-agnostic.
- img dimensions corrected to 1280×960.
- Requirements section expanded with API key link, cost context, scan quality note.
- GitHub repo About description updated: "Your tax history in one place — trends, what-ifs, and a forecast for next year. Runs locally."
- Homepage URL cleared (was pointing to brianlovin's deployment).
- Topics added: taxes, personal-finance, claude, anthropic, typescript, react, bun.

**Decisions:**
- Server/client split for forecast profile: followed existing CountryServerPlugin/CountryClientPlugin pattern. Browser components import from `forecast-profile-schema.ts` only; server imports `forecast-profile.ts`.
- `.pw.ts` extension convention for Playwright tests: cleanly separates E2E from Bun unit tests without needing `bunfig.toml` exclude hacks.
- Screenshot fade-to-white overlay (bottom + right): more intentional than hard crops, signals "more content below/right" without looking broken. Injected via `page.evaluate()` before each capture.
- AI not highlighted as a feature label in README/About description — embedded naturally in the narrative per user preference.

**Known gaps:**
- `scripts/fix-india-tax.ts` is untracked — not committed (likely a one-off migration script, not part of the app).
- Remaining lint warnings in `src/App.tsx` (unused `isUploading`, hook deps) and `src/index.ts` (`any` type, unused `returns`) are pre-existing, not introduced this session.

**Next:** Items from FEATURES.md. India FY 2026 constants after April Union Budget.

---

## 2026-03-28 (Per-country forecasts + forecast cache versioning)

**Done:**

**Per-country forecast split:**
- **`src/lib/forecast-cache.ts`** — rewritten from single `ForecastResponse` to `Record<string, ForecastResponse>` keyed by country code. `getForecastCache(country)`, `saveForecastCache(country, forecast)`, `clearForecastCache(country?)` (no arg deletes file; country arg removes just that key). Backward compat: old root-level `ForecastResponse` format detected via `"projectedYear" in raw` and discarded (treated as stale — see versioning below).
- **`src/lib/forecast-cache.test.ts`** — updated to new per-country signatures; added tests for: multiple countries stored independently, clearing one doesn't affect the other, backward compat, version mismatch.
- **`/api/forecast?country=X`** — GET and POST now scoped to one country. POST passes only `{ [country]: returns }` and `[plugin]` to `generateForecast`. GET returns cached forecast for that country only.
- **`src/App.tsx`** — `forecastStates: Record<string, ForecastState>` replaces single `forecastState`. Lazy-fetched per country via `useEffect` on `[activeCountry, isLoading]`. `handleGenerateForecast` scoped to `state.activeCountry`.
- **`src/lib/forecaster.ts`** — `buildForecastPrompt` reworked for country-awareness: `hasUs` flag controls action category enum (`retirement|withholding` vs `investments|regime_choice|advance_tax`), currency examples ($ vs ₹), and explicit exclusion instruction ("Do NOT mention 401k, IRA, FICA, W-2 withholding...") when India-only. `ForecastResponse.actionItems[].category` expanded to include India categories. `parseForecastResponse` `validCategory` set expanded to match.
- **`src/lib/format.ts`** — added `formatAmount(value, currency, showSign?)` dispatcher: routes to `formatINRCompact` for ₹, `formatCurrency` for $.
- **`src/components/ForecastView.tsx`** — currency-aware via `currency` prop; `fmt = (v) => formatAmount(v, currency)`; `isUs = activeCountry === "us"` gates US-specific UI (bracket bar, "Federal + State" badge, constants status). `IndiaRegimeCard` shown when `data.india` present.
- **`src/components/MainPanel.tsx`** — passes `currency={plugin?.currency ?? "$"}` and `activeReturns` (not hardcoded `usReturns`) to `ForecastView`.
- **`src/countries/india/index.ts`** — `promptInstruction` expanded with explicit India-specific action item categories (80C, 80D, HRA, Section 24, advance tax).
- **`src/components/ActionItemsCard.tsx`** — added icons for India categories: `investments: "📊"`, `regime_choice: "⚖️"`, `advance_tax: "📅"`.

**Forecast cache versioning:**
- **`FORECAST_PROMPT_VERSION = "3"`** in `forecast-cache.ts` — written as `__version` in the cache file on every save. On read, version mismatch (or missing version, including old combined format) causes all cached forecasts to be silently discarded → fresh generation triggered on next visit. Eliminates the class of bug where prompt code changes but the stale pre-change forecast is served indefinitely until manual Regenerate.
- Bumping `FORECAST_PROMPT_VERSION` is the standard procedure whenever the forecast prompt logic changes significantly.

**Root cause of "India forecast showing US content" bug:**
1. Old dev server was running stale code (before per-country split). Restarting the server fixed it.
2. Even with new code, a stale combined forecast cached before the prompt fix could be served. Cache versioning fixes this permanently.

**Tests:** 167 pass (up from 159). New tests cover per-country cache storage, clearing, backward compat, and version mismatch.

**Decisions:**
- Independent per-country forecasts (Option B): US and India taxes are DTAA-independent — India creates FTC on the US return, not a combined liability. Separate forecasts are more useful and simpler.
- Cache version at file level (not per-country): when the prompt changes, all country caches are stale. Per-country versioning would add complexity without benefit.
- Old combined format treated as stale (not migrated to `{ us: <old> }`): the combined forecast was generated with US-biased India prompt code and shouldn't be used.

**Known gaps:**
- `bun --hot` doesn't always reload all modules on file change; users must restart the server after pulling significant changes. No autodetection in place.

**Next:** Items from FEATURES.md, or India FY 2026 constants (add after April Union Budget if needed).

---

## 2026-03-28 (Post-/simplify cleanup)

**Done:**
- **`src/lib/country-storage.ts`** — removed TOCTOU anti-pattern in `clearCountryData`: `file.exists()` check before `Bun.write` replaced with a direct write (file is always created/reset regardless of prior existence).
- **`src/lib/forecaster.ts`** — eliminated repeated per-plugin year extraction in `buildForecastPrompt`: introduced `pluginYears: number[][]` computed once upfront, indexed by plugin position; reused in the history loop (`years = pluginYears[i]`) and for `primaryProjected` (removed third separate `Object.keys(...).map(Number)` pass).

**Tests:** still passing (no logic changed, only efficiency/correctness fixes)

---

## 2026-03-28 (Country-agnostic plugin architecture — Phases 1–4)

**Done:**

**Phase 1 — Plugin registry (purely additive):**
- **`src/lib/country-registry.ts`** — `CountryServerPlugin` (Bun/AI side) and `CountryClientPlugin` (React side) interfaces. Server plugin: code/name/flag/currency, storageFile, schema, migrateReturn?, getYear, yearLabel, summaryLabel, parseReturn, extractYearFromPdf, buildYearSummary, constants?, forecast?. Client plugin: same identity + year fields, components (YearReceipt, YearCharts, SummaryView, SummaryCharts, SummaryReceipt?), forecast?.ExtensionCard.
- **`src/countries/us/index.ts`** — `usServerPlugin` wrapping existing US parser/constants/schema + `migrateReturn` (backfills missing array fields for old stored data).
- **`src/countries/us/views.tsx`** — `usClientPlugin` wrapping ReceiptView, YearCharts, SummaryTable, SummaryCharts, SummaryReceiptView; `UsBracketCard` forecast extension.
- **`src/countries/india/index.ts`** — `indiaServerPlugin` wrapping india-parser/constants/schema.
- **`src/countries/india/views.tsx`** — `indiaClientPlugin` wrapping IndiaReceiptView, IndiaYearCharts, IndiaSummaryView, IndiaSummaryCharts; `IndiaForecastCard` extension.
- **`src/countries/index.ts`** — `SERVER_REGISTRY` keyed by code; `REGISTERED_COUNTRIES` array.
- **`src/countries/views.ts`** — `CLIENT_REGISTRY` keyed by code.

**Phase 2 — Frontend consumers migrated to registry:**
- **`src/lib/nav.ts`** — generic `buildNavItems(returns, { yearLabel, summaryLabel })` and `getDefaultSelection(returns)`; old per-country wrappers kept as thin delegates.
- **`src/components/Sidebar.tsx`** — `hasIndiaData: boolean` replaced with `activeCountries: string[]`; country toggle loops `CLIENT_REGISTRY` filtered to active codes; any registered country auto-appears.
- **`src/components/MainPanel.tsx`** — `view: "india"` and `IndiaProps` removed; all year views use `view: "receipt"` with `CLIENT_REGISTRY[activeCountry].components.YearReceipt/YearCharts`; summary uses `SummaryView/SummaryCharts/SummaryReceipt`; `StatsHeader` and `InsightsPanel` shown only when `activeCountry === "us"`.
- **`src/App.tsx`** — `ActiveCountry` widened to `string`; nav built via `CLIENT_REGISTRY[activeCountry]`; `activeReturns` computed generically; `activeCountries` computed from all countries with data; `handleSwitchCountry` uses `getDefaultSelection`.

**Phase 3 — Server + AI generalized:**
- **`src/lib/country-storage.ts`** — generic `getCountryReturns / saveCountryReturn / deleteCountryReturn / clearCountryData` using plugin.storageFile + schema + migrateReturn?.
- **`src/index.ts`** — India-specific routes removed; replaced with generic `/api/:country/returns` (GET), `/api/:country/returns/:year` (DELETE), `/api/:country/parse` (POST), `/api/:country/extract-year` (POST) — all driven by `SERVER_REGISTRY[country]`. `/api/clear-data` loops all plugins. `/api/forecast` gathers returns from all plugins via generic storage and passes `activePlugins` to `generateForecast`.
- **`src/lib/forecaster.ts`** — signature changed to `generateForecast(allReturns, activePlugins, apiKey)` and `buildForecastPrompt(allReturns, activePlugins)`; loops plugins for history, constants, schema snippets, and instructions; fixed latent bug where `bracket` was incorrectly required in validation (India-only users).
- **`src/App.tsx`** — `indiaReturns` state replaced with `countryReturns: Record<string, Record<number, unknown>>`; `fetchInitialState` loops all non-US countries from `CLIENT_REGISTRY`; `handleUploadIndiaItr` → `handleUploadCountryReturn(country, file)`; `handleDeleteIndiaReturn` → `handleDeleteCountryReturn(country, year)`; `handleDelete` checks `activeCountry !== "us"` instead of hardcoded `=== "india"`.
- **`.gitignore`** — added `.india-tax-returns.json`, `.canada-tax-returns.json`, `.insights-cache.json`, `.forecast-cache.json`.

**Phase 4 — Contributor guide:**
- **`docs/ADDING_COUNTRY.md`** — full step-by-step walkthrough with Canada as example: schema, parser, server plugin, client plugin, registration in both registries, list of what still needs building (view components, constants, upload UI), checklist.

**Decisions:**
- Server/client plugin split: `CountryServerPlugin` imports Bun + Anthropic SDK (server-only); `CountryClientPlugin` imports React (browser-safe). Same country has both, registered in separate files. Prevents server code from being bundled into the browser.
- `migrateReturn?` on server plugin: US has 5 years of stored data with missing array fields; migration belongs in the plugin, not spread across storage functions.
- `forecaster.ts` does NOT import `SERVER_REGISTRY` directly (it's imported by App.tsx for types); plugins are passed as arguments from `src/index.ts` to keep the bundler boundary clean.
- `StatsHeader` and `InsightsPanel` shown only for `activeCountry === "us"` — both are deeply US-specific (federal/state totals, IRS constants badge). Will be generalized per-country in a future phase.
- Old US-specific routes (`/api/returns`, `/api/parse`, `/api/extract-year`) kept for backward compat — they handle first-time API key saving and US data migration. Generic `/api/:country/*` routes handle all registered countries including US (via `usServerPlugin`).
- `india-storage.ts` kept on disk (not deleted) — it's still referenced by `scripts/import-india.ts`. Unused by the app now.

**Tests:** 159 pass (updated `forecaster.test.ts` to use new `buildForecastPrompt` signature with plugin objects)

**Known gaps:**
- `StatsHeader` and `InsightsPanel` are hardcoded US-only — a future country would need its own stats header / insight engine.
- The `scripts/import-india.ts` CLI still uses `india-storage.ts` directly; should be migrated to use `country-storage.ts` + `indiaServerPlugin`.
- No Canada or third-country implementation yet — `ADDING_COUNTRY.md` is the guide.

**Next:** India forecast fix (India-only users), screenshot script, open-sourcing prep, or items from FEATURES.md.

---

## 2026-03-28 (India constants, bracket visualizer, what-if simulator)

**Done:**
- **`src/lib/constants/india.ts`** — `IndiaYearConstants` type covering old/new regime slabs, standard deduction, 87A rebate, cess rate (4%), surcharge thresholds (10/15/25/37%), and old-regime deduction caps (80C ₹1.5L, 80D, 80CCD(1B)). `INDIA_TAX_CONSTANTS` record for FY 2018–2025 (financialYear keys matching how `IndianTaxReturn.financialYear` is stored). `getIndiaConstants(financialYear)` / `formatIndiaConstantsForPrompt(c)`. Key inflection points captured: cess raised 3→4% FY 2018-19, standard deduction reintroduced FY 2018-19 (₹40k→₹50k FY 2019-20), new regime introduced FY 2020-21 (optional), new regime became default + 87A raised to ₹7L + surcharge capped at 25% FY 2023-24, 87A raised to ₹12L FY 2025-26.
- **India constants wired** — injected into `buildForecastPrompt()` (projected FY = latest India FY + 1) and `buildInsightsPrompt()` (FY matching selected year). `InsightsPanel` `ConstantsBadge` now shows both US and India badges when an India return is present.
- **`src/components/BracketVisualizer.tsx`** — full multi-bracket stacked bar for the US By Year charts view. Color-coded segments (green 10% → red 37%), headroom gray for marginal bracket, axis labels, "you are here" row in the per-bracket breakdown table, bracket-computed tax footer with discrepancy note if it differs from filed amount by >$500. Accepts optional `adjustedTaxableIncome` prop for what-if mode: bar reflects adjusted income, original position shown as a white marker line, header shows strikethrough original / new income, footer shows bracket tax delta.
- **`src/components/WhatIfSimulator.tsx`** — four sliders: 401(k) top-up (0 to year limit), IRA contribution (0 to year limit), additional deductions (0–$50K), capital gain/loss adjustment (−$50K to +$50K). Emits combined delta to `YearCharts` via `onDeltaChange`. Limits sourced from `getUsConstants(year)` — shows a graceful fallback if no constants on file. Shows before→after taxable income and bracket tax, with green savings / red increase callout when change > $50.
- **`YearCharts.tsx`** — added `useState<number>(0)` for `whatIfDelta`; resets to 0 on `data.year` change via `useEffect`; passes `adjustedTaxableIncome` to `BracketVisualizer` and `onDeltaChange` to `WhatIfSimulator`.
- **`computeBracketTax(taxableIncome, brackets)`** — extracted to `src/lib/tax-calculations.ts`; shared by `BracketVisualizer` and `WhatIfSimulator`.
- **Constants directory restructured** (previous checkpoint) — `src/lib/tax-constants.ts` → `src/lib/constants/` with `shared.ts` / `us.ts` / `india.ts` / `index.ts`; `docs/ADDING_COUNTRY_CONSTANTS.md` onboarding guide.

**Decisions:**
- What-if simulator uses ordinary-bracket math only (not LTCG preferential rates) — a note in the capital gains sublabel explains this. The directional savings estimate is accurate for W-2/ordinary income adjustments; LTCG savings will be understated.
- `adjustedTaxableIncome` drives the `BracketVisualizer` fully (rescales display range and recomputes marginal bracket) — the user can see if their adjustment drops them into a lower bracket, which is the most interesting scenario.
- The original-income white marker line is inside the `overflow-hidden` bar container using `absolute` positioning — works even when adjusted income is lower (marker appears to the right of the filled portion).
- India `IndiaYearConstants` has no shared supertype with `UsYearConstants` — structures are too different (FY keys vs calendar year, two regimes vs filing status, INR vs USD).

**Tests:** 159 pass (154 + 5 new `computeBracketTax` tests)

**Known gaps:** `WhatIfSimulator` sliders use browser default range styling (accent-indigo-500); appearance varies by OS. Dark mode thumb color is system-dependent. Not blocking.

**Next:** Multi-year income sources stacked chart, PDF export, or missing form detector (see FEATURES.md).

---

## 2026-03-28 (IRS constants, forecast state lift, constants badges)

**Done:**
- **`src/lib/tax-constants.ts`** — hardcoded IRS constants for 2024, 2025, 2026 sourced directly from IRS.gov; types `BracketEntry`, `YearConstants`; `getTaxConstants(year)` / `formatConstantsForPrompt(c)`. 2025 reflects OBBBA amendments (single 24% ceiling $197,300, MFJ standard deduction $31,500 — differs from Tax Foundation). 2026 LTCG marked `null` (not yet published). Update instructions at file top.
- **Constants injection into prompts** — `buildForecastPrompt()` and `buildInsightsPrompt()` both call `getTaxConstants(year)` and inject the formatted block before Instructions; fallback disclaimer shown if year not in constants.
- **Forecast state lifted to App.tsx** — `ForecastState` type and `handleGenerateForecast()` moved from `ForecastView` to `App.tsx`; the GET cache-load `useEffect` also moved. `ForecastView` is now a pure render component receiving `forecastState` + `onGenerate` as props. Fixes: generating navigating away cancelled the in-flight fetch.
- **IRS constants verification badges** — `ConstantsStatus` in `ForecastView` and `ConstantsBadge` in `InsightsPanel`: green ✓ for verified years, amber ⚠ for unverified. Forecast loaded header and generating spinner use `warnOnly` mode (renders nothing if all years verified, shows only missing years if any). Per-year InsightsPanel always shows the badge for that specific year.

**Decisions:**
- `warnOnly` on forecast header: a permanent checklist of all years would grow unbounded; only gaps are actionable signal.
- Generating spinner also uses `warnOnly` — verified years during generation are noise, not signal.
- Tax Foundation 2025 data was pre-OBBBA and wrong; always source from `irs.gov/filing/federal-income-tax-rates-and-brackets` directly.
- Constants file stays hardcoded (not fetched): ~50 lines/year, permanent reference, zero network dependency, ~20 years before it becomes unwieldy.

**Tests:** 154 pass (no new tests — purely UI/prompt changes; constants logic is straight lookups)

**Known gaps:** No tests for `ConstantsStatus` / `ConstantsBadge` rendering (DOM mock setup not in place).

**Next:** Keyboard shortcut `c` for chat, bracket visualizer, or items from FEATURES.md.

---

## 2026-03-28 (Phase 5: per-year retroactive insights + routing fix)

**Done:**
- **Phase 5: InsightsPanel on By Year view** — retroactive "what could you have done differently" analysis per year
  - `src/lib/insights.ts` — `InsightItem` type (title, description, estimatedSaving?, category); `buildInsightsPrompt()` (selected year in full detail, other years as compact context, India ITR for matching FY); `parseInsightsResponse()` (strips code fences, normalizes category enum); `generateInsights()` (Claude Sonnet, max_tokens 1024)
  - `src/lib/insights-cache.ts` — per-year JSON cache at `.insights-cache.json` keyed by year string; `getInsightsCache(year)` / `saveInsightsCache(year, items)` / `clearInsightsCache()`; same Bun.file pattern as forecast cache
  - `GET/POST /api/insights?year=N` endpoint — single function handler (literal path, not parameterized); `clearInsightsCache()` wired into `/api/clear-data`
  - `src/components/InsightsPanel.tsx` — state machine (idle/loading/generating/loaded/error); insight cards with category icons (🏦📉🇮🇳🏠💼) and green savings badges; Generate and Regenerate buttons; shown below ReceiptView on receipt tab
  - `src/lib/insights.test.ts` — 16 unit tests: `buildInsightsPrompt` (8), `parseInsightsResponse` (8)
- **Bug fix: `/api/insights/:year` GET returned HTML** — parameterized routes lose to `/*` SPA wildcard for GET, same as method-object routes. Fix: changed route to literal `/api/insights` with `?year=N` query param.

**Decisions:**
- Literal paths always beat `/*` SPA wildcard in Bun; parameterized routes do not. Rule: any route that needs GET must use a literal path. Dynamic values go in query params.
- India ITR matched to US year by `financialYear === year || financialYear === year - 1` (FY 2022-23 = India tax year 2022 ≈ US calendar year 2023).
- Sonnet (not Haiku) for insights: bracket math and quantitative optimization require reasoning, not just extraction.

**Tests:** 154 pass (138 + 16 new insights tests)

**Known gaps:** InsightsPanel fetch state machine not tested with DOM mocks (same gap as ForecastView).

**Next:** Phase 4 (SQLite caches, deferred) or new features from FEATURES.md.

---

## 2026-03-28 (Bug-fix session: idleTimeout, routing, silent catch + regression tests)

**Done:**
- **Bug: `idleTimeout` too short** — Bun default is 10s; Claude Sonnet calls take 30–90s. Server dropped connection mid-call with "empty reply", showing "Forecast failed". Fix: added `idleTimeout: 120` to `Bun.serve()` config.
- **Bug: `{ GET, POST }` route object conflicts with `/*` SPA wildcard** — Bun's SPA catch-all intercepts GET before the method-object route, returning the HTML page. POST returned 405 with a non-JSON body, causing the JSON-parse in the error handler to throw, triggering the outer catch with a generic message. Fix: changed `/api/forecast` to a single `async (req)` function handler that branches on `req.method`.
- **Bug: silent catch hid cached forecast on server restart** — `ForecastView` `.catch()` called `setState({ status: "empty" })`, showing "Generate Forecast" when the server was briefly unreachable. User could click Generate and overwrite the cached forecast. Fix: catch now surfaces the real error (`setState({ status: "error", message })`).
- **Bug: `forecast-cache.test.ts` was hitting the real cache file** — setting `process.env.TAX_UI_DATA_DIR` at test-file scope is too late (ESM hoisting initializes the module before the env var is set). Fix: removed the env redirect; added `beforeEach(clearForecastCache)` + `afterEach(clearForecastCache)`.
- **Bug: `src/index.test.ts` regex parse error** — regex literal `/"/api\/forecast":.../` treated the `"` before the slash as an invalid flag. Fix: used string `indexOf` + `slice` instead of a regex with embedded quotes.
- **Regression tests added** (`src/index.test.ts`): `idleTimeout > 10`, forecast route uses function handler (not method-object).
- **Cache persistence** — `getForecastCache` / `saveForecastCache` / `clearForecastCache` confirmed working; forecast persists across page loads and server restarts until "Regenerate" is explicitly clicked.

**Decisions:**
- Error must always be shown on `GET /api/forecast` failure — never silently show "Generate Forecast", which would overwrite the cache on click.
- `forecast-cache.test.ts` cleans up the real cache file rather than redirecting to a temp dir — simpler and avoids ESM hoisting race.

**Tests:** 138 pass (128 + 10 cache tests + 2 regression tests in index.test.ts; counts include fixes to previously failing tests)

**Known gaps:** no new gaps introduced.

**Next:** Phase 4 (SQLite for per-year forecast history, deferred) or Phase 5 (per-year retroactive insights on By Year view — higher user value).

---

## 2026-03-28 (Phase 3)

**Done:**
- **Phase 3: Forecast view components** — full Forecast view replacing the placeholder
  - `BracketBar.tsx` — bracket position bar with fill %, headroom badge, headroom advisory text; exports `computeFillPercent()` (testable)
  - `AssumptionsCard.tsx` — assumption list with icon, label, value, reasoning, confidence badge (emerald/amber/rose); exports `confidenceBadgeClass()` (testable)
  - `ActionItemsCard.tsx` — action items with category icon, title, description, saving amount, source year + timing tags
  - `RiskFlags.tsx` — risk flags sorted high-before-medium with colored dots; exports `sortedByHighFirst()` (testable)
  - `IndiaRegimeCard.tsx` — old vs new regime comparison, recommended regime highlighted in green, saving badge
  - `ForecastChatStrip.tsx` — chat invite strip at bottom of forecast view
  - `ForecastView.tsx` — full container: loading/generating/empty/error/loaded states; fetches `GET /api/forecast` on mount; "Generate Forecast" / "Regenerate" button calls `POST /api/forecast`; three metric cards; bracket bar; 2-col assumptions+actions; risk flags; India card; chat strip
  - `MainPanel.tsx` — added `onToggleChat?` to `ForecastProps`, threaded to `ForecastView`
  - `App.tsx` — forecast render case now passes `onToggleChat`
  - `ForecastComponents.test.ts` — 15 unit tests: `computeFillPercent` (7), `confidenceBadgeClass` (3), `sortedByHighFirst` (5)

**Decisions:**
- `ForecastView` owns its own data-fetch state machine (loading → empty | loaded | error | generating) rather than lifting to App.tsx — forecast data is orthogonal to core app state and doesn't need to survive navigation
- `computeFillPercent` clamped 0–100 at both ends — income below floor and above ceiling both render cleanly
- `nextRate` shown in headroom text is `rate + 2` (rough approximation: 22→24, 24→32 etc.) — good enough for advisory copy, not a tax calculator
- Empty state shows year count so the user understands what Claude will reason over

**Tests:** 128 pass (113 + 15 new component tests)

**Known gaps:**
- `ForecastView` fetch is not tested (needs DOM / fetch mock setup the project doesn't have yet)
- Range formatting in MetricCard for negative outcome values is slightly asymmetric ("Range: -$400 to +$2,600") — acceptable

**Next:** Phase 4 (SQLite cache) or Phase 5 (per-year insights). Phase 4 is optional — current JSON file cache works. Recommend Phase 5 first for user-facing value.

---

## 2026-03-28 (Phase 2)

**Done:**
- **Phase 2: Forecast API endpoint**
  - `src/lib/forecaster.ts` — `ForecastResponse` type; `buildForecastPrompt()` (condensed per-year US + India summaries, schema doc, regime instructions); `parseForecastResponse()` (JSON extraction from code fences, field normalization with safe fallbacks, headroom recompute); `generateForecast()` (Claude Sonnet call)
  - `src/lib/forecast-cache.ts` — `getForecastCache()` / `saveForecastCache()` / `clearForecastCache()` backed by `.forecast-cache.json` (mirrors `.tax-returns.json` pattern)
  - `src/index.ts` — `GET /api/forecast` (returns cached or 404), `POST /api/forecast` (generates + caches), `clearForecastCache()` wired into `/api/clear-data`
  - `src/lib/forecaster.test.ts` — 17 unit tests: `buildForecastPrompt` (6 tests), `parseForecastResponse` (11 tests) covering all normalization paths and edge cases

**Decisions:**
- Prompt sends condensed per-year summaries, not raw full JSON — avoids display-only fields (qualified dividends, rollover amounts) confusing the model; keeps tokens lean
- `parseForecastResponse` always recomputes `bracket.headroom` from `ceiling - projectedIncome` — Claude occasionally miscalculates arithmetic
- Cache is a flat `.forecast-cache.json` file (Phase 4 will upgrade to SQLite if needed); cleared on `/api/clear-data`
- No `ForecastResponse` Zod schema — parse + normalize manually (consistent with parser.ts pattern; Zod overhead not warranted for a single AI response that we own)
- India section in response is silently omitted if any required field is missing (never error on partial India data)

**Tests:** 113 pass (96 existing + 17 new forecast tests)

**Known gaps:**
- Integration tests (GET/POST route cycle) skipped — unit tests cover all logic; cache read/write exercised indirectly through unit test fixtures
- No auth error handling on forecast endpoint (unlike chat/parse routes) — forecast is server-side only, no API key exposure risk

**Next:** Phase 3 — Forecast view components (`ForecastView.tsx`, `BracketBar.tsx`, `AssumptionsCard.tsx`, `ActionItemsCard.tsx`, `RiskFlags.tsx`, `IndiaRegimeCard.tsx`, `ForecastChatStrip.tsx`)

---

## 2026-03-28 (Phase 1)

**Done:**
- **Phase 1: Sidebar layout refactor** — replaced top header + horizontal tab navigation with a left sidebar (192px)
  - Logo + "beta" badge
  - Country toggle (🇺🇸/🇮🇳) in sidebar, conditional on India data
  - Views section: Summary, By Year, Forecast nav items
  - Years section: all parsed years listed descending
  - Footer: Chat toggle button + actions menu (add return, import ITR, reset data)
- **`src/lib/nav.ts`** — extracted all nav functions from App.tsx into testable module; added `"forecast"` to `SelectedView` type; added `getMostRecentYearItem()`
- **`src/lib/nav.test.ts`** — 24 new unit tests covering buildUsNavItems, buildIndiaNavItems, getDefaultUsSelection, getDefaultIndiaSelection, getMostRecentYearItem, parseSelectedId
- **`src/components/Sidebar.tsx`** — new sidebar component
- **`src/components/ForecastView.tsx`** — placeholder "coming soon" view for Phase 3
- **`src/components/MainPanel.tsx`** — removed entire header (~200 lines), CommonProps slimmed from 20 fields to 4
- **Documentation** — ARCHITECTURE.md, FORECAST_SPEC.md (with testing requirements per phase + model decision), README rewritten as TaxLens, CLAUDE.md updated with docs index

**Decisions:**
- `getMostRecentYearItem` used by "By Year" sidebar item: clicking it when on summary/forecast navigates to the most recent year; clicking when already on a year is a no-op
- Forecast nav item shows placeholder until Phase 3 — wired end-to-end so the nav works now
- All nav functions moved to `nav.ts` to make them unit-testable without React

**Tests:** 96 pass (72 existing + 24 new nav tests)

**Known gaps:**
- j/k keyboard shortcuts still work for year navigation but don't cover Summary/Forecast views — acceptable for now
- Delete year (right-click context menu) was on the old header tabs — removed for now, will add back in sidebar if needed
- Mobile: sidebar doesn't collapse yet (out of scope for Phase 1)

**Next:** Phase 2 — `POST /api/forecast` endpoint (Claude Sonnet call, ForecastResponse schema, structured output)

---

## 2026-03-21

**Done:**
- **India tax support** — full end-to-end pipeline for Indian ITR returns
  - `src/lib/schema.ts`: added `itrForm` field (`"ITR-1" | "ITR-2" | "ITR-3" | "ITR-4"`)
  - `src/lib/pdf-utils.ts`: `unwrapIfJavaSerialized()` — extracts real PDF from Java object serialization wrapper (Indian IT portal wraps PDFs in Java serialization with magic bytes `aced0005`; actual PDF starts at `%PDF` offset inside)
  - `src/lib/india-parser.ts`: two-pass Sonnet parsing for ITR-2, single-pass for ITR-1; Haiku-based form type detection on first page; proactive token budget (sliding window over actual `response.usage` tokens, 60s window) to avoid 429s; `TAIL_PAGES` reduced 15→12
  - `src/lib/india-storage.ts` + `src/lib/prompt.ts`: ITR-1 prompt (no capital gains, correct 3% cess for AY ≤2018-19); ITR-2 prompts updated with dynamic cess rate
  - `scripts/import-india.ts`: uses `unwrapIfJavaSerialized`; parses and saves to `.india-tax-returns.json`
- **India UI** — `App.tsx` + `MainPanel.tsx` country toggle (🇺🇸 US / 🇮🇳 India pills), India year and summary views with chart/table mode toggles
  - `src/components/IndiaReceiptView.tsx`: dynamic form label, dynamic cess label
  - `src/components/IndiaSummaryView.tsx`: ITR-1 badge, "—" for CG on ITR-1 rows, YoY `+X.X%`/`-X.X%` badges (green/red) on Gross Income, STCG, LTCG, Tax Liability (inverted polarity), compact INR formatting with hover tooltips
  - `src/components/IndiaYearCharts.tsx`: income breakdown donut + tax summary bar
  - `src/components/IndiaSummaryCharts.tsx`: Gross Income + Tax Liability grouped bars, Capital Gains trend (ITR-2 years only), Effective Tax Rate line, Refund/Due bar with green/red cells
- **`formatINRCompact`** in `src/lib/format.ts`: compact INR (sub-1L → full, ≥1L → "₹X.XXL", ≥1Cr → "₹X.XXCr"); fixed sign-for-zero bug
- **Tests**: 72 pass (up from 57 before this session)
  - `src/lib/pdf-utils.test.ts` (4 tests): `unwrapIfJavaSerialized` covering real PDF, Java-wrapped, no-PDF-inside, trailing-data
  - `src/lib/india-parser.test.ts` (expanded to 10): `reconcileIndianReturn` covering tax paid recomputation, positive/negative refund, summary sync, preserves AI totalTaxPaid when arrays empty, ITR-1 capital gains zero
  - `src/lib/format.test.ts` (5 new): `formatINRCompact` covering sub-1L, lakhs, crores, negatives, showSign

**Decisions:**
- Java-serialized PDF unwrapping: scan for `%PDF` magic bytes inside Java-serialized blob and `%%EOF` at end — robust even when byte offset varies across years
- ITR-1 uses single-pass Sonnet (not two-pass): forms are 2-5 pages; sending entire doc at once is cheaper and avoids coordination overhead
- Haiku for form type detection: cheap (1 page, simple classification), avoids burning Sonnet quota on a routing decision
- Proactive token budget uses actual `response.usage` (not estimates) in a 60-second sliding window to prevent 429s without over-sleeping
- `TAIL_PAGES` 15→12: tail is Part B-TTI + TDS schedules, 12 pages covers all observed formats; cuts ~2.25K tokens per call
- YoY badges skip comparison if prior year was ITR-1 (no STCG/LTCG data to compare against)
- `formatINRCompact` always uses `toFixed(2)` for lakhs (not conditional on ≥10L) — ₹19.7L vs ₹19.68L looked like a bug at a glance

**Known gaps:**
- ITR-1 detection relies on Haiku reading first page — very old scanned PDFs (2012) may produce OCR artifacts; tested successfully on 2012-2017
- Effective Tax Rate chart uses `taxableIncome`; for ITR-1 this may be 0 (field absent in older forms), showing 0% rate — cosmetically misleading but not wrong
- Pre-existing lint warnings (8) not addressed

**Next:**
- Investigate extraction prompt to prevent `refundOrDue=0` class of AI error at source (identified in 2024 return, manually patched)
- Consider adding `taxableIncome` to `INDIA_ITR1_PROMPT` so effective rate chart works for ITR-1 years
- Continue feature backlog in `docs/FEATURES.md`

---

## 2026-03-20

**Done:**
- Added `reconcile()` to `parser.ts` — post-parse validation that recomputes `federal.refundOrOwed` (overrides if diff >$1,000, warns only if <$1,000 to avoid Schedule 2 false positives), recomputes all summary fields from canonical sources, and sanity-checks effective rate + AGI vs income.total proximity
- Manually patched `.tax-returns.json` for 2021 (NJ refundOrOwed 0 → -670) and 2024 (federal refundOrOwed 0 → -18,682; NJ refundOrOwed 2890 → -2890)
- Fixed `SummaryCharts.tsx` chart bugs: tooltip key labels showing numbers instead of names, refund/owed bar rendering black
- Added `scripts/validate-returns.ts` — runs `reconcile()` against all stored returns and prints warnings
- Added `scripts/load-from-drive.ts` — bulk-loads PDFs from `~/gdrive` Google Drive mount
- Added `docs/PRFAQ.md` — product narrative for TaxLens vision
- Established project conventions in `CLAUDE.md`: Code Style, Testing, Security, Checkpoint ritual

**Decisions:**
- `$1,000` threshold for federal override: real AI miss was $18,682; Schedule 2 double-counting is ~$100-200 — threshold cleanly separates the two cases
- `income.total` NOT recomputed from `sum(items)` — items array includes display-only entries (qualified dividends, non-taxable pension rollover) that are not part of 1040 line 9
- `taxableIncome` NOT recomputed from `agi - deductions` — some deductions are above-the-line (already baked into AGI), double-subtracting gives wrong result
- State `refundOrOwed` NOT validated by formula — `adjustments` mixes credits (reduce tax directly) and deductions (reduce taxable income); any formula produces only false positives
- "Why" comments allowed in source; "what" comments are not — narrative decisions belong in CLAUDE.md/docs

**Known gaps:**
- `reconcile()` has no unit tests yet — highest priority next
- `.tax-returns.json` manual patches (2021 NJ, 2024 federal) will be lost if PDFs are re-parsed; root cause is in the extraction prompt, not yet fixed
- Pre-existing lint warnings in `src/index.ts` and `src/lib/selector.ts` not addressed

**Next:**
- Write unit tests for `reconcile()` covering: large federal diff override, small diff warn-only, summary recomputation, effective rate sanity check
- Investigate extraction prompt to prevent the 2024 federal refundOrOwed=0 class of error at source
- Continue feature backlog in `docs/FEATURES.md`

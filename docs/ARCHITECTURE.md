# Architecture

Last updated: 2026-03-28 (country-agnostic plugin architecture — Phases 1–4)

---

## Overview

TaxLens (forked from brianlovin/tax-ui) is a single-process Bun application — one server handles both the API and serves the React frontend. All data stays local; no cloud storage, no external services except the Anthropic API.

```
Browser (React 19)
    │
    ▼
Bun server (src/index.ts)   idleTimeout: 120s (Claude calls take 30–90s)
    ├── GET  /                           → serves React SPA
    ├── GET  /api/config                 → hasKey, isDemo, isDev
    ├── POST /api/config/key             → validate + save API key
    ├── POST /api/chat                   → Sonnet: year-aware chat
    ├── POST /api/suggestions            → Haiku: 3 follow-up questions
    ├── GET  /api/forecast               → cached ForecastResponse (404 if none)
    ├── POST /api/forecast               → Sonnet: generate + cache ForecastResponse (all countries)
    ├── GET  /api/insights?year=N        → cached InsightItem[] for year N (404 if none)
    ├── POST /api/insights?year=N        → Sonnet: generate + cache InsightItem[] for year N
    ├── POST /api/clear-data             → wipe all returns + caches for all registered countries
    │
    │   Generic country routes — driven by SERVER_REGISTRY[country]:
    ├── GET    /api/:country/returns     → all returns for that country
    ├── DELETE /api/:country/returns/:year
    ├── POST   /api/:country/extract-year → Haiku/Sonnet: detect year from PDF
    ├── POST   /api/:country/parse        → Sonnet: parse PDF → country-specific schema
    │
    │   US legacy routes (backward compat + first-time API key setup):
    ├── GET    /api/returns              → US returns (delegates to /api/us/returns logic)
    ├── DELETE /api/returns/:year
    ├── POST   /api/extract-year
    └── POST   /api/parse
    │
    ├── src/countries/index.ts          → SERVER_REGISTRY: Record<code, CountryServerPlugin>
    ├── src/countries/us/index.ts       → usServerPlugin (parser, schema, constants, migrateReturn)
    ├── src/countries/india/index.ts    → indiaServerPlugin (parser, schema, constants)
    ├── src/lib/country-registry.ts     → CountryServerPlugin + CountryClientPlugin interfaces
    ├── src/lib/country-storage.ts      → getCountryReturns / saveCountryReturn / deleteCountryReturn / clearCountryData
    ├── src/lib/parser.ts               → US return parsing (two-pass Sonnet)
    ├── src/lib/india-parser.ts         → India ITR parsing (Haiku detect + Sonnet extract)
    ├── src/lib/storage.ts              → US returns flat JSON (legacy; migrateReturn now in usServerPlugin)
    ├── src/lib/pdf-utils.ts            → Java-serialized PDF unwrapping
    ├── src/lib/forecaster.ts           → buildForecastPrompt(allReturns, activePlugins) + parseForecastResponse + generateForecast
    ├── src/lib/forecast-cache.ts       → forecast JSON cache (.forecast-cache.json)
    ├── src/lib/insights.ts             → buildInsightsPrompt + parseInsightsResponse + generateInsights
    ├── src/lib/insights-cache.ts       → per-year insights JSON cache (.insights-cache.json)
    └── src/lib/constants/              → per-country tax constants injected into prompts
            shared.ts                   → BracketEntry type
            us.ts                       → IRS constants 2018–2026; getUsConstants(year) / formatUsConstantsForPrompt(c)
            india.ts                    → India constants FY 2018–2025 (old+new regimes, surcharge, cess, deductions)
            index.ts                    → re-exports all countries
```

---

## Country Plugin System

TaxLens uses a split plugin architecture to support any number of countries without server code leaking into the browser bundle.

```
src/lib/country-registry.ts
  CountryServerPlugin   — Bun/Anthropic side: code, name, flag, currency,
                          storageFile, schema, migrateReturn?, getYear, yearLabel,
                          summaryLabel, parseReturn, extractYearFromPdf,
                          buildYearSummary, constants?, forecast?
  CountryClientPlugin   — React side: same identity + year fields,
                          components { YearReceipt, YearCharts, SummaryView,
                          SummaryCharts, SummaryReceipt? }, forecast?.ExtensionCard

src/countries/index.ts      → SERVER_REGISTRY (imported by src/index.ts only)
src/countries/views.ts      → CLIENT_REGISTRY (imported by React components only)

src/countries/us/index.ts   → usServerPlugin
src/countries/us/views.tsx  → usClientPlugin
src/countries/india/index.ts  → indiaServerPlugin
src/countries/india/views.tsx → indiaClientPlugin
```

Adding a new country requires only files inside `src/countries/<code>/`. The server routes, storage, forecast, and sidebar pick it up automatically. See `docs/ADDING_COUNTRY.md`.

---

## Data Flow

### Parsing (US)
```
PDF upload
  → pdf-utils.ts: unwrap if Java-serialized
  → parser.ts: two-pass Claude Sonnet (page images + structured extraction)
  → reconcile(): post-parse validation (refundOrOwed, summary fields)
  → storage.ts: upsert to .tax-returns.json
```

### Parsing (India)
```
PDF upload via POST /api/india/parse (or scripts/import-india.ts CLI)
  → pdf-utils.ts: unwrap if Java-serialized (Indian IT portal wraps PDFs in aced0005)
  → india-parser.ts:
      pass 1 — Haiku: detect ITR-1 vs ITR-2
      pass 2 — Sonnet: extract (single-pass for ITR-1, two-pass for ITR-2)
      proactive token budget: 60s sliding window on response.usage to prevent 429s
  → country-storage.ts: saveCountryReturn(indiaServerPlugin, ...) → .india-tax-returns.json keyed by FY
```

### Chat
```
User message
  → /api/chat: loads all returns for context + selectedYear
  → Claude Sonnet: year-aware system prompt with full return JSON (minified)
  → response → React chat panel
  → /api/suggestions: Haiku generates 3 follow-up questions (structured output)
```

### Forecast
```
"Generate Forecast" click (or "Regenerate")
  → App.tsx: handleGenerateForecast() — POST /api/forecast
  → src/index.ts: gathers returns from all plugins via getCountryReturns; passes activePlugins to generateForecast
  → forecaster.ts: buildForecastPrompt(allReturns, activePlugins)
      loops plugins: per-country condensed year summaries via plugin.buildYearSummary
      + plugin.constants?.get(projectedYear) injected as verified tax figures per country
      + plugin.forecast?.schemaSnippet / promptInstruction for country-specific JSON fields
  → Claude Sonnet: returns ForecastResponse JSON
  → parseForecastResponse(): validates + normalizes (confidence, severity, headroom)
  → forecast-cache.ts: writes .forecast-cache.json

Subsequent page loads (or mid-generation navigation)
  → App.tsx: GET /api/forecast on mount (survives navigation — state lives in App, not ForecastView)
  → 200 + cached JSON → show forecast
  → 404 → show "Generate Forecast" empty state
  → network error → show error with "Try again" (NOT silently empty — cache may exist)
```

### Insights (per-year)
```
"Generate →" click on InsightsPanel (By Year / receipt tab)
  → InsightsPanel.tsx: POST /api/insights?year=N
  → insights.ts: buildInsightsPrompt()
      selected year in full + other years as compact context
      + India ITR for matching FY if present
      + constants/us.ts: getUsConstants(year) injected as verified IRS figures
      + constants/india.ts: getIndiaConstants(indiaFY) injected if India return matches year
  → Claude Sonnet: returns InsightItem[] JSON
  → parseInsightsResponse(): strips fences, normalizes category enum
  → insights-cache.ts: writes to .insights-cache.json[year]

Subsequent year visits
  → InsightsPanel.tsx: GET /api/insights?year=N on mount
  → 200 + cached items → show insight cards
  → 404 → show "Generate →" idle state
  → error → show error with "Try again"
```

---

## Storage

| What | Where | Format |
|------|-------|--------|
| US tax returns | `.tax-returns.json` | JSON keyed by year, Zod-validated |
| India tax returns | `.india-tax-returns.json` | JSON keyed by FY, Zod-validated |
| Any future country | `.<code>-tax-returns.json` | JSON keyed by year/FY, plugin-defined |
| Forecast cache | `.forecast-cache.json` | JSON, single ForecastResponse |
| Insights cache | `.insights-cache.json` | JSON, Record<year, InsightItem[]> |
| Chat history | localStorage | Per-session, browser-only |
| API key | `.env` (ANTHROPIC_API_KEY) | Never committed |

All files are gitignored. Return files are the source of truth — all caches are derived and can be regenerated. `/api/clear-data` wipes returns + all caches for all registered countries.

Storage functions live in `src/lib/country-storage.ts` and are driven entirely by `plugin.storageFile`, `plugin.schema`, `plugin.migrateReturn?`, and `plugin.getYear`.

Phase 4 (deferred): upgrade caches to `bun:sqlite` for richer query/history. Current flat JSON is sufficient.

---

## Frontend

```
src/App.tsx                     main layout + state (activeCountry: string, countryReturns, nav, chat, forecastState)
src/lib/nav.ts                  generic buildNavItems / getDefaultSelection + per-country thin delegates
src/lib/constants/              per-country tax constants (US 2018–2026, India FY 2018–2025)
src/countries/views.ts          CLIENT_REGISTRY: Record<code, CountryClientPlugin> — imported by React only
src/countries/us/views.tsx      usClientPlugin: ReceiptView, YearCharts, SummaryTable, SummaryCharts, SummaryReceiptView
src/countries/india/views.tsx   indiaClientPlugin: IndiaReceiptView, IndiaYearCharts, IndiaSummaryView, IndiaSummaryCharts
src/components/
  Sidebar.tsx                   left sidebar (logo, country toggle via CLIENT_REGISTRY, views, years, footer)
  MainPanel.tsx                 content area router (summary/receipt/forecast/loading) — all year/summary views via plugin.components
  Chat.tsx                      floating chat panel (right side)
  ForecastView.tsx              forecast page — pure render, receives ForecastState + onGenerate as props
  BracketBar.tsx                bracket position bar with fill% and headroom
  AssumptionsCard.tsx           AI assumptions list with confidence badges
  ActionItemsCard.tsx           action items with category icons and source year tags
  RiskFlags.tsx                 risk flags sorted high-before-medium
  IndiaRegimeCard.tsx           old vs new regime comparison
  ForecastChatStrip.tsx         chat invite at bottom of forecast view
  InsightsPanel.tsx             per-year retroactive insights (state machine: idle/loading/generating/loaded/error)
  SummaryTable.tsx              US all-years table
  SummaryCharts.tsx             US multi-year charts (recharts)
  SummaryReceiptView.tsx        US summary receipt style
  ReceiptView.tsx               US single-year detail
  YearCharts.tsx                US single-year charts (owns whatIfDelta state; resets on year change)
  BracketVisualizer.tsx         multi-bracket stacked bar; accepts adjustedTaxableIncome for what-if mode
  WhatIfSimulator.tsx           four sliders (401k, IRA, deductions, cap gains); emits delta to YearCharts
  IndiaSummaryView.tsx          India all-years table
  IndiaSummaryCharts.tsx        India charts
  IndiaReceiptView.tsx          India single-year detail
  IndiaYearCharts.tsx           India single-year charts
```

Navigation: left sidebar (192px) with Views section (Summary / By Year / Forecast) and Years list. "By Year" is active when any year is selected; clicking it navigates to the most recent year.

Country toggle appears only when `activeCountries.length > 1` (data exists for more than one country). It loops `CLIENT_REGISTRY` filtered to countries with data — new countries appear automatically when registered.

---

## Models

| Use | Model | Why |
|-----|-------|-----|
| US return parsing | claude-sonnet-4-6 | Two-pass, needs accuracy |
| India ITR form detection | claude-haiku-4-5 | Fast, cheap, binary decision |
| India ITR extraction | claude-sonnet-4-6 | Two-pass for ITR-2 accuracy |
| Chat | claude-sonnet-4-6 | Quality responses, year-aware |
| Follow-up suggestions | claude-haiku-4-5 | Fast, structured output |
| Forecast generation | claude-sonnet-4-6 | Multi-year reasoning, structured output |
| Per-year insights | claude-sonnet-4-6 | Bracket math + actionable tax optimization |

---

## Testing

Test files live alongside source. Run: `bun test --testPathPattern="src/"`

```
Unit tests (159 passing):
  src/App.test.ts                    nav/selection logic
  src/index.test.ts                  server config regressions (idleTimeout, route format)
  src/lib/nav.test.ts                buildUsNavItems, buildIndiaNavItems, getDefault*, parseSelectedId (24)
  src/lib/format.test.ts             formatINRCompact, formatCurrency, formatPercent
  src/lib/tax-calculations.test.ts   getTotalTax, getNetIncome, computeBracketTax (5 new)
  src/lib/summary.test.ts            summary recomputation
  src/lib/classifier.test.ts         return type classification
  src/lib/india-parser.test.ts       reconcileIndianReturn (10)
  src/lib/pdf-utils.test.ts          unwrapIfJavaSerialized (4)
  src/lib/time-units.test.ts         time unit conversions
  src/lib/forecaster.test.ts         buildForecastPrompt (6), parseForecastResponse (11)
  src/lib/forecast-cache.test.ts     getForecastCache, saveForecastCache, clearForecastCache (10)
  src/lib/insights.test.ts           buildInsightsPrompt (8), parseInsightsResponse (8)
  src/components/ForecastComponents.test.ts  computeFillPercent (7), confidenceBadgeClass (3), sortedByHighFirst (5)
```

Type check: `bunx tsc --noEmit`
Lint: `bun run lint`

---

## Key design decisions

**Why flat JSON instead of DB for returns?**
Simple, portable, zero setup. Tax returns are append-only (one per year) and always loaded in full. No query complexity. SQLite is additive for forecast caching only — returns stay as JSON.

**Why flat JSON for forecast cache too (not SQLite)?**
Phase 4 plans SQLite for per-year forecast history. For now, one forecast per user fits in a single JSON file. Keeping it consistent with `.tax-returns.json` pattern avoids a dependency before it's needed.

**Why two-pass parsing?**
Single-pass Claude calls on complex multi-schedule PDFs (especially ITR-2 with STCG/LTCG schedules) miss fields. Two passes — first extract, then verify/fill gaps — significantly improves accuracy.

**Why reconcile() post-parse?**
Claude reliably missed `federal.refundOrOwed` in real data (caught an $18,682 omission in 2024). Deterministic recomputation catches AI errors without re-calling the API.

**Why idleTimeout: 120 on the Bun server?**
Bun's default idle timeout is 10 seconds. Claude Sonnet calls (forecast generation, PDF parsing) take 30–90 seconds. Without this, the server drops the connection mid-call with an empty reply.

**Why a single async function handler for /api/forecast and /api/insights instead of `{ GET, POST }`?**
Bun's `/*` SPA wildcard intercepts GET requests before both `{ GET: ... }` method objects AND parameterized routes (`:year`) can handle them, returning the HTML page instead. A single function handler at a literal path bypasses this. For dynamic segments, pass values as query params (`?year=N`) rather than path params (`:year`).

**Why `/api/insights?year=N` instead of `/api/insights/:year`?**
Parameterized routes lose to the `/*` SPA wildcard for GET requests in Bun, same as method-object routes. Literal paths always win. Year as query param is equally readable and avoids the conflict.

**Why not silently show empty state on forecast GET failure?**
If the server is briefly unreachable (restart, deploy), the component would show "Generate Forecast" instead of an error — causing the user to accidentally regenerate and overwrite the cached forecast. Errors should always be surfaced so the user can retry.

**Why minify JSON in chat system prompt?**
Context window efficiency. Full return JSON with whitespace hit token limits; minified passes the same data at ~60% the cost.

**Why proactive token budget in India parser?**
Indian ITRs with full capital gains schedules can hit 429 rate limits on Haiku. A 60s sliding window on `response.usage.input_tokens` throttles automatically without user-visible errors.

**Why hardcode IRS constants instead of fetching them?**
~50 lines per year, permanent source of truth, zero network dependency, auditable inline. At 20 years it's ~1,000 lines — well within the range of a readable config file. The alternative (fetching from an IRS API or Tax Foundation) introduces a dependency, a failure mode, and the risk of pulling pre-amendment data (Tax Foundation's 2025 figures were pre-OBBBA and had wrong bracket ceilings). Always source from `irs.gov/filing/federal-income-tax-rates-and-brackets` directly.

**Why split CountryServerPlugin and CountryClientPlugin instead of one plugin interface?**
The server plugin imports Bun, Anthropic SDK, and Zod schemas — none of which belong in the browser bundle. The client plugin imports React and JSX components — which should never run on the server. Splitting the interface into two (registered in `src/countries/index.ts` and `src/countries/views.ts` respectively) enforces this boundary at the module level. `forecaster.ts` accepts `CountryServerPlugin[]` as arguments from `src/index.ts` rather than importing `SERVER_REGISTRY` itself, because `forecaster.ts` is also imported by `App.tsx` (for the `ForecastResponse` type); a direct registry import would pull server-only code into the browser bundle.

**Why a per-country module directory for constants instead of a single file?**
A single `tax-constants.ts` with US-only types would need to absorb India (old/new regimes, surcharge, cess, FY keys) and Canada (federal + provincial, RRSP/TFSA) with incompatible structures. Each country gets its own module with its own type, data record, getter, and prompt formatter. No shared supertype is forced. `index.ts` re-exports all registered countries. See `docs/ADDING_COUNTRY_CONSTANTS.md` for onboarding a new country.

**Why does WhatIfSimulator pass delta to YearCharts rather than owning both components?**
`BracketVisualizer` needs to update in place so the user sees the bracket bar shift as they move sliders. This requires shared state. `YearCharts` is the natural owner since it already renders both components side-by-side and resets the delta to 0 when the user navigates to a different year.

**Why does `computeBracketTax` live in `tax-calculations.ts` and not inline in the components?**
Both `BracketVisualizer` and `WhatIfSimulator` need the same bracket math. Extracting it to `tax-calculations.ts` makes it unit-testable and eliminates duplication.

**Why lift ForecastState to App.tsx?**
`ForecastView` used to own its own `useState` for the forecast state machine. When the user navigated away mid-generation, the component unmounted and the in-flight `POST /api/forecast` fetch was orphaned. Lifting to `App.tsx` makes `ForecastView` a pure render component and lets the fetch survive navigation. The same pattern is used for chat state, upload state, and other long-running operations in App.

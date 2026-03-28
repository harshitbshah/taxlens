# Progress Log

One entry per checkpoint. Most recent first.

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

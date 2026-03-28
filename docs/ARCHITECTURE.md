# Architecture

Last updated: 2026-03-28

---

## Overview

TaxLens (forked from brianlovin/tax-ui) is a single-process Bun application — one server handles both the API and serves the React frontend. All data stays local; no cloud storage, no external services except the Anthropic API.

```
Browser (React 19)
    │
    ▼
Bun server (src/index.ts)   idleTimeout: 120s (Claude calls take 30–90s)
    ├── GET  /                      → serves React SPA
    ├── GET  /api/config            → hasKey, isDemo, isDev
    ├── POST /api/config/key        → validate + save API key
    ├── GET  /api/returns           → all US returns
    ├── DELETE /api/returns/:year   → delete a US return
    ├── POST /api/extract-year      → Haiku: detect year from PDF
    ├── POST /api/parse             → Sonnet: parse US PDF → TaxReturn
    ├── POST /api/chat              → Sonnet: year-aware chat
    ├── POST /api/suggestions       → Haiku: 3 follow-up questions
    ├── GET  /api/india/returns     → all India returns
    ├── DELETE /api/india/returns/:year
    ├── POST /api/india/extract-year
    ├── POST /api/india/parse       → Sonnet: parse ITR PDF → IndianTaxReturn
    ├── GET  /api/forecast          → cached ForecastResponse (404 if none)
    ├── POST /api/forecast          → Sonnet: generate + cache ForecastResponse
    └── POST /api/clear-data        → wipe all returns + forecast cache
    │
    ├── src/lib/parser.ts           → US return parsing (two-pass Sonnet)
    ├── src/lib/india-parser.ts     → India ITR parsing (Haiku detect + Sonnet extract)
    ├── src/lib/storage.ts          → US returns (flat JSON)
    ├── src/lib/india-storage.ts    → India returns (flat JSON)
    ├── src/lib/pdf-utils.ts        → Java-serialized PDF unwrapping
    ├── src/lib/forecaster.ts       → buildForecastPrompt + parseForecastResponse + generateForecast
    └── src/lib/forecast-cache.ts   → forecast JSON cache (.forecast-cache.json)
```

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
PDF upload (or scripts/import-india.ts CLI)
  → pdf-utils.ts: unwrap if Java-serialized (Indian IT portal wraps PDFs in aced0005)
  → india-parser.ts:
      pass 1 — Haiku: detect ITR-1 vs ITR-2
      pass 2 — Sonnet: extract (single-pass for ITR-1, two-pass for ITR-2)
      proactive token budget: 60s sliding window on response.usage to prevent 429s
  → india-storage.ts: upsert to .india-tax-returns.json keyed by FY
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
  → ForecastView.tsx: POST /api/forecast
  → forecaster.ts: buildForecastPrompt() — condensed per-year US + India summaries
  → Claude Sonnet: returns ForecastResponse JSON
  → parseForecastResponse(): validates + normalizes (confidence, severity, headroom)
  → forecast-cache.ts: writes .forecast-cache.json

Subsequent page loads
  → ForecastView.tsx: GET /api/forecast on mount
  → 200 + cached JSON → show forecast
  → 404 → show "Generate Forecast" empty state
  → network error → show error with "Try again" (NOT silently empty — cache may exist)
```

---

## Storage

| What | Where | Format |
|------|-------|--------|
| US tax returns | `.tax-returns.json` | JSON keyed by year, Zod-validated |
| India tax returns | `.india-tax-returns.json` | JSON keyed by FY, Zod-validated |
| Forecast cache | `.forecast-cache.json` | JSON, single ForecastResponse |
| Chat history | localStorage | Per-session, browser-only |
| API key | `.env` (ANTHROPIC_API_KEY) | Never committed |

All files are gitignored. `.tax-returns.json` and `.india-tax-returns.json` are the source of truth — the forecast cache is derived and can be regenerated at any time.

Phase 4 (deferred): upgrade forecast cache to `bun:sqlite` for per-year forecast history. Current flat JSON is sufficient for single-forecast-per-user use case.

---

## Frontend

```
src/App.tsx                     main layout + state (country, selectedYear, nav, chat)
src/lib/nav.ts                  nav item builders + SelectedView type
src/components/
  Sidebar.tsx                   left sidebar (logo, country toggle, views, years, footer)
  MainPanel.tsx                 content area router (summary/receipt/india/forecast/loading)
  Chat.tsx                      floating chat panel (right side)
  ForecastView.tsx              forecast page (state machine: loading/empty/generating/loaded/error)
  BracketBar.tsx                bracket position bar with fill% and headroom
  AssumptionsCard.tsx           AI assumptions list with confidence badges
  ActionItemsCard.tsx           action items with category icons and source year tags
  RiskFlags.tsx                 risk flags sorted high-before-medium
  IndiaRegimeCard.tsx           old vs new regime comparison
  ForecastChatStrip.tsx         chat invite at bottom of forecast view
  SummaryTable.tsx              US all-years table
  SummaryCharts.tsx             US multi-year charts (recharts)
  SummaryReceiptView.tsx        US summary receipt style
  ReceiptView.tsx               US single-year detail
  YearCharts.tsx                US single-year charts
  IndiaSummaryView.tsx          India all-years table
  IndiaSummaryCharts.tsx        India charts
  IndiaReceiptView.tsx          India single-year detail
  IndiaYearCharts.tsx           India single-year charts
```

Navigation: left sidebar (192px) with Views section (Summary / By Year / Forecast) and Years list. "By Year" is active when any year is selected; clicking it navigates to the most recent year.

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

---

## Testing

Test files live alongside source. Run: `bun test --testPathPattern="src/"`

```
Unit tests (138 passing):
  src/App.test.ts                    nav/selection logic
  src/index.test.ts                  server config regressions (idleTimeout, route format)
  src/lib/nav.test.ts                buildUsNavItems, buildIndiaNavItems, getDefault*, parseSelectedId (24)
  src/lib/format.test.ts             formatINRCompact, formatCurrency, formatPercent
  src/lib/tax-calculations.test.ts   getTotalTax, getNetIncome
  src/lib/summary.test.ts            summary recomputation
  src/lib/classifier.test.ts         return type classification
  src/lib/india-parser.test.ts       reconcileIndianReturn (10)
  src/lib/pdf-utils.test.ts          unwrapIfJavaSerialized (4)
  src/lib/time-units.test.ts         time unit conversions
  src/lib/forecaster.test.ts         buildForecastPrompt (6), parseForecastResponse (11)
  src/lib/forecast-cache.test.ts     getForecastCache, saveForecastCache, clearForecastCache (10)
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

**Why a single async function handler for /api/forecast instead of `{ GET, POST }`?**
Bun's `/*` SPA wildcard intercepts GET requests before the `{ GET: ... }` method object can handle them, returning the HTML page instead. A single function handler that branches on `req.method` bypasses this routing conflict.

**Why not silently show empty state on forecast GET failure?**
If the server is briefly unreachable (restart, deploy), the component would show "Generate Forecast" instead of an error — causing the user to accidentally regenerate and overwrite the cached forecast. Errors should always be surfaced so the user can retry.

**Why minify JSON in chat system prompt?**
Context window efficiency. Full return JSON with whitespace hit token limits; minified passes the same data at ~60% the cost.

**Why proactive token budget in India parser?**
Indian ITRs with full capital gains schedules can hit 429 rate limits on Haiku. A 60s sliding window on `response.usage.input_tokens` throttles automatically without user-visible errors.

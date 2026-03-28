# AI Forecast & Insights — Spec

Brainstormed: 2026-03-28
Mockup: `docs/forecast-mockup.html`

---

## Vision

A unified "Forecast" view that combines two things that shouldn't work in silos:

1. **Retroactive insights** — per past year, what could you have done to save more tax
2. **Forward forecast** — based on all past years, what's coming next year and what should you do about it *now*

Zero manual input. Claude reasons over your parsed tax history and produces a structured forecast with assumptions, action items, risk flags, and projected numbers. The chat underneath handles what-ifs.

---

## What exists today

- US + India tax returns parsed and stored (`.tax-returns.json`, `.india-tax-returns.json`)
- Summary view with YoY charts
- By Year detail view
- Chat (Claude Sonnet, year-aware)
- Country toggle (US / India)
- Top-header navigation with horizontal year tabs

---

## Phase 1 — Sidebar layout refactor

**Why first:** Everything else (Forecast nav item, Views section) depends on this shell.

**What changes:**
- Replace top header + horizontal tabs with a left sidebar (220px)
- Sidebar sections:
  - Logo ("TaxLens beta")
  - Country toggle (🇺🇸 US / 🇮🇳 India) — move from header
  - **Views** section: Summary, By Year, Forecast
  - **Years** section: list of all parsed years, descending
- Main content area takes remaining width
- Active item: right border (indigo) + subtle background highlight
- Keyboard shortcuts preserved (j/k still work)
- Mobile: sidebar collapses to hamburger

**Files affected:**
- `src/App.tsx` — main layout restructure
- `src/components/` — any header/nav components extracted

**Effort:** ~2–3 hours
**Risk:** Low — existing views are unchanged, only the shell around them moves

---

## Phase 2 — Forecast API endpoint

**Route:** `POST /api/forecast`

**Input:** All parsed US + India returns (full structured JSON, same as what chat uses)

**What Claude does:**
- Reads all years of income, effective rate, bracket, cap gains, deductions, TDS
- Identifies trends: salary growth rate, bonus frequency, cap gains variance, deduction pattern
- Projects forward 1 year with confidence ranges
- Surfaces retroactive insights from past years that are still actionable next year
- Returns structured JSON (typed response)

**Output schema:**
```ts
type ForecastResponse = {
  projectedYear: number

  // Top metrics
  taxLiability: { value: number; low: number; high: number }
  effectiveRate: { value: number; low: number; high: number }
  estimatedOutcome: { value: number; low: number; high: number; label: "refund" | "owed" }

  // Bracket
  bracket: {
    rate: number          // e.g. 22
    floor: number
    ceiling: number
    projectedIncome: number
    headroom: number      // ceiling - projectedIncome
  }

  // AI assumptions (shown as cards)
  assumptions: Array<{
    icon: string
    label: string
    value: string
    reasoning: string
    confidence: "high" | "medium" | "low"
  }>

  // What to do (from past + projected)
  actionItems: Array<{
    title: string
    description: string
    estimatedSaving: string
    sourceYear?: number    // "From 2024 insight"
    timing?: string        // "Q3 action", "Before filing"
    category: "retirement" | "capital_gains" | "india" | "deductions" | "withholding"
  }>

  // Risk flags
  riskFlags: Array<{
    severity: "high" | "medium"
    description: string
  }>

  // India (if applicable)
  india?: {
    regimeRecommendation: "old" | "new"
    oldRegimeTax: number
    newRegimeTax: number
    savingUnderRecommended: number
    reasoning: string
  }

  generatedAt: string   // ISO timestamp
}
```

**Caching:** Store last generated forecast in SQLite (see Phase 4). Don't re-call Claude on every page load — only on explicit "Regenerate".

**Model:** Claude Sonnet 4.6 (same as chat — no need for Opus)

**Effort:** ~2–3 hours
**Risk:** Medium — prompt engineering for reliable structured output is the hard part. Use `tool_use` / structured output to enforce schema.

---

## Phase 3 — Forecast view

**Nav item:** "🔮 Forecast" in sidebar Views section

**Layout (top to bottom):**

### Header
- Title: "{year} Forecast"
- Subtitle: "AI-generated from N years of tax history · Powered by Claude Sonnet"
- "Regenerate" button (re-calls API, overwrites cache)
- If no forecast exists yet: empty state with "Generate Forecast →" button

### Row 1 — Three metric cards
- Projected Tax Liability (federal + state, with range)
- Effective Rate (with range + YoY delta)
- Estimated Outcome (refund/owed, with range)

### Row 2 — Bracket position bar (full width)
- Visual bar showing bracket floor → projected income → ceiling
- Amber marker at ceiling
- Headroom label: "⚡ $X,XXX before hitting 24%"

### Row 3 — Two-column
- **Left:** AI Assumptions card (list of assumption items with confidence badges)
- **Right:** Action Items card (what to do, sourced from past insights + projection)

### Risk flags section
- Divider: "What could shift this forecast"
- List of high/medium risk items with colored dots

### India section (conditional, if India data exists)
- Regime comparison: old vs new, recommended highlighted in green

### Chat strip (bottom)
- Prompt: "Ask Claude anything — 'What if I sell my NVDA?' · 'What if no bonus?'"
- "Open chat →" button opens existing chat panel, pre-seeded with forecast context

**Components to build:**
- `ForecastView.tsx` — page container
- `BracketBar.tsx` — reusable bracket position bar (also useful in Year view)
- `AssumptionsCard.tsx`
- `ActionItemsCard.tsx`
- `RiskFlags.tsx`
- `IndiaRegimeCard.tsx`
- `ForecastChatStrip.tsx`

**Effort:** ~3–4 hours
**Risk:** Low — mostly rendering structured data that comes back from the API

---

## Phase 4 — SQLite for forecast caching (optional)

**Why:** Avoid re-calling Claude on every visit. Forecasts are expensive to generate and don't need to change unless you re-parse returns.

**What to add:**
- `src/lib/db.ts` — initialize `bun:sqlite` DB at `./data/taxlens.db`
- Schema:
  ```sql
  CREATE TABLE forecasts (
    id INTEGER PRIMARY KEY,
    year INTEGER NOT NULL,
    country TEXT NOT NULL,   -- 'us' | 'india'
    data TEXT NOT NULL,      -- JSON blob of ForecastResponse
    generated_at TEXT NOT NULL
  );
  ```
- `GET /api/forecast` — return cached forecast if exists
- `POST /api/forecast` — generate new, upsert cache
- Keep `.tax-returns.json` and `.india-tax-returns.json` as-is (no migration needed)

**Effort:** ~1–2 hours
**Risk:** Low — additive, no existing code changes

---

## ~~Phase 5 — Retroactive insights per year~~ ✓ Done 2026-03-28

Added InsightsPanel to the **By Year** receipt tab — what you could have done differently in that specific year.

**Examples:**
- "You were $8,200 into the 22% bracket — $8,200 more in 401k would have kept you in 12%"
- "You had $14k capital gains with no offsetting losses — harvesting $5k would have saved ~$1,100"
- India: "Old regime would have saved you ₹28k this year"

**How:** Small Claude call per year using `POST /api/insights/{year}`. Returns 2–4 insight cards. Cached in SQLite.

**Effort:** ~2 hours (after Phase 3 is done, patterns are established)

---

## Testing requirements per phase

### Phase 1 — Sidebar layout
- Unit: sidebar renders correct nav items for US-only, India-only, both countries
- Unit: active item highlights correctly for Summary / By Year / Forecast
- Unit: year list renders in descending order
- No integration tests needed (pure UI)

### Phase 2 — Forecast API
- Unit: `buildForecastPrompt()` includes all years' data in output
- Unit: `parseForecastResponse()` correctly maps Claude JSON → `ForecastResponse` type
- Unit: confidence levels parse correctly ("high" / "medium" / "low")
- Unit: missing India data → `india` field is undefined (not null/error)
- Integration: `POST /api/forecast` with fixture returns → valid `ForecastResponse` shape
- Integration: `GET /api/forecast` returns 404 when no cache exists
- Integration: `POST` then `GET` → returns cached value without re-calling Claude

### Phase 3 — Forecast view components
- Unit: `BracketBar` renders correct fill width at various income/ceiling ratios
- Unit: `BracketBar` shows headroom label when headroom > 0
- Unit: `AssumptionsCard` renders all assumptions with correct confidence badge colors
- Unit: `ActionItemsCard` renders saving amounts, source year tags
- Unit: `RiskFlags` renders high severity items before medium
- Unit: `IndiaRegimeCard` highlights recommended regime, shows correct saving

### Phase 4 — SQLite cache
- Unit: `saveForecast()` upserts correctly (second save for same year replaces first)
- Unit: `getForecast()` returns null when no row exists for year
- Unit: `getForecast()` returns correct data after save

### Phase 5 — Per-year insights
- Unit: `buildInsightsPrompt(year, returns)` includes only that year's data + prior years for context
- Integration: `POST /api/insights/2024` with fixture → valid insights array shape

---

## Model

All forecast and insights calls: **claude-sonnet-4-6** (same as chat and parsing).
No need for Opus — Sonnet handles multi-year structured reasoning well at lower cost.

---

## Build order

| Phase | What | Effort | Dependency |
|-------|------|--------|------------|
| 1 | Sidebar layout | ~2–3h | None |
| 2 | Forecast API | ~2–3h | None (parallel with Phase 1) |
| 3 | Forecast view | ~3–4h | Phases 1 + 2 |
| 4 | SQLite cache | ~1–2h | Phase 2 |
| 5 | Per-year insights | ~2h | Phase 3 patterns |

Total: ~10–14 hours of focused work

---

## What stays the same

- All existing views (Summary, By Year) — untouched
- Parsing pipeline (US + India) — untouched
- Chat panel — untouched, just gets forecast context added
- Data files (`.tax-returns.json`, `.india-tax-returns.json`) — untouched
- All 72 existing tests — should pass throughout

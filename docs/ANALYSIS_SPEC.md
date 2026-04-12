# Tax Analysis — Spec

*Original brainstorm: 2026-04-10*
*Architecture revised: 2026-04-11 (see Decision section below)*

---

## Vision

For every parsed year, a persistent **"Analysis"** tab in the By Year view that answers:

1. **Why did I owe / get a refund?** — root cause breakdown, not just the number
2. **Where did my income come from and how was each type taxed?**
3. **What drove my capital gains?** — by source (Phase 1), by security (Phase 2)
4. **What decisions shaped the return?** — deductions taken, credits claimed, regime choice
5. **What should I watch for next year?** — forward-looking from this year's data

Generated once, cached, accessible anytime from TaxLens — no re-asking Chat, no manual docs.

The 2025 ANALYSIS.md (`~/Projects/tax-planner/years/2025/ANALYSIS.md`) is the reference for
what ideal output looks like. The first real test of this tab is populating it with that document.

---

## Architecture Decision: Claude Code Generates, TaxLens Renders

### The original approach (revised away)

The original spec called for TaxLens to generate the analysis itself: 6 sequential Claude Sonnet
API calls per year, ~$0.30–$0.80 per generation, cached in `.analysis-cache.json`.

### Why we changed it

1. **Cost**: Each analysis run costs real API tokens. The parsing step (2-pass Sonnet on a
   multi-page PDF) is already the primary API cost. Stacking analysis on top adds up.

2. **Quality**: The 2025 ANALYSIS.md — generated via Claude Code — is more detailed, more
   accurate (it incorporated the CPA's actual numbers, the FTC limitation explanation, the
   Zerodha exchange rate nuance) than any automated pipeline could produce. It reflects
   iterative refinement and real context from the full conversation history.

3. **Token efficiency**: Claude Code tokens (included in subscription) are effectively free for
   this use case. There is no reason to pay Anthropic API tokens for a one-time-per-year
   operation when Claude Code can do it better for free.

4. **Personal tool fit**: TaxLens is a locally-run personal tool. The person using it has Claude
   Code. The automated pipeline adds complexity (rate limiting, retry logic, prompt versioning)
   that serves users who *don't* have Claude Code — which is not the primary audience right now.

### The new approach

```
Claude Code                         TaxLens
────────────────────────────────────────────────────────
/analyze-taxes 2025        →   POST /api/analysis?year=2025&country=us
/parse-return 2025.pdf     →   POST /api/returns               (future)
/parse-return itr.pdf      →   POST /api/india/returns         (future)
                           ←   GET  /api/analysis?year=2025&country=us
                               Analysis tab renders beautifully
```

TaxLens's `POST /api/analysis` endpoint accepts pre-generated JSON and saves it — no Claude
calls from the server. TaxLens is a **viewer and renderer**; Claude Code is the **AI engine**.

### What stays for other users

The existing upload flow (PDF drag & drop → API parsing) is unchanged and remains the primary
path for anyone who clones the repo without Claude Code. The new POST endpoints are additive —
a parallel import path that coexists with the traditional approach.

---

## This also applies to parsing (POST /api/returns)

The same logic applies to uploading tax returns. For personal use, instead of uploading a PDF
through the TaxLens UI (which calls the Anthropic API to parse it), a Claude Code skill can:

1. Read the PDF
2. Extract structured data matching the `TaxReturn` (or `IndianTaxReturn`) Zod schema
3. POST the JSON directly to TaxLens via `/api/returns` or `/api/india/returns`

This requires adding `POST /api/returns` and `POST /api/:country/returns` endpoints that accept
pre-parsed JSON, validate it against the schema, and save it. The existing PDF upload routes
(`/api/parse`, `/api/:country/parse`) remain untouched.

See `docs/CLAUDE_CODE_IMPORT.md` for the full design of the import endpoints.

---

## Phase 1 — Analysis tab (Claude Code → import → render)

### UX

New tab in the By Year view:

```
[ Receipt ]  [ Charts ]  [ Analysis ]   ← new tab
```

**Empty state:**
```
┌──────────────────────────────────────────────────────┐
│  Analysis — 2025                                      │
│                                                       │
│  Generate this analysis in Claude Code, then import  │
│  it here for a persistent, structured view.          │
│                                                       │
│  1. Copy the prompt below into Claude Code           │
│  2. Claude Code outputs JSON in the required schema  │
│  3. Paste the JSON here or run:                      │
│     POST /api/analysis?year=2025&country=us          │
│                                                       │
│  [ Copy prompt template ]   [ Paste JSON ]           │
│                                                       │
│  ─── or import from file ─────────────────────────── │
│  [ Import .json file ]                               │
└──────────────────────────────────────────────────────┘
```

The prompt template is pre-filled with the year's return data (from the parsed JSON already
in TaxLens) so the user can paste it directly into Claude Code with no manual data entry.

**Generated state (scrollable sections):**

```
┌──────────────────────────────────────────────────────┐
│ Tax Analysis — 2025                    ⟳ Regenerate  │
├──────────────────────────────────────────────────────┤
│ Tax Outcome                                          │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│ │  Owed    │  │Total Tax │  │ Eff Rate │           │
│ │ $19,986  │  │  $61,338 │  │  15.9%   │           │
│ └──────────┘  └──────────┘  └──────────┘           │
├──────────────────────────────────────────────────────┤
│ Why You Owed $19,986                                 │
│ [markdown — root cause breakdown]                    │
├──────────────────────────────────────────────────────┤
│ Income Story                                         │
│ [markdown — how each income type was taxed]          │
├──────────────────────────────────────────────────────┤
│ Capital Gains                                        │
│ [markdown — ST vs LT, by source]                    │
├──────────────────────────────────────────────────────┤
│ Key Decisions                                        │
│ [markdown — deductions, credits, regime]             │
├──────────────────────────────────────────────────────┤
│ Watch for 2026                                       │
│ [markdown — forward-looking]                         │
└──────────────────────────────────────────────────────┘
```

Sections are collapsible. "Regenerate" clears the cache and returns to the empty state
(prompting the user to run the Claude Code skill again).

---

## TypeScript schema

```ts
// src/lib/analysis-schema.ts

export type AnalysisSectionId =
  | "outcome"
  | "root_cause"
  | "income_story"
  | "capital_gains"
  | "key_decisions"
  | "watch_next_year"

export type AnalysisSection = {
  id: AnalysisSectionId
  title: string
  markdown: string       // rendered via remark-gfm, same as InsightsPanel
  generatedAt: string    // ISO timestamp from when Claude Code ran
}

export type AnalysisResponse = {
  year: number
  country: string
  sections: AnalysisSection[]
  generatedAt: string    // overall generation timestamp
  source: "claude_code" | "api"   // audit trail — who generated it
}
```

The `source` field distinguishes Claude Code-generated analysis from future server-side
generation. The rendering is identical either way — source is informational only.

---

## Cache

File: `.analysis-cache.json` in `DATA_DIR`.
Add to `.gitignore` (personal tax analysis data).

```ts
// src/lib/analysis-cache.ts  (mirrors insights-cache.ts — no version field needed
// since there is no server-side prompt to version)

type CacheShape = Record<string, AnalysisResponse>
// key: "${year}-${country}"  e.g. "2025-us"
```

No `ANALYSIS_PROMPT_VERSION` field — unlike the server-side forecast cache, there is no prompt
to version-invalidate. The user regenerates manually via Claude Code when they want fresh output.

---

## API routes

```
GET    /api/analysis?year=2025&country=us   → cached AnalysisResponse or 404
POST   /api/analysis?year=2025&country=us   → save pre-generated JSON, return it back
DELETE /api/analysis?year=2025&country=us   → clear cache (Regenerate)
```

`POST` does **not** call Claude. It validates the incoming JSON against the `AnalysisResponse`
shape and saves it to `.analysis-cache.json`. This is the same literal-path + query-param
routing pattern used by `/api/insights` and `/api/forecast-profile`.

---

## Tab wiring — where the Analysis tab actually lives

The original spec said to modify `src/countries/us/views.tsx` and `india/views.tsx`. This is
incorrect. The year view tab switcher (`yearViewMode: "receipt" | "charts"`) lives in
`MainPanel.tsx` and renders plugin components (`YearReceipt`, `YearCharts`) from there.

The Analysis tab is added to `MainPanel.tsx`:
- `YearViewMode` becomes `"receipt" | "charts" | "analysis"`
- `<AnalysisPanel>` is rendered directly from MainPanel (same pattern as `InsightsPanel` and
  `RetirementAccountsSection`), not as a plugin component
- The `CountryClientPlugin` interface does not need a new component slot — `AnalysisPanel`
  takes `year`, `country`, and `returnData` props that don't fit the `{ data: unknown }`
  shape of plugin components

The Analysis tab is shown for all countries (US and India) — the schema is country-agnostic.

---

## AnalysisPanel component

```
src/components/AnalysisPanel.tsx
```

Props:
```ts
interface Props {
  year: number
  country: string
  returnData: unknown   // passed through for the prompt template generation
}
```

State machine (mirrors InsightsPanel):
```ts
type State =
  | { status: "loading" }       // initial fetch
  | { status: "empty" }         // 404 — no cached analysis
  | { status: "loaded"; data: AnalysisResponse }
  | { status: "error"; message: string }
```

No "generating" state — generation happens externally in Claude Code, not in the component.

Key behaviours:
- On mount: `GET /api/analysis?year=N&country=X`
- "Regenerate" → `DELETE /api/analysis` → returns to empty state
- Empty state: shows prompt template (pre-filled with returnData JSON) + paste/import options
- Sections rendered as collapsible cards with markdown via `remark-gfm`
- "Paste JSON" opens a textarea dialog → validates → `POST /api/analysis` → re-fetches

---

## Prompt template (shown in empty state, for Claude Code)

The template is generated from the year's parsed return data already in TaxLens. It is shown
in the empty state as copyable text:

```
You are a tax analyst. Analyze my 2025 US tax return and produce a structured analysis.

## Return Data
[JSON of TaxReturn for this year — income, federal, states, summary, rates]

## Required Output Format
Return a JSON object exactly matching this schema:
{
  "year": 2025,
  "country": "us",
  "source": "claude_code",
  "generatedAt": "<ISO timestamp>",
  "sections": [
    {
      "id": "outcome",
      "title": "Tax Outcome",
      "markdown": "...",
      "generatedAt": "<ISO timestamp>"
    },
    {
      "id": "root_cause",
      "title": "Why You Owed / Got a Refund",
      "markdown": "...",
      "generatedAt": "<ISO timestamp>"
    },
    {
      "id": "income_story",
      "title": "Income Story",
      "markdown": "...",
      "generatedAt": "<ISO timestamp>"
    },
    {
      "id": "capital_gains",
      "title": "Capital Gains",
      "markdown": "...",
      "generatedAt": "<ISO timestamp>"
    },
    {
      "id": "key_decisions",
      "title": "Key Decisions",
      "markdown": "...",
      "generatedAt": "<ISO timestamp>"
    },
    {
      "id": "watch_next_year",
      "title": "Watch for [year+1]",
      "markdown": "...",
      "generatedAt": "<ISO timestamp>"
    }
  ]
}

POST the result to: http://localhost:3000/api/analysis?year=2025&country=us
or paste it into TaxLens (Analysis tab → Paste JSON).
```

---

## Populating 2025 immediately (first use of the tab)

The 2025 ANALYSIS.md at `~/Projects/tax-planner/years/2025/ANALYSIS.md` contains everything
needed for all six sections. The first use of the Analysis tab will be to convert that document
into the `AnalysisResponse` JSON schema and POST it to TaxLens.

This happens as a one-time Claude Code task — not part of the TaxLens implementation itself.
Once the AnalysisPanel component and API route exist, run in Claude Code:

```
Read ~/Projects/tax-planner/years/2025/ANALYSIS.md and convert it to the AnalysisResponse
JSON schema. POST the result to http://localhost:3000/api/analysis?year=2025&country=us
```

---

## Files to create / modify

| File | Action | Notes |
|------|--------|-------|
| `src/lib/analysis-schema.ts` | Create | `AnalysisSectionId`, `AnalysisSection`, `AnalysisResponse` types |
| `src/lib/analysis-cache.ts` | Create | Read/write `.analysis-cache.json`; key = `"${year}-${country}"` |
| `src/components/AnalysisPanel.tsx` | Create | State machine, prompt template, section renderer |
| `src/index.ts` | Modify | Add `/api/analysis` GET/POST/DELETE route |
| `src/components/MainPanel.tsx` | Modify | Add `"analysis"` to `YearViewMode`, render `AnalysisPanel` |
| `.gitignore` | Modify | Add `.analysis-cache.json` |

**Not created (vs original spec):**
- `src/lib/analyzer.ts` — no server-side generation
- No rate limiting / retry logic
- No prompt versioning

---

## Testing requirements

**Unit:**
- `getAnalysisCache("2025-us")` returns null when file is empty
- `saveAnalysisCache` then `getAnalysisCache` returns the saved value
- `getAnalysisCache` returns null for a different key after saving one
- `AnalysisResponse` with all 6 sections validates correctly
- `AnalysisResponse` with unknown `sectionId` is handled gracefully in the renderer
- Prompt template generation includes the year's return data JSON

**Integration:**
- `GET /api/analysis?year=2025&country=us` → 404 when no cache
- `POST /api/analysis?year=2025&country=us` with valid JSON → 200, saved
- `GET` after `POST` → returns saved value
- `DELETE /api/analysis?year=2025&country=us` → clears; subsequent `GET` → 404
- `POST` with malformed JSON → 400

---

## Phase 2 — Source document uploads (security-level capital gains)

Unchanged from original spec. When supplemental source docs (Robinhood 1099-B, Zerodha P&L,
etc.) are added in a future phase, the capital gains section of the analysis can be enriched
with security-level detail. The Claude Code skill would incorporate that data when regenerating.

See bottom of original spec for the Phase 2 storage schema, API routes, and parser list.

---

## What stays the same from the original spec

- All existing views (Summary, By Year Receipt + Charts, Forecast) — untouched
- Country plugin architecture — Analysis uses `?country=us` query param pattern
- Chat panel — untouched
- All existing tests — must pass throughout
- The six section IDs and titles are identical
- The `AnalysisSection.markdown` + `remark-gfm` rendering approach is identical

---

## Reference

- 2025 reference analysis (first content to populate the tab):
  `~/Projects/tax-planner/years/2025/ANALYSIS.md`
- Existing InsightsPanel (closest structural analogue for the component):
  `src/components/InsightsPanel.tsx`
- Existing cache pattern: `src/lib/insights-cache.ts`
- Import endpoint design: `docs/CLAUDE_CODE_IMPORT.md`
- Bun routing pattern (literal paths + query params): `CLAUDE.md` → Patterns section

*Original spec: 2026-04-10 | Architecture revised: 2026-04-11*

# Claude Code Import — Design

*Written: 2026-04-11*

---

## The Pattern

For a personal, locally-run tool like TaxLens, there are two classes of AI work:

| Class | Tool | Why |
|-------|------|-----|
| Parsing PDFs (one-time per year) | Claude Code skill | Free tokens, better quality, interactive |
| Tax analysis (one-time per year) | Claude Code skill | Free tokens, full context, iterative |
| Chat (on-demand, interactive) | Anthropic API | Real-time, session-aware, fits the UX |
| Forecast (one-time per year) | Anthropic API (current) | Could move to Claude Code later |

The insight: **generation and rendering do not need to happen in the same tool**. Claude Code
generates structured JSON that matches TaxLens's schemas, then TaxLens reads it and renders it
beautifully. The API key in TaxLens settings is only strictly needed for Chat.

```
Claude Code                              TaxLens
─────────────────────────────────────────────────────────
/parse-return us 2025.pdf    →   POST /api/returns
/parse-return india itr.pdf  →   POST /api/india/returns
/analyze-taxes us 2025       →   POST /api/analysis?year=2025&country=us
                             ←   GET  all of the above
                                 Beautiful rendering in all tabs
```

This coexists with the existing upload flow — users who don't have Claude Code can still upload
PDFs through the TaxLens UI using the API key path. The new import endpoints are additive.

---

## Import Endpoints

### POST /api/returns — pre-parsed US return

Accepts a `TaxReturn` JSON body, validates it against `TaxReturnSchema`, saves via `saveReturn`.

```ts
"/api/returns": {
  GET: async () => Response.json(await getReturns()),
  POST: async (req: Request) => {
    const body = await req.json()
    const migrated = usServerPlugin.migrateReturn?.(body) ?? body
    const parsed = TaxReturnSchema.safeParse(migrated)
    if (!parsed.success) {
      return Response.json({ error: "Invalid TaxReturn schema", issues: parsed.error.issues }, { status: 400 })
    }
    await saveReturn(parsed.data)
    return Response.json({ success: true, year: parsed.data.year })
  }
}
```

### POST /api/:country/returns — pre-parsed non-US return

Reuses the existing country plugin's schema for validation.

```ts
"/api/:country/returns": {
  GET: async (req) => { ... },  // existing
  POST: async (req) => {
    const plugin = SERVER_REGISTRY[req.params.country]
    if (!plugin) return Response.json({ error: "Unknown country" }, { status: 404 })
    const body = await req.json()
    const migrated = plugin.migrateReturn?.(body) ?? body
    const parsed = plugin.schema.safeParse(migrated)
    if (!parsed.success) {
      return Response.json({ error: `Invalid ${plugin.code} return schema` }, { status: 400 })
    }
    await saveCountryReturn(plugin, parsed.data)
    return Response.json({ success: true })
  }
}
```

### POST /api/analysis — pre-generated analysis

Accepts an `AnalysisResponse` JSON body and saves to cache. No Claude calls.
See `docs/ANALYSIS_SPEC.md` for full route spec.

---

## Claude Code Skills to Build

These live in the `taxlens` project (or `tax-planner`) as Claude Code skills (`.claude/commands/`).

### /parse-return

**Usage:** `/parse-return us 2025-1040.pdf` or `/parse-return india itr-2024.pdf`

**What it does:**
1. Read the PDF at the given path
2. Extract structured data matching the `TaxReturn` or `IndianTaxReturn` schema
   (schema defined in `src/lib/schema.ts` — readable by Claude Code)
3. Run basic validation (required fields present, year makes sense)
4. POST to `http://localhost:3000/api/returns` (or `/api/india/returns`)
5. Report success with the year that was saved

**Notes:**
- The TaxReturn Zod schema in `src/lib/schema.ts` is the source of truth for what to extract
- For US returns: extract from 1040, Schedule D, Schedule A, state returns
- For India returns: extract from ITR-1 or ITR-2

### /analyze-taxes

**Usage:** `/analyze-taxes us 2025` or `/analyze-taxes india 2024`

**What it does:**
1. Read the year's return data from TaxLens: `GET http://localhost:3000/api/returns` (or
   `/api/india/returns`), filter to the requested year
2. Generate an `AnalysisResponse` JSON covering all six sections (see schema in
   `src/lib/analysis-schema.ts`)
3. POST to `http://localhost:3000/api/analysis?year=N&country=X`
4. Confirm saved — next time the Analysis tab is opened in TaxLens, it will render

**Section content guidance:**
- `outcome`: key numbers (owed/refund, total tax, effective rate) — derive from return data
- `root_cause`: withheld vs owed delta, breakdown by source (wages, capital gains, interest)
- `income_story`: how each income type was classified and taxed
- `capital_gains`: ST vs LT breakdown, by source where known
- `key_decisions`: deductions taken (itemized vs standard), credits, regime choice
- `watch_next_year`: forward-looking actions, withholding adjustment, safe harbor target

**For 2025 specifically:** The `~/Projects/tax-planner/years/2025/ANALYSIS.md` already contains
all the content. Converting it to JSON is the first use of this skill.

---

## Workflow for a New Tax Year

For each new year (e.g., when 2026 returns are ready in early 2027):

```
1. Get PDF from IRS/CPA
2. In Claude Code: /parse-return us 2026-1040.pdf
   → TaxLens shows the year in all summary views immediately
3. In Claude Code: /analyze-taxes us 2026
   → Analysis tab fills in for 2026
```

No Anthropic API costs for either step (beyond Chat).

---

## Populating 2025 Immediately

The 2025 ANALYSIS.md already exists at `~/Projects/tax-planner/years/2025/ANALYSIS.md`.
Once `POST /api/analysis` and `AnalysisPanel` are built, run in Claude Code:

```
Read ~/Projects/tax-planner/years/2025/ANALYSIS.md.
Convert it to the AnalysisResponse JSON schema (defined in
/home/harshit-shah/Projects/taxlens/src/lib/analysis-schema.ts once that file exists).
Use source: "claude_code".
POST to http://localhost:3000/api/analysis?year=2025&country=us.
```

---

## What the Anthropic API Is Still Used For in TaxLens

Even with Claude Code import in place, the Anthropic API key in TaxLens is still used for:

| Feature | Model | Notes |
|---------|-------|-------|
| Chat | claude-sonnet-4-6 | Real-time, session-aware — fits API model |
| Chat suggestions | claude-haiku-4-5 | Lightweight follow-up suggestions |
| PDF parsing (upload path) | claude-sonnet-4-6 | Legacy path for users without Claude Code |
| API key validation | claude-haiku-4-5 | One-time on setup |
| Forecast | claude-sonnet-4-6 | Could move to Claude Code in future |
| Insights | claude-sonnet-4-6 | Could move to Claude Code in future |

The API key is optional for users who use the Claude Code import path for parsing. It remains
required for Chat. The setup dialog should communicate this.

---

## Files to Create / Modify

| File | Action | Notes |
|------|--------|-------|
| `src/index.ts` | Modify | Add `POST` handler to `/api/returns` and `/api/:country/returns` |
| `.claude/commands/parse-return.md` | Create | Claude Code skill for PDF parsing |
| `.claude/commands/analyze-taxes.md` | Create | Claude Code skill for analysis generation |

The analysis import endpoint (`POST /api/analysis`) is covered in `docs/ANALYSIS_SPEC.md`.

---

## Testing requirements

**Unit:**
- `POST /api/returns` with valid `TaxReturn` JSON → saves and returns `{ success: true, year }`
- `POST /api/returns` with invalid JSON → 400 with schema issues
- `POST /api/returns` for an existing year → overwrites (same as upload path)
- `POST /api/:country/returns` with valid schema → saves via `saveCountryReturn`
- `POST /api/:country/returns` with unknown country → 404

---

*Written: 2026-04-11*

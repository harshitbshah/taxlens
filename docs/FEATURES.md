# Feature Backlog

Brainstormed: 2026-03-18

## Compelling (high value, users need this)

- **Tax bracket visualizer** — show exactly where income falls across federal brackets, color-coded. Instantly see how close you are to the next bracket.
- **Year-over-year delta highlights** — "Your effective rate jumped 2.3% in 2022 — here's why" surfaced automatically by Claude, not just raw numbers.
- **What-if simulator** — sliders for "What if I contributed $X more to 401k?" or "What if I had $Y more in capital gains?" that recalculate estimated tax in real time. Pure frontend.
- **Multi-year income sources breakdown** — stacked area chart showing how income mix shifted (W-2 vs RSUs vs capital gains vs foreign) over the years.

## Necessary (fills obvious gaps)

- **PDF export** — download a summary/analysis as PDF to share with a CPA or keep for records. Frontend only (browser print or jspdf).
- **Missing form detector** — Claude scans your return and flags issues like "you had RSU income but I don't see a cost basis adjustment" or "FBAR threshold may have been crossed."
- ~~**India / foreign income section**~~ — **Done (2026-03-21)**: ITR-1 and ITR-2 parsing, income/tax charts, YoY badges, country toggle. Remaining: Form 1116 / FTC carryover tracking between US and India views.
- **Annotation layer** — add notes to any line item ("this was the Amazon sign-on RSU vest") that persist across sessions.

## Nice to Have

- **CPA handoff package** — one-click export of structured data + anomaly flags formatted for a CPA to review.
- **Keyboard shortcuts** — `j/k` to navigate years, `c` to open chat, `1/2` to toggle views.
- **Deduction opportunity detector** — "You're in the 24% bracket, a $15K 401k contribution would save you ~$3,600."
- **State tax breakdown drilldown** — why are you filing in multiple states? Visual timeline, split residency explanation.
- **Search across all years** — "show me all years where I had wash sales" or "find every year capital gains exceeded $5K."

## Ambitious

- **Tax projection for current year** — import YTD brokerage statements (Fidelity, Robinhood, Zerodha), project what this year's return will look like before filing.
- **Optimal withholding calculator** — based on prior year patterns, recommend exact W-4 settings to avoid large year-end bills or overwithholding.
- **Multi-country tax dashboard** — side-by-side US (1040) and India (ITR) view, DTAA credit reconciliation, total worldwide tax burden.
- **LLM-powered anomaly detection** — Claude reads all years, flags statistical outliers, compares against known IRS audit triggers.
- **Collaborative / CPA mode** — share a read-only link with your CPA who can annotate without needing your API key or raw PDFs.

## Architecture Notes

- Frontend: React 19 + Tailwind CSS v4
- Backend: Bun server (`src/index.ts`) — single process, localhost only
- Storage: local filesystem (JSON) + localStorage (API key)
- No cloud, no auth, privacy-first by design
- Pure frontend features: what-if simulator, bracket visualizer, PDF export, keyboard shortcuts
- Needs backend additions: brokerage API integration, projection engine, collaborative mode

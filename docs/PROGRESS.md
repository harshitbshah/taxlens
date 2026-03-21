# Progress Log

One entry per checkpoint. Most recent first.

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

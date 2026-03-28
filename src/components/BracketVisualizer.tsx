import { getUsConstants } from "../lib/constants";
import { formatCompact, formatCurrency } from "../lib/format";
import type { TaxReturn } from "../lib/schema";
import { computeBracketTax } from "../lib/tax-calculations";

// Color per bracket rate — warm gradient: green (low) → red (high)
const RATE_COLORS: Record<number, string> = {
  10: "#10b981",
  12: "#14b8a6",
  22: "#3b82f6",
  24: "#6366f1",
  32: "#f59e0b",
  35: "#f97316",
  37: "#ef4444",
};

function bracketKey(status: TaxReturn["filingStatus"]): "single" | "mfj" | "hoh" {
  if (status === "married_filing_jointly" || status === "qualifying_surviving_spouse") return "mfj";
  if (status === "head_of_household") return "hoh";
  return "single";
}

const STATUS_LABELS: Record<TaxReturn["filingStatus"], string> = {
  single: "Single",
  married_filing_jointly: "Married Filing Jointly",
  married_filing_separately: "Married Filing Separately",
  head_of_household: "Head of Household",
  qualifying_surviving_spouse: "Qualifying Surviving Spouse",
};

interface Props {
  data: TaxReturn;
  // When set by the what-if simulator, the bar reflects this income instead of data.federal.taxableIncome.
  adjustedTaxableIncome?: number;
}

export function BracketVisualizer({ data, adjustedTaxableIncome }: Props) {
  const constants = getUsConstants(data.year);
  if (!constants) return null;

  const originalIncome = data.federal.taxableIncome;
  const taxableIncome = adjustedTaxableIncome ?? originalIncome;
  if (taxableIncome <= 0 && originalIncome <= 0) return null;

  const isAdjusted =
    adjustedTaxableIncome !== undefined && adjustedTaxableIncome !== originalIncome;
  const allBrackets = constants.brackets[bracketKey(data.filingStatus)];

  // Last bracket whose floor is at or below taxable income = marginal bracket
  const incomeForBracket = Math.max(taxableIncome, 1); // avoid 0 edge case
  const marginalIdx = allBrackets.reduce(
    (best, b, i) => (b.floor <= incomeForBracket ? i : best),
    0,
  );

  // Show brackets 0 through marginalIdx inclusive
  const brackets = allBrackets.slice(0, marginalIdx + 1);
  const marginalBracket = brackets[marginalIdx];
  if (!marginalBracket) return null;

  const nextBracket = allBrackets[marginalIdx + 1];

  // Display range: up to marginal bracket ceiling (or 1.2× income for top bracket).
  // When adjusted, ensure the original income position is also visible.
  const rawMax =
    marginalBracket.ceiling === Infinity ? taxableIncome * 1.2 : marginalBracket.ceiling;
  const displayMax = isAdjusted ? Math.max(rawMax, originalIncome * 1.05) : rawMax;

  const headroom =
    marginalBracket.ceiling === Infinity ? null : marginalBracket.ceiling - taxableIncome;

  // Per-bracket computed data
  const segments = brackets.map((bracket, i) => {
    const isMarginal = i === marginalIdx;
    const effectiveCeil = bracket.ceiling === Infinity ? taxableIncome : bracket.ceiling;

    const income = Math.max(0, Math.min(taxableIncome, effectiveCeil) - bracket.floor);
    const tax = income * (bracket.rate / 100);

    const bracketDisplayEnd = Math.min(effectiveCeil, displayMax);
    const bracketFraction = (bracketDisplayEnd - bracket.floor) / displayMax;
    const filledFraction = income / displayMax;
    const unfilledFraction = isMarginal ? Math.max(0, bracketFraction - filledFraction) : 0;

    return { bracket, income, tax, isMarginal, filledFraction, unfilledFraction };
  });

  const computedTax = computeBracketTax(taxableIncome, allBrackets);
  const originalComputedTax = isAdjusted ? computeBracketTax(originalIncome, allBrackets) : null;
  const taxDelta = originalComputedTax !== null ? computedTax - originalComputedTax : 0;

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg) p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-medium text-(--color-text-secondary)">
          Federal Tax Brackets — {data.year}
        </span>
        {isAdjusted && (
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
            what-if
          </span>
        )}
      </div>
      <div className="mb-4 text-xs text-(--color-text-muted)">
        {STATUS_LABELS[data.filingStatus]} ·{" "}
        {isAdjusted ? (
          <>
            <span className="line-through">{formatCurrency(originalIncome)}</span>
            <span className="ml-1 font-medium text-(--color-text)">
              {formatCurrency(taxableIncome)}
            </span>
          </>
        ) : (
          <>Taxable income {formatCurrency(taxableIncome)}</>
        )}
      </div>

      {/* Stacked bracket bar with original-income marker in what-if mode */}
      <div className="relative h-7 w-full overflow-hidden rounded-md">
        <div className="absolute inset-0 flex">
          {segments.map((seg, i) => {
            const color = RATE_COLORS[seg.bracket.rate] ?? "#6b7280";
            return (
              <span key={i} className="flex h-full">
                {seg.filledFraction > 0 && (
                  <span
                    style={{ width: `${seg.filledFraction * 100}%`, background: color }}
                    title={`${seg.bracket.rate}%: ${formatCurrency(seg.income)} → ${formatCurrency(seg.tax)} tax`}
                  />
                )}
                {seg.unfilledFraction > 0 && (
                  <span
                    style={{ width: `${seg.unfilledFraction * 100}%` }}
                    className="bg-neutral-200 dark:bg-neutral-700"
                    title={`${seg.bracket.rate}% headroom: ${formatCurrency(headroom ?? 0)} remaining`}
                  />
                )}
              </span>
            );
          })}
        </div>
        {/* Original income position marker (only visible in what-if mode) */}
        {isAdjusted && (
          <div
            className="pointer-events-none absolute top-0 h-full w-0.5 bg-white/75"
            style={{ left: `${Math.min(99, (originalIncome / displayMax) * 100)}%` }}
            title={`Original: ${formatCurrency(originalIncome)}`}
          />
        )}
      </div>

      {/* Axis labels */}
      <div className="relative mt-1 h-4">
        <span className="absolute left-0 text-[10px] text-(--color-text-muted)">$0</span>
        {marginalBracket.ceiling !== Infinity && (
          <span className="absolute right-0 text-[10px] text-(--color-text-muted)">
            {formatCompact(marginalBracket.ceiling)}
          </span>
        )}
        <span
          className="absolute -translate-x-1/2 text-[10px] font-medium text-(--color-text)"
          style={{ left: `${Math.min(95, (taxableIncome / displayMax) * 100)}%` }}
        >
          {formatCompact(taxableIncome)}
        </span>
        {isAdjusted && (
          <span
            className="absolute -translate-x-1/2 text-[10px] text-(--color-text-muted)"
            style={{ left: `${Math.min(95, (originalIncome / displayMax) * 100)}%` }}
          >
            was {formatCompact(originalIncome)}
          </span>
        )}
      </div>

      {/* Callout */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className="rounded px-2 py-0.5 text-xs font-semibold text-white"
          style={{ background: RATE_COLORS[marginalBracket.rate] ?? "#6b7280" }}
        >
          {marginalBracket.rate}% marginal bracket
        </span>
        {headroom !== null && nextBracket ? (
          <span className="text-xs text-(--color-text-muted)">
            {formatCurrency(headroom)} headroom to the {nextBracket.rate}% bracket
          </span>
        ) : (
          <span className="text-xs text-(--color-text-muted)">Top bracket</span>
        )}
      </div>

      {/* Per-bracket breakdown table */}
      <div className="mt-3 space-y-1">
        {segments.map((seg, i) => {
          const color = RATE_COLORS[seg.bracket.rate] ?? "#6b7280";
          const ceiling = seg.bracket.ceiling === Infinity ? null : seg.bracket.ceiling;
          return (
            <div
              key={i}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs ${
                seg.isMarginal ? "bg-(--color-bg-muted)" : ""
              }`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
              <span className="w-7 shrink-0 font-medium text-(--color-text)">
                {seg.bracket.rate}%
              </span>
              <span className="w-28 shrink-0 text-(--color-text-muted)">
                {formatCompact(seg.bracket.floor)}
                {ceiling ? ` – ${formatCompact(ceiling)}` : "+"}
              </span>
              <span className="flex-1 text-(--color-text-muted)">{formatCurrency(seg.income)}</span>
              <span className="shrink-0 font-medium text-(--color-text) tabular-nums">
                {formatCurrency(seg.tax)}
              </span>
              {seg.isMarginal && (
                <span className="shrink-0 rounded bg-(--color-bg-subtle) px-1.5 py-0.5 text-[10px] text-(--color-text-muted)">
                  you are here
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: computed tax vs filed tax */}
      <div className="mt-3 border-t border-(--color-border) pt-2.5 text-xs">
        {isAdjusted ? (
          <div className="flex items-center justify-between">
            <span className="text-(--color-text-muted)">Bracket tax change</span>
            <span
              className={`font-semibold tabular-nums ${
                taxDelta < 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {formatCurrency(taxDelta, true)}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-(--color-text-muted)">Bracket-computed federal tax</span>
              <span className="font-semibold text-(--color-text) tabular-nums">
                {formatCurrency(computedTax)}
              </span>
            </div>
            {Math.abs(computedTax - data.federal.tax) > 500 && (
              <p className="mt-1 text-[11px] text-(--color-text-muted)">
                Return shows {formatCurrency(data.federal.tax)} — difference may reflect AMT, QBI
                deduction, or other adjustments not captured in bracket math.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

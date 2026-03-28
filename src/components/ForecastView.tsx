import type { ForecastState } from "../App";
import { formatCurrency, formatPercent } from "../lib/format";
import type { TaxReturn } from "../lib/schema";
import { ActionItemsCard } from "./ActionItemsCard";
import { AssumptionsCard } from "./AssumptionsCard";
import { BracketBar } from "./BracketBar";
import { ForecastChatStrip } from "./ForecastChatStrip";
import { IndiaRegimeCard } from "./IndiaRegimeCard";
import { RiskFlags } from "./RiskFlags";

interface Props {
  returns: Record<number, TaxReturn>;
  forecastState: ForecastState;
  onGenerate: (regenerate?: boolean) => void;
  onToggleChat?: () => void;
}

function MetricCard({
  label,
  value,
  range,
  badge,
}: {
  label: string;
  value: string;
  range: string;
  badge?: { text: string; color: "green" | "amber" | "neutral" };
}) {
  const badgeColors = {
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    neutral: "bg-(--color-bg-muted) text-(--color-text-muted)",
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-(--color-border) bg-(--color-bg) p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest text-(--color-text-muted) uppercase">
          {label}
        </span>
        {badge && (
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${badgeColors[badge.color]}`}
          >
            {badge.text}
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold text-(--color-text) tabular-nums">{value}</div>
      <div className="text-xs text-(--color-text-muted)">{range}</div>
    </div>
  );
}

function GeneratingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

export function ForecastView({ returns, forecastState: state, onGenerate, onToggleChat }: Props) {
  const yearCount = Object.keys(returns).length;

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center text-(--color-text-muted)">
        <GeneratingDots />
      </div>
    );
  }

  if (state.status === "generating") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-(--color-text-muted)">
        <GeneratingDots />
        <p className="text-sm">Claude is analyzing {yearCount} years of tax history…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-(--color-text-muted)">
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{state.message}</p>
        <button
          onClick={() => onGenerate()}
          className="cursor-pointer rounded-md border border-(--color-border) px-4 py-2 text-sm transition-colors hover:bg-(--color-bg-muted)"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-(--color-text-muted)">
        <span className="text-4xl">🔮</span>
        <div className="text-center">
          <p className="text-sm font-medium text-(--color-text)">AI Tax Forecast</p>
          <p className="mt-1 max-w-xs text-xs">
            Claude will analyze your {yearCount} years of tax history and project next year&apos;s
            liability, surface action items, and compare India regimes.
          </p>
        </div>
        <button
          onClick={() => onGenerate()}
          className="cursor-pointer rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Generate Forecast →
        </button>
      </div>
    );
  }

  // Loaded
  const { data } = state;
  const { projectedYear, taxLiability, effectiveRate, estimatedOutcome, bracket } = data;

  const outcomeSign = estimatedOutcome.value >= 0 ? "+" : "";
  const outcomeBadge =
    estimatedOutcome.label === "refund"
      ? { text: "Likely refund", color: "green" as const }
      : { text: "Likely owed", color: "amber" as const };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-(--color-text)">{projectedYear} Forecast</h1>
            <p className="mt-0.5 text-xs text-(--color-text-muted)">
              AI-generated from {yearCount} years of tax history · Powered by Claude Sonnet
            </p>
          </div>
          <button
            onClick={() => onGenerate(true)}
            className="cursor-pointer rounded-md border border-(--color-border) px-3 py-1.5 text-xs text-(--color-text-muted) transition-colors hover:bg-(--color-bg-muted) hover:text-(--color-text)"
          >
            ⟳ Regenerate
          </button>
        </div>

        {/* Three metric cards */}
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Projected Tax Liability"
            value={formatCurrency(taxLiability.value)}
            range={`Range: ${formatCurrency(taxLiability.low)} – ${formatCurrency(taxLiability.high)}`}
            badge={{ text: "Federal + State", color: "neutral" }}
          />
          <MetricCard
            label="Effective Rate"
            value={formatPercent(effectiveRate.value)}
            range={`Range: ${formatPercent(effectiveRate.low)} – ${formatPercent(effectiveRate.high)}`}
          />
          <MetricCard
            label="Estimated Outcome"
            value={`${outcomeSign}${formatCurrency(estimatedOutcome.value)}`}
            range={`Range: ${outcomeSign}${formatCurrency(estimatedOutcome.low)} to ${formatCurrency(estimatedOutcome.high)}`}
            badge={outcomeBadge}
          />
        </div>

        {/* Bracket bar */}
        <BracketBar {...bracket} />

        {/* Assumptions + Action items */}
        <div className="grid grid-cols-2 gap-3">
          <AssumptionsCard assumptions={data.assumptions} />
          <ActionItemsCard actionItems={data.actionItems} />
        </div>

        {/* Risk flags */}
        {data.riskFlags.length > 0 && <RiskFlags riskFlags={data.riskFlags} />}

        {/* India regime (conditional) */}
        {data.india && <IndiaRegimeCard india={data.india} />}

        {/* Chat strip */}
        <ForecastChatStrip onOpenChat={onToggleChat ?? (() => {})} />
      </div>
    </div>
  );
}

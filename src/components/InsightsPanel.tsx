import { useEffect, useState } from "react";

import type { InsightItem } from "../lib/insights";
import { getTaxConstants } from "../lib/tax-constants";

const CATEGORY_ICONS: Record<InsightItem["category"], string> = {
  retirement: "🏦",
  capital_gains: "📉",
  india: "🇮🇳",
  deductions: "🏠",
  withholding: "💼",
};

interface Props {
  year: number;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "generating" }
  | { status: "loaded"; items: InsightItem[] }
  | { status: "error"; message: string };

function ConstantsBadge({ year }: { year: number }) {
  const verified = getTaxConstants(year) !== null;
  return (
    <span
      className={
        verified
          ? "rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
          : "rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
      }
      title={
        verified
          ? `Verified IRS constants on file for ${year}`
          : `No verified IRS constants on file for ${year} — Claude will use training data`
      }
    >
      {verified ? `✓ ${year} verified` : `⚠ ${year} unverified`}
    </span>
  );
}

function InsightCard({ item }: { item: InsightItem }) {
  return (
    <div className="flex gap-3 rounded-lg border border-(--color-border) bg-(--color-bg) p-4">
      <span className="mt-0.5 shrink-0 text-lg">{CATEGORY_ICONS[item.category]}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-(--color-text)">{item.title}</p>
          {item.estimatedSaving && (
            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              Save {item.estimatedSaving}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-(--color-text-muted)">{item.description}</p>
      </div>
    </div>
  );
}

export function InsightsPanel({ year }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    setState({ status: "loading" });
    fetch(`/api/insights?year=${year}`)
      .then(async (res) => {
        if (res.status === 404) {
          setState({ status: "idle" });
        } else if (res.ok) {
          const items = (await res.json()) as InsightItem[];
          setState({ status: "loaded", items });
        } else {
          setState({ status: "error", message: `Failed to load insights (HTTP ${res.status})` });
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Could not reach server";
        setState({ status: "error", message });
      });
  }, [year]);

  async function generate() {
    setState({ status: "generating" });
    try {
      const res = await fetch(`/api/insights?year=${year}`, { method: "POST" });
      if (!res.ok) {
        let message = `Server error ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // non-JSON error body
        }
        setState({ status: "error", message });
        return;
      }
      const items = (await res.json()) as InsightItem[];
      setState({ status: "loaded", items });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setState({ status: "error", message });
    }
  }

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-2 md:px-0">
        <div className="h-20 animate-pulse rounded-lg bg-(--color-bg-muted)" />
      </div>
    );
  }

  if (state.status === "generating") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-4 md:px-0">
        <div className="flex items-center justify-between rounded-lg border border-(--color-border) bg-(--color-bg) p-5">
          <p className="text-xs text-(--color-text-muted)">Analyzing {year} return…</p>
          <ConstantsBadge year={year} />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-4 md:px-0">
        <div className="flex items-center justify-between rounded-lg border border-(--color-border) bg-(--color-bg) p-4">
          <p className="text-xs text-rose-600 dark:text-rose-400">{state.message}</p>
          <button
            onClick={generate}
            className="ml-3 shrink-0 cursor-pointer rounded-md border border-(--color-border) px-3 py-1.5 text-xs transition-colors hover:bg-(--color-bg-muted)"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "idle") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-4 md:px-0">
        <div className="flex items-center justify-between rounded-lg border border-(--color-border) bg-(--color-bg) p-4">
          <div>
            <p className="text-sm font-medium text-(--color-text)">{year} Insights</p>
            <p className="mt-0.5 text-xs text-(--color-text-muted)">
              What you could have done differently to reduce your tax bill
            </p>
            <div className="mt-2">
              <ConstantsBadge year={year} />
            </div>
          </div>
          <button
            onClick={generate}
            className="ml-4 shrink-0 cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Generate →
          </button>
        </div>
      </div>
    );
  }

  // Loaded
  return (
    <div className="mx-auto max-w-2xl px-4 py-4 md:px-0">
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold tracking-widest text-(--color-text-muted) uppercase">
            {year} Insights
          </p>
          <ConstantsBadge year={year} />
        </div>
        <button
          onClick={generate}
          className="cursor-pointer rounded-md border border-(--color-border) px-2.5 py-1 text-xs text-(--color-text-muted) transition-colors hover:bg-(--color-bg-muted) hover:text-(--color-text)"
        >
          ⟳ Regenerate
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {state.items.map((item, i) => (
          <InsightCard key={i} item={item} />
        ))}
      </div>
    </div>
  );
}

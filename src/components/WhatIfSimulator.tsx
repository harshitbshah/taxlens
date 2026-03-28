import { useEffect, useState } from "react";

import { getUsConstants } from "../lib/constants";
import { formatCompact, formatCurrency } from "../lib/format";
import type { TaxReturn } from "../lib/schema";
import { computeBracketTax } from "../lib/tax-calculations";

function bracketKey(status: TaxReturn["filingStatus"]): "single" | "mfj" | "hoh" {
  if (status === "married_filing_jointly" || status === "qualifying_surviving_spouse") return "mfj";
  if (status === "head_of_household") return "hoh";
  return "single";
}

interface SliderRowProps {
  label: string;
  sublabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  formatValue: (v: number) => string;
}

function SliderRow({
  label,
  sublabel,
  min,
  max,
  step,
  value,
  onChange,
  formatValue,
}: SliderRowProps) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-(--color-text)">{label}</span>
        <span className="text-xs font-semibold text-(--color-text) tabular-nums">
          {formatValue(value)}
        </span>
      </div>
      <div className="mb-0.5 text-[10px] text-(--color-text-muted)">{sublabel}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-(--color-bg-muted) accent-indigo-500"
      />
    </div>
  );
}

interface Props {
  data: TaxReturn;
  onDeltaChange: (delta: number) => void;
}

export function WhatIfSimulator({ data, onDeltaChange }: Props) {
  const constants = getUsConstants(data.year);

  const [k401, setK401] = useState(0);
  const [ira, setIra] = useState(0);
  const [deductions, setDeductions] = useState(0);
  const [capGains, setCapGains] = useState(0);

  // Reduce income (contributions/deductions) minus capital gains additions
  const delta = -(k401 + ira + deductions) + capGains;
  const hasChanges = delta !== 0;

  useEffect(() => {
    onDeltaChange(delta);
  }, [delta, onDeltaChange]);

  function reset() {
    setK401(0);
    setIra(0);
    setDeductions(0);
    setCapGains(0);
  }

  if (!constants) {
    return (
      <div className="rounded-xl border border-(--color-border) bg-(--color-bg) p-5">
        <p className="text-xs text-(--color-text-muted)">
          What-if simulator requires verified tax constants — none on file for {data.year}.
        </p>
      </div>
    );
  }

  const brackets = constants.brackets[bracketKey(data.filingStatus)];
  const originalIncome = data.federal.taxableIncome;
  const adjustedIncome = Math.max(0, originalIncome + delta);
  const originalTax = computeBracketTax(originalIncome, brackets);
  const adjustedTax = computeBracketTax(adjustedIncome, brackets);
  const taxDelta = adjustedTax - originalTax; // negative = savings

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg) p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-(--color-text-secondary)">What-if Simulator</div>
          <div className="text-[11px] text-(--color-text-muted)">
            Adjust sliders to see how changes affect your bracket tax
          </div>
        </div>
        {hasChanges && (
          <button
            onClick={reset}
            className="cursor-pointer rounded-md border border-(--color-border) px-2.5 py-1 text-xs text-(--color-text-muted) transition-colors hover:bg-(--color-bg-muted) hover:text-(--color-text)"
          >
            Reset
          </button>
        )}
      </div>

      <div className="space-y-4">
        <SliderRow
          label="401(k) top-up"
          sublabel={`Pre-tax contribution · ${data.year} employee limit: ${formatCurrency(constants.contributions.k401)}`}
          min={0}
          max={constants.contributions.k401}
          step={500}
          value={k401}
          onChange={setK401}
          formatValue={(v) => (v > 0 ? `-${formatCurrency(v)}` : "$0")}
        />
        <SliderRow
          label="IRA contribution"
          sublabel={`Traditional IRA deduction · ${data.year} limit: ${formatCurrency(constants.contributions.ira)}`}
          min={0}
          max={constants.contributions.ira}
          step={100}
          value={ira}
          onChange={setIra}
          formatValue={(v) => (v > 0 ? `-${formatCurrency(v)}` : "$0")}
        />
        <SliderRow
          label="Additional deductions"
          sublabel="Charitable, mortgage interest, state taxes, etc."
          min={0}
          max={50000}
          step={500}
          value={deductions}
          onChange={setDeductions}
          formatValue={(v) => (v > 0 ? `-${formatCurrency(v)}` : "$0")}
        />
        <SliderRow
          label="Capital gain / loss adjustment"
          sublabel="Negative = harvest losses · LTCG may qualify for 0%/15%/20% preferential rates"
          min={-50000}
          max={50000}
          step={1000}
          value={capGains}
          onChange={setCapGains}
          formatValue={(v) => formatCurrency(v, true)}
        />
      </div>

      {/* Results */}
      {hasChanges && (
        <div className="mt-4 space-y-2 border-t border-(--color-border) pt-3">
          {/* Taxable income delta */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-(--color-text-muted)">Taxable income</span>
            <span className="text-(--color-text) tabular-nums">
              {formatCompact(originalIncome)}
              <span className="mx-1.5 text-(--color-text-muted)">→</span>
              <span
                className={
                  delta < 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }
              >
                {formatCompact(adjustedIncome)}
              </span>
              <span className="ml-1.5 text-(--color-text-muted)">
                ({formatCurrency(delta, true)})
              </span>
            </span>
          </div>

          {/* Bracket tax delta */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-(--color-text-muted)">Bracket tax</span>
            <span className="text-(--color-text) tabular-nums">
              {formatCurrency(originalTax)}
              <span className="mx-1.5 text-(--color-text-muted)">→</span>
              <span
                className={
                  taxDelta < 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }
              >
                {formatCurrency(adjustedTax)}
              </span>
            </span>
          </div>

          {/* Summary callout */}
          {taxDelta < -50 && (
            <div className="mt-1 rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              ✓ Estimated bracket tax savings: {formatCurrency(-taxDelta)}
            </div>
          )}
          {taxDelta > 50 && (
            <div className="mt-1 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">
              ↑ Estimated bracket tax increase: {formatCurrency(taxDelta)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

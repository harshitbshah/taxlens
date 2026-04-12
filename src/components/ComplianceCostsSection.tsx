import { useEffect, useState } from "react";

import { chargesTotal, complianceTotal, type CountryCosts } from "../lib/filing-costs-schema";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface Props {
  country: string;
  years: number[];
  yearLabel?: (year: number) => string;
  currency?: string;
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

export interface EditDialogProps {
  open: boolean;
  year: number;
  yearLabel: string;
  country: string;
  existing: CountryCosts | null;
  currency: string;
  onClose: () => void;
  onSaved: (costs: CountryCosts) => void;
}

export function EditDialog({
  open,
  year,
  yearLabel,
  country,
  existing,
  currency,
  onClose,
  onSaved,
}: EditDialogProps) {
  const isIndia = country === "india";

  const [filingAmount, setFilingAmount] = useState("");
  const [filingMethod, setFilingMethod] = useState("");
  const [charges, setCharges] = useState<Array<{ label: string; amount: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFilingAmount(existing?.filing?.amount !== undefined ? String(existing.filing.amount) : "");
    setFilingMethod(existing?.filing?.method ?? "");
    setCharges(
      existing?.charges?.map((c) => ({ label: c.label, amount: String(c.amount) })) ??
        (isIndia ? [{ label: "", amount: "" }] : []),
    );
    setError(null);
  }, [open, existing, isIndia]);

  function addCharge() {
    setCharges((prev) => [...prev, { label: "", amount: "" }]);
  }

  function removeCharge(i: number) {
    setCharges((prev) => prev.filter((_, j) => j !== i));
  }

  function updateCharge(i: number, field: "label" | "amount", value: string) {
    setCharges((prev) => prev.map((c, j) => (j === i ? { ...c, [field]: value } : c)));
  }

  async function handleSave() {
    setError(null);
    const costs: CountryCosts = {};

    if (filingAmount.trim() !== "") {
      const amt = parseFloat(filingAmount);
      if (isNaN(amt) || amt < 0) {
        setError("Filing cost must be a non-negative number");
        return;
      }
      costs.filing = { amount: amt };
      if (filingMethod.trim()) costs.filing.method = filingMethod.trim();
    }

    if (isIndia) {
      const validCharges = charges.filter((c) => c.label.trim() && c.amount.trim() !== "");
      if (validCharges.length > 0) {
        const parsed = validCharges.map((c) => ({
          label: c.label.trim(),
          amount: parseFloat(c.amount),
        }));
        if (parsed.some((c) => isNaN(c.amount) || c.amount < 0)) {
          setError("All charge amounts must be non-negative numbers");
          return;
        }
        costs.charges = parsed;
      }
    }

    if (!costs.filing && !costs.charges?.length) {
      setError("Enter at least one cost");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/filing-costs?year=${year}&country=${country}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(costs),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      onSaved(costs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Cost of Compliance — ${yearLabel}`}
      size="md"
      footer={
        <div className="flex justify-end gap-2 border-t border-(--color-border) px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 px-6 py-5">
        {/* Filing cost */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-(--color-text-muted)">Filing cost</p>
          <div className="flex gap-2">
            <div className="relative w-36">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-(--color-text-muted)">
                {currency}
              </span>
              <input
                type="number"
                min="0"
                value={filingAmount}
                onChange={(e) => setFilingAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-(--color-border) bg-(--color-bg-subtle) py-2 pr-3 pl-7 text-sm text-(--color-text) outline-none focus:border-(--color-text-muted)"
              />
            </div>
            <input
              type="text"
              value={filingMethod}
              onChange={(e) => setFilingMethod(e.target.value)}
              placeholder="CPA, FreeTaxUSA, DIY…"
              className="flex-1 rounded-lg border border-(--color-border) bg-(--color-bg-subtle) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-text-muted)"
            />
          </div>
        </div>

        {/* Brokerage & other charges (India only) */}
        {isIndia && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-(--color-text-muted)">
              Brokerage &amp; other charges
            </p>
            <div className="space-y-2">
              {charges.map((charge, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={charge.label}
                    onChange={(e) => updateCharge(i, "label", e.target.value)}
                    placeholder="STT, Brokerage, GST…"
                    className="w-32 shrink-0 rounded-lg border border-(--color-border) bg-(--color-bg-subtle) px-3 py-2 text-sm text-(--color-text) outline-none focus:border-(--color-text-muted)"
                  />
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-(--color-text-muted)">
                      {currency}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={charge.amount}
                      onChange={(e) => updateCharge(i, "amount", e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border border-(--color-border) bg-(--color-bg-subtle) py-2 pr-3 pl-8 text-sm text-(--color-text) outline-none focus:border-(--color-text-muted)"
                    />
                  </div>
                  <button
                    onClick={() => removeCharge(i)}
                    className="cursor-pointer rounded-lg border border-(--color-border) px-2.5 text-sm text-(--color-text-muted) transition-colors hover:bg-(--color-bg-muted) hover:text-(--color-text)"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={addCharge}
                className="cursor-pointer text-xs text-(--color-text-muted) transition-colors hover:text-(--color-text)"
              >
                + Add charge
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    </Dialog>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function ComplianceCostsSection({
  country,
  years,
  yearLabel = (y) => String(y),
  currency = "$",
}: Props) {
  const [costs, setCosts] = useState<Record<number, CountryCosts>>({});
  const [editingYear, setEditingYear] = useState<number | null>(null);
  const isIndia = country === "india";

  useEffect(() => {
    fetch(`/api/filing-costs?country=${country}`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setCosts(data as Record<number, CountryCosts>))
      .catch(() => {});
  }, [country]);

  if (years.length === 0) return null;

  return (
    <div className="border-t border-(--color-border) bg-(--color-bg) px-6 py-5">
      <p className="mb-3 text-xs font-semibold tracking-widest text-(--color-text-muted) uppercase">
        Cost of Compliance
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-(--color-text-muted)">
            <th className="pb-2 text-left font-medium">Year</th>
            <th className="pb-2 text-right font-medium">Filing</th>
            {isIndia && <th className="pb-2 text-right font-medium">Charges</th>}
            <th className="pb-2 text-right font-medium">Total</th>
            <th className="pb-2 text-right font-medium" />
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const yearCosts = costs[year] ?? null;
            const filing = yearCosts?.filing?.amount ?? null;
            const charges = yearCosts ? chargesTotal(yearCosts) : null;
            const total = yearCosts ? complianceTotal(yearCosts) : null;
            const hasData = yearCosts !== null;

            return (
              <tr key={year} className="border-t border-(--color-border)">
                <td className="py-2 text-(--color-text-muted)">{yearLabel(year)}</td>

                <td className="py-2 text-right tabular-nums">
                  {filing !== null ? (
                    <>
                      <span className="text-(--color-text)">
                        {currency}
                        {filing.toLocaleString()}
                      </span>
                      {yearCosts?.filing?.method && (
                        <span className="ml-1 text-xs text-(--color-text-muted)">
                          ({yearCosts.filing.method})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-(--color-text-tertiary)">—</span>
                  )}
                </td>

                {isIndia && (
                  <td className="py-2 text-right tabular-nums">
                    {charges !== null && charges > 0 ? (
                      <span className="text-(--color-text)">
                        {currency}
                        {charges.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-(--color-text-tertiary)">—</span>
                    )}
                  </td>
                )}

                <td className="py-2 text-right font-medium tabular-nums">
                  {total !== null ? (
                    <span className="text-(--color-text)">
                      {currency}
                      {total.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-(--color-text-tertiary)">—</span>
                  )}
                </td>

                <td className="py-2 text-right">
                  <button
                    onClick={() => setEditingYear(year)}
                    className="cursor-pointer text-xs text-(--color-text-muted) transition-colors hover:text-(--color-text)"
                  >
                    {hasData ? "Edit" : "Add"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editingYear !== null && (
        <EditDialog
          open
          year={editingYear}
          yearLabel={yearLabel(editingYear)}
          country={country}
          existing={costs[editingYear] ?? null}
          currency={currency}
          onClose={() => setEditingYear(null)}
          onSaved={(newCosts) => {
            setCosts((prev) => ({ ...prev, [editingYear]: newCosts }));
            setEditingYear(null);
          }}
        />
      )}
    </div>
  );
}

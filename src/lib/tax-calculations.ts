import type { BracketEntry } from "./constants";
import type { TaxReturn } from "./schema";

export function getTotalTax(data: TaxReturn): number {
  const federalBase = data.federal.tax;
  const federalAdditional = data.federal.additionalTaxes.reduce((sum, t) => sum + t.amount, 0);
  const stateTaxes = data.states.reduce((sum, s) => sum + s.tax, 0);
  return federalBase + federalAdditional + stateTaxes;
}

export function getNetIncome(data: TaxReturn): number {
  return data.income.total - getTotalTax(data);
}

// Computes federal income tax from bracket math alone (no AMT, no credits, no LTCG adjustments).
// Useful for what-if scenarios where you want the marginal-bracket effect of a change.
export function computeBracketTax(taxableIncome: number, brackets: BracketEntry[]): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.floor) break;
    const ceiling =
      bracket.ceiling === Infinity ? taxableIncome : Math.min(taxableIncome, bracket.ceiling);
    tax += (ceiling - bracket.floor) * (bracket.rate / 100);
  }
  return tax;
}

export function getEffectiveRate(data: TaxReturn): number {
  if (data.rates?.combined?.effective) {
    return data.rates.combined.effective / 100;
  }
  return getTotalTax(data) / data.income.total;
}

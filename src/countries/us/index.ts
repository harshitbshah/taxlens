import { formatUsConstantsForPrompt, getUsConstants } from "../../lib/constants/us";
import type { CountryServerPlugin } from "../../lib/country-registry";
import { extractYearFromPdf, parseTaxReturn } from "../../lib/parser";
import { type TaxReturn, TaxReturnSchema } from "../../lib/schema";

function buildYearSummary(r: TaxReturn): object {
  const capGainsItems = r.income.items.filter(
    (i) =>
      i.label.toLowerCase().includes("capital gain") || i.label.toLowerCase().includes("cap gain"),
  );
  return {
    year: r.year,
    filingStatus: r.filingStatus,
    incomeTotalLine9: r.income.total,
    incomeItems: r.income.items.map((i) => ({ label: i.label, amount: i.amount })),
    capitalGainsItems: capGainsItems,
    agi: r.federal.agi,
    deductions: r.federal.deductions.map((d) => ({ label: d.label, amount: d.amount })),
    taxableIncome: r.federal.taxableIncome,
    federalTax: r.federal.tax,
    additionalTaxes: r.federal.additionalTaxes,
    credits: r.federal.credits,
    federalRefundOrOwed: r.federal.refundOrOwed,
    effectiveRate: r.rates?.federal.effective,
    marginalRate: r.rates?.federal.marginal,
    states: r.states.map((s) => ({
      name: s.name,
      taxableIncome: s.taxableIncome,
      tax: s.tax,
      refundOrOwed: s.refundOrOwed,
    })),
    netPosition: r.summary.netPosition,
  };
}

export const usServerPlugin: CountryServerPlugin = {
  code: "us",
  name: "United States",
  flag: "🇺🇸",
  currency: "$",
  storageFile: ".tax-returns.json",
  schema: TaxReturnSchema,

  // Backfill missing array fields from old stored data before schema validation.
  migrateReturn: (raw) => {
    const ret = raw as Record<string, unknown>;
    const fed = (ret.federal ?? {}) as Record<string, unknown>;
    return {
      ...ret,
      dependents: ret.dependents ?? [],
      federal: {
        ...fed,
        deductions: fed.deductions ?? [],
        additionalTaxes: fed.additionalTaxes ?? [],
        credits: fed.credits ?? [],
        payments: fed.payments ?? [],
      },
      states: ((ret.states ?? []) as Record<string, unknown>[]).map((s) => ({
        ...s,
        deductions: s.deductions ?? [],
        adjustments: s.adjustments ?? [],
        payments: s.payments ?? [],
      })),
    };
  },

  getYear: (r) => (r as TaxReturn).year,
  yearLabel: (year) => String(year),
  summaryLabel: "All time",

  parseReturn: (pdfBase64, apiKey) => parseTaxReturn(pdfBase64, apiKey),
  extractYearFromPdf: async (pdfBase64, apiKey) => {
    const year = await extractYearFromPdf(pdfBase64, apiKey);
    return year !== null ? { year } : null;
  },

  buildYearSummary: (r) => buildYearSummary(r as TaxReturn),

  constants: {
    get: (year) => getUsConstants(year),
    format: (c) => formatUsConstantsForPrompt(c as NonNullable<ReturnType<typeof getUsConstants>>),
  },

  forecast: {
    schemaSnippet: (_projectedYear) => `"bracket": {
    "rate": number,
    "floor": number,
    "ceiling": number,
    "projectedIncome": number,
    "headroom": number
  }`,
    parseExtension: (raw) => (raw.bracket ? { bracket: raw.bracket } : {}),
  },
};

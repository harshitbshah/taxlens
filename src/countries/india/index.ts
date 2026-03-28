import { formatIndiaConstantsForPrompt, getIndiaConstants } from "../../lib/constants/india";
import type { CountryServerPlugin } from "../../lib/country-registry";
import { extractIndianYearFromPdf, parseIndianReturn } from "../../lib/india-parser";
import { type IndianTaxReturn, IndianTaxReturnSchema } from "../../lib/schema";

function buildYearSummary(r: IndianTaxReturn): object {
  return {
    financialYear: r.financialYear,
    assessmentYear: r.assessmentYear,
    itrForm: r.itrForm,
    salary: r.income.salary.reduce((s, i) => s + i.amount, 0),
    capitalGainsStcg: r.income.capitalGains.stcg.total,
    capitalGainsLtcg: r.income.capitalGains.ltcg.total,
    otherSources: r.income.otherSources.reduce((s, i) => s + i.amount, 0),
    grossIncome: r.income.grossTotal,
    deductions: r.deductions.map((d) => ({ label: d.label, amount: d.amount })),
    taxableIncome: r.taxableIncome,
    grossTax: r.tax.grossTax,
    totalTaxLiability: r.tax.totalTaxLiability,
    totalTaxPaid: r.tax.totalTaxPaid,
    refundOrDue: r.tax.refundOrDue,
  };
}

export const indiaServerPlugin: CountryServerPlugin = {
  code: "india",
  name: "India",
  flag: "🇮🇳",
  currency: "₹",
  storageFile: ".india-tax-returns.json",
  schema: IndianTaxReturnSchema,

  getYear: (r) => (r as IndianTaxReturn).financialYear,
  yearLabel: (fy) => `FY ${fy}-${String(fy + 1).slice(-2)}`,
  summaryLabel: "All years",

  parseReturn: (pdfBase64, apiKey) => parseIndianReturn(pdfBase64, apiKey),
  extractYearFromPdf: (pdfBase64, apiKey) => extractIndianYearFromPdf(pdfBase64, apiKey),

  buildYearSummary: (r) => buildYearSummary(r as IndianTaxReturn),

  constants: {
    get: (year) => getIndiaConstants(year),
    format: (c) =>
      formatIndiaConstantsForPrompt(c as NonNullable<ReturnType<typeof getIndiaConstants>>),
  },

  forecast: {
    schemaSnippet: (_projectedYear) => `"india": {
    "regimeRecommendation": "old" | "new",
    "oldRegimeTax": number,
    "newRegimeTax": number,
    "savingUnderRecommended": number,
    "reasoning": string
  }`,
    parseExtension: (raw) => (raw.india ? { india: raw.india } : {}),
    promptInstruction:
      "For India: compare old vs new regime for the upcoming FY based on recent ITR history. Recommend the better one. Return oldRegimeTax and newRegimeTax as plain integers in INR (no commas, no ₹ symbol).",
  },
};

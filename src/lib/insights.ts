import Anthropic from "@anthropic-ai/sdk";

import {
  formatIndiaConstantsForPrompt,
  formatUsConstantsForPrompt,
  getIndiaConstants,
  getUsConstants,
} from "./constants";
import type { IndianTaxReturn, TaxReturn } from "./schema";

export type InsightItem = {
  title: string;
  description: string;
  estimatedSaving?: string;
  category: "retirement" | "capital_gains" | "india" | "deductions" | "withholding";
};

// Build focused per-year prompt: selected year in full, other years as compact summaries.
export function buildInsightsPrompt(
  year: number,
  usReturns: Record<number, TaxReturn>,
  indiaReturns: Record<number, IndianTaxReturn>,
): string {
  const r = usReturns[year];
  if (!r) throw new Error(`No US return for year ${year}`);

  const otherYears = Object.keys(usReturns)
    .map(Number)
    .filter((y) => y !== year)
    .sort((a, b) => a - b);

  const otherSummaries = otherYears.map((y) => {
    const other = usReturns[y]!;
    return {
      year: y,
      income: other.income.total,
      taxableIncome: other.federal.taxableIncome,
      federalTax: other.federal.tax,
      effectiveRate: other.rates?.federal.effective,
      marginalRate: other.rates?.federal.marginal,
      netPosition: other.summary.netPosition,
    };
  });

  const capGainsItems = r.income.items.filter(
    (i) =>
      i.label.toLowerCase().includes("capital gain") || i.label.toLowerCase().includes("cap gain"),
  );

  const selectedYearData = {
    year,
    filingStatus: r.filingStatus,
    income: r.income.total,
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

  // Include India return for the same financial year if it exists.
  // India FY maps to calendar year as: FY 2023-24 → calendar year 2023.
  const matchingIndiaReturn = Object.values(indiaReturns).find(
    (ir) => ir.financialYear === year || ir.financialYear === year - 1,
  );
  const indiaData = matchingIndiaReturn
    ? {
        financialYear: matchingIndiaReturn.financialYear,
        itrForm: matchingIndiaReturn.itrForm,
        grossIncome: matchingIndiaReturn.income.grossTotal,
        taxableIncome: matchingIndiaReturn.taxableIncome,
        deductions: matchingIndiaReturn.deductions.map((d) => ({
          label: d.label,
          amount: d.amount,
        })),
        grossTax: matchingIndiaReturn.tax.grossTax,
        totalTaxLiability: matchingIndiaReturn.tax.totalTaxLiability,
        totalTaxPaid: matchingIndiaReturn.tax.totalTaxPaid,
        refundOrDue: matchingIndiaReturn.tax.refundOrDue,
      }
    : null;

  const schemaDoc = `[
  {
    "title": string (short, e.g. "Max out 401k"),
    "description": string (1–3 sentences — concrete numbers, bracket math, what specifically could have saved money),
    "estimatedSaving": string (e.g. "$1,200" or "₹28,000" — omit if impossible to estimate),
    "category": "retirement" | "capital_gains" | "india" | "deductions" | "withholding"
  }
]`;

  const constants = getUsConstants(year);

  const parts: string[] = [
    `You are a retroactive tax advisor. Analyze the user's ${year} tax return and identify 2–4 specific things they could have done differently to reduce their tax liability for that year.`,
    "",
    `Focus on: bracket optimization (401k/IRA contributions to drop below a bracket boundary), capital gains harvesting or loss harvesting, deduction opportunities, withholding adjustments, and—if India data is present—old vs new regime comparison.`,
    "",
    `Be concrete and quantitative. Cite specific dollar amounts and bracket boundaries. If the user was already in a low bracket or well-optimized, say so briefly in 1–2 items instead of inventing issues.`,
    "",
    `## ${year} US Return (full detail)`,
    JSON.stringify(selectedYearData, null, 2),
  ];

  if (otherSummaries.length > 0) {
    parts.push("", "## Other years (for context only)", JSON.stringify(otherSummaries, null, 2));
  }

  if (constants) {
    parts.push("", formatUsConstantsForPrompt(constants));
  } else {
    parts.push(
      "",
      `## Note on ${year} tax constants`,
      `No verified IRS constants are on file for ${year}. Use your best knowledge but note any bracket or limit figures as unverified.`,
    );
  }

  if (indiaData) {
    // India FY for insights: matchingIndiaReturn.financialYear
    const indiaFY = matchingIndiaReturn!.financialYear;
    const indiaConstants = getIndiaConstants(indiaFY);
    if (indiaConstants) {
      parts.push("", formatIndiaConstantsForPrompt(indiaConstants));
    } else {
      parts.push(
        "",
        `## Note on FY ${indiaFY}-${String(indiaFY + 1).slice(2)} India tax constants`,
        `No verified India constants on file for FY ${indiaFY}. Use best knowledge but flag figures as unverified.`,
      );
    }
    parts.push("", `## India ITR for same period`, JSON.stringify(indiaData, null, 2));
  }

  parts.push(
    "",
    "## Instructions",
    "- Return 2–4 insight items. Fewer is better if the return was well-optimized.",
    "- Be specific: include dollar amounts, bracket rates, and what action would have saved what.",
    "- Do NOT suggest actions that are clearly impossible for that year (e.g. filing a different status if single).",
    "- For India: if India data is present, compare old vs new regime and include a regime insight.",
    "- Return ONLY a valid JSON array. No markdown, no explanation outside the JSON.",
    "",
    "## Required output schema",
    schemaDoc,
  );

  return parts.join("\n");
}

// Strips markdown code fences and extracts the JSON array.
function extractJsonArray(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1]!.trim();
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1) return text.slice(firstBracket, lastBracket + 1);
  return text.trim();
}

const VALID_CATEGORY = new Set([
  "retirement",
  "capital_gains",
  "india",
  "deductions",
  "withholding",
]);

export function parseInsightsResponse(text: string): InsightItem[] {
  const json = extractJsonArray(text);
  const raw = JSON.parse(json) as unknown[];
  if (!Array.isArray(raw)) throw new Error("Expected JSON array");

  return raw.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      title: String(r.title ?? ""),
      description: String(r.description ?? ""),
      ...(typeof r.estimatedSaving === "string" && r.estimatedSaving
        ? { estimatedSaving: r.estimatedSaving }
        : {}),
      category: VALID_CATEGORY.has(String(r.category))
        ? (String(r.category) as InsightItem["category"])
        : "deductions",
    };
  });
}

export async function generateInsights(
  year: number,
  usReturns: Record<number, TaxReturn>,
  indiaReturns: Record<number, IndianTaxReturn>,
  apiKey: string,
): Promise<InsightItem[]> {
  const client = new Anthropic({ apiKey });
  const prompt = buildInsightsPrompt(year, usReturns, indiaReturns);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system:
      "You are a retroactive tax advisor. You produce structured JSON arrays of tax insights. Return ONLY valid JSON with no markdown or explanation.",
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return parseInsightsResponse(textBlock.text);
}

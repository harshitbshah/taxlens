import Anthropic from "@anthropic-ai/sdk";

import type { IndianTaxReturn, TaxReturn } from "./schema";

export type ForecastResponse = {
  projectedYear: number;

  taxLiability: { value: number; low: number; high: number };
  effectiveRate: { value: number; low: number; high: number };
  estimatedOutcome: { value: number; low: number; high: number; label: "refund" | "owed" };

  bracket: {
    rate: number;
    floor: number;
    ceiling: number;
    projectedIncome: number;
    headroom: number;
  };

  assumptions: Array<{
    icon: string;
    label: string;
    value: string;
    reasoning: string;
    confidence: "high" | "medium" | "low";
  }>;

  actionItems: Array<{
    title: string;
    description: string;
    estimatedSaving: string;
    sourceYear?: number;
    timing?: string;
    category: "retirement" | "capital_gains" | "india" | "deductions" | "withholding";
  }>;

  riskFlags: Array<{
    severity: "high" | "medium";
    description: string;
  }>;

  india?: {
    regimeRecommendation: "old" | "new";
    oldRegimeTax: number;
    newRegimeTax: number;
    savingUnderRecommended: number;
    reasoning: string;
  };

  generatedAt: string;
};

// Build a condensed per-year summary to send to Claude.
// Avoids sending the full raw JSON (which includes display-only fields) and keeps tokens lean.
function buildUsYearSummary(year: number, r: TaxReturn) {
  const capGainsItems = r.income.items.filter(
    (i) =>
      i.label.toLowerCase().includes("capital gain") || i.label.toLowerCase().includes("cap gain"),
  );
  return {
    year,
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

function buildIndiaYearSummary(r: IndianTaxReturn) {
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

export function buildForecastPrompt(
  usReturns: Record<number, TaxReturn>,
  indiaReturns: Record<number, IndianTaxReturn>,
): string {
  const usYears = Object.keys(usReturns)
    .map(Number)
    .sort((a, b) => a - b);
  const indiaYears = Object.keys(indiaReturns)
    .map(Number)
    .sort((a, b) => a - b);

  const usSummaries = usYears.map((y) => buildUsYearSummary(y, usReturns[y]!));
  const indiaSummaries = indiaYears.map((y) => buildIndiaYearSummary(indiaReturns[y]!));

  const projectedYear = usYears.length > 0 ? Math.max(...usYears) + 1 : new Date().getFullYear();
  const hasIndia = indiaSummaries.length > 0;

  const schemaDoc = `{
  "projectedYear": ${projectedYear},
  "taxLiability": { "value": number, "low": number, "high": number },
  "effectiveRate": { "value": number, "low": number, "high": number },
  "estimatedOutcome": { "value": number, "low": number, "high": number, "label": "refund" | "owed" },
  "bracket": {
    "rate": number,
    "floor": number,
    "ceiling": number,
    "projectedIncome": number,
    "headroom": number
  },
  "assumptions": [
    {
      "icon": string (single emoji),
      "label": string (short, e.g. "Salary growth"),
      "value": string (e.g. "+5%" or "$280,000"),
      "reasoning": string (1–2 sentences explaining why),
      "confidence": "high" | "medium" | "low"
    }
  ],
  "actionItems": [
    {
      "title": string,
      "description": string,
      "estimatedSaving": string (e.g. "$1,200" or "₹28,000"),
      "sourceYear": number (optional — year this insight was derived from),
      "timing": string (optional — e.g. "Before Dec 31" or "Q3"),
      "category": "retirement" | "capital_gains" | "india" | "deductions" | "withholding"
    }
  ],
  "riskFlags": [
    { "severity": "high" | "medium", "description": string }
  ],
  ${
    hasIndia
      ? `"india": {
    "regimeRecommendation": "old" | "new",
    "oldRegimeTax": number,
    "newRegimeTax": number,
    "savingUnderRecommended": number,
    "reasoning": string
  },`
      : ""
  }
  "generatedAt": "${new Date().toISOString()}"
}`;

  const parts: string[] = [
    `You are a tax planning analyst. Analyze the user's full tax history and produce a structured forecast for ${projectedYear}.`,
    "",
    "## US Tax History",
    JSON.stringify(usSummaries, null, 2),
  ];

  if (hasIndia) {
    parts.push("", "## India ITR History", JSON.stringify(indiaSummaries, null, 2));
  }

  parts.push(
    "",
    "## Instructions",
    `- Project ${projectedYear} US federal + state taxes based on observed trends (income growth, deduction patterns, capital gains variance)`,
    "- Surface 3–5 action items — mix of forward-looking optimizations and retroactive insights from past years that are still actionable",
    "- For each assumption, state your reasoning and confidence level honestly",
    "- For risk flags: only flag genuine uncertainties (capital gains variance, bonus likelihood, rate changes). Max 3 flags.",
    hasIndia
      ? "- For India: compare old vs new regime for the upcoming year based on recent ITR history. Recommend the better one."
      : "",
    "- taxLiability = projected combined federal + state tax owed (before withholding)",
    "- estimatedOutcome = refund (positive value) or owed (negative value) at filing time, based on projected withholding trends",
    "- Return ONLY valid JSON. No markdown, no explanation outside the JSON.",
    "",
    "## Required output schema",
    schemaDoc,
  );

  return parts.filter((p) => p !== null).join("\n");
}

// Strips markdown code fences if Claude wraps its response.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1]!.trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) return text.slice(firstBrace, lastBrace + 1);
  return text.trim();
}

export function parseForecastResponse(text: string): ForecastResponse {
  const json = extractJson(text);
  const raw = JSON.parse(json) as Record<string, unknown>;

  // Validate required top-level fields
  if (typeof raw.projectedYear !== "number") throw new Error("Missing projectedYear");
  if (!raw.taxLiability || !raw.effectiveRate || !raw.estimatedOutcome || !raw.bracket) {
    throw new Error("Missing required metric fields");
  }
  if (
    !Array.isArray(raw.assumptions) ||
    !Array.isArray(raw.actionItems) ||
    !Array.isArray(raw.riskFlags)
  ) {
    throw new Error("Missing required array fields");
  }

  // Normalize confidence levels to valid enum values
  const validConfidence = new Set(["high", "medium", "low"]);
  const assumptions = (raw.assumptions as Array<Record<string, unknown>>).map((a) => ({
    icon: String(a.icon ?? "📊"),
    label: String(a.label ?? ""),
    value: String(a.value ?? ""),
    reasoning: String(a.reasoning ?? ""),
    confidence: validConfidence.has(String(a.confidence))
      ? (String(a.confidence) as "high" | "medium" | "low")
      : "medium",
  }));

  const validCategory = new Set([
    "retirement",
    "capital_gains",
    "india",
    "deductions",
    "withholding",
  ]);
  const actionItems = (raw.actionItems as Array<Record<string, unknown>>).map((item) => ({
    title: String(item.title ?? ""),
    description: String(item.description ?? ""),
    estimatedSaving: String(item.estimatedSaving ?? ""),
    ...(typeof item.sourceYear === "number" ? { sourceYear: item.sourceYear } : {}),
    ...(typeof item.timing === "string" ? { timing: item.timing } : {}),
    category: validCategory.has(String(item.category))
      ? (String(item.category) as ForecastResponse["actionItems"][number]["category"])
      : "deductions",
  }));

  const validSeverity = new Set(["high", "medium"]);
  const riskFlags = (raw.riskFlags as Array<Record<string, unknown>>).map((f) => ({
    severity: validSeverity.has(String(f.severity))
      ? (String(f.severity) as "high" | "medium")
      : "medium",
    description: String(f.description ?? ""),
  }));

  const bracket = raw.bracket as Record<string, unknown>;
  const outcome = raw.estimatedOutcome as Record<string, unknown>;

  const result: ForecastResponse = {
    projectedYear: raw.projectedYear as number,
    taxLiability: raw.taxLiability as ForecastResponse["taxLiability"],
    effectiveRate: raw.effectiveRate as ForecastResponse["effectiveRate"],
    estimatedOutcome: {
      ...(outcome as object),
      label: outcome.label === "refund" ? "refund" : "owed",
    } as ForecastResponse["estimatedOutcome"],
    bracket: {
      rate: Number(bracket.rate),
      floor: Number(bracket.floor),
      ceiling: Number(bracket.ceiling),
      projectedIncome: Number(bracket.projectedIncome),
      // Always recompute headroom from ceiling and projectedIncome — Claude sometimes miscalculates
      headroom: Number(bracket.ceiling) - Number(bracket.projectedIncome),
    },
    assumptions,
    actionItems,
    riskFlags,
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : new Date().toISOString(),
  };

  // India section: only include if all required fields are present
  if (raw.india && typeof raw.india === "object") {
    const india = raw.india as Record<string, unknown>;
    if (
      typeof india.oldRegimeTax === "number" &&
      typeof india.newRegimeTax === "number" &&
      typeof india.savingUnderRecommended === "number" &&
      typeof india.reasoning === "string"
    ) {
      result.india = {
        regimeRecommendation: india.regimeRecommendation === "old" ? "old" : "new",
        oldRegimeTax: india.oldRegimeTax,
        newRegimeTax: india.newRegimeTax,
        savingUnderRecommended: india.savingUnderRecommended,
        reasoning: india.reasoning,
      };
    }
  }

  return result;
}

export async function generateForecast(
  usReturns: Record<number, TaxReturn>,
  indiaReturns: Record<number, IndianTaxReturn>,
  apiKey: string,
): Promise<ForecastResponse> {
  const client = new Anthropic({ apiKey });
  const prompt = buildForecastPrompt(usReturns, indiaReturns);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system:
      "You are a tax planning analyst. You produce structured JSON forecasts. Return ONLY valid JSON with no markdown or explanation.",
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return parseForecastResponse(textBlock.text);
}

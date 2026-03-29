import Anthropic from "@anthropic-ai/sdk";

import type { CountryServerPlugin } from "./country-registry";

export type ForecastResponse = {
  projectedYear: number;

  taxLiability: { value: number; low: number; high: number };
  effectiveRate: { value: number; low: number; high: number };
  estimatedOutcome: { value: number; low: number; high: number; label: "refund" | "owed" };

  // Only present for US filers; omitted when the user has India returns only.
  bracket?: {
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

export function buildForecastPrompt(
  allReturns: Record<string, Record<number, unknown>>,
  activePlugins: CountryServerPlugin[],
): string {
  const pluginsWithData = activePlugins.filter(
    (p) => Object.keys(allReturns[p.code] ?? {}).length > 0,
  );

  // Precompute sorted years per plugin — reused for projected year, history, and instructions
  const pluginYears = pluginsWithData.map((p) =>
    Object.keys(allReturns[p.code] ?? {})
      .map(Number)
      .sort((a, b) => a - b),
  );

  // Projected year = max year key across all countries + 1
  const allYears = pluginYears.flat();
  const projectedYear = allYears.length > 0 ? Math.max(...allYears) + 1 : new Date().getFullYear();

  // Build JSON schema for Claude — core fields + per-country extensions
  const extensionSnippets = pluginsWithData
    .map((p) => p.forecast?.schemaSnippet(projectedYear))
    .filter(Boolean)
    .map((s) => `  ${s}`)
    .join(",\n");

  const schemaDoc = `{
  "projectedYear": ${projectedYear},
  "taxLiability": { "value": number, "low": number, "high": number },
  "effectiveRate": { "value": number, "low": number, "high": number },
  "estimatedOutcome": { "value": number, "low": number, "high": number, "label": "refund" | "owed" },
${extensionSnippets ? extensionSnippets + ",\n" : ""}  "assumptions": [
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
  "generatedAt": "${new Date().toISOString()}"
}`;

  const parts: string[] = [
    `You are a tax planning analyst. Analyze the user's full tax history and produce a structured forecast for ${projectedYear}.`,
  ];

  // Per-country: tax history + constants
  for (let i = 0; i < pluginsWithData.length; i++) {
    const plugin = pluginsWithData[i]!;
    const returns = allReturns[plugin.code] ?? {};
    const years = pluginYears[i]!;
    const summaries = years.map((y) => plugin.buildYearSummary(returns[y]));
    parts.push("", `## ${plugin.name} Tax History`, JSON.stringify(summaries, null, 2));

    const pluginProjectedYear = Math.max(...years) + 1;
    const constants = plugin.constants?.get(pluginProjectedYear);
    if (constants) {
      parts.push("", plugin.constants!.format(constants));
    } else if (plugin.constants) {
      parts.push(
        "",
        `## Note on ${plugin.yearLabel(pluginProjectedYear)} tax constants`,
        `No verified tax constants available for ${plugin.yearLabel(pluginProjectedYear)} in this app yet. Use your best knowledge but flag any figures as unverified in your assumptions.`,
      );
    }
  }

  // Instructions
  const primaryPlugin = pluginsWithData[0]!;
  const primaryProjected = Math.max(...pluginYears[0]!) + 1;
  const hasUs = pluginsWithData.some((p) => p.code === "us");

  parts.push(
    "",
    "## Instructions",
    `- Project ${primaryPlugin.yearLabel(primaryProjected)} ${primaryPlugin.name} taxes based on observed trends (income growth, deduction patterns, capital gains variance)`,
    "- Surface 3–5 action items — mix of forward-looking optimizations and retroactive insights from past years that are still actionable",
    "- For each assumption, state your reasoning and confidence level honestly",
    "- For risk flags: only flag genuine uncertainties (capital gains variance, bonus likelihood, rate changes). Max 3 flags.",
  );

  for (const plugin of pluginsWithData) {
    if (plugin.forecast?.promptInstruction) {
      parts.push(`- ${plugin.forecast.promptInstruction}`);
    }
  }

  parts.push(
    hasUs
      ? "- taxLiability = projected combined US federal + state tax owed (before withholding)"
      : "- taxLiability = projected total tax liability in local currency",
    "- estimatedOutcome = refund (positive value) or owed (negative value) at filing time, based on projected withholding/advance-tax trends",
    !hasUs ? "- bracket: omit this field entirely — there are no US returns" : "",
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
  if (!raw.taxLiability || !raw.effectiveRate || !raw.estimatedOutcome) {
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

  const bracketRaw = raw.bracket as Record<string, unknown> | undefined;
  const outcome = raw.estimatedOutcome as Record<string, unknown>;

  // Coerce a value that Claude might return as a number or numeric string to a number
  const toNum = (v: unknown): number => {
    if (typeof v === "number") return v;
    if (typeof v === "string") return parseFloat(v.replace(/[^0-9.-]/g, "")) || 0;
    return 0;
  };

  const result: ForecastResponse = {
    projectedYear: raw.projectedYear as number,
    taxLiability: raw.taxLiability as ForecastResponse["taxLiability"],
    effectiveRate: raw.effectiveRate as ForecastResponse["effectiveRate"],
    estimatedOutcome: {
      ...(outcome as object),
      label: outcome.label === "refund" ? "refund" : "owed",
    } as ForecastResponse["estimatedOutcome"],
    ...(bracketRaw
      ? {
          bracket: {
            rate: toNum(bracketRaw.rate),
            floor: toNum(bracketRaw.floor),
            ceiling: toNum(bracketRaw.ceiling),
            projectedIncome: toNum(bracketRaw.projectedIncome),
            // Always recompute headroom — Claude sometimes miscalculates
            headroom: toNum(bracketRaw.ceiling) - toNum(bracketRaw.projectedIncome),
          },
        }
      : {}),
    assumptions,
    actionItems,
    riskFlags,
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : new Date().toISOString(),
  };

  // India section: coerce amounts to numbers in case Claude returns INR strings
  if (raw.india && typeof raw.india === "object") {
    const india = raw.india as Record<string, unknown>;
    if (india.reasoning) {
      result.india = {
        regimeRecommendation: india.regimeRecommendation === "old" ? "old" : "new",
        oldRegimeTax: toNum(india.oldRegimeTax),
        newRegimeTax: toNum(india.newRegimeTax),
        savingUnderRecommended: toNum(india.savingUnderRecommended),
        reasoning: String(india.reasoning),
      };
    }
  }

  return result;
}

export async function generateForecast(
  allReturns: Record<string, Record<number, unknown>>,
  activePlugins: CountryServerPlugin[],
  apiKey: string,
): Promise<ForecastResponse> {
  const client = new Anthropic({ apiKey });
  const prompt = buildForecastPrompt(allReturns, activePlugins);

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

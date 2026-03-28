import { describe, expect, test } from "bun:test";

import { buildForecastPrompt, parseForecastResponse } from "./forecaster";
import type { IndianTaxReturn, TaxReturn } from "./schema";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeUsReturn(year: number, overrides: Partial<TaxReturn> = {}): TaxReturn {
  return {
    year,
    name: "Test User",
    filingStatus: "single",
    dependents: [],
    income: {
      items: [{ label: "Wages", amount: 150000 }],
      total: 150000,
    },
    federal: {
      agi: 140000,
      deductions: [{ label: "Standard deduction", amount: 13850 }],
      taxableIncome: 126150,
      tax: 24000,
      additionalTaxes: [],
      credits: [],
      payments: [{ label: "Federal withholding", amount: 26000 }],
      refundOrOwed: 2000,
    },
    states: [
      {
        name: "CA",
        agi: 140000,
        deductions: [],
        taxableIncome: 126150,
        tax: 8500,
        adjustments: [],
        payments: [{ label: "CA withholding", amount: 9000 }],
        refundOrOwed: 500,
      },
    ],
    summary: {
      federalAmount: 2000,
      stateAmounts: [{ state: "CA", amount: 500 }],
      netPosition: 2500,
    },
    rates: { federal: { marginal: 24, effective: 16.0 } },
    ...overrides,
  };
}

function makeIndiaReturn(financialYear: number): IndianTaxReturn {
  return {
    assessmentYear: `${financialYear + 1}-${String(financialYear + 2).slice(-2)}`,
    financialYear,
    itrForm: "ITR-2",
    name: "Test User",
    residencyStatus: "resident",
    income: {
      salary: [{ label: "Salary", amount: 2500000 }],
      houseProperty: [],
      capitalGains: {
        stcg: { items: [], total: 0 },
        ltcg: { items: [], total: 50000 },
      },
      otherSources: [{ label: "Interest", amount: 10000 }],
      grossTotal: 2560000,
    },
    deductions: [{ label: "80C", amount: 150000 }],
    taxableIncome: 2410000,
    tax: {
      grossTax: 430000,
      surcharge: 0,
      educationCess: 17200,
      totalTaxLiability: 447200,
      tds: [{ label: "TDS on salary", amount: 440000 }],
      advanceTax: [],
      selfAssessmentTax: [],
      totalTaxPaid: 440000,
      refundOrDue: -7200,
    },
    summary: {
      grossTotalIncome: 2560000,
      taxableIncome: 2410000,
      totalTaxPaid: 440000,
      refundOrDue: -7200,
    },
  };
}

// Minimal valid ForecastResponse JSON string for parseForecastResponse tests
function makeForecastJson(overrides: Record<string, unknown> = {}): string {
  const base = {
    projectedYear: 2025,
    taxLiability: { value: 30000, low: 25000, high: 35000 },
    effectiveRate: { value: 20.0, low: 17.0, high: 23.0 },
    estimatedOutcome: { value: 2000, low: -1000, high: 5000, label: "refund" },
    bracket: { rate: 22, floor: 89075, ceiling: 170050, projectedIncome: 150000, headroom: 20050 },
    assumptions: [
      {
        icon: "📈",
        label: "Salary growth",
        value: "+5%",
        reasoning: "Consistent 5% raises over 3 years.",
        confidence: "high",
      },
    ],
    actionItems: [
      {
        title: "Max 401k contributions",
        description: "Contribute the full $23,000 limit.",
        estimatedSaving: "$2,200",
        category: "retirement",
      },
    ],
    riskFlags: [{ severity: "medium", description: "Capital gains may vary significantly." }],
    generatedAt: "2026-03-28T10:00:00.000Z",
    ...overrides,
  };
  return JSON.stringify(base);
}

// ── buildForecastPrompt ───────────────────────────────────────────────────────

describe("buildForecastPrompt", () => {
  test("includes all US return years in output", () => {
    const returns = {
      2022: makeUsReturn(2022),
      2023: makeUsReturn(2023),
      2024: makeUsReturn(2024),
    };
    const prompt = buildForecastPrompt(returns, {});
    expect(prompt).toContain("2022");
    expect(prompt).toContain("2023");
    expect(prompt).toContain("2024");
  });

  test("sets projectedYear to max US year + 1", () => {
    const returns = { 2023: makeUsReturn(2023), 2024: makeUsReturn(2024) };
    const prompt = buildForecastPrompt(returns, {});
    expect(prompt).toContain("2025");
  });

  test("includes income amounts for each year", () => {
    const returns = { 2024: makeUsReturn(2024) };
    const prompt = buildForecastPrompt(returns, {});
    expect(prompt).toContain("150000");
  });

  test("includes India section when India returns present", () => {
    const returns = { 2024: makeUsReturn(2024) };
    const indiaReturns = { 2024: makeIndiaReturn(2024) };
    const prompt = buildForecastPrompt(returns, indiaReturns);
    expect(prompt).toContain("India ITR History");
    expect(prompt).toContain("2410000"); // taxableIncome from India fixture
  });

  test("omits India section when no India returns", () => {
    const returns = { 2024: makeUsReturn(2024) };
    const prompt = buildForecastPrompt(returns, {});
    expect(prompt).not.toContain("India ITR History");
  });

  test("includes India regime instructions when India data present", () => {
    const returns = { 2024: makeUsReturn(2024) };
    const indiaReturns = { 2024: makeIndiaReturn(2024) };
    const prompt = buildForecastPrompt(returns, indiaReturns);
    expect(prompt).toContain("old vs new regime");
  });
});

// ── parseForecastResponse ─────────────────────────────────────────────────────

describe("parseForecastResponse", () => {
  test("parses a valid forecast JSON string", () => {
    const result = parseForecastResponse(makeForecastJson());
    expect(result.projectedYear).toBe(2025);
    expect(result.taxLiability).toEqual({ value: 30000, low: 25000, high: 35000 });
    expect(result.estimatedOutcome.label).toBe("refund");
    expect(result.assumptions).toHaveLength(1);
    expect(result.actionItems).toHaveLength(1);
    expect(result.riskFlags).toHaveLength(1);
  });

  test("strips markdown code fences before parsing", () => {
    const wrapped = "```json\n" + makeForecastJson() + "\n```";
    const result = parseForecastResponse(wrapped);
    expect(result.projectedYear).toBe(2025);
  });

  test("confidence levels are normalized to high | medium | low", () => {
    const json = makeForecastJson({
      assumptions: [
        { icon: "📈", label: "A", value: "x", reasoning: "r", confidence: "high" },
        { icon: "📊", label: "B", value: "y", reasoning: "s", confidence: "UNKNOWN_LEVEL" },
      ],
    });
    const result = parseForecastResponse(json);
    expect(result.assumptions[0]?.confidence).toBe("high");
    // Unknown confidence falls back to "medium"
    expect(result.assumptions[1]?.confidence).toBe("medium");
  });

  test("riskFlags severity normalized to high | medium", () => {
    const json = makeForecastJson({
      riskFlags: [
        { severity: "high", description: "Serious risk" },
        { severity: "low", description: "Claude made up a low severity" },
      ],
    });
    const result = parseForecastResponse(json);
    expect(result.riskFlags[0]?.severity).toBe("high");
    // "low" is not a valid severity — normalized to "medium"
    expect(result.riskFlags[1]?.severity).toBe("medium");
  });

  test("headroom is always recomputed from ceiling - projectedIncome", () => {
    const json = makeForecastJson({
      bracket: {
        rate: 22,
        floor: 89075,
        ceiling: 170050,
        projectedIncome: 150000,
        headroom: 99999,
      },
    });
    const result = parseForecastResponse(json);
    // 170050 - 150000 = 20050, not Claude's 99999
    expect(result.bracket.headroom).toBe(20050);
  });

  test("missing India data → india field is undefined", () => {
    const json = makeForecastJson(); // no india key
    const result = parseForecastResponse(json);
    expect(result.india).toBeUndefined();
  });

  test("India data with all required fields is included", () => {
    const json = makeForecastJson({
      india: {
        regimeRecommendation: "new",
        oldRegimeTax: 450000,
        newRegimeTax: 380000,
        savingUnderRecommended: 70000,
        reasoning: "New regime is cheaper for this income level.",
      },
    });
    const result = parseForecastResponse(json);
    expect(result.india).toBeDefined();
    expect(result.india?.regimeRecommendation).toBe("new");
    expect(result.india?.savingUnderRecommended).toBe(70000);
  });

  test("India data with missing required fields is omitted", () => {
    // reasoning is missing
    const json = makeForecastJson({
      india: {
        regimeRecommendation: "old",
        oldRegimeTax: 450000,
        newRegimeTax: 480000,
        savingUnderRecommended: 30000,
        // no reasoning
      },
    });
    const result = parseForecastResponse(json);
    expect(result.india).toBeUndefined();
  });

  test("estimatedOutcome label defaults to owed for non-refund values", () => {
    const json = makeForecastJson({
      estimatedOutcome: { value: -3000, low: -6000, high: 0, label: "WEIRD_VALUE" },
    });
    const result = parseForecastResponse(json);
    expect(result.estimatedOutcome.label).toBe("owed");
  });

  test("throws on invalid JSON", () => {
    expect(() => parseForecastResponse("not json at all")).toThrow();
  });

  test("throws when required top-level fields are missing", () => {
    expect(() => parseForecastResponse("{}")).toThrow();
  });
});

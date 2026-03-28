// IRS federal tax constants injected into forecast and insights prompts.
//
// How to update each year (takes ~10 minutes):
//   1. IRS publishes new-year adjustments each October at:
//      https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-XXXX
//   2. Verify brackets at: https://www.irs.gov/filing/federal-income-tax-rates-and-brackets
//   3. Verify LTCG thresholds at: https://www.irs.gov/taxtopics/tc409
//   4. Verify contribution limits at the 401k/IRA limit newsroom release
//   5. Add a new entry to TAX_CONSTANTS below. Copy the prior year, update numbers, update source.
//
// Sources for each year are cited inline — never update numbers without verifying against
// an authoritative IRS source.

export type BracketEntry = { floor: number; ceiling: number; rate: number };

export type YearConstants = {
  year: number;
  // IRS source URL(s) — update this when you update numbers
  sources: string[];
  brackets: {
    single: BracketEntry[];
    mfj: BracketEntry[];
    hoh: BracketEntry[];
  };
  standardDeduction: {
    single: number;
    mfj: number;
    hoh: number;
  };
  // Long-term capital gains thresholds (taxable income)
  ltcg: {
    single: { zeroTo: number; fifteenTo: number };
    mfj: { zeroTo: number; fifteenTo: number };
    hoh: { zeroTo: number; fifteenTo: number };
  } | null; // null = not yet confirmed for this year
  contributions: {
    k401: number;
    k401CatchUp: number; // age 50+, pre-SECURE 2.0
    ira: number;
    iraCatchUp: number; // age 50+
  };
};

// ceiling: Infinity represents "no upper limit" (top bracket)
const TAX_CONSTANTS: Record<number, YearConstants> = {
  2024: {
    year: 2024,
    sources: [
      "https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2024",
      "https://www.irs.gov/taxtopics/tc409",
    ],
    brackets: {
      single: [
        { floor: 0, ceiling: 11600, rate: 10 },
        { floor: 11601, ceiling: 47150, rate: 12 },
        { floor: 47151, ceiling: 100525, rate: 22 },
        { floor: 100526, ceiling: 191950, rate: 24 },
        { floor: 191951, ceiling: 243725, rate: 32 },
        { floor: 243726, ceiling: 609350, rate: 35 },
        { floor: 609351, ceiling: Infinity, rate: 37 },
      ],
      mfj: [
        { floor: 0, ceiling: 23200, rate: 10 },
        { floor: 23201, ceiling: 94300, rate: 12 },
        { floor: 94301, ceiling: 201050, rate: 22 },
        { floor: 201051, ceiling: 383900, rate: 24 },
        { floor: 383901, ceiling: 487450, rate: 32 },
        { floor: 487451, ceiling: 731200, rate: 35 },
        { floor: 731201, ceiling: Infinity, rate: 37 },
      ],
      hoh: [
        { floor: 0, ceiling: 16550, rate: 10 },
        { floor: 16551, ceiling: 63100, rate: 12 },
        { floor: 63101, ceiling: 100500, rate: 22 },
        { floor: 100501, ceiling: 191950, rate: 24 },
        { floor: 191951, ceiling: 243700, rate: 32 },
        { floor: 243701, ceiling: 609350, rate: 35 },
        { floor: 609351, ceiling: Infinity, rate: 37 },
      ],
    },
    standardDeduction: { single: 14600, mfj: 29200, hoh: 21900 },
    ltcg: {
      single: { zeroTo: 47025, fifteenTo: 518900 },
      mfj: { zeroTo: 94050, fifteenTo: 583750 },
      hoh: { zeroTo: 63000, fifteenTo: 551350 },
    },
    contributions: {
      k401: 23000, // source: IRS COLA table (training data — verify at irs.gov/retirement-plans/cola)
      k401CatchUp: 7500,
      ira: 7000,
      iraCatchUp: 1000,
    },
  },

  2025: {
    year: 2025,
    // Brackets reflect the One Big Beautiful Bill (OBBBA) amendments to 2025.
    // The Tax Foundation page has pre-OBBBA numbers — use IRS.gov directly.
    sources: [
      "https://www.irs.gov/filing/federal-income-tax-rates-and-brackets",
      "https://www.irs.gov/taxtopics/tc409",
      "https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500",
    ],
    brackets: {
      single: [
        { floor: 0, ceiling: 11925, rate: 10 },
        { floor: 11926, ceiling: 48475, rate: 12 },
        { floor: 48476, ceiling: 103350, rate: 22 },
        { floor: 103351, ceiling: 197300, rate: 24 },
        { floor: 197301, ceiling: 250525, rate: 32 },
        { floor: 250526, ceiling: 626350, rate: 35 },
        { floor: 626351, ceiling: Infinity, rate: 37 },
      ],
      mfj: [
        { floor: 0, ceiling: 23850, rate: 10 },
        { floor: 23851, ceiling: 96950, rate: 12 },
        { floor: 96951, ceiling: 206700, rate: 22 },
        { floor: 206701, ceiling: 394600, rate: 24 },
        { floor: 394601, ceiling: 501050, rate: 32 },
        { floor: 501051, ceiling: 751600, rate: 35 },
        { floor: 751601, ceiling: Infinity, rate: 37 },
      ],
      hoh: [
        // HOH OBBBA numbers — verify against irs.gov if needed
        { floor: 0, ceiling: 17000, rate: 10 },
        { floor: 17001, ceiling: 64850, rate: 12 },
        { floor: 64851, ceiling: 103350, rate: 22 },
        { floor: 103351, ceiling: 197300, rate: 24 },
        { floor: 197301, ceiling: 250500, rate: 32 },
        { floor: 250501, ceiling: 626350, rate: 35 },
        { floor: 626351, ceiling: Infinity, rate: 37 },
      ],
    },
    // OBBBA raised MFJ standard deduction from $30,000 to $31,500
    standardDeduction: { single: 15000, mfj: 31500, hoh: 22500 },
    ltcg: {
      single: { zeroTo: 48350, fifteenTo: 533400 },
      mfj: { zeroTo: 96700, fifteenTo: 600050 },
      hoh: { zeroTo: 64750, fifteenTo: 566700 },
    },
    contributions: {
      k401: 23500,
      k401CatchUp: 7500,
      ira: 7000,
      iraCatchUp: 1000,
    },
  },

  2026: {
    year: 2026,
    sources: [
      "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill",
      "https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500",
    ],
    brackets: {
      single: [
        { floor: 0, ceiling: 12400, rate: 10 },
        { floor: 12401, ceiling: 50400, rate: 12 },
        { floor: 50401, ceiling: 105700, rate: 22 },
        { floor: 105701, ceiling: 201775, rate: 24 },
        { floor: 201776, ceiling: 256225, rate: 32 },
        { floor: 256226, ceiling: 640600, rate: 35 },
        { floor: 640601, ceiling: Infinity, rate: 37 },
      ],
      mfj: [
        { floor: 0, ceiling: 24800, rate: 10 },
        { floor: 24801, ceiling: 100800, rate: 12 },
        { floor: 100801, ceiling: 211400, rate: 22 },
        { floor: 211401, ceiling: 403550, rate: 24 },
        { floor: 403551, ceiling: 512450, rate: 32 },
        { floor: 512451, ceiling: 768700, rate: 35 },
        { floor: 768701, ceiling: Infinity, rate: 37 },
      ],
      hoh: [
        // Verify HOH 2026 at irs.gov when filing season opens
        { floor: 0, ceiling: 18650, rate: 10 },
        { floor: 18651, ceiling: 72750, rate: 12 },
        { floor: 72751, ceiling: 105700, rate: 22 },
        { floor: 105701, ceiling: 201775, rate: 24 },
        { floor: 201776, ceiling: 256175, rate: 32 },
        { floor: 256176, ceiling: 640600, rate: 35 },
        { floor: 640601, ceiling: Infinity, rate: 37 },
      ],
    },
    standardDeduction: { single: 16100, mfj: 32200, hoh: 24150 },
    ltcg: null, // not yet published — update from irs.gov/taxtopics/tc409 when available
    contributions: {
      k401: 24500,
      k401CatchUp: 8000,
      ira: 7500,
      iraCatchUp: 1100,
    },
  },
};

export function getTaxConstants(year: number): YearConstants | null {
  return TAX_CONSTANTS[year] ?? null;
}

// Format constants as a compact string for injection into AI prompts.
// Keeps tokens lean — no JSON structure, just the numbers Claude needs.
export function formatConstantsForPrompt(c: YearConstants): string {
  const fmt = (n: number) => (n === Infinity ? "+" : `$${n.toLocaleString()}`);

  const bracketTable = (brackets: BracketEntry[]) =>
    brackets.map((b) => `  ${b.rate}%: ${fmt(b.floor)} – ${fmt(b.ceiling)}`).join("\n");

  const lines: string[] = [
    `## ${c.year} IRS Tax Constants (verified from IRS.gov)`,
    "",
    "### Federal income tax brackets",
    "Single:",
    bracketTable(c.brackets.single),
    "Married Filing Jointly:",
    bracketTable(c.brackets.mfj),
    "",
    "### Standard deduction",
    `Single: $${c.standardDeduction.single.toLocaleString()}`,
    `Married Filing Jointly: $${c.standardDeduction.mfj.toLocaleString()}`,
    `Head of Household: $${c.standardDeduction.hoh.toLocaleString()}`,
  ];

  if (c.ltcg) {
    lines.push(
      "",
      "### Long-term capital gains thresholds",
      `Single: 0% up to $${c.ltcg.single.zeroTo.toLocaleString()}, 15% up to $${c.ltcg.single.fifteenTo.toLocaleString()}, 20% above`,
      `MFJ: 0% up to $${c.ltcg.mfj.zeroTo.toLocaleString()}, 15% up to $${c.ltcg.mfj.fifteenTo.toLocaleString()}, 20% above`,
    );
  }

  lines.push(
    "",
    "### Retirement contribution limits",
    `401(k) employee deferral: $${c.contributions.k401.toLocaleString()} ($${(c.contributions.k401 + c.contributions.k401CatchUp).toLocaleString()} with catch-up for age 50+)`,
    `IRA: $${c.contributions.ira.toLocaleString()} ($${(c.contributions.ira + c.contributions.iraCatchUp).toLocaleString()} with catch-up for age 50+)`,
    "",
    "Use these exact figures for all bracket math, savings calculations, and contribution limit advice. Do not use recalled figures from training data.",
  );

  return lines.join("\n");
}

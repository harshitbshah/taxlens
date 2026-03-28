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
  2018: {
    year: 2018,
    // First year of TCJA brackets. Numbers from training data — verify at:
    // https://www.irs.gov/newsroom/irs-announces-2018-tax-rates-standard-deductions-exemption-amounts-and-more
    sources: [
      "https://www.irs.gov/newsroom/irs-announces-2018-tax-rates-standard-deductions-exemption-amounts-and-more",
      "https://www.irs.gov/taxtopics/tc409",
    ],
    brackets: {
      single: [
        { floor: 0, ceiling: 9525, rate: 10 },
        { floor: 9526, ceiling: 38700, rate: 12 },
        { floor: 38701, ceiling: 82500, rate: 22 },
        { floor: 82501, ceiling: 157500, rate: 24 },
        { floor: 157501, ceiling: 200000, rate: 32 },
        { floor: 200001, ceiling: 500000, rate: 35 },
        { floor: 500001, ceiling: Infinity, rate: 37 },
      ],
      mfj: [
        { floor: 0, ceiling: 19050, rate: 10 },
        { floor: 19051, ceiling: 77400, rate: 12 },
        { floor: 77401, ceiling: 165000, rate: 22 },
        { floor: 165001, ceiling: 315000, rate: 24 },
        { floor: 315001, ceiling: 400000, rate: 32 },
        { floor: 400001, ceiling: 600000, rate: 35 },
        { floor: 600001, ceiling: Infinity, rate: 37 },
      ],
      hoh: [
        { floor: 0, ceiling: 13600, rate: 10 },
        { floor: 13601, ceiling: 51800, rate: 12 },
        { floor: 51801, ceiling: 82500, rate: 22 },
        { floor: 82501, ceiling: 157500, rate: 24 },
        { floor: 157501, ceiling: 200000, rate: 32 },
        { floor: 200001, ceiling: 500000, rate: 35 },
        { floor: 500001, ceiling: Infinity, rate: 37 },
      ],
    },
    standardDeduction: { single: 12000, mfj: 24000, hoh: 18000 },
    ltcg: {
      single: { zeroTo: 38600, fifteenTo: 425800 },
      mfj: { zeroTo: 77200, fifteenTo: 479000 },
      hoh: { zeroTo: 51700, fifteenTo: 452400 },
    },
    contributions: {
      k401: 18500,
      k401CatchUp: 6000,
      ira: 5500,
      iraCatchUp: 1000,
    },
  },

  2019: {
    year: 2019,
    // Numbers from training data — verify at:
    // https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2019
    sources: [
      "https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2019",
      "https://www.irs.gov/taxtopics/tc409",
    ],
    brackets: {
      single: [
        { floor: 0, ceiling: 9700, rate: 10 },
        { floor: 9701, ceiling: 39475, rate: 12 },
        { floor: 39476, ceiling: 84200, rate: 22 },
        { floor: 84201, ceiling: 160725, rate: 24 },
        { floor: 160726, ceiling: 204100, rate: 32 },
        { floor: 204101, ceiling: 510300, rate: 35 },
        { floor: 510301, ceiling: Infinity, rate: 37 },
      ],
      mfj: [
        { floor: 0, ceiling: 19400, rate: 10 },
        { floor: 19401, ceiling: 78950, rate: 12 },
        { floor: 78951, ceiling: 168400, rate: 22 },
        { floor: 168401, ceiling: 321450, rate: 24 },
        { floor: 321451, ceiling: 408200, rate: 32 },
        { floor: 408201, ceiling: 612350, rate: 35 },
        { floor: 612351, ceiling: Infinity, rate: 37 },
      ],
      hoh: [
        { floor: 0, ceiling: 13850, rate: 10 },
        { floor: 13851, ceiling: 52850, rate: 12 },
        { floor: 52851, ceiling: 84200, rate: 22 },
        { floor: 84201, ceiling: 160700, rate: 24 },
        { floor: 160701, ceiling: 204100, rate: 32 },
        { floor: 204101, ceiling: 510300, rate: 35 },
        { floor: 510301, ceiling: Infinity, rate: 37 },
      ],
    },
    standardDeduction: { single: 12200, mfj: 24400, hoh: 18350 },
    ltcg: {
      single: { zeroTo: 39375, fifteenTo: 434550 },
      mfj: { zeroTo: 78750, fifteenTo: 488850 },
      hoh: { zeroTo: 52750, fifteenTo: 461700 },
    },
    contributions: {
      k401: 19000,
      k401CatchUp: 6000,
      ira: 6000, // increased from $5,500 in 2018
      iraCatchUp: 1000,
    },
  },

  2020: {
    year: 2020,
    // Numbers from training data — verify at:
    // https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2020
    sources: [
      "https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2020",
      "https://www.irs.gov/taxtopics/tc409",
    ],
    brackets: {
      single: [
        { floor: 0, ceiling: 9875, rate: 10 },
        { floor: 9876, ceiling: 40125, rate: 12 },
        { floor: 40126, ceiling: 85525, rate: 22 },
        { floor: 85526, ceiling: 163300, rate: 24 },
        { floor: 163301, ceiling: 207350, rate: 32 },
        { floor: 207351, ceiling: 518400, rate: 35 },
        { floor: 518401, ceiling: Infinity, rate: 37 },
      ],
      mfj: [
        { floor: 0, ceiling: 19750, rate: 10 },
        { floor: 19751, ceiling: 80250, rate: 12 },
        { floor: 80251, ceiling: 171050, rate: 22 },
        { floor: 171051, ceiling: 326600, rate: 24 },
        { floor: 326601, ceiling: 414700, rate: 32 },
        { floor: 414701, ceiling: 622050, rate: 35 },
        { floor: 622051, ceiling: Infinity, rate: 37 },
      ],
      hoh: [
        { floor: 0, ceiling: 14100, rate: 10 },
        { floor: 14101, ceiling: 53700, rate: 12 },
        { floor: 53701, ceiling: 85500, rate: 22 },
        { floor: 85501, ceiling: 163300, rate: 24 },
        { floor: 163301, ceiling: 207350, rate: 32 },
        { floor: 207351, ceiling: 518400, rate: 35 },
        { floor: 518401, ceiling: Infinity, rate: 37 },
      ],
    },
    standardDeduction: { single: 12400, mfj: 24800, hoh: 18650 },
    ltcg: {
      single: { zeroTo: 40000, fifteenTo: 441450 },
      mfj: { zeroTo: 80000, fifteenTo: 496600 },
      hoh: { zeroTo: 53600, fifteenTo: 469050 },
    },
    contributions: {
      k401: 19500,
      k401CatchUp: 6500, // increased from $6,000 in 2019
      ira: 6000,
      iraCatchUp: 1000,
    },
  },

  2021: {
    year: 2021,
    // Numbers from training data — verify at:
    // https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2021
    sources: [
      "https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2021",
      "https://www.irs.gov/taxtopics/tc409",
    ],
    brackets: {
      single: [
        { floor: 0, ceiling: 9950, rate: 10 },
        { floor: 9951, ceiling: 40525, rate: 12 },
        { floor: 40526, ceiling: 86375, rate: 22 },
        { floor: 86376, ceiling: 164925, rate: 24 },
        { floor: 164926, ceiling: 209425, rate: 32 },
        { floor: 209426, ceiling: 523600, rate: 35 },
        { floor: 523601, ceiling: Infinity, rate: 37 },
      ],
      mfj: [
        { floor: 0, ceiling: 19900, rate: 10 },
        { floor: 19901, ceiling: 81050, rate: 12 },
        { floor: 81051, ceiling: 172750, rate: 22 },
        { floor: 172751, ceiling: 329850, rate: 24 },
        { floor: 329851, ceiling: 418850, rate: 32 },
        { floor: 418851, ceiling: 628300, rate: 35 },
        { floor: 628301, ceiling: Infinity, rate: 37 },
      ],
      hoh: [
        { floor: 0, ceiling: 14200, rate: 10 },
        { floor: 14201, ceiling: 54200, rate: 12 },
        { floor: 54201, ceiling: 86350, rate: 22 },
        { floor: 86351, ceiling: 164900, rate: 24 },
        { floor: 164901, ceiling: 209400, rate: 32 },
        { floor: 209401, ceiling: 523600, rate: 35 },
        { floor: 523601, ceiling: Infinity, rate: 37 },
      ],
    },
    standardDeduction: { single: 12550, mfj: 25100, hoh: 18800 },
    ltcg: {
      single: { zeroTo: 40400, fifteenTo: 445850 },
      mfj: { zeroTo: 80800, fifteenTo: 501600 },
      hoh: { zeroTo: 54100, fifteenTo: 473750 },
    },
    contributions: {
      k401: 19500,
      k401CatchUp: 6500,
      ira: 6000,
      iraCatchUp: 1000,
    },
  },

  2022: {
    year: 2022,
    // Numbers from training data — verify at:
    // https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2022
    sources: [
      "https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2022",
      "https://www.irs.gov/taxtopics/tc409",
    ],
    brackets: {
      single: [
        { floor: 0, ceiling: 10275, rate: 10 },
        { floor: 10276, ceiling: 41775, rate: 12 },
        { floor: 41776, ceiling: 89075, rate: 22 },
        { floor: 89076, ceiling: 170050, rate: 24 },
        { floor: 170051, ceiling: 215950, rate: 32 },
        { floor: 215951, ceiling: 539900, rate: 35 },
        { floor: 539901, ceiling: Infinity, rate: 37 },
      ],
      mfj: [
        { floor: 0, ceiling: 20550, rate: 10 },
        { floor: 20551, ceiling: 83550, rate: 12 },
        { floor: 83551, ceiling: 178150, rate: 22 },
        { floor: 178151, ceiling: 340100, rate: 24 },
        { floor: 340101, ceiling: 431900, rate: 32 },
        { floor: 431901, ceiling: 647850, rate: 35 },
        { floor: 647851, ceiling: Infinity, rate: 37 },
      ],
      hoh: [
        { floor: 0, ceiling: 14650, rate: 10 },
        { floor: 14651, ceiling: 55900, rate: 12 },
        { floor: 55901, ceiling: 89050, rate: 22 },
        { floor: 89051, ceiling: 170050, rate: 24 },
        { floor: 170051, ceiling: 215950, rate: 32 },
        { floor: 215951, ceiling: 539900, rate: 35 },
        { floor: 539901, ceiling: Infinity, rate: 37 },
      ],
    },
    standardDeduction: { single: 12950, mfj: 25900, hoh: 19400 },
    ltcg: {
      single: { zeroTo: 41675, fifteenTo: 459750 },
      mfj: { zeroTo: 83350, fifteenTo: 517200 },
      hoh: { zeroTo: 55800, fifteenTo: 488500 },
    },
    contributions: {
      k401: 20500,
      k401CatchUp: 6500,
      ira: 6000,
      iraCatchUp: 1000,
    },
  },

  2023: {
    year: 2023,
    // Numbers from training data — verify at:
    // https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2023
    sources: [
      "https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2023",
      "https://www.irs.gov/taxtopics/tc409",
    ],
    brackets: {
      single: [
        { floor: 0, ceiling: 11000, rate: 10 },
        { floor: 11001, ceiling: 44725, rate: 12 },
        { floor: 44726, ceiling: 95375, rate: 22 },
        { floor: 95376, ceiling: 182050, rate: 24 },
        { floor: 182051, ceiling: 231250, rate: 32 },
        { floor: 231251, ceiling: 578125, rate: 35 },
        { floor: 578126, ceiling: Infinity, rate: 37 },
      ],
      mfj: [
        { floor: 0, ceiling: 22000, rate: 10 },
        { floor: 22001, ceiling: 89450, rate: 12 },
        { floor: 89451, ceiling: 190750, rate: 22 },
        { floor: 190751, ceiling: 364200, rate: 24 },
        { floor: 364201, ceiling: 462500, rate: 32 },
        { floor: 462501, ceiling: 693750, rate: 35 },
        { floor: 693751, ceiling: Infinity, rate: 37 },
      ],
      hoh: [
        { floor: 0, ceiling: 15700, rate: 10 },
        { floor: 15701, ceiling: 59850, rate: 12 },
        { floor: 59851, ceiling: 95350, rate: 22 },
        { floor: 95351, ceiling: 182050, rate: 24 },
        { floor: 182051, ceiling: 231250, rate: 32 },
        { floor: 231251, ceiling: 578100, rate: 35 },
        { floor: 578101, ceiling: Infinity, rate: 37 },
      ],
    },
    standardDeduction: { single: 13850, mfj: 27700, hoh: 20800 },
    ltcg: {
      single: { zeroTo: 44625, fifteenTo: 492300 },
      mfj: { zeroTo: 89250, fifteenTo: 553850 },
      hoh: { zeroTo: 59750, fifteenTo: 523050 },
    },
    contributions: {
      k401: 22500, // large jump driven by high 2022 inflation
      k401CatchUp: 7500, // SECURE 2.0 increased from $6,500 to $7,500 starting 2023
      ira: 6500, // increased from $6,000
      iraCatchUp: 1000,
    },
  },

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

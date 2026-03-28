// India income tax constants (Income Tax Act / Finance Act) injected into forecast and insights prompts.
//
// How to update each year (~30 minutes, each February after Union Budget):
//   1. Finance Act / Budget speech: https://www.indiabudget.gov.in/
//   2. Income Tax India slabs: https://www.incometaxindia.gov.in/Pages/tax-rates.aspx
//   3. 80C/80D/80CCD limits: https://www.incometaxindia.gov.in/Pages/acts/income-tax-act.aspx
//   4. Add a new entry to INDIA_TAX_CONSTANTS below. Copy prior year, update numbers, update sources.
//
// Key in INDIA_TAX_CONSTANTS = financialYear start year (e.g. 2023 for FY 2023-24).
// This matches how IndianTaxReturn.financialYear is stored in india-storage.ts.
//
// To add a new country: see docs/ADDING_COUNTRY_CONSTANTS.md

import type { BracketEntry } from "./shared";

export type IndiaRegimeConstants = {
  // Tax slabs in INR. ceiling: Infinity = top slab.
  slabs: BracketEntry[];
  // Standard deduction for salaried/pension income (0 if not applicable for this regime/year).
  standardDeduction: number;
  // Section 87A rebate — tax is fully waived if income ≤ maxIncome.
  rebate87A: {
    maxIncome: number;
    maxRebate: number;
  };
};

export type IndiaYearConstants = {
  // Start year of the financial year (e.g. 2023 for FY 2023-24).
  financialYear: number;
  // Assessment year string (e.g. "2024-25").
  assessmentYear: string;
  // New regime became default from FY 2023-24.
  defaultRegime: "old" | "new";
  sources: string[];
  oldRegime: IndiaRegimeConstants;
  // null for FY 2018-19 and FY 2019-20 (new regime not yet introduced).
  newRegime: IndiaRegimeConstants | null;
  // Health and Education Cess rate applied on income tax + surcharge (4% from FY 2018-19).
  cessRate: number;
  surcharge: {
    // Surcharge as % of income tax for the given income band.
    above50L: number;
    above1Cr: number;
    above2Cr: number;
    // Old regime: 37% above ₹5 Cr. New regime: capped at 25% from FY 2023-24.
    above5Cr: number;
    // null = new regime not available. Number = new regime cap (25% from FY 2023-24; 37% before).
    newRegimeMax: number | null;
  };
  // Old-regime deduction limits (INR). New regime allows only NPS employer contribution.
  deductions: {
    sec80C: number; // 80C + 80CCC + 80CCD(1) combined limit
    sec80D_selfFamilyBelow60: number; // Health insurance self/family, age < 60
    sec80D_parentsBelow60: number; // Health insurance parents, age < 60
    sec80D_parentsAbove60: number; // Health insurance parents, age ≥ 60
    sec80CCD_1B: number; // Additional NPS contribution over 80C limit
  };
};

// ceiling: Infinity represents "no upper limit" (top slab)
const INDIA_TAX_CONSTANTS: Record<number, IndiaYearConstants> = {
  // FY 2018-19 (AY 2019-20)
  // Numbers from training data — verify at:
  // https://www.incometaxindia.gov.in/Pages/tax-rates.aspx
  // 3% cess until FY 2017-18; 4% cess from FY 2018-19.
  2018: {
    financialYear: 2018,
    assessmentYear: "2019-20",
    defaultRegime: "old",
    sources: [
      "https://www.incometaxindia.gov.in/Pages/tax-rates.aspx",
      "https://www.indiabudget.gov.in/",
    ],
    oldRegime: {
      slabs: [
        { floor: 0, ceiling: 250000, rate: 0 },
        { floor: 250001, ceiling: 500000, rate: 5 },
        { floor: 500001, ceiling: 1000000, rate: 20 },
        { floor: 1000001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 40000, // reintroduced in FY 2018-19 (Budget 2018); replaced ₹19,200 transport + ₹15,000 medical
      rebate87A: { maxIncome: 350000, maxRebate: 2500 },
    },
    newRegime: null, // new regime introduced in FY 2020-21
    cessRate: 4, // raised from 3% in FY 2017-18 to 4% from FY 2018-19
    surcharge: {
      above50L: 10,
      above1Cr: 15,
      above2Cr: 25,
      above5Cr: 37,
      newRegimeMax: null,
    },
    deductions: {
      sec80C: 150000,
      sec80D_selfFamilyBelow60: 25000,
      sec80D_parentsBelow60: 25000,
      sec80D_parentsAbove60: 50000,
      sec80CCD_1B: 50000,
    },
  },

  // FY 2019-20 (AY 2020-21)
  // Numbers from training data — verify at:
  // https://www.incometaxindia.gov.in/Pages/tax-rates.aspx
  2019: {
    financialYear: 2019,
    assessmentYear: "2020-21",
    defaultRegime: "old",
    sources: [
      "https://www.incometaxindia.gov.in/Pages/tax-rates.aspx",
      "https://www.indiabudget.gov.in/",
    ],
    oldRegime: {
      slabs: [
        { floor: 0, ceiling: 250000, rate: 0 },
        { floor: 250001, ceiling: 500000, rate: 5 },
        { floor: 500001, ceiling: 1000000, rate: 20 },
        { floor: 1000001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 50000, // increased from ₹40,000 in FY 2018-19 (Budget 2019)
      rebate87A: { maxIncome: 500000, maxRebate: 12500 }, // rebate limit raised — effectively zero tax up to ₹5L
    },
    newRegime: null,
    cessRate: 4,
    surcharge: {
      above50L: 10,
      above1Cr: 15,
      above2Cr: 25,
      above5Cr: 37,
      newRegimeMax: null,
    },
    deductions: {
      sec80C: 150000,
      sec80D_selfFamilyBelow60: 25000,
      sec80D_parentsBelow60: 25000,
      sec80D_parentsAbove60: 50000,
      sec80CCD_1B: 50000,
    },
  },

  // FY 2020-21 (AY 2021-22)
  // New regime introduced via Finance Act 2020 (optional, u/s 115BAC).
  // Numbers from training data — verify at:
  // https://www.incometaxindia.gov.in/Pages/tax-rates.aspx
  2020: {
    financialYear: 2020,
    assessmentYear: "2021-22",
    defaultRegime: "old", // new regime was opt-in; old regime still default
    sources: [
      "https://www.incometaxindia.gov.in/Pages/tax-rates.aspx",
      "https://www.indiabudget.gov.in/",
    ],
    oldRegime: {
      slabs: [
        { floor: 0, ceiling: 250000, rate: 0 },
        { floor: 250001, ceiling: 500000, rate: 5 },
        { floor: 500001, ceiling: 1000000, rate: 20 },
        { floor: 1000001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 50000,
      rebate87A: { maxIncome: 500000, maxRebate: 12500 },
    },
    newRegime: {
      slabs: [
        { floor: 0, ceiling: 250000, rate: 0 },
        { floor: 250001, ceiling: 500000, rate: 5 },
        { floor: 500001, ceiling: 750000, rate: 10 },
        { floor: 750001, ceiling: 1000000, rate: 15 },
        { floor: 1000001, ceiling: 1250000, rate: 20 },
        { floor: 1250001, ceiling: 1500000, rate: 25 },
        { floor: 1500001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 0, // no standard deduction under new regime (FY 2020-21 to FY 2022-23)
      rebate87A: { maxIncome: 500000, maxRebate: 12500 },
    },
    cessRate: 4,
    surcharge: {
      above50L: 10,
      above1Cr: 15,
      above2Cr: 25,
      above5Cr: 37,
      newRegimeMax: 37, // no cap in FY 2020-21; cap introduced from FY 2023-24
    },
    deductions: {
      sec80C: 150000,
      sec80D_selfFamilyBelow60: 25000,
      sec80D_parentsBelow60: 25000,
      sec80D_parentsAbove60: 50000,
      sec80CCD_1B: 50000,
    },
  },

  // FY 2021-22 (AY 2022-23)
  // No structural change from FY 2020-21. New regime unchanged, optional.
  // Numbers from training data — verify at:
  // https://www.incometaxindia.gov.in/Pages/tax-rates.aspx
  2021: {
    financialYear: 2021,
    assessmentYear: "2022-23",
    defaultRegime: "old",
    sources: [
      "https://www.incometaxindia.gov.in/Pages/tax-rates.aspx",
      "https://www.indiabudget.gov.in/",
    ],
    oldRegime: {
      slabs: [
        { floor: 0, ceiling: 250000, rate: 0 },
        { floor: 250001, ceiling: 500000, rate: 5 },
        { floor: 500001, ceiling: 1000000, rate: 20 },
        { floor: 1000001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 50000,
      rebate87A: { maxIncome: 500000, maxRebate: 12500 },
    },
    newRegime: {
      slabs: [
        { floor: 0, ceiling: 250000, rate: 0 },
        { floor: 250001, ceiling: 500000, rate: 5 },
        { floor: 500001, ceiling: 750000, rate: 10 },
        { floor: 750001, ceiling: 1000000, rate: 15 },
        { floor: 1000001, ceiling: 1250000, rate: 20 },
        { floor: 1250001, ceiling: 1500000, rate: 25 },
        { floor: 1500001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 0,
      rebate87A: { maxIncome: 500000, maxRebate: 12500 },
    },
    cessRate: 4,
    surcharge: {
      above50L: 10,
      above1Cr: 15,
      above2Cr: 25,
      above5Cr: 37,
      newRegimeMax: 37,
    },
    deductions: {
      sec80C: 150000,
      sec80D_selfFamilyBelow60: 25000,
      sec80D_parentsBelow60: 25000,
      sec80D_parentsAbove60: 50000,
      sec80CCD_1B: 50000,
    },
  },

  // FY 2022-23 (AY 2023-24)
  // No structural change from FY 2021-22. New regime unchanged, optional.
  // Numbers from training data — verify at:
  // https://www.incometaxindia.gov.in/Pages/tax-rates.aspx
  2022: {
    financialYear: 2022,
    assessmentYear: "2023-24",
    defaultRegime: "old",
    sources: [
      "https://www.incometaxindia.gov.in/Pages/tax-rates.aspx",
      "https://www.indiabudget.gov.in/",
    ],
    oldRegime: {
      slabs: [
        { floor: 0, ceiling: 250000, rate: 0 },
        { floor: 250001, ceiling: 500000, rate: 5 },
        { floor: 500001, ceiling: 1000000, rate: 20 },
        { floor: 1000001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 50000,
      rebate87A: { maxIncome: 500000, maxRebate: 12500 },
    },
    newRegime: {
      slabs: [
        { floor: 0, ceiling: 250000, rate: 0 },
        { floor: 250001, ceiling: 500000, rate: 5 },
        { floor: 500001, ceiling: 750000, rate: 10 },
        { floor: 750001, ceiling: 1000000, rate: 15 },
        { floor: 1000001, ceiling: 1250000, rate: 20 },
        { floor: 1250001, ceiling: 1500000, rate: 25 },
        { floor: 1500001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 0,
      rebate87A: { maxIncome: 500000, maxRebate: 12500 },
    },
    cessRate: 4,
    surcharge: {
      above50L: 10,
      above1Cr: 15,
      above2Cr: 25,
      above5Cr: 37,
      newRegimeMax: 37,
    },
    deductions: {
      sec80C: 150000,
      sec80D_selfFamilyBelow60: 25000,
      sec80D_parentsBelow60: 25000,
      sec80D_parentsAbove60: 50000,
      sec80CCD_1B: 50000,
    },
  },

  // FY 2023-24 (AY 2024-25)
  // Major revision: new regime became the default; surcharge for new regime capped at 25%;
  // new regime slabs restructured; standard deduction extended to new regime (₹50,000);
  // 87A rebate under new regime raised to ₹7L income.
  // Numbers from training data — verify at:
  // https://www.incometaxindia.gov.in/Pages/tax-rates.aspx
  2023: {
    financialYear: 2023,
    assessmentYear: "2024-25",
    defaultRegime: "new", // new regime became the default from FY 2023-24
    sources: [
      "https://www.incometaxindia.gov.in/Pages/tax-rates.aspx",
      "https://www.indiabudget.gov.in/",
    ],
    oldRegime: {
      slabs: [
        { floor: 0, ceiling: 250000, rate: 0 },
        { floor: 250001, ceiling: 500000, rate: 5 },
        { floor: 500001, ceiling: 1000000, rate: 20 },
        { floor: 1000001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 50000,
      rebate87A: { maxIncome: 500000, maxRebate: 12500 },
    },
    newRegime: {
      slabs: [
        { floor: 0, ceiling: 300000, rate: 0 },
        { floor: 300001, ceiling: 600000, rate: 5 },
        { floor: 600001, ceiling: 900000, rate: 10 },
        { floor: 900001, ceiling: 1200000, rate: 15 },
        { floor: 1200001, ceiling: 1500000, rate: 20 },
        { floor: 1500001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 50000, // extended to new regime from FY 2023-24 (Budget 2023)
      rebate87A: { maxIncome: 700000, maxRebate: 25000 }, // raised from ₹5L to ₹7L
    },
    cessRate: 4,
    surcharge: {
      above50L: 10,
      above1Cr: 15,
      above2Cr: 25,
      above5Cr: 37, // old regime unchanged
      newRegimeMax: 25, // new regime surcharge capped at 25% from FY 2023-24 (Finance Act 2023)
    },
    deductions: {
      sec80C: 150000,
      sec80D_selfFamilyBelow60: 25000,
      sec80D_parentsBelow60: 25000,
      sec80D_parentsAbove60: 50000,
      sec80CCD_1B: 50000,
    },
  },

  // FY 2024-25 (AY 2025-26)
  // Further revision to new regime (Budget 2024): slabs widened, standard deduction raised to ₹75,000,
  // 87A rebate unchanged at ₹7L. Old regime unchanged.
  // Numbers from training data — verify at:
  // https://www.incometaxindia.gov.in/Pages/tax-rates.aspx
  2024: {
    financialYear: 2024,
    assessmentYear: "2025-26",
    defaultRegime: "new",
    sources: [
      "https://www.incometaxindia.gov.in/Pages/tax-rates.aspx",
      "https://www.indiabudget.gov.in/",
    ],
    oldRegime: {
      slabs: [
        { floor: 0, ceiling: 250000, rate: 0 },
        { floor: 250001, ceiling: 500000, rate: 5 },
        { floor: 500001, ceiling: 1000000, rate: 20 },
        { floor: 1000001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 50000,
      rebate87A: { maxIncome: 500000, maxRebate: 12500 },
    },
    newRegime: {
      slabs: [
        { floor: 0, ceiling: 300000, rate: 0 },
        { floor: 300001, ceiling: 700000, rate: 5 },
        { floor: 700001, ceiling: 1000000, rate: 10 },
        { floor: 1000001, ceiling: 1200000, rate: 15 },
        { floor: 1200001, ceiling: 1500000, rate: 20 },
        { floor: 1500001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 75000, // raised from ₹50,000 in Budget 2024
      rebate87A: { maxIncome: 700000, maxRebate: 25000 },
    },
    cessRate: 4,
    surcharge: {
      above50L: 10,
      above1Cr: 15,
      above2Cr: 25,
      above5Cr: 37,
      newRegimeMax: 25,
    },
    deductions: {
      sec80C: 150000,
      sec80D_selfFamilyBelow60: 25000,
      sec80D_parentsBelow60: 25000,
      sec80D_parentsAbove60: 50000,
      sec80CCD_1B: 50000,
    },
  },

  // FY 2025-26 (AY 2026-27)
  // Significant new regime revision (Budget 2025): zero tax up to ₹12L income (with standard deduction
  // of ₹75,000, effective nil tax up to ₹12.75L for salaried), slabs widened.
  // Numbers from training data — verify at:
  // https://www.incometaxindia.gov.in/Pages/tax-rates.aspx
  2025: {
    financialYear: 2025,
    assessmentYear: "2026-27",
    defaultRegime: "new",
    sources: [
      "https://www.incometaxindia.gov.in/Pages/tax-rates.aspx",
      "https://www.indiabudget.gov.in/",
    ],
    oldRegime: {
      slabs: [
        { floor: 0, ceiling: 250000, rate: 0 },
        { floor: 250001, ceiling: 500000, rate: 5 },
        { floor: 500001, ceiling: 1000000, rate: 20 },
        { floor: 1000001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 50000,
      rebate87A: { maxIncome: 500000, maxRebate: 12500 },
    },
    newRegime: {
      slabs: [
        { floor: 0, ceiling: 400000, rate: 0 },
        { floor: 400001, ceiling: 800000, rate: 5 },
        { floor: 800001, ceiling: 1200000, rate: 10 },
        { floor: 1200001, ceiling: 1600000, rate: 15 },
        { floor: 1600001, ceiling: 2000000, rate: 20 },
        { floor: 2000001, ceiling: 2400000, rate: 25 },
        { floor: 2400001, ceiling: Infinity, rate: 30 },
      ],
      standardDeduction: 75000,
      // 87A rebate raised to ₹12L — effectively zero tax for income up to ₹12L (₹12.75L with std deduction)
      rebate87A: { maxIncome: 1200000, maxRebate: 60000 },
    },
    cessRate: 4,
    surcharge: {
      above50L: 10,
      above1Cr: 15,
      above2Cr: 25,
      above5Cr: 37,
      newRegimeMax: 25,
    },
    deductions: {
      sec80C: 150000,
      sec80D_selfFamilyBelow60: 25000,
      sec80D_parentsBelow60: 25000,
      sec80D_parentsAbove60: 50000,
      sec80CCD_1B: 50000,
    },
  },
};

export function getIndiaConstants(financialYear: number): IndiaYearConstants | null {
  return INDIA_TAX_CONSTANTS[financialYear] ?? null;
}

// Format constants as a compact string for injection into AI prompts.
// Keeps tokens lean — no JSON structure, just the numbers Claude needs.
export function formatIndiaConstantsForPrompt(c: IndiaYearConstants): string {
  const crore = (n: number) => (n === Infinity ? "+" : `₹${(n / 100000).toFixed(0)}L`);

  const slabTable = (slabs: BracketEntry[]) =>
    slabs.map((s) => `  ${s.rate}%: ${crore(s.floor)} – ${crore(s.ceiling)}`).join("\n");

  const lines: string[] = [
    `## FY ${c.financialYear}-${String(c.financialYear + 1).slice(2)} (AY ${c.assessmentYear}) India Tax Constants`,
    `Default regime: ${c.defaultRegime === "new" ? "New regime (taxpayer must opt out to use old regime)" : "Old regime (taxpayer must opt in to use new regime)"}`,
    "",
    "### Old Regime slabs",
    slabTable(c.oldRegime.slabs),
    `Standard deduction (old regime): ₹${c.oldRegime.standardDeduction.toLocaleString()}`,
    `87A rebate: nil tax if income ≤ ₹${c.oldRegime.rebate87A.maxIncome.toLocaleString()} (max rebate ₹${c.oldRegime.rebate87A.maxRebate.toLocaleString()})`,
  ];

  if (c.newRegime) {
    lines.push(
      "",
      "### New Regime slabs",
      slabTable(c.newRegime.slabs),
      `Standard deduction (new regime): ₹${c.newRegime.standardDeduction.toLocaleString()}`,
      `87A rebate: nil tax if income ≤ ₹${c.newRegime.rebate87A.maxIncome.toLocaleString()} (max rebate ₹${c.newRegime.rebate87A.maxRebate.toLocaleString()})`,
    );
  } else {
    lines.push("", "New regime: not available this year (introduced FY 2020-21).");
  }

  lines.push(
    "",
    "### Cess and surcharge",
    `Health & Education Cess: ${c.cessRate}% on (tax + surcharge)`,
    `Surcharge: ${c.surcharge.above50L}% (>₹50L), ${c.surcharge.above1Cr}% (>₹1Cr), ${c.surcharge.above2Cr}% (>₹2Cr), ${c.surcharge.above5Cr}% (>₹5Cr, old regime)`,
    c.surcharge.newRegimeMax !== null
      ? `New regime surcharge cap: ${c.surcharge.newRegimeMax}%`
      : "",
    "",
    "### Old-regime deduction limits",
    `80C (ELSS/PPF/LIC/home loan principal): ₹${c.deductions.sec80C.toLocaleString()}`,
    `80D health insurance — self/family (<60): ₹${c.deductions.sec80D_selfFamilyBelow60.toLocaleString()}`,
    `80D health insurance — parents (<60): ₹${c.deductions.sec80D_parentsBelow60.toLocaleString()} | parents (≥60): ₹${c.deductions.sec80D_parentsAbove60.toLocaleString()}`,
    `80CCD(1B) additional NPS: ₹${c.deductions.sec80CCD_1B.toLocaleString()} (over and above 80C limit)`,
    "",
    "Use these exact figures for all slab math, regime comparison, and deduction advice. Do not use recalled figures from training data.",
  );

  return lines.filter((l) => l !== "").join("\n");
}

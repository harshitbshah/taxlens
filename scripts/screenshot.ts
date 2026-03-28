/**
 * Takes README screenshots using mock data — no real tax figures are captured.
 *
 * Usage:
 *   bun run scripts/screenshot.ts
 *
 * Prerequisites (one-time):
 *   bun add -d playwright
 *   bunx playwright install chromium
 *
 * What it does:
 *   1. Backs up your real .tax-returns.json (if any)
 *   2. Writes fake "Alex Johnson" returns (round numbers, no PII)
 *   3. Starts a temporary dev server on port 3099
 *   4. Takes screenshots of key views → docs/screenshots/
 *   5. Restores your real data and kills the server
 */

import { chromium } from "playwright";
import { mkdir, rm, writeFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const RETURNS_FILE = path.join(ROOT, ".tax-returns.json");
const FORECAST_FILE = path.join(ROOT, ".forecast-cache.json");
const SCREENSHOTS_DIR = path.join(ROOT, "docs/screenshots");
const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;

// ── Mock data (fake name, round numbers, no PII) ──────────────────────────────

const MOCK_RETURNS = {
  "2022": {
    year: 2022,
    name: "Alex Johnson",
    filingStatus: "married_filing_jointly",
    dependents: [],
    income: {
      items: [
        { label: "W-2 Wages", amount: 128000 },
        { label: "Ordinary Dividends", amount: 3200 },
        { label: "Qualified Dividends", amount: 2800 },
        { label: "Long-term Capital Gains", amount: 9500 },
      ],
      total: 140700,
    },
    federal: {
      agi: 140700,
      deductions: [{ label: "Standard Deduction", amount: -25900 }],
      taxableIncome: 114800,
      tax: 17206,
      additionalTaxes: [],
      credits: [],
      payments: [{ label: "Federal Tax Withheld", amount: -16800 }],
      refundOrOwed: -406,
    },
    states: [
      {
        name: "New York",
        agi: 140700,
        deductions: [{ label: "Standard Deduction", amount: -16050 }],
        taxableIncome: 124650,
        tax: 8126,
        adjustments: [],
        payments: [{ label: "NY Tax Withheld", amount: -8500 }],
        refundOrOwed: 374,
      },
    ],
    summary: {
      federalAmount: -406,
      stateAmounts: [{ state: "New York", amount: 374 }],
      netPosition: -32,
    },
    rates: {
      federal: { marginal: 22, effective: 12.2 },
      state: { marginal: 6.85, effective: 5.8 },
      combined: { marginal: 28.85, effective: 18.0 },
    },
  },
  "2023": {
    year: 2023,
    name: "Alex Johnson",
    filingStatus: "married_filing_jointly",
    dependents: [],
    income: {
      items: [
        { label: "W-2 Wages", amount: 148000 },
        { label: "Ordinary Dividends", amount: 4100 },
        { label: "Qualified Dividends", amount: 3600 },
        { label: "Long-term Capital Gains", amount: 14200 },
        { label: "RSU Income", amount: 22000 },
      ],
      total: 188300,
    },
    federal: {
      agi: 188300,
      deductions: [{ label: "Standard Deduction", amount: -27700 }],
      taxableIncome: 160600,
      tax: 27848,
      additionalTaxes: [],
      credits: [{ label: "Child Tax Credit", amount: -2000 }],
      payments: [{ label: "Federal Tax Withheld", amount: -28000 }],
      refundOrOwed: 2152,
    },
    states: [
      {
        name: "New York",
        agi: 188300,
        deductions: [{ label: "Standard Deduction", amount: -16050 }],
        taxableIncome: 172250,
        tax: 11782,
        adjustments: [],
        payments: [{ label: "NY Tax Withheld", amount: -11500 }],
        refundOrOwed: -282,
      },
    ],
    summary: {
      federalAmount: 2152,
      stateAmounts: [{ state: "New York", amount: -282 }],
      netPosition: 1870,
    },
    rates: {
      federal: { marginal: 22, effective: 14.8 },
      state: { marginal: 6.85, effective: 6.3 },
      combined: { marginal: 28.85, effective: 21.1 },
    },
  },
  "2024": {
    year: 2024,
    name: "Alex Johnson",
    filingStatus: "married_filing_jointly",
    dependents: [{ name: "Jamie Johnson", relationship: "Child" }],
    income: {
      items: [
        { label: "W-2 Wages", amount: 165000 },
        { label: "Ordinary Dividends", amount: 5200 },
        { label: "Qualified Dividends", amount: 4600 },
        { label: "Long-term Capital Gains", amount: 18400 },
        { label: "RSU Income", amount: 31000 },
      ],
      total: 219600,
    },
    federal: {
      agi: 219600,
      deductions: [{ label: "Standard Deduction", amount: -29200 }],
      taxableIncome: 190400,
      tax: 35712,
      additionalTaxes: [{ label: "Net Investment Income Tax", amount: 342 }],
      credits: [{ label: "Child Tax Credit", amount: -2000 }],
      payments: [{ label: "Federal Tax Withheld", amount: -34000 }],
      refundOrOwed: 946,
    },
    states: [
      {
        name: "New York",
        agi: 219600,
        deductions: [{ label: "Standard Deduction", amount: -16050 }],
        taxableIncome: 203550,
        tax: 14492,
        adjustments: [],
        payments: [{ label: "NY Tax Withheld", amount: -14800 }],
        refundOrOwed: 308,
      },
    ],
    summary: {
      federalAmount: 946,
      stateAmounts: [{ state: "New York", amount: 308 }],
      netPosition: 1254,
    },
    rates: {
      federal: { marginal: 24, effective: 16.3 },
      state: { marginal: 6.85, effective: 6.6 },
      combined: { marginal: 30.85, effective: 22.9 },
    },
  },
};

// Minimal mock forecast to show the loaded forecast view
const MOCK_FORECAST = {
  projectedYear: 2025,
  taxLiability: { value: 41200, low: 36000, high: 46400 },
  effectiveRate: { value: 17.1, low: 15.0, high: 19.2 },
  estimatedOutcome: { value: 1800, low: -400, high: 4000, label: "refund" },
  bracket: { rate: 24, floor: 206700, ceiling: 394600, projectedIncome: 238000, headroom: 156600 },
  assumptions: [
    {
      icon: "💼",
      label: "Salary growth",
      value: "+5%",
      reasoning: "Consistent 5–8% annual increases over the past three years.",
      confidence: "high",
    },
    {
      icon: "📈",
      label: "Capital gains",
      value: "$20,000",
      reasoning: "Modest LTCG based on prior years; no unusual vest or sale expected.",
      confidence: "medium",
    },
    {
      icon: "🏠",
      label: "Deductions",
      value: "Standard",
      reasoning: "Standard deduction remains optimal given itemized totals in prior years.",
      confidence: "high",
    },
  ],
  actionItems: [
    {
      title: "Max out 401(k)",
      description:
        "Contributing an additional $8,500 to your 401(k) would reduce taxable income from ~$238K to ~$229.5K, saving roughly $2,040 in federal tax at your 24% marginal rate.",
      estimatedSaving: "$2,040",
      timing: "Before Dec 31",
      category: "retirement",
    },
    {
      title: "Consider IRA contribution",
      description:
        "A $7,000 traditional IRA contribution could save ~$1,680 if deductible, or build Roth basis tax-free for future withdrawals.",
      estimatedSaving: "$1,680",
      timing: "Before Apr 15, 2026",
      category: "retirement",
    },
    {
      title: "Review capital gains timing",
      description:
        "You remain in the 15% LTCG bracket up to $583,750 MFJ. Realizing planned gains before year-end avoids risk of higher income pushing you toward the 20% threshold.",
      estimatedSaving: "Varies",
      category: "capital_gains",
    },
  ],
  riskFlags: [
    {
      severity: "medium",
      description:
        "RSU vesting schedule not confirmed — a large vest could push taxable income above $206K and into a higher bracket.",
    },
  ],
  generatedAt: new Date().toISOString(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waitForServer(url: string, maxMs = 15000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`Server at ${url} did not start within ${maxMs}ms`);
}

async function screenshot(page: import("playwright").Page, name: string): Promise<void> {
  const file = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  console.log(`  ✓ ${name}.png`);
}

// Move a range slider to a given value using React-compatible events
async function setSlider(
  page: import("playwright").Page,
  index: number,
  value: number,
): Promise<void> {
  await page.locator('input[type="range"]').nth(index).evaluate((el: HTMLInputElement, val) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
      .set!;
    setter.call(el, String(val));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Back up real data files
  const realReturns = existsSync(RETURNS_FILE) ? readFileSync(RETURNS_FILE, "utf8") : null;
  const realForecast = existsSync(FORECAST_FILE) ? readFileSync(FORECAST_FILE, "utf8") : null;

  try {
    // 2. Write mock data
    await writeFile(RETURNS_FILE, JSON.stringify(MOCK_RETURNS, null, 2));
    await writeFile(FORECAST_FILE, JSON.stringify(MOCK_FORECAST, null, 2));
    await mkdir(SCREENSHOTS_DIR, { recursive: true });

    // 3. Start server with a dummy API key (satisfies hasKey check; no real calls made)
    console.log("Starting dev server on port", PORT, "...");
    const server = Bun.spawn(["bun", "--hot", "src/index.ts", "--port", String(PORT)], {
      cwd: ROOT,
      env: { ...process.env, ANTHROPIC_API_KEY: "sk-ant-mock-screenshots-only" },
      stdout: "ignore",
      stderr: "ignore",
    });

    await waitForServer(`${BASE_URL}/api/config`);
    console.log("Server ready. Taking screenshots...\n");

    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 820 },
      colorScheme: "light",
    });
    const page = await ctx.newPage();

    // Suppress API key check — server has ANTHROPIC_API_KEY set so /api/config returns hasKey:true
    await page.goto(BASE_URL, { waitUntil: "networkidle" });

    // ── 1. Summary view ──
    // Should land on summary by default; wait for charts to render
    await page.waitForSelector('[class*="SummaryTable"], table', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    await screenshot(page, "summary");

    // ── 2. By Year — Receipt tab (2024) ──
    // Click the 2024 year in the sidebar
    await page.getByText("2024").first().click();
    await page.waitForTimeout(500);
    // Make sure we're on receipt tab (default)
    const receiptTab = page.getByRole("tab", { name: /receipt/i });
    if (await receiptTab.isVisible()) await receiptTab.click();
    await page.waitForTimeout(400);
    await screenshot(page, "by-year-receipt");

    // ── 3. By Year — Charts tab (bracket visualizer) ──
    const chartsTab = page.getByRole("tab", { name: /charts/i });
    if (await chartsTab.isVisible()) await chartsTab.click();
    await page.waitForTimeout(600);
    await screenshot(page, "bracket-visualizer");

    // ── 4. What-if simulator (sliders engaged) ──
    // Move first slider (401k top-up) to ~$10,000
    const sliders = page.locator('input[type="range"]');
    const sliderCount = await sliders.count();
    if (sliderCount >= 1) {
      await setSlider(page, 0, 10000); // 401k top-up $10,000
    }
    if (sliderCount >= 2) {
      await setSlider(page, 1, 7000); // IRA contribution $7,000
    }
    await page.waitForTimeout(400);
    await screenshot(page, "what-if-simulator");

    // ── 5. Forecast view ──
    await page.getByText("Forecast").first().click();
    await page.waitForTimeout(800);
    await screenshot(page, "forecast");

    // ── 6. Insights panel — idle state on 2023 ──
    await page.getByText("2023").first().click();
    await page.waitForTimeout(400);
    const receiptTab2 = page.getByRole("tab", { name: /receipt/i });
    if (await receiptTab2.isVisible()) await receiptTab2.click();
    await page.waitForTimeout(500);
    // Scroll down to reveal the insights panel
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(300);
    await screenshot(page, "insights-panel");

    await browser.close();
    server.kill();

    console.log(`\nAll screenshots saved to docs/screenshots/`);
    console.log(
      "Add them to README.md with: ![caption](docs/screenshots/name.png)",
    );
  } finally {
    // 4. Restore real data (always runs, even on error)
    if (realReturns !== null) {
      await writeFile(RETURNS_FILE, realReturns);
    } else if (existsSync(RETURNS_FILE)) {
      await rm(RETURNS_FILE);
    }

    if (realForecast !== null) {
      await writeFile(FORECAST_FILE, realForecast);
    } else if (existsSync(FORECAST_FILE)) {
      await rm(FORECAST_FILE);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { expect, test } from "@playwright/test";
import path from "path";

// Screenshot capture script — run against the live dev server with real tax data loaded.
// Start: bun run dev
// Capture: bunx playwright test tests/e2e/screenshots.pw.ts
//
// Outputs to docs/screenshots/. Commit the resulting PNGs to update README screenshots.

const SCREENSHOTS_DIR = path.resolve("docs/screenshots");

// Shared setup: 1280×960 viewport, chat closed.
async function setup(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("tax-chat-open", "false"));
  await page.reload();
  await page.waitForLoadState("networkidle");
}

// Adds fade-to-white gradients at the bottom and right so content doesn't look abruptly cut.
async function addBottomFade(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const styles: [string, string][] = [
      [
        "screenshot-fade-bottom",
        "position:fixed;bottom:0;left:0;right:0;height:80px;" +
          "background:linear-gradient(to bottom,transparent,white);" +
          "pointer-events:none;z-index:99999;",
      ],
      [
        "screenshot-fade-right",
        "position:fixed;top:0;right:0;bottom:0;width:80px;" +
          "background:linear-gradient(to right,transparent,white);" +
          "pointer-events:none;z-index:99999;",
      ],
    ];
    styles.forEach(([id, css]) => {
      const el = document.createElement("div");
      el.id = id;
      el.style.cssText = css;
      document.body.appendChild(el);
    });
  });
}

test.describe("Screenshot capture", () => {
  test("hero", async ({ page }) => {
    await setup(page);
    await page.getByText("Summary", { exact: true }).first().click();
    await page.waitForTimeout(600);
    await addBottomFade(page);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "hero.png") });
  });

  test("summary view", async ({ page }) => {
    await setup(page);
    await page.getByText("Summary", { exact: true }).first().click();
    await page.waitForTimeout(600);
    await addBottomFade(page);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "summary.png") });
  });

  test("by-year receipt", async ({ page }) => {
    await setup(page);
    await page.getByText("By Year", { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelectorAll(".overflow-y-auto").forEach((el) => el.scrollTo(0, 0)));
    await addBottomFade(page);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "by-year-receipt.png") });
  });

  test("bracket visualizer", async ({ page }) => {
    await setup(page);
    await page.getByText("By Year", { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "charts", exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll(".overflow-y-auto").forEach((el) => el.scrollTo(0, 0)));
    await page.waitForTimeout(300);
    await addBottomFade(page);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "bracket-visualizer.png") });
  });

  test("what-if simulator", async ({ page }) => {
    await setup(page);
    await page.getByText("By Year", { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "charts", exact: true }).first().click();
    await page.waitForTimeout(800);
    // Scroll past the bracket visualizer to the What-If Simulator section.
    await page.evaluate(() => {
      const containers = document.querySelectorAll(".overflow-y-auto");
      let tallest: Element | null = null;
      containers.forEach((c) => {
        if (!tallest || c.scrollHeight > tallest.scrollHeight) tallest = c;
      });
      if (tallest) (tallest as HTMLElement).scrollTop = 600;
    });
    await page.waitForTimeout(400);
    await addBottomFade(page);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "what-if-simulator.png") });
  });

  test("insights panel", async ({ page }) => {
    await setup(page);
    await page.getByText("By Year", { exact: true }).first().click();
    await page.waitForTimeout(600);
    const insights = page.getByText(/insights/i).first();
    if (await insights.isVisible().catch(() => false)) {
      await insights.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    }
    await addBottomFade(page);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "insights-panel.png") });
  });

  test("forecast view", async ({ page }) => {
    await setup(page);
    await page.getByText("Forecast", { exact: true }).first().click();
    await page.waitForTimeout(800);
    await addBottomFade(page);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "forecast.png") });
  });

  test("forecast profile panel open", async ({ page }) => {
    await setup(page);
    await page.getByText("Forecast", { exact: true }).first().click();
    await page.waitForTimeout(800);

    const addInputsInline = page.getByRole("button", { name: /add \d+ inputs/i }).first();
    const addInputsBtn = page.getByText("+ Add inputs", { exact: true }).first();
    const editInputsBtn = page.getByText("Edit inputs", { exact: true }).first();

    const hasInline = await addInputsInline.isVisible().catch(() => false);
    const hasAddBtn = await addInputsBtn.isVisible().catch(() => false);
    const hasEditBtn = await editInputsBtn.isVisible().catch(() => false);

    if (hasInline) {
      await addInputsInline.click();
    } else if (hasAddBtn) {
      await addInputsBtn.click();
    } else if (hasEditBtn) {
      await editInputsBtn.click();
    } else {
      test.skip();
      return;
    }

    await expect(page.getByText("2025 Inputs", { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(400);
    await addBottomFade(page);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "forecast-profile.png") });
  });
});

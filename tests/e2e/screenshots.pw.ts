import { expect, test } from "@playwright/test";
import path from "path";

// Screenshot capture script — run against the live dev server with real tax data loaded.
// Start: bun run dev
// Capture: bunx playwright test tests/e2e/screenshots.pw.ts
//
// Outputs to docs/screenshots/. Commit the resulting PNGs to update README screenshots.

const SCREENSHOTS_DIR = path.resolve("docs/screenshots");

test.describe("Screenshot capture", () => {
  test("summary view", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("tax-chat-open", "false"));
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByText("Summary", { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "summary.png") });
  });

  test("hero", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("tax-chat-open", "false"));
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByText("Summary", { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "hero.png") });
  });

  test("by-year receipt", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByText("By Year", { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "by-year-receipt.png") });
  });

  test("forecast view", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByText("Forecast", { exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "forecast.png") });
  });

  test("forecast profile panel open", async ({ page }) => {
    // Force chat closed via localStorage before the app boots
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("tax-chat-open", "false"));
    await page.reload();
    await page.waitForLoadState("networkidle");

    await page.getByText("Forecast", { exact: true }).first().click();
    await page.waitForTimeout(800);

    // Try all entry points into the profile panel
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
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "forecast-profile.png") });
  });
});

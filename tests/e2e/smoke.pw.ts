import { expect, test } from "@playwright/test";

// These tests run against the live dev server (127.0.0.1:3005).
// Start it first: bun run dev
// Then: bunx playwright test

test.describe("App loads", () => {
  test("renders without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });

  test("shows sidebar and main content area", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Sidebar should exist
    await expect(page.locator("aside")).toBeVisible();
    // Main panel should exist
    await expect(page.locator("main, [role='main'], .flex-1").first()).toBeVisible();
  });
});

test.describe("Sidebar navigation", () => {
  test("Summary link is present and clickable", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const summaryBtn = page.getByText("Summary", { exact: true }).first();
    await expect(summaryBtn).toBeVisible();
    await summaryBtn.click();
  });

  test("Forecast link is present and clickable", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const forecastBtn = page.getByText("Forecast", { exact: true }).first();
    await expect(forecastBtn).toBeVisible();
    await forecastBtn.click();
  });
});

test.describe("Country-specific UI", () => {
  test("Import India ITR only appears on India tab", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check if multi-country mode is active (both US and India loaded)
    const indiaTab = page.getByRole("button", { name: /india/i }).first();
    const isMultiCountry = await indiaTab.isVisible().catch(() => false);

    if (!isMultiCountry) {
      test.skip();
      return;
    }

    const actionsMenu = page.getByRole("button", { name: /actions/i }).first();

    // On US tab (default): open menu, Import India ITR should NOT appear
    await actionsMenu.click();
    await expect(page.getByText("Import India ITR")).not.toBeVisible();
    await page.keyboard.press("Escape");

    // Switch to India tab, open menu, Import India ITR SHOULD appear
    await indiaTab.click();
    await actionsMenu.click();
    await expect(page.getByText("Import India ITR")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Country toggle buttons have pointer cursor", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const indiaTab = page.getByRole("button", { name: /india/i }).first();
    const isMultiCountry = await indiaTab.isVisible().catch(() => false);
    if (!isMultiCountry) {
      test.skip();
      return;
    }

    const cursor = await indiaTab.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe("pointer");
  });
});

test.describe("Forecast tab", () => {
  test("Forecast view loads without error", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByText("Forecast", { exact: true }).first().click();
    await page.waitForTimeout(500);

    // Should show either the forecast, a generate button, or a loading state — not an error
    const hasError = await page
      .getByText(/runtime error/i)
      .isVisible()
      .catch(() => false);
    expect(hasError).toBe(false);
  });

  test("Profile panel opens and closes", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByText("Forecast", { exact: true }).first().click();
    await page.waitForTimeout(500);

    // Try to find the confidence banner / Add inputs button
    const addInputsBtn = page.getByText("+ Add inputs").first();
    const editInputsBtn = page.getByText("Edit inputs").first();

    const hasAddBtn = await addInputsBtn.isVisible().catch(() => false);
    const hasEditBtn = await editInputsBtn.isVisible().catch(() => false);

    if (hasAddBtn) {
      await addInputsBtn.click();
    } else if (hasEditBtn) {
      await editInputsBtn.click();
    } else {
      // Forecast is empty state or generating — skip
      test.skip();
      return;
    }

    // Panel should open showing the form
    await expect(page.getByText("Inputs", { exact: false }).first()).toBeVisible();

    // Close it
    await page.getByText("Close").first().click();
    await expect(page.getByText("2025 Inputs").first()).not.toBeVisible();
  });
});

test.describe("Chat panel", () => {
  test("Chat toggles open and closed", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Find the chat toggle button in sidebar
    const chatBtn = page.locator("button[title*='chat' i], button[aria-label*='chat' i]").first();
    const isChatBtnVisible = await chatBtn.isVisible().catch(() => false);

    if (!isChatBtnVisible) {
      test.skip();
      return;
    }

    await chatBtn.click();
    // Chat panel should appear
    await expect(page.locator("textarea").first()).toBeVisible();
  });
});

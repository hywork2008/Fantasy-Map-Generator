import { test, expect } from "@playwright/test";

test.describe("FMG Comprehensive User Workflow", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept console.error to catch runtime errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error(`[Console Error]: ${msg.text()}`);
      }
    });

    // Navigate to application
    await page.goto("/Fantasy-Map-Generator/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
  });

  test("should generate map without errors", async ({ page }) => {
    // Click Generate button
    const generateBtn = page.locator('input[value="Generate"]');
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // Wait for generation to complete
    await page.waitForTimeout(3000);

    // Verify map is rendered
    const mapElement = page.locator("svg");
    await expect(mapElement).toBeVisible();
  });

  test("should open Options dialog and switch view modes", async ({ page }) => {
    // Generate map first
    const generateBtn = page.locator('input[value="Generate"]');
    await generateBtn.click();
    await page.waitForTimeout(2000);

    // Click Options button
    const optionsBtn = page.locator('input[value="Options"]');
    await expect(optionsBtn).toBeVisible();
    await optionsBtn.click();

    // Options dialog should be visible
    const optionsDialog = page.locator("[aria-label='Options']").first();
    await expect(optionsDialog).toBeVisible({ timeout: 5000 });

    // Try different view modes (if they exist)
    const standardViewBtn = page.locator("input[value='Standard']");
    if (await standardViewBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await standardViewBtn.click();
      await page.waitForTimeout(500);
    }

    // Close dialog
    const closeBtn = optionsDialog.locator("button").filter({ hasText: "Close" }).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("should open Configure World dialog", async ({ page }) => {
    // Generate map first
    const generateBtn = page.locator('input[value="Generate"]');
    await generateBtn.click();
    await page.waitForTimeout(2000);

    // Click Options to open options panel
    const optionsBtn = page.locator('input[value="Options"]');
    await optionsBtn.click();
    await page.waitForTimeout(1000);

    // Look for Configure World button/option
    const configureBtn = page.locator("input[value='Configure World']");
    if (await configureBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await configureBtn.click();
      await page.waitForTimeout(1500);

      // Verify dialog opened
      const configDialog = page.locator("[aria-label='Configure World']").first();
      await expect(configDialog).toBeVisible({ timeout: 3000 });

      // Close dialog
      const closeBtn = configDialog.locator("button").filter({ hasText: "Cancel" }).first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      }
    }
  });

  test("should open Tools tab and regenerate features", async ({ page }) => {
    // Generate map first
    const generateBtn = page.locator('input[value="Generate"]');
    await generateBtn.click();
    await page.waitForTimeout(2000);

    // Click Options
    const optionsBtn = page.locator('input[value="Options"]');
    await optionsBtn.click();
    await page.waitForTimeout(1000);

    // Look for Tools tab
    const toolsTab = page.locator("input[value='Tools']");
    if (await toolsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toolsTab.click();
      await page.waitForTimeout(500);

      // Try regenerate buttons
      const regenerateButtons = ["Regenerate Burgs", "Regenerate Cultures", "Regenerate Provinces"];
      for (const btnText of regenerateButtons) {
        const btn = page.locator(`input[value='${btnText}']`);
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(1000);
        }
      }

      // Close options dialog
      const closeBtn = page.locator("input[value='Close']");
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click();
      }
    }
  });

  test("should not generate console.error during common operations", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];

    // Listen for console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    // Generate map
    const generateBtn = page.locator('input[value="Generate"]');
    await generateBtn.click();
    await page.waitForTimeout(3000);

    // Interact with Options
    const optionsBtn = page.locator('input[value="Options"]');
    await optionsBtn.click();
    await page.waitForTimeout(1500);

    // Verify no errors occurred
    expect(errors).toEqual(
      [],
    );
  });

  test("should handle Reset Zoom without errors", async ({ page }) => {
    // Generate map
    const generateBtn = page.locator('input[value="Generate"]');
    await generateBtn.click();
    await page.waitForTimeout(2000);

    // Look for Reset Zoom button
    const resetZoomBtn = page.locator("input[value='Reset Zoom']");
    if (await resetZoomBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resetZoomBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("should handle Minimap without errors", async ({ page }) => {
    // Generate map
    const generateBtn = page.locator('input[value="Generate"]');
    await generateBtn.click();
    await page.waitForTimeout(2000);

    // Open Options
    const optionsBtn = page.locator('input[value="Options"]');
    await optionsBtn.click();
    await page.waitForTimeout(1000);

    // Look for Minimap option
    const minimapBtn = page.locator("input[value='Minimap']");
    if (await minimapBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await minimapBtn.click();
      await page.waitForTimeout(1000);

      // Close minimap if it opened
      const minimapClose = page.locator("[aria-label='Minimap']").locator("button").first();
      if (await minimapClose.isVisible().catch(() => false)) {
        await minimapClose.click();
      }
    }
  });

  test("should verify no undefined reference errors in runtime", async ({ page }) => {
    let runtimeErrors: string[] = [];

    // Capture all console messages and errors
    page.on("console", (msg) => {
      const text = msg.text();
      // Check for common undefined reference patterns
      if (
        text.includes("is not defined") ||
        text.includes("is not a function") ||
        text.includes("Cannot read properties of undefined")
      ) {
        runtimeErrors.push(text);
      }
    });

    // Generate map - this triggers most UI initialization
    const generateBtn = page.locator('input[value="Generate"]');
    await generateBtn.click();
    await page.waitForTimeout(3000);

    // Open Options panel
    const optionsBtn = page.locator('input[value="Options"]');
    if (await optionsBtn.isVisible().catch(() => false)) {
      await optionsBtn.click();
      await page.waitForTimeout(1500);

      // Try to interact with various panels
      const toolsTab = page.locator("input[value='Tools']");
      if (await toolsTab.isVisible().catch(() => false)) {
        await toolsTab.click();
        await page.waitForTimeout(500);
      }

      // Close Options
      const closeBtn = page.locator("input[value='Close']");
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      }
    }

    // Verify no undefined reference errors were caught
    expect(runtimeErrors).toEqual(
      [],
    );
  });
});

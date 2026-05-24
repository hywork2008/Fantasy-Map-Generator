import { expect, test } from "@playwright/test";

async function openMap(page: import("@playwright/test").Page) {
  await page.goto("/Fantasy-Map-Generator/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as any).mapId !== undefined, { timeout: 60000 });
  await page.waitForFunction(() => typeof (window as any).fmg?.toggleBiomes === "function", { timeout: 15000 });
}

function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    e =>
      !e.includes("fonts.googleapis.com") &&
      !e.includes("google-analytics") &&
      !e.includes("googletagmanager") &&
      !e.includes("Failed to load resource")
  );
}

test.describe("Layer toggle", () => {
  test("toggleBiomes should change #biomes and toggle back", async ({ context, page }) => {
    await context.clearCookies();
    await openMap(page);

    const countBefore = await page.locator("#biomes path").count();
    await page.evaluate(() => (window as any).fmg.toggleBiomes());
    await page.waitForTimeout(200);
    const countAfterFirst = await page.locator("#biomes path").count();

    expect(countAfterFirst, "toggleBiomes should change path count").not.toBe(countBefore);

    await page.evaluate(() => (window as any).fmg.toggleBiomes());
    await page.waitForTimeout(200);
    const countAfterSecond = await page.locator("#biomes path").count();

    expect(countAfterSecond, "toggleBiomes second call should restore state").toBe(countBefore);
  });

  test("toggleStates/toggleRivers/toggleBorders should mutate target layers with no console errors", async ({ context, page }) => {
    await context.clearCookies();

    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);

    const statesBefore = await page.locator("#statesBody path").count();
    await page.evaluate(() => (window as any).fmg.toggleStates());
    await page.waitForTimeout(200);
    const statesAfter = await page.locator("#statesBody path").count();
    expect(statesAfter, "toggleStates should change #statesBody path count").not.toBe(statesBefore);

    const riversBefore = await page.locator("#rivers path").count();
    await page.evaluate(() => (window as any).fmg.toggleRivers());
    await page.waitForTimeout(200);
    const riversAfter = await page.locator("#rivers path").count();
    expect(riversAfter, "toggleRivers should change #rivers path count").not.toBe(riversBefore);

    const bordersBefore = await page.locator("#borders path").count();
    await page.evaluate(() => (window as any).fmg.toggleBorders());
    await page.waitForTimeout(200);
    const bordersAfter = await page.locator("#borders path").count();
    expect(bordersAfter, "toggleBorders should change #borders path count").not.toBe(bordersBefore);

    const criticalErrors = filterCriticalErrors(errors);
    expect(criticalErrors, `Unexpected console/page errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });

  test("toggleHeight/toggleGrid/toggleTemperature should work without renderer/runtime errors", async ({ context, page }) => {
    await context.clearCookies();

    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);

    await page.evaluate(() => (window as any).fmg.toggleHeight());
    await page.waitForTimeout(250);

    await page.evaluate(() => (window as any).fmg.toggleGrid());
    await page.waitForTimeout(250);

    await page.evaluate(() => (window as any).fmg.toggleTemperature());
    await page.waitForTimeout(350);

    await page.evaluate(() => (window as any).fmg.toggleTemperature());
    await page.waitForTimeout(200);
    await page.evaluate(() => (window as any).fmg.toggleGrid());
    await page.waitForTimeout(200);
    await page.evaluate(() => (window as any).fmg.toggleHeight());
    await page.waitForTimeout(200);

    const criticalErrors = filterCriticalErrors(errors).filter(
      e =>
        !e.includes("getColorScheme is not defined") &&
        !e.includes("calculateFriendlyGridSize is not defined") &&
        !e.includes("ConnectVertices: next vertex is not found")
    );
    expect(criticalErrors, `Unexpected layer toggle errors: ${criticalErrors.join("; ")}`).toEqual([]);

    const regressionErrors = errors.filter(
      e =>
        e.includes("getColorScheme is not defined") ||
        e.includes("calculateFriendlyGridSize is not defined") ||
        e.includes("ConnectVertices: next vertex is not found")
    );
    expect(regressionErrors, `Layer regression errors detected: ${regressionErrors.join("; ")}`).toEqual([]);
  });
});

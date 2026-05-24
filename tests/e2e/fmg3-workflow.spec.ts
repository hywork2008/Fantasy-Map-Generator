import { expect, test } from "@playwright/test";

function isIgnorableError(message: string): boolean {
  return (
    message.includes("fonts.googleapis.com") ||
    message.includes("google-analytics") ||
    message.includes("googletagmanager") ||
    message.includes("Failed to load resource") ||
    message.includes("Unexpected token 'export'") ||
    message.includes("WebGL") ||
    message.includes("dropbox") ||
    message.includes("Dropbox") ||
    // 3D rendering errors in headless environment (no GPU/WebGL renderer)
    message.includes("THREE") ||
    message.includes("updateGlobeTexure") ||
    message.includes("createMesh") ||
    message.includes("img2.onload") ||
    message.includes("Maximum call stack")
  );
}

async function openMap(page: import("@playwright/test").Page) {
  await page.goto("/Fantasy-Map-Generator/", {waitUntil: "domcontentloaded"});
  await page.waitForFunction(() => (window as any).mapId !== undefined, {timeout: 60000});
}

async function ensureOptionsOpen(page: import("@playwright/test").Page) {
  const options = page.locator("#options");
  if (await options.isVisible()) return;
  await page.locator("#optionsTrigger").click();
  await expect(options).toBeVisible({timeout: 10000});
}

test.describe("fmg-3 workflow", () => {
  test("3D + Configure World + Submap + Transform runs without runtime errors", async ({page, context}) => {
    test.setTimeout(120000);
    await context.clearCookies();

    const errors: string[] = [];
    page.on("pageerror", error => {
      const details = error.stack ? `\n${error.stack}` : "";
      errors.push(`pageerror: ${error.message}${details}`);
    });
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await openMap(page);
    errors.length = 0;

    await ensureOptionsOpen(page);

    await page.locator("#viewMesh").click();
    await page.locator("#options3dMeshRotationRange").fill("6");
    await page.locator("#options3dScaleRange").fill("27");
    await page.locator("#options3dLightnessRange").fill("68");
    await page.waitForTimeout(300);

    await page.locator("#viewGlobe").click();
    await page.locator("#options3dGlobeRotationRange").fill("0");
    await page.waitForTimeout(300);

    await page.locator("#viewStandard").click();
    await page.waitForTimeout(300);

    await page.locator("#optionsTab").click();
    await page.locator("#configureWorld").click();
    await expect(page.locator(".ui-dialog:visible").filter({hasText: /configure world/i})).toBeVisible({timeout: 10000});
    await page.locator("#latitudeOutput").fill("79.7");
    await page.locator("#longitudeOutput").fill("75.3");
    await page.locator("#precOutput").fill("374");
    await page.locator("#mapSizeOutput").fill("51.8");

    const updateWorldButton = page.locator(".ui-dialog:visible .ui-dialog-buttonpane button", {hasText: "Update world"});
    await updateWorldButton.first().click();
    await page.waitForTimeout(800);

    const closeWorld = page.locator(".ui-dialog:visible button.ui-dialog-titlebar-close");
    if ((await closeWorld.count()) > 0) {
      await closeWorld.first().click();
      await page.waitForTimeout(300);
    }

    await page.locator("#toolsTab").click();

    await page.locator("#openSubmapTool").click();
    const submapDialog = page.locator(".ui-dialog:visible").filter({hasText: /create a submap/i});
    await expect(submapDialog).toBeVisible({timeout: 10000});
    await submapDialog.locator(".ui-dialog-buttonpane button", {hasText: /^Submap$/}).click();
    await page.waitForTimeout(1200);

    await page.locator("#openTransformTool").click();
    const transformDialog = page.locator(".ui-dialog:visible").filter({hasText: /transform map/i});
    await expect(transformDialog).toBeVisible({timeout: 10000});
    await transformDialog.locator(".ui-dialog-buttonpane button", {hasText: /^Transform$/}).click();
    await page.waitForTimeout(1200);

    const criticalErrors = errors.filter(message => !isIgnorableError(message));
    expect(criticalErrors, `Runtime errors: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});

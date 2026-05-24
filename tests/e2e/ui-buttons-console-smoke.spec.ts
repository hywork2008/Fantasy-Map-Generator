import { expect, test } from "@playwright/test";

function isIgnorableError(message: string): boolean {
  return (
    message.includes("fonts.googleapis.com") ||
    message.includes("google-analytics") ||
    message.includes("googletagmanager") ||
    message.includes("Failed to load resource") ||
    // Existing legacy script loading issue tracked separately from this UI smoke test
    message.includes("Unexpected token 'export'")
  );
}

async function openMap(page: import("@playwright/test").Page) {
  await page.goto("/Fantasy-Map-Generator/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as any).mapId !== undefined, { timeout: 60000 });
}

async function ensureOptionsOpen(page: import("@playwright/test").Page) {
  const options = page.locator("#options");
  if (await options.isVisible()) return;

  await page.locator("#optionsTrigger").click();
  if (await options.isVisible()) return;

  // Fallback for cases where synthetic click is required by legacy handlers.
  await page.evaluate(() => {
    const runtime = window as any;
    if (typeof runtime.showOptions === "function") {
      runtime.showOptions(new Event("click"));
    }
  });
  await expect(options).toBeVisible();
}

async function clickById(page: import("@playwright/test").Page, id: string) {
  const locator = page.locator(`#${id}`);
  await expect(locator, `Expected #${id} to be visible before click`).toBeVisible();
  await locator.click();
}

async function closeLatestDialog(page: import("@playwright/test").Page) {
  const closeButtons = page.locator("#dialogs .ui-dialog:visible button.ui-dialog-titlebar-close");
  const count = await closeButtons.count();
  if (!count) return;

  await closeButtons.last().click();
  await page.waitForTimeout(60);
}

test.describe("UI button console smoke", () => {
  test("recorded tools flow should not emit runtime errors", async ({ page, context }) => {
    test.setTimeout(120000);

    await context.clearCookies();
    await page.setViewportSize({ width: 2319, height: 742 });

    const errors: string[] = [];

    page.on("pageerror", error => {
      errors.push(`pageerror: ${error.message}`);
    });

    page.on("console", msg => {
      if (msg.type() === "error") {
        errors.push(`console.error: ${msg.text()}`);
      }
    });

    page.on("dialog", async dialog => {
      await dialog.dismiss();
    });

    await openMap(page);
    await expect(page).toHaveTitle(/Azgaar's Fantasy Map Generator/);

    // Ignore startup noise and validate recorded interactions only.
    errors.length = 0;

    await ensureOptionsOpen(page);
    await clickById(page, "toolsTab");
    await expect(page.locator("#toolsContent")).toBeVisible();

    await clickById(page, "editBiomesButton");
    await closeLatestDialog(page);

    await clickById(page, "overviewBurgsButton");
    await closeLatestDialog(page);

    await clickById(page, "editCoastlineSettings");
    await closeLatestDialog(page);

    await clickById(page, "editCulturesButton");
    await closeLatestDialog(page);

    await clickById(page, "editDiplomacyButton");
    await closeLatestDialog(page);

    await clickById(page, "editEmblemButton");
    await closeLatestDialog(page);

    await clickById(page, "editHeightmapButton");
    await closeLatestDialog(page);

    await clickById(page, "overviewMarkersButton");
    await closeLatestDialog(page);

    await clickById(page, "overviewMilitaryButton");
    await closeLatestDialog(page);

    await clickById(page, "editNamesBaseButton");
    await closeLatestDialog(page);

    await clickById(page, "editNotesButton");
    await closeLatestDialog(page);

    await clickById(page, "editProvincesButton");
    await closeLatestDialog(page);

    await clickById(page, "editReligions");
    await clickById(page, "overviewRiversButton");
    await clickById(page, "overviewRoutesButton");
    await closeLatestDialog(page);

    await clickById(page, "editStatesButton");
    await clickById(page, "editUnitsButton");
    await closeLatestDialog(page);

    await clickById(page, "editZonesButton");
    await closeLatestDialog(page);

    const criticalErrors = errors.filter(message => !isIgnorableError(message));
    expect(criticalErrors, `Runtime errors detected: ${criticalErrors.join("; ")}`).toEqual([]);
  });
});

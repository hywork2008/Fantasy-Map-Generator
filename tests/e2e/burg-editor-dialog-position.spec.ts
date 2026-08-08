import { expect, test } from "@playwright/test";
import { loadMapFile, waitForBurgLabels, zoomIn } from "./helpers/fmg-helpers";

test("keeps the Edit Burg titlebar fixed when switching to a taller tab", async ({ page }) => {
  await loadMapFile(page, "demo.map", "svg");
  await zoomIn(page);

  // Economy provides an intentionally compact tab to switch away from the
  // taller Overview body. Characters is its required dependency.
  await page.locator("#optionsHide").click();
  await page.locator("#extensionsTab").click();
  await page.getByRole("checkbox", { name: "Toggle Characters extension" }).check();
  await page.getByRole("checkbox", { name: "Toggle Economy, Goods & Trade extension" }).check();

  await page.locator("#layersTab").click();
  const labelsToggle = page.locator("#toggleLabels");
  if ((await labelsToggle.getAttribute("class"))?.includes("buttonoff")) await labelsToggle.click();
  await waitForBurgLabels(page);
  await page.locator("#burgLabels text").first().click();

  const dialog = page.locator(".fmg-dialog", { has: page.locator(".fmg-dialog-title", { hasText: "Edit Burg" }) });
  const titlebar = dialog.locator(".titlebar");
  await expect(dialog).toBeVisible();
  await page.getByRole("tab", { name: "Inns", exact: true }).click();

  const titlebarBox = await titlebar.boundingBox();
  expect(titlebarBox).not.toBeNull();
  await page.mouse.move(titlebarBox!.x + 12, titlebarBox!.y + titlebarBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(titlebarBox!.x + 12, 0, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await titlebar.boundingBox())?.y ?? Infinity).toBeLessThanOrEqual(1);

  const topBeforeSwitch = await titlebar.boundingBox();
  expect(topBeforeSwitch).not.toBeNull();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect.poll(async () => (await titlebar.boundingBox())?.y ?? Infinity).toBeCloseTo(topBeforeSwitch!.y, 1);
});

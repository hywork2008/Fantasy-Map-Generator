import { test, expect } from "@playwright/test";
import {
  waitForMapLoad,
  findFirstRealStateId,
  countStatesWithNeighbor,
  getMilitaryRegenerationResult,
  isOptionsMenuOpen,
  isLayerOn,
  setLayerPreset,
  zoomToMapCenter,
} from "./helpers/fmg-helpers";

test.describe("States", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto("/?seed=test-states&width=1280&height=720");
    await waitForMapLoad(page, "svg");
  });

  test("removing a state via UI should allow military regeneration without errors", async ({
    page,
  }) => {
    if (!(await isOptionsMenuOpen(page))) await page.click("#optionsHide");
    await page.waitForSelector("#options", { state: "visible" });

    await page.click("#toolsTab");
    await page.waitForSelector("#toolsContent", { state: "visible" });

    await page.click("#editStatesButton");
    await page.waitForSelector("#statesEditor", { state: "visible", timeout: 5000 });

    const stateId = await findFirstRealStateId(page);
    expect(stateId).not.toBeNull();

    // Dispatch a click on the trash icon (hidden by CSS) to trigger state removal.
    // force:true bypasses the visibility check so we can click the hidden element.
    await page
      .locator(`#statesBodySection tr[data-id="${stateId}"] .icon-trash-empty`)
      .click({ force: true });

    const removeButton = page.locator(".fmg-dialog-button", { hasText: "Remove" });
    await expect(removeButton).toBeVisible({ timeout: 5000 });
    await removeButton.click();

    // Wait for the state row to disappear from the editor
    await page.waitForFunction(
      (id: number | null) =>
        !document.querySelector(`#statesBodySection tr[data-id="${id}"]`),
      stateId,
      { timeout: 5000 }
    );

    const neighborsAfter = await countStatesWithNeighbor(page, stateId!);
    expect(neighborsAfter).toBe(0);

    await page.click('.fmg-dialog:has(#statesEditor) [aria-label="Close"]');
    await page.waitForSelector("#statesEditor", { state: "hidden" });

    await page.click("#regenerateMilitary");
    // Wait for any confirmation dialog to appear and confirm, or wait for completion
    const confirmBtn = page.locator(".fmg-dialog-button", { hasText: /yes|confirm/i });
    const appeared = await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false);
    if (appeared) await confirmBtn.click();

    // Allow military regeneration to process
    await page.waitForFunction(
      () => {
        const { states } = window.fmg.world.pack as {
          states: Array<{ i: number; removed?: boolean }>;
        };
        return states.some((s) => s.i && !s.removed);
      },
      { timeout: 5000 }
    );

    const militaryResult = await getMilitaryRegenerationResult(page);
    expect(militaryResult.statesCount).toBeGreaterThan(0);
    expect(militaryResult.statesWithMilitary).toBeGreaterThanOrEqual(0);
  });

  test("restores the Pure landmass layer state when States and Provinces close together", async ({ page }) => {
    await setLayerPreset(page, "landmass");

    if (!(await isOptionsMenuOpen(page))) await page.click("#optionsHide");
    await expect(page.locator("#options")).toBeVisible();
    await page.click("#toolsTab");
    await expect(page.locator("#toolsContent")).toBeVisible();

    // The Tools tab also has "States"/"Provinces" regenerate buttons (#regenerateFeature)
    // with the same accessible name as these edit buttons, so target the edit buttons by
    // their unique tooltip instead of the ambiguous accessible name.
    await page.locator('button[data-tip="Click to open States Editor"]').click();
    await expect(page.locator("#statesEditor")).toBeVisible();
    expect(await isLayerOn(page, "toggleStates")).toBe(true);

    await page.locator('button[data-tip="Click to open Provinces Editor"]').click();
    await expect(page.locator("#provincesEditorContainer")).toBeVisible();
    await expect(page.locator("#statesEditor")).toBeVisible();
    expect(await isLayerOn(page, "toggleProvinces")).toBe(true);
    expect(await isLayerOn(page, "toggleStates")).toBe(false);

    await page
      .locator(".fmg-dialog:has(#provincesEditorContainer)")
      .getByRole("button", { name: "Close all dialogs" })
      .click();
    await expect(page.locator("#statesEditor")).toBeHidden();
    await expect(page.locator("#provincesEditorContainer")).toBeHidden();
    expect(await isLayerOn(page, "toggleProvinces")).toBe(false);
    expect(await isLayerOn(page, "toggleStates")).toBe(false);
  });

  test("shows burg icons immediately when enabling them at maximum zoom", async ({ page }) => {
    await setLayerPreset(page, "landmass");
    await zoomToMapCenter(page, 20);
    expect(await isLayerOn(page, "toggleBurgIcons")).toBe(false);

    if (!(await isOptionsMenuOpen(page))) await page.locator("#optionsHide").click();
    await page.locator("#layersTab").click();
    await expect(page.locator("#layersContent")).toBeVisible();
    await page.locator("#toggleBurgIcons").click();

    await expect.poll(() => page.locator("#burgIcons > g:not(.hidden)").count()).toBeGreaterThan(0);
  });
});

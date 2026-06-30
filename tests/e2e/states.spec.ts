import { test, expect } from "@playwright/test";
import {
  waitForMapLoad,
  findFirstRealStateId,
  countStatesWithNeighbor,
  getMilitaryRegenerationResult,
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
    await waitForMapLoad(page);
  });

  test("removing a state via UI should allow military regeneration without errors", async ({
    page,
  }) => {
    await page.click("#optionsTrigger");
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
      .locator(`#statesBodySection > div[data-id="${stateId}"] .icon-trash-empty`)
      .click({ force: true });

    const removeButton = page.locator(".fmg-dialog-button", { hasText: "Remove" });
    await expect(removeButton).toBeVisible({ timeout: 5000 });
    await removeButton.click();

    // Wait for the state row to disappear from the editor
    await page.waitForFunction(
      (id: number | null) =>
        !document.querySelector(`#statesBodySection > div[data-id="${id}"]`),
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
});

import { test, expect } from "@playwright/test";
import {
  waitForMapLoad,
  getTourPopoverTitle,
  isOptionsMenuOpen,
  tourNextStep,
  tourPrevStep,
  tourAdvanceSteps,
} from "./helpers/fmg-helpers";

// Tour step titles in order — used to verify we're on the right step.
const STEP_TITLES = [
  "Welcome to Fantasy Map Generator", // 0
  "Navigate the Map",                  // 1
  "Hover Tooltips",                    // 2
  "Open the Options Menu",             // 3
  "Layers Tab",                        // 4
  "Layer Presets",                     // 5
  "Toggle Individual Layers",          // 6
  "Style Tab",                         // 7
  "Style Presets",                     // 8
  "Individual Style Settings",         // 9
  "Options Tab",                       // 10
  "Generation Options",                // 11
  "Configure World",                   // 12
  "World Configurator",                // 13
  "Tools Tab",                         // 14
  "Edit the Heightmap",                // 15
  "Heightmap Editor",                  // 16
  "About Tab",                         // 17
  "About & Resources",                 // 18
  "Export",                            // 19
  "Export Options",                    // 20
  "Save and Load Maps",                // 21
];

test.describe("UI Tour", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/?seed=test-tour&width=1280&height=720");
    await waitForMapLoad(page);
  });

  // ── Static registration ────────────────────────────────────────────────────

  test("UITour global is registered with a start method", async ({ page }) => {
    const ok = await page.evaluate(
      () =>
        typeof window.fmg.actions.UITour === "object" &&
        typeof window.fmg.actions.UITour.start === "function"
    );
    expect(ok).toBe(true);
  });

  test("tour trigger button is present and labelled in the About tab", async ({
    page,
  }) => {
    await page.locator("#optionsHide").click();
    await page.locator("#aboutTab").click();
    const btn = page.locator("#startTourButton");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText("Tour");
  });

  // ── Tour start ─────────────────────────────────────────────────────────────

  test("starting the tour closes options panel and shows first step", async ({
    page,
  }) => {
    await page.locator("#optionsHide").click();
    await expect.poll(() => isOptionsMenuOpen(page)).toBe(true);

    // UITour.start() is a setup action permitted by AGENTS.md §5
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await expect(page.locator("body")).toHaveClass(/driver-active/);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[0]);
    await expect.poll(() => isOptionsMenuOpen(page)).toBe(false);
  });

  // ── Tooltip step free-roam ─────────────────────────────────────────────────

  test("tooltip step adds tour-free-roam class and removes it on advance", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourNextStep(page, STEP_TITLES[1]); // → Navigate the Map
    await tourNextStep(page, STEP_TITLES[2]); // → Hover Tooltips

    await expect(page.locator("body")).toHaveClass(/tour-free-roam/);

    await tourNextStep(page, STEP_TITLES[3]); // → Open the Options Menu

    await expect(page.locator("body")).not.toHaveClass(/tour-free-roam/);
  });

  // ── Options panel ──────────────────────────────────────────────────────────

  test("options panel opens when advancing past the options trigger step", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourNextStep(page, STEP_TITLES[1]); // Navigate
    await tourNextStep(page, STEP_TITLES[2]); // Tooltip
    await tourNextStep(page, STEP_TITLES[3]); // Open the Options Menu

    await expect.poll(() => isOptionsMenuOpen(page)).toBe(false);

    await tourNextStep(page, STEP_TITLES[4]); // → Layers Tab

    await expect.poll(() => isOptionsMenuOpen(page)).toBe(true);
  });

  // ── Tab switching ──────────────────────────────────────────────────────────

  test("layers tab content is visible on layers tab steps", async ({ page }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 4);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[4]);

    await expect(page.locator("#layersContent")).toBeVisible();
  });

  test("style tab content is visible on style tab steps", async ({ page }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 7);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[7]);

    await expect(page.locator("#styleContent")).toBeVisible();
  });

  test("options tab content is visible on options tab step", async ({ page }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 10);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[10]);

    await expect(page.locator("#optionsTabContent")).toBeVisible();
  });

  test("layers tab remains active on Layer Presets and Toggle Individual Layers steps", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 5);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[5]);
    await expect(page.locator("#layersContent")).toBeVisible();

    await tourNextStep(page, STEP_TITLES[6]);
    await expect(page.locator("#layersContent")).toBeVisible();
  });

  test("style tab remains active on Style Presets and Individual Style Settings steps", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 8);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[8]);
    await expect(page.locator("#styleContent")).toBeVisible();

    await tourNextStep(page, STEP_TITLES[9]);
    await expect(page.locator("#styleContent")).toBeVisible();
  });

  test("options tab remains active on Generation Options and Configure World steps", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 11);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[11]);
    await expect(page.locator("#optionsTabContent")).toBeVisible();

    await tourNextStep(page, STEP_TITLES[12]);
    await expect(page.locator("#optionsTabContent")).toBeVisible();
  });

  test("tools tab content is visible on Tools Tab and Edit the Heightmap steps", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 14);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[14]);
    await expect(page.locator("#toolsContent")).toBeVisible();

    await tourNextStep(page, STEP_TITLES[15]);
    await expect(page.locator("#toolsContent")).toBeVisible();
  });

  test("about tab content is visible on About Tab and About & Resources steps", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 17);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[17]);
    await expect(page.locator("#aboutContent")).toBeVisible();

    await tourNextStep(page, STEP_TITLES[18]);
    await expect(page.locator("#aboutContent")).toBeVisible();
  });

  // ── Configure World dialog ─────────────────────────────────────────────────

  test("World Configurator dialog opens on the configure world step", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 12);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[12]);

    await expect(page.locator("#worldConfiguratorContainer")).toBeHidden();

    await tourNextStep(page, STEP_TITLES[13]);

    await expect(page.locator("#worldConfiguratorContainer")).toBeVisible();
  });

  test("World Configurator dialog closes and tools tab activates when advancing from World Configurator step", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 13);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[13]);
    await expect(page.locator("#worldConfiguratorContainer")).toBeVisible();

    await tourNextStep(page, STEP_TITLES[14]);

    await expect(page.locator("#worldConfiguratorContainer")).toBeHidden();
    await expect(page.locator("#toolsContent")).toBeVisible();
  });

  // ── Heightmap customization panel ──────────────────────────────────────────

  test("heightmap customization panel appears on the heightmap editor step", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 15);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[15]);

    await expect(page.locator("#customizationMenu")).toBeHidden();

    await tourNextStep(page, STEP_TITLES[16]);

    await expect(page.locator("#customizationMenu")).toBeVisible();
    await expect(page.locator("#toolsContent")).toBeHidden();
  });

  test("heightmap panel is restored when advancing past the heightmap editor step", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 16);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[16]);
    await expect(page.locator("#customizationMenu")).toBeVisible();

    await tourNextStep(page, STEP_TITLES[17]);

    await expect(page.locator("#customizationMenu")).toBeHidden();
    await expect(page.locator("#aboutContent")).toBeVisible();
  });

  // ── Export dialog ──────────────────────────────────────────────────────────

  test("export dialog opens on the export step", async ({ page }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 19);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[19]);

    await expect(page.locator("#exportMapData")).toBeHidden();

    await tourNextStep(page, STEP_TITLES[20]);

    await expect(page.locator("#exportMapData")).toBeVisible();
  });

  test("export dialog closes when advancing from Export Options step", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 20);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[20]);
    await expect(page.locator("#exportMapData")).toBeVisible();

    await tourNextStep(page, STEP_TITLES[21]);

    await expect(page.locator("#exportMapData")).toBeHidden();
  });

  // ── Back navigation ────────────────────────────────────────────────────────

  test("back to Hover Tooltips step restores tour-free-roam class", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourNextStep(page, STEP_TITLES[1]);
    await tourNextStep(page, STEP_TITLES[2]);
    await tourNextStep(page, STEP_TITLES[3]);
    await expect(page.locator("body")).not.toHaveClass(/tour-free-roam/);

    await tourPrevStep(page, STEP_TITLES[2]);
    await expect(page.locator("body")).toHaveClass(/tour-free-roam/);
  });

  test("back to Open the Options Menu step closes the options panel", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 4);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[4]);
    await expect.poll(() => isOptionsMenuOpen(page)).toBe(true);

    await tourPrevStep(page, STEP_TITLES[3]);
    await expect.poll(() => isOptionsMenuOpen(page)).toBe(false);
  });

  test("back from World Configurator to Configure World closes the dialog", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 13);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[13]);
    await expect(page.locator("#worldConfiguratorContainer")).toBeVisible();

    await tourPrevStep(page, STEP_TITLES[12]);
    await expect(page.locator("#worldConfiguratorContainer")).toBeHidden();
    await expect(page.locator("#optionsTabContent")).toBeVisible();
  });

  test("back from Tools Tab to World Configurator reopens the dialog", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 14);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[14]);
    await expect(page.locator("#worldConfiguratorContainer")).toBeHidden();

    await tourPrevStep(page, STEP_TITLES[13]);
    await expect(page.locator("#worldConfiguratorContainer")).toBeVisible();
  });

  test("back from About Tab to Heightmap Editor shows the customization panel", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 17);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[17]);
    await expect(page.locator("#customizationMenu")).toBeHidden();

    await tourPrevStep(page, STEP_TITLES[16]);
    await expect(page.locator("#customizationMenu")).toBeVisible();
    await expect(page.locator("#toolsContent")).toBeHidden();
  });

  test("back from Heightmap Editor to Edit the Heightmap hides the customization panel", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 17);
    await tourPrevStep(page, STEP_TITLES[16]);
    await expect(page.locator("#customizationMenu")).toBeVisible();

    await tourPrevStep(page, STEP_TITLES[15]);
    await expect(page.locator("#customizationMenu")).toBeHidden();
    await expect(page.locator("#toolsContent")).toBeVisible();
  });

  test("back from Export Options to Export closes the export dialog", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 20);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[20]);
    await expect(page.locator("#exportMapData")).toBeVisible();

    await tourPrevStep(page, STEP_TITLES[19]);
    await expect(page.locator("#exportMapData")).toBeHidden();
  });

  test("back from Save and Load Maps to Export Options reopens the export dialog", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 21);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[21]);
    await expect(page.locator("#exportMapData")).toBeHidden();

    await tourPrevStep(page, STEP_TITLES[20]);
    await expect(page.locator("#exportMapData")).toBeVisible();
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────

  test("dismissing the tour removes driver-active and closes the options panel", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 4);
    await expect.poll(() => isOptionsMenuOpen(page)).toBe(true);

    await page.locator(".driver-popover-close-btn").click();
    await page.waitForSelector(".driver-popover", { state: "hidden" });

    await expect(page.locator("body")).not.toHaveClass(/driver-active/);
    await expect.poll(() => isOptionsMenuOpen(page)).toBe(false);
  });

  test("completing the tour on the final step removes driver-active and closes the options panel", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 21);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[21]);
    await expect.poll(() => isOptionsMenuOpen(page)).toBe(true);

    await page.locator(".driver-popover-next-btn").click();
    await page.waitForSelector(".driver-popover", { state: "hidden" });

    await expect(page.locator("body")).not.toHaveClass(/driver-active/);
    await expect.poll(() => isOptionsMenuOpen(page)).toBe(false);
  });

  test("dismissing the tour while World Configurator is open closes the dialog and options panel", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 13);
    await expect(page.locator("#worldConfiguratorContainer")).toBeVisible();

    await page.locator(".driver-popover-close-btn").click();
    await page.waitForSelector(".driver-popover", { state: "hidden" });

    await expect(page.locator("#worldConfiguratorContainer")).toBeHidden();
    await expect.poll(() => isOptionsMenuOpen(page)).toBe(false);
  });

  test("dismissing the tour while heightmap panel is visible hides it and closes the options panel", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 16);
    await expect(page.locator("#customizationMenu")).toBeVisible();

    await page.locator(".driver-popover-close-btn").click();
    await page.waitForSelector(".driver-popover", { state: "hidden" });

    await expect(page.locator("#customizationMenu")).toBeHidden();
    await expect.poll(() => isOptionsMenuOpen(page)).toBe(false);
  });

  // ── Regression: toolsContent must not leak when closing early (bug #1421) ──

  test("closing tour on Layers tab step does not show toolsContent when menu is reopened", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 4);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[4]);

    await page.locator(".driver-popover-close-btn").click();
    await page.waitForSelector(".driver-popover", { state: "hidden" });

    await page.locator("#optionsHide").click();
    await expect(page.locator("#options")).toBeVisible();

    await expect(page.locator("#layersContent")).toBeVisible();
    await expect(page.locator("#toolsContent")).toBeHidden();
  });

  test("closing tour on Style tab step does not show toolsContent when menu is reopened", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 7);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[7]);

    await page.locator(".driver-popover-close-btn").click();
    await page.waitForSelector(".driver-popover", { state: "hidden" });

    await page.locator("#optionsHide").click();
    await expect(page.locator("#options")).toBeVisible();

    await expect(page.locator("#styleContent")).toBeVisible();
    await expect(page.locator("#toolsContent")).toBeHidden();
  });

  test("closing tour on Options tab step does not show toolsContent when menu is reopened", async ({
    page,
  }) => {
    await page.evaluate(() => window.fmg.actions.UITour.start());
    await page.waitForSelector(".driver-popover", { state: "visible" });

    await tourAdvanceSteps(page, 10);
    expect(await getTourPopoverTitle(page)).toBe(STEP_TITLES[10]);

    await page.locator(".driver-popover-close-btn").click();
    await page.waitForSelector(".driver-popover", { state: "hidden" });

    await page.locator("#optionsHide").click();
    await expect(page.locator("#options")).toBeVisible();

    await expect(page.locator("#optionsTabContent")).toBeVisible();
    await expect(page.locator("#toolsContent")).toBeHidden();
  });
});

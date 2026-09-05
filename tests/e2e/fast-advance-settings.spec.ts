import { expect, test } from "@playwright/test";
import { waitForMapLoad } from "./helpers/fmg-helpers";

/**
 * Phase 2 UI wiring for the Advance-Time Fast-Forward feature
 * (docs/plan/advance-time-fast-forward.md §6): the ⚙ button on AdvanceTimeDialog
 * opens FastAdvanceSettingsDialog, whose sliders are editable only under the
 * "custom" preset and whose Reset button rewinds the custom vector.
 */
test("Fast-Forward settings dialog: preset radios, custom-only sliders, reset", async ({ page }) => {
  await page.goto("/?seed=fast-advance-settings&width=1280&height=720");
  await waitForMapLoad(page, "svg");

  await page.locator("#stickedAdvanceTimeButton").click();

  const advanceDialog = page.locator(".fmg-dialog", {
    has: page.locator(".fmg-dialog-title", { hasText: "Advance Time" })
  });
  await expect(advanceDialog).toBeVisible();

  // The ⚙ button and preset <select> are disabled until Fast-Forward is enabled.
  const gear = advanceDialog.getByRole("button", { name: "Fast-Forward Settings" });
  await expect(gear).toBeDisabled();
  await advanceDialog.getByRole("checkbox").first().check();
  await expect(gear).toBeEnabled();

  await gear.click();

  const settings = page.locator(".fmg-dialog", {
    has: page.locator(".fmg-dialog-title", { hasText: "Fast-Forward Settings" })
  });
  await expect(settings).toBeVisible();

  // Every preset (incl. Custom) is offered as a radio.
  for (const name of ["Collapse", "Decline", "Stagnant", "Steady", "Growth", "Boom", "Custom"]) {
    await expect(settings.getByRole("radio", { name })).toBeVisible();
  }

  // Named preset → sliders read-only and showing that preset's vector.
  await settings.getByRole("radio", { name: "Boom" }).check();
  const rangeInputs = settings.locator('input[type="range"]');
  await expect(rangeInputs.first()).toBeDisabled();
  // Boom population growth = +3.0 %/yr.
  await expect(settings.locator('input[type="number"]').first()).toHaveValue("3");

  // Custom → sliders editable.
  await settings.getByRole("radio", { name: "Custom" }).check();
  await expect(rangeInputs.first()).toBeEnabled();

  const popNumber = settings.locator('input[type="number"]').first();
  await popNumber.fill("2.5");
  await popNumber.blur();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("fmg-fast-advance") ?? "{}")?.state?.customRates?.populationGrowthPctPerYear))
    .toBe(2.5);

  // Reset rewinds the custom vector to the steady default (+0.5), leaving preset === custom.
  await settings.getByRole("button", { name: "Reset" }).click();
  await expect(popNumber).toHaveValue("0.5");
  await expect(settings.getByRole("radio", { name: "Custom" })).toBeChecked();
});

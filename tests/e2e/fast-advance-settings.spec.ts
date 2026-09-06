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

  // Scoped by radio group: the history-mode section below offers its own "Custom" option
  // (docs/plan/advance-time-history-mode.md §8), so a bare name lookup would be ambiguous.
  const presetRadio = (name: string) =>
    settings.locator('input[name="fastAdvancePreset"]').and(settings.getByRole("radio", { name }));

  // Every preset (incl. Custom) is offered as a radio.
  for (const name of ["Collapse", "Decline", "Stagnant", "Steady", "Growth", "Boom", "Custom"]) {
    await expect(presetRadio(name)).toBeVisible();
  }

  // Named preset → sliders read-only and showing that preset's vector.
  await presetRadio("Boom").check();
  const rangeInputs = settings.locator('input[type="range"]');
  await expect(rangeInputs.first()).toBeDisabled();
  // Boom population growth = +3.0 %/yr.
  await expect(settings.locator('input[type="number"]').first()).toHaveValue("3");

  // Custom → sliders editable.
  await presetRadio("Custom").check();
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
  await expect(presetRadio("Custom")).toBeChecked();
});

/**
 * Phase H5 UI wiring for history mode (docs/plan/advance-time-history-mode.md §8): the profile
 * radios live in the same ⚙ dialog, and everything they control stays hidden until a profile
 * other than "Off" is picked — the guarantee that selecting nothing changes nothing.
 */
test("History mode section: profiles, stride, stub funding, switched-off systems", async ({ page }) => {
  await page.goto("/?seed=history-mode-settings&width=1280&height=720");
  await waitForMapLoad(page, "svg");

  await page.locator("#stickedAdvanceTimeButton").click();
  const advanceDialog = page.locator(".fmg-dialog", {
    has: page.locator(".fmg-dialog-title", { hasText: "Advance Time" })
  });
  await advanceDialog.getByRole("checkbox").first().check();
  await advanceDialog.getByRole("button", { name: "Fast-Forward Settings" }).click();

  const settings = page.locator(".fmg-dialog", {
    has: page.locator(".fmg-dialog-title", { hasText: "Fast-Forward Settings" })
  });
  const profileRadio = (name: string) =>
    settings.locator('input[name="historyModeProfile"]').and(settings.getByRole("radio", { name }));

  for (const name of ["Off", "Chronicle", "Dynasties only", "Custom"]) {
    await expect(profileRadio(name)).toBeVisible();
  }
  await expect(profileRadio("Off")).toBeChecked();

  // Off: nothing the profile controls is even rendered, and no generation buttons are offered.
  await expect(settings.locator('input[name="historyStride"]')).toHaveCount(0);
  await expect(advanceDialog.getByRole("button", { name: /generation/i })).toHaveCount(0);

  await profileRadio("Chronicle").check();

  // Chronicle: month stride, shown but locked because this is a named profile, not Custom.
  const monthStride = settings.locator('input[name="historyStride"][value="month"]');
  await expect(monthStride).toBeChecked();
  await expect(monthStride).toBeDisabled();
  await expect(settings.getByText(/declare war on their own/)).toBeVisible();

  // The switched-off list is read from the live registry, so it must be non-empty on a real map.
  await settings.getByText(/Switched-off systems \(\d+\)/).click();
  const systemBoxes = settings.locator('input[type="checkbox"]');
  await expect(systemBoxes.first()).toBeDisabled();

  // Custom unlocks stride and the stub-funding knobs.
  await profileRadio("Custom").check();
  await expect(settings.locator('input[name="historyStride"][value="day"]')).toBeEnabled();
  await settings.locator('input[name="historyStride"][value="day"]').check();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("fmg-fast-advance") ?? "{}")?.state?.customHistoryProfile?.stride
      )
    )
    .toBe("day");

  // Generation buttons appear on the Advance dialog once a history profile is active.
  // Scoped to the footer button: the titlebar also carries ✕ "Close" / "Close all dialogs".
  await settings.locator("button.fmg-dialog-button", { hasText: "Close" }).click();
  await expect(advanceDialog.getByRole("button", { name: /1 generation \(\d+ yr\)/ })).toBeVisible();
});

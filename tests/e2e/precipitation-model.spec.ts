import { expect, test } from "@playwright/test";
import { getLandPrecipitation, waitForLandPrecipitationChange, waitForMapLoad } from "./helpers/fmg-helpers";

test("World Configurator moisture increase never makes the same land cell drier", async ({ context, page }) => {
  await context.clearCookies();
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/?seed=precipitation-monotonicity&width=1280&height=720");
  await waitForMapLoad(page, "svg");

  await page.locator("#optionsHide").click();
  await page.locator("#toolsTab").click();
  await page.locator('button[data-tip="Click to open World Configurator (temperature, precipitation, etc.)"]').click();
  const configurator = page.locator("#worldConfiguratorContainer");
  await expect(configurator).toBeVisible();

  const precipitationInput = configurator.locator("#precInput");
  const initialPrecipitation = await getLandPrecipitation(page);
  await precipitationInput.fill("80");
  await expect(precipitationInput).toHaveValue("80");
  await waitForLandPrecipitationChange(page, initialPrecipitation);
  const dryPrecipitation = await getLandPrecipitation(page);

  await precipitationInput.fill("450");
  await expect(precipitationInput).toHaveValue("450");
  await waitForLandPrecipitationChange(page, dryPrecipitation);
  const wetPrecipitation = await getLandPrecipitation(page);

  expect(wetPrecipitation).toHaveLength(dryPrecipitation.length);
  for (let index = 0; index < dryPrecipitation.length; index++) {
    expect(wetPrecipitation[index]).toBeGreaterThanOrEqual(dryPrecipitation[index]);
  }
  expect(wetPrecipitation.some((value, index) => value > dryPrecipitation[index])).toBe(true);
});

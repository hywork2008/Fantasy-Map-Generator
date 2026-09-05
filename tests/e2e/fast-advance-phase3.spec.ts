import { expect, test } from "@playwright/test";
import { waitForMapLoad } from "./helpers/fmg-helpers";

/**
 * Phase 3 of the Advance-Time Fast-Forward feature (docs/plan/advance-time-fast-forward.md §9.4):
 * the systematic annual treasury drains that keep running during a Fast-Forward batch
 * (chemMedCommon.debitTreasury() family, StateSecretKnowledge, GreatLibrary) must no longer
 * compound *on top of* the preset treasury rate. Before Phase 3, FF "steady" (preset -13%/yr) was
 * observed declining roughly twice as fast as the real sim because those drains ran in parallel.
 *
 * This drives the real UI (no window.fmg.* shortcuts for the toggle) and compares one real
 * Advance Year against one Fast-Forward "steady" Advance Year from the same warmed seed.
 */
const SEED = "fast-advance-phase3";
const WARMUP_YEARS = 5;

async function enableCharactersAndEconomy(page: import("@playwright/test").Page): Promise<void> {
  for (const id of ["characters", "economy"]) {
    await page.evaluate(extId => {
      const api = window.fmg.extensionAPI;
      if (!api.isExtensionEnabled(extId)) api.toggleExtension(extId, true);
    }, id);
  }
  await page.waitForFunction(() => (window.fmg.world.pack.burgs ?? []).some(b => b && (b.market ?? 0) > 0), {
    timeout: 180_000
  });
}

function totalTreasury(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const pack = window.fmg.world.pack;
    const states = (pack.states ?? []).reduce(
      (s, x) => s + (!x || !x.i || x.removed ? 0 : ((x as unknown as { treasury?: number }).treasury ?? 0)),
      0
    );
    const burgs = (pack.burgs ?? []).reduce(
      (s, b) => s + (!b || !b.i || b.removed ? 0 : ((b as unknown as { treasury?: number }).treasury ?? 0)),
      0
    );
    return states + burgs;
  });
}

test("Fast-Forward no longer double-drains the treasury on top of the preset rate", async ({ page }) => {
  test.setTimeout(240_000);
  const consoleErrors: string[] = [];
  page.on("console", msg => {
    // "Failed to acquire N units of X from market …" is ordinary economy-scarcity noise the
    // production generator logs at error level every settlement — unrelated to Fast-Forward.
    if (msg.type() === "error" && !/Failed to acquire .* from market for production of/.test(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });

  // ── Baseline: one real Advance Year from a warmed seed ──────────────────────
  await page.goto(`/?seed=${SEED}&width=1280&height=720`);
  await waitForMapLoad(page, "svg");
  await enableCharactersAndEconomy(page);
  await page.evaluate(y => window.fmg.actions.advanceTime(y), WARMUP_YEARS);

  const realBefore = await totalTreasury(page);
  await page.evaluate(() => window.fmg.actions.advanceTime(1));
  const realAfter = await totalTreasury(page);
  const realRatio = realAfter / realBefore;

  // ── Same seed, same warmup, then one Fast-Forward "steady" Advance Year ─────
  await page.goto(`/?seed=${SEED}&width=1280&height=720`);
  await waitForMapLoad(page, "svg");
  await enableCharactersAndEconomy(page);
  await page.evaluate(y => window.fmg.actions.advanceTime(y), WARMUP_YEARS);

  await page.locator("#stickedAdvanceTimeButton").click();
  const dialog = page.locator(".fmg-dialog", {
    has: page.locator(".fmg-dialog-title", { hasText: "Advance Time" })
  });
  await dialog.getByRole("checkbox").first().check();
  await dialog.getByRole("combobox").selectOption("steady");

  const ffBefore = await totalTreasury(page);
  await page.evaluate(() => window.fmg.actions.advanceTime(1));
  const ffAfter = await totalTreasury(page);
  const ffRatio = ffAfter / ffBefore;

  // eslint-disable-next-line no-console
  console.log(`realRatio=${realRatio.toFixed(4)} ffRatio=${ffRatio.toFixed(4)}`);

  // Core Phase 3 claim: FF "steady" no longer declines *faster* than the real sim (before Phase 3
  // it declined ~realRatio² because the drains compounded on the preset). Small negative margin
  // for per-seed jitter in applyFastForwardEconomySettlement().
  expect(ffRatio).toBeGreaterThan(realRatio - 0.05);
  // And it lands in a sane single-year "steady" band rather than collapsing or exploding.
  expect(ffRatio).toBeGreaterThan(0.55);
  expect(ffRatio).toBeLessThan(1.25);

  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

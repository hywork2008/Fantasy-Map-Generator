import type { Page } from "@playwright/test";

/**
 * Wait until window.fmg is populated and map generation is complete.
 * Uses window.fmg.world.mapId (the canonical post-generation signal).
 */
export async function waitForMapGeneration(page: Page, timeout = 60000): Promise<void> {
  await page.waitForFunction(
    () => typeof window.fmg !== "undefined" && window.fmg.world.mapId !== undefined,
    { timeout }
  );
}

/** Read the current pack from the world context. */
export async function getPack(page: Page) {
  return page.evaluate(() => window.fmg.world.pack);
}

/** Read the current mapId from the world context. */
export async function getMapId(page: Page): Promise<number> {
  return page.evaluate(() => window.fmg.world.mapId);
}

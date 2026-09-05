/**
 * Shared Playwright harness for Advance Year benchmarking/calibration scripts
 * (scripts/benchmarkAdvanceYear.ts, scripts/calibrateFastAdvance.ts).
 *
 * Factored out so the two scripts drive an identical map-generation / extension-enable /
 * advance-time path — docs/plan/advance-time-fast-forward.md Phase 0 needs the calibration
 * numbers to be comparable against the existing perf:advance-year baseline, which only holds if
 * both scripts boot the world the same way.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface TickProfileEntry {
  label: string;
  calls: number;
  totalMs: number;
  lastMs: number;
  maxMs: number;
}

/**
 * Aggregate population/economy figures captured via `window.fmg.world`/`window.fmg.simulation`
 * — the same headline fields Balance History snapshots
 * (src/extensions/economy/generators/balanceSnapshot.ts), read directly from the page instead of
 * through an economy-internal function (none of this is exposed on window.fmg, and it shouldn't
 * need to be just for a measurement script).
 */
export interface EconomySnapshot {
  population: { rural: number; urban: number; total: number };
  totalStateTreasury: number;
  totalBurgTreasury: number;
  marketCount: number;
  goodsTotalStock: number;
  /** Stock-weighted average price across all Goods/Markets — a single "price index" proxy. */
  stockWeightedAvgPrice: number;
  stockByGoodName: Record<string, number>;
  avgPriceByGoodName: Record<string, number>;
}

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export async function newInstrumentedContext(
  browser: Browser,
  width: number,
  height: number
): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width, height } });
  // tickProfiler only records when DEBUG.tickProfiler is set (TIME defaults to false in the app
  // build to avoid console.time overhead) — set it before any page script runs so the
  // module-load-time DEBUG snapshot in src/utils/debug.ts picks it up.
  await context.addInitScript(() => {
    localStorage.setItem("debug", JSON.stringify({ tickProfiler: true }));
  });
  return context;
}

export async function openMap(
  context: BrowserContext,
  seed: string,
  width: number,
  height: number
): Promise<Page> {
  const page = await context.newPage();
  page.on("console", msg => {
    if (msg.type() === "error") console.error("[browser]", msg.text());
  });
  page.on("pageerror", err => console.error("[pageerror]", err.message));

  const url = `${BASE_URL}/?seed=${encodeURIComponent(seed)}&width=${width}&height=${height}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForMap(page);
  return page;
}

export async function waitForMap(page: Page, timeout = 120_000): Promise<void> {
  await page.waitForFunction(
    () =>
      (typeof window.fmg !== "undefined" && window.fmg.world.mapId !== undefined) ||
      Array.from(document.querySelectorAll("button")).some(button => button.textContent === "Generate entire map"),
    { timeout }
  );
  if (await page.getByRole("button", { name: "Generate entire map", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Generate entire map", exact: true }).click();
  }
  await page.waitForFunction(() => typeof window.fmg !== "undefined" && window.fmg.world.mapId !== undefined, {
    timeout
  });
}

export async function enableExtensions(page: Page, ids: string[]): Promise<void> {
  // Characters must precede Economy / Nobility when present.
  const order = [...ids].sort((a, b) => {
    const rank = (id: string) => (id === "characters" ? 0 : id === "economy" ? 1 : 2);
    return rank(a) - rank(b);
  });

  for (const id of order) {
    await page.evaluate(extId => {
      const api = window.fmg.extensionAPI;
      if (!api.isExtensionEnabled(extId)) api.toggleExtension(extId, true);
    }, id);
  }

  // Economy enable path generates data synchronously when goods are empty; give it a moment and
  // wait until markets exist when economy is in the set.
  if (order.includes("economy")) {
    await page.waitForFunction(
      () => {
        const burgs = window.fmg.world.pack.burgs ?? [];
        return burgs.some(b => b && typeof b.market === "number" && b.market > 0);
      },
      { timeout: 180_000 }
    );
  }
}

/**
 * Flip the Fast-Forward opt-in toggle + preset the way a user would (Tools → Advance Time dialog →
 * "⚡ Fast-Forward" checkbox → preset <select>), so the persisted zustand store
 * (src/store/fastAdvanceState.ts) really changes. Called AFTER warmup so the real economy has mass
 * before the measured Fast-Forward year — enabling it earlier would let the warmup itself run on
 * preset rates. docs/plan/advance-time-fast-forward.md §9.6 item 1.
 */
export async function enableFastForwardViaUI(page: Page, preset: string): Promise<void> {
  await page.locator("#stickedAdvanceTimeButton").click();
  const dialog = page.locator(".fmg-dialog", {
    has: page.locator(".fmg-dialog-title", { hasText: "Advance Time" })
  });
  await dialog.waitFor({ state: "visible", timeout: 15_000 });
  await dialog.getByRole("checkbox").first().check();
  await dialog.getByRole("combobox").selectOption(preset);
  // Close the dialog again so it can't intercept anything during the measured run.
  await page.locator("#stickedAdvanceTimeButton").click();
}

/**
 * Reads population + economy aggregates straight out of `window.fmg.world`/`window.fmg.simulation`.
 * Markets/Goods live on the economy extension's namespaced simulation slice
 * (`simulation.extensions.economy`, see src/extensions/economy/context/economyApi.ts
 * `getEconomySlice()`) rather than on `pack` directly, so this reaches into that slice instead of
 * calling an economy-internal function (none of which are exposed on `window.fmg`).
 */
export async function captureEconomySnapshot(page: Page): Promise<EconomySnapshot> {
  return page.evaluate(() => {
    const pack = window.fmg.world.pack;
    const populationRate = window.fmg.world.populationRate || 1;
    const urbanization = window.fmg.world.urbanization || 1;

    let ruralPoints = 0;
    for (const i of pack.cells?.i ?? []) ruralPoints += pack.cells.pop[i] ?? 0;
    const rural = ruralPoints * populationRate;
    const burgs = (pack.burgs ?? []).filter(b => b && b.i && !b.removed);
    const urban = burgs.reduce((sum, b) => sum + (b.population ?? 0), 0) * populationRate * urbanization;

    const states = pack.states ?? [];
    const totalStateTreasury = states.reduce(
      (sum, s) => sum + (!s || !s.i || s.removed ? 0 : ((s as unknown as { treasury?: number }).treasury ?? 0)),
      0
    );
    const totalBurgTreasury = burgs.reduce(
      (sum, b) => sum + ((b as unknown as { treasury?: number }).treasury ?? 0),
      0
    );

    type EconomySlice = {
      markets?: Array<{ goods?: Record<number, { stock?: number; price?: number }> }>;
      goods?: Array<{ i: number; name: string }>;
    };
    const eco = (window.fmg.simulation as unknown as { extensions?: { economy?: EconomySlice } }).extensions
      ?.economy;
    const markets = eco?.markets ?? [];
    const goodsCatalog = eco?.goods ?? [];
    const goodNameById = new Map(goodsCatalog.map(g => [g.i, g.name]));

    let goodsTotalStock = 0;
    let stockPriceSum = 0;
    const stockByGoodId = new Map<number, number>();
    const priceSumByGoodId = new Map<number, { sum: number; count: number }>();
    for (const market of markets) {
      for (const [goodIdStr, entry] of Object.entries(market.goods ?? {})) {
        const goodId = Number(goodIdStr);
        const stock = entry?.stock ?? 0;
        const price = entry?.price ?? 0;
        goodsTotalStock += stock;
        stockPriceSum += stock * price;
        stockByGoodId.set(goodId, (stockByGoodId.get(goodId) ?? 0) + stock);
        const priceAgg = priceSumByGoodId.get(goodId) ?? { sum: 0, count: 0 };
        priceAgg.sum += price;
        priceAgg.count += 1;
        priceSumByGoodId.set(goodId, priceAgg);
      }
    }

    const stockByGoodName: Record<string, number> = {};
    for (const [goodId, stock] of stockByGoodId) {
      stockByGoodName[goodNameById.get(goodId) ?? String(goodId)] = stock;
    }
    const avgPriceByGoodName: Record<string, number> = {};
    for (const [goodId, agg] of priceSumByGoodId) {
      avgPriceByGoodName[goodNameById.get(goodId) ?? String(goodId)] = agg.count > 0 ? agg.sum / agg.count : 0;
    }

    return {
      population: { rural, urban, total: rural + urban },
      totalStateTreasury,
      totalBurgTreasury,
      marketCount: markets.length,
      goodsTotalStock,
      stockWeightedAvgPrice: goodsTotalStock > 0 ? stockPriceSum / goodsTotalStock : 0,
      stockByGoodName,
      avgPriceByGoodName
    };
  });
}

/** `(after/before)^(1/years) - 1` as a percentage, guarding the zero/negative-base case. */
export function annualizedGrowthPct(before: number, after: number, years: number): number {
  if (!(years > 0) || !(before > 0)) return 0;
  const ratio = after / before;
  if (!(ratio > 0)) return -100;
  return (Math.pow(ratio, 1 / years) - 1) * 100;
}

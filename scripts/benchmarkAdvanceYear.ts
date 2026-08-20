#!/usr/bin/env tsx
/**
 * Advance Year wall-clock benchmark for simulation optimization.
 *
 * Boots Chromium against the Vite dev server (or PLAYWRIGHT_BASE_URL), enables
 * Characters + Economy (optionally Shipbuilding / Nobility), advances one year
 * via the same day-step path as Tools → Advance Year, and writes a tick-profiler
 * report under docs/analytics/.
 *
 * Usage:
 *   npm run perf:advance-year
 *   npm run perf:advance-year -- --extensions=economy,shipbuilding,nobility
 *   npm run perf:advance-year -- --seed=perf-year-1 --width=1280 --height=720
 *
 * Requires a running dev server unless webServer is started externally:
 *   npm run dev   # separate terminal, default http://localhost:5173
 */

import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

interface TickProfileEntry {
  label: string;
  calls: number;
  totalMs: number;
  lastMs: number;
  maxMs: number;
}

interface ScenarioResult {
  name: string;
  extensions: string[];
  seed: string;
  wallClockMs: number;
  daysAdvanced: number;
  startYear: number;
  endYear: number;
  endMonth: number;
  endDay: number;
  tickCountDelta: number;
  cellCount: number;
  burgCount: number;
  marketCount: number;
  caravanCount: number;
  profile: TickProfileEntry[];
  topTotalShare: Array<{ label: string; totalMs: number; sharePct: number; calls: number; avgMs: number }>;
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const OUT_PATH = path.resolve("docs/analytics/advance-year-benchmark-latest.json");

function parseArgs(argv: string[]) {
  const get = (key: string, fallback: string) => {
    const hit = argv.find(a => a.startsWith(`--${key}=`));
    return hit ? hit.slice(key.length + 3) : fallback;
  };
  return {
    seed: get("seed", "advance-year-perf"),
    width: Number(get("width", "1280")),
    height: Number(get("height", "720")),
    extensions: get("extensions", "characters,economy")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean),
    /** UI day-loop (rAF) vs public advanceTime bulk day expansion. */
    path: get("path", "bulk") as "bulk" | "ui"
  };
}

async function waitForMap(page: Page, timeout = 120_000): Promise<void> {
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

async function enableExtensions(page: Page, ids: string[]): Promise<void> {
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

  // Economy enable path generates data synchronously when goods are empty; give
  // it a moment and wait until markets exist when economy is in the set.
  if (order.includes("economy")) {
    await page.waitForFunction(
      () => {
        const pack = window.fmg.world.pack as { markets?: unknown[] } | undefined;
        // markets live on extension slice; fall back to goods length via evaluate packing
        const markets = (window.fmg.world as unknown as { pack: { markets?: unknown[] } }).pack.markets;
        // Economy stores markets in extension state, not pack.markets — probe via goods on pack burgs with market ids.
        const burgs = window.fmg.world.pack.burgs ?? [];
        return burgs.some(b => b && typeof b.market === "number" && b.market > 0);
      },
      { timeout: 180_000 }
    );
  }
}

async function runBulkYear(page: Page): Promise<{ wallClockMs: number; profile: TickProfileEntry[] } & Record<string, number>> {
  return page.evaluate(() => {
    const actions = window.fmg.actions;
    actions.resetTickProfile();
    const startYear = window.fmg.simulation.currentYear;
    const startTick = window.fmg.simulation.tickCount;
    const t0 = performance.now();
    actions.advanceTime(1);
    // Flush production.settle microtasks queued by economy.tick before sampling.
    // (A single await Promise.resolve is enough for one microtask generation.)
    // Synchronous path: microtasks already ran when advanceTime returned... actually
    // they run after the current task. evaluate's body is one task, so flush via nested promise.
    return Promise.resolve().then(() => {
      const wallClockMs = performance.now() - t0;
      const pack = window.fmg.world.pack;
      const burgs = pack.burgs?.filter(b => b?.i && !b.removed) ?? [];
      return {
        wallClockMs,
        daysAdvanced: window.fmg.simulation.tickCount - startTick,
        startYear,
        endYear: window.fmg.simulation.currentYear,
        endMonth: window.fmg.simulation.currentMonth,
        endDay: window.fmg.simulation.currentDay,
        tickCountDelta: window.fmg.simulation.tickCount - startTick,
        cellCount: pack.cells?.i?.length ?? 0,
        burgCount: burgs.length,
        marketCount: burgs.filter(b => b.market).length,
        caravanCount: 0,
        profile: actions.getTickProfile()
      };
    });
  });
}

async function runUiYear(page: Page): Promise<{ wallClockMs: number; profile: TickProfileEntry[] } & Record<string, number>> {
  const startMeta = await page.evaluate(() => ({
    year: window.fmg.simulation.currentYear,
    tick: window.fmg.simulation.tickCount,
    cells: window.fmg.world.pack.cells?.i?.length ?? 0,
    burgs: window.fmg.world.pack.burgs?.filter(b => b?.i && !b.removed).length ?? 0,
    markets: window.fmg.world.pack.burgs?.filter(b => b?.i && !b.removed && b.market).length ?? 0
  }));

  await page.evaluate(() => window.fmg.actions.resetTickProfile());

  const t0 = Date.now();
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent("react-tool-action", {
        detail: { action: "advanceTimeButton", years: 1, months: 0, days: 0 }
      })
    );
  });

  await page.waitForFunction(
    startYear => window.fmg.simulation.currentYear >= startYear + 1,
    startMeta.year,
    { timeout: 600_000 }
  );
  // Let the final microtasks / rAF completion land.
  await page.waitForTimeout(200);
  const wallClockMs = Date.now() - t0;

  const rest = await page.evaluate(() => {
    const pack = window.fmg.world.pack;
    const burgs = pack.burgs?.filter(b => b?.i && !b.removed) ?? [];
    return {
      endYear: window.fmg.simulation.currentYear,
      endMonth: window.fmg.simulation.currentMonth,
      endDay: window.fmg.simulation.currentDay,
      tickCountDelta: window.fmg.simulation.tickCount,
      profile: window.fmg.actions.getTickProfile()
    };
  });

  return {
    wallClockMs,
    daysAdvanced: rest.tickCountDelta - startMeta.tick,
    startYear: startMeta.year,
    endYear: rest.endYear,
    endMonth: rest.endMonth,
    endDay: rest.endDay,
    tickCountDelta: rest.tickCountDelta - startMeta.tick,
    cellCount: startMeta.cells,
    burgCount: startMeta.burgs,
    marketCount: startMeta.markets,
    caravanCount: 0,
    profile: rest.profile
  };
}

function withShares(profile: TickProfileEntry[]) {
  // Parent labels like "economy" include nested sub-steps; report share of each label's total
  // against the sum of top-level-ish labels only is misleading. Report share of each vs
  // max(sum of all totals, wall) separately. Here: share of each vs sum of all measured totals
  // (can exceed 100% for nested labels — called out in the report).
  const sum = profile.reduce((s, e) => s + e.totalMs, 0) || 1;
  return profile.slice(0, 40).map(e => ({
    label: e.label,
    totalMs: Math.round(e.totalMs * 100) / 100,
    sharePct: Math.round((e.totalMs / sum) * 10000) / 100,
    calls: e.calls,
    avgMs: Math.round((e.totalMs / Math.max(1, e.calls)) * 1000) / 1000
  }));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[perf:advance-year] baseURL=${BASE_URL} seed=${args.seed} extensions=${args.extensions.join(",")} path=${args.path}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: args.width, height: args.height } });
  // tickProfiler only records when DEBUG.tickProfiler is set (TIME defaults to false in the
  // app build to avoid console.time overhead) — set it before any page script runs so the
  // module-load-time DEBUG snapshot in src/utils/debug.ts picks it up.
  await context.addInitScript(() => {
    localStorage.setItem("debug", JSON.stringify({ tickProfiler: true }));
  });
  const page = await context.newPage();
  page.on("console", msg => {
    if (msg.type() === "error") console.error("[browser]", msg.text());
  });
  page.on("pageerror", err => console.error("[pageerror]", err.message));

  const url = `${BASE_URL}/?seed=${encodeURIComponent(args.seed)}&width=${args.width}&height=${args.height}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForMap(page);
  await enableExtensions(page, args.extensions);

  const measured = args.path === "ui" ? await runUiYear(page) : await runBulkYear(page);

  const result: ScenarioResult = {
    name: `advance-year-${args.path}`,
    extensions: args.extensions,
    seed: args.seed,
    wallClockMs: measured.wallClockMs,
    daysAdvanced: measured.daysAdvanced,
    startYear: measured.startYear,
    endYear: measured.endYear,
    endMonth: measured.endMonth,
    endDay: measured.endDay,
    tickCountDelta: measured.tickCountDelta,
    cellCount: measured.cellCount,
    burgCount: measured.burgCount,
    marketCount: measured.marketCount,
    caravanCount: measured.caravanCount,
    profile: measured.profile,
    topTotalShare: withShares(measured.profile)
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseURL: BASE_URL,
        result
      },
      null,
      2
    )
  );

  console.log("\n=== Advance Year benchmark ===");
  console.log(
    `wall=${result.wallClockMs.toFixed(0)}ms days=${result.daysAdvanced} cells=${result.cellCount} burgs=${result.burgCount} markets=${result.marketCount}`
  );
  console.log(`calendar ${result.startYear} → ${result.endYear}-${result.endMonth}-${result.endDay}`);
  console.log("\nTop steps by totalMs:");
  console.table(result.topTotalShare.slice(0, 25));
  console.log(`\nWrote ${OUT_PATH}`);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

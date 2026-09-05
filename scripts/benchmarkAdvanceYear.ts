#!/usr/bin/env tsx
/**
 * Advance Year wall-clock benchmark for simulation optimization.
 *
 * Boots Chromium against the Vite dev server (or PLAYWRIGHT_BASE_URL), enables
 * Characters + Economy (optionally Shipbuilding / Nobility), advances one year
 * via the same day-step path as Tools → Advance Year, and writes a tick-profiler
 * report under docs/analytics/.
 *
 * Also captures a population/economy snapshot before and after the advance
 * (docs/plan/advance-time-fast-forward.md Phase 0) — the same headline figures used to
 * calibrate Fast-Forward preset growth rates. See scripts/calibrateFastAdvance.ts for the
 * multi-seed version of this measurement.
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
import type { Page } from "playwright";
import {
  BASE_URL,
  captureEconomySnapshot,
  enableExtensions,
  enableFastForwardViaUI,
  type EconomySnapshot,
  launchBrowser,
  newInstrumentedContext,
  openMap,
  type TickProfileEntry
} from "./lib/advanceYearHarness";

interface ScenarioResult {
  name: string;
  extensions: string[];
  seed: string;
  warmupYears: number;
  fastForward: string;
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
  economySnapshot: {
    before: EconomySnapshot;
    after: EconomySnapshot;
    elapsedYears: number;
    /** `(after/before)^(1/elapsedYears) - 1`, as a percentage — see annualizedGrowthPct(). */
    annualizedGrowthPct: {
      population: number;
      totalStateTreasury: number;
      goodsTotalStock: number;
      stockWeightedAvgPrice: number;
    };
  };
}

const OUT_DIR = path.resolve("docs/analytics");
function outPathFor(fastForward: string): string {
  return path.join(
    OUT_DIR,
    fastForward ? `advance-year-benchmark-ff-${fastForward}.json` : "advance-year-benchmark-latest.json"
  );
}

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
    path: get("path", "bulk") as "bulk" | "ui",
    /** Real Advance Year(s) to run (discarded) before the measured year, so the economy has mass. */
    warmupYears: Number(get("warmupYears", "0")),
    /**
     * Empty = measure the real simulation (default). A preset id ("steady", "boom", …) enables
     * Fast-Forward via the Advance Time dialog AFTER warmup, so the measured year runs the
     * approximate path (docs/plan/advance-time-fast-forward.md §9.6 item 1).
     */
    fastForward: get("fastForward", "")
  };
}

async function runBulkYear(
  page: Page
): Promise<{ wallClockMs: number; profile: TickProfileEntry[] } & Record<string, number>> {
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

async function runUiYear(
  page: Page
): Promise<{ wallClockMs: number; profile: TickProfileEntry[] } & Record<string, number>> {
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

function growthPct(before: number, after: number): number {
  if (!(before > 0)) return 0;
  return ((after - before) / before) * 100;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[perf:advance-year] baseURL=${BASE_URL} seed=${args.seed} extensions=${args.extensions.join(",")} ` +
      `path=${args.path} warmupYears=${args.warmupYears} fastForward=${args.fastForward || "(off)"}`
  );

  const browser = await launchBrowser();
  const context = await newInstrumentedContext(browser, args.width, args.height);
  const page = await openMap(context, args.seed, args.width, args.height);
  await enableExtensions(page, args.extensions);

  if (args.warmupYears > 0) {
    console.log(`[perf:advance-year] warming up ${args.warmupYears} real year(s)…`);
    await page.evaluate(years => window.fmg.actions.advanceTime(years), args.warmupYears);
    await page.evaluate(() => Promise.resolve());
  }
  if (args.fastForward) {
    console.log(`[perf:advance-year] enabling Fast-Forward preset "${args.fastForward}" via the Advance Time dialog`);
    await enableFastForwardViaUI(page, args.fastForward);
  }

  const before = await captureEconomySnapshot(page);
  const measured = args.path === "ui" ? await runUiYear(page) : await runBulkYear(page);
  const after = await captureEconomySnapshot(page);

  const elapsedYears = measured.daysAdvanced / 365.2425;
  const result: ScenarioResult = {
    name: `advance-year-${args.path}${args.fastForward ? `-ff-${args.fastForward}` : ""}`,
    extensions: args.extensions,
    seed: args.seed,
    warmupYears: args.warmupYears,
    fastForward: args.fastForward,
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
    topTotalShare: withShares(measured.profile),
    economySnapshot: {
      before,
      after,
      elapsedYears,
      annualizedGrowthPct: {
        population: growthPct(before.population.total, after.population.total) / Math.max(elapsedYears, 1e-6),
        totalStateTreasury:
          growthPct(before.totalStateTreasury, after.totalStateTreasury) / Math.max(elapsedYears, 1e-6),
        goodsTotalStock: growthPct(before.goodsTotalStock, after.goodsTotalStock) / Math.max(elapsedYears, 1e-6),
        stockWeightedAvgPrice:
          growthPct(before.stockWeightedAvgPrice, after.stockWeightedAvgPrice) / Math.max(elapsedYears, 1e-6)
      }
    }
  };

  const outPath = outPathFor(args.fastForward);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
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
  console.log("\nEconomy/population snapshot (annualized growth %, Phase 0 calibration input):");
  console.table(result.economySnapshot.annualizedGrowthPct);
  console.log(`\nWrote ${outPath}`);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

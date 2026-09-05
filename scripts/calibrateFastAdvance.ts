#!/usr/bin/env tsx
/**
 * Fast-Forward preset calibration (docs/plan/advance-time-fast-forward.md Phase 0).
 *
 * Runs a real (non-approximated) Advance Year across several seeds and records the actual
 * annualized growth rate of population, State treasury, total Goods stock, and a stock-weighted
 * average price — the same headline figures scripts/benchmarkAdvanceYear.ts now captures for a
 * single seed. This script exists to average that measurement across multiple seeds/map sizes so
 * the Fast-Forward "Steady" preset (docs/plan/advance-time-fast-forward.md §5.2) can be set to
 * whatever the current full simulation actually does on average, instead of a guessed number.
 *
 * Usage:
 *   npm run calibrate:fast-advance
 *   npm run calibrate:fast-advance -- --seeds=5 --years=1
 *   npm run calibrate:fast-advance -- --seeds=3 --extensions=characters,economy --width=1600 --height=900
 *
 * Requires a running dev server unless webServer is started externally:
 *   npm run dev   # separate terminal, default http://localhost:5173
 */

import fs from "node:fs";
import path from "node:path";
import {
  BASE_URL,
  captureEconomySnapshot,
  enableExtensions,
  type EconomySnapshot,
  launchBrowser,
  newInstrumentedContext,
  openMap,
  annualizedGrowthPct
} from "./lib/advanceYearHarness";

const OUT_PATH = path.resolve("docs/analytics/fast-advance-calibration.json");

interface SeedRun {
  seed: string;
  cellCount: number;
  burgCount: number;
  elapsedYears: number;
  before: EconomySnapshot;
  after: EconomySnapshot;
  annualizedGrowthPct: {
    population: number;
    totalStateTreasury: number;
    goodsTotalStock: number;
    stockWeightedAvgPrice: number;
  };
}

function parseArgs(argv: string[]) {
  const get = (key: string, fallback: string) => {
    const hit = argv.find(a => a.startsWith(`--${key}=`));
    return hit ? hit.slice(key.length + 3) : fallback;
  };
  const seedCount = Number(get("seeds", "5"));
  return {
    seeds: Array.from({ length: seedCount }, (_, i) => `fast-advance-calibration-${i + 1}`),
    /** Measurement window (annualized) — kept multi-year so one unlucky/lucky year doesn't dominate. */
    years: Number(get("years", "3")),
    /**
     * Advanced (and discarded) right after enabling Economy, before the measurement window starts.
     * Goods stock/state treasury start near their freshly-generated seed values, not a steady
     * state — measuring from tick 0 mixes that cold-start transient into the "annual growth rate"
     * and produces wildly inflated numbers (a first smoke test without warm-up saw +2465%/yr goods
     * stock growth). Warm-up runs the same real simulation first so the measurement window starts
     * from a settled economy.
     */
    warmupYears: Number(get("warmupYears", "3")),
    width: Number(get("width", "1280")),
    height: Number(get("height", "720")),
    extensions: get("extensions", "characters,economy")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  };
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

async function runOneSeed(
  seed: string,
  args: ReturnType<typeof parseArgs>,
  browser: import("playwright").Browser
): Promise<SeedRun> {
  const context = await newInstrumentedContext(browser, args.width, args.height);
  try {
    const page = await openMap(context, seed, args.width, args.height);
    await enableExtensions(page, args.extensions);

    if (args.warmupYears > 0) {
      await page.evaluate(years => window.fmg.actions.advanceTime(years), args.warmupYears);
      await page.evaluate(() => Promise.resolve());
    }

    const before = await captureEconomySnapshot(page);
    const startTick = await page.evaluate(() => window.fmg.simulation.tickCount);
    await page.evaluate(years => window.fmg.actions.advanceTime(years), args.years);
    // Flush the production.settle microtask(s) queued by the last simulated day, same as
    // benchmarkAdvanceYear.ts's runBulkYear().
    await page.evaluate(() => Promise.resolve());
    const endTick = await page.evaluate(() => window.fmg.simulation.tickCount);
    const after = await captureEconomySnapshot(page);
    const cellBurgCounts = await page.evaluate(() => ({
      cellCount: window.fmg.world.pack.cells?.i?.length ?? 0,
      burgCount: window.fmg.world.pack.burgs?.filter(b => b?.i && !b.removed).length ?? 0
    }));

    const elapsedYears = (endTick - startTick) / 365.2425;
    return {
      seed,
      cellCount: cellBurgCounts.cellCount,
      burgCount: cellBurgCounts.burgCount,
      elapsedYears,
      before,
      after,
      annualizedGrowthPct: {
        population: annualizedGrowthPct(before.population.total, after.population.total, elapsedYears),
        totalStateTreasury: annualizedGrowthPct(before.totalStateTreasury, after.totalStateTreasury, elapsedYears),
        goodsTotalStock: annualizedGrowthPct(before.goodsTotalStock, after.goodsTotalStock, elapsedYears),
        stockWeightedAvgPrice: annualizedGrowthPct(
          before.stockWeightedAvgPrice,
          after.stockWeightedAvgPrice,
          elapsedYears
        )
      }
    };
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[calibrate:fast-advance] baseURL=${BASE_URL} seeds=${args.seeds.length} years=${args.years} extensions=${args.extensions.join(",")}`
  );

  const browser = await launchBrowser();
  const runs: SeedRun[] = [];
  try {
    for (const seed of args.seeds) {
      console.log(`  running seed "${seed}"...`);
      const run = await runOneSeed(seed, args, browser);
      runs.push(run);
      console.log(
        `    population=${run.annualizedGrowthPct.population.toFixed(2)}%/yr` +
          ` treasury=${run.annualizedGrowthPct.totalStateTreasury.toFixed(2)}%/yr` +
          ` stock=${run.annualizedGrowthPct.goodsTotalStock.toFixed(2)}%/yr` +
          ` price=${run.annualizedGrowthPct.stockWeightedAvgPrice.toFixed(2)}%/yr`
      );
    }
  } finally {
    await browser.close();
  }

  const dimensions = ["population", "totalStateTreasury", "goodsTotalStock", "stockWeightedAvgPrice"] as const;
  const aggregate = Object.fromEntries(
    dimensions.map(dim => {
      const values = runs.map(r => r.annualizedGrowthPct[dim]);
      const avg = mean(values);
      return [dim, { mean: avg, median: median(values), stddev: stddev(values, avg), min: Math.min(...values), max: Math.max(...values) }];
    })
  ) as Record<(typeof dimensions)[number], { mean: number; median: number; stddev: number; min: number; max: number }>;

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseURL: BASE_URL,
        extensions: args.extensions,
        years: args.years,
        runs,
        aggregate
      },
      null,
      2
    )
  );

  console.log("\n=== Fast-Forward calibration (annualized growth %, real simulation) ===");
  console.table(
    Object.fromEntries(
      dimensions.map(dim => [
        dim,
        {
          mean: aggregate[dim].mean.toFixed(3),
          median: aggregate[dim].median.toFixed(3),
          stddev: aggregate[dim].stddev.toFixed(3),
          min: aggregate[dim].min.toFixed(3),
          max: aggregate[dim].max.toFixed(3)
        }
      ])
    )
  );
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

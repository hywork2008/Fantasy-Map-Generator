#!/usr/bin/env tsx
/**
 * Diagnoses the ~-42%/yr State treasury decline found by scripts/calibrateFastAdvance.ts
 * (docs/plan/advance-time-fast-forward.md §5.3.3) — a persistent structural deficit in the
 * current default Economy balance, confirmed non-transient at 3/10/15-year warm-up depths.
 *
 * Rather than trace every `settleAnnual()`/tax/upkeep call site in economy/index.tsx by hand
 * (dozens of candidates touch `state.treasury`), this instruments every State's `treasury`
 * field at runtime with a get/set trap that records every mutation's signed delta plus the
 * immediate call site (file:line from the stack, since many unrelated modules share generic
 * method names like `settleAnnual`, so grouping by function name alone would conflate them).
 * After N simulated years, deltas are aggregated by call site to rank income/expense sources.
 *
 * Usage:
 *   npm run diagnose:treasury
 *   npm run diagnose:treasury -- --warmupYears=10 --years=3 --seed=treasury-diagnosis-1
 *
 * Requires a running dev server unless webServer is started externally:
 *   npm run dev   # separate terminal, default http://localhost:5173
 */

import fs from "node:fs";
import path from "node:path";
import { BASE_URL, enableExtensions, launchBrowser, newInstrumentedContext, openMap } from "./lib/advanceYearHarness";

const OUT_PATH = path.resolve("docs/analytics/treasury-decline-diagnosis.json");

interface TreasuryLogEntry {
  stateId: number;
  delta: number;
  site: string;
}

interface SiteAggregate {
  site: string;
  income: number;
  expense: number;
  net: number;
  incomeEvents: number;
  expenseEvents: number;
}

function parseArgs(argv: string[]) {
  const get = (key: string, fallback: string) => {
    const hit = argv.find(a => a.startsWith(`--${key}=`));
    return hit ? hit.slice(key.length + 3) : fallback;
  };
  return {
    seed: get("seed", "treasury-diagnosis-1"),
    warmupYears: Number(get("warmupYears", "10")),
    years: Number(get("years", "3")),
    width: Number(get("width", "1280")),
    height: Number(get("height", "720")),
    extensions: get("extensions", "characters,economy")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[diagnose:treasury] baseURL=${BASE_URL} seed=${args.seed} warmupYears=${args.warmupYears} years=${args.years}`
  );

  const browser = await launchBrowser();
  const context = await newInstrumentedContext(browser, args.width, args.height);
  try {
    const page = await openMap(context, args.seed, args.width, args.height);
    await enableExtensions(page, args.extensions);

    if (args.warmupYears > 0) {
      await page.evaluate(years => window.fmg.actions.advanceTime(years), args.warmupYears);
      await page.evaluate(() => Promise.resolve());
    }

    const before = await page.evaluate(() => {
      const states = window.fmg.world.pack.states ?? [];
      return states.reduce(
        (sum, s) => sum + (!s || !s.i || s.removed ? 0 : ((s as unknown as { treasury?: number }).treasury ?? 0)),
        0
      );
    });

    // Install the instrumentation: replace each State's `treasury` data property with an
    // accessor pair that logs every write's signed delta and immediate call site.
    await page.evaluate(() => {
      type TreasuryLogEntryBrowser = { stateId: number; delta: number; site: string };
      const w = window as unknown as { __treasuryLog: TreasuryLogEntryBrowser[] };
      w.__treasuryLog = [];

      const states = window.fmg.world.pack.states ?? [];
      for (const state of states) {
        if (!state || !state.i) continue;
        const s = state as unknown as { treasury?: number };
        let value = s.treasury ?? 0;
        Object.defineProperty(s, "treasury", {
          configurable: true,
          enumerable: true,
          get() {
            return value;
          },
          set(next: number) {
            const delta = (next ?? 0) - value;
            if (Math.abs(delta) > 1e-9) {
              const stack = new Error().stack ?? "";
              const frames = stack.split("\n");
              // frames[0] = "Error"; frames[1] = this setter itself; frames[2] = immediate
              // caller. Many callers (all ~20 chemistry/medicine/industrial-plant modules) funnel
              // through the single shared chemMedCommon.ts#debitTreasury() helper, which would
              // otherwise collapse them into one indistinguishable bucket — when frames[2] is that
              // helper, walk one frame further to the module that actually invoked it.
              const immediateCaller = frames[2] ?? frames[1] ?? "(unknown)";
              const granularCaller = frames[3] ?? immediateCaller;
              const site = (
                immediateCaller.includes("debitTreasury") ? granularCaller : immediateCaller
              )
                .trim()
                .replace(/^at\s+/, "");
              w.__treasuryLog.push({ stateId: state.i, delta, site });
            }
            value = next;
          }
        });
      }
    });

    await page.evaluate(years => window.fmg.actions.advanceTime(years), args.years);
    await page.evaluate(() => Promise.resolve());

    const { log, after } = await page.evaluate(() => {
      const w = window as unknown as { __treasuryLog: Array<{ stateId: number; delta: number; site: string }> };
      const states = window.fmg.world.pack.states ?? [];
      const after = states.reduce(
        (sum, s) => sum + (!s || !s.i || s.removed ? 0 : ((s as unknown as { treasury?: number }).treasury ?? 0)),
        0
      );
      return { log: w.__treasuryLog ?? [], after };
    });

    const sumOfLoggedDeltas = log.reduce((sum, e) => sum + e.delta, 0);
    console.log(
      `\nBefore=${before.toFixed(2)} After=${after.toFixed(2)} ActualDelta=${(after - before).toFixed(2)}` +
        ` SumOfLoggedDeltas=${sumOfLoggedDeltas.toFixed(2)} (should match ActualDelta if instrumentation caught everything)`
    );

    const bySite = new Map<string, SiteAggregate>();
    for (const entry of log as TreasuryLogEntry[]) {
      const agg = bySite.get(entry.site) ?? {
        site: entry.site,
        income: 0,
        expense: 0,
        net: 0,
        incomeEvents: 0,
        expenseEvents: 0
      };
      if (entry.delta > 0) {
        agg.income += entry.delta;
        agg.incomeEvents++;
      } else {
        agg.expense += entry.delta;
        agg.expenseEvents++;
      }
      agg.net += entry.delta;
      bySite.set(entry.site, agg);
    }

    const ranked = [...bySite.values()].sort((a, b) => a.net - b.net);

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(
      OUT_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          baseURL: BASE_URL,
          seed: args.seed,
          warmupYears: args.warmupYears,
          measurementYears: args.years,
          before,
          after,
          actualDelta: after - before,
          sumOfLoggedDeltas,
          bySite: ranked
        },
        null,
        2
      )
    );

    console.log(`\n=== Treasury deltas by call site over ${args.years}yr (most negative first) ===`);
    console.table(
      ranked.slice(0, 30).map(r => ({
        site: r.site.length > 90 ? `…${r.site.slice(-90)}` : r.site,
        income: Math.round(r.income * 100) / 100,
        expense: Math.round(r.expense * 100) / 100,
        net: Math.round(r.net * 100) / 100,
        incomeEvents: r.incomeEvents,
        expenseEvents: r.expenseEvents
      }))
    );
    console.log(`\nWrote ${OUT_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

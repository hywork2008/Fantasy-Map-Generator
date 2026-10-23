/** Fixed Province policy contrasts; no cash or physical stock is injected. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";
import { simEvents } from "../src/simulation/events";
import { configureSaltPolicy } from "../src/extensions/economy/generators/saltPolicy";
import { setGoodFlowObserver } from "../src/extensions/economy/generators/goodsBalanceLedger";
import { setTickStepObserver } from "../src/generators/tickProfiler";
import { createMoneyFlowRecorder, createObserveViews } from "./lib/observeViews.mts";

const input = process.argv[2] ?? "docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg";
const output = process.argv[3] ?? "docs/analytics/salt-s5-policy-cases-20261023.json";
const bytes = readFileSync(input);
const runs = [];
for (const scenario of ["automatic", "monopoly50", "quotaStress"] as const) {
  const host = createNodeSimulationHost();
  const events: unknown[] = [];
  const onRevolt = (event: Event) => events.push(structuredClone((event as CustomEvent).detail));
  try {
    await host.loadArchive(new Uint8Array(bytes));
    await host.prepare();
    const clock = () => ({
      year: host.simulation.currentYear,
      month: host.simulation.currentMonth,
      day: host.simulation.currentDay
    });
    const initialProfile = {
      options: structuredClone(host.world.options),
      populationRate: host.world.populationRate,
      urbanization: host.world.urbanization
    };
    if (scenario !== "automatic")
      assert(
        configureSaltPolicy(1, "monopoly", scenario === "quotaStress" ? 2 : 0.5, scenario === "quotaStress"),
        "Assembly must approve, never bypass it"
      );
    // A separately labelled political stress case; no new money, people or Salt.
    if (scenario === "quotaStress") host.world.pack.states[1].saltPolicy!.unrest = 79;
    const views = createObserveViews(() => host.world, clock);
    const money = createMoneyFlowRecorder(() => host.world);
    const initial = structuredClone(views.salt());
    let settlements: { date: ReturnType<typeof clock>; salt: ReturnType<typeof views.salt> }[] = [];
    setTickStepObserver({
      enter(label) {
        money.observer.enter(label);
      },
      exit(label) {
        money.observer.exit(label);
        if (label === "production:saltLogistics") settlements.push({ date: clock(), salt: views.salt() });
      }
    });
    simEvents.addEventListener("fmg:salt-revolt", onRevolt);
    const months = scenario === "quotaStress" ? 1 : 12;
    const samples = [];
    for (let month = 0; month < months; month++) {
      await advanceWorld(host, { months: 1 });
      samples.push({
        date: clock(),
        settlements,
        money: money.flush().filter(row => row.step === "production:saltLogistics")
      });
      settlements = [];
    }
    const final = structuredClone(views.salt());
    await host.loadArchive(await host.saveArchive());
    await host.prepare();
    assert.deepEqual(views.salt(), final);
    const totals = {
      householdNeedKg: 0,
      householdSuppliedKg: 0,
      householdPaid: 0,
      taxPaid: 0,
      taxFarmPaid: 0,
      smuggledKg: 0,
      unmetQuotaKg: 0,
      taxAffordabilityGapKg: 0,
      saltMoneyNet: 0
    };
    for (const sample of samples) {
      totals.saltMoneyNet += sample.money.reduce((sum, row) => sum + row.net, 0);
      for (const settlement of sample.settlements)
        for (const row of settlement.salt!.states) {
          if (row.stateId !== 1) continue;
          totals.householdNeedKg += row.monthlyHouseholdDemandBags * 60;
          totals.householdSuppliedKg += row.monthlyHouseholdSalesBags * 60;
          totals.householdPaid += row.monthlyHouseholdPaid ?? 0;
          totals.taxPaid += row.monthlySaltTaxPaid ?? 0;
          totals.taxFarmPaid += row.monthlySaltTaxFarmPaid ?? 0;
          totals.smuggledKg += (row.monthlySmuggledBags ?? 0) * 60;
          totals.unmetQuotaKg += (row.monthlyUnmetQuotaBags ?? 0) * 60;
          totals.taxAffordabilityGapKg += (row.monthlyTaxAffordabilityGapBags ?? 0) * 60;
        }
    }
    runs.push({
      scenario,
      initialProfile,
      months,
      politicalStressSeed: scenario === "quotaStress" ? 79 : null,
      initial,
      samples,
      final,
      events,
      totals,
      archiveRoundtrip: true
    });
    console.error(`[salt-policy] ${scenario}`, JSON.stringify(totals));
  } finally {
    simEvents.removeEventListener("fmg:salt-revolt", onRevolt);
    setTickStepObserver(null);
    setGoodFlowObserver(null);
    host.dispose();
  }
}
const sources = [
  "scripts/auditSaltPolicy.mts",
  "scripts/lib/observeViews.mts",
  "src/types/models.ts",
  "src/extensions/economy/generators/saltPolicy.ts",
  "src/extensions/economy/generators/creditPool.ts",
  "src/extensions/economy/generators/saltFinance.ts",
  "src/extensions/economy/generators/saltLogistics.ts",
  "src/extensions/economy/generators/saltOwnership.ts",
  "src/extensions/economy/generators/councilVotes.ts",
  "src/extensions/economy/generators/councilAssembly.ts"
];
const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
writeFileSync(
  output,
  JSON.stringify(
    {
      schemaVersion: 1,
      input,
      inputSha256: sha(bytes),
      sourceHashes: Object.fromEntries(sources.map(path => [path, sha(readFileSync(path))])),
      notes: [
        "Same fixed input; explicit policy proposals use the assembly. Political stress seeds unrest only, never cash or physical stock.",
        "State 1 household totals; saltMoneyNet spans all state/market/person accounts at Salt settlement, at 0.001 precision."
      ],
      runs
    },
    null,
    2
  ) + "\n"
);

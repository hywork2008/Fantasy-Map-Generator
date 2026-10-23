#!/usr/bin/env tsx
/** Salt S0 baseline: reuse the observatory's per-good flows and monthly state records. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";
import { createObserveViews, createMoneyFlowRecorder } from "./lib/observeViews.mts";
import { setGoodFlowObserver } from "../src/extensions/economy/generators/goodsBalanceLedger";
import { setCargoDepartureObserver, setLotDispatchObserver, setTradeStageObserver } from "../src/extensions/economy/generators/tradeStageObserver";
import { setTickStepObserver } from "../src/generators/tickProfiler";
import { SALT_LIVESTOCK_ANNUAL_KG, SALT_LIVESTOCK_NATURAL_SHARE } from "../src/extensions/economy/generators/saltLogistics";

import { SALT_PRODUCTION_POLICY } from "../src/extensions/economy/generators/saltProduction";

const [input, output, length = "12"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 1) {
  throw new Error("Usage: node --import tsx scripts/auditSaltSupply.mts input.fmg output.json [months=12]");
}
const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sourcePaths = execFileSync("git", ["ls-files", "-z", "src", "scripts", "public", "package-lock.json"])
  .toString().split("\0").filter(path => path && !path.startsWith("src/city-generator/"));
sourcePaths.push("scripts/auditSaltSupply.mts", "src/extensions/economy/generators/saltProduction.ts", "src/extensions/economy/generators/saltFinance.ts");
const sourceHashes = Object.fromEntries([...new Set(sourcePaths)].sort().map(path => [path, sha256(readFileSync(path))]));
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
  // Same explicit settings as the wool baseline; never inject stocks, money or population.
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  // Preserve the actual loaded profile so a shared date cannot hide different historical settings.
  const initialProfile = {
    worldOptions: structuredClone(host.world.options),
    populationRate: host.world.populationRate,
    urbanization: host.world.urbanization,
    gridScope: structuredClone(host.world.grid.scope ?? null),
    extensions: Object.fromEntries(["economy", "characters", "nobility", "shipbuilding"]
      .map(id => [id, host.enablement.isEnabled(id)])),
    cultures: host.world.pack.cultures.filter(culture => culture?.i && !culture.removed)
      .map(culture => ({ id: culture.i, name: culture.name, base: culture.base }))
  };
  const clock = () => ({ year: host.simulation.currentYear, month: host.simulation.currentMonth,
    day: host.simulation.currentDay, tick: host.simulation.tickCount });
  const views = createObserveViews(() => host.world, clock);
  const money = createMoneyFlowRecorder(() => host.world);
  type SaltSettlement = { date: ReturnType<typeof clock>; states: NonNullable<ReturnType<typeof views.salt>>["states"]; works: NonNullable<ReturnType<typeof views.salt>>["works"] };
  let settlements: SaltSettlement[] = [];
  setTickStepObserver({
    enter(label) { money.observer.enter(label); },
    exit(label) {
      money.observer.exit(label);
      if (label === "production:saltLogistics") settlements.push({ date: clock(), states: views.salt()?.states ?? [], works: views.salt()?.works ?? [] });
    }
  });
  function snapshot() {
    const { pack, populationRate, urbanization } = host.world;
    const rate = Math.max(1, populationRate ?? 1);
    const urban = Math.max(1, urbanization ?? 1);
    const ruralPeople = Array.from(pack.cells.i).reduce((sum, id) => sum + (pack.cells.h[id] >= 20 ? pack.cells.pop[id] * rate : 0), 0);
    const urbanPeople = pack.burgs.reduce((sum, burg) => sum + (burg?.i && !burg.removed ? (burg.population ?? 0) * rate * urban : 0), 0);
    const trade = views.trade();
    const salt = trade.byGood.find(row => row.name === "Salt");
    if (!salt || !trade.salt) throw new Error("Salt economy is unavailable");
    const intervalSettlements = settlements;
    settlements = [];
    return { date: clock(), populationRate, urbanization, ruralPeople, urbanPeople,
      realPeople: ruralPeople + urbanPeople, saltMoney: money.flush().filter(row => row.step === "production:saltLogistics"), salt, logistics: trade.salt, settlements: intervalSettlements };
  }
  const initial = snapshot();
  const samples = [];
  for (let month = 0; month < months; month++) {
    await advanceWorld(host, { months: 1 });
    samples.push(snapshot());
    console.error(`[salt-supply] ${basename(input)} ${month + 1}/${months}`);
  }
  // Monthly ledger population is the demand-time denominator, not the end-date population.
  const totals = samples.reduce((sum, sample) => {
    for (const row of sample.settlements.flatMap(settlement => settlement.states)) {
      sum.personMonths += row.population;
      sum.householdPaid += row.monthlyHouseholdPaid ?? 0;
      sum.livestockPaid += row.monthlyLivestockPaid ?? 0;
      sum.importsPaid += row.monthlyImportsPaid ?? 0;
      sum.householdDemandKg += row.monthlyHouseholdDemandBags * sample.logistics.kilogramsPerBag;
      sum.householdSuppliedKg += row.monthlyHouseholdSalesBags * sample.logistics.kilogramsPerBag;
      sum.unmetHouseholdKg += row.monthlyUnmetHouseholdBags * sample.logistics.kilogramsPerBag;
      sum.productionKg += row.monthlyOutputBags * sample.logistics.kilogramsPerBag;
      sum.livestockDemandKg += (row.monthlyLivestockDemandBags ?? 0) * sample.logistics.kilogramsPerBag;
      sum.livestockSuppliedKg += (row.monthlyLivestockSuppliedBags ?? 0) * sample.logistics.kilogramsPerBag;
      sum.livestockUnmetKg += (row.monthlyUnmetLivestockBags ?? 0) * sample.logistics.kilogramsPerBag;
    }
    for (const work of sample.settlements.flatMap(settlement => settlement.works)) {
      sum.wagesPaid += work.monthlyWagesPaid ?? 0;
      sum.fuelPaid += work.monthlyFuelPaid ?? 0;
      sum.wholesaleReceived += work.monthlyWholesaleReceived ?? 0;
      sum.freightPaid += work.monthlyFreightPaid ?? 0;
      sum.saltLaborHours += work.monthlyLaborHours ?? 0;
      sum.saltFuelWoodUnits += work.monthlyFuelWoodUnits ?? 0;
    }
    sum.saltMoneyNet += sample.saltMoney.reduce((net, row) => net + row.net, 0);
    sum.recipeInputKg += (sample.salt.flows?.["sink:recipeInput"]?.units ?? 0) * sample.logistics.kilogramsPerBag;
    return sum;
  }, { householdPaid: 0, livestockPaid: 0, importsPaid: 0, wagesPaid: 0, fuelPaid: 0, wholesaleReceived: 0, freightPaid: 0, saltMoneyNet: 0, saltLaborHours: 0, saltFuelWoodUnits: 0, personMonths: 0, householdDemandKg: 0, householdSuppliedKg: 0, unmetHouseholdKg: 0, productionKg: 0, recipeInputKg: 0, livestockDemandKg: 0, livestockSuppliedKg: 0, livestockUnmetKg: 0 });
  const annualizedKgPerServedPerson = Object.fromEntries(Object.entries(totals)
    .filter(([key]) => key.endsWith("Kg"))
    .map(([key, value]) => [key, totals.personMonths > 0 ? value * 12 / totals.personMonths : null]));
  writeFileSync(output, JSON.stringify({ schemaVersion: 5, input: basename(input), inputSha256: sha256(bytes),
    gitHead: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(),
    sourceTreeSha256: sha256(JSON.stringify(sourceHashes)),
    sourceHashScope: "git-tracked src (excluding deprecated city-generator), scripts, public, package-lock.json, plus this runner and saltProduction.ts/saltFinance.ts",
    sourceHashes: Object.fromEntries(["scripts/auditSaltSupply.mts", "scripts/lib/observeViews.mts",
      "src/extensions/economy/generators/saltLogistics.ts", "src/extensions/economy/generators/saltProduction.ts", "src/extensions/economy/generators/saltFinance.ts", "src/extensions/economy/generators/production-generator.ts"]
      .map(path => [path, sourceHashes[path]])),
    seed: host.world.seed, settlementPattern: host.world.options.initialSettlementPattern, initialProfile,
    worldSettings: sim.worldSettings, months,
    modelPolicy: { saltProduction: SALT_PRODUCTION_POLICY, livestockAnnualKg: SALT_LIVESTOCK_ANNUAL_KG, livestockNaturalCreditShare: SALT_LIVESTOCK_NATURAL_SHARE,
      youngHeadEquivalent: 0.5, note: "Uncalibrated supplementary-salt planning assumptions, not observed historical purchases or physiological requirements." },
    notes: ["Flows are interval totals; logistics states and works are latest-month records, not cumulative. settlements captures every actual salt settlement via the read-only tick observer.",
      "Salt bag = 60 kg. S3 household deliveries are purchases from existing wallets; input, wholesale and freight payments have explicit counterparties.",
      "personMonths sums demand-time state ledger population once per actual settlement, including zero or multiple settlements per calendar sample. Neutral and unmarketed residents are now included in demand; realPeople includes all land residents.",
      "Processing forecast uses prior actual recipe inputs and is not another consumption. recipeInput is actual recorded processing, without an assumed 2.4 kg sink.",
      "Shipments are internal transfers. Never add dispatch, arrival or imports to world production.",
      "Initial stocks and in-transit cargo are retained; no warmup. The 12-month run includes initial reserve filling.",
      "Flow values remain price valuations. S3 cash payments are separate fields; saltMoney records net changes at salt settlement. No extra cash, free stocks or labor are injected."],
    denominatorScope: "All state ledger residents, including neutral and unmarketed households; not just served people.",
    totals, annualizedKgPerLedgerResident: annualizedKgPerServedPerson, initial, samples }, null, 2) + "\n");
} finally {
  setTickStepObserver(null);
  setGoodFlowObserver(null);
  setCargoDepartureObserver(null);
  setLotDispatchObserver(null);
  setTradeStageObserver(null);
  host.dispose();
}

/**
 * E1-2..E1-6 audit: herd scale against people and cropland, convergence toward the supported herd,
 * physical feed and staple settlements. Usage: auditHerdScale.mts <archive.fmg> <output.json> [months]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getOrCreateFaunaStockTable, getOrCreateLivestockFeedTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { getCultivatedArea, getYieldPerArea } from "../src/extensions/economy/context/agriculture";
import * as fauna from "../src/extensions/economy/generators/faunaPopulation";
import { previewHuntingGameOutput } from "../src/extensions/economy/generators/ruralOccupationAllocation";
import * as husbandry from "../src/extensions/economy/generators/husbandry";
import { getAnnualWoolPotentialKg } from "../src/extensions/economy/generators/woolProduction";
import { setTickStepObserver } from "../src/generators/tickProfiler";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "36"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 0)
  throw new Error("Usage: auditHerdScale.mts <archive.fmg> <output.json> [months]");
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "src", "scripts"])
  .toString()
  .split("\0")
  .filter(path => path && !path.startsWith("src/city-generator/"));
const sourceTreeSha256 = hash(JSON.stringify([...new Set(paths)].sort().map(path => [path, hash(readFileSync(path))])));
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  const staple = { events: 0, ruralNeed: 0, ruralSupplied: 0, urbanNeed: 0, urbanSupplied: 0, urbanBudgetGap: 0, urbanStockGap: 0 };
  const stapleByYear: (typeof staple)[] = [];
  setTickStepObserver({
    enter() {},
    exit(label) {
      if (label !== "production:foodConsumption" && label !== "food:consumption") return;
      staple.events++;
      for (const market of getMarkets()) {
        const row = market.foodLedger?.monthlyConsumption;
        if (!row) continue;
        staple.ruralNeed += row.ruralNeed;
        staple.ruralSupplied += row.ruralSupplied;
        staple.urbanNeed += row.urbanNeed;
        staple.urbanSupplied += row.urbanSupplied;
        staple.urbanBudgetGap += row.urbanBudgetGap;
        staple.urbanStockGap += row.urbanStockGap;
      }
    }
  });
  function snapshot() {
    const world = getWorldContext();
    const cells = world.pack.cells;
    const rate = world.populationRate || 1;
    const table = getOrCreateFaunaStockTable() ?? {};
    const feed = getOrCreateLivestockFeedTable() ?? {};
    const land = { ruralPeople: 0, cultivatedHa: 0, pastureHa: 0, residentsWithoutCropland: 0, shortfallCells: 0 };
    const convertedForestHaByKind: Record<string, number> = {};
    for (const cell of cells.i) {
      if (cells.h[cell] < 20) continue;
      const people = Math.max(0, cells.pop[cell] ?? 0) * rate;
      const budget = world.pack.landUse?.cells[cell];
      land.ruralPeople += people;
      land.cultivatedHa += budget?.allocatedAreaHa ?? 0;
      if (people > 0 && !((budget?.allocatedAreaHa ?? 0) > 0)) land.residentsWithoutCropland += people;
      land.shortfallCells += Number(budget?.diagnostics.includes("livestock-land-shortfall") ?? false);
      for (const patch of budget?.patches ?? []) {
        if (patch.convertedForestAreaHa > 0)
          convertedForestHaByKind[patch.kind] = (convertedForestHaByKind[patch.kind] ?? 0) + patch.convertedForestAreaHa;
        if (patch.kind === "pasture" || patch.kind === "wood_pasture") land.pastureHa += patch.areaHa;
      }
    }
    const species = getGoods()
      .filter(good => husbandry.isGrazedLivestockGood(good.name))
      .map(good => {
        const row = { species: good.name, heads: 0, demandTargetHeads: 0, supportedHeads: 0, headsAboveSupported: 0, headsBelowSupported: 0 };
        for (const cell of cells.i) {
          if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
          const herd = table[`${cell}:${good.name}`];
          const heads = herd ? herd.young + herd.breeding + herd.old : 0;
          const supported = fauna.getDomesticatedCarryingCapacity(cell, good, 0);
          row.heads += heads;
          // Absent before E1 §7.41; the baseline runtime then reports 0.
          const targets = "getLivestockHerdTargets" in husbandry ? husbandry.getLivestockHerdTargets(world, cell) : {};
          row.demandTargetHeads += targets[good.name] ?? 0;
          row.supportedHeads += supported;
          row.headsAboveSupported += Math.max(0, heads - supported);
          row.headsBelowSupported += Math.max(0, supported - heads);
        }
        return { ...row, perHundredRuralPeople: (100 * row.heads) / land.ruralPeople };
      });
    const fields = getCultivatedArea();
    const yields = getYieldPerArea();
    let fieldHa = 0;
    let weightedYield = 0;
    for (const cell of cells.i) {
      if (cells.h[cell] < 20 || !(fields[cell] > 0)) continue;
      fieldHa += fields[cell];
      weightedYield += fields[cell] * yields[cell];
    }
    let woolKg = 0;
    for (const cell of cells.i) woolKg += getAnnualWoolPotentialKg(cell);
    const feedYear = { requiredKg: 0, fedKg: 0 };
    for (const row of Object.values(feed))
      for (const sample of row.samples ?? []) {
        feedYear.requiredKg += sample.requiredKg;
        feedYear.fedKg += sample.fedKg;
      }
    // Wild stock and the hunters' monthly take (read-only preview), for the wild-capture C3 check.
    const wild = { heads: 0, monthlyHuntingTake: 0 };
    for (const cell of cells.i) {
      if (cells.h[cell] < 20) continue;
      const game = table[`${cell}:${fauna.WILD_SPECIES_KEY}`];
      if (game) wild.heads += game.young + game.breeding + game.old;
      wild.monthlyHuntingTake += previewHuntingGameOutput(cell);
    }
    // Absent before wild capture (C2); the baseline runtime then reports null.
    const wildCapture = "getLastWildCaptureRecord" in fauna ? fauna.getLastWildCaptureRecord() : null;
    return {
      wild,
      wildCapture,
      date: [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay],
      land,
      convertedForestHaByKind,
      cultivatedHaPerRuralPerson: land.cultivatedHa / land.ruralPeople,
      meanNetYieldKgPerSownHa: fieldHa > 0 ? weightedYield / fieldHa : 0,
      draughtPerCultivatedHa:
        (species.find(row => row.species === "Horses")?.heads ?? 0) / land.cultivatedHa +
        (species.find(row => row.species === "Cattle")?.heads ?? 0) / 2 / land.cultivatedHa,
      species,
      annualWoolPotentialKg: woolKg,
      woolKgPerRuralPerson: woolKg / land.ruralPeople,
      trailing12MonthFeed: { ...feedYear, unmetShare: feedYear.requiredKg > 0 ? 1 - feedYear.fedKg / feedYear.requiredKg : 0 }
    };
  }
  const samples = [snapshot()];
  for (let month = 1; month <= months; month++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    if (month % 12 === 0 || month === months) {
      samples.push(snapshot());
      stapleByYear.push({ ...staple });
      Object.assign(staple, { events: 0, ruralNeed: 0, ruralSupplied: 0, urbanNeed: 0, urbanSupplied: 0, urbanBudgetGap: 0, urbanStockGap: 0 });
    }
    console.error(`[herd-scale] ${month}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 4,
        inputSha256: hash(bytes),
        sourceTreeSha256,
        months,
        historicalPeriod: host.world.options.historicalPeriod,
        worldSettings: sim.worldSettings,
        notes: [
          "Heads are rural grazed herds in inhabited land cells. Demand targets are model policy (livestockHerdTargetPolicy.ts).",
          "Supported heads are the target limited by forage land, feed history and herders; heads above it are reduced each autumn.",
          "Staple rows sum the actual food settlements of each 12-month interval in food-ledger units.",
          "draughtPerCultivatedHa counts all horses and half of cattle as a working-animal proxy."
        ],
        samples,
        stapleByYear
      },
      null,
      2
    )}\n`
  );
} finally {
  setTickStepObserver(null);
  host.dispose();
}

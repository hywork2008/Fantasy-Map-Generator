import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getOrCreateFaunaStockTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import {
  getDomesticatedCarryingCapacity,
  getNonFoodDemandAbsorptionCapacity,
  getRealNonMarketDemand
} from "../src/extensions/economy/generators/faunaPopulation";
import { getGrazedCarryingCapacity, STOCKING_DENSITY_PER_HECTARE } from "../src/extensions/economy/generators/husbandry";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

import { setGoodFlowObserver } from "../src/extensions/economy/generators/goodsBalanceLedger";
import { animalsPerMarketHead } from "../src/extensions/economy/generators/liveAnimalScale";
import { getDairyCalibrationAssessment } from "../src/extensions/economy/generators/dairyHistoricalReferences";
import { getJointLivestockMarketDemand } from "../src/extensions/economy/generators/livestockJointDemandMarket";

const [input, output, length = "0"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 0) throw new Error("Usage: auditLivestockDemand.mts <archive.fmg> <output.json> [months]");
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "src", "scripts", "public", "package-lock.json"])
  .toString().split("\0").filter(path => path && !path.startsWith("src/city-generator/"));
const sourceHashes = Object.fromEntries([...new Set(paths)].sort().map(path => [path, hash(readFileSync(path))]));
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  const liveGoods = new Map(getGoods().filter(good => good.tags.includes("liveAnimal")).map(good => [good.i, good.name]));
  const observedLiveDispatch: Record<string, {marketId: number | null; species: string; heads: number; untrackedCohortHeads: number}> = {};
  setGoodFlowObserver(flow => {
    const species = liveGoods.get(flow.goodId);
    if (!species || flow.direction !== "source" || flow.category !== "ruralHarvest") return;
    const key = `${flow.marketId ?? "unknown"}:${species}`;
    const row = observedLiveDispatch[key] ??= { marketId: flow.marketId ?? null, species, heads: 0, untrackedCohortHeads: 0 };
    const heads = flow.units * animalsPerMarketHead(species);
    row.heads += heads;
    if (!flow.livestockCohorts) row.untrackedCohortHeads += heads;
  });
  function snapshot() {
    const world = getWorldContext();
    const table = getOrCreateFaunaStockTable() ?? {};
    const species = getGoods().filter(good => good.name in STOCKING_DENSITY_PER_HECTARE).map(good => {
      const food = good.tags.includes("food");
      const row = {
        species: good.name,
        demandStatus: food ? "joint-product demand not modeled" : "regional allocation; quarterly absorption is a stock proxy",
        recordedHeads: 0, resourceCeilingHeads: 0, currentTargetHeads: 0,
        assignedRealUseHeads: 0, finiteBufferedDemandProxyHeads: 0, unknownDemandCells: 0,
        floorAddedHeads: 0, inhabitedCells: 0, herdCells: 0, cellsAboveCurrentTarget: 0, headsAboveCurrentTarget: 0
      };
      for (const cell of world.pack.cells.i) {
        if (world.pack.cells.h[cell] < 20 || !(world.pack.cells.pop[cell] > 0)) continue;
        row.inhabitedCells++;
        const herd = table[`${cell}:${good.name}`];
        const heads = herd ? herd.young + herd.breeding + herd.old : 0;
        const raw = getGrazedCarryingCapacity(cell, good);
        const target = getDomesticatedCarryingCapacity(cell, good, 0);
        row.recordedHeads += heads;
        row.resourceCeilingHeads += raw;
        row.currentTargetHeads += target;
        if (heads > 0) row.herdCells++;
        if (heads > target + 1e-6) {
          row.cellsAboveCurrentTarget++;
          row.headsAboveCurrentTarget += heads - target;
        }
        if (food) { row.unknownDemandCells++; continue; }
        row.assignedRealUseHeads += getRealNonMarketDemand(cell, good);
        const demand = getNonFoodDemandAbsorptionCapacity(cell, good);
        if (!Number.isFinite(demand)) { row.unknownDemandCells++; continue; }
        row.finiteBufferedDemandProxyHeads += demand;
        row.floorAddedHeads += Math.max(0, target - Math.min(raw, demand));
      }
      return row;
    });
    return { date: [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay], species, dairyCalibration: getDairyCalibrationAssessment(), jointProductMarkets: getMarkets().map(getJointLivestockMarketDemand), observedLiveDispatchSincePreparedStart: structuredClone(observedLiveDispatch) };
  }
  const initial = snapshot();
  const samples = [];
  for (let month = 1; month <= months; month++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    if (month % 12 === 0 || month === months) samples.push(snapshot());
    console.error(`[livestock-demand] ${month}/${months}`);
  }
  writeFileSync(output, `${JSON.stringify({
    schemaVersion: 3, inputSha256: hash(bytes), sourceTreeSha256: hash(JSON.stringify(sourceHashes)), sourceHashes,
    boundary: "Prepared initial snapshot and yearly samples; recorded rural grazed herds in inhabited land cells only",
    months, settlementPattern: host.world.options.initialSettlementPattern, worldSettings: sim.worldSettings,
    notes: [
      "Resource ceilings use authored land, feed and labour coefficients; they are not historical adequacy findings.",
      "Live dispatch counters begin after prepare, count actual rural market inflows in real animals, and are not slaughter or carcass production. Snapshot renewal is a current annual forecast, not cumulative births over this interval.",
      "Food species have no joint-product demand ceiling. Unknown demand is not zero demand.",
      "Military and transport standing use is distinct from quarterly market flow. Their maximum remains the legacy target proxy, not a calibrated breeding-stock requirement.",
      "Population weights among compatible production biomes partition shared demand once but do not optimize the location of production. Unusable local shares are not reassigned.",
      "The legacy 5% resource-capacity floor may exceed observed demand; floorAddedHeads identifies this contribution.",
      "Current target excess is not an instruction to delete animals; existing annual cohort transition applies."
    ], initial, samples
  }, null, 2)}\n`);
} finally { setGoodFlowObserver(null); host.dispose(); }

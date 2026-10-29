/**
 * E1 §7.56 audit: where the last year's livestock feed shortage comes from, per cell and month —
 * grass cut short by haymaking labor, grass left uncut because the hay plan was already met,
 * or no cuttable grass at all — and how the herd's need moved between the main cut and the shortage.
 * Usage: auditFeedShortage.mts <archive.fmg> <output.json> [months>=12]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  getFishingRequiredWorkers,
  getFishingWorkers,
  getHuntingWorkers,
  getHusbandryRequiredWorkers,
  getHusbandryMonthlyWorkDays,
  getViticultureWorkers
} from "../src/extensions/economy/context/agriculture";
import { getGoodCellColumn, getOrCreateLivestockFeedTable } from "../src/extensions/economy/context/cellTables";
import { getGoods } from "../src/extensions/economy/context/trade";
import { DevelopmentPotential } from "../src/extensions/economy/generators/developmentPotential";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import {
  getMonthlyWorkDaysPerAdult,
  WORKABLE_DAYS_PER_ADULT
} from "../src/extensions/economy/generators/agriculturalLandUse";
import { calculateHusbandryDemand, getForageAreaHectares } from "../src/extensions/economy/generators/husbandry";
import { getHusbandryLaborBudget } from "../src/extensions/economy/generators/husbandryLabor";
import { getLivestockMonthlyFeedNeedKg } from "../src/extensions/economy/generators/livestockFeed";
import {
  getLivestockHayPlan,
  HAY_DRY_MATTER_RETENTION,
  HAY_WORK_DAYS_PER_TONNE_DM
} from "../src/extensions/economy/generators/livestockFeedPolicy";
import { livestockFeedMonth, livestockFeedPeriod } from "../src/extensions/economy/generators/livestockFeedState";
import { calculateViticultureDemand, getPerennialMonthlyLaborWeights } from "../src/extensions/economy/generators/viticulture";
import { setTickStepObserver } from "../src/generators/tickProfiler";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "48"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 12)
  throw new Error("Usage: auditFeedShortage.mts <archive.fmg> <output.json> [months>=12]");
interface Month {
  month: number;
  needKg: number;
  cuttableKg: number;
  capacityKg: number;
  plannedKg: number;
  freeKg: number;
  reservedKg: number;
  careNowKg: number;
  allocRequestedKg: number;
  allocHayKg: number;
  harvestedKg: number;
  standingOutKg: number;
  reserveTargetKg: number;
  hayAfterHarvestKg: number;
  shutUpMonth: number;
  requiredKg?: number;
  unmetKg?: number;
  purchasedKg?: number;
  hayAfterFeedKg?: number;
}
const log = new Map<number, Month[]>();
// Demand as the annual occupation allocator saw it, snapshotted whenever a new calendar is stored.
let calendarSum = NaN;
const allocated = new Map<number, { total: number[]; hay: number[]; storedRequired?: number; requiredNow?: number }>();
// §7.58: what already filled each month before husbandry, from the crop calendar of the last annual allocation.
interface Claims { capacity: number[]; crop: number[]; hunting: number[]; fishing: number[]; viticulture: number[]; fishFirst: boolean; vineFirst: boolean }
const claims = new Map<number, Claims>();
let cropDaysByMonth: Float32Array | undefined;
const proto = DevelopmentPotential as unknown as { storeAgriculture(world: unknown, agriculture: { cropLaborDaysByMonth: Float32Array }): unknown };
const storeAgriculture = proto.storeAgriculture;
proto.storeAgriculture = function (world, agriculture) {
  cropDaysByMonth = agriculture.cropLaborDaysByMonth.slice();
  return storeAgriculture.call(this, world, agriculture);
};
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
let recording = false;
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  setTickStepObserver({
    enter() {},
    exit(label) {
      const world = getWorldContext();
      const sum = label === "production:forageHarvest" ? getHusbandryMonthlyWorkDays().reduce((a, b) => a + b, 0) : NaN;
      if (!Number.isNaN(sum) && sum !== calendarSum) {
        calendarSum = sum;
        allocated.clear();
        claims.clear();
        // Fishing workers are stored per holder cell; spread them back over the land cells that staffed them.
        const fishGood = getGoods().find(good => good.name === "Fish");
        const fishValue = fishGood?.value ?? 0;
        const fishingByLandCell = new Map<number, number>();
        const goodColumn = getGoodCellColumn();
        for (const holder of world.pack.cells.i) {
          if (!fishGood || goodColumn[holder] !== fishGood.i || !(getFishingRequiredWorkers()[holder] > 0)) continue;
          const assigned = getFishingWorkers()[holder] ?? 0;
          const land = world.pack.cells.h[holder] >= 20 ? [holder] : (world.pack.cells.c[holder] ?? []).filter(n => world.pack.cells.h[n] >= 20);
          for (const n of land) fishingByLandCell.set(n, (fishingByLandCell.get(n) ?? 0) + assigned / land.length);
        }
        for (const cell of world.pack.cells.i) {
          if (world.pack.cells.h[cell] < 20) continue;
          const demand = calculateHusbandryDemand(world, cell);
          if (!(demand.requiredWorkers > 0)) continue;
          const days = (weights: readonly number[] | undefined, workers: number) =>
            Array.from({ length: 12 }, (_, m) => workers * WORKABLE_DAYS_PER_ADULT * (weights?.[m] ?? 1 / 12));
          if (cropDaysByMonth?.length === world.pack.cells.i.length * 12) {
            const adults = (world.pack.cells.maleAdults?.[cell] ?? 0) + (world.pack.cells.femaleAdults?.[cell] ?? 0);
            const perAdult = getMonthlyWorkDaysPerAdult(cropDaysByMonth, cell * 12);
            const vine = getPerennialMonthlyLaborWeights(world, cell);
            const fish = fishingByLandCell.get(cell) ?? 0;
            claims.set(cell, {
              capacity: perAdult.map(days => adults * Math.max(1, world.populationRate || 1) * days),
              crop: Array.from(cropDaysByMonth.subarray(cell * 12, cell * 12 + 12)),
              hunting: new Array(12).fill((getHuntingWorkers()[cell] ?? 0) * WORKABLE_DAYS_PER_ADULT / 12),
              fishing: new Array(12).fill(fish * WORKABLE_DAYS_PER_ADULT / 12),
              viticulture: vine.map(weight => (getViticultureWorkers()[cell] ?? 0) * WORKABLE_DAYS_PER_ADULT * (weight ?? 0)),
              fishFirst: fish > 0 && fishValue > demand.value,
              vineFirst: (getViticultureWorkers()[cell] ?? 0) > 0 && calculateViticultureDemand(world, cell).value > demand.value
            });
          }
          allocated.set(cell, {
            total: days(demand.monthlyLaborWeights, demand.requiredWorkers),
            hay: days(demand.hayMonthlyLaborWeights ?? new Array(12).fill(0), demand.hayWorkers ?? 0),
            storedRequired: getHusbandryRequiredWorkers()[cell] ?? 0,
            requiredNow: demand.requiredWorkers
          });
        }
      }
      if (!recording) return;
      const table = getOrCreateLivestockFeedTable() ?? {};
      const period = livestockFeedPeriod();
      const month = livestockFeedMonth() - 1;
      if (label === "production:forageHarvest") {
        for (const [key, row] of Object.entries(table)) {
          const cell = Number(key);
          if (row.harvestPeriod !== period || world.pack.cells.h[cell] < 20) continue;
          const need = getLivestockMonthlyFeedNeedKg(cell);
          const plan = getLivestockHayPlan(world, cell, need * 12, getForageAreaHectares(cell));
          const demand = calculateHusbandryDemand(world, cell);
          const budget = getHusbandryLaborBudget(cell, month, demand);
          const plannedDays = (demand.hayWorkers ?? 0) * WORKABLE_DAYS_PER_ADULT * (demand.hayMonthlyLaborWeights?.[month] ?? 0);
          const list = log.get(cell) ?? [];
          log.set(cell, list);
          list.push({
            month,
            needKg: need,
            cuttableKg: row.pastureGrownKg - row.grazingReservedKg + (row.standingInKg ?? 0),
            capacityKg: (budget.hayCapacityDays / HAY_WORK_DAYS_PER_TONNE_DM) * 1000,
            plannedKg: (plannedDays / HAY_WORK_DAYS_PER_TONNE_DM) * 1000,
            freeKg: (Math.max(0, budget.reservedDays - budget.careDays) / HAY_WORK_DAYS_PER_TONNE_DM) * 1000,
            reservedKg: (budget.reservedDays / HAY_WORK_DAYS_PER_TONNE_DM) * 1000,
            careNowKg: (budget.careRequiredDays / HAY_WORK_DAYS_PER_TONNE_DM) * 1000,
            allocRequestedKg: ((allocated.get(cell)?.total[month] ?? 0) / HAY_WORK_DAYS_PER_TONNE_DM) * 1000,
            allocHayKg: ((allocated.get(cell)?.hay[month] ?? 0) / HAY_WORK_DAYS_PER_TONNE_DM) * 1000,
            harvestedKg: row.harvestedKg,
            standingOutKg: row.standingKg ?? 0,
            reserveTargetKg: plan.reserveAfterMonthKg[month],
            hayAfterHarvestKg: row.hayKg,
            shutUpMonth: plan.shutUpMonth
          });
        }
      } else if (label === "production:livestockFeed") {
        for (const [cell, list] of log) {
          const row = table[cell];
          const last = list.at(-1);
          if (!row || !last || row.feedPeriod !== period || last.requiredKg !== undefined) continue;
          Object.assign(last, {
            requiredKg: row.requiredKg,
            unmetKg: row.unmetKg,
            purchasedKg: row.purchasedKg,
            hayAfterFeedKg: row.hayKg
          });
        }
      }
    }
  });
  for (let month = 1; month <= months; month++) {
    recording = month > months - 12;
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    console.error(`[feed-shortage] ${month}/${months}`);
  }
  const world = getWorldContext();
  const rate = world.populationRate || 1;
  const causes = { labor: 0, plan: 0, grass: 0 };
  const byBiome: Record<string, Record<string, number>> = {};
  const byOffset = Array.from({ length: 12 }, () => ({ requiredKg: 0, unmetKg: 0, cells: 0 }));
  const examples: unknown[] = [];
  let requiredKg = 0;
  let unmetKg = 0;
  for (const [cell, list] of log) {
    const settled = list.filter(entry => entry.requiredKg !== undefined);
    const required = settled.reduce((sum, entry) => sum + entry.requiredKg!, 0);
    const unmet = settled.reduce((sum, entry) => sum + entry.unmetKg!, 0);
    requiredKg += required;
    unmetKg += unmet;
    if (!(unmet > 1)) continue;
    // Grass the plan still wanted but labor could not cut, and grass left uncut although labor remained.
    let laborShortKg = 0;
    let planLeftKg = 0;
    let plannedKg = 0;
    const biomeLabor = {
      reserved: 0, careNow: 0, hayNow: 0, allocRequested: 0, allocHay: 0, capacity: 0,
      adultCapacity: 0, crop: 0, cropMean: 0, hunting: 0, fishing: 0, viticulture: 0,
      fishingBeforeHerd: 0, viticultureBeforeHerd: 0, cropFull: 0, hayMonths: 0
    };
    let freeKg = 0;

    for (const entry of settled) {
      const uncut = Math.max(0, entry.cuttableKg - entry.harvestedKg - entry.standingOutKg);
      const laborBound = entry.harvestedKg >= entry.capacityKg * 0.999 - 1;
      const wanted = Math.max(0, entry.reserveTargetKg - entry.hayAfterHarvestKg) / HAY_DRY_MATTER_RETENTION;
      plannedKg += entry.plannedKg;
      if (entry.plannedKg > 0) {
        biomeLabor.reserved += entry.reservedKg;
        biomeLabor.careNow += entry.careNowKg;
        biomeLabor.hayNow += entry.plannedKg;
        biomeLabor.allocRequested += entry.allocRequestedKg;
        biomeLabor.allocHay += entry.allocHayKg;
        biomeLabor.capacity += entry.capacityKg;
        const claim = claims.get(cell);
        if (claim) {
          const toKg = (days: number) => (days / HAY_WORK_DAYS_PER_TONNE_DM) * 1000;
          const m = entry.month;
          biomeLabor.adultCapacity += toKg(claim.capacity[m]);
          biomeLabor.crop += toKg(claim.crop[m]);
          biomeLabor.hunting += toKg(claim.hunting[m]);
          biomeLabor.fishing += toKg(claim.fishing[m]);
          biomeLabor.viticulture += toKg(claim.viticulture[m]);
          if (claim.fishFirst) biomeLabor.fishingBeforeHerd += toKg(claim.fishing[m]);
          if (claim.vineFirst) biomeLabor.viticultureBeforeHerd += toKg(claim.viticulture[m]);
          biomeLabor.cropFull += Number(claim.crop[m] >= claim.capacity[m] * 0.999);
          biomeLabor.hayMonths++;
          const others = claims.get(cell)!.crop.reduce((a, b) => a + b, 0) / 12;
          biomeLabor.cropMean += toKg(others);
        }
      }
      freeKg += Math.min(entry.freeKg, entry.cuttableKg);
      if (laborBound) laborShortKg += Math.min(uncut, wanted);
      else planLeftKg += Math.min(uncut, Math.max(0, entry.capacityKg - entry.harvestedKg));
    }
    const retainedLabor = laborShortKg * HAY_DRY_MATTER_RETENTION;
    const retainedPlan = planLeftKg * HAY_DRY_MATTER_RETENTION;
    const cause = retainedLabor >= Math.min(unmet, retainedPlan) && retainedLabor > 0
      ? "labor"
      : retainedPlan > 0
        ? "plan"
        : "grass";
    causes[cause] += unmet;
    const name = world.biomesData.name[world.pack.cells.biomeCode[cell]] ?? "?";
    const biome = (byBiome[name] ??= { requiredKg: 0, unmetKg: 0, labor: 0, plan: 0, grass: 0, cells: 0 });
    biome.cells++;
    biome.requiredKg += required;
    biome.unmetKg += unmet;
    biome[cause] += unmet;
    for (const [key, value] of Object.entries(biomeLabor)) biome[`hayMonth_${key}Kg`] = (biome[`hayMonth_${key}Kg`] ?? 0) + value;
    biome.plannedRawKg = (biome.plannedRawKg ?? 0) + plannedKg;
    biome.freeLaborRawKg = (biome.freeLaborRawKg ?? 0) + freeKg;
    biome.harvestedRawKg = (biome.harvestedRawKg ?? 0) + settled.reduce((sum, entry) => sum + entry.harvestedKg, 0);
    const shut = settled.find(entry => entry.shutUpMonth >= 0)?.shutUpMonth ?? -1;
    const mainCut = shut >= 0 ? (shut + 1) % 12 : -1;
    const atCut = settled.find(entry => entry.month === mainCut);
    const shortage = settled.filter(entry => entry.unmetKg! > 0);
    if (mainCut >= 0)
      for (const entry of settled) {
        const slot = byOffset[(entry.month - mainCut + 12) % 12];
        slot.requiredKg += entry.requiredKg!;
        slot.unmetKg += entry.unmetKg!;
        slot.cells += Number(entry.unmetKg! > 0);
      }
    if (atCut && shortage.length) {
      biome.needAtCutKg = (biome.needAtCutKg ?? 0) + atCut.needKg * shortage.length;
      biome.needAtShortageKg = (biome.needAtShortageKg ?? 0) + shortage.reduce((sum, entry) => sum + entry.requiredKg!, 0);
    }
    examples.push({ cell, biome: name, people: world.pack.cells.pop[cell] * rate, unmet, required, cause, mainCut, claims: claims.get(cell), allocated: allocated.get(cell), months: settled });
  }
  examples.sort((a: any, b: any) => b.unmet - a.unmet);
  const heath = examples.filter((e: any) => /Heath|peatland/.test(e.biome)).slice(0, 10);
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        notes: [
          "Last 12 months. Cause per short cell: labor = plan-wanted grass left uncut in labor-bound months; plan = cuttable grass left with labor to spare; grass = neither.",
          "byOffset counts months after each short cell's main cut (0 = main cut). needAtCut vs needAtShortage compares the herd's monthly need when hay was planned with the need when feed ran short."
        ],
        unmetShare: requiredKg > 0 ? unmetKg / requiredKg : 0,
        causes,
        byBiome,
        byOffset,
        examples: [...examples.slice(0, 20), ...heath]
      },
      null,
      2
    )}\n`
  );
} finally {
  setTickStepObserver(null);
  host.dispose();
}

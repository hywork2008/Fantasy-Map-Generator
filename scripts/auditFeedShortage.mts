/**
 * E1 §7.56 audit: where the last year's livestock feed shortage comes from, per cell and month —
 * grass cut short by haymaking labor, grass left uncut because the hay plan was already met,
 * or no cuttable grass at all — and how the herd's need moved between the main cut and the shortage.
 * Usage: auditFeedShortage.mts <archive.fmg> <output.json> [months>=12]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getOrCreateLivestockFeedTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { WORKABLE_DAYS_PER_ADULT } from "../src/extensions/economy/generators/agriculturalLandUse";
import { calculateHusbandryDemand, getForageAreaHectares } from "../src/extensions/economy/generators/husbandry";
import { getHusbandryLaborBudget } from "../src/extensions/economy/generators/husbandryLabor";
import { getLivestockMonthlyFeedNeedKg } from "../src/extensions/economy/generators/livestockFeed";
import {
  getLivestockHayPlan,
  HAY_DRY_MATTER_RETENTION,
  HAY_WORK_DAYS_PER_TONNE_DM
} from "../src/extensions/economy/generators/livestockFeedPolicy";
import { livestockFeedMonth, livestockFeedPeriod } from "../src/extensions/economy/generators/livestockFeedState";
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
      if (!recording) return;
      const world = getWorldContext();
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
    let freeKg = 0;

    for (const entry of settled) {
      const uncut = Math.max(0, entry.cuttableKg - entry.harvestedKg - entry.standingOutKg);
      const laborBound = entry.harvestedKg >= entry.capacityKg * 0.999 - 1;
      const wanted = Math.max(0, entry.reserveTargetKg - entry.hayAfterHarvestKg) / HAY_DRY_MATTER_RETENTION;
      plannedKg += entry.plannedKg;
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
    examples.push({ cell, biome: name, people: world.pack.cells.pop[cell] * rate, unmet, required, cause, mainCut, months: settled });
  }
  examples.sort((a: any, b: any) => b.unmet - a.unmet);
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
        examples: examples.slice(0, 20)
      },
      null,
      2
    )}\n`
  );
} finally {
  setTickStepObserver(null);
  host.dispose();
}

/**
 * Where the grazed herd falls short of its source-based target (E1-5, after
 * docs/plan/livestock-world-birth-herds.md): target -> pasture the target needs -> limited by the
 * ecological ceiling -> pasture actually kept (herders, annual adjustment) -> heads on that forage ->
 * supported heads after winter feed and last year's feeding. Also the labor picture behind it.
 * Read-only. Usage: auditHerdCapacityGap.mts <archive.fmg> <output.json> [months] [sample months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  getCultivatedArea,
  getHusbandryRequiredWorkers,
  getHusbandryWorkers,
  getYieldPerArea
} from "../src/extensions/economy/context/agriculture";
import { ANNUAL_SOWN_SHARE, STAPLE_NEED_KG_PER_PERSON_YEAR } from "../src/generators/settlementClearance";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods } from "../src/extensions/economy/context/trade";
import { getDomesticatedCarryingCapacity } from "../src/extensions/economy/generators/faunaPopulation";
import * as husbandry from "../src/extensions/economy/generators/husbandry";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "0", sampleList = ""] = process.argv.slice(2);
const months = Number(length);
const sampleMonths = new Set(sampleList.split(",").filter(Boolean).map(Number));
if (!input || !output || !Number.isSafeInteger(months) || months < 0)
  throw new Error("Usage: auditHerdCapacityGap.mts <archive.fmg> <output.json> [months] [sample months]");
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
const samples: unknown[] = [];

function snapshot(label: string) {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const rate = world.populationRate || 1;
  const fields = getCultivatedArea();
  const herders = getHusbandryWorkers();
  const required = getHusbandryRequiredWorkers();
  const yields = getYieldPerArea();
  const land = {
    ruralPeople: 0,
    ruralAdults: 0,
    urbanPeople: 0,
    cultivatedHa: 0,
    sownWeightedYieldKg: 0,
    /** Fields the cell's own rural people need at its yield, with the 1.1 reserve, no urban demand. */
    ruralStapleFieldNeedHa: 0,
    fallowEquivalentHa: 0,
    pastureNeedHa: 0,
    pastureCeilingHa: 0,
    pastureNeedWithinCeilingHa: 0,
    pastureKeptHa: 0,
    herdersAssigned: 0,
    herdersRequired: 0,
    /** From the land-use budgets: staple fields needed (rural, urban and market people), the policy
     * target, the part of the target set by the labor-affordable area, and fields allocated. */
    planRequiredHa: 0,
    planTargetHa: 0,
    planLaborExcessHa: 0,
    planLaborTargetCells: 0,
    planAllocatedHa: 0,
    planFoodDemandPeople: 0,
    planRuralPeople: 0
  };
  for (const budget of Object.values(world.pack.landUse?.cells ?? {})) {
    land.planRequiredHa += budget.requiredAreaHa;
    land.planTargetHa += budget.policyTargetAreaHa;
    land.planAllocatedHa += budget.allocatedAreaHa;
    land.planFoodDemandPeople += budget.foodDemandPeople;
    land.planRuralPeople += budget.ruralPeople;
    const excess = budget.policyTargetAreaHa - budget.requiredAreaHa * 1.1;
    if (excess > 1e-6) {
      land.planLaborExcessHa += excess;
      land.planLaborTargetCells++;
    }
  }
  for (const burg of world.pack.burgs ?? [])
    if (burg?.i && !burg.removed) land.urbanPeople += Math.max(0, burg.population ?? 0) * rate * Math.max(0, world.urbanization ?? 1);
  const species: Record<string, { target: number; atCeiling: number; atKept: number; supported: number }> = {};
  const grazed = getGoods().filter(good => husbandry.isGrazedLivestockGood(good.name));
  for (const cell of cells.i) {
    if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
    land.ruralPeople += cells.pop[cell] * rate;
    land.ruralAdults += (Math.max(0, cells.maleAdults?.[cell] ?? 0) + Math.max(0, cells.femaleAdults?.[cell] ?? 0)) * rate;
    land.cultivatedHa += fields[cell] ?? 0;
    land.sownWeightedYieldKg += (fields[cell] ?? 0) * (yields[cell] ?? 0);
    if ((yields[cell] ?? 0) > 0)
      land.ruralStapleFieldNeedHa +=
        ((cells.pop[cell] * rate * STAPLE_NEED_KG_PER_PERSON_YEAR) / (yields[cell] * ANNUAL_SOWN_SHARE)) * 1.1;
    land.herdersAssigned += herders[cell] ?? 0;
    land.herdersRequired += required[cell] ?? 0;
    const targets = husbandry.getLivestockHerdTargets(world, cell);
    const gross = Object.entries(targets).reduce(
      (sum, [name, heads]) => sum + heads * husbandry.getPastureHectaresPerHead(world, cell, name),
      0
    );
    const fallow = husbandry.getGrazedFallowPastureEquivalentHectares(world, cell);
    const need = Math.max(0, gross - fallow);
    const ceiling = husbandry.calculatePastureCeilingAreaHectares(world, cell);
    const kept = husbandry.getPastureAreaUsedHectares(cell);
    land.fallowEquivalentHa += fallow;
    land.pastureNeedHa += need;
    land.pastureCeilingHa += ceiling;
    land.pastureNeedWithinCeilingHa += Math.min(need, ceiling);
    land.pastureKeptHa += kept;
    const atCeiling = husbandry.calculateGrazingLandAllocation(world, cell, Math.min(need, ceiling) + fallow);
    const atKept = husbandry.calculateGrazingLandAllocation(world, cell, kept + fallow);
    for (const good of grazed) {
      const row = (species[good.name] ??= { target: 0, atCeiling: 0, atKept: 0, supported: 0 });
      row.target += targets[good.name] ?? 0;
      row.atCeiling += atCeiling.find(r => r.goodName === good.name)?.capacityHeads ?? 0;
      row.atKept += atKept.find(r => r.goodName === good.name)?.capacityHeads ?? 0;
      row.supported += getDomesticatedCarryingCapacity(cell, good, 0);
    }
  }
  samples.push({ label, date: [host.simulation.currentYear, host.simulation.currentMonth], land, species });
}

try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  snapshot("prepared");
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    if (sampleMonths.has(m) || m === months) snapshot(`month ${m}`);
    console.error(`[capacity-gap] ${m}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        notes: [
          "Settled land cells. Heads are real animals; atCeiling/atKept split the forage by each species' feed need at its target.",
          "pastureNeedHa is the pasture the source-based targets need after grazed fallow; pastureKeptHa is the maintained pasture.",
          "herders are real workers (annual-equivalent); ruralAdults are real people."
        ],
        samples
      },
      null,
      1
    )}\n`
  );
} finally {
  host.dispose();
}

/**
 * World-birth herds B0 audit (docs/plan/livestock-world-birth-herds.md §5): pasture, grazed-herd
 * capacity, source-based targets and heads, right after load, after prepare and at chosen months;
 * plus the age split of herds settled at capacity (0.9..1.1). Read-only.
 * Usage: auditWorldBirthHerds.mts <archive.fmg> <output.json> [months] [sample months, comma-separated]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getOrCreateFaunaStockTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods } from "../src/extensions/economy/context/trade";
import { getDomesticatedCarryingCapacity } from "../src/extensions/economy/generators/faunaPopulation";
import * as husbandry from "../src/extensions/economy/generators/husbandry";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "0", sampleList = ""] = process.argv.slice(2);
const months = Number(length);
const sampleMonths = new Set(sampleList.split(",").filter(Boolean).map(Number));
if (!input || !output || !Number.isSafeInteger(months) || months < 0)
  throw new Error("Usage: auditWorldBirthHerds.mts <archive.fmg> <output.json> [months] [sample months]");
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
const samples: unknown[] = [];

function snapshot(label: string) {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const rate = world.populationRate || 1;
  const table = getOrCreateFaunaStockTable() ?? {};
  const land = { ruralPeople: 0, cultivatedHa: 0, pastureHa: 0, woodPastureHa: 0, landUseCells: 0 };
  const convertedForestHaByKind: Record<string, number> = {};
  for (const cell of cells.i) {
    if (cells.h[cell] < 20) continue;
    land.ruralPeople += Math.max(0, cells.pop[cell] ?? 0) * rate;
    const budget = world.pack.landUse?.cells[cell];
    if (!budget) continue;
    land.landUseCells++;
    land.cultivatedHa += budget.allocatedAreaHa ?? 0;
    for (const patch of budget.patches ?? []) {
      if (patch.kind === "pasture") land.pastureHa += patch.areaHa;
      if (patch.kind === "wood_pasture") land.woodPastureHa += patch.areaHa;
      if (patch.convertedForestAreaHa > 0)
        convertedForestHaByKind[patch.kind] = (convertedForestHaByKind[patch.kind] ?? 0) + patch.convertedForestAreaHa;
    }
  }
  const species = getGoods()
    .filter(good => husbandry.isGrazedLivestockGood(good.name))
    .map(good => {
      const row = {
        species: good.name,
        heads: 0,
        supportedHeads: 0,
        demandTargetHeads: 0,
        trackedCells: 0,
        cohorts: { young: 0, breeding: 0, old: 0 },
        settledCells: 0,
        settledCohorts: { young: 0, breeding: 0, old: 0 }
      };
      for (const cell of cells.i) {
        if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
        const herd = table[`${cell}:${good.name}`];
        const heads = herd ? herd.young + herd.breeding + herd.old : 0;
        const supported = getDomesticatedCarryingCapacity(cell, good, 0);
        row.heads += heads;
        row.supportedHeads += supported;
        row.demandTargetHeads += husbandry.getLivestockHerdTargets(world, cell)[good.name] ?? 0;
        if (!herd) continue;
        row.trackedCells++;
        for (const k of ["young", "breeding", "old"] as const) row.cohorts[k] += herd[k];
        if (supported > 0 && heads >= 0.9 * supported && heads <= 1.1 * supported) {
          row.settledCells++;
          for (const k of ["young", "breeding", "old"] as const) row.settledCohorts[k] += herd[k];
        }
      }
      return row;
    });
  samples.push({ label, date: [host.simulation.currentYear, host.simulation.currentMonth], land, convertedForestHaByKind, species });
}

try {
  await host.loadArchive(new Uint8Array(bytes));
  try {
    snapshot("loaded");
  } catch (error) {
    samples.push({ label: "loaded", error: String(error) });
  }
  await host.prepare();
  snapshot("prepared");
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    if (sampleMonths.has(m) || m === months) snapshot(`month ${m}`);
    console.error(`[world-birth] ${m}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        notes: [
          "Real animals in inhabited land cells. demandTargetHeads is the source-based policy target (livestockHerdTargetPolicy.ts); supportedHeads limits it by forage, feed history and herders.",
          "settled* covers herds within 0.9..1.1 of their supported size.",
          "convertedForestHaByKind is the cleared forest inside current land-use patches."
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

/**
 * E1 §7.52 audit: splits the gap between planned and committed pasture into the planning stages of
 * DevelopmentPotential — ecological ceiling, herder staffing, and the annual adjustment toward the plan —
 * and the land ledger's own shortfall, summed over inhabited land cells.
 * Usage: auditPastureCommitment.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getHusbandryRequiredWorkers, getHusbandryWorkers } from "../src/extensions/economy/context/agriculture";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { PASTURE_ANNUAL_ADJUSTMENT } from "../src/extensions/economy/generators/developmentPotential";
import {
  calculateDesiredPastureAreaHectares,
  calculateHusbandryDemand,
  getGrazedFallowPastureEquivalentHectares,
  getHusbandryWorkerFactor,
  getLivestockHerdTargets,
  getPastureHectaresPerHead
} from "../src/extensions/economy/generators/husbandry";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "36"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 0)
  throw new Error("Usage: auditPastureCommitment.mts <archive.fmg> <output.json> [months]");
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  for (let month = 1; month <= months; month++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    console.error(`[pasture] ${month}/${months}`);
  }
  const world = getWorldContext();
  const cells = world.pack.cells;
  const assigned = getHusbandryWorkers();
  const required = getHusbandryRequiredWorkers();
  const totals = {
    cells: 0,
    needHa: 0,
    desiredHa: 0,
    staffedHa: 0,
    committedHa: 0,
    nextPlanHa: 0,
    shortfallCells: 0,
    shortfallGapHa: 0,
    understaffedCells: 0,
    requiredWorkers: 0,
    assignedWorkers: 0,
    careWorkers: 0,
    hayWorkers: 0,
    otherWorkers: 0
  };
  // Cells by which stage holds most of their gap (desired - committed).
  const bound = { staffing: { cells: 0, gapHa: 0 }, lag: { cells: 0, gapHa: 0 }, ledger: { cells: 0, gapHa: 0 } };
  for (const cell of cells.i) {
    if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
    const targets = getLivestockHerdTargets(world, cell);
    if (!Object.keys(targets).length) continue;
    totals.cells++;
    const fallow = getGrazedFallowPastureEquivalentHectares(world, cell);
    const gross = Object.entries(targets).reduce((s, [n, h]) => s + h * getPastureHectaresPerHead(world, cell, n), 0);
    const desired = calculateDesiredPastureAreaHectares(world, cell, true);
    const factor = (required[cell] ?? 0) > 0 ? getHusbandryWorkerFactor(cell) : 1;
    const staffed = desired * factor;
    const ledger = world.pack.landUse?.cells[cell];
    const committed =
      ledger?.patches.filter(p => p.kind === "pasture" || p.kind === "wood_pasture").reduce((s, p) => s + p.areaHa, 0) ??
      0;
    const shortfall = Boolean(ledger?.diagnostics.includes("livestock-land-shortfall"));
    totals.needHa += Math.max(0, gross - fallow);
    totals.desiredHa += desired;
    totals.staffedHa += staffed;
    totals.committedHa += committed;
    totals.nextPlanHa += committed + (staffed - committed) * PASTURE_ANNUAL_ADJUSTMENT;
    if (factor < 0.999) totals.understaffedCells++;
    if (shortfall) {
      totals.shortfallCells++;
      totals.shortfallGapHa += Math.max(0, staffed - committed);
    }
    const demand = calculateHusbandryDemand(world, cell);
    totals.requiredWorkers += required[cell] ?? 0;
    totals.assignedWorkers += assigned[cell] ?? 0;
    totals.careWorkers += demand.careWorkers ?? 0;
    totals.hayWorkers += demand.hayWorkers ?? 0;
    totals.otherWorkers += (demand.requiredWorkers ?? 0) - (demand.careWorkers ?? 0) - (demand.hayWorkers ?? 0);
    const staffGap = desired - staffed;
    const lagGap = Math.max(0, staffed - committed);
    const gap = desired - committed;
    if (gap <= desired * 0.01) continue;
    const key = shortfall && lagGap > staffGap ? "ledger" : staffGap >= lagGap ? "staffing" : "lag";
    bound[key].cells++;
    bound[key].gapHa += gap;
  }
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        annualAdjustment: PASTURE_ANNUAL_ADJUSTMENT,
        notes: [
          "needHa: target herd pasture after grazed fallow, uncapped. desiredHa: capped by the ecological ceiling (planning).",
          "staffedHa = desiredHa x husbandry worker factor. committedHa: ledger pasture + wood pasture.",
          "nextPlanHa: committed moved by the annual adjustment toward staffed. Ledger shortfall: livestock-land-shortfall diagnostic."
        ],
        totals,
        boundBy: bound
      },
      null,
      2
    )}\n`
  );
} finally {
  host.dispose();
}

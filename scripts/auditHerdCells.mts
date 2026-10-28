/**
 * E1-5 audit: per-cell grazed herds against the supported herd each January, to find which cells stay
 * far below it. Optionally saves the final archive. Usage:
 * auditHerdCells.mts <archive.fmg> <output.json> [months] [final-archive.fmg]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getOrCreateFaunaStockTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods } from "../src/extensions/economy/context/trade";
import { getDomesticatedCarryingCapacity } from "../src/extensions/economy/generators/faunaPopulation";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "144", finalArchive] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 0)
  throw new Error("Usage: auditHerdCells.mts <archive.fmg> <output.json> [months] [final-archive.fmg]");
const SPECIES = ["Cattle", "Horses"];
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  // cells[species][cell] = yearly [young, breeding, old, supported]
  const cells: Record<string, Record<number, number[][]>> = Object.fromEntries(SPECIES.map(name => [name, {}]));
  const years: number[] = [];
  function snapshot() {
    const world = getWorldContext();
    const pack = world.pack.cells;
    const table = getOrCreateFaunaStockTable() ?? {};
    years.push(host.simulation.currentYear);
    for (const good of getGoods().filter(good => SPECIES.includes(good.name)))
      for (const cell of pack.i) {
        if (pack.h[cell] < 20 || !(pack.pop[cell] > 0)) continue;
        const herd = table[`${cell}:${good.name}`];
        const supported = getDomesticatedCarryingCapacity(cell, good, 0);
        if (!herd && !(supported > 0)) continue;
        const rows = (cells[good.name][cell] ??= []);
        while (rows.length < years.length - 1) rows.push([0, 0, 0, 0]);
        rows.push([herd?.young ?? 0, herd?.breeding ?? 0, herd?.old ?? 0, supported].map(v => Math.round(v * 10) / 10));
      }
  }
  snapshot();
  for (let month = 1; month <= months; month++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    if (month % 12 === 0) snapshot();
    console.error(`[herd-cells] ${month}/${months}`);
  }
  if (finalArchive) writeFileSync(finalArchive, await host.saveArchive());
  writeFileSync(
    output,
    `${JSON.stringify({
      schemaVersion: 1,
      inputSha256: createHash("sha256").update(bytes).digest("hex"),
      months,
      worldSettings: sim.worldSettings,
      notes: ["Per inhabited land cell and year (January): [young, breeding, old, supportedHeads] in real animals."],
      years,
      cells
    })}\n`
  );
} finally {
  host.dispose();
}

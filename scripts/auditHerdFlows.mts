/**
 * E1-5 audit: where each grazed species' annual herd change goes. Herd cohorts are summed before and
 * after every tick step, so each step's net change (births, aging, sales, slaughter, adjustments) is
 * attributed to the innermost step that ran. Usage: auditHerdFlows.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getOrCreateFaunaStockTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods } from "../src/extensions/economy/context/trade";
import { getDomesticatedCarryingCapacity } from "../src/extensions/economy/generators/faunaPopulation";
import * as husbandry from "../src/extensions/economy/generators/husbandry";
import { setTickStepObserver } from "../src/generators/tickProfiler";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "36"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 1)
  throw new Error("Usage: auditHerdFlows.mts <archive.fmg> <output.json> [months]");
const COHORTS = ["young", "breeding", "old"] as const;
type Totals = Record<string, Record<(typeof COHORTS)[number], number>>;
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  const species = getGoods()
    .filter(good => husbandry.isGrazedLivestockGood(good.name))
    .map(good => good.name);
  const suffixes = species.map(name => [`:${name}`, name] as const);
  function totals(): Totals {
    const out: Totals = Object.fromEntries(species.map(name => [name, { young: 0, breeding: 0, old: 0 }]));
    const table = getOrCreateFaunaStockTable() ?? {};
    for (const key in table) {
      const hit = suffixes.find(([suffix]) => key.endsWith(suffix));
      if (!hit) continue;
      const herd = table[key];
      const row = out[hit[1]];
      row.young += herd.young;
      row.breeding += herd.breeding;
      row.old += herd.old;
    }
    return out;
  }
  // flows[year][label][species][cohort]
  type Flows = Record<string, Totals>;
  let flows: Flows = {};
  const years: { year: number; opening: Totals; closing: Totals; capacity: Record<string, number>; flows: Flows }[] = [];
  const stack: string[] = [];
  let last = totals();
  function attribute() {
    const now = totals();
    const label = stack.at(-1) ?? "(between steps)";
    for (const name of species)
      for (const cohort of COHORTS) {
        const delta = now[name][cohort] - last[name][cohort];
        if (Math.abs(delta) < 1e-6) continue;
        flows[label] ??= Object.fromEntries(species.map(n => [n, { young: 0, breeding: 0, old: 0 }]));
        flows[label][name][cohort] += delta;
      }
    last = now;
  }
  setTickStepObserver({
    enter(label) {
      attribute();
      stack.push(label);
    },
    exit() {
      attribute();
      stack.pop();
    }
  });
  function capacity() {
    const world = getWorldContext();
    const cells = world.pack.cells;
    const out: Record<string, number> = {};
    for (const good of getGoods().filter(good => species.includes(good.name))) {
      let sum = 0;
      for (const cell of cells.i)
        if (cells.h[cell] >= 20 && cells.pop[cell] > 0) sum += getDomesticatedCarryingCapacity(cell, good, 0);
      out[good.name] = sum;
    }
    return out;
  }
  let opening = totals();
  for (let month = 1; month <= months; month++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    attribute();
    if (month % 12 === 0 || month === months) {
      const closing = totals();
      years.push({ year: host.simulation.currentYear, opening, closing, capacity: capacity(), flows });
      opening = closing;
      flows = {};
    }
    console.error(`[herd-flows] ${month}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        worldSettings: sim.worldSettings,
        notes: ["Flows are net cohort changes per innermost tick step over each 12-month interval (real animals)."],
        years
      },
      null,
      2
    )}\n`
  );
} finally {
  setTickStepObserver(null);
  host.dispose();
}

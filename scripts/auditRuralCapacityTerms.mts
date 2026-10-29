/**
 * Rural subsistence capacity split into its terms (subsistenceCapacity.ts reconcile): terrain cap,
 * non-agricultural capacity, and the field term = cultivable ha x sown share x yield / need x labour
 * feasibility. Writes per-cell columns at the prepared state and after [months], so two commits can
 * be compared cell by cell. Read-only. Usage: auditRuralCapacityTerms.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getCultivableArea, getRuralFoodCapacity, getYieldPerArea } from "../src/extensions/economy/context/agriculture";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "12"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 0)
  throw new Error("Usage: auditRuralCapacityTerms.mts <archive.fmg> <output.json> [months]");

const bytes = readFileSync(input);
const host = createNodeSimulationHost();
const samples: Record<string, unknown> = {};
const round = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 1000) / 1000;

function snapshot(label: string) {
  const cells = getWorldContext().pack.cells;
  const ids = Array.from(cells.i).filter(cell => cells.h[cell] >= 20);
  const column = (values: ArrayLike<number> | undefined) => ids.map(cell => round(values?.[cell] ?? 0));
  samples[label] = {
    date: [host.simulation.currentYear, host.simulation.currentMonth],
    ids,
    pop: column(cells.pop),
    terrainCapacity: column(cells.capacity),
    subsistenceCapacity: column(cells.subsistenceCapacity),
    nonAgricultural: column(cells.subsistenceNonAgriculturalCapacity),
    cultivableHa: column(getCultivableArea()),
    yieldKgHa: column(getYieldPerArea()),
    ruralFoodCapacity: column(getRuralFoodCapacity()),
    wetPastoralDietShare: column(cells.wetPastoralDietShare)
  };
}

try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  snapshot("prepared");
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    console.error(`[rural-capacity] ${m}/${months}`);
  }
  if (months > 0) snapshot(`month ${months}`);
  writeFileSync(
    output,
    `${JSON.stringify({
      schemaVersion: 1,
      inputSha256: createHash("sha256").update(bytes).digest("hex"),
      months,
      notes: ["Land cells; capacities in rural population points. Field term = subsistenceCapacity - nonAgricultural below the terrain cap."],
      samples
    })}\n`
  );
} finally {
  host.dispose();
}

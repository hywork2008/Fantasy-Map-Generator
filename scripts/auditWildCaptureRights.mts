/**
 * Wild-capture C1 audit (docs/plan/wild-animal-capture-domestication.md §6): share of settled land
 * cells, horse target and horse shortfall where peasants may capture wild horses, by right, state form
 * and culture type. Shortfall counts cells failing the sale condition (heads + natural increase <=
 * target). Read-only. Usage: auditWildCaptureRights.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getOrCreateFaunaStockTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods } from "../src/extensions/economy/context/trade";
import {
  getAnnualHerdRenewal,
  getDomesticatedCarryingCapacity
} from "../src/extensions/economy/generators/faunaPopulation";
import {
  getCellWildCaptureRight,
  isWildCaptureAllowed
} from "../src/extensions/economy/generators/wildCaptureRightsPolicy";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "0"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 0)
  throw new Error("Usage: auditWildCaptureRights.mts <archive.fmg> <output.json> [months]");
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
type Row = { cells: number; allowedCells: number; target: number; allowedTarget: number; shortfall: number; allowedShortfall: number };
const emptyRow = (): Row => ({ cells: 0, allowedCells: 0, target: 0, allowedTarget: 0, shortfall: 0, allowedShortfall: 0 });
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
  }
  const world = getWorldContext();
  const cells = world.pack.cells;
  const table = getOrCreateFaunaStockTable() ?? {};
  const horses = getGoods().find(good => good.name === "Horses");
  if (!horses) throw new Error("No Horses good");
  const total = emptyRow();
  const byRight: Record<string, Row> = {};
  const byForm: Record<string, Row> = {};
  const byCultureType: Record<string, Row> = {};
  const byState: Record<string, Row & { form: string; cultureType: string }> = {};
  for (const cell of cells.i) {
    if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
    const right = getCellWildCaptureRight(cell);
    const allowed = isWildCaptureAllowed(right);
    const stateId = cells.state?.[cell] ?? 0;
    const state = world.pack.states?.[stateId];
    const form = stateId ? state?.form || "Monarchy" : "(none)";
    const cultureType = world.pack.cultures?.[cells.culture?.[cell]]?.type ?? "Generic";
    const herd = table[`${cell}:Horses`];
    const heads = herd ? herd.young + herd.breeding + herd.old : 0;
    const target = getDomesticatedCarryingCapacity(cell, horses, 0);
    const growth = herd ? (getAnnualHerdRenewal(cell, horses)?.naturalNetHeads ?? 0) : 0;
    const shortfall = target > 0 && heads + growth <= target ? Math.max(0, target - heads) : 0;
    const stateKey = `${stateId} ${state?.name ?? ""}`.trim();
    byState[stateKey] ??= {
      ...emptyRow(),
      form,
      cultureType: world.pack.cultures?.[state?.culture ?? 0]?.type ?? "Generic"
    };
    for (const row of [
      total,
      (byRight[right] ??= emptyRow()),
      (byForm[form] ??= emptyRow()),
      (byCultureType[cultureType] ??= emptyRow()),
      byState[stateKey]
    ]) {
      row.cells++;
      row.target += target;
      row.shortfall += shortfall;
      if (!allowed) continue;
      row.allowedCells++;
      row.allowedTarget += target;
      row.allowedShortfall += shortfall;
    }
  }
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        date: [host.simulation.currentYear, host.simulation.currentMonth],
        historicalPeriod: world.options?.historicalPeriod ?? null,
        notes: [
          "Settled land cells only. target is the supported grazed horse herd (real animals).",
          "shortfall = target - heads in cells failing the sale condition (heads + natural increase <= target)."
        ],
        total,
        byRight,
        byForm,
        byCultureType,
        byState
      },
      null,
      1
    )}\n`
  );
} finally {
  host.dispose();
}

/**
 * Herd restocking P1 audit (docs/plan/livestock-herd-restocking-purchase.md §5): for each market and
 * grazed species, the spring shortfall of cells below the restock threshold, the market's live stock,
 * the year's herd dispatch into it, its price and the rural wallet. Read-only; behaviour unchanged.
 * Usage: auditHerdRestock.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getLivestockDispatchTable, getMarketCellColumn, getOrCreateFaunaStockTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { getAnnualHerdRenewal, getDomesticatedCarryingCapacity } from "../src/extensions/economy/generators/faunaPopulation";
import * as husbandry from "../src/extensions/economy/generators/husbandry";
import { animalsPerMarketHead } from "../src/extensions/economy/generators/liveAnimalScale";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "40"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 1)
  throw new Error("Usage: auditHerdRestock.mts <archive.fmg> <output.json> [months]");
/** Candidate threshold from the design (§3.1); cells below it would buy. */
const RESTOCK_THRESHOLD = 0.9;
const SPRING_MONTHS = [4, 5];
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  const goods = getGoods().filter(good => husbandry.isGrazedLivestockGood(good.name));
  // dispatched[market:species] = real heads dispatched over the trailing 12 months
  const dispatchedByMonth: Record<string, number>[] = [];
  function recordDispatch() {
    const column = getMarketCellColumn();
    const row: Record<string, number> = {};
    for (const [key, receipt] of Object.entries(getLivestockDispatchTable() ?? {})) {
      const [cell, species] = key.split(":");
      if (!goods.some(good => good.name === species)) continue;
      const heads = (receipt as { observation?: { heads?: number } }).observation?.heads ?? 0;
      const id = `${column[Number(cell)]}:${species}`;
      row[id] = (row[id] ?? 0) + heads;
    }
    dispatchedByMonth.push(row);
    if (dispatchedByMonth.length > 12) dispatchedByMonth.shift();
  }
  const samples: unknown[] = [];
  function snapshot() {
    const world = getWorldContext();
    const cells = world.pack.cells;
    const column = getMarketCellColumn();
    const table = getOrCreateFaunaStockTable() ?? {};
    const markets = new Map(getMarkets().map(market => [market.i, market]));
    const rows: Record<string, Record<string, number>> = {};
    for (const good of goods)
      for (const cell of cells.i) {
        if (cells.h[cell] < 20 || !(cells.pop[cell] > 0)) continue;
        const marketId = column[cell];
        if (!marketId) continue;
        const herd = table[`${cell}:${good.name}`];
        const heads = herd ? herd.young + herd.breeding + herd.old : 0;
        const supported = getDomesticatedCarryingCapacity(cell, good, 0);
        const row = (rows[`${marketId}:${good.name}`] ??= {
          supportedHeads: 0,
          heads: 0,
          shortfallHeads: 0,
          shortCells: 0,
          sellingCells: 0
        });
        row.supportedHeads += supported;
        row.heads += heads;
        if (supported > 0 && heads < supported * RESTOCK_THRESHOLD) {
          row.shortfallHeads += supported * RESTOCK_THRESHOLD - heads;
          row.shortCells++;
        }
        if (herd && heads + (getAnnualHerdRenewal(cell, good)?.naturalNetHeads ?? 0) > supported) row.sellingCells++;
      }
    for (const [id, row] of Object.entries(rows)) {
      const [marketId, species] = id.split(":");
      const market = markets.get(Number(marketId));
      const good = goods.find(good => good.name === species)!;
      const scale = animalsPerMarketHead(species);
      const marketGood = market?.goods[good.i];
      row.marketStockHeads = (marketGood?.stock ?? 0) * scale;
      row.pricePerHead = (marketGood?.price ?? 0) / scale;
      row.dispatchedHeadsLast12Months = dispatchedByMonth.reduce((sum, month) => sum + (month[id] ?? 0), 0);
      row.ruralWallet = market?.foodLedger?.ruralHouseholdWealth ?? 0;
    }
    samples.push({ date: [host.simulation.currentYear, host.simulation.currentMonth], markets: rows });
  }
  for (let month = 1; month <= months; month++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    recordDispatch();
    if (SPRING_MONTHS.includes(host.simulation.currentMonth)) snapshot();
    console.error(`[herd-restock] ${month}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        restockThreshold: RESTOCK_THRESHOLD,
        worldSettings: sim.worldSettings,
        notes: [
          "Rows are market:species. Heads are real animals; shortfall is threshold x supported minus heads in cells below it.",
          "marketStockHeads is the market's live stock at the sample; dispatched heads sum the herd sales of the trailing 12 months.",
          "ruralWallet is the market's rural household cash (shared by all goods)."
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

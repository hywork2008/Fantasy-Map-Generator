/** Read-only food boundaries. Missing ledgers and unmeasured flows are never consumption zeroes. */
import type { WorldContext } from "../../../context/worldContext";
import type { CumulativeCellFoodFlow } from "../context/cellTables";
import type { Good } from "./goodsGeneratorTypes";
import type { Market } from "./marketTypes";
import type { WinterSlaughterState } from "./winterSlaughter";
import { observeWinterSlaughter } from "./winterSlaughterObservation";

export function observeFoodSystem(input: {
  world: WorldContext;
  markets: readonly Market[];
  goods: readonly Good[];
  marketByCell: ArrayLike<number>;
  ruralFoodStock: ArrayLike<number>;
  cellFoodFlows: Readonly<Record<number, CumulativeCellFoodFlow>> | null;
  winterSlaughter?: WinterSlaughterState | null;
}) {
  const { world, markets, goods, marketByCell, ruralFoodStock, cellFoodFlows } = input;
  const rate = world.populationRate ?? 1000;
  const urbanization = world.urbanization ?? 1;
  const byMarket = new Map(markets.map(market => [market.i, market]));
  const reasonFor = (marketId: number | undefined) =>
    !marketId
      ? ("noMarketAssignment" as const)
      : !byMarket.has(marketId)
        ? ("missingMarket" as const)
        : !byMarket.get(marketId)!.foodLedger
          ? ("missingFoodLedger" as const)
          : null;
  const rural = { total: 0, covered: 0, uncovered: 0 };
  const urban = { total: 0, covered: 0, uncovered: 0 };
  const uncoveredCells = [];
  const cellMembership = [];
  for (const cellId of world.pack.cells.i) {
    const cells = world.pack.cells;
    if (cells.h[cellId] < 20) continue;
    const people = Math.max(0, cells.pop[cellId] ?? 0) * rate;
    if (!(people > 0)) continue;
    rural.total += people;
    const marketId = marketByCell[cellId];
    const reason = reasonFor(marketId);
    cellMembership.push({ cellId, marketId: marketId ?? null, stateId: cells.state?.[cellId] ?? null, people });
    if (!reason) {
      rural.covered += people;
      continue;
    }
    rural.uncovered += people;
    uncoveredCells.push({
      cellId,
      people,
      marketId: marketId ?? null,
      stateId: cells.state?.[cellId] ?? null,
      provinceId: cells.province?.[cellId] ?? null,
      burgId: cells.burg?.[cellId] ?? null,
      reason,
      householdStock: cellId < ruralFoodStock.length ? ruralFoodStock[cellId] : null
    });
  }
  const uncoveredBurgs = [];
  for (const burg of world.pack.burgs) {
    if (!burg?.i || burg.removed) continue;
    const people = Math.max(0, burg.population ?? 0) * rate * urbanization;
    if (!(people > 0)) continue;
    urban.total += people;
    const reason = reasonFor(burg.market);
    if (!reason) {
      urban.covered += people;
      continue;
    }
    urban.uncovered += people;
    uncoveredBurgs.push({
      burgId: burg.i,
      cellId: burg.cell,
      people,
      marketId: burg.market ?? null,
      stateId: burg.state ?? null,
      reason,
      foodReserve: burg.foodReserve ?? null
    });
  }
  const byReason: Record<string, { ruralPeople: number; urbanPeople: number }> = {};
  for (const row of uncoveredCells) {
    byReason[row.reason] ??= { ruralPeople: 0, urbanPeople: 0 };
    const target = byReason[row.reason];
    target.ruralPeople += row.people;
  }
  for (const row of uncoveredBurgs) {
    byReason[row.reason] ??= { ruralPeople: 0, urbanPeople: 0 };
    const target = byReason[row.reason];
    target.urbanPeople += row.people;
  }
  const meat = observeWinterSlaughter(input.winterSlaughter ?? null);
  return {
    winterSlaughter: meat,
    coverage: { rural, urban, byReason, uncoveredCells, uncoveredBurgs, cellMembership },
    // These are source-cell harvest counters, not market inflows. Processed is a raw-input unit.
    cellFoodFlows:
      cellFoodFlows === null
        ? null
        : Object.entries(cellFoodFlows).map(([id, flow]) => ({
            goodId: +id,
            name: goods.find(good => good.i === +id)?.name ?? null,
            ...flow
          })),
    markets: markets.map(market => ({
      marketId: market.i,
      centerBurgId: market.centerBurgId,
      hasFoodLedger: Boolean(market.foodLedger),
      processing: structuredClone(market.foodProcessingLedger ?? null)
    })),
    // Only the explicit carcass ledger has a meat mass; legacy catalog units remain unknown.
    livestockMeatKilograms: meat?.totals.edibleRecoveredKg ?? null
  };
}

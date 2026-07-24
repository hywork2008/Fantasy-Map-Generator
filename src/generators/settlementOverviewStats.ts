import type { PackedGraph } from "../types/PackedGraph";

export interface SettlementOverviewStats {
  /** Potential capacity on politically unclaimed cells (`state === 0`). */
  unclaimedCapacity: number;
  /** Potential capacity on cells with no current rural settlement. */
  unsettledCapacity: number;
  /** Living people currently under an effective state owner. */
  governedPopulation: number;
}

/**
 * World-facing settlement measures that intentionally stay separate from the
 * state table's historical aggregate fields. This makes zero-owner cells
 * observable before Phase 2 changes political statistics.
 */
export function collectSettlementOverviewStats(
  pack: PackedGraph,
  populationRate: number,
  urbanization: number
): SettlementOverviewStats {
  const rate = populationRate || 1;
  const urbanScale = rate * (urbanization || 1);
  let unclaimedCapacity = 0;
  let unsettledCapacity = 0;
  let governedPopulation = 0;
  const { cells } = pack;

  for (let index = 0; index < cells.i.length; index++) {
    const cellId = cells.i[index];
    const capacity = cells.capacity?.[cellId] ?? 0;
    const population = cells.pop?.[cellId] ?? 0;
    const stateId = cells.state?.[cellId] ?? 0;
    if (stateId === 0) unclaimedCapacity += capacity * rate;
    if (population <= 0) unsettledCapacity += capacity * rate;
    if (stateId !== 0) governedPopulation += population * rate;
  }

  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed || !burg.state) continue;
    governedPopulation += (burg.population ?? 0) * urbanScale;
  }

  return { unclaimedCapacity, unsettledCapacity, governedPopulation };
}

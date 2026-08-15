import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";

export interface SettlementOverviewStats {
  /** Potential capacity on politically unclaimed cells (`state === 0`). */
  unclaimedCapacity: number;
  /** Potential capacity on cells with no current rural settlement. */
  unsettledCapacity: number;
  /** Living people currently under an effective state owner. */
  governedPopulation: number;
}

/** Display-only Neutrals-row totals. Never write these back onto `states[0]`. */
export interface IndependentBurgStats {
  count: number;
  cells: number;
  /** Raw pack cell area (pass through `getArea()` before display). */
  area: number;
  /** Raw rural pop on independent burg cells (`cells.pop`). */
  rural: number;
  /** Raw urban pop of independent burgs (`burg.population`). */
  urban: number;
}

const EMPTY_INDEPENDENT_BURG_STATS: IndependentBurgStats = {
  count: 0,
  cells: 0,
  area: 0,
  rural: 0,
  urban: 0
};

function isIndependentBurg(burg: Burg | 0 | undefined): burg is Burg {
  return !!(burg?.i && !burg.removed && !burg.state);
}

/**
 * Burgs whose political owner is still unclaimed land (`burg.state === 0`).
 * Display-only: never write this back onto `states[0].burgs`, which stays a
 * national aggregate and must remain 0.
 */
export function countIndependentBurgs(burgs: PackedGraph["burgs"] | undefined): number {
  let count = 0;
  for (const burg of burgs ?? []) {
    if (isIndependentBurg(burg)) count += 1;
  }
  return count;
}

/**
 * Area and population of the cells those independent burgs sit on.
 * Same rural/urban split as `States.collectStatistics`, restricted to burg
 * cells so Neutrals does not absorb the rest of unclaimed wilderness.
 */
export function collectIndependentBurgStats(pack: PackedGraph | undefined): IndependentBurgStats {
  if (!pack) return { ...EMPTY_INDEPENDENT_BURG_STATS };

  const { burgs, cells } = pack;
  let count = 0;
  let area = 0;
  let rural = 0;
  let urban = 0;

  for (const burg of burgs ?? []) {
    if (!isIndependentBurg(burg)) continue;
    count += 1;
    const cellId = burg.cell;
    if (cellId != null) {
      area += cells?.area?.[cellId] ?? 0;
      rural += cells?.pop?.[cellId] ?? 0;
    }
    urban += burg.population ?? 0;
  }

  return { count, cells: count, area, rural, urban };
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

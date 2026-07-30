import {
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getMineralGeologicalProvinces,
  getVolcanicAshOperations,
  getWorldContext,
  setVolcanicAshOperations
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";
import type { VolcanicAshOperation } from "./volcanicAshOperationsTypes";

export type { VolcanicAshOperation } from "./volcanicAshOperationsTypes";

/** Base headcount an ash works needs even at minimal site quality. */
const REQUIRED_WORKERS_BASE = 3;
/** Additional headcount per neighbor cell touching the volcanic province. */
const REQUIRED_WORKERS_PER_NEIGHBOR = 4;
const BASE_ANNUAL_ASH_TONS_PER_WORKER = 6;

export interface VolcanicAshCandidate {
  burgId: number;
  /** Count of the burg's immediate neighbor cells belonging to the "volcanic" geological province. */
  volcanicNeighborCount: number;
}

/**
 * Headcount needed to run an ash works at full capacity (docs/plan/urban-construction-industry.md
 * §3.4, Phase 3). Reused by `produceMonth()` and by `basicEmployment.ts`'s annual reconciliation.
 */
export function getVolcanicAshRequiredWorkers(candidate: Pick<VolcanicAshCandidate, "volcanicNeighborCount">): number {
  return REQUIRED_WORKERS_BASE + candidate.volcanicNeighborCount * REQUIRED_WORKERS_PER_NEIGHBOR;
}

/**
 * Candidate site scoring: unlike Stone/Marble quarries (a common, continuous terrain fact —
 * docs/plan/urban-construction-industry.md §3.2 decision D3), Volcanic Ash is deliberately rare
 * (mineralResources.ts's "volcanic" GeologicalProvinceKind is a low-probability, very-high-
 * elevation carve-out), so siting reads the real geological province cell set instead of
 * re-deriving a height threshold. Pure derived data — reads pack.burgs/cells and the static
 * geological provinces, mutates nothing.
 */
export function computeVolcanicAshCandidates(): VolcanicAshCandidate[] {
  const { pack } = getWorldContext();
  if (!pack.burgs) return [];

  const volcanicCells = new Set(
    getMineralGeologicalProvinces()
      .filter(province => province.kind === "volcanic")
      .flatMap(province => province.cells)
  );
  if (!volcanicCells.size) return [];

  const candidates: VolcanicAshCandidate[] = [];
  for (const burg of pack.burgs) {
    if (!burg.i || burg.removed) continue;

    const neighbors = pack.cells.c[burg.cell] ?? [];
    const volcanicNeighborCount = neighbors.filter(n => volcanicCells.has(n)).length;
    if (volcanicNeighborCount <= 0) continue;

    candidates.push({ burgId: burg.i, volcanicNeighborCount });
  }
  return candidates;
}

/**
 * Persistent, Burg-anchored Volcanic Ash sites (docs/plan/urban-construction-industry.md §3.4).
 * Mirrors QuarryOperationsModule's generate()/clear()/produceMonth() shape; no reserve depletion,
 * matching the quarry precedent — scarcity here comes from how few sites exist, not from a
 * per-site exhaustible reserve.
 */
export class VolcanicAshOperationsModule {
  generate(): void {
    const marketColumn = getMarketCellColumn();
    const marketById = new Set(getMarkets().map(market => market.i));
    const previousByBurg = new Map(getVolcanicAshOperations().map(operation => [operation.burgId, operation]));
    const operations: VolcanicAshOperation[] = [];

    for (const candidate of computeVolcanicAshCandidates()) {
      const burg = getWorldContext().pack.burgs[candidate.burgId];
      if (!burg || burg.removed) continue;
      const marketId = marketColumn[burg.cell] || burg.market || 0;
      if (!marketId || !marketById.has(marketId)) continue;

      const previous = previousByBurg.get(candidate.burgId);
      operations.push({
        i: operations.length + 1,
        burgId: candidate.burgId,
        marketId,
        ashWorkers: previous?.ashWorkers ?? getVolcanicAshRequiredWorkers(candidate),
        volcanicNeighborCount: candidate.volcanicNeighborCount,
        active: true
      });
    }

    setVolcanicAshOperations(operations);
  }

  clear(): void {
    setVolcanicAshOperations([]);
  }

  /** Settles one Economy production month into market stock, mirroring QuarryOperations.produceMonth(). */
  produceMonth(): void {
    const ashGood = getGoods().find(good => good.name.toLowerCase() === "volcanic ash");
    if (!ashGood || !isGoodEnabled(ashGood)) return;

    for (const operation of getVolcanicAshOperations()) {
      if (!operation.active) continue;

      const requiredWorkers = getVolcanicAshRequiredWorkers(operation);
      const extractionFactor = Math.max(0, Math.min(1, operation.ashWorkers / requiredWorkers));
      const monthlyAsh = (BASE_ANNUAL_ASH_TONS_PER_WORKER * operation.ashWorkers * extractionFactor) / 12;
      Markets.addMineSupply(operation.marketId, ashGood.i, monthlyAsh);
    }
  }
}

export const VolcanicAshOperations = new VolcanicAshOperationsModule();

import { getBiomeKey } from "../../../data/biomeCatalog";
import {
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getMineralGeologicalProvinces,
  getVolcanicOperations,
  getWorldContext,
  setVolcanicOperations
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";
import type { VolcanicOperation } from "./volcanicOperationsTypes";

export type { VolcanicOperation } from "./volcanicOperationsTypes";

/** Base headcount a volcanic works site needs even at minimal site quality. */
const REQUIRED_WORKERS_BASE = 3;
/** Additional headcount per neighbor cell touching the volcanic province (drives Ash capacity). */
const REQUIRED_WORKERS_PER_NEIGHBOR = 4;
const BASE_ANNUAL_ASH_TONS_PER_WORKER = 6;
/** Lower than Ash: Sulfur only comes from the barren/rocky share of the ring, not the whole site. */
const BASE_ANNUAL_SULFUR_TONS_PER_WORKER = 4;
/** Obsidian is a rare, low-volume luxury commodity — deliberately the smallest yield of the three. */
const BASE_ANNUAL_OBSIDIAN_TONS_PER_WORKER = 1;

export interface VolcanicSiteCandidate {
  burgId: number;
  /** Count of the burg's immediate neighbor cells belonging to the "volcanic" geological province. */
  ashNeighborCount: number;
  /** Of those, the ones whose biome is lavaField or volcanicBarrens (the barren/rocky core). */
  sulfurNeighborCount: number;
  /** Of those, the ones whose biome is specifically lavaField (cooled lava along a flow). */
  obsidianNeighborCount: number;
}

/**
 * Headcount needed to run a volcanic works at full capacity (docs/plan/volcanic-biome-goods.md
 * §3.3). Reused by `produceMonth()` and by `basicEmployment.ts`'s annual reconciliation. Scales
 * with `ashNeighborCount` only — Sulfur/Obsidian output scale the same shared workforce by their
 * own ratio of that ring instead of adding separate headcount, mirroring how QuarryOperation's
 * single `quarryWorkers` pool feeds both Stone and Marble.
 */
export function getVolcanicRequiredWorkers(candidate: Pick<VolcanicSiteCandidate, "ashNeighborCount">): number {
  return REQUIRED_WORKERS_BASE + candidate.ashNeighborCount * REQUIRED_WORKERS_PER_NEIGHBOR;
}

/**
 * Candidate site scoring: unlike Stone/Marble quarries (a common, continuous terrain fact —
 * docs/plan/urban-construction-industry.md §3.2 decision D3), volcanic terrain is deliberately
 * rare (mineralResources.ts's "volcanic" GeologicalProvinceKind now tracks the real generator-
 * placed volcano biomes — docs/plan/volcanic-biome-goods.md §3.1), so siting reads the real
 * geological province cell set instead of re-deriving a height threshold. Pure derived data —
 * reads pack.burgs/cells and the static geological provinces, mutates nothing.
 */
export function computeVolcanicSiteCandidates(): VolcanicSiteCandidate[] {
  const { pack, biomesData } = getWorldContext();
  if (!pack.burgs) return [];

  const volcanicCells = new Set(
    getMineralGeologicalProvinces()
      .filter(province => province.kind === "volcanic")
      .flatMap(province => province.cells)
  );
  if (!volcanicCells.size) return [];

  const candidates: VolcanicSiteCandidate[] = [];
  for (const burg of pack.burgs) {
    if (!burg.i || burg.removed) continue;

    const neighbors = pack.cells.c[burg.cell] ?? [];
    let ashNeighborCount = 0;
    let sulfurNeighborCount = 0;
    let obsidianNeighborCount = 0;
    for (const neighbor of neighbors) {
      if (!volcanicCells.has(neighbor)) continue;
      ashNeighborCount++;
      const key = getBiomeKey(biomesData, pack.cells.biomeCode?.[neighbor] ?? -1);
      if (key === "lavaField" || key === "volcanicBarrens") sulfurNeighborCount++;
      if (key === "lavaField") obsidianNeighborCount++;
    }
    if (ashNeighborCount <= 0) continue;

    candidates.push({ burgId: burg.i, ashNeighborCount, sulfurNeighborCount, obsidianNeighborCount });
  }
  return candidates;
}

/**
 * Persistent, Burg-anchored volcanic works sites (docs/plan/volcanic-biome-goods.md §3.3).
 * Mirrors QuarryOperationsModule's generate()/clear()/produceMonth() shape — a single shared
 * workforce yielding multiple goods from one site — and, like it, has no reserve depletion:
 * scarcity comes from how few real volcanoes exist on a given map, not a per-site exhaustible
 * reserve.
 */
export class VolcanicOperationsModule {
  generate(): void {
    const marketColumn = getMarketCellColumn();
    const marketById = new Set(getMarkets().map(market => market.i));
    const previousByBurg = new Map(getVolcanicOperations().map(operation => [operation.burgId, operation]));
    const operations: VolcanicOperation[] = [];

    for (const candidate of computeVolcanicSiteCandidates()) {
      const burg = getWorldContext().pack.burgs[candidate.burgId];
      if (!burg || burg.removed) continue;
      const marketId = marketColumn[burg.cell] || burg.market || 0;
      if (!marketId || !marketById.has(marketId)) continue;

      const previous = previousByBurg.get(candidate.burgId);
      operations.push({
        i: operations.length + 1,
        burgId: candidate.burgId,
        marketId,
        // Newly opened sites staff up immediately; annual reconciliation (basicEmployment.ts)
        // pulls this back down toward the Burg's actually-available adults over subsequent years.
        volcanicWorkers: previous?.volcanicWorkers ?? getVolcanicRequiredWorkers(candidate),
        ashNeighborCount: candidate.ashNeighborCount,
        sulfurNeighborCount: candidate.sulfurNeighborCount,
        obsidianNeighborCount: candidate.obsidianNeighborCount,
        active: true
      });
    }

    setVolcanicOperations(operations);
  }

  clear(): void {
    setVolcanicOperations([]);
  }

  /** Settles one Economy production month into market stock, mirroring QuarryOperations.produceMonth(). */
  produceMonth(): void {
    const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));
    const ashGood = goodsByName.get("volcanic ash");
    const sulfurGood = goodsByName.get("sulfur");
    const obsidianGood = goodsByName.get("obsidian");

    for (const operation of getVolcanicOperations()) {
      if (!operation.active) continue;

      const requiredWorkers = getVolcanicRequiredWorkers(operation);
      const extractionFactor = Math.max(0, Math.min(1, operation.volcanicWorkers / requiredWorkers));

      if (ashGood && isGoodEnabled(ashGood)) {
        const monthlyAsh = (BASE_ANNUAL_ASH_TONS_PER_WORKER * operation.volcanicWorkers * extractionFactor) / 12;
        Markets.addMineSupply(operation.marketId, ashGood.i, monthlyAsh);
      }

      if (sulfurGood && isGoodEnabled(sulfurGood) && operation.sulfurNeighborCount > 0) {
        const sulfurRatio = operation.sulfurNeighborCount / operation.ashNeighborCount;
        const monthlySulfur =
          (BASE_ANNUAL_SULFUR_TONS_PER_WORKER * operation.volcanicWorkers * sulfurRatio * extractionFactor) / 12;
        Markets.addMineSupply(operation.marketId, sulfurGood.i, monthlySulfur);
      }

      if (obsidianGood && isGoodEnabled(obsidianGood) && operation.obsidianNeighborCount > 0) {
        const obsidianRatio = operation.obsidianNeighborCount / operation.ashNeighborCount;
        const monthlyObsidian =
          (BASE_ANNUAL_OBSIDIAN_TONS_PER_WORKER * operation.volcanicWorkers * obsidianRatio * extractionFactor) / 12;
        Markets.addMineSupply(operation.marketId, obsidianGood.i, monthlyObsidian);
      }
    }
  }
}

export const VolcanicOperations = new VolcanicOperationsModule();

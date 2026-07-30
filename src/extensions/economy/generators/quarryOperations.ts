import { rn } from "../../hostUtils";
import {
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getQuarryOperations,
  getWorldContext,
  setQuarryOperations
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";
import type { QuarryOperation } from "./quarryOperationsTypes";

/** Mirrors goods-generator.ts's Stone `distribution` height gate (`minHeight(40)`). */
const STONE_QUARRY_MIN_HEIGHT = 40;
/** Mirrors goods-generator.ts's Marble `distribution` height gate (`minHeight(60)`). */
const MARBLE_QUARRY_MIN_HEIGHT = 60;
/** A burg needs at least this share of quarriable neighbor cells to host a quarry. */
const MIN_STONE_RATIO = 0.15;
/** Base headcount a quarry needs even at minimal site quality (hauling, site upkeep). */
const REQUIRED_WORKERS_BASE = 3;
/** Additional headcount per combined stone+marble ratio point to run at full extractionFactor. */
const REQUIRED_WORKERS_PER_RATIO = 12;
const BASE_ANNUAL_STONE_TONS_PER_WORKER = 12;
const BASE_ANNUAL_MARBLE_TONS_PER_WORKER = 3;
/** How much toolsInvestmentStock=1 (a future ConstructionTechInvestment) raises extractionFactor. */
const QUARRY_TECH_BONUS_MAX = 0.3;

export interface QuarryCandidate {
  burgId: number;
  /** Share of the burg's immediate neighbor cells tall/rocky enough for building stone, 0..1. */
  stoneRatio: number;
  /** Share of the burg's immediate neighbor cells tall enough for marble, 0..1. */
  marbleRatio: number;
}

export type { QuarryOperation } from "./quarryOperationsTypes";

/**
 * Headcount needed to run a quarry site at full capacity. Reused by `produceMonth()` and by
 * the annual Burg-anchored employment reconciliation in `basicEmployment.ts`
 * (docs/plan/urban-construction-industry.md §3.2, Phase 1).
 */
export function getQuarryRequiredWorkers(candidate: Pick<QuarryCandidate, "stoneRatio" | "marbleRatio">): number {
  return (
    REQUIRED_WORKERS_BASE + Math.round((candidate.stoneRatio + candidate.marbleRatio) * REQUIRED_WORKERS_PER_RATIO)
  );
}

/**
 * Candidate site scoring (docs/plan/urban-construction-industry.md §3.2, decision D3): unlike
 * ore's MineralDeposit/MineralGeologicalProvince, building stone is a continuous terrain-height
 * fact rather than a rare clustered vein, so this scores each burg's immediate neighbor ring
 * directly instead of running a separate geological-province classifier — the same lightweight
 * approach shipbuilding's computeShipyardCandidates() uses for forest/timber siting.
 *
 * The height gates mirror the Stone/Marble `distribution` predicates in goods-generator.ts
 * (`minHeight(40)`, `minHeight(60)`), but drop their `elevation()` half: that term is a random
 * per-cell "does this bonus-good scatter roll land here" gate for Goods.generate(), not a
 * geological viability check, and would make site scoring nondeterministic.
 *
 * Pure derived data — reads pack.burgs/cells, mutates nothing.
 */
export function computeQuarryCandidates(): QuarryCandidate[] {
  const { pack } = getWorldContext();
  if (!pack.burgs) return [];

  const candidates: QuarryCandidate[] = [];
  for (const burg of pack.burgs) {
    if (!burg.i || burg.removed) continue;

    const neighbors = pack.cells.c[burg.cell] ?? [];
    if (!neighbors.length) continue;

    const stoneCount = neighbors.filter(n => (pack.cells.h[n] ?? 0) >= STONE_QUARRY_MIN_HEIGHT).length;
    const marbleCount = neighbors.filter(n => (pack.cells.h[n] ?? 0) >= MARBLE_QUARRY_MIN_HEIGHT).length;
    const stoneRatio = stoneCount / neighbors.length;
    const marbleRatio = marbleCount / neighbors.length;
    if (stoneRatio < MIN_STONE_RATIO) continue;

    candidates.push({ burgId: burg.i, stoneRatio: rn(stoneRatio, 2), marbleRatio: rn(marbleRatio, 2) });
  }
  return candidates;
}

/**
 * Persistent, Burg-anchored quarry sites feeding Stone/Marble supply alongside (not replacing —
 * §7 未決定事項 1 decision "併存させる") the legacy chance/distribution scatter those Goods
 * already carry. Mirrors MineOperationsModule's generate()/clear()/produceMonth() shape, but
 * without reserve depletion: unlike rare ore veins, building stone is deliberately common and
 * is not modeled as an exhaustible deposit in Phase 1.
 */
export class QuarryOperationsModule {
  generate(): void {
    const marketColumn = getMarketCellColumn();
    const marketById = new Set(getMarkets().map(market => market.i));
    const previousByBurg = new Map(getQuarryOperations().map(operation => [operation.burgId, operation]));
    const operations: QuarryOperation[] = [];

    for (const candidate of computeQuarryCandidates()) {
      const burg = getWorldContext().pack.burgs[candidate.burgId];
      if (!burg || burg.removed) continue;
      const marketId = marketColumn[burg.cell] || burg.market || 0;
      if (!marketId || !marketById.has(marketId)) continue;

      const previous = previousByBurg.get(candidate.burgId);
      operations.push({
        i: operations.length + 1,
        burgId: candidate.burgId,
        marketId,
        // Newly opened quarries staff up immediately; annual reconciliation
        // (basicEmployment.ts) pulls this back toward the Burg's actually-available adults.
        quarryWorkers: previous?.quarryWorkers ?? getQuarryRequiredWorkers(candidate),
        stoneRatio: candidate.stoneRatio,
        marbleRatio: candidate.marbleRatio,
        toolsInvestmentStock: previous?.toolsInvestmentStock ?? 0,
        annualOutputTons: {},
        active: true
      });
    }

    setQuarryOperations(operations);
  }

  clear(): void {
    setQuarryOperations([]);
  }

  /** Settles one Economy production month into market stock, mirroring MineOperations.produceMonth(). */
  produceMonth(): void {
    const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));
    const stoneGood = goodsByName.get("stone");
    const marbleGood = goodsByName.get("marble");

    for (const operation of getQuarryOperations()) {
      if (!operation.active) continue;

      const requiredWorkers = getQuarryRequiredWorkers(operation);
      const workerFactor = Math.min(1, operation.quarryWorkers / requiredWorkers);
      const investmentBonus = 1 + QUARRY_TECH_BONUS_MAX * (operation.toolsInvestmentStock ?? 0);
      const extractionFactor = Math.max(0, Math.min(1, workerFactor * investmentBonus));

      const annualOutputTons: QuarryOperation["annualOutputTons"] = {};

      if (stoneGood && isGoodEnabled(stoneGood)) {
        const monthlyStone = (BASE_ANNUAL_STONE_TONS_PER_WORKER * operation.quarryWorkers * extractionFactor) / 12;
        const supplied = Markets.addMineSupply(operation.marketId, stoneGood.i, monthlyStone);
        if (supplied > 0) annualOutputTons.stone = rn(supplied * 12, 2);
      }

      if (marbleGood && isGoodEnabled(marbleGood) && operation.marbleRatio > 0) {
        const monthlyMarble =
          (BASE_ANNUAL_MARBLE_TONS_PER_WORKER * operation.quarryWorkers * operation.marbleRatio * extractionFactor) /
          12;
        const supplied = Markets.addMineSupply(operation.marketId, marbleGood.i, monthlyMarble);
        if (supplied > 0) annualOutputTons.marble = rn(supplied * 12, 2);
      }

      operation.annualOutputTons = annualOutputTons;
    }
  }
}

export const QuarryOperations = new QuarryOperationsModule();

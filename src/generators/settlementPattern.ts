import { getInitialSettlementPatternPreset } from "../data/initialSettlementPatterns";
import type { SettlementFoundationPlan } from "../types/settlementFoundation";
import type { InitialSettlementPattern } from "../types/WorldState";
import { createInitialPopulationCohorts, startingPopulationScaleOfK } from "./initialPopulationCohorts";
import {
  createSettlementFoundation,
  type SettlementClimate,
  type SettlementFoundationCells
} from "./settlementFoundation";
import { getCellSubsistenceCapacity } from "./subsistenceCapacity";

export interface SettlementPatternCells {
  readonly i: ArrayLike<number>;
  readonly c?: readonly (readonly number[])[];
  readonly s: ArrayLike<number>;
  readonly capacity: ArrayLike<number>;
  readonly subsistenceCapacity?: ArrayLike<number>;
  readonly h?: ArrayLike<number>;
  readonly pop: MutableNumberColumn;
  readonly children: MutableNumberColumn;
  readonly maleAdults: MutableNumberColumn;
  readonly femaleAdults: MutableNumberColumn;
  readonly elders: MutableNumberColumn;
  readonly r?: ArrayLike<number>;
  readonly harbor?: ArrayLike<number>;
  readonly t?: ArrayLike<number>;
  readonly biome?: ArrayLike<number>;
  readonly conf?: ArrayLike<number>;
  readonly danger?: ArrayLike<number>;
  readonly g?: ArrayLike<number>;
  readonly p?: readonly (readonly [number, number])[];
}

type MutableNumberColumn = ArrayLike<number> & { [index: number]: number; fill(value: number): unknown };

export interface SettlementPatternResult {
  readonly settledCellCount: number;
  readonly suitableCellCount: number;
  readonly settledCapacity: number;
  readonly totalCapacity: number;
  readonly totalPopulation: number;
  /** Present for the Phase 1 foundation path; undefined for legacy standard maps. */
  readonly plan?: SettlementFoundationPlan;
}

type Candidate = { id: number; score: number; capacity: number; x: number; y: number };

/**
 * Applies the initial population distribution without changing environmental
 * carrying capacity. The standard preset keeps every suitable cell populated
 * at the historical uniform saturation; other presets choose clustered hubs
 * and redistribute the requested global population within their capacity.
 */
export function applyInitialSettlementPattern(
  cells: SettlementPatternCells,
  pattern: InitialSettlementPattern,
  initialPopulationSaturation: number,
  random: () => number = Math.random,
  climate: SettlementClimate = {},
  initialPolityCount = 0,
  /** Override pattern settledFootprint (0–1). Used by fantasy oikoumene control. */
  oikoumeneLandShare?: number
): SettlementPatternResult {
  if (pattern !== "standard" && canBuildFoundation(cells)) {
    return createSettlementFoundation(
      cells,
      climate,
      pattern,
      initialPopulationSaturation,
      random,
      getMinimumFoundationRegionCount(pattern, initialPolityCount),
      oikoumeneLandShare
    );
  }

  const preset = getInitialSettlementPatternPreset(pattern);
  const saturation = Math.max(0, Math.min(1, initialPopulationSaturation));
  const candidates: Candidate[] = [];
  let totalCapacity = 0;

  for (let index = 0; index < cells.i.length; index++) {
    const id = cells.i[index];
    const capacity = getCellSubsistenceCapacity(cells, id);
    if ((cells.s[id] ?? 0) <= 0 || capacity <= 0) continue;
    totalCapacity += capacity;
    const [x, y] = cells.p?.[id] ?? [id, 0];
    const waterBonus = (cells.r?.[id] ? 0.9 : 0) + (cells.harbor?.[id] ? 0.75 : 0) + (cells.t?.[id] ? 0.25 : 0);
    const score = capacity * (1 + waterBonus);
    candidates.push({
      id,
      capacity,
      x,
      y,
      // Standard must not consume RNG here: Burg and State generation that
      // follows must retain historical seeded output exactly.
      score: pattern === "standard" ? score : score * (0.9 + random() * 0.2)
    });
  }

  clearPopulation(cells);
  if (!candidates.length || saturation === 0) {
    return {
      settledCellCount: 0,
      suitableCellCount: candidates.length,
      settledCapacity: 0,
      totalCapacity,
      totalPopulation: 0
    };
  }

  const selected = selectSettledCells(
    candidates,
    preset.settledFootprint,
    preset.settlementClustering,
    totalCapacity * saturation
  );
  const settledCapacity = selected.reduce((sum, candidate) => sum + candidate.capacity, 0);
  const populationScale = startingPopulationScaleOfK(settledCapacity, totalCapacity, saturation);
  let totalPopulation = 0;

  for (const candidate of selected) {
    const cohorts = createInitialPopulationCohorts(candidate.capacity, populationScale);
    cells.pop[candidate.id] = cohorts.population;
    cells.children[candidate.id] = cohorts.children;
    cells.maleAdults[candidate.id] = cohorts.maleAdults;
    cells.femaleAdults[candidate.id] = cohorts.femaleAdults;
    cells.elders[candidate.id] = cohorts.elders;
    totalPopulation += cohorts.population;
  }

  return {
    settledCellCount: selected.length,
    suitableCellCount: candidates.length,
    settledCapacity,
    totalCapacity,
    totalPopulation
  };
}

/**
 * Sparse patterns begin with few settlement regions. A high polity-density
 * request needs more independent hubs; otherwise additional States can only
 * become neighbours inside the same compact region (long interstate borders).
 */
function getMinimumFoundationRegionCount(pattern: InitialSettlementPattern, initialPolityCount: number): number {
  if (pattern === "frontier") return Math.max(0, Math.ceil(initialPolityCount / 5));
  // Marches: prefer roughly one region per 2–3 states so wild belts separate polities.
  if (pattern === "marches") return Math.max(0, Math.ceil(initialPolityCount / 2.5));
  return 0;
}

function canBuildFoundation(
  cells: SettlementPatternCells
): cells is SettlementPatternCells & SettlementFoundationCells {
  return Boolean(cells.c && cells.h && cells.p);
}

function clearPopulation(cells: SettlementPatternCells): void {
  cells.pop.fill(0);
  cells.children.fill(0);
  cells.maleAdults.fill(0);
  cells.femaleAdults.fill(0);
  cells.elders.fill(0);
}

function selectSettledCells(
  candidates: Candidate[],
  settledFootprint: number,
  settlementClustering: number,
  targetPopulationCapacity: number
): Candidate[] {
  if (settledFootprint >= 1) return candidates;

  const hubCount = Math.max(1, Math.round(Math.sqrt(candidates.length) * (1 - settlementClustering)));
  const hubs = [...candidates].sort((a, b) => b.score - a.score).slice(0, hubCount);
  const scale = Math.max(
    1,
    Math.hypot(
      Math.max(...candidates.map(candidate => candidate.x)) - Math.min(...candidates.map(candidate => candidate.x)),
      Math.max(...candidates.map(candidate => candidate.y)) - Math.min(...candidates.map(candidate => candidate.y))
    )
  );
  const ranked = [...candidates].sort((a, b) => settlementScore(b) - settlementScore(a));
  const minimumCells = Math.max(1, Math.ceil(candidates.length * settledFootprint));
  const selected: Candidate[] = [];
  let capacity = 0;

  for (const candidate of ranked) {
    if (selected.length >= minimumCells && capacity >= targetPopulationCapacity) break;
    selected.push(candidate);
    capacity += candidate.capacity;
  }
  return selected;

  function settlementScore(candidate: Candidate): number {
    let nearest = Infinity;
    for (const hub of hubs) nearest = Math.min(nearest, Math.hypot(candidate.x - hub.x, candidate.y - hub.y));
    const hubBonus = 1 + settlementClustering * Math.max(0, 1 - nearest / scale) * 2;
    return candidate.score * hubBonus;
  }
}

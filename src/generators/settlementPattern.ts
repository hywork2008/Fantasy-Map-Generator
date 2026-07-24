import { getInitialSettlementPatternPreset } from "../data/initialSettlementPatterns";
import type { InitialSettlementPattern } from "../types/WorldState";
import { createInitialPopulationCohorts } from "./initialPopulationCohorts";

export interface SettlementPatternCells {
  readonly i: ArrayLike<number>;
  readonly s: ArrayLike<number>;
  readonly capacity: ArrayLike<number>;
  readonly pop: MutableNumberColumn;
  readonly children: MutableNumberColumn;
  readonly maleAdults: MutableNumberColumn;
  readonly femaleAdults: MutableNumberColumn;
  readonly elders: MutableNumberColumn;
  readonly r?: ArrayLike<number>;
  readonly harbor?: ArrayLike<number>;
  readonly t?: ArrayLike<number>;
  readonly p?: readonly (readonly [number, number])[];
}

type MutableNumberColumn = ArrayLike<number> & { [index: number]: number; fill(value: number): unknown };

export interface SettlementPatternResult {
  readonly settledCellCount: number;
  readonly suitableCellCount: number;
  readonly settledCapacity: number;
  readonly totalCapacity: number;
  readonly totalPopulation: number;
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
  random: () => number = Math.random
): SettlementPatternResult {
  const preset = getInitialSettlementPatternPreset(pattern);
  const saturation = Math.max(0, Math.min(1, initialPopulationSaturation));
  const candidates: Candidate[] = [];
  let totalCapacity = 0;

  for (let index = 0; index < cells.i.length; index++) {
    const id = cells.i[index];
    const capacity = cells.capacity[id] ?? 0;
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
  const populationScale = settledCapacity > 0 ? Math.min(1, (totalCapacity * saturation) / settledCapacity) : 0;
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

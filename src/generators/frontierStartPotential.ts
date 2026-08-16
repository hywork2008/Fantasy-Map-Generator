import { RAINFED_WELL_PRECIPITATION } from "./cellWaterAccess";
import { dangerSuitabilityMultiplier } from "./dangerExpandPolicy";

/**
 * Design values from docs/simulation/frontier-start-placement-guidelines.md.
 * Tune from observed 400-year expansion, not from map cosmetics.
 */
export const FRONTIER_MIN_POTENTIAL_RATIO = 0.5;
/** Early overland reach used when scoring a start region's P(r). */
export const FRONTIER_POTENTIAL_LAND_HOPS = 24;
/** Coast, lake, spring, and rainfed land are useful but weaker than river basins. */
export const FRONTIER_SECONDARY_WATER_WEIGHT = 0.45;
/** Same retention the expansion engine keeps at home; surplus is what can leave. */
const SOURCE_RETENTION_RATIO = 0.65;

export interface FrontierClimateColumns {
  readonly temperature?: ArrayLike<number>;
  readonly precipitation?: ArrayLike<number>;
}

export interface FrontierPotentialCells {
  readonly i?: ArrayLike<number>;
  readonly c?: ReadonlyArray<ReadonlyArray<number> | undefined>;
  readonly f?: ArrayLike<number>;
  readonly h?: ArrayLike<number>;
  readonly s?: ArrayLike<number>;
  readonly r?: ArrayLike<number>;
  readonly harbor?: ArrayLike<number>;
  readonly t?: ArrayLike<number>;
  readonly conf?: ArrayLike<number>;
  readonly danger?: ArrayLike<number>;
  readonly g?: ArrayLike<number>;
  readonly pop?: ArrayLike<number>;
  readonly capacity?: ArrayLike<number>;
  readonly subsistenceCapacity?: ArrayLike<number>;
}

export interface FrontierPotentialFeature {
  readonly land?: boolean;
  readonly cells?: number;
}

export interface FrontierPotentialPack {
  readonly cells: FrontierPotentialCells;
  readonly features?: ReadonlyArray<FrontierPotentialFeature | undefined | 0>;
}

export interface LandmassGrowthPotential {
  readonly featureId: number;
  readonly area: number;
  readonly potential: number;
  readonly futureSubsistenceCapacity: number;
  readonly riverAccess: number;
  readonly coastLakeSpringAccess: number;
  readonly startSites: number;
}

export interface StartRegionPotential {
  readonly initialRuralPopulation: number;
  readonly futureSubsistenceCapacity: number;
  readonly riverAccess: number;
  readonly coastLakeSpringAccess: number;
  readonly potential: number;
  readonly surplusPopulation: number;
  readonly firstRingCandidateCells: number;
}

export interface FrontierStartAuditRecord {
  readonly capitalCell: number;
  readonly regionId: number;
  readonly landmassId: number;
  readonly ruralPopulation: number;
  readonly surplusPopulation: number;
  readonly firstRingCandidateCells: number;
  readonly potential: number;
  readonly nearestSameLandmassCapitalHops: number;
}

/**
 * Growth potential of a whole landmass. Area is the feature's official cell
 * count; per-cell quality is measured from the packed cells that exist and
 * then scaled so fixture maps with representative cells still rank correctly.
 */
export function measureLandmassPotential(
  pack: FrontierPotentialPack,
  featureId: number,
  climate?: FrontierClimateColumns
): Omit<LandmassGrowthPotential, "startSites"> {
  const scored = scoreLandCells(pack, climate, cellId => pack.cells.f?.[cellId] === featureId);
  const officialArea = featureLandCells(pack, featureId);
  const scale = scored.habitableCells > 0 ? officialArea / scored.habitableCells : 0;
  return {
    featureId,
    area: officialArea,
    futureSubsistenceCapacity: scored.future * scale,
    riverAccess: scored.river * scale,
    coastLakeSpringAccess: scored.secondary * scale,
    potential: (scored.future + scored.river + scored.secondary) * scale
  };
}

/**
 * P(r) around a start cell: same landmass only, no roads, no sea crossing,
 * and only cells inside the early overland hop budget.
 */
export function measureStartRegionPotential(
  pack: FrontierPotentialPack,
  originCell: number,
  climate?: FrontierClimateColumns,
  hops = FRONTIER_POTENTIAL_LAND_HOPS
): StartRegionPotential {
  const landmassId = pack.cells.f?.[originCell];
  const reachable = collectReachableLandCells(pack, originCell, hops);
  const scored = scoreLandCells(pack, climate, cellId => reachable.has(cellId));
  const rural = sumColumn(pack.cells.pop, reachable);
  const subsistence = sumSubsistence(pack, reachable);
  const surplus = Math.max(0, rural - subsistence * SOURCE_RETENTION_RATIO);
  const firstRing = countFirstRingCandidates(pack, originCell, landmassId);
  return {
    initialRuralPopulation: rural,
    futureSubsistenceCapacity: scored.future,
    riverAccess: scored.river,
    coastLakeSpringAccess: scored.secondary,
    potential: rural + scored.future + scored.river + scored.secondary,
    surplusPopulation: surplus,
    firstRingCandidateCells: firstRing
  };
}

/**
 * Max-min assignment of N polity slots. First fills distinct high-P landmasses,
 * then adds another slot where the resulting min(P_i / n_i) stays largest.
 * Feature group labels are not used.
 */
export function allocateFrontierLandmassSlots(
  landmasses: readonly LandmassGrowthPotential[],
  polityCount: number,
  minRatio = FRONTIER_MIN_POTENTIAL_RATIO
): number[] {
  if (polityCount <= 0 || !landmasses.length) return [];

  const viable = landmasses.filter(entry => entry.startSites > 0 && entry.potential > 0 && entry.area > 0);
  if (!viable.length) return [];

  const potentialTotal = viable.reduce((sum, entry) => sum + entry.potential, 0);
  const potentialTarget = potentialTotal / polityCount;
  let eligible = viable.filter(entry => entry.potential + Number.EPSILON >= potentialTarget * minRatio);
  if (!eligible.length) {
    eligible = [viable.reduce((best, entry) => (compareLandmassPotential(entry, best) > 0 ? entry : best))];
  }

  if (countStartSites(eligible) < polityCount) {
    const extra = viable
      .filter(entry => !eligible.some(current => current.featureId === entry.featureId))
      .sort((left, right) => compareLandmassPotential(right, left));
    for (const entry of extra) {
      eligible = [...eligible, entry];
      if (countStartSites(eligible) >= polityCount) break;
    }
  }

  const counts = new Map<number, number>(eligible.map(entry => [entry.featureId, 0]));
  const order: number[] = [];
  while (order.length < polityCount) {
    const next = pickMaxMinSlot(eligible, counts);
    if (next === null) break;
    counts.set(next, (counts.get(next) ?? 0) + 1);
    order.push(next);
  }
  return order;
}

export function landHopDistance(pack: FrontierPotentialPack, from: number, to: number): number {
  if (from === to) return 0;
  if (pack.cells.f?.[from] !== pack.cells.f?.[to]) return Number.POSITIVE_INFINITY;
  const hops = collectReachableLandCells(pack, from, Number.POSITIVE_INFINITY, to);
  return hops.get(to) ?? Number.POSITIVE_INFINITY;
}

function pickMaxMinSlot(
  landmasses: readonly LandmassGrowthPotential[],
  counts: ReadonlyMap<number, number>
): number | null {
  let bestId: number | null = null;
  let bestMin = Number.NEGATIVE_INFINITY;
  let bestShare = Number.NEGATIVE_INFINITY;
  let bestPotential = Number.NEGATIVE_INFINITY;
  let bestArea = Number.NEGATIVE_INFINITY;

  for (const candidate of landmasses) {
    const current = counts.get(candidate.featureId) ?? 0;
    if (current >= candidate.startSites) continue;

    let resultingMin = candidate.potential / (current + 1);
    for (const other of landmasses) {
      const assigned = other.featureId === candidate.featureId ? current + 1 : (counts.get(other.featureId) ?? 0);
      if (assigned <= 0) continue;
      resultingMin = Math.min(resultingMin, other.potential / assigned);
    }
    const share = candidate.potential / (current + 1);
    const better =
      resultingMin > bestMin ||
      (resultingMin === bestMin && share > bestShare) ||
      (resultingMin === bestMin && share === bestShare && candidate.potential > bestPotential) ||
      (resultingMin === bestMin &&
        share === bestShare &&
        candidate.potential === bestPotential &&
        candidate.area > bestArea) ||
      (resultingMin === bestMin &&
        share === bestShare &&
        candidate.potential === bestPotential &&
        candidate.area === bestArea &&
        (bestId === null || candidate.featureId < bestId));
    if (better) {
      bestId = candidate.featureId;
      bestMin = resultingMin;
      bestShare = share;
      bestPotential = candidate.potential;
      bestArea = candidate.area;
    }
  }
  return bestId;
}

function compareLandmassPotential(left: LandmassGrowthPotential, right: LandmassGrowthPotential): number {
  return left.potential - right.potential || left.area - right.area || right.featureId - left.featureId;
}

function countStartSites(landmasses: readonly LandmassGrowthPotential[]): number {
  return landmasses.reduce((sum, entry) => sum + entry.startSites, 0);
}

function scoreLandCells(
  pack: FrontierPotentialPack,
  climate: FrontierClimateColumns | undefined,
  include: (cellId: number) => boolean
): { future: number; river: number; secondary: number; habitableCells: number } {
  let future = 0;
  let river = 0;
  let secondary = 0;
  let habitableCells = 0;
  const ids = pack.cells.i ?? [];

  for (let index = 0; index < ids.length; index++) {
    const cellId = ids[index];
    if (!include(cellId)) continue;
    const contribution = cellPotentialContribution(pack, cellId, climate);
    if (!contribution) continue;
    habitableCells += 1;
    future += contribution.future;
    river += contribution.river;
    secondary += contribution.secondary;
  }

  return { future, river, secondary, habitableCells };
}

function cellPotentialContribution(
  pack: FrontierPotentialPack,
  cellId: number,
  climate?: FrontierClimateColumns
): { future: number; river: number; secondary: number } | null {
  if ((pack.cells.h?.[cellId] ?? 0) < 20) return null;
  const capacity = cellCapacity(pack, cellId);
  if (capacity <= 0) return null;

  const gridId = pack.cells.g?.[cellId] ?? cellId;
  const temperature = climate?.temperature?.[gridId];
  const precipitation = climate?.precipitation?.[gridId];
  if (temperature !== undefined && (temperature < -18 || temperature > 42)) return null;

  const climateScore = getPotentialClimateScore(temperature, precipitation, hasSurfaceWater(pack, cellId));
  if (climateScore <= 0) return null;

  const weighted =
    capacity *
    climateScore *
    getTerrainScore(pack.cells.h?.[cellId] ?? 0) *
    dangerSuitabilityMultiplier(pack.cells.danger?.[cellId] ?? 0);
  if (weighted <= 0) return null;

  if (isRiverAccessible(pack, cellId)) {
    return { future: weighted, river: weighted, secondary: 0 };
  }
  if (hasSecondaryWaterAccess(pack, cellId, precipitation)) {
    return { future: weighted, river: 0, secondary: weighted * FRONTIER_SECONDARY_WATER_WEIGHT };
  }
  return { future: weighted, river: 0, secondary: 0 };
}

function cellCapacity(pack: FrontierPotentialPack, cellId: number): number {
  const subsistence = pack.cells.subsistenceCapacity?.[cellId];
  if (subsistence !== undefined) return Math.max(0, subsistence);
  const terrain = pack.cells.capacity?.[cellId];
  if (terrain !== undefined) return Math.max(0, terrain);
  return Math.max(0, pack.cells.s?.[cellId] ?? 0);
}

function hasSurfaceWater(pack: FrontierPotentialPack, cellId: number): boolean {
  return isRiverAccessible(pack, cellId) || (pack.cells.harbor?.[cellId] ?? 0) > 0;
}

function isRiverAccessible(pack: FrontierPotentialPack, cellId: number): boolean {
  if ((pack.cells.r?.[cellId] ?? 0) > 0) return true;
  for (const neighbor of pack.cells.c?.[cellId] ?? []) {
    if ((pack.cells.r?.[neighbor] ?? 0) > 0) return true;
  }
  return false;
}

function hasSecondaryWaterAccess(
  pack: FrontierPotentialPack,
  cellId: number,
  precipitation: number | undefined
): boolean {
  if ((pack.cells.harbor?.[cellId] ?? 0) > 0) return true;
  if ((pack.cells.t?.[cellId] ?? 0) === 1) return true;
  if ((pack.cells.conf?.[cellId] ?? 0) > 0) return true;
  return precipitation !== undefined && precipitation >= RAINFED_WELL_PRECIPITATION;
}

function getPotentialClimateScore(
  temperature: number | undefined,
  precipitation: number | undefined,
  surfaceWater: boolean
): number {
  const growingSeasonScore =
    temperature === undefined ? 1 : temperature < -5 ? 0.2 : temperature < 2 ? 0.5 : temperature > 34 ? 0.55 : 1;
  if (precipitation === undefined) return growingSeasonScore;
  if (precipitation < 8) return surfaceWater ? growingSeasonScore * 0.2 : 0;
  if (precipitation < 20) return growingSeasonScore * 0.55;
  return growingSeasonScore;
}

function getTerrainScore(height: number): number {
  if (height >= 70) return 0.2;
  if (height >= 55) return 0.55;
  return 1;
}

function featureLandCells(pack: FrontierPotentialPack, featureId: number): number {
  const feature = pack.features?.[featureId];
  if (!feature || typeof feature !== "object" || !feature.land) return 0;
  return feature.cells ?? 0;
}

function collectReachableLandCells(
  pack: FrontierPotentialPack,
  origin: number,
  maxHops: number,
  stopAt?: number
): Map<number, number> {
  const landmassId = pack.cells.f?.[origin];
  const hops = new Map<number, number>([[origin, 0]]);
  if (landmassId === undefined || landmassId === null) return hops;
  const queue = [origin];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    const currentHops = hops.get(current) ?? 0;
    if (currentHops >= maxHops) continue;
    for (const neighbor of pack.cells.c?.[current] ?? []) {
      if (hops.has(neighbor)) continue;
      if (pack.cells.f?.[neighbor] !== landmassId) continue;
      if ((pack.cells.h?.[neighbor] ?? 0) < 20) continue;
      hops.set(neighbor, currentHops + 1);
      if (stopAt !== undefined && neighbor === stopAt) return hops;
      queue.push(neighbor);
    }
  }
  return hops;
}

function countFirstRingCandidates(pack: FrontierPotentialPack, origin: number, landmassId: number | undefined): number {
  if (landmassId === undefined) return 0;
  const seen = new Set<number>([origin]);
  let count = 0;
  for (const neighbor of pack.cells.c?.[origin] ?? []) {
    if (seen.has(neighbor)) continue;
    seen.add(neighbor);
    if (pack.cells.f?.[neighbor] !== landmassId) continue;
    if ((pack.cells.h?.[neighbor] ?? 0) < 20) continue;
    if (cellCapacity(pack, neighbor) <= 0) continue;
    if ((pack.cells.pop?.[neighbor] ?? 0) > 0) continue;
    count += 1;
  }
  return count;
}

function sumColumn(column: ArrayLike<number> | undefined, cells: ReadonlyMap<number, number>): number {
  if (!column) return 0;
  let total = 0;
  for (const cellId of cells.keys()) total += column[cellId] ?? 0;
  return total;
}

function sumSubsistence(pack: FrontierPotentialPack, cells: ReadonlyMap<number, number>): number {
  let total = 0;
  for (const cellId of cells.keys()) total += cellCapacity(pack, cellId);
  return total;
}

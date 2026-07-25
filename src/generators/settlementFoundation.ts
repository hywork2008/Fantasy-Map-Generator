import { getInitialSettlementPatternPreset } from "../data/initialSettlementPatterns";
import type {
  SettlementFoundationPlan,
  SettlementLink,
  SettlementNode,
  SettlementRegion
} from "../types/settlementFoundation";
import type { InitialSettlementPattern } from "../types/WorldState";
import { createInitialPopulationCohorts } from "./initialPopulationCohorts";

type MutableNumberColumn = ArrayLike<number> & { [index: number]: number; fill(value: number): unknown };

/** The environmental and demographic columns needed by the Settlement Foundation Module. */
export interface SettlementFoundationCells {
  readonly i: ArrayLike<number>;
  readonly c: readonly (readonly number[])[];
  readonly s: ArrayLike<number>;
  readonly capacity: ArrayLike<number>;
  readonly h: ArrayLike<number>;
  readonly p: readonly (readonly [number, number])[];
  readonly r?: ArrayLike<number>;
  readonly harbor?: ArrayLike<number>;
  readonly t?: ArrayLike<number>;
  readonly biome?: ArrayLike<number>;
  readonly conf?: ArrayLike<number>;
  readonly danger?: ArrayLike<number>;
  readonly g?: ArrayLike<number>;
  readonly pop: MutableNumberColumn;
  readonly children: MutableNumberColumn;
  readonly maleAdults: MutableNumberColumn;
  readonly femaleAdults: MutableNumberColumn;
  readonly elders: MutableNumberColumn;
}

export interface SettlementClimate {
  readonly temperature?: ArrayLike<number>;
  readonly precipitation?: ArrayLike<number>;
}

export interface SettlementFoundationResult {
  readonly plan: SettlementFoundationPlan;
  readonly settledCellCount: number;
  readonly suitableCellCount: number;
  readonly settledCapacity: number;
  readonly totalCapacity: number;
  readonly totalPopulation: number;
}

type ResourceKind = SettlementRegion["kind"];

type Candidate = {
  readonly id: number;
  readonly capacity: number;
  readonly score: number;
  readonly kind: ResourceKind;
  readonly x: number;
  readonly y: number;
};

/**
 * Builds the pre-polity human geography for non-standard worlds. Its small
 * interface owns resource screening, compact settlement regions, settlement
 * nodes, links, and the population cohort placement derived from that plan.
 */
export function createSettlementFoundation(
  cells: SettlementFoundationCells,
  climate: SettlementClimate,
  pattern: Exclude<InitialSettlementPattern, "standard">,
  initialPopulationSaturation: number,
  random: () => number = Math.random
): SettlementFoundationResult {
  const preset = getInitialSettlementPatternPreset(pattern);
  const saturation = clamp(initialPopulationSaturation, 0, 1);
  const { candidates, totalCapacity } = collectCandidates(cells, climate, random);
  clearPopulation(cells);

  if (!candidates.length || saturation === 0) {
    return emptyFoundationResult(candidates.length, totalCapacity);
  }

  const regionCount = selectRegionCount(preset.settlementRegionCount, candidates.length, random);
  const centers = selectRegionCenters(candidates, regionCount, random);
  const targetCapacity = totalCapacity * Math.max(saturation, preset.settledFootprint);
  const regions = buildRegions(cells, candidates, centers, targetCapacity, preset.settlementClustering);
  const selected = regions.flatMap(region => region.cells.map(id => candidateById(candidates, id))).filter(isCandidate);
  const settledCapacity = selected.reduce((sum, candidate) => sum + candidate.capacity, 0);
  const populationScale = settledCapacity ? Math.min(1, (totalCapacity * saturation) / settledCapacity) : 0;
  const totalPopulation = placeCohorts(cells, selected, populationScale);
  const nodes = createNodes(regions, candidates, random);
  const links = createLinks(nodes, candidates);

  return {
    plan: { regions, nodes, links },
    settledCellCount: selected.length,
    suitableCellCount: candidates.length,
    settledCapacity,
    totalCapacity,
    totalPopulation
  };
}

function collectCandidates(
  cells: SettlementFoundationCells,
  climate: SettlementClimate,
  random: () => number
): { candidates: Candidate[]; totalCapacity: number } {
  const candidates: Candidate[] = [];
  let totalCapacity = 0;

  for (let index = 0; index < cells.i.length; index++) {
    const id = cells.i[index];
    const capacity = cells.capacity[id] ?? 0;
    if ((cells.s[id] ?? 0) <= 0 || capacity <= 0 || (cells.h[id] ?? 0) < 20) continue;
    totalCapacity += capacity;

    const kind = getResourceKind(cells, id, climate);
    if (!kind) continue;
    const temperature = getClimateValue(climate.temperature, cells.g?.[id] ?? id, 12);
    const precipitation = getClimateValue(climate.precipitation, cells.g?.[id] ?? id, 45);
    const climateScore = getClimateScore(temperature, precipitation, kind);
    if (climateScore === 0) continue;

    const danger = cells.danger?.[id] ?? 0;
    const resourceBonus = kind === "river" ? 1.35 : kind === "lake" ? 1.2 : kind === "coast" ? 1.1 : 0.9;
    const terrainScore = getTerrainScore(cells.h[id] ?? 0);
    const forestResourceScore = isForestBiome(cells.biome?.[id]) ? 1.12 : 1;
    const [x, y] = cells.p[id];
    candidates.push({
      id,
      capacity,
      kind,
      x,
      y,
      score:
        capacity *
        resourceBonus *
        climateScore *
        terrainScore *
        forestResourceScore *
        Math.max(0.05, 1 - danger / 160) *
        (0.97 + random() * 0.06)
    });
  }

  return { candidates, totalCapacity };
}

function getResourceKind(
  cells: SettlementFoundationCells,
  id: number,
  climate: SettlementClimate
): ResourceKind | null {
  if (cells.r?.[id]) return "river";
  if (cells.harbor?.[id]) return cells.t?.[id] === 1 ? "coast" : "lake";
  if (cells.t?.[id] === 1) return "coast";
  if ((cells.conf?.[id] ?? 0) > 0) return "spring";
  // Rain-fed land is represented as a local spring-like resource. It is a
  // fallback only; rivers, lakes, and coasts always outrank it.
  const precipitation = getClimateValue(climate.precipitation, cells.g?.[id] ?? id, 45);
  return precipitation >= 45 ? "spring" : null;
}

function getClimateScore(temperature: number, precipitation: number, kind: ResourceKind | null): number {
  if (!kind) return 0;
  if (temperature < -18 || temperature > 42) return 0;
  // The current climate model has no separate growing-season column. This
  // temperature-derived score is the local growing-season adapter until one
  // exists in WorldContext.
  const growingSeasonScore = temperature < -5 ? 0.2 : temperature < 2 ? 0.5 : temperature > 34 ? 0.55 : 1;
  const precipitationScore =
    precipitation < 8 ? (kind === "river" || kind === "lake" ? 0.2 : 0) : precipitation < 20 ? 0.55 : 1;
  return growingSeasonScore * precipitationScore;
}

function getTerrainScore(height: number): number {
  if (height >= 70) return 0.2;
  if (height >= 55) return 0.55;
  return 1;
}

function isForestBiome(biome: number | undefined): boolean {
  return biome !== undefined && biome >= 5 && biome <= 9;
}

function getClimateValue(column: ArrayLike<number> | undefined, index: number, fallback: number): number {
  return column?.[index] ?? fallback;
}

function selectRegionCount(range: readonly [number, number], candidateCount: number, random: () => number): number {
  const [minimum, maximum] = range;
  if (candidateCount === 0) return 0;
  return Math.min(candidateCount, minimum + Math.floor(random() * (maximum - minimum + 1)));
}

function selectRegionCenters(candidates: Candidate[], count: number, random: () => number): Candidate[] {
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const centers: Candidate[] = [ranked[0]];
  const diagonal = Math.max(
    1,
    Math.hypot(
      Math.max(...candidates.map(candidate => candidate.x)) - Math.min(...candidates.map(candidate => candidate.x)),
      Math.max(...candidates.map(candidate => candidate.y)) - Math.min(...candidates.map(candidate => candidate.y))
    )
  );

  while (centers.length < count) {
    const next = ranked
      .filter(candidate => !centers.includes(candidate))
      .map(candidate => {
        const nearest = Math.min(...centers.map(center => Math.hypot(candidate.x - center.x, candidate.y - center.y)));
        return { candidate, score: candidate.score * (0.35 + nearest / diagonal) * (0.98 + random() * 0.04) };
      })
      .sort((a, b) => b.score - a.score)[0]?.candidate;
    if (!next) break;
    centers.push(next);
  }

  return centers;
}

function buildRegions(
  cells: SettlementFoundationCells,
  candidates: Candidate[],
  centers: Candidate[],
  targetCapacity: number,
  settlementClustering: number
): SettlementRegion[] {
  const candidatesById = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const claimed = new Set<number>();
  const totalCenterScore = centers.reduce((sum, center) => sum + center.score, 0) || centers.length;

  return centers.map((center, id) => {
    const budget = targetCapacity * (center.score / totalCenterScore);
    const cellsInRegion = expandCompactRegion(
      cells,
      candidatesById,
      center.id,
      budget,
      claimed,
      getMaximumRegionHops(candidates.length, settlementClustering)
    );
    const kind = center.kind;
    return { id, kind, center: center.id, cells: cellsInRegion };
  });
}

function expandCompactRegion(
  cells: SettlementFoundationCells,
  candidatesById: ReadonlyMap<number, Candidate>,
  center: number,
  capacityBudget: number,
  claimed: Set<number>,
  maximumHops: number
): number[] {
  const queued = new Set<number>([center]);
  const queue = [{ cell: center, hops: 0 }];
  const selected: number[] = [];
  let capacity = 0;

  while (queue.length && capacity < capacityBudget) {
    const { cell: current, hops } = queue.shift()!;
    const candidate = candidatesById.get(current);
    if (candidate && !claimed.has(current)) {
      selected.push(current);
      claimed.add(current);
      capacity += candidate.capacity;
    }

    if (hops >= maximumHops) continue;
    for (const neighbor of cells.c[current] ?? []) {
      if (queued.has(neighbor) || claimed.has(neighbor) || !candidatesById.has(neighbor)) continue;
      queued.add(neighbor);
      queue.push({ cell: neighbor, hops: hops + 1 });
    }
  }

  // A neighbouring region can have claimed every nearby candidate. Retaining
  // its resource center is more important than silently dropping that region.
  if (!selected.length && candidatesById.has(center)) {
    selected.push(center);
    claimed.add(center);
  }
  return selected;
}

/**
 * A region is a local service area, not every rain-fed cell connected to a
 * river by the packed graph. The hop cap scales with map resolution while the
 * existing clustering preset controls how quickly it can fan out. This is a
 * watershed approximation until the terrain pipeline exposes basin ids.
 */
function getMaximumRegionHops(candidateCount: number, settlementClustering: number): number {
  const compactness = clamp(settlementClustering, 0, 1);
  const scale = 0.08 + (1 - compactness) * 0.2;
  return Math.max(3, Math.round(Math.sqrt(candidateCount) * scale));
}

function createNodes(
  regions: readonly SettlementRegion[],
  candidates: Candidate[],
  random: () => number
): SettlementNode[] {
  const candidatesById = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const nodes: SettlementNode[] = [];

  for (const region of regions) {
    const regionCandidates = region.cells
      .map(id => candidatesById.get(id))
      .filter(isCandidate)
      .sort((a, b) => b.score - a.score);
    const desiredNodes = Math.max(1, Math.ceil(regionCandidates.length / 5));
    const chosen: Candidate[] = [];
    const center = candidatesById.get(region.center);
    if (center) chosen.push(center);

    while (chosen.length < desiredNodes) {
      const next = regionCandidates
        .filter(candidate => !chosen.includes(candidate))
        .map(candidate => ({
          candidate,
          score:
            candidate.score *
            Math.min(...chosen.map(node => Math.max(1, Math.hypot(candidate.x - node.x, candidate.y - node.y)))) *
            (0.99 + random() * 0.02)
        }))
        .sort((a, b) => b.score - a.score)[0]?.candidate;
      if (!next) break;
      chosen.push(next);
    }

    for (const candidate of chosen) {
      nodes.push({
        id: nodes.length,
        regionId: region.id,
        cell: candidate.id,
        role: candidate.id === region.center ? "center" : "village",
        score: candidate.score
      });
    }
  }
  return nodes;
}

function createLinks(nodes: readonly SettlementNode[], candidates: Candidate[]): SettlementLink[] {
  const candidateByCell = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const links: SettlementLink[] = [];

  for (const node of nodes) {
    const earlier = nodes.filter(other => other.regionId === node.regionId && other.id < node.id);
    if (!earlier.length) continue;
    const nearest = earlier.reduce(
      (best, other) => {
        const distance = squaredDistance(node, other, candidateByCell);
        return distance < best.distance ? { node: other, distance } : best;
      },
      { node: earlier[0], distance: Infinity }
    ).node;
    const from = candidateByCell.get(node.cell)!;
    const to = candidateByCell.get(nearest.cell)!;
    links.push({ fromNodeId: nearest.id, toNodeId: node.id, kind: getLinkKind(from, to) });
  }
  return links;
}

function squaredDistance(
  left: SettlementNode,
  right: SettlementNode,
  candidates: ReadonlyMap<number, Candidate>
): number {
  const from = candidates.get(left.cell)!;
  const to = candidates.get(right.cell)!;
  return (from.x - to.x) ** 2 + (from.y - to.y) ** 2;
}

function getLinkKind(from: Candidate, to: Candidate): SettlementLink["kind"] {
  if (from.kind === "river" && to.kind === "river") return "river";
  if (from.kind === "coast" && to.kind === "coast") return "coastal";
  return "trail";
}

function placeCohorts(cells: SettlementFoundationCells, selected: readonly Candidate[], scale: number): number {
  let totalPopulation = 0;
  for (const candidate of selected) {
    const cohorts = createInitialPopulationCohorts(candidate.capacity, scale);
    cells.pop[candidate.id] = cohorts.population;
    cells.children[candidate.id] = cohorts.children;
    cells.maleAdults[candidate.id] = cohorts.maleAdults;
    cells.femaleAdults[candidate.id] = cohorts.femaleAdults;
    cells.elders[candidate.id] = cohorts.elders;
    totalPopulation += cohorts.population;
  }
  return totalPopulation;
}

function clearPopulation(cells: SettlementFoundationCells): void {
  cells.pop.fill(0);
  cells.children.fill(0);
  cells.maleAdults.fill(0);
  cells.femaleAdults.fill(0);
  cells.elders.fill(0);
}

function emptyFoundationResult(suitableCellCount: number, totalCapacity: number): SettlementFoundationResult {
  return {
    plan: { regions: [], nodes: [], links: [] },
    settledCellCount: 0,
    suitableCellCount,
    settledCapacity: 0,
    totalCapacity,
    totalPopulation: 0
  };
}

function candidateById(candidates: readonly Candidate[], id: number): Candidate | undefined {
  return candidates.find(candidate => candidate.id === id);
}

function isCandidate(candidate: Candidate | undefined): candidate is Candidate {
  return candidate !== undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

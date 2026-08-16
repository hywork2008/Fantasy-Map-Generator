import type { PackedGraph } from "../types/PackedGraph";
import type { SettlementFoundationPlan, SettlementNode } from "../types/settlementFoundation";
import type { FrontierPolitySpacing, FrontierStartMode } from "../types/WorldState";
import {
  frontierStartLandFloors,
  MIN_FRONTIER_START_LAND_CELLS_ABSOLUTE,
  minFrontierStartLandCells,
  normalizeFrontierPolitySpacing
} from "../utils/frontierStartMode";
import { isTrueOceanHarborCell } from "../utils/oceanPort";
import { selectInitialPolityCapitalNodes } from "./initialPolities";

/** Same-island starts stay this far apart along the coast before relaxing. */
const DISPERSED_COAST_HOPS = [8, 6, 4, 2, 1] as const;
const CLUSTERED_COAST_HOPS = [4, 2, 1] as const;

export interface FrontierStartPlacementArgs {
  readonly plan: SettlementFoundationPlan;
  readonly pack: PackedGraph;
  readonly count: number;
  readonly startMode: FrontierStartMode;
  readonly realmSize: number;
  readonly spacing?: FrontierPolitySpacing;
}

export interface DispersedSeaborneFoundationStarts {
  readonly cells: ReadonlySet<number>;
  /** Land feature selected for each initial polity, ordered by polity ordinal. */
  readonly landmassOrder: readonly number[];
}

/**
 * Returns the large-landmass ocean harbours that can anchor independent
 * seaborne homelands. Foundation generation uses this before it distributes
 * population, so dispersed capital placement is not later forced back into
 * the one region that happened to contain a port.
 */
export function getPreferredDispersedSeaborneFoundationCells(
  pack: PackedGraph,
  realmSize: number,
  polityCount: number
): DispersedSeaborneFoundationStarts {
  const minimumLandCells = minFrontierStartLandCells(realmSize);
  const continentScaleLandCells = getContinentScaleLandCellFloor(pack, minimumLandCells);
  const continentScaleCandidates = new Map<number, number[]>();
  const fallbackCandidates = new Map<number, number[]>();
  for (const cellId of pack.cells.i ?? []) {
    if (!isEligibleStartLandmass(pack, cellId, minimumLandCells)) continue;
    if (!isOpenOceanHarbor(pack, cellId)) continue;
    const featureId = pack.cells.f?.[cellId];
    if (featureId === undefined || featureId === null) continue;
    addLandmassCandidate(fallbackCandidates, featureId, cellId);
    if (isContinentScaleLandmass(pack, cellId, continentScaleLandCells)) {
      addLandmassCandidate(continentScaleCandidates, featureId, cellId);
    }
  }

  // A separate continent is an independent expansion field: crossing the sea
  // is deliberately never treated as a shortcut between starting polities.
  // Do not consume a small island merely because it is visually farther away.
  const preferredCandidates =
    countLandmassCandidates(continentScaleCandidates) >= polityCount ? continentScaleCandidates : fallbackCandidates;
  const featureIds = [...preferredCandidates.keys()].sort(
    (left, right) => featureLandCells(pack, right) - featureLandCells(pack, left) || left - right
  );
  const candidateCells = [...preferredCandidates.values()].reduce<number[]>((allCells, landmassCells) => {
    allCells.push(...landmassCells);
    return allCells;
  }, []);
  return {
    cells: new Set(candidateCells),
    landmassOrder: createLandmassAllocationOrder(featureIds, polityCount)
  };
}

function addLandmassCandidate(candidates: Map<number, number[]>, featureId: number, cellId: number): void {
  const cells = candidates.get(featureId) ?? [];
  cells.push(cellId);
  candidates.set(featureId, cells);
}

function countLandmassCandidates(candidates: ReadonlyMap<number, readonly number[]>): number {
  return [...candidates.values()].reduce((total, cells) => total + cells.length, 0);
}

function createLandmassAllocationOrder(featureIds: readonly number[], polityCount: number): number[] {
  if (!featureIds.length || polityCount <= 0) return [];
  return Array.from({ length: polityCount }, (_, index) => featureIds[index % featureIds.length]);
}

/**
 * Picks frontier capitals. The first cell of every starting realm sits on a
 * river when one exists (coastal river-mouth preferred; required for seaborne).
 * Later realm cells grow as neighbours of that capital — realm size is not a
 * placement gate. Tiny isles are never starting homelands.
 * See docs/simulation/frontier-start-modes.md.
 */
export function selectFrontierStartCapitals(args: FrontierStartPlacementArgs): SettlementNode[] {
  const { plan, pack, count, startMode, realmSize } = args;
  if (count <= 0 || !plan.nodes.length) return [];

  const riverCapitals = selectRiverStartCapitals(args);
  if (riverCapitals.length) return riverCapitals;

  const points = pack.cells.p;
  const maxPerRegion = normalizeFrontierPolitySpacing(args.spacing) === "dispersed" ? 1 : undefined;
  let selected: SettlementNode[] = [];

  for (const minCells of frontierStartLandFloors(realmSize)) {
    const landEligible = plan.nodes.filter(node => isEligibleStartLandmass(pack, node.cell, minCells));
    const pool = startMode === "seaborne" ? preferSeaborneHarborNodes(plan, pack, landEligible, count) : landEligible;
    if (!pool.length) continue;
    selected = pickPreferredLandmassNodes(plan, pack, pool, points, count, maxPerRegion);
    if (selected.length) break;
  }

  if (!selected.length) {
    const notTiny = plan.nodes.filter(
      node => landFeatureCellCount(pack, node.cell) >= MIN_FRONTIER_START_LAND_CELLS_ABSOLUTE
    );
    selected = pickPreferredLandmassNodes(
      plan,
      pack,
      notTiny.length ? notTiny : plan.nodes,
      points,
      count,
      maxPerRegion
    );
  }

  if (startMode !== "seaborne") return selected;
  return snapCapitalsToOceanHarbors(plan, pack, selected);
}

function pickPreferredLandmassNodes(
  plan: SettlementFoundationPlan,
  pack: PackedGraph,
  pool: readonly SettlementNode[],
  points: PackedGraph["cells"]["p"],
  count: number,
  maxPerRegion: number | undefined
): SettlementNode[] {
  const continents = pool.filter(node => isContinentCell(pack, node.cell));
  if (!continents.length) {
    return selectInitialPolityCapitalNodes({ ...plan, nodes: [...pool] }, points, count, { maxPerRegion });
  }
  const selected = selectInitialPolityCapitalNodes({ ...plan, nodes: continents }, points, count, { maxPerRegion });
  if (selected.length >= count) return selected;
  const used = new Set(selected.map(node => node.cell));
  const rest = pool.filter(node => !used.has(node.cell) && !isContinentCell(pack, node.cell));
  if (!rest.length) return selected;
  return [
    ...selected,
    ...selectInitialPolityCapitalNodes({ ...plan, nodes: rest }, points, count - selected.length, { maxPerRegion })
  ];
}

function preferSeaborneHarborNodes(
  plan: SettlementFoundationPlan,
  pack: PackedGraph,
  landEligible: readonly SettlementNode[],
  count: number
): SettlementNode[] {
  const withHarbor = landEligible.filter(node => findOceanHarborCell(plan, pack, node) != null);
  if (withHarbor.length >= count || withHarbor.length === landEligible.length) return [...withHarbor];
  // Prefer harbors but keep enough inland nodes so polity count does not collapse.
  if (withHarbor.length) return [...withHarbor];
  return [...landEligible];
}

function snapCapitalsToOceanHarbors(
  plan: SettlementFoundationPlan,
  pack: PackedGraph,
  selected: readonly SettlementNode[]
): SettlementNode[] {
  const used = new Set<number>();
  return selected.map(node => {
    const harbor = findOceanHarborCell(plan, pack, node, used);
    if (harbor == null) return node;
    used.add(harbor);
    return harbor === node.cell ? node : { ...node, cell: harbor };
  });
}

function findOceanHarborCell(
  plan: SettlementFoundationPlan,
  pack: PackedGraph,
  node: SettlementNode,
  used: ReadonlySet<number> = new Set()
): number | null {
  const landFeatureId = pack.cells.f?.[node.cell];
  if (landFeatureId === undefined) return null;
  const regionCells = getFoundationRegionCells(plan, node.cell);
  // A capital must stay attached to its populated Foundation region. Choosing
  // an arbitrary harbour elsewhere on the same landmass would create a State
  // whose compact realm has no rural population after unclaimed cells are
  // intentionally cleared.
  if (!regionCells) return null;
  if (regionCells.has(node.cell) && isOpenOceanHarbor(pack, node.cell) && !used.has(node.cell)) return node.cell;

  let best: number | null = null;
  let bestHarbor = Number.POSITIVE_INFINITY;
  let bestScore = Number.NEGATIVE_INFINITY;

  const cells = pack.cells.i ?? [];
  for (let index = 0; index < cells.length; index++) {
    const cellId = cells[index];
    if (pack.cells.f?.[cellId] !== landFeatureId) continue;
    if (!regionCells.has(cellId)) continue;
    if (used.has(cellId)) continue;
    if (!isOpenOceanHarbor(pack, cellId)) continue;

    const harbor = pack.cells.harbor?.[cellId] ?? Number.POSITIVE_INFINITY;
    const score = pack.cells.s?.[cellId] ?? 0;
    const betterHarbor = harbor < bestHarbor;
    const betterScore =
      harbor === bestHarbor && (score > bestScore || (score === bestScore && cellId < (best ?? cellId)));
    if (best === null || betterHarbor || betterScore) {
      best = cellId;
      bestHarbor = harbor;
      bestScore = score;
    }
  }
  return best;
}

function isOpenOceanHarbor(pack: PackedGraph, cellId: number): boolean {
  if ((pack.cells.h?.[cellId] ?? 0) < 20) return false;
  if (!(pack.cells.harbor?.[cellId] > 0)) return false;
  return isTrueOceanHarborCell(cellId, pack);
}

function isEligibleStartLandmass(pack: PackedGraph, cellId: number, minCells: number): boolean {
  return landFeatureCellCount(pack, cellId) >= minCells;
}

function landFeatureCellCount(pack: PackedGraph, cellId: number): number {
  const featureId = pack.cells.f?.[cellId];
  if (featureId === undefined || featureId === null) return 0;
  const feature = pack.features?.[featureId];
  if (!feature?.land) return 0;
  return feature.cells ?? 0;
}

function getContinentScaleLandCellFloor(pack: PackedGraph, minimumLandCells: number): number {
  const largestLandmass = Math.max(
    0,
    ...(pack.features ?? []).filter(feature => feature?.land).map(feature => feature.cells ?? 0)
  );
  // Feature groups are heuristic labels. A 957-cell island beside a
  // 1,630-cell continent is still a major independent expansion field, while
  // a 107-cell isle beside a 3,000-cell continent is not. Use relative land
  // area so both continent and archipelago maps follow the same rule.
  return Math.max(minimumLandCells, Math.ceil(largestLandmass / 2));
}

function isContinentScaleLandmass(pack: PackedGraph, cellId: number, continentScaleLandCells: number): boolean {
  const featureId = pack.cells.f?.[cellId];
  if (featureId === undefined || featureId === null) return false;
  return isContinentFeature(pack, featureId) || featureLandCells(pack, featureId) >= continentScaleLandCells;
}

function getFoundationRegionCells(plan: SettlementFoundationPlan, capitalCell: number): Set<number> | null {
  const region = plan.regions.find(entry => entry.cells.includes(capitalCell));
  return region ? new Set(region.cells) : null;
}

/**
 * Capital = a river cell. Extra starting-realm cells are adjacent growth
 * (`collectStartingRealmCells`), so any realm size is on water. Prefer a
 * coastal mouth; seaborne requires a true ocean harbor. Several sites on
 * the same island space along the coast, not the map's Euclidean corners.
 */
function selectRiverStartCapitals(args: FrontierStartPlacementArgs): SettlementNode[] {
  const { plan, pack, count, startMode } = args;
  const spacing = normalizeFrontierPolitySpacing(args.spacing);
  const hopLadder = spacing === "dispersed" ? DISPERSED_COAST_HOPS : CLUSTERED_COAST_HOPS;
  const requireOcean = startMode === "seaborne";
  const foundationCells = new Set(plan.regions.flatMap(region => region.cells));
  const pickCapitals = (candidates: readonly number[]): number[] => {
    if (spacing !== "dispersed") return pickSpacedCoastalCells(pack, candidates, count, hopLadder);

    // Prefer one capital from each populated Foundation region before opening
    // a second homeland in any one region. This is the river/coast equivalent
    // of selectInitialPolityCapitalNodes(..., { maxPerRegion: 1 }).
    const regionalCandidates = getBestCandidatePerFoundationRegion(plan, pack, candidates);
    const preferred = pickSpacedCoastalCells(
      pack,
      regionalCandidates,
      Math.min(count, regionalCandidates.length),
      hopLadder
    );
    return preferred.length >= count
      ? preferred
      : pickSpacedCoastalCells(pack, candidates, count, hopLadder, preferred);
  };

  for (const minCells of frontierStartLandFloors(args.realmSize)) {
    const rivers = collectStartCells(pack, foundationCells, minCells, { requireRiver: true, requireOcean });
    if (rivers.length) {
      const picked = pickCapitals(rivers);
      if (picked.length) return picked.map((cellId, index) => toStartNode(plan, pack, cellId, index));
    }
  }

  if (requireOcean) {
    for (const minCells of frontierStartLandFloors(args.realmSize)) {
      const coasts = collectStartCells(pack, foundationCells, minCells, { requireRiver: false, requireOcean: true });
      if (coasts.length) {
        const picked = pickCapitals(coasts);
        if (picked.length) return picked.map((cellId, index) => toStartNode(plan, pack, cellId, index));
      }
    }
  }

  return [];
}

function collectStartCells(
  pack: PackedGraph,
  foundationCells: ReadonlySet<number>,
  minCells: number,
  flags: { requireRiver: boolean; requireOcean: boolean }
): number[] {
  const cells = pack.cells;
  const ids = cells.i ?? [];
  const found: number[] = [];
  for (let index = 0; index < ids.length; index++) {
    const cellId = ids[index];
    if (!foundationCells.has(cellId)) continue;
    if (!isEligibleStartLandmass(pack, cellId, minCells)) continue;
    if ((cells.h?.[cellId] ?? 0) < 20) continue;
    if (flags.requireRiver && !(cells.r?.[cellId] > 0)) continue;
    if (flags.requireOcean && !isOpenOceanHarbor(pack, cellId)) continue;
    found.push(cellId);
  }
  return found;
}

function getBestCandidatePerFoundationRegion(
  plan: SettlementFoundationPlan,
  pack: PackedGraph,
  candidates: readonly number[]
): number[] {
  const regionByCell = new Map<number, number>();
  for (const region of plan.regions) {
    for (const cellId of region.cells) regionByCell.set(cellId, region.id);
  }

  const bestByRegion = new Map<number, number>();
  for (const cellId of candidates) {
    const regionId = regionByCell.get(cellId);
    if (regionId === undefined) continue;
    const current = bestByRegion.get(regionId);
    if (
      current === undefined ||
      startCellScore(pack, cellId) > startCellScore(pack, current) ||
      (startCellScore(pack, cellId) === startCellScore(pack, current) && cellId < current)
    ) {
      bestByRegion.set(regionId, cellId);
    }
  }
  return [...bestByRegion.values()];
}

function isCoastalLandCell(pack: PackedGraph, cellId: number): boolean {
  const cells = pack.cells;
  if ((cells.h?.[cellId] ?? 0) < 20) return false;
  if ((cells.t?.[cellId] ?? 0) === 1) return true;
  if ((cells.harbor?.[cellId] ?? 0) > 0) return true;
  for (const neighbor of cells.c?.[cellId] ?? []) {
    if ((cells.h?.[neighbor] ?? 0) < 20) return true;
  }
  return false;
}

function startCellScore(pack: PackedGraph, cellId: number): number {
  const cells = pack.cells;
  const suitability = cells.s?.[cellId] ?? 0;
  const river = cells.r?.[cellId] > 0 ? 40 : 0;
  const ocean = isOpenOceanHarbor(pack, cellId) ? 30 : 0;
  const harbor = cells.harbor?.[cellId] > 0 ? Math.max(0, 12 - (cells.harbor[cellId] ?? 12)) : 0;
  return suitability + river + ocean + harbor;
}

function toStartNode(
  plan: SettlementFoundationPlan,
  pack: PackedGraph,
  cellId: number,
  ordinal: number
): SettlementNode {
  const region = plan.regions.find(entry => entry.cells.includes(cellId));
  return {
    id: 10_000 + ordinal,
    regionId: region?.id ?? 0,
    cell: cellId,
    role: "center",
    score: startCellScore(pack, cellId)
  };
}

function pickSpacedCoastalCells(
  pack: PackedGraph,
  candidates: readonly number[],
  count: number,
  hopLadder: readonly number[],
  initialPicks: readonly number[] = []
): number[] {
  if (!candidates.length || count <= 0) return [];
  const unique = [...new Set(candidates)];
  const byFeature = new Map<number, number[]>();
  for (const cellId of unique) {
    const featureId = pack.cells.f?.[cellId] ?? 0;
    const list = byFeature.get(featureId) ?? [];
    list.push(cellId);
    byFeature.set(featureId, list);
  }
  const features = [...byFeature.keys()].sort((left, right) => compareStartLandmass(pack, left, right));

  // Continents first. One-per-landmass across islands is how 4 states became
  // 2:2 (one each on two isles, then a second on the continent).
  const continentFeatures = features.filter(featureId => isContinentFeature(pack, featureId));
  const otherFeatures = features.filter(featureId => !isContinentFeature(pack, featureId));
  const picked = [...new Set(initialPicks)];
  fillSpacedLandmasses(
    pack,
    byFeature,
    continentFeatures.length ? continentFeatures : otherFeatures,
    picked,
    count,
    hopLadder
  );
  if (picked.length < count && continentFeatures.length) {
    fillSpacedLandmasses(pack, byFeature, otherFeatures, picked, count, hopLadder);
  }

  if (picked.length < count) {
    const leftover = unique
      .filter(cellId => !picked.includes(cellId))
      .sort((left, right) => startCellScore(pack, right) - startCellScore(pack, left) || left - right);
    for (const cellId of leftover) {
      if (picked.length >= count) break;
      picked.push(cellId);
    }
  }
  return picked.slice(0, count);
}

function fillSpacedLandmasses(
  pack: PackedGraph,
  byFeature: ReadonlyMap<number, number[]>,
  features: readonly number[],
  picked: number[],
  count: number,
  hopLadder: readonly number[]
): void {
  for (const featureId of features) {
    if (picked.length >= count) return;
    const best = [...byFeature.get(featureId)!].sort(
      (left, right) => startCellScore(pack, right) - startCellScore(pack, left) || left - right
    )[0];
    if (best !== undefined && !picked.includes(best)) picked.push(best);
  }

  for (const minHops of hopLadder) {
    if (picked.length >= count) return;
    for (const featureId of features) {
      if (picked.length >= count) return;
      const next = bestSpacedCoastalCell(
        pack,
        byFeature.get(featureId)!,
        picked.filter(cellId => (pack.cells.f?.[cellId] ?? 0) === featureId),
        minHops
      );
      if (next !== null && !picked.includes(next)) picked.push(next);
    }
  }
}

function isContinentFeature(pack: PackedGraph, featureId: number): boolean {
  return pack.features?.[featureId]?.group === "continent";
}

function isContinentCell(pack: PackedGraph, cellId: number): boolean {
  const featureId = pack.cells.f?.[cellId];
  return featureId !== undefined && isContinentFeature(pack, featureId);
}

function featureLandCells(pack: PackedGraph, featureId: number): number {
  const feature = pack.features?.[featureId];
  if (!feature?.land) return 0;
  return feature.cells ?? 0;
}

function compareStartLandmass(pack: PackedGraph, left: number, right: number): number {
  const continentDelta = Number(isContinentFeature(pack, right)) - Number(isContinentFeature(pack, left));
  if (continentDelta) return continentDelta;
  return featureLandCells(pack, right) - featureLandCells(pack, left) || left - right;
}

function bestSpacedCoastalCell(
  pack: PackedGraph,
  pool: readonly number[],
  already: readonly number[],
  minHops: number
): number | null {
  if (!already.length) {
    return (
      [...pool].sort((left, right) => startCellScore(pack, right) - startCellScore(pack, left) || left - right)[0] ??
      null
    );
  }
  const comfortable = minHops * 2;
  let best: number | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const cellId of pool) {
    if (already.includes(cellId)) continue;
    const nearest = Math.min(...already.map(other => coastalHopDistance(pack, cellId, other)));
    if (nearest < minHops) continue;
    const spacing = Math.min(nearest, comfortable) / comfortable;
    const score = startCellScore(pack, cellId) + spacing * 8;
    if (score > bestScore || (score === bestScore && cellId < (best ?? cellId))) {
      best = cellId;
      bestScore = score;
    }
  }
  return best;
}

function coastalHopDistance(pack: PackedGraph, from: number, to: number): number {
  if (from === to) return 0;
  const cells = pack.cells;
  if (cells.f?.[from] !== cells.f?.[to]) return Number.POSITIVE_INFINITY;
  const queue = [from];
  const hops = new Map<number, number>([[from, 0]]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    const currentHops = hops.get(current) ?? 0;
    for (const neighbor of cells.c?.[current] ?? []) {
      if (hops.has(neighbor)) continue;
      if ((cells.f?.[neighbor] ?? -1) !== (cells.f?.[from] ?? -2)) continue;
      if (!isCoastalLandCell(pack, neighbor) && !isOpenOceanHarbor(pack, neighbor)) continue;
      if (neighbor === to) return currentHops + 1;
      hops.set(neighbor, currentHops + 1);
      queue.push(neighbor);
    }
  }
  return Number.POSITIVE_INFINITY;
}

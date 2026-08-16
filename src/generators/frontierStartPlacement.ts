import type { PackedGraph } from "../types/PackedGraph";
import type { SettlementFoundationPlan, SettlementNode } from "../types/settlementFoundation";
import type { FrontierPolitySpacing, FrontierStartMode } from "../types/WorldState";
import { DEBUG, INFO } from "../utils/debug";
import {
  frontierStartLandFloors,
  MIN_FRONTIER_START_LAND_CELLS_ABSOLUTE,
  normalizeFrontierPolitySpacing
} from "../utils/frontierStartMode";
import { isTrueOceanHarborCell } from "../utils/oceanPort";
import {
  allocateFrontierLandmassSlots,
  type FrontierClimateColumns,
  type FrontierStartAuditRecord,
  type LandmassGrowthPotential,
  landHopDistance,
  measureLandmassPotential,
  measureStartRegionPotential
} from "./frontierStartPotential";
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

export interface DispersedFrontierFoundationStarts {
  readonly cells: ReadonlySet<number>;
  /** Land feature selected for each initial polity, ordered by polity ordinal. */
  readonly landmassOrder: readonly number[];
}

/** @deprecated Use DispersedFrontierFoundationStarts. */
export type DispersedSeaborneFoundationStarts = DispersedFrontierFoundationStarts;

export interface DispersedFrontierStartArgs {
  readonly pack: PackedGraph;
  readonly realmSize: number;
  readonly polityCount: number;
  readonly startMode?: FrontierStartMode;
  readonly climate?: FrontierClimateColumns;
}

/**
 * Returns the landmass-aware start cells that can anchor independent Frontier
 * homelands. Foundation generation uses this before it distributes population,
 * so dispersed capital placement is not later forced back into one estuary.
 */
export function getPreferredDispersedFrontierStarts(
  args: DispersedFrontierStartArgs
): DispersedFrontierFoundationStarts {
  const { pack, realmSize, polityCount, climate } = args;
  const startMode = args.startMode ?? "landOrigin";
  if (polityCount <= 0) return { cells: new Set(), landmassOrder: [] };

  for (const minCells of frontierStartLandFloors(realmSize)) {
    const selected = selectDispersedStartLandmasses(pack, minCells, polityCount, startMode, climate);
    if (selected.landmassOrder.length) return selected;
  }

  return selectDispersedStartLandmasses(pack, MIN_FRONTIER_START_LAND_CELLS_ABSOLUTE, polityCount, startMode, climate);
}

/**
 * Seaborne wrapper kept for existing tests and regenerate paths.
 */
export function getPreferredDispersedSeaborneFoundationCells(
  pack: PackedGraph,
  realmSize: number,
  polityCount: number,
  climate?: FrontierClimateColumns
): DispersedFrontierFoundationStarts {
  return getPreferredDispersedFrontierStarts({
    pack,
    realmSize,
    polityCount,
    startMode: "seaborne",
    climate
  });
}

function selectDispersedStartLandmasses(
  pack: PackedGraph,
  minCells: number,
  polityCount: number,
  startMode: FrontierStartMode,
  climate?: FrontierClimateColumns
): DispersedFrontierFoundationStarts {
  const startSites = collectLandmassStartSites(pack, minCells, startMode);
  const landmasses: LandmassGrowthPotential[] = [...startSites.entries()].map(([featureId, cells]) => ({
    ...measureLandmassPotential(pack, featureId, climate),
    startSites: cells.length
  }));
  const landmassOrder = allocateFrontierLandmassSlots(landmasses, polityCount);
  const allocated = new Set(landmassOrder);
  const cells = new Set<number>();
  for (const featureId of allocated) {
    for (const cellId of startSites.get(featureId) ?? []) cells.add(cellId);
  }
  return { cells, landmassOrder };
}

function collectLandmassStartSites(
  pack: PackedGraph,
  minCells: number,
  startMode: FrontierStartMode
): Map<number, number[]> {
  const requireOcean = startMode === "seaborne";
  const sites = new Map<number, number[]>();
  for (const cellId of pack.cells.i ?? []) {
    if (!isEligibleStartLandmass(pack, cellId, minCells)) continue;
    if ((pack.cells.h?.[cellId] ?? 0) < 20) continue;
    const featureId = pack.cells.f?.[cellId];
    if (featureId === undefined || featureId === null) continue;
    if (requireOcean) {
      if (!isOpenOceanHarbor(pack, cellId)) continue;
    } else if (!isLandOriginStartSite(pack, cellId)) {
      continue;
    }
    addLandmassCandidate(sites, featureId, cellId);
  }
  return sites;
}

function isLandOriginStartSite(pack: PackedGraph, cellId: number): boolean {
  if ((pack.cells.r?.[cellId] ?? 0) > 0) return true;
  if ((pack.cells.harbor?.[cellId] ?? 0) > 0) return true;
  if ((pack.cells.t?.[cellId] ?? 0) === 1) return true;
  return (pack.cells.conf?.[cellId] ?? 0) > 0;
}

function addLandmassCandidate(candidates: Map<number, number[]>, featureId: number, cellId: number): void {
  const cells = candidates.get(featureId) ?? [];
  cells.push(cellId);
  candidates.set(featureId, cells);
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
  if (riverCapitals.length) return finishFrontierCapitalSelection(args, riverCapitals);

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

  return finishFrontierCapitalSelection(args, selected);
}

function finishFrontierCapitalSelection(
  args: FrontierStartPlacementArgs,
  selected: readonly SettlementNode[]
): SettlementNode[] {
  const placed =
    args.startMode !== "seaborne" ? [...selected] : snapCapitalsToOceanHarbors(args.plan, args.pack, selected);
  if (normalizeFrontierPolitySpacing(args.spacing) === "dispersed") {
    logFrontierStartAudit(buildFrontierStartAudit(args.plan, args.pack, placed));
  }
  return placed;
}

export function buildFrontierStartAudit(
  plan: SettlementFoundationPlan,
  pack: PackedGraph,
  selected: readonly SettlementNode[]
): FrontierStartAuditRecord[] {
  return selected.map(node => {
    const landmassId = pack.cells.f?.[node.cell] ?? 0;
    const region = plan.regions.find(entry => entry.id === node.regionId || entry.cells.includes(node.cell));
    const regionCells = region?.cells ?? [node.cell];
    const ruralPopulation = regionCells.reduce((sum, cellId) => sum + (pack.cells.pop?.[cellId] ?? 0), 0);
    const scored = measureStartRegionPotential(pack, node.cell);
    const nearestSameLandmassCapitalHops = Math.min(
      Number.POSITIVE_INFINITY,
      ...selected
        .filter(other => other.cell !== node.cell && (pack.cells.f?.[other.cell] ?? 0) === landmassId)
        .map(other => landHopDistance(pack, node.cell, other.cell))
    );
    return {
      capitalCell: node.cell,
      regionId: node.regionId,
      landmassId,
      ruralPopulation,
      surplusPopulation: scored.surplusPopulation,
      firstRingCandidateCells: scored.firstRingCandidateCells,
      potential: scored.potential,
      nearestSameLandmassCapitalHops
    };
  });
}

function logFrontierStartAudit(records: readonly FrontierStartAuditRecord[]): void {
  if (!INFO || !DEBUG.frontierStart || !records.length) return;
  console.info(
    "Frontier start audit",
    records.map(record => ({
      ...record,
      nearestSameLandmassCapitalHops: Number.isFinite(record.nearestSameLandmassCapitalHops)
        ? record.nearestSameLandmassCapitalHops
        : "none"
    }))
  );
}

function pickPreferredLandmassNodes(
  plan: SettlementFoundationPlan,
  pack: PackedGraph,
  pool: readonly SettlementNode[],
  points: PackedGraph["cells"]["p"],
  count: number,
  maxPerRegion: number | undefined
): SettlementNode[] {
  const byFeature = new Map<number, SettlementNode[]>();
  for (const node of pool) {
    const featureId = pack.cells.f?.[node.cell] ?? 0;
    const list = byFeature.get(featureId) ?? [];
    list.push(node);
    byFeature.set(featureId, list);
  }
  const landmasses: LandmassGrowthPotential[] = [...byFeature.entries()].map(([featureId, nodes]) => ({
    ...measureLandmassPotential(pack, featureId),
    startSites: nodes.length
  }));
  const order = allocateFrontierLandmassSlots(landmasses, count);
  if (!order.length) {
    return selectInitialPolityCapitalNodes({ ...plan, nodes: [...pool] }, points, count, { maxPerRegion });
  }

  const selected: SettlementNode[] = [];
  const used = new Set<number>();
  for (const featureId of order) {
    const remaining = (byFeature.get(featureId) ?? []).filter(node => !used.has(node.cell));
    if (!remaining.length) continue;
    const [next] = selectInitialPolityCapitalNodes({ ...plan, nodes: remaining }, points, 1, { maxPerRegion });
    if (!next) continue;
    selected.push(next);
    used.add(next.cell);
  }
  if (selected.length >= count) return selected.slice(0, count);
  const leftover = pool.filter(node => !used.has(node.cell));
  if (!leftover.length) return selected;
  return [
    ...selected,
    ...selectInitialPolityCapitalNodes({ ...plan, nodes: leftover }, points, count - selected.length, { maxPerRegion })
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
  const landmasses: LandmassGrowthPotential[] = [...byFeature.entries()].map(([featureId, cells]) => ({
    ...measureLandmassPotential(pack, featureId),
    startSites: cells.length
  }));
  const allocated = allocateFrontierLandmassSlots(landmasses, count);
  const uniqueAllocated = [...new Set(allocated)];
  const leftoverFeatures = [...byFeature.keys()]
    .filter(featureId => !uniqueAllocated.includes(featureId))
    .sort((left, right) => compareStartLandmass(pack, left, right));
  const features = uniqueAllocated.length ? [...uniqueAllocated, ...leftoverFeatures] : leftoverFeatures;
  const picked = [...new Set(initialPicks)];
  fillSpacedLandmasses(pack, byFeature, features, picked, count, hopLadder);

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

function featureLandCells(pack: PackedGraph, featureId: number): number {
  const feature = pack.features?.[featureId];
  if (!feature?.land) return 0;
  return feature.cells ?? 0;
}

function compareStartLandmass(pack: PackedGraph, left: number, right: number): number {
  const potentialDelta =
    measureLandmassPotential(pack, right).potential - measureLandmassPotential(pack, left).potential;
  if (potentialDelta) return potentialDelta;
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

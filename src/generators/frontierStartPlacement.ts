import type { PackedGraph } from "../types/PackedGraph";
import type { SettlementFoundationPlan, SettlementNode } from "../types/settlementFoundation";
import type { FrontierPolitySpacing, FrontierStartMode } from "../types/WorldState";
import {
  frontierStartLandFloors,
  MIN_FRONTIER_START_LAND_CELLS_ABSOLUTE,
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
    selected = selectInitialPolityCapitalNodes({ ...plan, nodes: pool }, points, count, { maxPerRegion });
    if (selected.length) break;
  }

  if (!selected.length) {
    const notTiny = plan.nodes.filter(
      node => landFeatureCellCount(pack, node.cell) >= MIN_FRONTIER_START_LAND_CELLS_ABSOLUTE
    );
    selected = selectInitialPolityCapitalNodes(
      { ...plan, nodes: notTiny.length ? notTiny : plan.nodes },
      points,
      count,
      { maxPerRegion }
    );
  }

  if (startMode !== "seaborne") return selected;
  return snapCapitalsToOceanHarbors(plan, pack, selected);
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
  if (isOpenOceanHarbor(pack, node.cell) && !used.has(node.cell)) return node.cell;

  const landFeatureId = pack.cells.f?.[node.cell];
  if (landFeatureId === undefined) return null;
  const regionCells = getFoundationRegionCells(plan, node.cell);

  let best: number | null = null;
  let bestInRegion = false;
  let bestHarbor = Number.POSITIVE_INFINITY;
  let bestScore = Number.NEGATIVE_INFINITY;

  const cells = pack.cells.i ?? [];
  for (let index = 0; index < cells.length; index++) {
    const cellId = cells[index];
    if (pack.cells.f?.[cellId] !== landFeatureId) continue;
    if (used.has(cellId)) continue;
    if (!isOpenOceanHarbor(pack, cellId)) continue;

    const inRegion = regionCells ? regionCells.has(cellId) : false;
    const harbor = pack.cells.harbor?.[cellId] ?? Number.POSITIVE_INFINITY;
    const score = pack.cells.s?.[cellId] ?? 0;
    const betterRegion = inRegion && !bestInRegion;
    const sameRegion = inRegion === bestInRegion;
    const betterHarbor = sameRegion && harbor < bestHarbor;
    const betterScore =
      sameRegion && harbor === bestHarbor && (score > bestScore || (score === bestScore && cellId < (best ?? cellId)));
    if (best === null || betterRegion || betterHarbor || betterScore) {
      best = cellId;
      bestInRegion = inRegion;
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

  for (const minCells of frontierStartLandFloors(args.realmSize)) {
    const rivers = collectStartCells(pack, minCells, { requireRiver: true, requireOcean });
    if (rivers.length) {
      const picked = pickSpacedCoastalCells(pack, rivers, count, hopLadder);
      if (picked.length) return picked.map((cellId, index) => toStartNode(plan, pack, cellId, index));
    }
  }

  if (requireOcean) {
    for (const minCells of frontierStartLandFloors(args.realmSize)) {
      const coasts = collectStartCells(pack, minCells, { requireRiver: false, requireOcean: true });
      if (coasts.length) {
        const picked = pickSpacedCoastalCells(pack, coasts, count, hopLadder);
        if (picked.length) return picked.map((cellId, index) => toStartNode(plan, pack, cellId, index));
      }
    }
  }

  return [];
}

function collectStartCells(
  pack: PackedGraph,
  minCells: number,
  flags: { requireRiver: boolean; requireOcean: boolean }
): number[] {
  const cells = pack.cells;
  const ids = cells.i ?? [];
  const found: number[] = [];
  for (let index = 0; index < ids.length; index++) {
    const cellId = ids[index];
    if (!isEligibleStartLandmass(pack, cellId, minCells)) continue;
    if ((cells.h?.[cellId] ?? 0) < 20) continue;
    if (flags.requireRiver && !(cells.r?.[cellId] > 0)) continue;
    if (flags.requireOcean && !isOpenOceanHarbor(pack, cellId)) continue;
    found.push(cellId);
  }
  return found;
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
  hopLadder: readonly number[]
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
  const features = [...byFeature.keys()].sort(
    (left, right) =>
      landFeatureCellCount(pack, byFeature.get(right)![0]) - landFeatureCellCount(pack, byFeature.get(left)![0])
  );

  const picked: number[] = [];
  // First pass: one best river-mouth per landmass so states are not stacked
  // on a single beach, without forcing every capital onto the map rim.
  for (const featureId of features) {
    if (picked.length >= count) break;
    const best = [...byFeature.get(featureId)!].sort(
      (left, right) => startCellScore(pack, right) - startCellScore(pack, left) || left - right
    )[0];
    picked.push(best);
  }

  for (const minHops of hopLadder) {
    if (picked.length >= count) break;
    for (const featureId of features) {
      if (picked.length >= count) break;
      const next = bestSpacedCoastalCell(
        pack,
        byFeature.get(featureId)!,
        picked.filter(cellId => (pack.cells.f?.[cellId] ?? 0) === featureId),
        minHops
      );
      if (next !== null && !picked.includes(next)) picked.push(next);
    }
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

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

export interface FrontierStartPlacementArgs {
  readonly plan: SettlementFoundationPlan;
  readonly pack: PackedGraph;
  readonly count: number;
  readonly startMode: FrontierStartMode;
  readonly realmSize: number;
  readonly spacing?: FrontierPolitySpacing;
}

/**
 * Picks frontier capitals from foundation nodes, then (for seaborne) snaps each
 * site onto a true ocean harbor on the same landmass.
 *
 * Tiny isles are never starting homelands. See docs/simulation/frontier-start-modes.md.
 */
export function selectFrontierStartCapitals(args: FrontierStartPlacementArgs): SettlementNode[] {
  const { plan, pack, count, startMode, realmSize } = args;
  if (count <= 0 || !plan.nodes.length) return [];

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

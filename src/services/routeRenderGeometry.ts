/** Read-only route control points shared by FMG rendering, CE and saved-map audits. */
import type { WorldContext } from "../context/worldContext";
import type { Route } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { rn } from "../utils/numberUtils";
import { bendRouteAwayFromCoast } from "./coastalRouteApproach";

type Point = [number, number];

/**
 * Midpoint of the shared Voronoi edge between two adjacent cells (average of the
 * two vertices that bound the shared face). May sit off the center–center chord;
 * only insert when that chord would clip a higher third cell (see densifyLandRoutePoints).
 */
function getSharedEdgeMidpoint(cell1: number, cell2: number, pack: PackedGraph): Point | null {
  const { cells, vertices } = pack;
  if (!cells.v?.[cell1] || !vertices?.p || !vertices?.c) return null;
  const common = cells.v[cell1].filter((vertex: number) =>
    vertices.c[vertex]?.some((cellId: number) => cellId === cell2)
  );
  if (common.length < 2) return null;
  const p0 = vertices.p[common[0]];
  const p1 = vertices.p[common[1]];
  if (!p0 || !p1) return null;
  return [rn((p0[0] + p1[0]) / 2, 2), rn((p0[1] + p1[1]) / 2, 2)];
}

function distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * True when the center–center chord of cellA–cellB passes near a neighbouring cell
 * that is meaningfully higher (peak clip risk, e.g. 5102→5272 near 5271).
 */
function centerChordClipsHigherNeighbour(cellA: number, cellB: number, pack: PackedGraph): boolean {
  const { cells } = pack;
  const pa = cells.p[cellA];
  const pb = cells.p[cellB];
  if (!pa || !pb) return false;
  const hCap = Math.max(cells.h[cellA] ?? 0, cells.h[cellB] ?? 0);
  const neighbours = new Set<number>([...(cells.c[cellA] ?? []), ...(cells.c[cellB] ?? [])]);
  neighbours.delete(cellA);
  neighbours.delete(cellB);
  // How close a third cell center must be to the chord to count as a clip (map units).
  const near = Math.max(4, Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) * 0.35);
  for (const n of neighbours) {
    const pn = cells.p[n];
    if (!pn || (cells.h[n] ?? 0) < 20) continue;
    // Only detour for clearly higher ground (local ridge/peak), not equal foothills.
    if ((cells.h[n] ?? 0) < hCap + 8) continue;
    if (distPointToSegment(pn[0], pn[1], pa[0], pa[1], pb[0], pb[1]) <= near) return true;
  }
  return false;
}

/**
 * Collapse center/mid/center artifacts from an earlier always-on densify (same cell id
 * twice in a row): keep the point closer to the cell generator.
 */
function collapseRedundantCellPoints(
  points: number[][],
  pack: PackedGraph,
  preservedPoints?: ReadonlySet<number[]>
): number[][] {
  const { cells } = pack;
  const out: number[][] = [];
  for (const p of points) {
    const cellId = p[2];
    if (out.length && out[out.length - 1][2] === cellId && cellId !== undefined) {
      const prev = out[out.length - 1];
      if (preservedPoints?.has(prev)) {
        if (preservedPoints.has(p)) out.push(p);
        continue;
      }
      if (preservedPoints?.has(p)) {
        out[out.length - 1] = p;
        continue;
      }
      const center = cells.p?.[cellId];
      if (center) {
        const dPrev = Math.hypot(prev[0] - center[0], prev[1] - center[1]);
        const dNew = Math.hypot(p[0] - center[0], p[1] - center[1]);
        if (dNew < dPrev) out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/** Canonical map position for a pack cell (burg anchor if present, else cell generator). */
function cellAnchor(cellId: number, pack: PackedGraph): Point | null {
  const burgId = pack.cells.burg?.[cellId];
  if (burgId) {
    const burg = pack.burgs[burgId];
    if (burg && Number.isFinite(burg.x) && Number.isFinite(burg.y)) return [burg.x, burg.y];
  }
  const p = pack.cells.p?.[cellId];
  if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) return [p[0], p[1]];
  return null;
}

/**
 * Snap every control point to the cell's canonical anchor so two routes that share a
 * cell always meet. Per-route sharp-angle offsets previously left stub trails visually
 * short of the main path (Nesia 151 @ 3652 vs 166 @ 3652 ≈ 5.4 map units apart).
 */
function snapRoutePointsToCellAnchors(
  points: number[][],
  pack: PackedGraph,
  preservedPoints?: ReadonlySet<number[]>
): number[][] {
  return points.map(p => {
    if (preservedPoints?.has(p)) return p;
    const cellId = p[2];
    if (cellId === undefined) return p;
    const anchor = cellAnchor(cellId, pack);
    return anchor ? [anchor[0], anchor[1], cellId] : p;
  });
}

/**
 * For land-route rendering only: between consecutive cells, insert a shared-edge
 * midpoint **only** when the center–center chord would clip a higher neighbour.
 * Always-on insertion caused needless zigzags (Ondrepieds route 151 through 4702/4913).
 */
export function densifyLandRoutePoints(
  points: number[][],
  pack: PackedGraph,
  preservedPoints?: ReadonlySet<number[]>
): number[][] {
  if (points.length < 2) return points;
  if (!pack?.cells?.p) return points;
  const collapsed = collapseRedundantCellPoints(points, pack, preservedPoints);
  const snapped = snapRoutePointsToCellAnchors(collapsed, pack, preservedPoints);
  if (snapped.length < 2) return snapped;

  const densified: number[][] = [];
  for (let i = 0; i < snapped.length; i++) {
    densified.push(snapped[i]);
    if (i >= snapped.length - 1) continue;
    const cellA = snapped[i][2];
    const cellB = snapped[i + 1][2];
    if (cellA === undefined || cellB === undefined || cellA === cellB) continue;
    if (!centerChordClipsHigherNeighbour(cellA, cellB, pack)) continue;
    const mid = getSharedEdgeMidpoint(cellA, cellB, pack);
    if (!mid) continue;
    densified.push([mid[0], mid[1], cellA]);
  }
  return densified;
}

/** Engineered roads retain their surveyed coordinates instead of snapping to
 * cell centers. Ordinary roads joining them must retain the same junction too.
 * Match coordinates as well as cells: a bridge can have several distinct
 * control points in one cell, none of which may be moved to another anchor. */
function engineeredJunctionPoints(points: number[][], pack: Readonly<PackedGraph>): ReadonlySet<number[]> {
  const byCell = new Map<number, number[][]>();
  for (const p of points) {
    const cell = byCell.get(p[2]);
    if (cell) cell.push(p);
    else byCell.set(p[2], [p]);
  }
  const preserved = new Set<number[]>();
  for (const route of pack.routes ?? []) {
    if (route.group === "searoutes" || route.registeredConnectionId !== undefined) continue;
    if (!route.riverRoadConvergence && !route.fixedSettlementApproach) continue;
    for (const q of route.points) {
      for (const p of byCell.get(q[2]) ?? []) {
        if (p[0] === q[0] && p[1] === q[1]) preserved.add(p);
      }
    }
  }
  return preserved;
}

/** A sea lane stops at its port's haven-edge anchor, which depends only on the
 * cell; a waterfront-settled town sits elsewhere on that shore. Close the gap. */
function seaRouteToPortBurgs(pack: Readonly<PackedGraph>, points: number[][]): number[][] {
  const town = (p: number[] | undefined) => {
    const burg = p && pack.burgs[pack.cells.burg?.[p[2]] ?? 0];
    return burg?.i && !burg.removed && burg.port && Math.hypot(p![0] - burg.x, p![1] - burg.y) > 1e-7 ? burg : null;
  };
  if (points.length < 2) return points;
  const first = town(points[0]),
    last = town(points.at(-1));
  if (!first && !last) return points;
  return [
    ...(first ? [[first.x, first.y, points[0][2]]] : []),
    ...points,
    ...(last ? [[last.x, last.y, points.at(-1)![2]]] : [])
  ];
}

export function routeRenderPoints(
  world: Readonly<WorldContext>,
  route: {
    group: string;
    points: number[][];
    riverRoadConvergence?: Route["riverRoadConvergence"];
    fixedSettlementApproach?: boolean;
  },
  distanceUnit: string
): number[][] {
  if (route.group === "searoutes") return seaRouteToPortBurgs(world.pack, route.points);
  const points =
    route.riverRoadConvergence || route.fixedSettlementApproach
      ? route.points
      : densifyLandRoutePoints(route.points, world.pack, engineeredJunctionPoints(route.points, world.pack));
  return bendRouteAwayFromCoast(world, points, distanceUnit);
}

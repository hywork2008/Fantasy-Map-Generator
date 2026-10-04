import type { WorldContext } from "../context/worldContext";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { footprintBounds } from "./physicalWaterIndex";
import { RIVER_GEOMETRY_TOLERANCE, type RiverPoint } from "./riverGeometry";
import { footprintTouchesWater, validWaterPolygon } from "./riverPhysicalGeometry";
import { SpatialBoundsIndex } from "./spatialBoundsIndex";
import { worldCellConvexPieces } from "./worldCellGeometry";

export interface WorldLandCellPolicy {
  cellId: number;
  stateId: number;
  height: number;
}
export interface WorldFootprintPolicySettings {
  maxCells: number;
  maxVertices: number;
  maxClipOperations: number;
  maxRemainingPieces: number;
}
export type WorldFootprintAssessment =
  | { status: "allowed" }
  | { status: "blocked"; reason: "outside-world" | "forbidden-cell" | "unsupported-cell" | "uncovered-region" }
  | {
      status: "unresolved";
      reason: "invalid-footprint" | "numeric-geometry" | "vertex-budget" | "clip-budget" | "piece-budget";
    };
export interface WorldLandFootprintPolicy {
  /** Snapshot evaluation; rebuild after cell geometry, state or permissions change. */
  assess: (footprint: readonly RiverPoint[], purpose: "passage" | "dry-support") => WorldFootprintAssessment;
}
const eps = RIVER_GEOMETRY_TOLERANCE;
const side = (a: RiverPoint, b: RiverPoint, p: RiverPoint) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function area(p: readonly RiverPoint[]): number {
  return Math.abs(p.reduce((s, a, i) => s + side(p[0], a, p[(i + 1) % p.length]), 0)) / 2;
}
function convex(p: readonly RiverPoint[]): boolean {
  if (!validWaterPolygon({ id: 0, rings: [p] })) return false;
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const v = side(p[i], p[(i + 1) % p.length], p[(i + 2) % p.length]);
    if (!Number.isFinite(v)) return false;
    if (v === 0) continue;
    if (sign && Math.sign(v) !== sign) return false;
    sign = Math.sign(v);
  }
  return !!sign;
}
function clip(p: readonly RiverPoint[], a: RiverPoint, b: RiverPoint, orientation: number): RiverPoint[] | null {
  const out: RiverPoint[] = [];
  for (let i = 0; i < p.length; i++) {
    const u = p[i],
      v = p[(i + 1) % p.length],
      du = side(a, b, u) * orientation,
      dv = side(a, b, v) * orientation;
    if (!Number.isFinite(du) || !Number.isFinite(dv)) return null;
    if (du >= 0) out.push(u);
    if ((du < 0 && dv > 0) || (du > 0 && dv < 0)) {
      if (!Number.isFinite(du - dv)) return null;
      const t = du / (du - dv);
      out.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]);
    }
  }
  return out;
}
/** Cell polygons are a conservative support/political mask, not physical river
 * banks or a continuous slope model. Passage permission also applies over water.
 * Coverage is proved by subtracting the union of permitted convex cell pieces; shared
 * borders do not count as gaps and overlap cannot conceal a forbidden cell.
 */
export function buildWorldLandFootprintPolicy(
  world: Readonly<WorldContext>,
  distanceUnit: string,
  settings: WorldFootprintPolicySettings,
  rules: {
    allowsCell: (cell: Readonly<WorldLandCellPolicy>) => boolean;
    supportsCell: (cell: Readonly<WorldLandCellPolicy>) => boolean;
  }
):
  | { policy: WorldLandFootprintPolicy }
  | { reason: "invalid-input" | "cell-budget" | "vertex-budget" | "invalid-cell" | "triangulation-budget" } {
  if (
    ![settings.maxCells, settings.maxVertices, settings.maxClipOperations, settings.maxRemainingPieces].every(
      v => Number.isSafeInteger(v) && v > 0
    ) ||
    typeof rules.allowsCell !== "function" ||
    typeof rules.supportsCell !== "function"
  )
    return { reason: "invalid-input" };
  const scale = mapUnitMeters(world.distanceScale, distanceUnit),
    width = world.graphWidth * scale,
    height = world.graphHeight * scale;
  if (![scale, width, height].every(v => Number.isFinite(v) && v > 0)) return { reason: "invalid-input" };
  if (
    !world.pack?.cells?.i ||
    !world.pack.cells.v ||
    !world.pack.cells.h ||
    !world.pack.cells.state ||
    !world.pack.vertices?.p
  )
    return { reason: "invalid-cell" };
  const ids = Array.from(world.pack.cells.i);
  if (ids.length > settings.maxCells) return { reason: "cell-budget" };
  if (!ids.length || new Set(ids).size !== ids.length) return { reason: "invalid-cell" };
  const cells: { polygon: RiverPoint[]; allowed: boolean; supported: boolean; orientation: number }[] = [];
  let vertices = 0;
  for (const id of ids.sort((a, b) => a - b)) {
    const refs = world.pack.cells.v[id],
      h = world.pack.cells.h[id],
      stateId = world.pack.cells.state[id];
    if (
      !Number.isSafeInteger(id) ||
      id < 0 ||
      !refs ||
      !Number.isFinite(h) ||
      !Number.isSafeInteger(stateId) ||
      stateId < 0
    )
      return { reason: "invalid-cell" };
    vertices += refs.length;
    if (vertices > settings.maxVertices) return { reason: "vertex-budget" };
    const decomposed = worldCellConvexPieces(world, id, scale, settings.maxClipOperations);
    if (!("pieces" in decomposed)) return decomposed;
    const cell = Object.freeze({ cellId: id, stateId, height: h });
    const allowed = rules.allowsCell(cell),
      supported = h >= 20 && rules.supportsCell(cell);
    for (const polygon of decomposed.pieces) {
      cells.push({
        polygon,
        allowed,
        supported,
        orientation: Math.sign(
          polygon.reduce((s, a, i) => s + side(polygon[0], a, polygon[(i + 1) % polygon.length]), 0)
        )
      });
    }
  }

  // Copy budgets into this session snapshot, independently of caller mutation.
  const maxClipOperations = settings.maxClipOperations,
    maxRemainingPieces = settings.maxRemainingPieces,
    maxVertices = settings.maxVertices;
  const index = new SpatialBoundsIndex(cells, c => footprintBounds(c.polygon)!);
  return {
    policy: Object.freeze({
      assess(footprint: readonly RiverPoint[], purpose: "passage" | "dry-support"): WorldFootprintAssessment {
        if (footprint.length > maxVertices) return { status: "unresolved", reason: "vertex-budget" };
        if ((purpose !== "passage" && purpose !== "dry-support") || !convex(footprint))
          return { status: "unresolved", reason: "invalid-footprint" };
        if (footprint.some(p => p[0] < 0 || p[1] < 0 || p[0] > width || p[1] > height))
          return { status: "blocked", reason: "outside-world" };
        const bounds = footprintBounds(footprint)!;
        const nearby = index.query({
          minX: bounds.minX - eps,
          minY: bounds.minY - eps,
          maxX: bounds.maxX + eps,
          maxY: bounds.maxY + eps
        });
        for (const c of nearby) {
          if (
            (!c.allowed || (purpose === "dry-support" && !c.supported)) &&
            footprintTouchesWater(footprint, { id: 0, rings: [c.polygon] })
          )
            return { status: "blocked", reason: c.allowed ? "unsupported-cell" : "forbidden-cell" };
        }
        let remaining: (readonly RiverPoint[])[] = [footprint],
          operations = 0;
        for (const c of nearby) {
          if (!c.allowed || (purpose === "dry-support" && !c.supported)) continue;
          const next: (readonly RiverPoint[])[] = [];
          for (const piece of remaining) {
            let inside = piece;
            for (let i = 0; i < c.polygon.length && inside.length >= 3; i++) {
              if (++operations > maxClipOperations) return { status: "unresolved", reason: "clip-budget" };
              const a = c.polygon[i],
                b = c.polygon[(i + 1) % c.polygon.length];
              const outside = clip(inside, a, b, -c.orientation);
              if (!outside || !Number.isFinite(area(outside)))
                return { status: "unresolved", reason: "numeric-geometry" };
              if (outside.length >= 3 && area(outside) > eps * eps) next.push(outside);
              if (next.length > maxRemainingPieces) return { status: "unresolved", reason: "piece-budget" };
              const clipped = clip(inside, a, b, c.orientation);
              if (!clipped) return { status: "unresolved", reason: "numeric-geometry" };
              inside = clipped;
            }
          }
          remaining = next;
          if (!remaining.length) return { status: "allowed" };
        }
        return { status: "blocked", reason: "uncovered-region" };
      }
    })
  };
}

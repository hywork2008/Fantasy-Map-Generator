import type { WorldContext } from "../context/worldContext";
import type { River } from "../types/models";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { meanderRiverPoints, physicalRiverWidth, riverDisplayOffset } from "../utils/riverShape";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "./physicalWaterIndex";
import { buildCatmullRomRiverAxis, type RiverCurvePrecision } from "./riverCurveGeometry";
import type { RiverPoint } from "./riverGeometry";
import type { PhysicalRiverGeometry, PhysicalWaterPolygon } from "./riverPhysicalGeometry";
import {
  buildPhysicalRiverGeometry,
  type RiverBankSampling,
  type RiverWidthSurvey
} from "./riverPhysicalGeometryBuilder";

export interface WorldRiverGeometrySettings {
  curveAlpha: number;
  precision: RiverCurvePrecision;
  banks: RiverBankSampling;
  /** Source budget is separate from adaptive bank sampling. */
  maxSourcePoints: number;
}
export interface RiverGeometryBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export type WorldRiverGeometryResult = {
  riverId: number;
  geometryVersion: number;
  metersPerMapUnit: number;
  source: "points" | "cells";
  warnings: readonly "points-length-mismatch"[];
} & (
  | { geometry: PhysicalRiverGeometry; bounds: RiverGeometryBounds; sampleCount: number }
  | {
      reason:
        | "invalid-source"
        | "invalid-scale"
        | "source-budget"
        | "invalid-width"
        | "invalid-curve"
        | "integration-budget"
        | "invalid-survey"
        | "sampling-budget"
        | "unstable-axis"
        | "folded-banks";
    }
);
interface WorldRiverSource {
  points: RiverPoint[];
  flux: number[];
  heights: number[];
  cells: number[];
  widthFactor: number;
  sourceWidth: number;
  source: "points" | "cells";
  warnings: "points-length-mismatch"[];
}
function resolveSource(
  world: Readonly<WorldContext>,
  river: Readonly<River>,
  maxPoints: number
): WorldRiverSource | { reason: "invalid-source" | "source-budget" } {
  if (
    !Number.isSafeInteger(maxPoints) ||
    maxPoints < 2 ||
    !Array.isArray(river.cells) ||
    river.cells.length < 2 ||
    !Number.isSafeInteger(river.i) ||
    river.i < 0 ||
    !Number.isFinite(river.widthFactor) ||
    river.widthFactor < 0 ||
    !Number.isFinite(river.sourceWidth) ||
    river.sourceWidth < 0
  )
    return { reason: "invalid-source" };
  if (river.cells.length > maxPoints) return { reason: "source-budget" };
  const { p, fl, h } = world.pack.cells;
  const source = river.points?.length === river.cells.length ? "points" : "cells";
  const warnings: "points-length-mismatch"[] = river.points && source === "cells" ? ["points-length-mismatch"] : [];
  const points: RiverPoint[] = [],
    flux: number[] = [],
    heights: number[] = [],
    cells: number[] = [];
  // Compact cell indices isolate the pure meander helper from mutable world arrays.
  for (let i = 0; i < river.cells.length; i++) {
    const cell = river.cells[i];
    let point: RiverPoint | undefined;
    if (cell === -1) {
      if (
        i !== river.cells.length - 1 ||
        i === 0 ||
        !Number.isFinite(world.graphWidth) ||
        world.graphWidth <= 0 ||
        !Number.isFinite(world.graphHeight) ||
        world.graphHeight <= 0
      )
        return { reason: "invalid-source" };
      if (source === "points") point = river.points![i];
      else {
        const previous = p[river.cells[i - 1]];
        if (!previous) return { reason: "invalid-source" };
        const [x, y] = previous;
        const distances = [y, world.graphHeight - y, x, world.graphWidth - x];
        if (distances.some(d => !Number.isFinite(d) || d < 0)) return { reason: "invalid-source" };
        const border = distances.indexOf(Math.min(...distances));
        point =
          border === 0 ? [x, 0] : border === 1 ? [x, world.graphHeight] : border === 2 ? [0, y] : [world.graphWidth, y];
      }
      cells.push(-1);
      flux.push(fl[river.cells[i - 1]]);
      heights.push(h[river.cells[i - 1]]);
    } else {
      if (
        !Number.isSafeInteger(cell) ||
        cell < 0 ||
        !Number.isFinite(fl[cell]) ||
        fl[cell] < 0 ||
        !Number.isFinite(h[cell])
      )
        return { reason: "invalid-source" };
      point = source === "points" ? river.points![i] : p[cell];
      cells.push(i);
      flux.push(fl[cell]);
      heights.push(h[cell]);
    }
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return { reason: "invalid-source" };
    points.push([point[0], point[1]]);
  }
  return {
    points,
    flux,
    heights,
    cells,
    widthFactor: river.widthFactor,
    sourceWidth: river.sourceWidth,
    source,
    warnings
  };
}
function buildResolvedGeometry(
  riverId: number,
  geometryVersion: number,
  source: ReturnType<typeof resolveSource>,
  metersPerMapUnit: number,
  settings: WorldRiverGeometrySettings
): WorldRiverGeometryResult {
  const base = {
    riverId,
    geometryVersion,
    metersPerMapUnit,
    source: "reason" in source ? ("cells" as const) : source.source,
    warnings: "reason" in source ? [] : source.warnings
  };
  if (!Number.isFinite(metersPerMapUnit) || metersPerMapUnit <= 0) return { ...base, reason: "invalid-scale" };
  if ("reason" in source) return { ...base, reason: source.reason };
  const meandered = meanderRiverPoints({
    cells: source.cells,
    points: source.points,
    flux: source.flux,
    heights: source.heights
  });
  if (meandered.length > settings.maxSourcePoints) return { ...base, reason: "source-budget" };
  const built = buildCatmullRomRiverAxis(
    riverId,
    geometryVersion,
    meandered.map(([x, y]) => [x * metersPerMapUnit, y * metersPerMapUnit]),
    settings.curveAlpha,
    settings.precision
  );
  if (!("axis" in built)) return { ...base, reason: built.reason };
  const axis = built.axis;
  // One cubic per consecutive source pair: width progression depends on source
  // points, never on a renderer's adaptive sample count.
  const survey: RiverWidthSurvey[] = [];
  let flux = 0;
  for (let i = 0; i < meandered.length; i++) {
    flux = Math.max(flux, meandered[i][2]);
    const offset = riverDisplayOffset({
      flux,
      pointIndex: i,
      widthFactor: source.widthFactor,
      startingWidth: source.sourceWidth
    });
    const widthMeters = physicalRiverWidth(offset) * metersPerMapUnit;
    if (!Number.isFinite(widthMeters) || widthMeters <= 0) return { ...base, reason: "invalid-width" };
    survey.push({ arcLengthMeters: i === axis.segments.length ? axis.length : axis.segments[i].arcStart, widthMeters });
  }
  const physical = buildPhysicalRiverGeometry(axis, survey, settings.banks);
  if (!("geometry" in physical)) return { ...base, reason: physical.reason };
  const bounds: RiverGeometryBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const ring of physical.geometry.water.rings)
    for (const p of ring) {
      bounds.minX = Math.min(bounds.minX, p[0]);
      bounds.minY = Math.min(bounds.minY, p[1]);
      bounds.maxX = Math.max(bounds.maxX, p[0]);
      bounds.maxY = Math.max(bounds.maxY, p[1]);
    }
  return { ...base, ...physical, bounds };
}
/** Pure entry point with an explicitly allocated version; never writes the world. */
export function buildWorldRiverGeometry(
  world: Readonly<WorldContext>,
  river: Readonly<River>,
  distanceUnit: string,
  geometryVersion: number,
  settings: WorldRiverGeometrySettings
): WorldRiverGeometryResult {
  return buildResolvedGeometry(
    river.i,
    geometryVersion,
    resolveSource(world, river, settings.maxSourcePoints),
    mapUnitMeters(world.distanceScale, distanceUnit),
    settings
  );
}
function freezeResult<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeResult(child);
    Object.freeze(value);
  }
  return value;
}
/** Session-scoped cache. Versions are explicit monotonic IDs, not coordinate hashes.
 * Geometry, physical widths, units and precision changes invalidate success AND failure.
 * Version persistence and committing geometry to a saved world belong to migration.
 */
export class WorldRiverGeometryRegistry {
  private waterValidation = new PhysicalWaterValidationCache();
  private waterIndex: PhysicalWaterIndex | undefined;
  get waterValidationStats() {
    return this.waterValidation.stats;
  }
  getWaterIndex(waters: readonly PhysicalWaterPolygon[]): PhysicalWaterIndex | null {
    const index = PhysicalWaterIndex.build(waters, this.waterValidation, this.waterIndex);
    this.waterIndex = index ?? undefined;
    return index;
  }

  private entries = new WeakMap<object, Map<number, { key: string; result: WorldRiverGeometryResult }>>();
  private nextVersion = 1;
  private buildCount = 0;
  private cacheHits = 0;
  get stats() {
    return { builds: this.buildCount, cacheHits: this.cacheHits };
  }
  get(
    world: Readonly<WorldContext>,
    river: Readonly<River>,
    distanceUnit: string,
    settings: WorldRiverGeometrySettings
  ): WorldRiverGeometryResult {
    const source = resolveSource(world, river, settings.maxSourcePoints);
    const scale = mapUnitMeters(world.distanceScale, distanceUnit);
    const key = JSON.stringify([
      source,
      scale,
      settings.curveAlpha,
      settings.precision.arcToleranceMeters,
      settings.precision.maxIntegrationDepth,
      settings.precision.maxEvaluations,
      settings.banks.maxStepMeters,
      settings.banks.maxChordErrorMeters,
      settings.banks.maxSamples,
      settings.maxSourcePoints
    ]);
    let entries = this.entries.get(world.pack);
    if (!entries) {
      entries = new Map();
      this.entries.set(world.pack, entries);
    }
    const previous = entries.get(river.i);
    if (previous?.key === key) {
      this.cacheHits++;
      return previous.result;
    }
    const result = freezeResult(buildResolvedGeometry(river.i, this.nextVersion++, source, scale, settings));
    entries.set(river.i, { key, result });
    this.buildCount++;
    return result;
  }
}

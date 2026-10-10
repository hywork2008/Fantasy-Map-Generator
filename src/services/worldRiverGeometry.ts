import type { WorldContext } from "../context/worldContext";
import type { River } from "../types/models";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { meanderRiverPoints, physicalRiverWidth, riverDisplayOffset } from "../utils/riverShape";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "./physicalWaterIndex";
import { buildCatmullRomRiverAxis, catmullRomRiverCubics, type RiverCurvePrecision } from "./riverCurveGeometry";
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
      // Older saves repeat a lake cell (inlet == outlet); a zero-length reach has no tangent.
      if (i && cell === river.cells[i - 1]) continue;
      if (
        !Number.isSafeInteger(cell) ||
        cell < 0 ||
        !Number.isFinite(fl[cell]) ||
        fl[cell] < 0 ||
        !Number.isFinite(h[cell])
      )
        return { reason: "invalid-source" };
      point = source === "points" ? river.points![i] : p[cell];
      cells.push(cells.length);
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
/** Exact physical inputs, before meandering and curve construction. Metadata such as
 * name, basin and type does not participate. Resolve only this river's cells so
 * unrelated cell edits retain its sampled sections. Legacy in-place edits remain visible. */
export function worldRiverGeometrySourceKey(
  world: Readonly<WorldContext>,
  river: Readonly<River>,
  unit: string,
  settings: WorldRiverGeometrySettings
): string {
  return JSON.stringify([
    river.i,
    resolveSource(world, river, settings.maxSourcePoints),
    mapUnitMeters(world.distanceScale, unit),
    settings
  ]);
}

/** Cheap source preparation shared by region queries: no bank sampling or arc inversion. */
export function prepareWorldRiverGeometry(
  world: Readonly<WorldContext>,
  river: Readonly<River>,
  unit: string,
  settings: WorldRiverGeometrySettings
) {
  const source = resolveSource(world, river, settings.maxSourcePoints);
  const scale = mapUnitMeters(world.distanceScale, unit);
  if (!Number.isFinite(scale) || scale <= 0) return { reason: "invalid-scale" as const };
  if ("reason" in source) return source;
  const points = meanderRiverPoints({
    cells: source.cells,
    points: source.points,
    flux: source.flux,
    heights: source.heights
  });
  if (points.length > settings.maxSourcePoints) return { reason: "source-budget" as const };
  const curves = catmullRomRiverCubics(
    points.map(p => [p[0] * scale, p[1] * scale]),
    settings.curveAlpha
  );
  if (!curves?.length) return { reason: "invalid-curve" as const };
  let flux = 0;
  const widths = points.map((p, i) => {
    flux = Math.max(flux, p[2]);
    return (
      physicalRiverWidth(
        riverDisplayOffset({ flux, pointIndex: i, widthFactor: source.widthFactor, startingWidth: source.sourceWidth })
      ) * scale
    );
  });
  if (widths.some(w => !Number.isFinite(w) || w < 0) || !widths.some(w => w > 0))
    return { reason: "invalid-width" as const };
  return { curves, widths, scale, source: source.source, warnings: source.warnings };
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
  const widths: number[] = [];
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
    if (!Number.isFinite(widthMeters) || widthMeters < 0 || (widthMeters === 0 && !settings.banks.allowDrySource))
      return { ...base, reason: "invalid-width" };
    widths.push(widthMeters);
  }
  if (!widths.some(width => width > 0)) return { ...base, reason: "invalid-width" };
  const built = buildCatmullRomRiverAxis(
    riverId,
    geometryVersion,
    meandered.map(([x, y]) => [x * metersPerMapUnit, y * metersPerMapUnit]),
    settings.curveAlpha,
    settings.precision
  );
  if (!("axis" in built)) return { ...base, reason: built.reason };
  const axis = built.axis;
  // Widths depend on the original meander samples, never on display subdivisions.
  const survey: RiverWidthSurvey[] = meandered.map((_, i) => ({
    arcLengthMeters: i === axis.segments.length ? axis.length : axis.segments[i].arcStart,
    widthMeters: widths[i]
  }));
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
/** Conservative occupied bounds even when an offset polygon is unresolved.
 * The Bézier convex hull plus maximum physical half-width encloses every reach.
 * Missing/corrupt source remains unbounded; it cannot be ignored during placement. */
export function worldRiverOccupiedBounds(
  world: Readonly<WorldContext>,
  river: Readonly<River>,
  unit: string,
  settings: WorldRiverGeometrySettings
): RiverGeometryBounds | null {
  const source = resolveSource(world, river, settings.maxSourcePoints);
  const scale = mapUnitMeters(world.distanceScale, unit);
  if ("reason" in source || !Number.isFinite(scale) || scale <= 0) return null;
  const points = meanderRiverPoints({
    cells: source.cells,
    points: source.points,
    flux: source.flux,
    heights: source.heights
  });
  if (points.length > settings.maxSourcePoints) return null;
  const curves = catmullRomRiverCubics(
    points.map(p => [p[0] * scale, p[1] * scale]),
    settings.curveAlpha
  );
  if (!curves?.length) return null;
  let flux = 0,
    halfWidth = 0;
  for (let i = 0; i < points.length; i++) {
    flux = Math.max(flux, points[i][2]);
    const width =
      physicalRiverWidth(
        riverDisplayOffset({ flux, pointIndex: i, widthFactor: source.widthFactor, startingWidth: source.sourceWidth })
      ) * scale;
    if (!Number.isFinite(width) || width < 0) return null;
    halfWidth = Math.max(halfWidth, width / 2);
  }
  const controls = curves.flat();
  return {
    minX: Math.min(...controls.map(p => p[0])) - halfWidth,
    minY: Math.min(...controls.map(p => p[1])) - halfWidth,
    maxX: Math.max(...controls.map(p => p[0])) + halfWidth,
    maxY: Math.max(...controls.map(p => p[1])) + halfWidth
  };
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
 * Archives preserve versions only when current source and precision match exactly.
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
  /** Save all current rivers; functions and mutable world arrays are never archived. */
  saveVersions(
    world: Readonly<WorldContext>,
    distanceUnit: string,
    settings: WorldRiverGeometrySettings,
    worldIdentity: string,
    budgets: { maxJsonCharacters: number; maxRivers: number }
  ): string | null {
    if (!validVersionArchiveBudgets(budgets) || !worldIdentity || world.pack.rivers.length > budgets.maxRivers)
      return null;
    const ids = new Set<number>();
    const rivers: { riverId: number; geometryVersion: number; sourceKey: string }[] = [];
    for (const river of world.pack.rivers) {
      if (ids.has(river.i)) return null;
      ids.add(river.i);
      const result = this.get(world, river, distanceUnit, settings);
      if (!("geometry" in result)) return null;
      rivers.push({
        riverId: river.i,
        geometryVersion: result.geometryVersion,
        sourceKey: this.entries.get(world.pack)!.get(river.i)!.key
      });
    }
    const json = JSON.stringify({
      schemaVersion: 1,
      algorithmVersion: 1,
      worldIdentity,
      nextVersion: this.nextVersion,
      rivers
    });
    return json.length <= budgets.maxJsonCharacters ? json : null;
  }
  /** Build a new registry atomically; saved data never changes the supplied world. */
  static restoreVersions(
    json: string,
    world: Readonly<WorldContext>,
    distanceUnit: string,
    settings: WorldRiverGeometrySettings,
    worldIdentity: string,
    budgets: { maxJsonCharacters: number; maxRivers: number }
  ): WorldRiverGeometryRegistry | null {
    if (
      !validVersionArchiveBudgets(budgets) ||
      !worldIdentity ||
      json.length > budgets.maxJsonCharacters ||
      world.pack.rivers.length > budgets.maxRivers
    )
      return null;
    let saved: {
      schemaVersion: number;
      algorithmVersion: number;
      worldIdentity: string;
      nextVersion: number;
      rivers: { riverId: number; geometryVersion: number; sourceKey: string }[];
    };
    try {
      saved = JSON.parse(json);
    } catch {
      return null;
    }
    if (
      !saved ||
      Object.keys(saved).sort().join() !== "algorithmVersion,nextVersion,rivers,schemaVersion,worldIdentity" ||
      saved.schemaVersion !== 1 ||
      saved.algorithmVersion !== 1 ||
      saved.worldIdentity !== worldIdentity ||
      !Number.isSafeInteger(saved.nextVersion) ||
      saved.nextVersion < 1 ||
      !Array.isArray(saved.rivers) ||
      saved.rivers.length !== world.pack.rivers.length
    )
      return null;
    const currentRivers = new Map(world.pack.rivers.map(river => [river.i, river]));
    if (currentRivers.size !== world.pack.rivers.length) return null;
    const registry = new WorldRiverGeometryRegistry();
    const ids = new Set<number>(),
      versions = new Set<number>();
    const entries = new Map<number, { key: string; result: WorldRiverGeometryResult }>();
    for (const record of saved.rivers) {
      if (
        !record ||
        Object.keys(record).sort().join() !== "geometryVersion,riverId,sourceKey" ||
        !Number.isSafeInteger(record.riverId) ||
        record.riverId < 0 ||
        ids.has(record.riverId) ||
        !Number.isSafeInteger(record.geometryVersion) ||
        record.geometryVersion < 1 ||
        record.geometryVersion >= saved.nextVersion ||
        versions.has(record.geometryVersion) ||
        typeof record.sourceKey !== "string"
      )
        return null;
      ids.add(record.riverId);
      versions.add(record.geometryVersion);
      const river = currentRivers.get(record.riverId);
      if (!river) return null;
      const current = registry.get(world, river, distanceUnit, settings);
      const key = registry.entries.get(world.pack)!.get(river.i)!.key;
      if (!("geometry" in current) || key !== record.sourceKey) return null;
      const result = freezeResult(
        buildWorldRiverGeometry(world, river, distanceUnit, record.geometryVersion, settings)
      );
      if (!("geometry" in result)) return null;
      entries.set(river.i, { key, result });
    }
    registry.entries.set(world.pack, entries);
    registry.nextVersion = saved.nextVersion;
    return registry;
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
      settings.maxSourcePoints,
      ...(settings.banks.allowDrySource ? ["dry-source-tip"] : [])
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
    if (!Number.isSafeInteger(this.nextVersion) || this.nextVersion >= Number.MAX_SAFE_INTEGER)
      throw new RangeError("River geometry version allocator exhausted");
    const result = freezeResult(buildResolvedGeometry(river.i, this.nextVersion++, source, scale, settings));
    entries.set(river.i, { key, result });
    this.buildCount++;
    return result;
  }
}

function validVersionArchiveBudgets(budgets: { maxJsonCharacters: number; maxRivers: number }): boolean {
  return (
    Number.isSafeInteger(budgets.maxJsonCharacters) &&
    budgets.maxJsonCharacters > 0 &&
    Number.isSafeInteger(budgets.maxRivers) &&
    budgets.maxRivers >= 0
  );
}

import type { WorldContext } from "../context/worldContext";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { RegionalRiverGeometry, regionalRiverGeometry } from "./regionalRiverGeometry";
import type { RiverPoint } from "./riverGeometry";
import { SETTLEMENT_RIVER_SETTINGS } from "./settlementRiverSite";
import { type SpatialBounds, SpatialBoundsIndex } from "./spatialBoundsIndex";
import { worldRiverOccupiedBounds } from "./worldRiverGeometry";

interface TerrainEntry {
  id: number;
  bounds: SpatialBounds;
  vertices: readonly number[];
  ring?: RiverPoint[];
}
/** Generation-owned caches. prepare checks legacy mutable inputs at each public boundary. */
export class SettlementGeometrySession {
  private terrainKey = "";
  private riverKey = "";
  private terrainIndex?: SpatialBoundsIndex<TerrainEntry>;
  private riverIndex?: SpatialBoundsIndex<{ id: number; bounds: SpatialBounds }>;
  private unbounded: number[] = [];
  private sources = new Map<number, ReturnType<typeof regionalRiverGeometry>>();
  terrainBuilds = 0;
  riverIndexBuilds = 0;
  private scale = 1;
  prepare(world: Readonly<WorldContext>, unit: string) {
    for (const _ of this.prepareSteps(world, unit)) {
      /* synchronous compatibility */
    }
  }
  *prepareSteps(world: Readonly<WorldContext>, unit: string): Generator<void> {
    this.scale = mapUnitMeters(world.distanceScale, unit);
    const { pack } = world;
    const terrainKey = JSON.stringify([this.scale, pack.vertices.p, pack.cells.v]);
    if (terrainKey !== this.terrainKey) {
      const terrain: TerrainEntry[] = [];
      for (let id = 0; id < (pack.cells.v?.length ?? 0); id++) {
        const vertices = pack.cells.v[id] ?? [];
        const points = vertices.map(v => pack.vertices.p[v]).filter(Boolean);
        if (points.length < 3) continue;
        terrain.push({
          id,
          vertices,
          bounds: {
            minX: Math.min(...points.map(p => p[0])) * this.scale,
            maxX: Math.max(...points.map(p => p[0])) * this.scale,
            minY: Math.min(...points.map(p => p[1])) * this.scale,
            maxY: Math.max(...points.map(p => p[1])) * this.scale
          }
        });
        if (id % 128 === 0) yield;
      }
      this.terrainIndex = new SpatialBoundsIndex(terrain, t => t.bounds);
      this.terrainKey = terrainKey;
      this.terrainBuilds++;
    }
    const riverKey = JSON.stringify([
      this.scale,
      world.graphWidth,
      world.graphHeight,
      pack.rivers,
      pack.cells.p,
      pack.cells.h,
      pack.cells.fl
    ]);
    if (riverKey !== this.riverKey) {
      this.sources.clear();
      this.unbounded = [];
      const entries: { id: number; bounds: SpatialBounds }[] = [];
      for (const river of pack.rivers) {
        const source = regionalRiverGeometry(world, river, unit, SETTLEMENT_RIVER_SETTINGS);
        this.sources.set(river.i, source);
        if (source instanceof RegionalRiverGeometry)
          entries.push(...source.sections.map(section => ({ id: river.i, bounds: section.bounds })));
        else {
          const bounds = worldRiverOccupiedBounds(world, river, unit, SETTLEMENT_RIVER_SETTINGS);
          if (bounds) entries.push({ id: river.i, bounds });
          else this.unbounded.push(river.i);
        }
        yield;
      }
      this.riverIndex = new SpatialBoundsIndex(entries, e => e.bounds);
      this.riverKey = riverKey;
      this.riverIndexBuilds++;
    }
  }
  terrain(world: Readonly<WorldContext>, bounds: SpatialBounds) {
    return (this.terrainIndex?.query(bounds) ?? []).map(entry => {
      entry.ring ??= entry.vertices
        .map(v => world.pack.vertices.p[v])
        .filter(Boolean)
        .map(p => [p[0] * this.scale, p[1] * this.scale] as RiverPoint);
      return { id: entry.id, ring: entry.ring };
    });
  }
  rivers(bounds: SpatialBounds) {
    return [...new Set([...(this.riverIndex?.query(bounds) ?? []).map(e => e.id), ...this.unbounded])];
  }
  source(id: number) {
    return this.sources.get(id);
  }
  resolve(
    world: Readonly<WorldContext>,
    river: Readonly<WorldContext>["pack"]["rivers"][number],
    unit: string,
    bounds: SpatialBounds
  ) {
    const steps = this.resolveSteps(world, river, unit, bounds);
    let result = steps.next();
    while (!result.done) result = steps.next();
    return result.value;
  }
  *resolveSteps(
    world: Readonly<WorldContext>,
    river: Readonly<WorldContext>["pack"]["rivers"][number],
    unit: string,
    bounds: SpatialBounds
  ): Generator<void, import("./regionalRiverGeometry").RegionalRiverResult> {
    const source = this.sources.get(river.i) ?? regionalRiverGeometry(world, river, unit, SETTLEMENT_RIVER_SETTINGS);
    if (!(source instanceof RegionalRiverGeometry))
      return { reason: source.reason, bounds: worldRiverOccupiedBounds(world, river, unit, SETTLEMENT_RIVER_SETTINGS) };
    return (yield* source.querySteps(bounds)) ?? { reason: "no-local-water", bounds };
  }
}

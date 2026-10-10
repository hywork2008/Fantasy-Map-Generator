import type { WorldContext } from "../context/worldContext";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { RegionalRiverGeometry, regionalRiverGeometry } from "./regionalRiverGeometry";
import type { RiverPoint } from "./riverGeometry";
import { SETTLEMENT_RIVER_SETTINGS } from "./settlementRiverSite";
import { type SpatialBounds, SpatialBoundsIndex } from "./spatialBoundsIndex";
import { worldRiverGeometrySourceKey, worldRiverOccupiedBounds } from "./worldRiverGeometry";

interface TerrainEntry {
  id: number;
  bounds: SpatialBounds;
  vertices: readonly number[];
  ring?: RiverPoint[];
}
/** Generation-owned caches. prepare checks legacy mutable inputs at each public boundary. */
export class SettlementGeometrySession {
  private pack?: WorldContext["pack"];
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
    const scale = mapUnitMeters(world.distanceScale, unit);
    const { pack } = world;
    const replaced = pack !== this.pack;
    let terrainIndex = this.terrainIndex;
    let riverIndex = this.riverIndex;
    let sources = this.sources;
    let unbounded = this.unbounded;
    const terrainKey = JSON.stringify([scale, pack.vertices.p, pack.cells.v]);
    if (replaced || terrainKey !== this.terrainKey) {
      const terrain: TerrainEntry[] = [];
      for (let id = 0; id < (pack.cells.v?.length ?? 0); id++) {
        const vertices = pack.cells.v[id] ?? [];
        const points = vertices.map(v => pack.vertices.p[v]).filter(Boolean);
        if (points.length < 3) continue;
        terrain.push({
          id,
          vertices,
          bounds: {
            minX: Math.min(...points.map(p => p[0])) * scale,
            maxX: Math.max(...points.map(p => p[0])) * scale,
            minY: Math.min(...points.map(p => p[1])) * scale,
            maxY: Math.max(...points.map(p => p[1])) * scale
          }
        });
        if (id % 128 === 0) yield;
      }
      terrainIndex = new SpatialBoundsIndex(terrain, t => t.bounds);
    }
    const riverKey = JSON.stringify(
      pack.rivers.map(river => worldRiverGeometrySourceKey(world, river, unit, SETTLEMENT_RIVER_SETTINGS))
    );
    if (replaced || riverKey !== this.riverKey) {
      sources = new Map();
      unbounded = [];
      const entries: { id: number; bounds: SpatialBounds }[] = [];
      for (const river of pack.rivers) {
        const source = regionalRiverGeometry(world, river, unit, SETTLEMENT_RIVER_SETTINGS);
        sources.set(river.i, source);
        if (source instanceof RegionalRiverGeometry)
          entries.push(...source.sections.map(section => ({ id: river.i, bounds: section.bounds })));
        else {
          const bounds = worldRiverOccupiedBounds(world, river, unit, SETTLEMENT_RIVER_SETTINGS);
          if (bounds) entries.push({ id: river.i, bounds });
          else unbounded.push(river.i);
        }
        yield;
      }
      riverIndex = new SpatialBoundsIndex(entries, e => e.bounds);
    }
    // Yielding preparation may be cancelled. Publish one coherent snapshot only
    // after both indexes and all sources are complete.
    if (terrainIndex !== this.terrainIndex) this.terrainBuilds++;
    if (riverIndex !== this.riverIndex) this.riverIndexBuilds++;
    this.pack = pack;
    this.scale = scale;
    this.terrainIndex = terrainIndex;
    this.riverIndex = riverIndex;
    this.sources = sources;
    this.unbounded = unbounded;
    this.terrainKey = terrainKey;
    this.riverKey = riverKey;
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

// One world-owned session shared by placement, road convergence and CE queries.
// prepare/prepareSteps still validate mutable inputs at every public boundary.
const sessions = new WeakMap<object, SettlementGeometrySession>();
export function settlementGeometrySession(world: Readonly<WorldContext>): SettlementGeometrySession {
  let session = sessions.get(world.pack);
  if (!session) {
    session = new SettlementGeometrySession();
    sessions.set(world.pack, session);
  }
  return session;
}

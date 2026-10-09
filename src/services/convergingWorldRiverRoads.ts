import { quadtree } from "d3";
import type { WorldContext } from "../context/worldContext";
import { type ConvergingRoadLeg, convergeRiverRoadLegs } from "../generators/convergingRiverRoads";
import { MIN_NAVIGABLE_FLUX } from "../generators/river-generator";
import {
  type CrossingCandidateInput,
  createProvisionalRiverCrossing,
  type ProvisionalRiverCrossing
} from "../generators/riverCrossingCandidates";
import { getStateBridgeSkewLimit } from "../generators/technologyProgress";
import type { Burg, Route } from "../types/models";
import { bridgeCrossingLimitForPeriod } from "../utils/bridgeCrossingPolicy";
import { bridgeSkewCandidates, bridgeStructureForRouteGroup } from "../utils/bridgeSkewPolicy";
import { burgLotOccupancy, occupancyRadiusMeters } from "../utils/cultureLotOccupancy";
import type { FixedBurgCrossings } from "../utils/fixedBurgCrossings";
import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../utils/fixedBurgCrossings";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { measureProcessing, type ProcessingProfiler } from "../utils/processingProfiler";
import { populationWindowMeters } from "../utils/requiredSiteBounds";
import { RIVER_CARGO_VESSEL, SEA_SAILING_VESSEL } from "../utils/riverCrossing";
import { bridgePassageFootprint } from "./bridgePassageGeometry";
import {
  clearCoastalRouteGeometry,
  coastalRouteGeometryKey,
  drawnSeaClearanceMeters,
  relocateCoastalRouteNeighbours
} from "./coastalRouteApproach";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "./physicalWaterIndex";
import { evaluateRiverAxis } from "./riverAxisSampling";
import type { RiverPoint } from "./riverGeometry";
import type { PhysicalRiverGeometry, PhysicalWaterPolygon } from "./riverPhysicalGeometry";
import { footprintTouchesWater } from "./riverPhysicalGeometry";
import { settlementGeometrySession } from "./settlementGeometrySession";
import { coveredByTerrainCells } from "./settlementRiverSite";

interface Facility {
  burgId: number;
  crossing: ProvisionalRiverCrossing;
  geometry: PhysicalRiverGeometry;
  near: RiverPoint;
  routeIds: number[];
  half: number;
  water: PhysicalWaterPolygon[];
}
export interface PreparedWorldRiverRoads {
  key: string;
  coastKey: string;
  facilities: Facility[];
  changedRoutes: number[];
}
const cache = new WeakMap<object, PreparedWorldRiverRoads>();

/** Floor on a coastal bridge's distance from the drawn sea (see seaClear). */
const SEA_CLEARANCE_MIN_METERS = 200;

function polygonBounds(rings: readonly (readonly RiverPoint[])[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  return { minX, minY, maxX, maxY };
}

function clipSegmentToCircle(
  a: RiverPoint,
  b: RiverPoint,
  origin: RiverPoint,
  radius: number
): [RiverPoint, RiverPoint] | null {
  const vx = b[0] - a[0],
    vy = b[1] - a[1];
  const vLenSq = vx * vx + vy * vy;
  const distA = Math.hypot(a[0] - origin[0], a[1] - origin[1]);
  if (vLenSq <= 0) return distA <= radius ? [a, b] : null;

  const wx = a[0] - origin[0],
    wy = a[1] - origin[1];
  const A = vLenSq;
  const B = 2 * (wx * vx + wy * vy);
  const C = wx * wx + wy * wy - radius * radius;
  const discr = B * B - 4 * A * C;
  if (discr < 0) return null;
  const sqrtD = Math.sqrt(discr);
  const t0 = Math.max(0, (-B - sqrtD) / (2 * A));
  const t1 = Math.min(1, (-B + sqrtD) / (2 * A));
  if (t0 > t1 || t0 > 1 || t1 < 0) return null;
  return [
    [a[0] + t0 * vx, a[1] + t0 * vy],
    [a[0] + t1 * vx, a[1] + t1 * vy]
  ];
}

function legTouchesRiverWater(
  origin: RiverPoint,
  leg: ConvergingRoadLeg,
  water: PhysicalWaterPolygon,
  waterBounds: { minX: number; minY: number; maxX: number; maxY: number },
  maxDist: number,
  roadWidthMeters: number
): boolean {
  if (leg.points.length < 2) return false;
  for (let i = 1; i < leg.points.length; i++) {
    const a = leg.points[i - 1],
      b = leg.points[i];
    const clipped = clipSegmentToCircle(a, b, origin, maxDist);
    if (!clipped) continue;
    const [ca, cb] = clipped;
    const segMinX = Math.min(ca[0], cb[0]) - roadWidthMeters,
      segMaxX = Math.max(ca[0], cb[0]) + roadWidthMeters,
      segMinY = Math.min(ca[1], cb[1]) - roadWidthMeters,
      segMaxY = Math.max(ca[1], cb[1]) + roadWidthMeters;
    if (
      segMinX > waterBounds.maxX ||
      segMaxX < waterBounds.minX ||
      segMinY > waterBounds.maxY ||
      segMaxY < waterBounds.minY
    )
      continue;
    const footprint = bridgePassageFootprint(ca, cb, roadWidthMeters);
    if (footprint && footprintTouchesWater(footprint, water)) return true;
  }
  return false;
}
function key(world: WorldContext, unit: string) {
  const p = world.pack;
  return JSON.stringify([
    unit,
    world.distanceScale,
    world.populationRate,
    world.urbanization,
    world.options.historicalPeriod,
    world.options.riverBridgeTechnology,
    world.options.landConnectionGeneration,
    p.cells.p,
    // Only shape + crossing depth; Rivers.specify() metadata must preserve preparation.
    p.rivers?.map(r => [
      r.i,
      r.cells,
      r.points,
      r.widthFactor,
      r.sourceWidth,
      r.cells.map(c => [p.cells.fl[c], r.cellHydrology?.[c]?.waterDepth])
    ]),
    p.cells.h,
    p.burgs?.map(b => b && [b.i, b.x, b.y, b.cell, b.population, b.removed, b.state]),
    // Skew allowance rises with each state's technology (bridgeSkewPolicy.ts).
    p.states?.map(s => s && !s.removed && [getStateBridgeSkewLimit(s.i), getStateBridgeSkewLimit(s.i, "timber")]),
    p.routes?.map(r => [r.i, r.group, r.points, r.lock, r.registeredConnectionId, r.navigation, r.cells])
  ]);
}

/** Normal road generation and CE export use the same committed FMG geometry.
 * No RNG, no modification of locked/registered roads, no unmeasured dry arms. */
export function ensureConvergingWorldRiverRoads(
  world: WorldContext,
  unit: string,
  profiler?: ProcessingProfiler
): PreparedWorldRiverRoads {
  const coastKey = measureProcessing(profiler, "coast-key", () =>
    JSON.stringify([unit, coastalRouteGeometryKey(world)])
  );
  const initialKey = measureProcessing(profiler, "cache-key", () => key(world, unit)),
    old = cache.get(world.pack);
  if (old?.key === initialKey && old.coastKey === coastKey) return old;
  const result: PreparedWorldRiverRoads = { key: initialKey, coastKey, facilities: [], changedRoutes: [] };
  if (!world.pack.vertices?.p || !world.pack.cells.v?.length || world.options.landConnectionGeneration) {
    cache.set(world.pack, result);
    return result;
  }
  const scale = mapUnitMeters(world.distanceScale, unit);
  if (!(scale > 0)) return result;
  if (old?.coastKey !== coastKey) clearCoastalRouteGeometry(world);
  let restored = false;
  for (const r of world.pack.routes) {
    if (!r.riverRoadConvergence || r.lock) continue;
    if (JSON.stringify(r.points) === r.riverRoadConvergence.pointsKey) {
      restored = true;
      r.points = structuredClone(r.riverRoadConvergence.originalPoints);
      r.cells = r.points.map(p => p[2]).filter((c, i, a) => !i || c !== a[i - 1]);
    }
    delete r.riverRoadConvergence;
  }
  measureProcessing(profiler, "coastal-route-neighbours", () => relocateCoastalRouteNeighbours(world, unit, profiler));
  const session = settlementGeometrySession(world);
  measureProcessing(profiler, "geometry-session", () => session.prepare(world, unit));
  const centers = world.pack.cells.p.map((p, id) => ({ p, id }));
  const tree = quadtree<(typeof centers)[number]>()
    .x(c => c.p[0])
    .y(c => c.p[1])
    .addAll(centers);
  let facilityId = 0;
  const waterValidation = new PhysicalWaterValidationCache();
  // Point indices per cell, rebuilt when an adopted leg replaces a route's points.
  const routeCells = new Map<Route, { points: Route["points"]; byCell: Map<number, number[]> }>();
  const burgPointIndex = (route: Route, burg: Burg) => {
    let entry = routeCells.get(route);
    if (entry?.points !== route.points) {
      const byCell = new Map<number, number[]>();
      route.points.forEach((p, i) => {
        const list = byCell.get(p[2]);
        if (list) list.push(i);
        else byCell.set(p[2], [i]);
      });
      entry = { points: route.points, byCell };
      routeCells.set(route, entry);
    }
    // Same first match as findIndex over all points.
    for (const i of entry.byCell.get(burg.cell) ?? []) {
      const p = route.points[i];
      if (Math.hypot(p[0] - burg.x, p[1] - burg.y) < 1e-7) return i;
    }
    return -1;
  };
  for (const burg of world.pack.burgs) {
    if (!burg?.i || burg.removed) continue;
    const origin: RiverPoint = [burg.x * scale, burg.y * scale];
    const baseHalf =
      populationWindowMeters(
        occupancyRadiusMeters(
          (burg.population ?? 0) * world.populationRate * world.urbanization,
          burgLotOccupancy(world.pack, burg),
          burg
        )
      ) / 2;
    const legs: (ConvergingRoadLeg & {
      route: Route;
      index: number;
      reverse: boolean;
      sourcePoints: Route["points"];
    })[] = [];
    for (const route of world.pack.routes) {
      if (route.lock || route.group === "searoutes" || route.registeredConnectionId !== undefined) continue;
      const index = burgPointIndex(route, burg);
      if (index < 0) continue;
      for (const reverse of [false, true]) {
        const path = reverse ? route.points.slice(0, index + 1).reverse() : route.points.slice(index);
        if (path.length >= 2)
          legs.push({
            id: legs.length,
            route,
            index,
            reverse,
            sourcePoints: path,
            points: path.map(p => [p[0] * scale, p[1] * scale])
          });
      }
    }
    if (!legs.length) continue;
    const adoptedLegs = new Set<number>();
    for (const half of [baseHalf, baseHalf + bridgeCrossingLimitForPeriod(world.options.historicalPeriod)]) {
      if (adoptedLegs.size === legs.length) break;
      const bounds = { minX: origin[0] - half, maxX: origin[0] + half, minY: origin[1] - half, maxY: origin[1] + half };
      const water: PhysicalWaterPolygon[] = [],
        geometries: PhysicalRiverGeometry[] = [];
      let complete = true;
      for (const riverId of session.rivers(bounds)) {
        const river = world.pack.rivers.find(r => r.i === riverId)!;
        const resolved = measureProcessing(profiler, "river-geometry", () =>
          session.resolve(world, river, unit, bounds)
        );
        if (!("geometry" in resolved)) {
          if (resolved.reason !== "no-local-water") complete = false;
          continue;
        }
        water.push(resolved.geometry.water);
        geometries.push(resolved.geometry);
      }
      if (!complete || !geometries.length) continue;
      const terrain = measureProcessing(profiler, "terrain-query", () => session.terrain(world, bounds));
      const supported = terrain.filter(t => world.pack.cells.h[t.id] >= 20);
      const supportedRings = supported.map(t => t.ring);
      water.push(
        ...terrain.filter(t => world.pack.cells.h[t.id] < 20).map(t => ({ id: 1000000000 + t.id, rings: [t.ring] }))
      );
      const waterIndex = measureProcessing(profiler, "water-index", () =>
        PhysicalWaterIndex.build(water, waterValidation)
      );
      if (!waterIndex) continue;
      const supports = (polygon: readonly RiverPoint[]) =>
        polygon.every(p => p[0] >= bounds.minX && p[0] <= bounds.maxX && p[1] >= bounds.minY && p[1] <= bounds.maxY) &&
        coveredByTerrainCells(polygon, supportedRings);
      for (const geometry of geometries) {
        const snapshot = waterIndex.getSnapshot(geometry.water);
        if (!snapshot) continue;
        const candidateGeometry = { ...geometry, water: snapshot };
        const remaining = legs.filter(leg => !adoptedLegs.has(leg.id));
        if (!remaining.length) break;
        const waterBounds = polygonBounds(geometry.water.rings);
        const crossingLegs = remaining.filter(leg =>
          legTouchesRiverWater(origin, leg, geometry.water, waterBounds, Math.SQRT2 * half, 5)
        );
        if (!crossingLegs.length) continue;
        // One shared bridge: masonry if it carries a main road, otherwise timber.
        const structure = crossingLegs.some(leg => bridgeStructureForRouteGroup(leg.route.group) === "stone")
          ? "stone"
          : "timber";
        const skews = bridgeSkewCandidates(getStateBridgeSkewLimit(burg.state ?? 0, structure));

        const maxArcDist = Math.SQRT2 * half + 100;
        const arcs: { arc: number; distance: number }[] = [];
        for (let j = 0; j < geometry.water.rings.length; j++)
          for (let i = 0; i < geometry.water.rings[j].length; i++) {
            const ref = geometry.water.bankReferences?.[j]?.[i];
            if (!ref) continue;
            const a = geometry.water.rings[j][i],
              b = geometry.water.rings[j][(i + 1) % geometry.water.rings[j].length];
            const dx = b[0] - a[0],
              dy = b[1] - a[1],
              length = dx * dx + dy * dy;
            const t = length
              ? Math.max(0, Math.min(1, ((origin[0] - a[0]) * dx + (origin[1] - a[1]) * dy) / length))
              : 0;
            const distance = Math.hypot(a[0] + dx * t - origin[0], a[1] + dy * t - origin[1]);
            if (distance <= maxArcDist) {
              arcs.push({
                arc: ref.arcStart + t * (ref.arcEnd - ref.arcStart),
                distance
              });
            }
          }
        if (!arcs.length) continue;
        const river = world.pack.rivers.find(r => r.i === geometry.water.id)!;
        const riverCells = river.cells.filter(c => c >= 0);
        const cellId = riverCells.reduce(
          (best, c) =>
            Math.hypot(world.pack.cells.p[c][0] * scale - origin[0], world.pack.cells.p[c][1] * scale - origin[1]) <
            Math.hypot(world.pack.cells.p[best][0] * scale - origin[0], world.pack.cells.p[best][1] * scale - origin[1])
              ? c
              : best,
          riverCells[0]
        );
        const waterRoutes = world.pack.routes.filter(
          r => r.group === "searoutes" && (r.cells ?? r.points.map(p => p[2])).some(c => riverCells.includes(c))
        );
        const vessel = waterRoutes.some(r => r.navigation !== "river")
          ? SEA_SAILING_VESSEL
          : waterRoutes.length || world.pack.cells.fl[cellId] >= MIN_NAVIGABLE_FLUX
            ? RIVER_CARGO_VESSEL
            : undefined;
        // Try existing nearest sections first. Only expand along the real axis
        // if none can connect the road; common dry/supported cases keep their cost.
        const sortedArcs = arcs.sort((a, b) => a.distance - b.distance);
        const nearest: typeof arcs = [];
        for (const a of sortedArcs) {
          if (!nearest.some(f => Math.abs(f.arc - a.arc) < 5)) {
            nearest.push(a);
            if (nearest.length >= 32) break;
          }
        }
        const chunks = (arr: number[], size: number) => {
          const res: number[][] = [];
          for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
          return res;
        };
        const nearestBatches = chunks(
          nearest.map(a => a.arc),
          4
        );
        const offsetArcs = nearest
          .slice(0, 4)
          .flatMap(a => [-160, -80, -40, -20, 20, 40, 80, 160].map(offset => a.arc + offset));
        // A coastal town's bridge stays back from the river mouth: at least its
        // own span (and SEA_CLEARANCE_MIN_METERS) from the drawn sea. Search
        // farther along the axis for such a site before settling for one nearer.
        const burgId = burg.i;
        const seaClear = (crossing: ProvisionalRiverCrossing) =>
          drawnSeaClearanceMeters(
            world,
            burgId,
            unit,
            [crossing.approachA, crossing.approachB, crossing.deckA, crossing.deckB, crossing.q].map(
              p => [p[0] / scale, p[1] / scale] as const
            )
          ) >= Math.max(SEA_CLEARANCE_MIN_METERS, crossing.deckLengthMeters);
        const seaBackoffArcs = nearest
          .slice(0, 2)
          .flatMap(a => [-640, -480, -320, -240, 240, 320, 480, 640].map(offset => a.arc + offset));
        const offsetBatches = chunks(offsetArcs, 8);
        const candidateCache = new Map<
          string,
          { crossing: ProvisionalRiverCrossing; input: CrossingCandidateInput } | null
        >();
        while (true) {
          const activeLegs = crossingLegs.filter(leg => !adoptedLegs.has(leg.id));
          if (!activeLegs.length) break;
          let merged: ReturnType<typeof convergeRiverRoadLegs> = null;

          // Square and ±preferred first; the full allowance only when the road
          // already pulls the bridge to the preferred skew (keeps generation cheap).
          const evaluateBatch = (
            batch: number[],
            skewSet = skews.slice(0, 3),
            requireSeaClearance = false
          ): ReturnType<typeof convergeRiverRoadLegs> => {
            const candidates: { crossing: ProvisionalRiverCrossing; input: CrossingCandidateInput }[] = [];
            for (const arc of batch)
              for (const skewDegrees of skewSet) {
                if (arc <= 0 || arc >= geometry.axis.length) continue;
                const cacheKey = `${arc}:${skewDegrees}`;
                let item = candidateCache.get(cacheKey);
                if (item === undefined) {
                  const input: CrossingCandidateInput = {
                    id: facilityId,
                    geometry: candidateGeometry,
                    arcLengthMeters: arc,
                    skewDegrees,
                    dimensions: {
                      bankSeatMeters: 2,
                      straightApproachMeters: 10,
                      roadWidthMeters: 5,
                      localWindowMeters: 20
                    },
                    otherWater: [],
                    waterIndex,
                    capability: {
                      period: world.options.historicalPeriod,
                      technology: world.options.riverBridgeTechnology,
                      depthMeters: river.cellHydrology?.[cellId]?.waterDepth,
                      vessel
                    },
                    supportsDryFootprint: supports
                  };
                  const created = measureProcessing(profiler, "crossing-candidates", () =>
                    createProvisionalRiverCrossing(input)
                  );
                  item = "candidate" in created ? { crossing: created.candidate, input } : null;
                  candidateCache.set(cacheKey, item);
                }
                if (item && requireSeaClearance && !seaClear(item.crossing)) continue;
                if (item) {
                  if (item.input.id !== facilityId) {
                    item = {
                      crossing: { ...item.crossing, id: facilityId },
                      input: { ...item.input, id: facilityId }
                    };
                  }
                  candidates.push(item);
                }
              }
            if (!candidates.length) return null;
            const found = measureProcessing(profiler, "converge-road-legs", () =>
              convergeRiverRoadLegs(origin, activeLegs, candidates, Math.SQRT2 * half, {
                // Each candidate below comes from createProvisionalRiverCrossing(input) in this pass.
                prevalidated: true,
                profiler
              })
            );
            if (found && skewSet.length < skews.length && Math.abs(found.crossing.skewDegrees) === Math.abs(skews[1]))
              return evaluateBatch(batch, skews, requireSeaClearance) ?? found;
            return found;
          };

          for (const requireSeaClearance of [true, false]) {
            const batches = requireSeaClearance
              ? [...nearestBatches, ...offsetBatches, ...chunks(seaBackoffArcs, 8)]
              : [...nearestBatches, ...offsetBatches];
            for (const batch of batches) {
              merged = evaluateBatch(batch, undefined, requireSeaClearance);
              if (merged) break;
            }
            if (merged) break;
          }
          if (!merged) break;
          const facility: Facility = {
            burgId: burg.i,
            crossing: merged.crossing,
            geometry,
            near: merged.trunk[1],
            routeIds: merged.legs.map(l => legs[l.id].route.i),
            half,
            water
          };
          const valid = measureProcessing(profiler, "crossing-payload-validation", () =>
            crossingsPayload(world, unit, burg, [...result.facilities.filter(f => f.burgId === burg.i), facility])
          );
          if (!valid) break;
          for (const changed of merged.legs) {
            adoptedLegs.add(changed.id);
            const leg = legs[changed.id],
              route = leg.route;
            route.riverRoadConvergence ??= {
              originalPoints: structuredClone(route.points),
              pointsKey: "",
              burgIds: []
            };
            const index = route.points.findIndex(
              p => p[2] === burg.cell && Math.hypot(p[0] - burg.x, p[1] - burg.y) < 1e-7
            );
            const points: Route["points"] = changed.points.map((p, i) => [
              p[0] / scale,
              p[1] / scale,
              i === 0
                ? burg.cell
                : i >= changed.sourceStart
                  ? leg.sourcePoints[changed.rejoinSegment + i - changed.sourceStart][2]
                  : tree.find(p[0] / scale, p[1] / scale)!.id
            ]);
            route.points = leg.reverse
              ? [...points.reverse(), ...route.points.slice(index + 1)]
              : [...route.points.slice(0, index), ...points];
            route.cells = route.points.map(p => p[2]).filter((c, i, a) => !i || c !== a[i - 1]);
            route.riverRoadConvergence.pointsKey = JSON.stringify(route.points);
            if (!route.riverRoadConvergence.burgIds.includes(burg.i)) route.riverRoadConvergence.burgIds.push(burg.i);
            if (!result.changedRoutes.includes(route.i)) result.changedRoutes.push(route.i);
          }
          result.facilities.push(facility);
          facilityId++;
        }
      }
    }
  }
  if (restored || result.changedRoutes.length) {
    const links: Record<number, Record<number, number>> = {};
    for (const route of world.pack.routes) {
      if (route.navigation === "river") continue;
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1][2],
          b = route.points[i][2];
        if (a === b) continue;
        links[a] ??= {};
        links[a][b] = route.i;
        links[b] ??= {};
        links[b][a] = route.i;
      }
    }
    world.pack.cells.routes = links;
  }
  result.key = measureProcessing(profiler, "cache-key", () => key(world, unit));
  cache.set(world.pack, result);
  return result;
}

/** The cached preparation, without computing one. */
export function peekConvergedWorldRiverRoads(world: WorldContext): PreparedWorldRiverRoads | undefined {
  return cache.get(world.pack);
}

/** A prepared snapshot may be reused within one synchronous, non-mutating export. */
export function convergedBurgFacilities(
  world: WorldContext,
  unit: string,
  burgId: number,
  prepared = ensureConvergingWorldRiverRoads(world, unit)
) {
  return prepared.facilities.filter(f => f.burgId === burgId);
}

/** The regional water and derivative witness used by FMG become CE's v4 source. */
export function convergedBurgCrossings(
  world: WorldContext,
  unit: string,
  burg: Burg,
  prepared = ensureConvergingWorldRiverRoads(world, unit)
): FixedBurgCrossings | null {
  return crossingsPayload(world, unit, burg, convergedBurgFacilities(world, unit, burg.i!, prepared));
}
function crossingsPayload(
  world: WorldContext,
  unit: string,
  burg: Burg,
  facilities: Facility[]
): FixedBurgCrossings | null {
  if (!facilities.length) return null;
  const scale = mapUnitMeters(world.distanceScale, unit),
    origin: RiverPoint = [burg.x * scale, burg.y * scale];
  const point = (p: RiverPoint): [number, number] => [p[0] - origin[0], origin[1] - p[1]],
    vector = (p: RiverPoint): [number, number] => [p[0], -p[1]];
  const crossings: FixedBurgCrossings["crossings"][number][] = [];
  for (const f of facilities) {
    const c = f.crossing,
      sample = evaluateRiverAxis(f.geometry.axis, c.arcLengthMeters);
    const segment = sample && f.geometry.axis.segments.find(s => s.index === sample.segmentIndex);
    if (!segment || !sample || (c.plan.kind !== "fixedBridge" && c.plan.kind !== "movableBridge")) return null;
    const witness =
      "controls" in segment && "parameter" in sample
        ? { kind: "cubic" as const, controls: segment.controls.map(point), parameter: sample.parameter as number }
        : "start" in segment
          ? {
              kind: "line" as const,
              controls: [point(segment.start), point(segment.end)],
              parameter: (c.arcLengthMeters - segment.arcStart) / segment.length
            }
          : null;
    if (!witness) return null;
    crossings.push({
      id: c.id,
      riverId: c.riverId,
      geometryVersion: c.geometryVersion,
      kind: c.plan.kind,
      q: point(c.q),
      tangent: vector(c.tRiver),
      normal: vector(c.nCrossing),
      waterA: point(c.waterA),
      waterB: point(c.waterB),
      deckA: point(c.deckA),
      deckB: point(c.deckB),
      approachA: point(c.approachA),
      approachB: point(c.approachB),
      witness
    });
  }
  const survey = facilities.reduce((a, b) => (a.half >= b.half ? a : b));
  const half = survey.half;
  const occupied = crossings.flatMap(c =>
    [c.approachA, c.approachB, c.deckA, c.deckB].flatMap(p =>
      [-3, 3].map(d => [p[0] - d * c.normal[1], p[1] + d * c.normal[0]])
    )
  );
  const payload: FixedBurgCrossings = {
    schemaVersion: 4,
    coordinateUnit: "metres",
    revision: 0,
    originMeters: [...origin],
    roadWidthMeters: 5,
    coverageBounds: { minX: -half, minY: -half, maxX: half, maxY: half },
    requiredBounds: {
      minX: Math.min(...occupied.map(p => p[0])),
      maxX: Math.max(...occupied.map(p => p[0])),
      minY: Math.min(...occupied.map(p => p[1])),
      maxY: Math.max(...occupied.map(p => p[1]))
    },
    rivers: [...new Map(facilities.map(f => [f.crossing.riverId, f])).values()].map(f => ({
      id: f.crossing.riverId,
      geometryVersion: f.crossing.geometryVersion,
      rings: (survey.water.find(w => w.id === f.crossing.riverId) ?? f.geometry.water).rings.map(r => r.map(point))
    })),
    crossings,
    obstacles: survey.water
      .filter(w => !facilities.some(f => f.crossing.riverId === w.id))
      .map(w => ({ id: w.id, rings: w.rings.map(r => r.map(point)) }))
  };
  return validFixedBurgCrossings(payload, FIXED_SITE_CROSSING_BUDGETS) ? payload : null;
}

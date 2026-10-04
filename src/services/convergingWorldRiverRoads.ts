import { quadtree } from "d3";
import type { WorldContext } from "../context/worldContext";
import { type ConvergingRoadLeg, convergeRiverRoadLegs } from "../generators/convergingRiverRoads";
import { MIN_NAVIGABLE_FLUX } from "../generators/river-generator";
import {
  type CrossingCandidateInput,
  createProvisionalRiverCrossing,
  type ProvisionalRiverCrossing
} from "../generators/riverCrossingCandidates";
import type { Burg, Route } from "../types/models";
import type { FixedBurgCrossings } from "../utils/fixedBurgCrossings";
import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../utils/fixedBurgCrossings";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { populationWindowMeters } from "../utils/requiredSiteBounds";
import { RIVER_CARGO_VESSEL, SEA_SAILING_VESSEL } from "../utils/riverCrossing";
import { evaluateRiverAxis } from "./riverAxisSampling";
import type { RiverPoint } from "./riverGeometry";
import type { PhysicalRiverGeometry, PhysicalWaterPolygon } from "./riverPhysicalGeometry";
import { SettlementGeometrySession } from "./settlementGeometrySession";
import { coveredByTerrainCells, settlementRadiusMeters } from "./settlementRiverSite";

interface Facility {
  burgId: number;
  crossing: ProvisionalRiverCrossing;
  geometry: PhysicalRiverGeometry;
  near: RiverPoint;
  routeIds: number[];
  half: number;
  water: PhysicalWaterPolygon[];
}
interface Prepared {
  key: string;
  facilities: Facility[];
  changedRoutes: number[];
}
const cache = new WeakMap<object, Prepared>();
const session = new SettlementGeometrySession();
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
    p.cells.fl,
    p.rivers,
    p.vertices?.p,
    p.cells.v,
    p.cells.h,
    p.burgs?.map(b => b && [b.i, b.x, b.y, b.cell, b.population, b.removed]),
    p.routes?.map(r => [r.i, r.group, r.points, r.lock, r.registeredConnectionId])
  ]);
}

/** Normal road generation and CE export use the same committed FMG geometry.
 * No RNG, no modification of locked/registered roads, no unmeasured dry arms. */
export function ensureConvergingWorldRiverRoads(world: WorldContext, unit: string): Prepared {
  const initialKey = key(world, unit),
    old = cache.get(world.pack);
  if (old?.key === initialKey) return old;
  const result: Prepared = { key: initialKey, facilities: [], changedRoutes: [] };
  if (!world.pack.vertices?.p || !world.pack.cells.v?.length || world.options.landConnectionGeneration) {
    cache.set(world.pack, result);
    return result;
  }
  const scale = mapUnitMeters(world.distanceScale, unit);
  if (!(scale > 0)) return result;
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
  session.prepare(world, unit);
  const centers = world.pack.cells.p.map((p, id) => ({ p, id }));
  const tree = quadtree<(typeof centers)[number]>()
    .x(c => c.p[0])
    .y(c => c.p[1])
    .addAll(centers);
  let facilityId = 0;
  for (const burg of world.pack.burgs) {
    if (!burg?.i || burg.removed) continue;
    const origin: RiverPoint = [burg.x * scale, burg.y * scale];
    const half =
      populationWindowMeters(
        settlementRadiusMeters((burg.population ?? 0) * world.populationRate * world.urbanization)
      ) / 2;
    const bounds = { minX: origin[0] - half, maxX: origin[0] + half, minY: origin[1] - half, maxY: origin[1] + half };
    const legs: (ConvergingRoadLeg & {
      route: Route;
      index: number;
      reverse: boolean;
      sourcePoints: Route["points"];
    })[] = [];
    for (const route of world.pack.routes) {
      if (route.lock || route.group === "searoutes" || route.registeredConnectionId !== undefined) continue;
      const index = route.points.findIndex(p => p[2] === burg.cell && Math.hypot(p[0] - burg.x, p[1] - burg.y) < 1e-7);
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
    if (legs.length < 2) continue;
    const water: PhysicalWaterPolygon[] = [],
      geometries: PhysicalRiverGeometry[] = [];
    let complete = true;
    for (const riverId of session.rivers(bounds)) {
      const river = world.pack.rivers.find(r => r.i === riverId)!;
      const resolved = session.resolve(world, river, unit, bounds);
      if (!("geometry" in resolved)) {
        if (resolved.reason !== "no-local-water") complete = false;
        continue;
      }
      water.push(resolved.geometry.water);
      geometries.push(resolved.geometry);
    }
    if (!complete || !geometries.length) continue;
    const terrain = session.terrain(world, bounds);
    const supported = terrain.filter(t => world.pack.cells.h[t.id] >= 20);
    water.push(
      ...terrain.filter(t => world.pack.cells.h[t.id] < 20).map(t => ({ id: 1000000000 + t.id, rings: [t.ring] }))
    );
    const supports = (polygon: readonly RiverPoint[]) =>
      polygon.every(p => p[0] >= bounds.minX && p[0] <= bounds.maxX && p[1] >= bounds.minY && p[1] <= bounds.maxY) &&
      coveredByTerrainCells(
        polygon,
        supported.map(t => t.ring)
      );
    for (const geometry of geometries) {
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
          const t = length ? Math.max(0, Math.min(1, ((origin[0] - a[0]) * dx + (origin[1] - a[1]) * dy) / length)) : 0;
          arcs.push({
            arc: ref.arcStart + t * (ref.arcEnd - ref.arcStart),
            distance: Math.hypot(a[0] + dx * t - origin[0], a[1] + dy * t - origin[1])
          });
        }
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
      const candidates: { crossing: ProvisionalRiverCrossing; input: CrossingCandidateInput }[] = [];
      for (const { arc } of arcs.sort((a, b) => a.distance - b.distance).slice(0, 32)) {
        const input: CrossingCandidateInput = {
          id: facilityId,
          geometry,
          arcLengthMeters: arc,
          dimensions: { bankSeatMeters: 2, straightApproachMeters: 10, roadWidthMeters: 5, localWindowMeters: 20 },
          otherWater: water.filter(w => w !== geometry.water),
          capability: {
            period: world.options.historicalPeriod,
            technology: world.options.riverBridgeTechnology,
            depthMeters: river.cellHydrology?.[cellId]?.waterDepth,
            vessel
          },
          supportsDryFootprint: supports
        };
        const created = createProvisionalRiverCrossing(input);
        if ("candidate" in created) candidates.push({ crossing: created.candidate, input });
      }
      const merged = convergeRiverRoadLegs(origin, legs, candidates, half - 20);
      if (!merged) continue;
      const facility: Facility = {
        burgId: burg.i,
        crossing: merged.crossing,
        geometry,
        near: merged.trunk[1],
        routeIds: merged.legs.map(l => legs[l.id].route.i),
        half,
        water
      };
      if (!crossingsPayload(world, unit, burg, [facility])) continue;
      for (const changed of merged.legs) {
        const leg = legs[changed.id],
          route = leg.route;
        route.riverRoadConvergence ??= { originalPoints: structuredClone(route.points), pointsKey: "", burgIds: [] };
        const index = route.points.findIndex(
          p => p[2] === burg.cell && Math.hypot(p[0] - burg.x, p[1] - burg.y) < 1e-7
        );
        const points: Route["points"] = changed.points.map((p, i) => [
          p[0] / scale,
          p[1] / scale,
          i === 0
            ? burg.cell
            : i >= 6
              ? leg.sourcePoints[changed.rejoinSegment + i - 6][2]
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
      break;
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
  result.key = key(world, unit);
  cache.set(world.pack, result);
  return result;
}

export function convergedBurgFacilities(world: WorldContext, unit: string, burgId: number) {
  return ensureConvergingWorldRiverRoads(world, unit).facilities.filter(f => f.burgId === burgId);
}

/** The regional water and derivative witness used by FMG become CE's v4 source. */
export function convergedBurgCrossings(world: WorldContext, unit: string, burg: Burg): FixedBurgCrossings | null {
  return crossingsPayload(world, unit, burg, convergedBurgFacilities(world, unit, burg.i!));
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
  const half = Math.min(...facilities.map(f => f.half));
  const occupied = crossings.flatMap(c =>
    [c.approachA, c.approachB, c.deckA, c.deckB].flatMap(p =>
      [-3, 3].map(d => [p[0] + d * c.tangent[0], p[1] + d * c.tangent[1]])
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
    rivers: facilities.map(f => ({
      id: f.crossing.riverId,
      geometryVersion: f.crossing.geometryVersion,
      rings: f.geometry.water.rings.map(r => r.map(point))
    })),
    crossings,
    obstacles: facilities[0].water
      .filter(w => !facilities.some(f => f.geometry.water === w))
      .map(w => ({ id: w.id, rings: w.rings.map(r => r.map(point)) }))
  };
  return validFixedBurgCrossings(payload, FIXED_SITE_CROSSING_BUDGETS) ? payload : null;
}

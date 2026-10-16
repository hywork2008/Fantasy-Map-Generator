/** Read-only CE road projection. No preparation, store access, regeneration or commits. */

import type { BurgSiteRoadEntry, BurgSiteRoadNextBurg } from "../types/burgSiteDescriptor";
import type { Burg, Route } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { burgLotOccupancy, occupancyRadiusMeters } from "../utils/cultureLotOccupancy";
import type { RelationKey } from "../utils/diplomacyRelations";
import { rn } from "../utils/numberUtils";
import { measureProcessing, type ProcessingProfiler } from "../utils/processingProfiler";
import { residentialStoreys, supportsUrbanMorphology } from "../utils/urbanMorphology";
import { burgDestinationTraits } from "./burgDestinationTraits";
import { clipPolylineToBox } from "./sitePolylineGeometry";

export interface BurgRoadFacility {
  routeIds: number[];
  near: readonly [number, number];
  crossing: { id: number };
}
/** Supplied only after the registered snapshot has passed its existing current-world validator. */
export interface RegisteredBurgRoad {
  from: number;
  to: number;
  crossing?: { approachA: readonly [number, number]; approachB: readonly [number, number] };
}
export interface BurgRoadContext {
  pack: PackedGraph;
  populationRate: number;
  urbanization: number;
  metersPerMapUnit: number;
  landConnectionGeneration?: boolean;
  renderPoints: (route: Route) => number[][];
  registeredConnectionAt?: (route: Route) => RegisteredBurgRoad | null;
  facilities?: readonly BurgRoadFacility[];
  trafficRanks?: ReadonlyMap<number, number>;
  routes?: readonly Route[];
  onUnresolved?: (route: Route, reason: string) => void;
}
export interface BurgRouteLeg {
  route: Route;
  leg: [number, number, number][];
  direction: "forward" | "backward";
}
export function roadAzimuthDeg(dx: number, dy: number): number {
  return rn(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360, 1) % 360;
}

/** Same split and registered-endpoint rules as the CE handoff. */
export function collectBurgRouteLegs(
  context: BurgRoadContext,
  burg: Burg,
  profiler?: ProcessingProfiler
): BurgRouteLeg[] {
  const legs: BurgRouteLeg[] = [];
  for (const route of context.routes ?? context.pack.routes) {
    if (route.merged || !route.points?.length) continue;
    if (route.registeredConnectionId !== undefined) {
      const edge = context.registeredConnectionAt?.(route);
      if (!edge) {
        context.onUnresolved?.(route, "registered_snapshot_unavailable");
        continue;
      }
      if (edge.from !== burg.i && edge.to !== burg.i) continue;
      const direction = edge.from === burg.i ? "forward" : "backward";
      let leg = direction === "forward" ? route.points.slice() : route.points.slice().reverse();
      if (edge.crossing) {
        const endpoint = edge.from === burg.i ? edge.crossing.approachA : edge.crossing.approachB;
        const scale = context.metersPerMapUnit;
        const terminal = leg.findIndex(p => Math.hypot(p[0] * scale - endpoint[0], p[1] * scale - endpoint[1]) <= 1e-7);
        if (terminal < 1) {
          context.onUnresolved?.(route, "registered_approach_not_in_saved_points");
          continue;
        }
        leg = leg.slice(0, terminal + 1);
      }
      if (leg.length >= 2) legs.push({ route, leg, direction });
      continue;
    }
    if (context.landConnectionGeneration && route.group !== "searoutes") continue;
    if (!route.points.some(p => p[2] === burg.cell)) continue;
    const points = measureProcessing(profiler, "route-render-points", () => context.renderPoints(route)) as [
      number,
      number,
      number
    ][];
    let index = -1;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (point[2] !== burg.cell) continue;
      const d = Math.hypot(point[0] - burg.x, point[1] - burg.y);
      if (route.riverRoadConvergence && d >= 1e-7) continue;
      if (index === -1 || d < Math.hypot(points[index][0] - burg.x, points[index][1] - burg.y)) index = i;
    }
    if (index < 0) {
      context.onUnresolved?.(route, "rendered_origin_not_found");
      continue;
    }
    const forward = points.slice(index),
      backward = points.slice(0, index + 1).reverse();
    if (forward.length >= 2) legs.push({ route, leg: forward, direction: "forward" });
    if (backward.length >= 2) legs.push({ route, leg: backward, direction: "backward" });
  }
  return legs;
}

/** 0..1 rank of Route.traffic among land routes that have any. Sea lanes are not in the ranking. */
export function landTrafficRanks(routes: { i: number; group: string; traffic?: number }[]): Map<number, number> {
  const carrying = routes.filter(route => route && route.group !== "searoutes" && (route.traffic ?? 0) > 0);
  const ranks = new Map<number, number>();
  if (!carrying.length) return ranks;
  const values = carrying.map(route => route.traffic ?? 0).sort((a, b) => a - b);
  for (const route of carrying) {
    const traffic = route.traffic ?? 0;
    let atMost = 0;
    for (const value of values) if (value <= traffic) atMost++;
    ranks.set(route.i, Math.round((atMost / values.length) * 10000) / 10000);
  }
  return ranks;
}

export function burgRoadDestination(
  context: BurgRoadContext,
  burg: Burg,
  leg: [number, number, number][],
  withoutEconomy = false
): BurgSiteRoadNextBurg | null {
  const { pack, metersPerMapUnit } = context;
  // First other burg along the leg — the signpost destination behind this gate.
  let nextBurg: BurgSiteRoadEntry["nextBurg"] = null;
  let lengthMapUnits = 0;
  for (let i = 1; i < leg.length; i++) {
    lengthMapUnits += Math.hypot(leg[i][0] - leg[i - 1][0], leg[i][1] - leg[i - 1][1]);
    const cellBurgId = pack.cells.burg[leg[i][2]];
    if (cellBurgId && cellBurgId !== burg.i) {
      const target = pack.burgs[cellBurgId];
      const isDomestic = target ? target.state === burg.state : true;
      let diplomacyRelation: BurgSiteRoadNextBurg["diplomacyRelation"] = isDomestic ? "domestic" : "Neutral";
      if (!isDomestic && target && burg.state && target.state) {
        const stateRel = pack.states[burg.state]?.diplomacy?.[target.state];
        if (typeof stateRel === "string") {
          diplomacyRelation = stateRel as RelationKey;
        }
      }
      const stateName = (target?.state && pack.states[target.state]?.name) || "";
      const pop = target?.population ?? 0;
      const { scale, role } = burgDestinationTraits(target);

      const popRate = context.populationRate * context.urbanization;
      nextBurg = {
        id: cellBurgId,
        name: target?.name ?? "",
        distanceMeters: rn(lengthMapUnits * metersPerMapUnit),
        stateId: target?.state,
        stateName,
        isDomestic,
        diplomacyRelation,
        population: Math.round(pop * popRate),
        scale,
        role,
        capital: Boolean(target?.capital),
        walls: Boolean(target?.walls),
        citadel: Boolean(target?.citadel),
        ...(withoutEconomy
          ? {}
          : {
              treasury: target?.treasury,
              wealth: (target as { wealth?: number })?.wealth ?? Math.min(100, Math.round(pop * 10))
            })
      };
      break;
    }
  }

  return nextBurg;
}

export function collectBurgRoadEntries(
  context: BurgRoadContext,
  burg: Burg,
  options: {
    toLocal: (x: number, y: number) => [number, number];
    half: number;
    cityRadiusMeters: number;
    withoutEconomy?: boolean;
    profiler?: ProcessingProfiler;
  }
): BurgSiteRoadEntry[] {
  const { pack, metersPerMapUnit, facilities = [] } = context;
  const { toLocal, half, cityRadiusMeters, withoutEconomy = false, profiler } = options;
  if (!pack.routes?.length) return [];
  const entries: BurgSiteRoadEntry[] = [];
  const trafficRanks = withoutEconomy
    ? new Map<number, number>()
    : (context.trafficRanks ?? landTrafficRanks(pack.routes));
  for (const { route, leg } of measureProcessing(profiler, "route-legs", () =>
    collectBurgRouteLegs(context, burg, profiler)
  )) {
    const facility = facilities.find(
      f =>
        f.routeIds.includes(route.i) &&
        leg.some(p => Math.hypot(p[0] * metersPerMapUnit - f.near[0], p[1] * metersPerMapUnit - f.near[1]) < 1e-7)
    );
    const terminal = facility
      ? leg.findIndex(
          p => Math.hypot(p[0] * metersPerMapUnit - facility.near[0], p[1] * metersPerMapUnit - facility.near[1]) < 1e-7
        )
      : -1;
    const localPoints = (terminal >= 1 ? leg.slice(0, terminal + 1) : leg).map(([x, y]) => toLocal(x, y));

    // Azimuth where the leg crosses the city radius (gate direction).
    let entryAzimuth: number | null = null;
    let _travelled = 0;
    for (let i = 1; i < localPoints.length; i++) {
      const [px, py] = localPoints[i];
      const dist = Math.hypot(px, py);
      _travelled += Math.hypot(px - localPoints[i - 1][0], py - localPoints[i - 1][1]);
      if (dist >= cityRadiusMeters) {
        entryAzimuth = roadAzimuthDeg(px, py);
        break;
      }
    }
    const [lastX, lastY] = localPoints.at(-1) as [number, number];
    const reachesEdge = entryAzimuth !== null;
    if (entryAzimuth === null) {
      if (Math.hypot(lastX, lastY) < 1) continue; // degenerate leg collapsed on the origin
      entryAzimuth = roadAzimuthDeg(lastX, lastY);
    }

    const nextBurg = burgRoadDestination(context, burg, leg, withoutEconomy);

    const clipped = clipPolylineToBox(localPoints, half, !!facility);
    const shared = facility && entries.find(e => e.sharedCrossingId === facility.crossing.id);
    if (shared) {
      shared.sharedBranches!.push({
        routeId: route.i,
        path:
          clipPolylineToBox(
            leg.map(([x, y]) => toLocal(x, y)),
            half,
            true
          )[0] ?? [],
        nextBurg
      });
      if (!shared.sharedRouteIds!.includes(route.i)) shared.sharedRouteIds!.push(route.i);
      if (nextBurg && !shared.nextBurgs!.some(b => b.id === nextBurg.id)) shared.nextBurgs!.push(nextBurg);
      continue;
    }
    entries.push({
      ...(facility
        ? {
            sharedCrossingId: facility.crossing.id,
            sharedRouteIds: [route.i],
            nextBurgs: nextBurg ? [nextBurg] : [],
            sharedBranches: [
              {
                routeId: route.i,
                path:
                  clipPolylineToBox(
                    leg.map(([x, y]) => toLocal(x, y)),
                    half,
                    true
                  )[0] ?? [],
                nextBurg
              }
            ]
          }
        : {}),
      approachId: facility
        ? `burg:${burg.i}:crossing:${facility.crossing.id}`
        : `burg:${burg.i}:route:${route.i}:edge:${leg.find(p => p[2] !== burg.cell)?.[2] ?? leg.at(-1)?.[2] ?? burg.cell}`,
      routeId: route.i,
      group: route.group,
      ...(route.name ? { name: route.name } : {}),
      ...(!withoutEconomy && route.traffic && route.traffic > 0
        ? { traffic: route.traffic, trafficRank: trafficRanks.get(route.i) ?? 0 }
        : {}),
      entryAzimuthDeg: entryAzimuth,
      reachesEdge,
      path: clipped[0] ?? [],
      nextBurg
    });
  }

  entries.sort((a, b) => a.entryAzimuthDeg - b.entryAzimuthDeg);
  return entries;
}

export interface BurgRoadReadSnapshot {
  routes: Route[];
  renderedRoutes: { routeId: number; points: number[][] }[];
  facilities: BurgRoadFacility[];
  registered: { routeId: number; connection: RegisteredBurgRoad | null }[];
}
/** Serialize only already-prepared, validated reader inputs. Does not prepare or generate roads. */
export function captureBurgRoadReadSnapshot(context: BurgRoadContext, burg: Burg): BurgRoadReadSnapshot {
  const routes: Route[] = [],
    renderedRoutes: BurgRoadReadSnapshot["renderedRoutes"] = [],
    registered: BurgRoadReadSnapshot["registered"] = [];
  for (const route of context.routes ?? context.pack.routes) {
    if (route.merged || !route.points?.length) continue;
    if (route.registeredConnectionId !== undefined) {
      const connection = context.registeredConnectionAt?.(route) ?? null;
      if (connection && connection.from !== burg.i && connection.to !== burg.i) continue;
      if (!connection && !route.points.some(p => p[2] === burg.cell)) continue;
      registered.push({ routeId: route.i, connection });
    } else {
      if (context.landConnectionGeneration && route.group !== "searoutes") continue;
      if (!route.points.some(p => p[2] === burg.cell)) continue;
      renderedRoutes.push({ routeId: route.i, points: context.renderPoints(route) });
    }
    routes.push(route);
  }
  return structuredClone({ routes, renderedRoutes, registered, facilities: [...(context.facilities ?? [])] });
}

/** Same radius used to select the CE gate bearing. */
export function burgRoadCityRadiusMeters(
  pack: PackedGraph,
  burg: Burg,
  population: number,
  morphologyPeriod?: string
): number {
  return occupancyRadiusMeters(
    population,
    burgLotOccupancy(pack, burg),
    burg,
    morphologyPeriod && supportsUrbanMorphology(morphologyPeriod)
      ? Math.max(1, residentialStoreys(morphologyPeriod).standard - 1)
      : 1
  );
}

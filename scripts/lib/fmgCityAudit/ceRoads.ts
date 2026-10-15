import type { WorldContext } from "../../../src/context/worldContext";
import type { Route } from "../../../src/types/models";
import type { BurgSiteRoadEntry } from "../../../src/services/burgSiteDescriptor";
import { burgRoadInputRevision, type BurgRoadAuditReference } from "../../../src/services/burgRoadAuditReference";
import {
  burgRoadCityRadiusMeters,
  collectBurgRoadEntries,
  collectBurgRouteLegs,
  burgRoadDestination,
  landTrafficRanks,
  type BurgRoadContext,
  type BurgRoadReadSnapshot
} from "../../../src/services/burgRoadProjection";
import { routeRenderPoints } from "../../../src/services/routeRenderGeometry";
import { supportsUrbanMorphology } from "../../../src/utils/urbanMorphology";
import { populationWindowMeters } from "../../../src/utils/requiredSiteBounds";
import { type RecordValue, record } from "../fmgArchiveReader";
import type { Finding } from "./model";

type Reference = BurgRoadAuditReference;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const point = (v: unknown, withCell = false): boolean =>
  Array.isArray(v) &&
  v.length >= (withCell ? 3 : 2) &&
  finite(v[0]) &&
  finite(v[1]) &&
  (!withCell || (Number.isSafeInteger(v[2]) && v[2] >= 0));
function requireShape(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`Invalid CE handoff: ${message}`);
}

/** Deliberately do not accept a bare descriptor without map/input provenance. */
export function parseCeRoadReference(value: unknown): Reference {
  const r = record(value),
    f = record(r.projectionFrame),
    prepared = record(r.prepared);
  requireShape(r.format === "fmg-ce-road-handoff" && r.schemaVersion === 1, "format/schema");
  requireShape(typeof r.inputSha256 === "string" && /^[a-f0-9]{64}$/.test(r.inputSha256), "inputSha256");
  requireShape(
    Number.isSafeInteger(r.mapId) &&
      typeof r.seed === "string" &&
      Number.isSafeInteger(r.burgId) &&
      Number(r.burgId) > 0,
    "map/burg identity"
  );
  requireShape(
    typeof r.sourceRevision === "string" &&
      r.sourceRevision.startsWith("road-input-v1:") &&
      typeof r.preparedRevision === "string" &&
      r.preparedRevision.startsWith("road-input-v1:"),
    "road input revisions"
  );
  requireShape(
    point(f.originMapUnits) &&
      finite(f.metersPerMapUnit) &&
      f.metersPerMapUnit > 0 &&
      finite(f.cityRadiusMeters) &&
      f.cityRadiusMeters > 0 &&
      finite(f.halfMeters) &&
      f.halfMeters > 0,
    "projection frame"
  );
  function nextBurg(v: unknown) {
    if (v === null) return;
    const b = record(v);
    requireShape(
      Number.isSafeInteger(b.id) && Number(b.id) > 0 && typeof b.name === "string" && finite(b.distanceMeters),
      "nextBurg"
    );
  }
  function points(v: unknown, cell = false) {
    requireShape(Array.isArray(v) && v.every(p => point(p, cell)), "path points");
  }
  requireShape(typeof r.withoutEconomy === "boolean", "withoutEconomy");
  requireShape(Array.isArray(r.roads), "roads");
  for (const v of r.roads) {
    const road = record(v);
    requireShape(
      Number.isSafeInteger(road.routeId) &&
        typeof road.group === "string" &&
        finite(road.entryAzimuthDeg) &&
        typeof road.reachesEdge === "boolean",
      "road entry"
    );
    points(road.path);
    nextBurg(road.nextBurg);
    if (road.sharedBranches !== undefined) {
      requireShape(Array.isArray(road.sharedBranches), "sharedBranches");
      for (const v of road.sharedBranches) {
        const branch = record(v);
        requireShape(Number.isSafeInteger(branch.routeId), "branch routeId");
        points(branch.path);
        nextBurg(branch.nextBurg);
      }
    }
  }
  for (const key of ["routes", "renderedRoutes", "registered", "facilities"])
    requireShape(Array.isArray(prepared[key]), `prepared.${key}`);
  const seen = new Set<number>();
  for (const v of prepared.routes as unknown[]) {
    const route = record(v);
    requireShape(
      Number.isSafeInteger(route.i) && !seen.has(Number(route.i)) && typeof route.group === "string",
      "prepared route ID/group"
    );
    seen.add(Number(route.i));
    points(route.points, true);
  }
  const seenRender = new Set<number>(),
    seenRegistered = new Set<number>();
  for (const v of prepared.renderedRoutes as unknown[]) {
    const route = record(v);
    requireShape(seen.has(Number(route.routeId)) && !seenRender.has(Number(route.routeId)), "rendered route reference");
    seenRender.add(Number(route.routeId));
    points(route.points, true);
  }
  for (const v of prepared.registered as unknown[]) {
    const entry = record(v);
    requireShape(
      seen.has(Number(entry.routeId)) && !seenRegistered.has(Number(entry.routeId)),
      "registered route reference"
    );
    seenRegistered.add(Number(entry.routeId));
    if (entry.connection !== null) {
      const c = record(entry.connection);
      requireShape(Number.isSafeInteger(c.from) && Number.isSafeInteger(c.to), "registered endpoints");
      if (c.crossing !== undefined) {
        const crossing = record(c.crossing);
        requireShape(point(crossing.approachA) && point(crossing.approachB), "registered bridge approaches");
      }
    }
  }
  for (const v of prepared.facilities as unknown[]) {
    const facility = record(v);
    requireShape(
      point(facility.near) &&
        Number.isSafeInteger(record(facility.crossing).id) &&
        Array.isArray(facility.routeIds) &&
        facility.routeIds.every(v => Number.isSafeInteger(v) && seen.has(v)),
      "shared facility"
    );
  }
  return value as Reference;
}

export interface CeRoadAuditResult {
  roads: RecordValue[];
  differences: RecordValue[];
  findings: Finding[];
  legs: Map<string, RecordValue>;
  status: string;
}

function flatten(sourceId: number, stage: string, roads: BurgSiteRoadEntry[], status: string): RecordValue[] {
  return roads.flatMap((road, entryIndex) =>
    (road.sharedBranches?.length
      ? road.sharedBranches
      : [{ routeId: road.routeId, path: road.path, nextBurg: road.nextBurg }]
    ).map((branch, branchId) => ({
      sourceId,
      stage,
      entryIndex,
      branchId,
      approachId: road.approachId ?? null,
      routeId: branch.routeId,
      routeGroup: road.group,
      sharedCrossingId: road.sharedCrossingId ?? null,
      sharedRouteIds: road.sharedRouteIds ?? [],
      entryAzimuthDeg: road.entryAzimuthDeg,
      reachesEdge: road.reachesEdge,
      path: road.path,
      branchPath: branch.path,
      ceTargetId: branch.nextBurg?.id ?? null,
      ceNextBurgDistanceMeters: branch.nextBurg?.distanceMeters ?? null,
      cePopulation: branch.nextBurg?.population ?? null,
      ceDiplomacyRelation: branch.nextBurg?.diplomacyRelation ?? null,
      ceScale: branch.nextBurg?.scale ?? null,
      ceRole: branch.nextBurg?.role ?? null,
      ceCitadel: branch.nextBurg?.citadel ?? null,
      ceWalls: branch.nextBurg?.walls ?? null,
      nextBurg: branch.nextBurg,
      nextBurgs: road.nextBurgs ?? [],
      traffic: road.traffic ?? null,
      trafficRank: road.trafficRank ?? null,
      status,
      evidence: [`${stage === "observed_handoff" ? "ce-handoff" : "projection"}#/roads/${entryIndex}`]
    }))
  );
}

/** Compare full road records recursively. Undefined and absent optional properties have the same JSON meaning. */
export function compareCeRoadEntries(
  sourceId: number,
  stage: string,
  expected: BurgSiteRoadEntry[],
  observed: BurgSiteRoadEntry[]
): RecordValue[] {
  const differences: RecordValue[] = [];
  const identity = (r: BurgSiteRoadEntry) => `${r.approachId ?? "route:" + r.routeId}:${r.routeId}`;
  const expectedMap = new Map<string, BurgSiteRoadEntry[]>(),
    observedMap = new Map<string, BurgSiteRoadEntry[]>();
  for (const [roads, map] of [
    [expected, expectedMap],
    [observed, observedMap]
  ] as const)
    for (const road of roads) {
      const key = identity(road);
      const bin = map.get(key) ?? [];
      bin.push(road);
      map.set(key, bin);
    }
  function compare(key: string, field: string, a: unknown, b: unknown) {
    if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= 1e-7) return;
    if (a === b) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) compare(key, field + "/length", a.length, b.length);
      for (let i = 0; i < Math.max(a.length, b.length); i++) compare(key, `${field}/${i}`, a[i], b[i]);
      return;
    }
    if (
      a !== null &&
      b !== null &&
      typeof a === "object" &&
      typeof b === "object" &&
      a !== undefined &&
      b !== undefined
    ) {
      for (const prop of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort())
        compare(key, `${field}/${prop.replace(/~/g, "~0").replace(/\//g, "~1")}`, record(a)[prop], record(b)[prop]);
      return;
    }
    differences.push({
      sourceId,
      comparison: stage,
      approachKey: key,
      field: field || "/",
      projected: a ?? null,
      observed: b ?? null
    });
  }
  const unmatchedExpected: BurgSiteRoadEntry[] = [],
    unmatchedObserved: BurgSiteRoadEntry[] = [];
  for (const key of [...new Set([...expectedMap.keys(), ...observedMap.keys()])].sort()) {
    const a = expectedMap.get(key) ?? [],
      b = observedMap.get(key) ?? [];
    for (let i = 0; i < Math.min(a.length, b.length); i++) compare(`${key}:${i}`, "", a[i], b[i]);
    unmatchedExpected.push(...a.slice(b.length));
    unmatchedObserved.push(...b.slice(a.length));
  }
  // Convergence changes the approach ID. Match only an unambiguous route+destination
  // so that the resulting delta identifies the changed fields instead of two missing records.
  const fallbackA = new Map<string, BurgSiteRoadEntry[]>(),
    fallbackB = new Map<string, BurgSiteRoadEntry[]>();
  for (const [entries, map] of [
    [unmatchedExpected, fallbackA],
    [unmatchedObserved, fallbackB]
  ] as const)
    for (const entry of entries) {
      const key = `route:${entry.routeId}:target:${entry.nextBurg?.id ?? "none"}`;
      const bin = map.get(key) ?? [];
      bin.push(entry);
      map.set(key, bin);
    }
  for (const key of [...new Set([...fallbackA.keys(), ...fallbackB.keys()])].sort()) {
    const a = fallbackA.get(key) ?? [],
      b = fallbackB.get(key) ?? [];
    if (a.length === 1 && b.length === 1) compare(key, "", a[0], b[0]);
    else {
      for (const [i, entry] of a.entries()) compare(`${key}:projected:${i}`, "", entry, undefined);
      for (const [i, entry] of b.entries()) compare(`${key}:observed:${i}`, "", undefined, entry);
    }
  }
  return differences;
}

export function auditCeRoads(input: {
  world: WorldContext;
  sourceIds: number[];
  inputHash: string;
  metersPerMapUnit: number | null;
  distanceUnit: string | null;
  invalidInput: boolean;
  routesByBurg?: ReadonlyMap<number, readonly Route[]>;
  reference?: Reference;
}): CeRoadAuditResult {
  const { world, sourceIds, inputHash, reference } = input;
  const roads: RecordValue[] = [],
    differences: RecordValue[] = [],
    findings: Finding[] = [],
    legs = new Map<string, RecordValue>();
  const add = (
    ruleId: string,
    sourceId: number,
    message: string,
    status: Finding["status"],
    severity: Finding["severity"] = "info"
  ) =>
    findings.push({
      ruleId,
      ruleVersion: 1,
      subject: `burg:${sourceId}`,
      severity,
      status,
      message,
      evidence: ["map/world.json#/pack/routes"]
    });
  if (reference) {
    if (reference.inputSha256 !== inputHash || reference.mapId !== world.mapId || reference.seed !== world.seed)
      throw new Error("CE handoff belongs to a different input hash or map identity");
    if (!sourceIds.includes(reference.burgId)) throw new Error("CE handoff burg must be an audit origin");
    if (reference.sourceRevision !== burgRoadInputRevision(world))
      throw new Error("CE handoff source revision differs from the saved input; comparison refused");
  }
  const renderCache = new Map<Route, number[][]>();
  const trafficRanks = landTrafficRanks(world.pack.routes);
  const hasRegistered = world.pack.routes.some(r => r.registeredConnectionId !== undefined);
  for (const sourceId of sourceIds) {
    const burg = world.pack.burgs[sourceId];
    if (
      input.invalidInput ||
      !burg ||
      !input.distanceUnit ||
      input.metersPerMapUnit === null ||
      !finite(burg.population)
    ) {
      add(
        "CE_HANDOFF_MISMATCH",
        sourceId,
        "CE road projection needs valid geometry, population scaling, and a confirmed distance unit",
        "skipped"
      );
      continue;
    }
    const mpu = input.metersPerMapUnit;
    const morphologyPeriod =
      world.pack.states?.length && world.pack.cultures?.length && world.pack.cells.state
        ? (world.options.historicalPeriod ?? "ageOfExploration")
        : undefined;
    const radius = burgRoadCityRadiusMeters(
      world.pack,
      burg,
      Math.round(burg.population * world.populationRate * world.urbanization),
      morphologyPeriod
    );
    const frame = {
      originMapUnits: [burg.x, burg.y],
      cityRadiusMeters: radius,
      halfMeters: populationWindowMeters(radius) / 2,
      metersPerMapUnit: mpu
    };
    const ref = reference?.burgId === sourceId ? reference : undefined;
    if (
      ref &&
      (ref.projectionFrame.originMapUnits[0] !== burg.x ||
        ref.projectionFrame.originMapUnits[1] !== burg.y ||
        Math.abs(ref.projectionFrame.metersPerMapUnit - mpu) > 1e-7)
    )
      throw new Error("CE handoff frame origin or distance unit differs from the input");
    const usedFrame = ref?.projectionFrame ?? frame;
    const projectionOptions = {
      withoutEconomy: ref?.withoutEconomy ?? (!!morphologyPeriod && supportsUrbanMorphology(morphologyPeriod)),
      toLocal: (x: number, y: number): [number, number] => [(x - burg.x) * mpu, (burg.y - y) * mpu],
      half: usedFrame.halfMeters,
      cityRadiusMeters: usedFrame.cityRadiusMeters
    };
    const unresolved = new Set<string>();
    const context: BurgRoadContext = {
      pack: world.pack,
      routes: input.routesByBurg ? (input.routesByBurg.get(sourceId) ?? []) : undefined,
      trafficRanks,
      populationRate: world.populationRate,
      urbanization: world.urbanization,
      metersPerMapUnit: mpu,
      landConnectionGeneration: !!world.options.landConnectionGeneration,
      renderPoints: route => {
        let p = renderCache.get(route);
        if (!p) {
          p = routeRenderPoints(world, route, input.distanceUnit!);
          renderCache.set(route, p);
        }
        return p;
      },
      onUnresolved: (route, reason) => unresolved.add(`route:${route.i}:${reason}`)
    };
    let saved: BurgSiteRoadEntry[];
    try {
      saved = collectBurgRoadEntries(context, burg, projectionOptions);
      for (const { route, leg, direction } of collectBurgRouteLegs(context, burg)) {
        const next = burgRoadDestination(context, burg, leg);
        const terminal = next
          ? leg.findIndex((p, i) => i > 0 && world.pack.cells.burg[p[2]] === next.id)
          : leg.length - 1;
        legs.set(`${sourceId}:${route.i}:${direction}`, {
          ceTargetId: next?.id ?? null,
          ceNextBurgDistanceMeters: next?.distanceMeters ?? null,
          renderedPathMapUnits: leg
            .slice(1, terminal + 1)
            .reduce((sum, p, i) => sum + Math.hypot(p[0] - leg[i][0], p[1] - leg[i][1]), 0),
          ceNextBurg: next
        });
      }
    } catch (error) {
      add(
        "CE_PROJECTION_UNAVAILABLE",
        sourceId,
        `Saved geometry cannot be projected: ${error instanceof Error ? error.message : String(error)}`,
        "skipped",
        "warning"
      );
      continue;
    }
    const convergence = (context.routes ?? world.pack.routes).some(
      r => Array.isArray(r.riverRoadConvergence?.burgIds) && r.riverRoadConvergence.burgIds.includes(sourceId)
    );
    if (hasRegistered) unresolved.add("registered_snapshot_unavailable");
    if (convergence) unresolved.add("shared_crossing_preparation_not_persisted");
    const savedStatus = unresolved.size ? "partial_saved_projection" : "saved_projection";
    roads.push(...flatten(sourceId, "saved_projection", saved, savedStatus));
    for (const reason of unresolved) add("CE_PROJECTION_INCOMPLETE", sourceId, reason, "skipped");
    if (!ref) {
      add(
        "CE_HANDOFF_MISMATCH",
        sourceId,
        "Saved roads projected through the shared reader; no actual CE handoff reference supplied",
        "skipped"
      );
      continue;
    }
    // Reference reader inputs were captured only after the runtime validated its snapshot.
    // This replays that captured handoff, never treats serialized registered IDs as authorization.
    const snapshot: BurgRoadReadSnapshot = ref.prepared;
    const rendered = new Map(snapshot.renderedRoutes.map(r => [r.routeId, r.points]));
    const registered = new Map(snapshot.registered.map(r => [r.routeId, r.connection]));
    const replayUnresolved = new Set<string>();
    const snapshotRoutes = new Map(snapshot.routes.map(r => [r.i, r]));
    const replayPack = { ...world.pack, routes: world.pack.routes.map(r => snapshotRoutes.get(r.i) ?? r) };
    const replayContext: BurgRoadContext = {
      ...context,
      pack: replayPack,
      trafficRanks: landTrafficRanks(replayPack.routes),
      routes: snapshot.routes,
      facilities: snapshot.facilities,
      renderPoints: route => {
        const p = rendered.get(route.i);
        if (!p) throw new Error(`Missing captured rendered route ${route.i}`);
        return p;
      },
      registeredConnectionAt: route => registered.get(route.i) ?? null,
      onUnresolved: (route, reason) => replayUnresolved.add(`route:${route.i}:${reason}`)
    };
    const knownRouteIds = new Set(world.pack.routes.map(r => r.i));
    for (const route of snapshot.routes)
      requireShape(knownRouteIds.has(route.i), "captured route not present in saved input");
    for (const route of [...snapshot.routes, ...snapshot.renderedRoutes])
      for (const p of route.points) requireShape(world.pack.cells.p[p[2]], "captured route cell reference");
    const replay = collectBurgRoadEntries(replayContext, burg, projectionOptions);
    const replayDiff = compareCeRoadEntries(sourceId, "captured_inputs_vs_handoff", replay, ref.roads);
    const savedDiff = compareCeRoadEntries(sourceId, "saved_inputs_vs_handoff", saved, ref.roads);
    differences.push(...savedDiff, ...replayDiff);
    roads.push(
      ...flatten(
        sourceId,
        "captured_projection",
        replay,
        replayUnresolved.size ? "partial_captured_projection" : replayDiff.length ? "mismatch" : "matched"
      ),
      ...flatten(sourceId, "observed_handoff", ref.roads, "observed")
    );
    if (ref.preparedRevision !== ref.sourceRevision)
      add(
        "CE_PREPARATION_CHANGED_INPUT",
        sourceId,
        "CE preparation changed map-wide road inputs; saved-vs-handoff deltas describe that upstream transformation",
        "flagged",
        "warning"
      );
    if (replayUnresolved.size) add("CE_HANDOFF_MISMATCH", sourceId, [...replayUnresolved].join("; "), "skipped");
    else
      add(
        "CE_HANDOFF_MISMATCH",
        sourceId,
        replayDiff.length
          ? `${replayDiff.length} field differences between captured read inputs and actual handoff`
          : "Captured read inputs reproduce actual CE road handoff",
        replayDiff.length ? "flagged" : "pass",
        replayDiff.length ? "error" : "info"
      );
    if (savedDiff.length && !unresolved.size && ref.preparedRevision === ref.sourceRevision)
      add(
        "CE_SAVED_HANDOFF_MISMATCH",
        sourceId,
        `${savedDiff.length} field differences between saved projection and actual handoff`,
        "flagged",
        "error"
      );
  }
  for (const road of roads) {
    const ref = reference?.burgId === road.sourceId ? reference : undefined;
    road.frameSource = ref ? "handoff_reference" : "population_window";
  }
  return {
    roads,
    differences,
    findings,
    legs,
    status: reference ? "reference_compared" : "saved_geometry_projection_only"
  };
}

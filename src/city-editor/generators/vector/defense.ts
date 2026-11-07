import { historicalPeriodIndex } from "../../../types/historicalPeriod";
import { bridgeSkewDegrees, resolveBridgeSkewLimit, withinBridgeSkewLimit } from "../../../utils/bridgeSkewPolicy";
import type { Point } from "../../types/primitives";
import type { VectorDefensePlan } from "../../types/vector/defense";
import type { VectorCityDocument } from "../../types/vector/document";
import { FORTRESS_WALL_BIND_METERS } from "../bastionedTown/geometry";
import { nearestOnPolyline } from "../geom";
import { evaluateAnchor } from "./geometry/curves";
import { regionArea, regionBoolean } from "./geometry/regions";
import { ringInside } from "./geometry/routing";
import { simpleContour } from "./geometry/surfaces";

export function defenseAccessSurface(points: Point[], width: number) {
  const polygons = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-8) continue;
    const x = ((-(b[1] - a[1]) / length) * width) / 2,
      y = (((b[0] - a[0]) / length) * width) / 2;
    polygons.push({
      outer: [
        [a[0] + x, a[1] + y],
        [b[0] + x, b[1] + y],
        [b[0] - x, b[1] - y],
        [a[0] - x, a[1] - y]
      ] as Point[],
      holes: []
    });
  }
  return polygons;
}
export function defenseReservations(plan: VectorDefensePlan) {
  return [
    ...plan.bastions.flatMap(p => [
      { outer: p.rampart, holes: [] },
      { outer: p.platform, holes: [] }
    ]),
    ...plan.curtains.filter(p => !p.closure || p.closure === "rampart").map(p => ({ outer: p.rampart, holes: [] })),
    ...plan.outworks.flatMap(p => [
      { outer: p.outline, holes: [] },
      { outer: p.rampart, holes: [] },
      { outer: p.platform, holes: [] }
    ]),
    ...plan.ditches.flatMap(p => p.region),
    ...plan.coveredWays.flatMap(p => p.region),
    ...plan.glacis.flat(),
    ...(plan.works ?? []).map(p => ({ outer: p.polygon, holes: [] })),
    ...(plan.sluices ?? []).flatMap(p => defenseAccessSurface(p.opening, 6)),
    ...plan.accesses.flatMap(p => defenseAccessSurface([...p.landBefore, ...p.bridge, ...p.landAfter], p.widthMeters))
  ];
}
export const defenseWater = (doc: VectorCityDocument) =>
  Object.values(doc.environment?.defenses ?? {}).flatMap(p =>
    p.ditches.filter(d => d.kind === "wet").flatMap(d => d.region)
  );

/** Reject malformed saved semantics and dangling ownership before they reach geometry code. */
export function validateVectorDefenses(doc: VectorCityDocument): string[] {
  const errors: string[] = [];
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e7;
  const point = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && p.every(finite);
  const line = (p: unknown, min = 1): p is Point[] =>
    Array.isArray(p) && p.length >= min && p.length <= 512 && p.every(point);
  const ring = (p: unknown): p is Point[] => line(p, 3) && simpleContour(p, true);
  const levels = (p: unknown, count?: number): p is number[] =>
    Array.isArray(p) &&
    p.length > 0 &&
    p.length <= 4096 &&
    (count === undefined || p.length === count) &&
    p.every(finite);
  const keys = (p: object, allowed: string[]) => Object.keys(p).every(k => allowed.includes(k));
  const id = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 160;
  const region = (p: unknown): boolean =>
    Array.isArray(p) &&
    p.length > 0 &&
    p.length <= 128 &&
    p.every(
      r =>
        object(r) &&
        keys(r, ["outer", "holes"]) &&
        ring(r.outer) &&
        Array.isArray(r.holes) &&
        r.holes.length <= 64 &&
        r.holes.every(h => ring(h) && ringInside(h, r.outer as Point[]))
    );
  const defenses = doc.environment?.defenses;
  if (defenses === undefined) return [];
  if (!object(defenses) || Object.keys(defenses).length > 16) return ["defenses"];
  for (const [key, plan] of Object.entries(defenses))
    try {
      let stage = "header";
      const fail = () => {
        throw Error(stage);
      };
      if (doc.environment?.terrain) fail();
      if (
        !object(plan) ||
        !keys(plan, [
          "id",
          "version",
          "boundaryKind",
          "military",
          "editPolicy",
          "circuit",
          "bastions",
          "curtains",
          "outworks",
          "ditches",
          "coveredWays",
          "glacis",
          "accesses",
          "sluices",
          "works"
        ]) ||
        !id(plan.id) ||
        key !== plan.id ||
        plan.version !== 1 ||
        plan.editPolicy !== "fixed" ||
        !["inland-closed", "waterfront"].includes(plan.boundaryKind) ||
        historicalPeriodIndex(doc.context.historicalPeriod) < historicalPeriodIndex("ageOfExploration") ||
        !object(plan.circuit) ||
        !keys(plan.circuit, ["id", "wallPathIds"]) ||
        !id(plan.circuit.id) ||
        !Array.isArray(plan.circuit.wallPathIds) ||
        !plan.circuit.wallPathIds.length ||
        plan.circuit.wallPathIds.some(p => doc.paths[p]?.role !== "wall" || doc.paths[p].editPolicy !== "fixed")
      )
        fail();
      for (const name of ["bastions", "curtains", "outworks", "ditches", "coveredWays", "accesses", "glacis"] as const)
        if (!Array.isArray(plan[name]) || plan[name].length > 128) fail();
      for (const name of ["sluices", "works"] as const)
        if (plan[name] !== undefined && (!Array.isArray(plan[name]) || plan[name]!.length > 128)) fail();
      if (!plan.bastions.length || !plan.accesses.length) fail();
      const ids = [
        plan.id,
        plan.circuit.id,
        ...[
          ...plan.bastions,
          ...plan.curtains,
          ...plan.outworks,
          ...plan.ditches,
          ...plan.coveredWays,
          ...plan.accesses,
          ...(plan.sluices ?? []),
          ...(plan.works ?? [])
        ].map(p => p.id)
      ];
      if (!ids.every(id) || new Set(ids).size !== ids.length) fail();
      stage = "wall-parts";
      for (const p of [...plan.bastions, ...plan.curtains]) {
        if (
          !keys(p, ["id", "ownerId", "wallSpans", "rampart", "platform", "elevations", "closure"]) ||
          p.ownerId !== plan.circuit.id ||
          !ring(p.rampart) ||
          !object(p.elevations) ||
          !keys(p.elevations, ["base", "crest"]) ||
          !levels(p.elevations.base) ||
          !levels(p.elevations.crest, p.elevations.base.length) ||
          p.elevations.crest.some((h, i) => h <= p.elevations.base[i]) ||
          !Array.isArray(p.wallSpans) ||
          !p.wallSpans.length ||
          p.wallSpans.length > 512
        )
          fail();
        for (const span of p.wallSpans) {
          if (
            !keys(span, ["from", "to"]) ||
            span.from.pathId !== span.to.pathId ||
            !plan.circuit.wallPathIds.includes(span.from.pathId)
          )
            fail();
          const stations = p.rampart.slice(0, p.elevations.base.length);
          for (const anchor of [span.from, span.to]) {
            if (!keys(anchor, ["pathId", "segmentId", "t"])) fail();
            const position = evaluateAnchor(doc.paths[anchor.pathId], anchor);
            if (nearestOnPolyline(position, stations).dist > FORTRESS_WALL_BIND_METERS) fail();
          }
        }
      }
      stage = "bastions";
      for (const p of plan.bastions) if (!ring(p.platform) || !levels(p.elevations.base, 5)) fail();
      stage = "curtains";
      for (const p of plan.curtains)
        if (
          !levels(p.elevations.base, 2) ||
          (p.closure !== undefined && !["rampart", "sluice", "shore"].includes(p.closure)) ||
          ((p.closure === "sluice" || p.closure === "shore") &&
            !plan.sluices?.some(s => s.curtainId === p.id && s.kind === p.closure))
        )
          fail();
      stage = "outworks";
      for (const p of plan.outworks)
        if (
          !keys(p, [
            "id",
            "ownerId",
            "curtainId",
            "outline",
            "rampart",
            "platform",
            "ditchId",
            "sally",
            "elevations"
          ]) ||
          p.ownerId !== plan.id ||
          !plan.curtains.some(c => c.id === p.curtainId) ||
          !plan.ditches.some(d => d.id === p.ditchId) ||
          !ring(p.outline) ||
          !ring(p.rampart) ||
          !ring(p.platform) ||
          !point(p.sally) ||
          !object(p.elevations) ||
          !keys(p.elevations, ["base", "crest"]) ||
          !levels(p.elevations.base) ||
          !levels(p.elevations.crest, p.elevations.base.length)
        )
          fail();
      stage = "ditches";
      for (const p of plan.ditches) {
        const count = p.region?.reduce((n, r) => n + r.outer.length, 0);
        if (
          !keys(p, ["id", "ownerId", "kind", "region", "bed", "bank", "waterLevel", "supply"]) ||
          p.ownerId !== plan.id ||
          !["dry", "wet"].includes(p.kind) ||
          !region(p.region) ||
          !levels(p.bed, count) ||
          !levels(p.bank, count) ||
          p.bed.some((h, i) => h >= p.bank[i])
        )
          fail();
        if (
          p.kind === "wet" &&
          (!finite(p.waterLevel) ||
            p.bed.some(h => h >= p.waterLevel!) ||
            p.bank.some(h => h <= p.waterLevel!) ||
            !p.supply ||
            !keys(p.supply, ["kind", "inlet", "outlet"]) ||
            p.supply.kind !== "closed-basin" ||
            p.supply.inlet !== "none" ||
            p.supply.outlet !== "none")
        )
          fail();
      }
      stage = "covered-ways";
      for (const p of plan.coveredWays)
        if (
          !keys(p, ["id", "ownerId", "region", "elevations"]) ||
          p.ownerId !== plan.id ||
          !region(p.region) ||
          !levels(
            p.elevations,
            p.region.reduce((n, r) => n + r.outer.length, 0)
          )
        )
          fail();
      if (!plan.glacis.every(region)) fail();
      for (const p of plan.works ?? [])
        if (
          !keys(p, ["id", "ownerId", "kind", "polygon"]) ||
          p.ownerId !== plan.id ||
          !["barracks", "magazine"].includes(p.kind) ||
          !ring(p.polygon)
        )
          fail();
      for (const p of plan.sluices ?? [])
        if (
          !keys(p, ["id", "ownerId", "curtainId", "kind", "opening", "banks"]) ||
          p.ownerId !== plan.id ||
          !line(p.opening, 2) ||
          !line(p.banks, 2) ||
          p.banks.length !== 2 ||
          !plan.curtains.some(c => c.id === p.curtainId && c.closure === p.kind) ||
          !["sluice", "shore"].includes(p.kind)
        )
          fail();
      stage = "accesses";
      for (const p of plan.accesses) {
        if (
          !keys(p, [
            "id",
            "ownerId",
            "role",
            "portal",
            "roadPathIds",
            "landBefore",
            "bridge",
            "landAfter",
            "widthMeters",
            "elevations"
          ]) ||
          p.ownerId !== plan.id ||
          !["civic", "defender"].includes(p.role) ||
          !object(p.portal) ||
          !keys(p.portal, ["kind", "id"]) ||
          !line(p.landBefore) ||
          !line(p.landAfter) ||
          !line(p.bridge, 2) ||
          p.bridge.length !== 2 ||
          !finite(p.widthMeters) ||
          p.widthMeters <= 0 ||
          !levels(p.elevations, 2) ||
          !Array.isArray(p.roadPathIds) ||
          p.roadPathIds.some(r => doc.paths[r]?.role !== "road" || doc.paths[r].editPolicy !== "fixed")
        )
          fail();
        if (p.role === "civic") {
          const gate = doc.connections.gates[p.portal.id],
            node = gate && doc.connections.nodes[gate.nodeId];
          if (
            p.portal.kind !== "gate" ||
            !gate ||
            !plan.circuit.wallPathIds.includes(gate.wallPathId) ||
            !node ||
            !p.roadPathIds.length ||
            !node.anchors.some(a => p.roadPathIds.includes(a.pathId)) ||
            Math.hypot(node.position[0] - p.bridge[0][0], node.position[1] - p.bridge[0][1]) > 0.75
          )
            fail();
        } else if (
          p.portal.kind !== "curtain" ||
          !plan.curtains.some(c => c.id === p.portal.id && c.closure !== "sluice" && c.closure !== "shore") ||
          !plan.outworks.some(w => w.curtainId === p.portal.id)
        )
          fail();
        const axis: Point = [p.bridge[1][0] - p.bridge[0][0], p.bridge[1][1] - p.bridge[0][1]];
        for (const ditch of plan.ditches) {
          if (
            !regionBoolean(defenseAccessSurface(p.bridge, p.widthMeters), ditch.region, "intersection").some(
              r => regionArea(r) > 1e-5
            )
          )
            continue;
          const mid: Point = [(p.bridge[0][0] + p.bridge[1][0]) / 2, (p.bridge[0][1] + p.bridge[1][1]) / 2];
          for (const polygon of ditch.region) {
            const hit = nearestOnPolyline(mid, [...polygon.outer, polygon.outer[0]]),
              a = polygon.outer[hit.segIndex],
              b = polygon.outer[(hit.segIndex + 1) % polygon.outer.length];
            if (
              !withinBridgeSkewLimit(
                bridgeSkewDegrees(axis, [b[0] - a[0], b[1] - a[1]]),
                resolveBridgeSkewLimit(doc.context.historicalPeriod, doc.site?.descriptor?.transport, "stone")
              )
            )
              fail();
          }
        }
      }
      if (plan.military !== undefined) {
        if (
          !object(plan.military) ||
          plan.military.policy !== "artillery-v1" ||
          plan.military.bombardmentAssessed !== false ||
          !["renaissance", "mature", "rifled-era"].includes(plan.military.profile) ||
          Object.entries(plan.military).some(
            ([k, v]) => !["policy", "profile", "bombardmentAssessed"].includes(k) && (!finite(v) || v <= 0)
          )
        )
          fail();
      }
    } catch (error) {
      errors.push(`defense:${key}:${error instanceof Error ? error.message : "invalid"}`);
    }
  return errors;
}

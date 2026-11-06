import { isHistoricalPeriod } from "../../../../types/historicalPeriod";
import type { Point } from "../../../types/primitives";
import type {
  CurveAnchor,
  VectorCityDocument,
  VectorPath,
  VectorPreset,
  VectorSegment
} from "../../../types/vector/document";
import { isSimplePolygon, pointInPolygon, segmentsIntersect } from "../../geom";
import { evaluateAnchor, pathIsClosed, VECTOR_CONNECTION_EPSILON } from "../geometry/curves";
import { bridgeGeometry, junctionSurface, validateGateGeometry } from "../geometry/network";
import { maximumCornerRadius } from "../geometry/presets";
import { ringInside, verifyWallGapSurface } from "../geometry/routing";
import { pathSurface, surfacesOverlap } from "../geometry/surfaces";
import { vectorWaterSurfaces } from "../geometry/water";
import { validateVectorGeneration } from "./generation";

export const VECTOR_DOCUMENT_LIMITS = {
  paths: 2048,
  segments: 16384,
  entities: 10000,
  ringPoints: 512,
  textLength: 8 * 1024 * 1024
};
type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, required: string[], optional: string[] = []): v is RecordValue =>
  record(v) &&
  required.every(key => Object.hasOwn(v, key)) &&
  Object.keys(v).every(key => required.includes(key) || optional.includes(key));
const id = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,127}$/.test(v) &&
  !["__proto__", "prototype", "constructor"].includes(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e7;
const positive = (v: unknown): v is number => finite(v) && v > 0;
const revision = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const point = (v: unknown): v is Point => Array.isArray(v) && v.length === 2 && v.every(finite);
const same = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= VECTOR_CONNECTION_EPSILON;
const policy = (v: RecordValue) =>
  typeof v.origin === "string" &&
  ["imported", "automatic", "manual"].includes(v.origin) &&
  typeof v.editPolicy === "string" &&
  ["fixed", "editable"].includes(v.editPolicy);
const anchor = (v: unknown): v is CurveAnchor =>
  keys(v, ["pathId", "segmentId", "t"]) && id(v.pathId) && id(v.segmentId) && finite(v.t) && v.t >= 0 && v.t <= 1;
const ring = (v: unknown): v is Point[] =>
  Array.isArray(v) &&
  v.length >= 3 &&
  v.length <= VECTOR_DOCUMENT_LIMITS.ringPoints &&
  v.every(point) &&
  isSimplePolygon(v, 1e-12);
function ringsTouch(a: Point[], b: Point[]): boolean {
  return a.some((p, i) => b.some((q, j) => segmentsIntersect(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])));
}
function region(v: RecordValue): boolean {
  if (!ring(v.outer) || !Array.isArray(v.holes) || v.holes.length > 64 || !v.holes.every(ring)) return false;
  const outer = v.outer,
    holes: Point[][] = v.holes;
  return holes.every(
    (hole, i) =>
      hole.every(p => pointInPolygon(p, outer)) &&
      !ringsTouch(outer, hole) &&
      holes
        .slice(i + 1)
        .every(other => !ringsTouch(hole, other) && !pointInPolygon(hole[0], other) && !pointInPolygon(other[0], hole))
  );
}

function segment(v: unknown, legacy = false): v is VectorSegment {
  if (!record(v) || !id(v.id) || !point(v.from) || !point(v.to)) return false;
  const optional = legacy ? [] : ["startMode"];
  if (
    v.startMode !== undefined &&
    (legacy || typeof v.startMode !== "string" || !["corner", "aligned", "symmetric"].includes(v.startMode))
  )
    return false;
  if (v.kind === "line") return keys(v, ["id", "kind", "from", "to"], optional) && !same(v.from, v.to);
  return (
    v.kind === "cubic" &&
    keys(v, ["id", "kind", "from", "control1", "control2", "to"], optional) &&
    point(v.control1) &&
    point(v.control2) &&
    [v.control1, v.control2, v.to].some(p => !same(v.from as Point, p))
  );
}

export function validateVectorPath(value: unknown): string[] {
  if (!record(value) || !id(value.id) || !validPath(value, false)) return ["invalid-path"];
  try {
    pathSurface(value);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : "invalid-geometry"];
  }
}

function validPath(v: RecordValue, legacy: boolean): v is unknown & VectorPath & RecordValue {
  if (
    !keys(v, ["id", "revision", "role", "origin", "editPolicy", "source", "width"]) ||
    !revision(v.revision) ||
    typeof v.role !== "string" ||
    !["road", "river", "wall"].includes(v.role) ||
    !policy(v) ||
    !record(v.source) ||
    !keys(v.width, ["leftMeters", "rightMeters", "stations"], legacy ? [] : ["interpolation"]) ||
    (v.width.interpolation !== undefined && v.width.interpolation !== "linear") ||
    !positive(v.width.leftMeters) ||
    !positive(v.width.rightMeters) ||
    !Array.isArray(v.width.stations) ||
    v.width.stations.length > VECTOR_DOCUMENT_LIMITS.segments ||
    !v.width.stations.every(
      s =>
        keys(s, ["anchor", "leftMeters", "rightMeters"]) &&
        anchor(s.anchor) &&
        positive(s.leftMeters) &&
        positive(s.rightMeters)
    )
  )
    return false;
  const s = v.source;
  if (s.kind === "preset")
    return (
      keys(
        s,
        ["kind", "preset", "center", "widthMeters", "heightMeters", "bearingDegrees"],
        legacy ? ["sides"] : ["sides", "cornerRadiusMeters"]
      ) &&
      typeof s.preset === "string" &&
      ["ellipse", "rectangle", "polygon"].includes(s.preset) &&
      point(s.center) &&
      positive(s.widthMeters) &&
      positive(s.heightMeters) &&
      finite(s.bearingDegrees) &&
      s.bearingDegrees >= 0 &&
      s.bearingDegrees < 360 &&
      (s.preset === "polygon"
        ? Number.isInteger(s.sides) && (s.sides as number) >= 3 && (s.sides as number) <= 64
        : s.sides === undefined) &&
      (s.cornerRadiusMeters === undefined ||
        (finite(s.cornerRadiusMeters) &&
          s.cornerRadiusMeters >= 0 &&
          s.cornerRadiusMeters <= maximumCornerRadius(s as unknown as VectorPreset)))
    );
  if (
    !keys(s, ["kind", "closed", "segments"], legacy ? [] : ["freehandToleranceMeters"]) ||
    (s.freehandToleranceMeters !== undefined && !positive(s.freehandToleranceMeters)) ||
    s.kind !== "curve" ||
    typeof s.closed !== "boolean" ||
    !Array.isArray(s.segments) ||
    !s.segments.length ||
    s.segments.length > VECTOR_DOCUMENT_LIMITS.segments ||
    !s.segments.every(value => segment(value, legacy))
  )
    return false;
  const segments: VectorSegment[] = s.segments;
  return (
    new Set(segments.map(s => s.id)).size === segments.length &&
    segments.slice(1).every((s, i) => same(segments[i].to, s.from)) &&
    (!s.closed || same(segments[0].from, segments.at(-1)!.to))
  );
}

/** Strict native codec validation. Missing/unknown references are never repaired here. */
export function validateVectorDocument(value: unknown, legacy: boolean | 2 | 3 = false): string[] {
  if (
    !keys(
      value,
      ["format", "version", "revision", "frame", "context", "paths", "connections", "regions", "placements", "recipe"],
      legacy ? [] : ["site", "generation"]
    ) ||
    value.format !== "fmg-vector-city" ||
    value.version !== (legacy === true ? 1 : legacy === 2 ? 2 : legacy === 3 ? 3 : 4) ||
    !revision(value.revision)
  )
    return ["document-format"];
  if (!keys(value.frame, ["extentMeters"]) || !positive(value.frame.extentMeters)) return ["frame"];
  if (
    !keys(
      value.context,
      ["historicalPeriod", "targetPopulation"],
      legacy === true || legacy === 2 ? [] : ["bridgeSkewTier"]
    ) ||
    (value.context.bridgeSkewTier !== undefined && ![0, 1, 2].includes(value.context.bridgeSkewTier as number)) ||
    !isHistoricalPeriod(value.context.historicalPeriod) ||
    !Number.isSafeInteger(value.context.targetPopulation) ||
    (value.context.targetPopulation as number) < 0
  )
    return ["context"];
  if (
    !keys(value.recipe, ["algorithm", "seed"]) ||
    value.recipe.algorithm !== "vector-city-v1" ||
    typeof value.recipe.seed !== "string" ||
    value.recipe.seed.length > 256
  )
    return ["recipe"];
  if (
    !keys(
      value.connections,
      legacy === true || legacy === 2
        ? ["nodes", "edges", "gates", "circuits"]
        : ["nodes", "edges", "gates", "circuits", "bridges", "wallRoads"]
    )
  )
    return ["connections"];
  const tables = [value.paths, ...Object.values(value.connections), value.regions, value.placements];
  if (
    !tables.every(
      table =>
        record(table) &&
        Object.keys(table).length <= VECTOR_DOCUMENT_LIMITS.entities &&
        Object.entries(table).every(([key, entry]) => id(key) && record(entry) && entry.id === key)
    )
  )
    return ["entity-tables"];
  if (Object.keys(value.paths as RecordValue).length > VECTOR_DOCUMENT_LIMITS.paths) return ["path-budget"];
  const doc = value as unknown as VectorCityDocument;
  const errors: string[] = [];
  let segments = 0;
  for (const p of Object.values(doc.paths)) {
    if (!validPath(p as unknown as RecordValue, legacy === true)) errors.push(`path:${p.id}`);
    else
      segments +=
        p.source.kind === "curve" ? p.source.segments.length : p.source.preset === "polygon" ? p.source.sides : 4;
  }
  if (segments > VECTOR_DOCUMENT_LIMITS.segments) errors.push("segment-budget");
  if (errors.length) return errors;
  if (legacy !== true)
    for (const p of Object.values(doc.paths)) {
      try {
        pathSurface(p);
      } catch (error) {
        errors.push(`geometry:${p.id}:${error instanceof Error ? error.message : "invalid"}`);
      }
    }
  if (errors.length) return errors;
  function checkAnchor(a: unknown): a is CurveAnchor {
    if (!anchor(a)) return false;
    const path = Object.hasOwn(doc.paths, a.pathId) ? doc.paths[a.pathId] : undefined;
    if (!path) return false;
    try {
      evaluateAnchor(path, a);
      return true;
    } catch {
      return false;
    }
  }
  function atNode(a: CurveAnchor, nodeId: string): boolean {
    const node = Object.hasOwn(doc.connections.nodes, nodeId) ? doc.connections.nodes[nodeId] : undefined;
    return (
      !!node &&
      node.anchors.some(item => item.pathId === a.pathId && item.segmentId === a.segmentId && item.t === a.t) &&
      same(node.position, evaluateAnchor(doc.paths[a.pathId], a))
    );
  }
  for (const p of Object.values(doc.paths))
    if (p.width.stations.some(s => s.anchor.pathId !== p.id || !checkAnchor(s.anchor)))
      errors.push(`width-anchor:${p.id}`);
  for (const n of Object.values(doc.connections.nodes)) {
    if (
      !keys(n, ["id", "position", "anchors"]) ||
      !point(n.position) ||
      !Array.isArray(n.anchors) ||
      !n.anchors.length ||
      n.anchors.length > VECTOR_DOCUMENT_LIMITS.segments ||
      !n.anchors.every(a => checkAnchor(a) && same(n.position, evaluateAnchor(doc.paths[a.pathId], a)))
    )
      errors.push(`node:${n.id}`);
  }
  if (errors.length) return errors;
  if (legacy !== true && legacy !== 2)
    for (const node of Object.values(doc.connections.nodes)) {
      const roles = new Set(node.anchors.map(a => doc.paths[a.pathId].role));
      if (roles.has("road") && roles.has("river")) errors.push(`mixed-node:${node.id}`);
    }
  for (const edge of Object.values(doc.connections.edges))
    if (
      !keys(edge, ["id", "pathId", "fromNodeId", "toNodeId", "from", "to"]) ||
      !id(edge.pathId) ||
      doc.paths[edge.pathId]?.role !== "road" ||
      !id(edge.fromNodeId) ||
      !id(edge.toNodeId) ||
      !checkAnchor(edge.from) ||
      !checkAnchor(edge.to) ||
      edge.from.pathId !== edge.pathId ||
      edge.to.pathId !== edge.pathId ||
      !atNode(edge.from, edge.fromNodeId) ||
      !atNode(edge.to, edge.toNodeId)
    )
      errors.push(`edge:${edge.id}`);
  for (const gate of Object.values(doc.connections.gates))
    if (
      !keys(
        gate,
        legacy === true || legacy === 2
          ? ["id", "wallPathId", "nodeId", "anchor", "widthMeters"]
          : ["id", "wallPathId", "nodeId", "anchor", "widthMeters", "kind"],
        legacy === true || legacy === 2 ? [] : ["circuitId"]
      ) ||
      !id(gate.wallPathId) ||
      doc.paths[gate.wallPathId]?.role !== "wall" ||
      !id(gate.nodeId) ||
      !positive(gate.widthMeters) ||
      !checkAnchor(gate.anchor) ||
      gate.anchor.pathId !== gate.wallPathId ||
      !atNode(gate.anchor, gate.nodeId)
    )
      errors.push(`gate:${gate.id}`);
  const circuitPaths = new Set<string>();
  for (const circuit of Object.values(doc.connections.circuits)) {
    if (circuitPaths.has(circuit.pathId)) errors.push(`circuit-duplicate:${circuit.id}`);
    circuitPaths.add(circuit.pathId);
    if (
      !keys(circuit, ["id", "pathId"], ["parentCircuitId"]) ||
      !id(circuit.pathId) ||
      doc.paths[circuit.pathId]?.role !== "wall" ||
      !pathIsClosed(doc.paths[circuit.pathId])
    ) {
      errors.push(`circuit:${circuit.id}`);
      continue;
    }
    const seen = new Set([circuit.id]);
    let parent: unknown = circuit.parentCircuitId;
    while (parent !== undefined) {
      if (!id(parent) || seen.has(parent) || !Object.hasOwn(doc.connections.circuits, parent)) {
        errors.push(`circuit-parent:${circuit.id}`);
        break;
      }
      seen.add(parent);
      parent = doc.connections.circuits[parent].parentCircuitId;
    }
  }
  for (const r of Object.values(doc.regions))
    if (
      !keys(r, ["id", "kind", "outer", "holes"]) ||
      !["district", "reservation", "forest", "farm", "park", "cemetery"].includes(r.kind) ||
      !region(r as unknown as RecordValue)
    )
      errors.push(`region:${r.id}`);
  for (const p of Object.values(doc.placements))
    if (
      !keys(p, ["id", "modelId", "position", "facingDegrees", "origin", "editPolicy", "site", "accesses"]) ||
      !id(p.modelId) ||
      !point(p.position) ||
      !finite(p.facingDegrees) ||
      p.facingDegrees < 0 ||
      p.facingDegrees >= 360 ||
      !policy(p as unknown as RecordValue) ||
      !keys(p.site, ["outer", "holes"]) ||
      !region(p.site) ||
      !Array.isArray(p.accesses) ||
      !p.accesses.every(checkAnchor)
    )
      errors.push(`placement:${p.id}`);
  if (legacy !== true && legacy !== 2 && !errors.length) {
    for (const node of Object.values(doc.connections.nodes)) {
      const junction = junctionSurface(doc, node.id);
      if (
        junction &&
        (Object.values(doc.placements).some(p => surfacesOverlap(junction, p.site)) ||
          Object.values(doc.regions).some(r => r.kind === "reservation" && surfacesOverlap(junction, r)))
      )
        errors.push(`junction-site:${node.id}`);
    }
    const waters = vectorWaterSurfaces(doc);
    for (const gate of Object.values(doc.connections.gates)) {
      try {
        if (!["passage", "water"].includes(gate.kind)) throw new Error("gate-kind");
        if (
          gate.circuitId !== undefined &&
          (!id(gate.circuitId) || doc.connections.circuits[gate.circuitId]?.pathId !== gate.wallPathId)
        )
          throw new Error("gate-circuit");
        const node = doc.connections.nodes[gate.nodeId],
          accesses = node.anchors.filter(
            a => doc.paths[a.pathId].role === (gate.kind === "passage" ? "road" : "river")
          );
        if (pathIsClosed(doc.paths[gate.wallPathId]) && !gate.circuitId) throw new Error("gate-circuit");
        if (!accesses.length) throw new Error("gate-access");
        validateGateGeometry(doc, gate);
      } catch {
        errors.push(`gate-access:${gate.id}`);
      }
    }
    for (const circuit of Object.values(doc.connections.circuits))
      if (circuit.parentCircuitId) {
        const parent = doc.connections.circuits[circuit.parentCircuitId];
        const outer = pathSurface(doc.paths[parent.pathId]),
          inner = pathSurface(doc.paths[circuit.pathId]);
        if (parent.pathId === circuit.pathId || !outer.holes.length || !ringInside(inner.outer, outer.holes[0]))
          errors.push(`circuit-containment:${circuit.id}`);
      }
    for (const route of Object.values(doc.connections.wallRoads)) {
      if (
        !keys(route, ["id", "pathId", "outerCircuitId", "innerCircuitId", "clearanceMeters"]) ||
        !id(route.pathId) ||
        !id(route.outerCircuitId) ||
        !id(route.innerCircuitId) ||
        doc.paths[route.pathId]?.role !== "road" ||
        !finite(route.clearanceMeters) ||
        route.clearanceMeters < 0
      ) {
        errors.push(`wall-road:${route.id}`);
        continue;
      }
      try {
        verifyWallGapSurface(
          doc,
          route.outerCircuitId,
          route.innerCircuitId,
          pathSurface(doc.paths[route.pathId]),
          route.clearanceMeters
        );
      } catch {
        errors.push(`road-clearance:${route.id}`);
      }
    }
    for (const bridge of Object.values(doc.connections.bridges)) {
      if (
        !keys(bridge, [
          "id",
          "roadPathId",
          "riverAnchor",
          "from",
          "to",
          "structure",
          "dryLandingMeters",
          "editPolicy"
        ]) ||
        !id(bridge.roadPathId) ||
        !["stone", "timber"].includes(bridge.structure) ||
        !["fixed", "editable"].includes(bridge.editPolicy) ||
        !positive(bridge.dryLandingMeters) ||
        !checkAnchor(bridge.riverAnchor) ||
        !checkAnchor(bridge.from) ||
        !checkAnchor(bridge.to) ||
        bridge.from.pathId !== bridge.roadPathId ||
        bridge.to.pathId !== bridge.roadPathId
      ) {
        errors.push(`bridge:${bridge.id}:bridge-reference`);
        continue;
      }
      try {
        bridgeGeometry(doc, bridge, waters);
      } catch (error) {
        errors.push(`bridge:${bridge.id}:${error instanceof Error ? error.message : "bridge-reference"}`);
      }
    }
  }
  if (!legacy && !errors.length) errors.push(...validateVectorGeneration(doc));
  return errors;
}

export function assertVectorDocument(value: unknown): asserts value is VectorCityDocument {
  const errors = validateVectorDocument(value);
  if (errors.length) throw new Error(`Invalid vector document: ${errors.join(", ")}`);
}

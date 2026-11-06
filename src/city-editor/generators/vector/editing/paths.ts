import type { Point } from "../../../types/primitives";
import type {
  VectorCityDocument,
  VectorHandleMode,
  VectorPath,
  VectorPathSource,
  VectorSegment
} from "../../../types/vector/document";
import { evaluateAnchor, pathIsClosed, VECTOR_CONNECTION_EPSILON } from "../geometry/curves";
import { simplifyFreehand } from "../geometry/sampling";
import { pathSurface, surfacesOverlap } from "../geometry/surfaces";
import { assertVectorDocument, validateVectorDocument, validateVectorPath } from "../validation/document";
import { mapDocumentAnchors, pathAnchors } from "./anchors";

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const copy = (p: Point): Point => [p[0] || 0, p[1] || 0];

export function freshPathId(document: VectorCityDocument): string {
  let n = document.revision + 1;
  while (Object.hasOwn(document.paths, `path:${n}`)) n++;
  return `path:${n}`;
}

export function curveSource(
  points: Point[],
  mode: "polyline" | "freehand" | "bezier",
  closed: boolean,
  tolerance = 0.005,
  handles?: (Point | undefined)[]
): VectorPathSource {
  let vertices = points.map(copy);
  if (closed && vertices.length > 1 && distance(vertices[0], vertices.at(-1)!) < 1e-6) vertices.pop();
  if (mode === "freehand") {
    if (closed) vertices.push(copy(vertices[0]));
    vertices = simplifyFreehand(vertices, tolerance);
    if (closed) vertices.pop();
  }
  if (vertices.length < (closed ? 3 : 2)) throw new Error("short-path");
  if (vertices.some((p, i) => i > 0 && distance(p, vertices[i - 1]) < 1e-6)) throw new Error("short-path");
  const segments: VectorSegment[] = Array.from({ length: vertices.length - (closed ? 0 : 1) }, (_, i) => {
    const from = vertices[i],
      to = vertices[(i + 1) % vertices.length];
    if (mode !== "bezier") return { id: `segment:${i}`, kind: "line", from, to };
    const control1 = handles?.[i] ?? [from[0] + (to[0] - from[0]) / 3, from[1] + (to[1] - from[1]) / 3];
    const outgoing = handles?.[(i + 1) % vertices.length];
    const control2: Point = outgoing
      ? [2 * to[0] - outgoing[0], 2 * to[1] - outgoing[1]]
      : [to[0] - (to[0] - from[0]) / 3, to[1] - (to[1] - from[1]) / 3];
    return {
      id: `segment:${i}`,
      kind: "cubic",
      from,
      to,
      control1: copy(control1 as Point),
      control2,
      startMode: handles?.[i] ? "symmetric" : "corner"
    };
  });
  return { kind: "curve", closed, segments, ...(mode === "freehand" ? { freehandToleranceMeters: tolerance } : {}) };
}

export function moveCurveVertex(path: VectorPath, index: number, end: "from" | "to", point: Point): void {
  if (path.source.kind !== "curve") throw new Error("convert-preset-first");
  const segments = path.source.segments;
  const move = (segment: VectorSegment, side: "from" | "to") => {
    const delta: Point = [point[0] - segment[side][0], point[1] - segment[side][1]];
    segment[side] = copy(point);
    if (segment.kind === "cubic") {
      const key = side === "from" ? "control1" : "control2";
      segment[key] = [segment[key][0] + delta[0], segment[key][1] + delta[1]];
    }
  };
  move(segments[index], end);
  const adjacent = end === "from" ? index - 1 : index + 1;
  if (path.source.closed || (adjacent >= 0 && adjacent < segments.length))
    move(segments[(adjacent + segments.length) % segments.length], end === "from" ? "to" : "from");
}

export function moveCurveHandle(
  path: VectorPath,
  index: number,
  key: "control1" | "control2",
  point: Point,
  mode?: VectorHandleMode
): void {
  if (path.source.kind !== "curve") throw new Error("convert-preset-first");
  const segments = path.source.segments,
    segment = segments[index];
  if (segment.kind !== "cubic") throw new Error("missing-handle");
  const start = key === "control1",
    anchor = start ? segment.from : segment.to;
  const adjacentIndex = start ? index - 1 : index + 1;
  const adjacent =
    path.source.closed || (adjacentIndex >= 0 && adjacentIndex < segments.length)
      ? segments[(adjacentIndex + segments.length) % segments.length]
      : undefined;
  const joint = start ? segment : adjacent;
  const effective = mode ?? joint?.startMode ?? "corner";
  if (joint) joint.startMode = effective;
  segment[key] = copy(point);
  if (effective === "corner" || adjacent?.kind !== "cubic") return;
  const opposite = start ? "control2" : "control1",
    dx = point[0] - anchor[0],
    dy = point[1] - anchor[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) throw new Error("degenerate-tangent");
  const scale = effective === "symmetric" ? 1 : distance(adjacent[opposite], anchor) / length;
  adjacent[opposite] = [anchor[0] - dx * scale, anchor[1] - dy * scale];
}

function protectedLand(document: VectorCityDocument, changed: Set<string>): void {
  for (const id of changed) {
    const surface = pathSurface(document.paths[id]);
    for (const placement of Object.values(document.placements))
      if ((placement.building?.reserved ?? [placement.site]).some(p => surfacesOverlap(surface, p)))
        throw new Error("protected-land");
    for (const region of Object.values(document.regions))
      if (region.kind === "reservation" && surfacesOverlap(surface, region)) throw new Error("protected-land");
  }
}

/** Candidate changes own one path; shared endpoint adjustments are part of the same transaction. */
export function replaceVectorPath(document: VectorCityDocument, candidate: VectorPath): VectorCityDocument {
  assertVectorDocument(document);
  const old = Object.hasOwn(document.paths, candidate.id) ? document.paths[candidate.id] : undefined;
  if (old?.editPolicy === "fixed") throw new Error("fixed-path");
  if (
    Object.values(document.connections.bridges).some(
      b => b.editPolicy === "fixed" && (b.roadPathId === candidate.id || b.riverAnchor.pathId === candidate.id)
    )
  )
    throw new Error("fixed-bridge");
  const issues = validateVectorPath(candidate);
  if (issues.length) throw new Error(issues[0]);
  const next = structuredClone(document),
    selected = structuredClone(candidate),
    changed = new Set([candidate.id]);
  selected.revision = (old?.revision ?? -1) + 1;
  next.paths[selected.id] = selected;
  for (const node of Object.values(next.connections.nodes)) {
    const anchors = node.anchors.filter(a => a.pathId === selected.id);
    if (!anchors.length) continue;
    let target: Point;
    try {
      target = evaluateAnchor(selected, anchors[0]);
      if (anchors.some(a => distance(evaluateAnchor(selected, a), target) > VECTOR_CONNECTION_EPSILON))
        throw new Error();
    } catch {
      throw new Error("referenced-segment");
    }
    for (const anchor of node.anchors.filter(a => a.pathId !== selected.id)) {
      const path = next.paths[anchor.pathId];
      if (distance(evaluateAnchor(path, anchor), target) <= VECTOR_CONNECTION_EPSILON) continue;
      if (path.editPolicy === "fixed") throw new Error("fixed-connection");
      if (path.source.kind !== "curve" || (anchor.t !== 0 && anchor.t !== 1)) throw new Error("interior-connection");
      const i = path.source.segments.findIndex(s => s.id === anchor.segmentId);
      moveCurveVertex(path, i, anchor.t === 0 ? "from" : "to", target);
      if (!changed.has(path.id)) path.revision++;
      changed.add(path.id);
    }
    node.position = copy(target);
  }
  if (
    Object.values(document.connections.bridges).some(
      b => b.editPolicy === "fixed" && (changed.has(b.roadPathId) || changed.has(b.riverAnchor.pathId))
    )
  )
    throw new Error("fixed-bridge");
  next.revision++;
  const errors = validateVectorDocument(next);
  if (errors.some(e => e.startsWith("road-clearance:"))) throw new Error("road-clearance");
  if (errors.some(e => e.startsWith("gate-access:"))) throw new Error("gate-access");
  if (errors.some(e => e.startsWith("circuit-containment:"))) throw new Error("circuit-containment");
  if (errors.some(e => e.startsWith("bridge:")))
    throw new Error(
      errors
        .find(e => e.startsWith("bridge:"))!
        .split(":")
        .at(-1)
    );
  if (errors.length)
    throw new Error(
      errors.some(e => e.startsWith("node:"))
        ? "connection-conflict"
        : errors[0].startsWith("geometry:")
          ? errors[0].split(":").at(-1)
          : "referenced-segment"
    );
  protectedLand(next, changed);
  return next;
}

export function setVectorPathPolicy(
  document: VectorCityDocument,
  id: string,
  policy: VectorPath["editPolicy"]
): VectorCityDocument {
  const next = structuredClone(document);
  next.paths[id].editPolicy = policy;
  next.paths[id].revision++;
  next.revision++;
  assertVectorDocument(next);
  return next;
}

export function removeVectorPath(document: VectorCityDocument, id: string): VectorCityDocument {
  if (document.paths[id]?.editPolicy === "fixed") throw new Error("fixed-path");
  if (Object.values(document.placements).some(p => p.accesses.some(a => a.pathId === id)))
    throw new Error("referenced-segment");
  if (
    Object.values(document.connections.bridges).some(
      b => b.editPolicy === "fixed" && (b.roadPathId === id || b.riverAnchor.pathId === id)
    )
  )
    throw new Error("fixed-bridge");
  const next = structuredClone(document);
  for (const bridge of Object.values(next.connections.bridges))
    if (bridge.roadPathId === id || bridge.riverAnchor.pathId === id) delete next.connections.bridges[bridge.id];
  for (const route of Object.values(next.connections.wallRoads)) {
    if (route.pathId === id) delete next.connections.wallRoads[route.id];
    else if (
      next.connections.circuits[route.outerCircuitId]?.pathId === id ||
      next.connections.circuits[route.innerCircuitId]?.pathId === id
    )
      throw new Error("referenced-segment");
  }
  const removedCircuits = Object.values(next.connections.circuits)
    .filter(c => c.pathId === id)
    .map(c => c.id);
  if (
    Object.values(next.connections.circuits).some(c => c.parentCircuitId && removedCircuits.includes(c.parentCircuitId))
  )
    throw new Error("referenced-segment");
  for (const key of removedCircuits) delete next.connections.circuits[key];
  for (const [key, gate] of Object.entries(next.connections.gates))
    if (gate.wallPathId === id) delete next.connections.gates[key];
  for (const [key, edge] of Object.entries(next.connections.edges))
    if (edge.pathId === id) delete next.connections.edges[key];
  for (const [key, node] of Object.entries(next.connections.nodes)) {
    node.anchors = node.anchors.filter(a => a.pathId !== id);
    if (!node.anchors.length) delete next.connections.nodes[key];
  }
  delete next.paths[id];
  next.revision++;
  assertVectorDocument(next);
  return next;
}

export function reverseVectorPath(document: VectorCityDocument, id: string): VectorCityDocument {
  const next = structuredClone(document),
    path = next.paths[id];
  if (path.editPolicy === "fixed") throw new Error("fixed-path");
  if (path.source.kind !== "curve") throw new Error("convert-preset-first");
  const original = path.source.segments;
  path.source.segments = original
    .map((segment, i): VectorSegment => {
      const mode = original[(i + 1) % original.length].startMode;
      return segment.kind === "line"
        ? {
            id: segment.id,
            kind: "line",
            from: copy(segment.to),
            to: copy(segment.from),
            ...(mode ? { startMode: mode } : {})
          }
        : {
            id: segment.id,
            kind: "cubic",
            from: copy(segment.to),
            to: copy(segment.from),
            control1: copy(segment.control2),
            control2: copy(segment.control1),
            ...(mode ? { startMode: mode } : {})
          };
    })
    .reverse();
  [path.width.leftMeters, path.width.rightMeters] = [path.width.rightMeters, path.width.leftMeters];
  for (const station of path.width.stations)
    [station.leftMeters, station.rightMeters] = [station.rightMeters, station.leftMeters];
  mapDocumentAnchors(next, a => (a.pathId === id ? { ...a, t: 1 - a.t } : a));
  path.revision++;
  next.revision++;
  assertVectorDocument(next);
  return next;
}

export function removeCurveVertex(document: VectorCityDocument, id: string, index: number): VectorCityDocument {
  const path = structuredClone(document.paths[id]);
  if (path.source.kind !== "curve") throw new Error("convert-preset-first");
  const segments = path.source.segments;
  if (index <= 0 || index >= segments.length || segments.length < (pathIsClosed(path) ? 4 : 2))
    throw new Error("referenced-segment");
  const a = segments[index - 1],
    b = segments[index];
  for (const anchor of pathAnchors(document, id))
    if ((anchor.segmentId === a.id && anchor.t !== 0) || (anchor.segmentId === b.id && anchor.t !== 1))
      throw new Error("referenced-segment");
  const merged: VectorSegment =
    a.kind === "cubic" || b.kind === "cubic"
      ? {
          id: a.id,
          kind: "cubic",
          from: copy(a.from),
          to: copy(b.to),
          control1: copy(
            a.kind === "cubic"
              ? a.control1
              : [a.from[0] + (b.to[0] - a.from[0]) / 3, a.from[1] + (b.to[1] - a.from[1]) / 3]
          ),
          control2: copy(
            b.kind === "cubic" ? b.control2 : [b.to[0] - (b.to[0] - a.from[0]) / 3, b.to[1] - (b.to[1] - a.from[1]) / 3]
          )
        }
      : { id: a.id, kind: "line", from: copy(a.from), to: copy(b.to) };
  segments.splice(index - 1, 2, merged);
  const base = structuredClone(document);
  mapDocumentAnchors(base, anchor =>
    anchor.pathId === id && anchor.segmentId === b.id ? { ...anchor, segmentId: a.id, t: 1 } : anchor
  );
  // Remapped references are checked against the replacement as a single candidate.
  base.paths[id] = path;
  assertVectorDocument(base);
  return replaceVectorPath(base, path);
}

export function setCurveClosed(document: VectorCityDocument, id: string, closed: boolean): VectorCityDocument {
  const path = structuredClone(document.paths[id]);
  if (path.source.kind !== "curve") throw new Error("convert-preset-first");
  if (path.source.closed === closed) return structuredClone(document);
  const segments = path.source.segments;
  if (closed) {
    if (distance(segments[0].from, segments.at(-1)!.to) > VECTOR_CONNECTION_EPSILON) {
      let n = 0;
      while (segments.some(s => s.id === `closing:${n}`)) n++;
      segments.push({ id: `closing:${n}`, kind: "line", from: copy(segments.at(-1)!.to), to: copy(segments[0].from) });
    }
  } else {
    const last = segments.at(-1)!;
    if (segments.length <= 1 || pathAnchors(document, id).some(a => a.segmentId === last.id))
      throw new Error("referenced-segment");
    segments.pop();
  }
  path.source.closed = closed;
  return replaceVectorPath(document, path);
}

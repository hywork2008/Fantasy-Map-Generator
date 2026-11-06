import { resolveBridgeCrossingLimit } from "../../../../utils/bridgeCrossingPolicy";
import {
  bridgeSkewDegrees,
  bridgeSkewLimitForTier,
  bridgeSkewTierForPeriod,
  resolveBridgeSkewLimit,
  withinBridgeSkewLimit
} from "../../../../utils/bridgeSkewPolicy";
import type { Point } from "../../../types/primitives";
import type {
  CurveAnchor,
  VectorBridge,
  VectorCityDocument,
  VectorGate,
  VectorPath
} from "../../../types/vector/document";
import { pointInPolygon, segmentsIntersect } from "../../geom";
import { corridor } from "../../parcelGeometry";
import { evaluateAnchor, pathSegmentIds, splitSegment } from "./curves";
import { pointSegmentDistance, sampledWidth, samplePath } from "./sampling";
import { type PathSurface, pathSurface, surfacesOverlap } from "./surfaces";

export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
export const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
export const unit = (a: Point): Point => {
  const n = Math.hypot(...a);
  if (n < 1e-9) throw new Error("degenerate-tangent");
  return [a[0] / n, a[1] / n];
};
export function anchorOrder(path: VectorPath, anchor: CurveAnchor): number {
  const index = pathSegmentIds(path).indexOf(anchor.segmentId);
  if (index < 0 || anchor.pathId !== path.id) throw new Error("referenced-segment");
  return index + anchor.t;
}
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  return segmentsIntersect(a, b, c, d)
    ? 0
    : Math.min(
        pointSegmentDistance(a, c, d),
        pointSegmentDistance(b, c, d),
        pointSegmentDistance(c, a, b),
        pointSegmentDistance(d, a, b)
      );
}
export function insideSurface(p: Point, s: PathSurface): boolean {
  return pointInPolygon(p, s.outer) && !s.holes.some(h => pointInPolygon(p, h));
}
export function boundaryDistance(p: Point, s: PathSurface): number {
  return Math.min(
    ...[s.outer, ...s.holes].map(r => Math.min(...r.map((a, i) => pointSegmentDistance(p, a, r[(i + 1) % r.length]))))
  );
}
export function widthAt(path: VectorPath, anchor: CurveAnchor): { left: number; right: number } {
  evaluateAnchor(path, anchor);
  if (!path.width.stations.length) return { left: path.width.leftMeters, right: path.width.rightMeters };
  const copy = structuredClone(path);
  if (!copy.width.stations.some(s => s.anchor.segmentId === anchor.segmentId && s.anchor.t === anchor.t))
    copy.width.stations.push({ anchor, leftMeters: path.width.leftMeters, rightMeters: path.width.rightMeters });
  // Sample at the requested parameter without changing the authored width profile.
  const samples = samplePath(copy),
    widths = sampledWidth(path, samples),
    i = samples.findIndex(s => s.anchor.segmentId === anchor.segmentId && s.anchor.t === anchor.t);
  if (i < 0) throw new Error("referenced-segment");
  return widths[i];
}
export function gateOpening(document: VectorCityDocument, gate: VectorGate): Point[] {
  const wall = document.paths[gate.wallPathId],
    center = evaluateAnchor(wall, gate.anchor),
    tangent = unit(evaluateAnchor(wall, gate.anchor, true));
  const width = widthAt(wall, gate.anchor),
    depth = Math.max(width.left, width.right) + gate.widthMeters;
  return corridor(
    [center[0] - (tangent[0] * gate.widthMeters) / 2, center[1] - (tangent[1] * gate.widthMeters) / 2],
    [center[0] + (tangent[0] * gate.widthMeters) / 2, center[1] + (tangent[1] * gate.widthMeters) / 2],
    2 * depth
  );
}

/** A deck is one straight axis, including dry, full-width landing cross-sections. */
export function bridgeGeometry(
  document: VectorCityDocument,
  bridge: VectorBridge,
  waterSurfaces: Map<string, PathSurface>
): { from: Point; to: Point; deck: Point[]; skewDegrees: number } {
  const road = document.paths[bridge.roadPathId],
    river = document.paths[bridge.riverAnchor.pathId];
  if (road?.role !== "road" || river?.role !== "river" || road.source.kind !== "curve")
    throw new Error("bridge-reference");
  const from = evaluateAnchor(road, bridge.from),
    to = evaluateAnchor(road, bridge.to),
    axis = unit(sub(to, from)),
    length = distance(from, to);
  if (
    length >
    resolveBridgeCrossingLimit(document.context.historicalPeriod, document.site?.descriptor?.transport) + 1e-6
  )
    throw new Error("bridge-length");
  const low = Math.min(anchorOrder(road, bridge.from), anchorOrder(road, bridge.to)),
    high = Math.max(anchorOrder(road, bridge.from), anchorOrder(road, bridge.to));
  if (high <= low) throw new Error("bridge-bent");
  for (let i = 0; i < road.source.segments.length; i++) {
    if (i + 1 <= low || i >= high) continue;
    let segment = road.source.segments[i];
    const lo = Math.max(0, low - i),
      hi = Math.min(1, high - i);
    if (hi < 1) segment = splitSegment(segment, hi, "a", "b")[0];
    if (lo > 0) segment = splitSegment(segment, lo / hi, "a", "b")[1];
    const points =
      segment.kind === "cubic"
        ? [segment.from, segment.control1, segment.control2, segment.to]
        : [segment.from, segment.to];
    const direction = unit(sub(segment.to, segment.from));
    let previous = -Infinity;
    for (const p of points) {
      const projection = dot(sub(p, segment.from), direction);
      if (pointSegmentDistance(p, from, to) > 1e-6 || projection < previous - 1e-6) throw new Error("bridge-bent");
      previous = projection;
    }
  }
  const center = evaluateAnchor(river, bridge.riverAnchor),
    along = dot(sub(center, from), axis);
  if (pointSegmentDistance(center, from, to) > 1e-6 || along <= 0 || along >= length)
    throw new Error("bridge-reference");
  const sample = samplePath(road),
    widths = sampledWidth(road, sample),
    range = sample
      .map((s, i) => ({ s, w: widths[i] }))
      .filter(v => anchorOrder(road, v.s.anchor) >= low && anchorOrder(road, v.s.anchor) <= high);
  const endWidths = [widthAt(road, bridge.from), widthAt(road, bridge.to), ...range.map(v => v.w)],
    half = Math.max(...endWidths.flatMap(w => [w.left, w.right]));
  const deck = corridor(from, to, half * 2),
    surface = { outer: deck, holes: [] },
    water = waterSurfaces.get(river.id)!;
  if (!water || !insideSurface(center, water)) throw new Error("bridge-reference");
  const normal: Point = [-axis[1], axis[0]];
  for (const endpoint of [from, to])
    for (const side of [-1, 1]) {
      const p: Point = [endpoint[0] + normal[0] * half * side, endpoint[1] + normal[1] * half * side];
      if (insideSurface(p, water) || boundaryDistance(p, water) < bridge.dryLandingMeters - 1e-6)
        throw new Error("bridge-landing");
    }
  // Every river bank must be crossed exactly once; islands or multiple arms need separate bridges.
  const hits: number[] = [];
  for (const ring of [water.outer, ...water.holes])
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      if (!segmentsIntersect(from, to, a, b)) continue;
      const v = sub(b, a),
        den = axis[0] * v[1] - axis[1] * v[0];
      if (Math.abs(den) < 1e-10) throw new Error("bridge-multiple-channels");
      const offset = sub(a, from),
        at = (offset[0] * v[1] - offset[1] * v[0]) / den;
      if (!hits.some(h => Math.abs(h - at) < 1e-6)) hits.push(at);
    }
  if (hits.length !== 2) throw new Error("bridge-multiple-channels");
  for (const endpoint of [from, to]) {
    const a: Point = [endpoint[0] - normal[0] * half, endpoint[1] - normal[1] * half],
      b: Point = [endpoint[0] + normal[0] * half, endpoint[1] + normal[1] * half];
    if (insideSurface(endpoint, water)) throw new Error("bridge-landing");
    for (const ring of [water.outer, ...water.holes])
      for (let i = 0; i < ring.length; i++)
        if (segmentDistance(a, b, ring[i], ring[(i + 1) % ring.length]) < bridge.dryLandingMeters - 1e-6)
          throw new Error("bridge-landing");
  }
  let skewDegrees = bridgeSkewDegrees(axis, evaluateAnchor(river, bridge.riverAnchor, true));
  let limit = bridgeSkewLimitForTier(
    Math.max(bridgeSkewTierForPeriod(document.context.historicalPeriod), document.context.bridgeSkewTier ?? 0) as
      | 0
      | 1
      | 2,
    bridge.structure
  );
  if (document.site?.descriptor?.transport?.maxBridgeSkewDegrees !== undefined)
    limit = Math.min(
      limit,
      resolveBridgeSkewLimit(document.context.historicalPeriod, document.site.descriptor.transport, bridge.structure)
    );
  const rs = samplePath(river),
    rw = sampledWidth(river, rs);
  for (let i = 1; i < rs.length; i++) {
    if (segmentDistance(from, to, rs[i - 1].point, rs[i].point) > Math.max(rw[i].left, rw[i].right) + half) continue;
    for (const s of [rs[i - 1], rs[i]]) {
      const pathSegment =
        river.source.kind === "curve"
          ? river.source.segments.find(segment => segment.id === s.anchor.segmentId)
          : undefined;
      const allowance = pathSegment?.kind === "line" ? 0 : 0.1;
      const skew = bridgeSkewDegrees(axis, evaluateAnchor(river, s.anchor, true));
      skewDegrees = Math.max(skewDegrees, skew + allowance);
    }
  }
  if (!withinBridgeSkewLimit(skewDegrees, limit)) throw new Error("bridge-skew");
  for (const [id, other] of waterSurfaces)
    if (id !== river.id && JSON.stringify(other) !== JSON.stringify(water) && surfacesOverlap(surface, other))
      throw new Error("bridge-multiple-channels");
  for (const wall of Object.values(document.paths).filter(p => p.role === "wall"))
    if (surfacesOverlap(surface, pathSurface(wall))) throw new Error("bridge-wall");
  for (const placement of Object.values(document.placements))
    if ((placement.building?.reserved ?? [placement.site]).some(p => surfacesOverlap(surface, p)))
      throw new Error("protected-land");
  for (const region of Object.values(document.regions))
    if (region.kind === "reservation" && surfacesOverlap(surface, region)) throw new Error("protected-land");
  return { from, to, deck, skewDegrees };
}

export function validateGateGeometry(document: VectorCityDocument, gate: VectorGate): void {
  const wall = document.paths[gate.wallPathId],
    tangent = unit(evaluateAnchor(wall, gate.anchor, true)),
    node = document.connections.nodes[gate.nodeId];
  const accesses = node.anchors.filter(
    a => document.paths[a.pathId].role === (gate.kind === "passage" ? "road" : "river")
  );
  const total = samplePath(wall).at(-1)!.distance;
  if (gate.widthMeters > total / 4) throw new Error("gate-width");
  for (const access of accesses) {
    const path = document.paths[access.pathId],
      axis = unit(evaluateAnchor(path, access, true)),
      cross = Math.abs(tangent[0] * axis[1] - tangent[1] * axis[0]),
      width = widthAt(path, access);
    if (cross < 0.1 || (width.left + width.right) / cross > gate.widthMeters + 1e-6) throw new Error("gate-width");
  }
  const opening = { outer: gateOpening(document, gate), holes: [] };
  const marked = structuredClone(wall);
  if (!marked.width.stations.some(s => s.anchor.segmentId === gate.anchor.segmentId && s.anchor.t === gate.anchor.t))
    marked.width.stations.push({
      anchor: gate.anchor,
      leftMeters: wall.width.leftMeters,
      rightMeters: wall.width.rightMeters
    });
  const samples = samplePath(marked),
    at = samples.find(s => s.anchor.segmentId === gate.anchor.segmentId && s.anchor.t === gate.anchor.t)!.distance;
  const thickness = Math.max(
    wall.width.leftMeters,
    wall.width.rightMeters,
    ...wall.width.stations.flatMap(s => [s.leftMeters, s.rightMeters])
  );
  for (let i = 1; i < samples.length; i++) {
    const arc = Math.min(
      ...[samples[i - 1].distance, samples[i].distance].map(d => {
        const separation = Math.abs(d - at);
        return Math.min(separation, total - separation);
      })
    );
    if (arc <= gate.widthMeters * 1.5 + thickness) continue;
    const a = samples[i - 1].point,
      b = samples[i].point;
    if (
      insideSurface(a, opening) ||
      opening.outer.some(
        (p, j) => segmentDistance(a, b, p, opening.outer[(j + 1) % opening.outer.length]) < thickness - 0.000001
      )
    )
      throw new Error("gate-width");
  }
  for (const other of Object.values(document.connections.gates))
    if (
      other.id !== gate.id &&
      other.wallPathId === gate.wallPathId &&
      surfacesOverlap(opening, { outer: gateOpening(document, other), holes: [] })
    )
      throw new Error("gate-overlap");
  for (const placement of Object.values(document.placements))
    if ((placement.building?.reserved ?? [placement.site]).some(p => surfacesOverlap(opening, p)))
      throw new Error("protected-land");
}

export function junctionSurface(document: VectorCityDocument, nodeId: string): PathSurface | undefined {
  const node = document.connections.nodes[nodeId],
    anchors = node.anchors.filter(a => document.paths[a.pathId].role === "road");
  if (new Set(anchors.map(a => a.pathId)).size < 2) return;
  const radius = Math.min(
    ...anchors.flatMap(a => {
      const width = widthAt(document.paths[a.pathId], a);
      return [width.left, width.right];
    })
  );
  return {
    outer: Array.from(
      { length: 32 },
      (_, i): Point => [
        node.position[0] + radius * Math.cos((i * Math.PI) / 16),
        node.position[1] + radius * Math.sin((i * Math.PI) / 16)
      ]
    ),
    holes: []
  };
}

export function dryLandingExtent(
  water: PathSurface,
  center: Point,
  direction: Point,
  halfWidth: number,
  landing: number,
  initial: number
): number {
  const normal: Point = [-direction[1], direction[0]];
  const dry = (extent: number) => {
    const p: Point = [center[0] + direction[0] * extent, center[1] + direction[1] * extent];
    if (insideSurface(p, water)) return false;
    const a: Point = [p[0] - normal[0] * halfWidth, p[1] - normal[1] * halfWidth],
      b: Point = [p[0] + normal[0] * halfWidth, p[1] + normal[1] * halfWidth];
    return [water.outer, ...water.holes].every(r =>
      r.every((q, i) => segmentDistance(a, b, q, r[(i + 1) % r.length]) >= landing)
    );
  };
  let hi = initial;
  for (let i = 0; i < 16 && !dry(hi); i++) hi *= 2;
  if (!dry(hi)) throw new Error("bridge-landing");
  let lo = 0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (dry(mid)) hi = mid;
    else lo = mid;
  }
  return hi + 0.00001;
}

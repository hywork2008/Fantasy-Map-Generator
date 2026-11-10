import type { Point } from "../../../types/primitives";
import type { CurveAnchor, VectorPath, VectorSegment } from "../../../types/vector/document";
import { pathIsClosed, splitSegment } from "./curves";
import { evaluatePresetPiece, presetPieces } from "./presets";

export const VECTOR_PRECISION = { positionMeters: 0.005, tangentDegrees: 0.1, maxDepth: 24, maxPoints: 16384 } as const;
export interface PathSample {
  point: Point;
  anchor: CurveAnchor;
  distance: number;
}
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angle = (a: Point, b: Point) => {
  const lengths = Math.hypot(...a) * Math.hypot(...b);
  return lengths > 1e-20 ? Math.atan2(Math.abs(a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1]) : Infinity;
};
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    d = dx * dx + dy * dy;
  const t = d ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Convex hulls bound cubic position and derivative direction over the entire interval. */
export function samplePath(path: VectorPath, surfacePrecision = false): PathSample[] {
  const samples: PathSample[] = [];
  const maxWidth = Math.max(
    path.width.leftMeters,
    path.width.rightMeters,
    ...path.width.stations.flatMap(s => [s.leftMeters, s.rightMeters])
  );
  const position = VECTOR_PRECISION.positionMeters / (surfacePrecision ? 2 : 1);
  const tangent = Math.min(
    (VECTOR_PRECISION.tangentDegrees * Math.PI) / 180,
    surfacePrecision ? Math.atan(Math.sqrt(position / maxWidth) / 2) : Infinity
  );
  const push = (point: Point, segmentId: string, t: number) => {
    if (samples.length >= VECTOR_PRECISION.maxPoints) throw new Error("precision-budget");
    samples.push({
      point,
      anchor: { pathId: path.id, segmentId, t },
      distance: samples.length ? samples.at(-1)!.distance + distance(samples.at(-1)!.point, point) : 0
    });
  };
  function cubic(segment: VectorSegment, originalId: string, lo: number, hi: number, depth: number) {
    if (segment.kind === "line") {
      push(segment.to, originalId, hi);
      return;
    }
    const chord: Point = [segment.to[0] - segment.from[0], segment.to[1] - segment.from[1]];
    const controls = [segment.from, segment.control1, segment.control2, segment.to];
    const flat =
      Math.max(
        pointSegmentDistance(segment.control1, segment.from, segment.to),
        pointSegmentDistance(segment.control2, segment.from, segment.to)
      ) <= position;
    const cone = controls
      .slice(1)
      .every((p, i) => angle([p[0] - controls[i][0], p[1] - controls[i][1]], chord) <= tangent);
    if (flat && cone) {
      push(segment.to, originalId, hi);
      return;
    }
    if (depth >= VECTOR_PRECISION.maxDepth) throw new Error("degenerate-tangent");
    const [a, b] = splitSegment(segment, 0.5, "a", "b");
    cubic(a, originalId, lo, (lo + hi) / 2, depth + 1);
    cubic(b, originalId, (lo + hi) / 2, hi, depth + 1);
  }
  if (path.source.kind === "curve") {
    for (const segment of path.source.segments) {
      push(segment.from, segment.id, 0);
      const stations = [
        0,
        ...path.width.stations
          .filter(s => s.anchor.segmentId === segment.id)
          .map(s => s.anchor.t)
          .filter(t => t > 0 && t < 1),
        1
      ].sort((a, b) => a - b);
      for (let i = 1; i < stations.length; i++) {
        const lo = stations[i - 1],
          hi = stations[i];
        if (hi === lo) continue;
        let part = segment;
        if (hi < 1) part = splitSegment(part, hi, "a", "b")[0];
        if (lo > 0) part = splitSegment(part, lo / hi, "a", "b")[1];
        cubic(part, segment.id, lo, hi, 0);
      }
    }
  } else {
    const source = path.source;
    for (const piece of presetPieces(source)) {
      push(evaluatePresetPiece(source, piece, 0), piece.id, 0);
      const arc = (lo: number, hi: number, depth: number) => {
        const from = evaluatePresetPiece(source, piece, lo),
          to = evaluatePresetPiece(source, piece, hi);
        const chord: Point = [to[0] - from[0], to[1] - from[1]];
        const bound = piece.kind === "line" ? 0 : (Math.max(...piece.axes!) * (piece.sweep! * (hi - lo)) ** 2) / 8;
        if (
          piece.kind === "line" ||
          (bound <= position &&
            [lo, hi].every(t => angle(evaluatePresetPiece(source, piece, t, true), chord) <= tangent))
        ) {
          push(to, piece.id, hi);
          return;
        }
        if (depth >= VECTOR_PRECISION.maxDepth) throw new Error("precision-budget");
        arc(lo, (lo + hi) / 2, depth + 1);
        arc((lo + hi) / 2, hi, depth + 1);
      };
      const stations = [
        0,
        ...path.width.stations
          .filter(s => s.anchor.segmentId === piece.id)
          .map(s => s.anchor.t)
          .filter(t => t > 0 && t < 1),
        1
      ].sort((a, b) => a - b);
      for (let i = 1; i < stations.length; i++) if (stations[i] > stations[i - 1]) arc(stations[i - 1], stations[i], 0);
    }
  }
  if (!samples.length || samples.at(-1)!.distance <= 1e-6) throw new Error("short-path");
  return samples;
}

export function sampledWidth(path: VectorPath, samples: PathSample[]): { left: number; right: number }[] {
  const total = samples.at(-1)!.distance;
  const stations = path.width.stations
    .map(s => {
      const sample = samples.find(
        p => p.anchor.segmentId === s.anchor.segmentId && Math.abs(p.anchor.t - s.anchor.t) < 1e-12
      );
      if (!sample) throw new Error("missing-width-anchor");
      return { distance: sample.distance, left: s.leftMeters, right: s.rightMeters };
    })
    .sort((a, b) => a.distance - b.distance);
  const base = { left: path.width.leftMeters, right: path.width.rightMeters };
  if (!stations.some(s => s.distance === 0)) stations.unshift({ distance: 0, ...base });
  if (!stations.some(s => s.distance === total)) stations.push({ distance: total, ...base });
  for (let i = 1; i < stations.length; i++)
    if (Math.abs(stations[i].distance - stations[i - 1].distance) < 1e-9) throw new Error("duplicate-width-anchor");
  if (
    pathIsClosed(path) &&
    (Math.abs(stations[0].left - stations.at(-1)!.left) > 1e-6 ||
      Math.abs(stations[0].right - stations.at(-1)!.right) > 1e-6)
  )
    throw new Error("closed-width-seam");
  let cursor = 0;
  return samples.map(p => {
    while (cursor + 2 < stations.length && p.distance > stations[cursor + 1].distance) cursor++;
    const a = stations[cursor],
      b = stations[cursor + 1],
      t = (p.distance - a.distance) / (b.distance - a.distance);
    return { left: a.left + (b.left - a.left) * t, right: a.right + (b.right - a.right) * t };
  });
}

/** Douglas-Peucker using finite chords: collinear overshoots cannot disappear. */
export function simplifyFreehand(points: Point[], tolerance: number): Point[] {
  if (!(tolerance > 0 && Number.isFinite(tolerance))) throw new Error("invalid-tolerance");
  const keep = new Set([0, points.length - 1]),
    pending = [[0, points.length - 1]];
  while (pending.length) {
    const [lo, hi] = pending.pop()!;
    let max = tolerance,
      selected = -1;
    for (let i = lo + 1; i < hi; i++) {
      const error = pointSegmentDistance(points[i], points[lo], points[hi]);
      if (error > max) {
        selected = i;
        max = error;
      }
    }
    if (selected >= 0) {
      keep.add(selected);
      pending.push([lo, selected], [selected, hi]);
    }
  }
  return [...keep]
    .sort((a, b) => a - b)
    .filter(i => i >= 0 && i < points.length)
    .map(i => [...points[i]]);
}

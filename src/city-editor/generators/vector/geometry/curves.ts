import type { Point } from "../../../types/primitives";
import type { CurveAnchor, VectorPath, VectorPreset, VectorSegment } from "../../../types/vector/document";
import { evaluatePresetPiece, presetPieces } from "./presets";

export const VECTOR_CONNECTION_EPSILON = 1e-6;

export function presetSegmentIds(source: VectorPreset): string[] {
  return presetPieces(source).map(piece => piece.id);
}

export function pathSegmentIds(path: VectorPath): string[] {
  return path.source.kind === "preset"
    ? presetSegmentIds(path.source)
    : path.source.segments.map(segment => segment.id);
}

export function pathIsClosed(path: VectorPath): boolean {
  return path.source.kind === "preset" || path.source.closed;
}

const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function evaluateSegment(segment: VectorSegment, t: number): Point {
  if (segment.kind === "line") return lerp(segment.from, segment.to, t);
  const a = lerp(segment.from, segment.control1, t);
  const b = lerp(segment.control1, segment.control2, t);
  const c = lerp(segment.control2, segment.to, t);
  return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

export function segmentTangent(segment: VectorSegment, t: number): Point {
  if (segment.kind === "line") return [segment.to[0] - segment.from[0], segment.to[1] - segment.from[1]];
  const u = 1 - t;
  return [0, 1].map(
    axis =>
      3 * u * u * (segment.control1[axis] - segment.from[axis]) +
      6 * u * t * (segment.control2[axis] - segment.control1[axis]) +
      3 * t * t * (segment.to[axis] - segment.control2[axis])
  ) as Point;
}

/** Invalid references fail explicitly; never reattach to a nearest segment. */
export function evaluateAnchor(path: VectorPath, anchor: CurveAnchor, derivative = false): Point {
  if (anchor.pathId !== path.id || !Number.isFinite(anchor.t) || anchor.t < 0 || anchor.t > 1)
    throw new Error("Invalid curve anchor");
  if (path.source.kind === "preset") {
    const piece = presetPieces(path.source).find(piece => piece.id === anchor.segmentId);
    if (!piece) throw new Error("Missing preset segment");
    return evaluatePresetPiece(path.source, piece, anchor.t, derivative);
  }
  const segment = path.source.segments.find(segment => segment.id === anchor.segmentId);
  if (!segment) throw new Error("Missing curve segment");
  return derivative ? segmentTangent(segment, anchor.t) : evaluateSegment(segment, anchor.t);
}

/** De Casteljau preserves the authored cubic instead of fitting a new curve. */
export function splitSegment(
  segment: VectorSegment,
  t: number,
  leftId: string,
  rightId: string
): [VectorSegment, VectorSegment] {
  if (!(t > 0 && t < 1) || leftId === rightId) throw new Error("Invalid curve split");
  const p = evaluateSegment(segment, t);
  if (segment.kind === "line")
    return [
      { id: leftId, kind: "line", from: [...segment.from], to: p },
      { id: rightId, kind: "line", from: [...p], to: [...segment.to] }
    ];
  const a = lerp(segment.from, segment.control1, t),
    b = lerp(segment.control1, segment.control2, t);
  const c = lerp(segment.control2, segment.to, t);
  return [
    {
      id: leftId,
      kind: "cubic",
      from: [...segment.from],
      control1: a,
      control2: lerp(a, b, t),
      to: p,
      ...(segment.startMode ? { startMode: segment.startMode } : {})
    },
    {
      id: rightId,
      kind: "cubic",
      from: [...p],
      control1: lerp(b, c, t),
      control2: c,
      to: [...segment.to],
      startMode: "aligned"
    }
  ];
}

import type { Point } from "../../../types/primitives";
import type { VectorPreset } from "../../../types/vector/document";

export interface PresetPiece {
  id: string;
  kind: "line" | "arc";
  from: Point;
  to: Point;
  /** Arc coordinates are local to the preset before its bearing/translation. */
  center?: Point;
  axes?: Point;
  startAngle?: number;
  sweep?: number;
}
const length = (p: Point) => Math.hypot(...p);
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const add = (a: Point, b: Point, scale: number): Point => [a[0] + scale * b[0], a[1] + scale * b[1]];
const unit = (p: Point): Point => {
  const n = length(p);
  return [p[0] / n, p[1] / n];
};

export function presetTransform(source: VectorPreset, point: Point, vector = false): Point {
  const a = ((90 - source.bearingDegrees) * Math.PI) / 180;
  return [
    Math.cos(a) * point[0] - Math.sin(a) * point[1] + (vector ? 0 : source.center[0]),
    Math.sin(a) * point[0] + Math.cos(a) * point[1] + (vector ? 0 : source.center[1])
  ];
}

export function presetVertices(source: VectorPreset): Point[] {
  const a = source.widthMeters / 2,
    b = source.heightMeters / 2;
  if (source.preset === "rectangle")
    return [
      [-a, -b],
      [a, -b],
      [a, b],
      [-a, b]
    ];
  const count = source.preset === "polygon" ? source.sides : 4;
  return Array.from({ length: count }, (_, i) => [
    a * Math.cos((i * 2 * Math.PI) / count),
    b * Math.sin((i * 2 * Math.PI) / count)
  ]);
}

function roundedCorners(source: VectorPreset, radius: number) {
  const vertices = presetVertices(source);
  return vertices.map((vertex, index) => {
    const prev = vertices[(index + vertices.length - 1) % vertices.length],
      next = vertices[(index + 1) % vertices.length];
    const a = unit(sub(prev, vertex)),
      b = unit(sub(next, vertex));
    const angle = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
    const trim = radius / Math.tan(angle / 2);
    const center = add(vertex, unit([a[0] + b[0], a[1] + b[1]]), radius / Math.sin(angle / 2));
    const from = add(vertex, a, trim),
      to = add(vertex, b, trim);
    return {
      from,
      to,
      center,
      trim,
      startAngle: Math.atan2(from[1] - center[1], from[0] - center[0]),
      sweep: Math.PI - angle
    };
  });
}

export function maximumCornerRadius(source: VectorPreset): number {
  if (source.preset === "ellipse") return 0;
  const vertices = presetVertices(source),
    corners = roundedCorners(source, 1);
  return (
    Math.min(
      ...vertices.map(
        (v, i) =>
          length(sub(vertices[(i + 1) % vertices.length], v)) /
          (corners[i].trim + corners[(i + 1) % corners.length].trim)
      )
    ) *
    (1 - 1e-8)
  );
}

/** Exact lines and circular/elliptic arcs; rounding happens after dimensional scaling. */
export function presetPieces(source: VectorPreset): PresetPiece[] {
  const a = source.widthMeters / 2,
    b = source.heightMeters / 2;
  if (source.preset === "ellipse")
    return Array.from({ length: 4 }, (_, i) => ({
      id: `arc:${i}`,
      kind: "arc",
      from: [a * Math.cos((i * Math.PI) / 2), b * Math.sin((i * Math.PI) / 2)],
      to: [a * Math.cos(((i + 1) * Math.PI) / 2), b * Math.sin(((i + 1) * Math.PI) / 2)],
      center: [0, 0],
      axes: [a, b],
      startAngle: (i * Math.PI) / 2,
      sweep: Math.PI / 2
    }));
  const vertices = presetVertices(source),
    radius = source.cornerRadiusMeters ?? 0;
  if (!radius)
    return vertices.map((from, i) => ({
      id: `edge:${i}`,
      kind: "line",
      from,
      to: vertices[(i + 1) % vertices.length]
    }));
  const corners = roundedCorners(source, radius);
  return corners.flatMap((corner, i): PresetPiece[] => [
    {
      id: `corner:${i}`,
      kind: "arc",
      from: corner.from,
      to: corner.to,
      center: corner.center,
      axes: [radius, radius],
      startAngle: corner.startAngle,
      sweep: corner.sweep
    },
    { id: `edge:${i}`, kind: "line", from: corner.to, to: corners[(i + 1) % corners.length].from }
  ]);
}

export function evaluatePresetPiece(source: VectorPreset, piece: PresetPiece, t: number, derivative = false): Point {
  if (piece.kind === "line")
    return presetTransform(
      source,
      derivative ? sub(piece.to, piece.from) : add(piece.from, sub(piece.to, piece.from), t),
      derivative
    );
  const angle = piece.startAngle! + piece.sweep! * t,
    [a, b] = piece.axes!;
  return presetTransform(
    source,
    derivative
      ? [-a * Math.sin(angle) * piece.sweep!, b * Math.cos(angle) * piece.sweep!]
      : [piece.center![0] + a * Math.cos(angle), piece.center![1] + b * Math.sin(angle)],
    derivative
  );
}

export function presetArea(source: VectorPreset): number {
  const a = source.widthMeters,
    b = source.heightMeters;
  if (source.preset === "ellipse") return (Math.PI * a * b) / 4;
  const base =
    source.preset === "polygon" ? (source.sides * a * b * Math.sin((2 * Math.PI) / source.sides)) / 8 : a * b;
  const radius = source.cornerRadiusMeters ?? 0;
  if (!radius) return base;
  return (
    base - roundedCorners(source, radius).reduce((sum, c) => sum + radius * c.trim - (radius * radius * c.sweep) / 2, 0)
  );
}

/** Fixed physical corner radius is retained while solving the requested enclosed area. */
export function presetDimensionsForArea(source: VectorPreset, area: number, ratio: number): VectorPreset {
  if (!(area > 0 && ratio > 0 && Number.isFinite(area + ratio))) throw new Error("invalid-dimensions");
  const candidate = (scale: number): VectorPreset => ({
    ...source,
    widthMeters: scale * Math.sqrt(ratio),
    heightMeters: scale / Math.sqrt(ratio)
  });
  let lo = 1e-5,
    hi = Math.max(Math.sqrt(area) * 4, (source.cornerRadiusMeters ?? 0) * 8, 1);
  while (
    presetArea(candidate(hi)) < area ||
    ((source.cornerRadiusMeters ?? 0) > maximumCornerRadius(candidate(hi)) && source.preset !== "ellipse")
  ) {
    hi *= 2;
    if (hi > 1e7) throw new Error("invalid-dimensions");
  }
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2,
      shape = candidate(mid);
    if (
      (source.preset !== "ellipse" && (shape.cornerRadiusMeters ?? 0) > maximumCornerRadius(shape)) ||
      presetArea(shape) < area
    )
      lo = mid;
    else hi = mid;
  }
  const result = candidate(hi);
  if (Math.abs(presetArea(result) - area) > Math.max(1e-6, area * 1e-9)) throw new Error("invalid-dimensions");
  return result;
}

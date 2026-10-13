import type { Point } from "../core/types";
import { polygon } from "./svgPrimitives";
/** Soften field corners without moving the underlying parcel or its furrows. */
export function roundedFarmPolygon(points: Point[]): string {
  if (points.length < 3) return polygon(points);
  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const before = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    const after = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const radius = Math.min(3, before * 0.18, after * 0.18);
    const entry: Point = before
      ? [
          point[0] + ((previous[0] - point[0]) * radius) / before,
          point[1] + ((previous[1] - point[1]) * radius) / before
        ]
      : point;
    const exit: Point = after
      ? [point[0] + ((next[0] - point[0]) * radius) / after, point[1] + ((next[1] - point[1]) * radius) / after]
      : point;
    return { point, entry, exit };
  });
  const start = corners[0].entry;
  return `M${start[0]} ${-start[1]} ${corners
    .map(({ point, exit }, index) => {
      return `Q${point[0]} ${-point[1]} ${exit[0]} ${-exit[1]} L${corners[(index + 1) % corners.length].entry[0]} ${-corners[(index + 1) % corners.length].entry[1]}`;
    })
    .join(" ")} Z`;
}

type CorridorPiece =
  | { kind: "line"; start: readonly number[]; end: readonly number[] }
  | { kind: string; start: readonly number[]; end: readonly number[]; radiusMeters: number; sweep: number };

/** SVG path data for a fixed approach corridor of straight and arc pieces. Pure shape computation. */
export function corridorPathData(pieces: ReadonlyArray<CorridorPiece>): string {
  return pieces
    .map((piece, i) => {
      const start = i ? "" : `M${piece.start[0]} ${-piece.start[1]}`;
      if (piece.kind === "line") return `${start} L${piece.end[0]} ${-piece.end[1]}`;
      const arc = piece as Extract<CorridorPiece, { radiusMeters: number }>;
      return `${start} A${arc.radiusMeters} ${arc.radiusMeters} 0 ${Math.abs(arc.sweep) > Math.PI ? 1 : 0} ${arc.sweep < 0 ? 1 : 0} ${arc.end[0]} ${-arc.end[1]}`;
    })
    .join(" ");
}

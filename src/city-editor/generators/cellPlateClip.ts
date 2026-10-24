// Cell-plate walls stop at the water. The bank mesh owns the wet edge.

import type { Point } from "../types/primitives";
import { triangularInfillParts } from "./lotGeometry";
import { subtractConvex } from "./parcelGeometry";

/** Drop the parts of wall triangles that lie in water. The new edge is not a wall. */
export function clipEscarpmentTriangles(triangles: Point[][], wet: readonly Point[][]): Point[][] {
  const clips = wet.flatMap(ring => {
    const parts = triangularInfillParts(ring);
    return parts.length ? parts : ring.length >= 3 ? [ring] : [];
  });
  if (!clips.length) return triangles;
  let pieces = triangles.filter(triangle => triangle.length >= 3);
  for (const clip of clips)
    pieces = pieces.flatMap(piece => subtractConvex(piece, clip, 0.05).filter(part => part.length >= 3));
  return pieces;
}

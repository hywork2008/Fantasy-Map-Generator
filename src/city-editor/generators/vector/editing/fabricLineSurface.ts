import type { Point } from "../../../types/primitives";
import type { VectorPath } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { pathSurface } from "../geometry/surfaces";
import { curveSource } from "./paths";

/** Kept outside fabric/lines.ts: validation reads fabric lines, and editing/paths depends on validation. */
/** Road surface of a fabric line, as the renderer draws it. */
export function fabricLineSurface(line: { points: Point[]; widthMeters: number }): VectorPolygon {
  const path: VectorPath = {
    id: "fabric-line",
    revision: 0,
    role: "road",
    origin: "automatic",
    editPolicy: "editable",
    source: curveSource(line.points, "polyline", false),
    width: { leftMeters: line.widthMeters / 2, rightMeters: line.widthMeters / 2, stations: [] }
  };
  return pathSurface(path);
}

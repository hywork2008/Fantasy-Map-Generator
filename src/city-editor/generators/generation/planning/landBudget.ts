import type { Point } from "../../../types/document";
import type { Cell } from "../../../types/geometry";
import { convexInfillParts } from "../../lotGeometry";
import { bounds, PlotIndex, plotArea, subtractConvex } from "../../parcelGeometry";

/** Exact dry area, counting overlapping water only once. Whole-cell area is
 * not residential capacity when a surveyed channel cuts through the cell. */
export function urbanLandAreas(cells: Cell[], water: Point[][]): Map<number, number> | undefined {
  if (!water.length) return undefined;
  const index = new PlotIndex<Point[]>(100);
  for (const polygon of water) for (const part of convexInfillParts(polygon)) index.add(part, bounds(part));
  const result = new Map<number, number>();
  for (const cell of cells) {
    let dry = convexInfillParts(cell.polygon);
    for (const wet of index.query(bounds(cell.polygon))) {
      dry = dry.flatMap(part => subtractConvex(part, wet, 0.001));
      if (!dry.length) break;
    }
    result.set(
      cell.id,
      dry.reduce((sum, part) => sum + plotArea(part), 0)
    );
  }
  return result;
}

import { describe, expect, it } from "vitest";
import type { DistrictParameters, Face, Point } from "../types/document";
import { nearestOnPolyline } from "./geom";
import { COARSE_STREET_CELL_METERS, COARSE_STREET_WIDTH_METERS, planOrganicStreetCells } from "./organicBlocks";
import type { BlockBoundary } from "./streetBlockGeometry";

const face: Face = {
  id: "district:test",
  boundary: [],
  properties: { elevation: 1, water: "land", ward: "craftsmen", buildable: true, locked: false }
};
const parameters: DistrictParameters = { lotArea: 80, coverage: 0.9, occupancy: 1, laneWidth: 2.4, orientation: 0 };
const context = {
  hub: [0, -500] as Point,
  extentMeters: 1000,
  walls: [],
  streetCellMeters: COARSE_STREET_CELL_METERS,
  streetWidthMeters: COARSE_STREET_WIDTH_METERS
};
/** A district `depth` metres deep between a main road (its bottom side) and a wall or bank (its top). */
function strip(depth: number) {
  const outline: Point[] = [
      [0, 0],
      [120, 0],
      [120, depth],
      [0, depth]
    ],
    boundaries: BlockBoundary[] = outline.map((a, i) => {
      const b = outline[(i + 1) % outline.length],
        road = i === 0;
      return { a, b, feature: road, barrier: !road, setback: road ? 0.35 : 3 };
    });
  const plan = planOrganicStreetCells(face, outline, boundaries, parameters, "backs", context);
  // Streets running along the wall or bank at the top, within a lane's corridor of it.
  return plan.streets.filter(
    s => s.points.length >= 2 && s.points.every(p => nearestOnPolyline(p, [outline[2], outline[3]]).dist < 4)
  );
}

describe("organic street plan of a strip one row deep (single-row backs)", () => {
  it("lays no lane along the back of a strip one row of houses deep", () => {
    expect(strip(16)).toHaveLength(0);
  });

  it("keeps the lane along the wall of a strip deep enough for two rows back to back", () => {
    expect(strip(40).length).toBeGreaterThan(0);
  });
});

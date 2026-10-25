import type { CityDocument, Point } from "../types/document";
import { polygonArea } from "./geom";
import { bounds, intersectConvex, PlotIndex } from "./parcelGeometry";
import { cityTerrain } from "./terrainElevation";
import { FARM_SLOPE_LIMIT } from "./terrainField/constants";

/** Use supplied soil/wetness first; biome inference is deliberately labelled.
 * Height-field slopes constrain farming; synthetic banks between Farm cells do not. */
export function ruralSuitability(document: CityDocument) {
  const terrain = cityTerrain(document);
  const steep = new PlotIndex<Point[]>();
  if (terrain.field && terrain.slopeAt) {
    const step = 8;
    const half = document.frame.extentMeters / 2;
    for (let y = -half; y < half; y += step)
      for (let x = -half; x < half; x += step) {
        if (terrain.slopeAt([x + step / 2, y + step / 2]) <= FARM_SLOPE_LIMIT) continue;
        const square: Point[] = [
          [x, y],
          [x + step, y],
          [x + step, y + step],
          [x, y + step]
        ];
        steep.add(square, bounds(square));
      }
  }
  // Cell elevations describe level wards joined by synthetic banks and retaining walls.
  // Rejecting a whole plot that touches one of these seams erases otherwise cultivable Farm wards.
  const biome = [document.biome?.key, ...(document.biome?.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
  const hostile = /wetland|swamp|marsh|glacier|ice|desert/.test(biome);
  const measured = Object.values(document.mesh.faces).some(
    face => face.properties.farming?.soilQuality !== undefined || face.properties.farming?.wetness !== undefined
  );
  const source = measured ? ("survey" as const) : document.biome ? ("biome-estimate" as const) : ("unknown" as const);
  return {
    source,
    accepts(faceId: string) {
      const quality = document.mesh.faces[faceId]?.properties.farming;
      if (quality?.soilQuality !== undefined && quality.soilQuality < 0.2) return false;
      if (quality?.wetness !== undefined && quality.wetness > 0.85) return false;
      return !hostile || (quality?.soilQuality !== undefined && quality.wetness !== undefined);
    },
    steepArea(polygon: Point[]) {
      return steep
        .query(bounds(polygon))
        .reduce((sum, triangle) => sum + Math.abs(polygonArea(intersectConvex(polygon, triangle))), 0);
    },
    steep(polygon: Point[]) {
      return steep
        .query(bounds(polygon))
        .some(triangle => Math.abs(polygonArea(intersectConvex(polygon, triangle))) > 0.01);
    }
  };
}

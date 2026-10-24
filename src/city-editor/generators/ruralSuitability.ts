import type { CityDocument, Point } from "../types/document";
import { polygonArea } from "./geom";
import { bounds, intersectConvex, PlotIndex } from "./parcelGeometry";
import { cityTerrain } from "./terrainElevation";

/** Use supplied soil/wetness first; biome inference is deliberately labelled.
 * Terrain triangles share the renderer's elevation model, including edited relief. */
export function ruralSuitability(document: CityDocument) {
  const terrain = cityTerrain(document);
  const steep = new PlotIndex<Point[]>();
  if (terrain.field && terrain.slopeAt) {
    const step = 8;
    const half = document.frame.extentMeters / 2;
    for (let y = -half; y < half; y += step)
      for (let x = -half; x < half; x += step) {
        if (terrain.slopeAt([x + step / 2, y + step / 2]) <= 0.18) continue;
        const square: Point[] = [
          [x, y],
          [x + step, y],
          [x + step, y + step],
          [x, y + step]
        ];
        steep.add(square, bounds(square));
      }
  }
  for (const patch of terrain.field ? [] : terrain.triangles) {
    // A cliff or retaining-wall face is the edge between two flat levels, not a slope to plough.
    if (patch.escarpment) continue;
    const [a, b, c] = patch.points,
      [za, zb, zc] = patch.heights;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      ex = c[0] - a[0],
      ey = c[1] - a[1];
    const det = dx * ey - dy * ex;
    if (Math.abs(det) < 1e-8) continue;
    const gx = ((zb - za) * ey - (zc - za) * dy) / det,
      gy = (dx * (zc - za) - ex * (zb - za)) / det;
    if (Math.hypot(gx, gy) > 0.18) steep.add(patch.points, bounds(patch.points));
  }
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

import type { CityDocument, Point } from "../types/document";
import { polygonArea } from "./geom";
import { bounds, intersectConvex, PlotIndex } from "./parcelGeometry";
import { cityTerrain } from "./terrainElevation";

/** Use supplied soil/wetness first; biome inference is deliberately labelled.
 * Terrain triangles share the renderer's elevation model, including edited relief. */
export function ruralSuitability(document: CityDocument) {
  const terrain = cityTerrain(document);
  const steep = new PlotIndex<Point[]>();
  for (const patch of terrain.triangles) {
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

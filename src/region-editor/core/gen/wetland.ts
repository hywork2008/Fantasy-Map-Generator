import { getCoastalHabitatKey } from "../../../data/coastalHabitatCatalog";
import type { Point, RegionSiteCell, RegionWetlandPatch } from "../types";
import { clipConvex, landscapeNoise, polygonArea, rectangle } from "./landUseGeometry";

/** Visual estimate, not a water-table simulation. World-space noise gives adjoining
 * cells the same microrelief; precipitation, relative elevation and nearby water
 * control inundation. Sand requires an explicit sandy coastal substrate. */
export function buildWetlandPatches(
  cell: RegionSiteCell,
  cells: RegionSiteCell[],
  seed: string,
  metersPerMapUnit: number
): RegionWetlandPatch[] {
  const poly = cell.polygon;
  if (!poly || poly.length < 3) return [];
  const scale = Math.max(0.001, metersPerMapUnit);
  const xs = poly.map(p => p[0]),
    ys = poly.map(p => p[1]);
  const step = Math.max(180 / scale, Math.sqrt(polygonArea(poly) / 256));
  const radius = Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
  const nearby = cells.filter(c => Math.hypot(c.point[0] - cell.point[0], c.point[1] - cell.point[1]) <= radius * 2);
  const water = nearby.filter(c => c.isWater || (c.height !== undefined && c.height < 20));
  const land = nearby.filter(c => !c.isWater && (c.height === undefined || c.height >= 20));
  const habitat = getCoastalHabitatKey(cell.coastalHabitat ?? 0);
  const sandy = habitat === "sandyBeach" || habitat === "coastalDune";
  const rain = Math.max(-0.08, Math.min(0.08, ((cell.annualPrecipitationMm ?? 900) - 900) / 10000));
  const score = (p: Point) => {
    // IDW interpolation of surrounding land elevations: coarse terrain is only a
    // relative wetness cue; subcell relief cannot be recovered from FMG heights.
    let total = 0,
      weight = 0;
    for (const c of land) {
      const w = 1 / (1 + Math.hypot(p[0] - c.point[0], p[1] - c.point[1]) ** 2);
      total += w * c.elevationMeters;
      weight += w;
    }
    const relativeLow = weight ? Math.max(-0.12, Math.min(0.12, (cell.elevationMeters - total / weight) / 300)) : 0;
    const waterDistance = water.length
      ? Math.min(...water.map(c => Math.hypot(p[0] - c.point[0], p[1] - c.point[1]) * scale))
      : Infinity;
    const proximity = 0.12 * Math.exp(-waterDistance / 1500);
    return (
      landscapeNoise((p[0] * scale) / 160, (p[1] * scale) / 160, `${seed}:wetland`) + rain + relativeLow + proximity
    );
  };
  const patches: RegionWetlandPatch[] = [];
  // Linear scalar clipping keeps natural contour edges rather than visible grid tiles.
  const contour = (points: Point[], values: number[], threshold: number, above: boolean): Point[] => {
    const result: Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const a = values[i] - threshold,
        b = values[j] - threshold;
      if (above ? a >= 0 : a <= 0) result.push(points[i]);
      if (a >= 0 !== b >= 0) {
        const t = a / (a - b);
        result.push([
          points[i][0] + t * (points[j][0] - points[i][0]),
          points[i][1] + t * (points[j][1] - points[i][1])
        ]);
      }
    }
    return result;
  };
  for (let ix = Math.floor(Math.min(...xs) / step); ix * step < Math.max(...xs); ix++) {
    for (let iy = Math.floor(Math.min(...ys) / step); iy * step < Math.max(...ys); iy++) {
      const square = rectangle(ix * step, iy * step, step, step);
      for (const tri of [
        [square[0], square[1], square[2]],
        [square[0], square[2], square[3]]
      ]) {
        const values = tri.map(score);
        const wet = contour(tri, values, 0.56, true);
        const bank = contour(tri, values, 0.48, true);
        const sediment = clipConvex(contour(tri, values, 0.56, false), bank);
        for (const [kind, polygon] of [
          ["water", wet],
          [sandy ? "sand" : "mud", sediment]
        ] as const) {
          const clipped = clipConvex(polygon, poly);
          if (polygonArea(clipped) > 1e-8) patches.push({ kind, polygon: clipped });
        }
      }
    }
  }
  return patches;
}

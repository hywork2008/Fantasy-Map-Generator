import type { ForestSettings } from "../../../types/contracts/forest";
import type { LandscapeClimate } from "../../../types/contracts/landscape";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { STANDARD_GLACIS_METERS } from "../../defenseClearance";
import { treeBiomeForClimate } from "../../landscapeVegetation";
import { featureReservations } from "../environmentState";
import { validateVectorForest } from "../forest";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { vectorOccupiedSites } from "../occupancy";
import { vectorApproachBands } from "./suburbs";

/** Pieces smaller than this are slivers between clearances, not woodland. */
const MIN_REGION_M2 = 400;

/** Points at least this far apart: a wall sampled every few decimetres would give the clipper thousands of quads. */
const CORRIDOR_STEP_METERS = 6;

/** Quads along a line, `width` wide: the mesh editor's corridor clearances. */
function corridor(line: Point[], width: number): VectorPolygon[] {
  const half = width / 2,
    points: Point[] = [];
  for (const [i, p] of line.entries()) {
    const last = points.at(-1);
    if (!last || i === line.length - 1 || Math.hypot(p[0] - last[0], p[1] - last[1]) >= CORRIDOR_STEP_METERS)
      points.push(p);
  }
  return points.slice(1).flatMap((b, i): VectorPolygon[] => {
    const a = points[i],
      l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) return [];
    const u: Point = [((b[0] - a[0]) / l) * half, ((b[1] - a[1]) / l) * half],
      n: Point = [-u[1], u[0]];
    // Squared ends overlap the next piece at a bend.
    return [
      {
        outer: [
          [a[0] - u[0] + n[0], a[1] - u[1] + n[1]],
          [b[0] + u[0] + n[0], b[1] + u[1] + n[1]],
          [b[0] + u[0] - n[0], b[1] + u[1] - n[1]],
          [a[0] - u[0] - n[0], a[1] - u[1] - n[1]]
        ],
        holes: []
      }
    ];
  });
}

/** The forest settings asked for: the requested settings of the town. */
export const vectorForestSettings = (doc: VectorCityDocument): ForestSettings | undefined =>
  doc.context.requestedSettings?.forestSettings;

/** Whether trees grow in the town's climate (the FMG burg's biome and temperature), as the mesh editor judges it. */
export function vectorTreesGrow(doc: VectorCityDocument): boolean {
  return treeBiomeForClimate(vectorLandscapeClimate(doc)) !== "none";
}

/** The town's climate as the mesh editor's tree rules read it: the FMG burg's biome and temperature. */
export function vectorLandscapeClimate(doc: VectorCityDocument): LandscapeClimate {
  const descriptor = doc.site?.descriptor;
  return {
    ...(descriptor?.biome ? { biome: descriptor.biome } : {}),
    temperatureC: descriptor?.climate?.temperatureC,
    climateBiomeKey: descriptor?.climate?.biomeKey
  };
}

/**
 * Woodland by the forest settings and the mesh editor's land-cover rules (P7b, `forestLandCover`/`buildForestPlan`).
 * `surroundings` covers the countryside: the frame beyond the town's land, where the mesh editor's outskirts cells
 * hold no ward. `farmland` covers only fields, which the meshless editor does not raise (farmland is skipped), and
 * `legacy` none. A treeless climate (the FMG burg's biome and temperature) grows none. The cover keeps clear of
 * water, the roads (4 m beyond their width), the wall's glacis on both sides, and every reserved site, as the mesh
 * editor's forest plan does.
 */
export function raiseVectorForest(doc: VectorCityDocument): VectorCityDocument {
  const settings = vectorForestSettings(doc);
  if (settings?.mode !== "surroundings" || !doc.site) return doc;
  if (!vectorTreesGrow(doc)) return doc;
  const half = doc.frame.extentMeters / 2,
    frame: VectorPolygon = {
      outer: [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half]
      ],
      holes: []
    },
    { bands } = vectorApproachBands(doc),
    glacis = Math.max(STANDARD_GLACIS_METERS, ...bands.map(b => b.clearance)),
    keepOut: VectorPolygon[] = [
      ...doc.site.domain,
      ...allVectorWater(doc),
      ...featureReservations(doc),
      ...vectorOccupiedSites(doc, "reserved"),
      ...Object.values(doc.paths).flatMap(p =>
        p.role === "road"
          ? corridor(
              samplePath(p).map(s => s.point),
              p.width.leftMeters + p.width.rightMeters + 4
            )
          : p.role === "wall"
            ? corridor(
                samplePath(p).map(s => s.point),
                glacis * 2
              )
            : []
      )
    ];
  const regions = regionBoolean([frame], keepOut, "difference").filter(
    r => regionArea(r) >= MIN_REGION_M2 && simpleContour(r.outer, true) && r.holes.every(h => simpleContour(h, true))
  );
  if (!regions.length) return doc;
  const next: VectorCityDocument = {
    ...doc,
    environment: {
      features: {},
      hidden: [],
      ...doc.environment,
      forest: {
        mode: settings.mode,
        density: settings.density,
        regions,
        areaM2: regions.reduce((n, r) => n + regionArea(r), 0)
      }
    }
  };
  return validateVectorForest(next).length ? doc : next;
}

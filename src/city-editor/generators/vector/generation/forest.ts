import type { ForestSettings } from "../../../types/contracts/forest";
import type { LandscapeClimate } from "../../../types/contracts/landscape";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { STANDARD_GLACIS_METERS } from "../../defenseClearance";
import { pointInPolygon } from "../../geom";
import { treeBiomeForClimate } from "../../landscapeVegetation";
import { featureReservations } from "../environmentState";
import { validateVectorForest } from "../forest";
import { regionArea, regionBoolean, regionProbe } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { landUseRegions } from "../landUse";
import { vectorOccupiedSites } from "../occupancy";
import { vectorApproachBands } from "./suburbs";

/** Pieces smaller than this are slivers between clearances, not woodland. */
const MIN_REGION_M2 = 400;

/** Points at least this far apart: a wall sampled every few decimetres would give the clipper thousands of quads. */
const CORRIDOR_STEP_METERS = 6;

/** A ring that touches itself at a vertex, as clipping leaves one where two pieces of town meet at a corner, split
 * there into its loops; a simple ring as it is. */
function loops(ring: Point[]): Point[][] {
  const key = (p: Point) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`,
    seen = new Map<string, number>();
  for (let i = 0; i < ring.length; i++) {
    const k = key(ring[i]),
      j = seen.get(k);
    if (j !== undefined)
      return [...loops([...ring.slice(0, j), ...ring.slice(i)]), ...loops(ring.slice(j, i))].filter(l => l.length >= 3);
    seen.set(k, i);
  }
  // A vertex touching another edge of the ring: it becomes a vertex of that edge too, and the ring splits there.
  const n = ring.length;
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      const a = ring[k],
        b = ring[(k + 1) % n];
      if (k === i || (k + 1) % n === i) continue;
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        l2 = dx * dx + dy * dy;
      if (l2 < 1e-12) continue;
      const t = ((ring[i][0] - a[0]) * dx + (ring[i][1] - a[1]) * dy) / l2;
      if (t <= 1e-6 || t >= 1 - 1e-6) continue;
      if (Math.hypot(a[0] + dx * t - ring[i][0], a[1] + dy * t - ring[i][1]) > 1e-4) continue;
      return loops([...ring.slice(0, k + 1), ring[i], ...ring.slice(k + 1)]);
    }
  return [ring];
}

/** Each piece as simple rings: a pinched outline split at its pinch, each hole kept with the piece that holds it. */
export function unpinched(region: VectorPolygon): VectorPolygon[] {
  if (simpleContour(region.outer, true) && region.holes.every(h => simpleContour(h, true))) return [region];
  const outers = loops(region.outer),
    holes = region.holes.flatMap(loops);
  return outers.map(outer => ({
    outer,
    holes: holes.filter(h => outers.length === 1 || pointInPolygon(h[0], outer))
  }));
}

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

const boxOf = (ring: Point[]) => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
};
/**
 * The countryside: the frame without the town's land, its water, the roads (4 m beyond their width), the wall's
 * glacis on both sides, every reserved site and `townLand` (the urban domain once built), in pieces of woodland size. The mesh editor's forest plan keeps the
 * same clearances; the land use (U5b) splits the same ground.
 */
export function vectorCountryside(doc: VectorCityDocument, townLand: VectorPolygon[] = []): VectorPolygon[] {
  if (!doc.site) return [];
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
    keepOut: VectorPolygon[] = [...doc.site.domain, ...townLand, ...allVectorWater(doc), ...featureReservations(doc)],
    corridors: VectorPolygon[] = [
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
  // Sites within the town's land are cut with it already: only the others go to the kernel (most are houses). A site
  // lies within a piece of it when the piece holds its vertices and no edge of the piece reaches the site's box.
  const town = [...doc.site.domain, ...townLand].map(polygon => ({
      box: boxOf(polygon.outer),
      probe: regionProbe(polygon)
    })),
    within = (site: VectorPolygon) => {
      const b = boxOf(site.outer);
      return town.some(
        ({ box, probe }) =>
          b.minX >= box.minX &&
          b.maxX <= box.maxX &&
          b.minY >= box.minY &&
          b.maxY <= box.maxY &&
          !probe.nearBox(b.minX, b.minY, b.maxX, b.maxY) &&
          site.outer.every(probe.contains)
      );
    },
    occupied = vectorOccupiedSites(doc, "reserved").filter(site => !within(site));
  const land = (cut: VectorPolygon[]) =>
    // A piece pinched where pieces of town meet at a corner is split there, not dropped (roadside village V6).
    regionBoolean([frame], cut, "difference")
      .flatMap(unpinched)
      .filter(
        r =>
          regionArea(r) >= MIN_REGION_M2 && simpleContour(r.outer, true) && r.holes.every(h => simpleContour(h, true))
      );
  try {
    return land([...keepOut, ...occupied, ...corridors]);
  } catch {
    // The clipping kernel can fail on many small sites at once (burgage houses along the roads beyond the wall).
    // Sites beyond the town land are few and small; the countryside is laid without them rather than not at all.
    try {
      return land([...keepOut, ...corridors]);
    } catch {
      return [];
    }
  }
}

/**
 * Woodland by the forest settings and the mesh editor's land-cover rules (P7b, `forestLandCover`/`buildForestPlan`).
 * `surroundings` covers the countryside (`vectorCountryside`), less the land the land use (U5b) farms: then only its
 * wild ground. `farmland` covers only fields, which the meshless editor does not raise, and `legacy` none. A
 * treeless climate (the FMG burg's biome and temperature) grows none.
 */
export function raiseVectorForest(doc: VectorCityDocument): VectorCityDocument {
  const settings = vectorForestSettings(doc);
  if (settings?.mode !== "surroundings" || !doc.site) return doc;
  if (!vectorTreesGrow(doc)) return doc;
  const countryside = vectorCountryside(doc),
    farmed = landUseRegions(doc, ["arable", "meadow", "pasture"]),
    regions = (farmed.length ? regionBoolean(countryside, farmed, "difference") : countryside).filter(
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

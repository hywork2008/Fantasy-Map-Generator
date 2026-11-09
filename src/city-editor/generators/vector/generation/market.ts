import { placementPalette } from "../../../../buildings/placementModels";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { polygonOverlaps } from "../../fortifications";
import { segmentSegmentHit } from "../../geom";
import { insetConvexKernel } from "../../lotGeometry";
import { layoutMarketStalls } from "../../marketPlacement";
import { corridor } from "../../parcelGeometry";
import { defenseAccessSurface } from "../defense";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";

export const CIVIC_PLAZA_ID = "feature:civic-plaza";
/** The mesh editor's market aisle width. */
const AISLE_WIDTH = 4;

/**
 * A market day on the civic plaza, laid by the mesh editor's market rules (`layoutMarketStalls`, P6b): aisles from
 * every street that meets the plaza and from its axes' edges to a hub near the middle, and up to six produce, bread,
 * grain and cloth stalls in two rows along its long sides. The stalls are placements of the catalogue's stall
 * models; the aisles are the plaza's ground pieces. False leaves the plaza as an open square.
 */
export function raiseVectorPlazaMarket(doc: VectorCityDocument): boolean {
  const plaza = doc.environment?.features[CIVIC_PLAZA_ID];
  if (plaza?.kind !== "market") return false;
  const boundary = insetConvexKernel(
    plaza.boundary.outer,
    plaza.boundary.outer.map(() => 0.1)
  );
  if (boundary.length < 3) return false;
  const water = allVectorWater(doc),
    roads = Object.values(doc.paths).filter(p => p.role === "road"),
    wetRegion = (polygon: Point[]) =>
      regionBoolean([{ outer: polygon, holes: [] }], water, "intersection").some(r => regionArea(r) > 1e-5),
    // Solid ground the aisles walk round: buildings, other precincts, walls.
    solids = [
      ...Object.values(doc.placements).map(p => p.site.outer),
      ...Object.values(doc.environment?.features ?? {})
        .filter(f => f.id !== plaza.id)
        .map(f => f.boundary.outer),
      // A wall's band, piece by piece: a closed wall's outline would take in the whole town.
      ...Object.values(doc.paths)
        .filter(p => p.role === "wall")
        .flatMap(p => {
          const line = samplePath(p).map(s => s.point),
            width = p.width.leftMeters + p.width.rightMeters;
          return line.slice(1).map((b, i) => corridor(line[i], b, width, width / 2));
        })
    ],
    reserved: Point[][] = [...solids, ...roads.map(r => pathSurface(r).outer)];
  // Where the streets meet the plaza's edge, and the plaza's own entrance.
  const closed = [...boundary, boundary[0]],
    accessTargets: Point[] = [plaza.entrance];
  for (const road of roads) {
    const line = samplePath(road).map(s => s.point);
    for (let i = 1; i < line.length; i++)
      for (let j = 1; j < closed.length; j++) {
        const hit = segmentSegmentHit(line[i - 1], line[i], closed[j - 1], closed[j]);
        if (hit)
          accessTargets.push([
            line[i - 1][0] + (line[i][0] - line[i - 1][0]) * hit.t,
            line[i - 1][1] + (line[i][1] - line[i - 1][1]) * hit.t
          ]);
      }
  }
  const aisles: Point[][] = [];
  const layout = layoutMarketStalls({
    boundary,
    port: false,
    accessTargets,
    solids,
    clearAccess: line =>
      line.slice(1).every((b, i) => {
        const strip = corridor(line[i], b, AISLE_WIDTH);
        return !solids.some(s => polygonOverlaps(strip, s)) && !wetRegion(strip);
      }),
    wet: wetRegion,
    reserved: plot => [...reserved, ...aisles].some(r => polygonOverlaps(plot, r)),
    reserveAccess: route => {
      for (let i = 1; i < route.length; i++)
        aisles.push(corridor(route[i - 1], route[i], AISLE_WIDTH, AISLE_WIDTH / 2));
    },
    accept: () => true
  });
  if (!layout) return false;
  // The aisles as the plaza's ground, cut to the plaza.
  const pieces = layout.accessPaths.flatMap((route, i) =>
    regionBoolean(defenseAccessSurface(route, AISLE_WIDTH), [plaza.boundary], "intersection").map(
      (polygon: VectorPolygon, j: number) => ({
        id: `${plaza.id}:aisle:${i}:${j}`,
        role: "ground" as const,
        polygon,
        heightMeters: 0.03,
        color: "#cdbf9f"
      })
    )
  );
  plaza.pieces = [...plaza.pieces.filter(p => !p.id.includes(":aisle:")), ...pieces];
  plaza.settings.activity = "market-day";
  layout.stalls.forEach((stall, i) => {
    const id = `civic:market-stall:${i + 1}`,
      palette = placementPalette(stall.modelId, stall.palette);
    doc.placements[id] = {
      id,
      modelId: stall.modelId,
      position: stall.position,
      facingDegrees: stall.facingDegrees,
      origin: "automatic",
      editPolicy: "editable",
      site: { outer: stall.plot, holes: [] },
      accesses: [plaza.access],
      appearance: { quality: "high", ...(palette ? { palette } : {}), activity: "market-day" },
      display: {
        kind: "object",
        heightMeters: 2.5,
        footprint: [{ outer: stall.plot, holes: [] }],
        provenance: "copied",
        note: "Market stall laid by the mesh editor's market rules; excluded from residential capacity.",
        dwellings: 0
      }
    };
    plaza.placementIds.push(id);
  });
  return true;
}

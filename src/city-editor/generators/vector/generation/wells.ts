import RBush from "rbush";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import type { VectorWaterPoint } from "../../../types/vector/urban";
import { type DomesticWaterSite, layoutDomesticWater } from "../../domesticWater";
import { pointInPolygon, polygonCentroid } from "../../geom";
import { featureReservations } from "../environmentState";
import { fabricLinesNear } from "../fabric/lines";
import { unpackPoints } from "../fabric/pack";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { allVectorWater } from "../geometry/water";
import { vectorOccupiedSites } from "../occupancy";
import { CIVIC_PLAZA_ID } from "./market";
import { streetBlockOf } from "./wards";

/** The mesh editor's blocks that hold wells: these wards, and the blocks with none. */
const WELL_WARDS = new Set(["market", "merchant", "craftsmen", "patriciate"]);

type Box = { minX: number; minY: number; maxX: number; maxY: number };
const boxOf = (points: Point[], pad = 0): Box => ({
  minX: Math.min(...points.map(p => p[0])) - pad,
  minY: Math.min(...points.map(p => p[1])) - pad,
  maxX: Math.max(...points.map(p => p[0])) + pad,
  maxY: Math.max(...points.map(p => p[1])) + pad
});

/** True when the polygon comes within `reach` of the line, or the line runs through it. */
function nearLine(polygon: Point[], line: Point[], reach: number): boolean {
  for (let i = 1; i < line.length; i++) {
    if (pointInPolygon(line[i], polygon) || pointInPolygon(line[i - 1], polygon)) return true;
    for (const p of polygon) if (pointSegmentDistance(p, line[i - 1], line[i]) < reach) return true;
  }
  return false;
}

/**
 * The town's water points by the mesh editor's rules (P7d, `placeDomesticWater` through the cell-free
 * `layoutDomesticWater`): a public basin on the civic plaza, a community well (every fourth a rainwater cistern) per
 * 80 buildings at least 55 m apart on vacant ground of the market, merchant, craftsman, patrician and unassigned
 * street blocks with a walk of at most 12 m to a street, and a service pond on the outskirts of a town of 80
 * buildings or more. They stand after the houses: no water point takes a dwelling, a street or a lane.
 */
export function layoutVectorWells(
  doc: VectorCityDocument,
  districts: readonly { id: string; inside: boolean; ward?: string }[]
): VectorWaterPoint[] {
  const fabric = doc.fabric;
  if (!fabric || !Object.keys(fabric.cells).length) return [];
  const half = doc.frame.extentMeters / 2,
    roads = Object.values(doc.paths)
      .filter(p => p.role === "road")
      .map(p => ({ points: samplePath(p).map(s => s.point), widthMeters: p.width.leftMeters + p.width.rightMeters })),
    walls = Object.values(doc.paths)
      .filter(p => p.role === "wall")
      .map(p => ({ points: samplePath(p).map(s => s.point), widthMeters: p.width.leftMeters + p.width.rightMeters })),
    plaza = doc.environment?.features[CIVIC_PLAZA_ID],
    water = allVectorWater(doc),
    solids = new RBush<Box & { polygon: VectorPolygon }>(),
    claimed: Point[][] = [];
  const houses = vectorOccupiedSites(doc, "reserved");
  solids.load(
    [...featureReservations(doc).filter(r => r !== plaza?.boundary), ...houses].map(polygon => ({
      ...boxOf(polygon.outer),
      polygon
    }))
  );
  const overlaps = (polygon: Point[], pad = 0) => {
    const candidates = solids.search(boxOf(polygon, pad)).map(s => s.polygon);
    return (
      candidates.length > 0 &&
      regionBoolean([{ outer: polygon, holes: [] }], candidates, "intersection").some(r => regionArea(r) > 1e-3)
    );
  };
  const lines = (list: { points: Point[]; widthMeters: number }[], polygon: Point[], clearance: number) =>
    list.some(l => nearLine(polygon, l.points, l.widthMeters / 2 + clearance));
  const lanes = (polygon: Point[]) =>
    fabricLinesNear(fabric, boxOf(polygon), 8).some(l => nearLine(polygon, l.points, l.widthMeters / 2));
  const site: DomesticWaterSite = {
    inFrame: polygon => polygon.every(p => Math.abs(p[0]) <= half && Math.abs(p[1]) <= half),
    hitsWater: (polygon, clearance = 0) => {
      const box = boxOf(polygon, clearance);
      return water.some(
        w =>
          w.outer.some(p => p[0] >= box.minX && p[0] <= box.maxX && p[1] >= box.minY && p[1] <= box.maxY) ||
          polygon.some(p => pointInPolygon(p, w.outer)) ||
          w.outer.some((a, i) =>
            polygon.some(p => pointSegmentDistance(p, a, w.outer[(i + 1) % w.outer.length]) < clearance)
          )
      );
    },
    hitsRoutes: (polygon, clearance, kinds) =>
      (!kinds || kinds.includes("road")) && lines(roads, polygon, clearance)
        ? true
        : (!kinds || kinds.includes("wall")) && lines(walls, polygon, clearance),
    hitsBlocked: polygon =>
      overlaps(polygon) ||
      claimed.some(
        c => regionBoolean([{ outer: polygon, holes: [] }], [{ outer: c, holes: [] }], "intersection").length > 0
      ),
    buildingsIn: (polygon, clearance = 0) => (overlaps(polygon, clearance) ? [true] : []),
    hitsLanes: lanes,
    farmsIn: () => [],
    claim: polygon => claimed.push(polygon),
    hitsMoat: () => false,
    hitsFixedRoads: () => false
  };
  const wardOf = new Map<string, { ward?: string; inside: boolean }>();
  for (const d of districts) {
    const key = streetBlockOf(d.id);
    if (!wardOf.has(key) || d.ward) wardOf.set(key, { ward: d.ward, inside: d.inside });
  }
  const blocks = Object.values(fabric.cells)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .flatMap(cell => {
      const w = wardOf.get(cell.id);
      if (w?.ward && !WELL_WARDS.has(w.ward)) return [];
      return [{ polygon: unpackPoints(cell.ring, cell.origin), farm: false, outskirts: !(w?.inside ?? cell.inside) }];
    });
  const streets = fabricLinesNear(fabric, { minX: -half, minY: -half, maxX: half, maxY: half }, half);
  return layoutDomesticWater(site, [...roads, ...streets], houses.length, {
    blocks,
    plazas: plaza
      ? [{ center: polygonCentroid(plaza.boundary.outer), sizeMeters: Math.sqrt(regionArea(plaza.boundary)) }]
      : [],
    springs: []
  });
}

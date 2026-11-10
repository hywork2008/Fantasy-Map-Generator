import type { OpenSpace } from "../types/contracts/parcelTypes";
import type { CityDocument, Point } from "../types/document";
import type { Id } from "../types/primitives";
import type { BuildingLot } from "./buildingLots.types";
import { buildingHitsCivicLandmark } from "./civicClearance";
import { frontageBuildings } from "./frontageBuildings";
import { convexHull, nearestOnPolyline, pointInPolygon, polygonCentroid } from "./geom";
import { dwellingLotArea } from "./housing";
import { accessCorridor } from "./landmarks";
import { convexInfillParts, longestFrame } from "./lotGeometry";
import { edgeBetween, faceNeighbors, facePoints } from "./mesh";
import { bounds, corridor, intersectConvex, PlotIndex, plotArea, subtractConvex } from "./parcelGeometry";
import { makeRng } from "./prng";
import { classifyTownWater } from "./townWater";

const PREFIX = "population-facility:";
const MIN_LOT_M2 = 18;
const MIN_WIDTH_M = 3.5;
const BLOCKED_WARDS = new Set(["castle", "market", "cemetery", "park", "harbor"]);

export interface FacilityVacancy {
  /** Buildable land after roads, water, protected ground and required access are removed. */
  buildableM2: number;
  buildingM2: number;
  facilitySiteM2: number;
  requiredAccessM2: number;
  yardM2: number;
  shapeUnfitM2: number;
  lotRemainderM2: number;
  maxLotRemainderM2: number;
  /** Lot remainder whose centroid is within 20 m of a facility site. */
  nearFacilityRemainderM2: number;
  nearFacilityMaxM2: number;
}

interface Street {
  points: Point[];
  widthMeters: number;
}

function facilityLandmarks(document: CityDocument) {
  return (document.landmarks ?? []).filter(landmark => landmark.id.startsWith(PREFIX));
}

function convexPieces(polygons: Point[][]): Point[][] {
  return polygons.flatMap(polygon => (polygon.length >= 3 ? convexInfillParts(polygon) : []));
}

function streetBands(document: CityDocument, lanes: readonly Street[]): Point[][] {
  const bands: Point[][] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "road" && group.kind !== "plank") continue;
    for (const ref of group.segments) {
      const edge = document.mesh.edges[ref.edgeId];
      const a = document.mesh.vertices[edge?.a]?.point;
      const b = document.mesh.vertices[edge?.b]?.point;
      if (!a || !b) continue;
      const band = corridor(a, b, group.style.widthMeters);
      if (band.length >= 3) bands.push(band);
    }
  }
  for (const lane of lanes)
    for (let i = 1; i < lane.points.length; i++) {
      const band = corridor(lane.points[i - 1], lane.points[i], lane.widthMeters);
      if (band.length >= 3) bands.push(band);
    }
  return bands;
}

function indexPolygons(polygons: Point[][]): PlotIndex<Point[]> {
  const index = new PlotIndex<Point[]>();
  for (const polygon of polygons) if (polygon.length >= 3) index.add(polygon, bounds(polygon));
  return index;
}

function cutPieces(parts: Point[][], cuts: PlotIndex<Point[]>, minimum = 0.4): Point[][] {
  const out: Point[][] = [];
  for (const part of parts) {
    let pieces = [part];
    for (const cut of cuts.query(bounds(part))) pieces = pieces.flatMap(piece => subtractConvex(piece, cut, minimum));
    out.push(...pieces.filter(piece => piece.length >= 3 && plotArea(piece) >= minimum));
  }
  return out;
}

function edgeTouchLength(a: Point[], b: Point[]): number {
  const ring = [...b, b[0]];
  let length = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    const mid: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    if (
      nearestOnPolyline(p, ring).dist < 0.25 &&
      nearestOnPolyline(q, ring).dist < 0.25 &&
      nearestOnPolyline(mid, ring).dist < 0.25
    )
      length += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return length;
}

/** Join residuals that meet on a mesh bookkeeping edge. A concave bite stays split. */
function mergeTouching(parts: Point[][]): Point[][] {
  const left = parts.filter(part => part.length >= 3);
  let index = 0;
  while (index < left.length) {
    let merged = false;
    for (let other = index + 1; other < left.length; other++) {
      const box = bounds(left[index]);
      const otherBox = bounds(left[other]);
      // Shared edges touch; boundsOverlap rejects boxes that only meet on a side.
      if (
        box[0] > otherBox[2] + 0.05 ||
        otherBox[0] > box[2] + 0.05 ||
        box[1] > otherBox[3] + 0.05 ||
        otherBox[1] > box[3] + 0.05
      )
        continue;
      if (plotArea(intersectConvex(left[index], left[other])) > 0.2) continue;
      if (edgeTouchLength(left[index], left[other]) < 0.8) continue;
      const hull = convexHull([...left[index], ...left[other]]);
      const extra = plotArea(hull) - plotArea(left[index]) - plotArea(left[other]);
      if (extra > 1.5) continue;
      left[index] = hull;
      left.splice(other, 1);
      merged = true;
      break;
    }
    if (!merged) index++;
  }
  return left;
}

function usableLot(polygon: Point[]): boolean {
  return polygon.length >= 3 && plotArea(polygon) >= MIN_LOT_M2 && longestFrame(polygon).across >= MIN_WIDTH_M;
}

function accessibleEdges(polygon: Point[], streets: readonly Street[]): number[] {
  const edges: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 2.5) continue;
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (streets.some(street => nearestOnPolyline(mid, street.points).dist <= street.widthMeters / 2 + 1.2))
      edges.push(i);
  }
  return edges;
}

function overlapsAny(polygon: Point[], occupied: PlotIndex<Point[]>, slack = 0.2): boolean {
  return occupied.query(bounds(polygon)).some(other => plotArea(intersectConvex(polygon, other)) > slack);
}

interface GroundCuts {
  streets: Street[];
  streetIndex: PlotIndex<Point[]>;
  waterIndex: PlotIndex<Point[]>;
  protectedIndex: PlotIndex<Point[]>;
  siteIndex: PlotIndex<Point[]>;
  accessIndex: PlotIndex<Point[]>;
}

function groundCuts(document: CityDocument, lanes: readonly Street[]): GroundCuts {
  const facilities = facilityLandmarks(document);
  const water = convexPieces(classifyTownWater(document).parts.map(part => part.polygon));
  const sites = convexPieces(facilities.flatMap(landmark => landmark.site.map(part => part.outer)));
  const accesses = convexPieces(
    facilities.flatMap(landmark =>
      landmark.accesses.flatMap(access => accessCorridor(access.points, access.widthMeters).map(part => part.outer))
    )
  );
  const protectedLand = convexPieces(
    (document.landmarks ?? [])
      .filter(landmark => !landmark.id.startsWith(PREFIX))
      .flatMap(landmark => [
        ...landmark.site.map(part => part.outer),
        ...landmark.accesses.flatMap(access =>
          accessCorridor(access.points, access.widthMeters).map(part => part.outer)
        )
      ])
  );
  const streets = [
    ...document.featureGroups.flatMap(group => {
      if (group.kind !== "road" && group.kind !== "plank") return [];
      return group.segments.flatMap(ref => {
        const edge = document.mesh.edges[ref.edgeId];
        const a = document.mesh.vertices[edge?.a]?.point;
        const b = document.mesh.vertices[edge?.b]?.point;
        return a && b ? [{ points: [a, b] as Point[], widthMeters: group.style.widthMeters }] : [];
      });
    }),
    ...lanes
  ];
  return {
    streets,
    streetIndex: indexPolygons(streetBands(document, lanes)),
    waterIndex: indexPolygons(water),
    protectedIndex: indexPolygons(protectedLand),
    siteIndex: indexPolygons(sites),
    accessIndex: indexPolygons(accesses)
  };
}

function buildableFaces(document: CityDocument) {
  return Object.values(document.mesh.faces).filter(
    face =>
      face.properties.buildable &&
      !face.properties.locked &&
      face.properties.water === "land" &&
      !BLOCKED_WARDS.has(face.properties.ward ?? "")
  );
}

function subtractGround(parts: Point[][], cuts: GroundCuts, extra: PlotIndex<Point[]>[] = []): Point[][] {
  let pieces = parts;
  for (const index of [
    cuts.streetIndex,
    cuts.waterIndex,
    cuts.protectedIndex,
    cuts.siteIndex,
    cuts.accessIndex,
    ...extra
  ])
    pieces = cutPieces(pieces, index);
  return pieces;
}

function componentFaces(document: CityDocument, faceIds: Id[]): Id[][] {
  const members = new Set(faceIds);
  const parent = new Map(faceIds.map(id => [id, id]));
  const find = (id: Id): Id => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const roadEdges = new Set<Id>();
  for (const group of document.featureGroups) {
    if (group.kind === "river") {
      for (let i = 1; i < group.vertices.length; i++) {
        const edge = edgeBetween(document.mesh, group.vertices[i - 1], group.vertices[i]);
        if (edge) roadEdges.add(edge.id);
      }
    } else if (group.kind === "road" || group.kind === "plank")
      for (const ref of group.segments) roadEdges.add(ref.edgeId);
  }
  for (const id of faceIds)
    for (const neighbor of faceNeighbors(document.mesh, id)) {
      if (!members.has(neighbor) || id >= neighbor) continue;
      const [start, end] = sharedVertex(document, id, neighbor);
      const edge = edgeBetween(document.mesh, start, end);
      if (!edge || edge.locked || roadEdges.has(edge.id)) continue;
      parent.set(find(id), find(neighbor));
    }
  const groups = new Map<Id, Id[]>();
  for (const id of faceIds) {
    const root = find(id);
    const group = groups.get(root) ?? [];
    group.push(id);
    groups.set(root, group);
  }
  return [...groups.values()].map(ids => ids.sort((a, b) => a.localeCompare(b)));
}

function sharedVertex(document: CityDocument, a: Id, b: Id): [Id, Id] {
  const face = document.mesh.faces[a];
  for (const ref of face?.boundary ?? []) {
    const edge = document.mesh.edges[ref.edgeId];
    const other = edge?.leftFace === a ? edge.rightFace : edge?.leftFace;
    if (other === b && edge) return [edge.a, edge.b];
  }
  return ["", ""];
}

function touchedFaceIds(document: CityDocument, cuts: GroundCuts): Id[] {
  return buildableFaces(document)
    .filter(face => {
      const parts = convexInfillParts(facePoints(document.mesh, face));
      return parts.some(part => {
        const near = [...cuts.siteIndex.query(bounds(part)), ...cuts.accessIndex.query(bounds(part))];
        return near.some(cut => plotArea(intersectConvex(part, cut)) > 0.2);
      });
    })
    .map(face => face.id);
}

function yardFor(polygon: Point[], faceId: Id, index: number, nearFacility: boolean, shared: boolean): OpenSpace {
  return {
    id: `facility-yard:${faceId}:${index}`,
    faceId,
    kind: nearFacility ? "workyard" : "backyard",
    polygon,
    access: shared ? "shared" : "private"
  };
}

function nearFacility(polygon: Point[], sites: PlotIndex<Point[]>): boolean {
  const box = bounds(polygon);
  const grown: [number, number, number, number] = [box[0] - 6, box[1] - 6, box[2] + 6, box[3] + 6];
  return sites.query(grown).some(site => {
    const center = polygonCentroid(polygon);
    return nearestOnPolyline(center, [...site, site[0]]).dist <= 6 || plotArea(intersectConvex(polygon, site)) > 0.05;
  });
}

/**
 * Fill empty land around population facilities with street-front house rows.
 * Existing buildings stay. Pieces too small or too narrow become yards.
 * BV footprints are not deformed.
 */
export function packFacilityResidualLots(
  document: CityDocument,
  buildings: readonly BuildingLot[],
  lanes: readonly Street[],
  openSpaces: readonly { polygon: Point[] }[] = []
): { buildings: BuildingLot[]; openSpaces: OpenSpace[] } {
  if (!facilityLandmarks(document).length) return { buildings: [], openSpaces: [] };
  const cuts = groundCuts(document, lanes);
  const occupied = indexPolygons(buildings.map(building => building.polygon));
  const openSpaceCuts = indexPolygons(openSpaces.map(space => space.polygon));
  const faceIds = touchedFaceIds(document, cuts);
  const lots: BuildingLot[] = [];
  const yards: OpenSpace[] = [];
  const seed = document.generationSeed ?? document.fabric?.seed ?? "facility-residual";
  let serial = 0;
  for (const component of componentFaces(document, faceIds)) {
    const face = document.mesh.faces[component[0]];
    let parts = component.flatMap(id => convexInfillParts(facePoints(document.mesh, document.mesh.faces[id])));
    parts = subtractGround(parts, cuts, [occupied, openSpaceCuts]);
    parts = mergeTouching(parts).sort((a, b) => {
      const left = polygonCentroid(a);
      const right = polygonCentroid(b);
      return left[0] - right[0] || left[1] - right[1];
    });
    const outskirts = face?.properties.settlement === "outskirts";
    const rng = makeRng(`${seed}:facility-residual:${component.join(",")}`);
    const options = {
      lotArea: dwellingLotArea(face?.properties.ward),
      coverage: outskirts ? 0.75 : 0.9,
      occupancy: 1,
      outskirts,
      attached: true,
      primaryEdges: [] as number[]
    };
    for (const part of parts) {
      let pending = [part];
      const spare: Point[][] = [];
      for (let pass = 0; pass < 2 && pending.length; pass++) {
        const next: Point[][] = [];
        for (const piece of pending) {
          const edges = usableLot(piece) ? accessibleEdges(piece, cuts.streets) : [];
          if (!edges.length) {
            spare.push(piece);
            continue;
          }
          options.primaryEdges = edges;
          const built = frontageBuildings(piece, edges, options, rng).filter(polygon => {
            if (!usableLot(polygon) || !pointInPolygon(polygonCentroid(polygon), piece)) return false;
            if (Math.abs(plotArea(intersectConvex(polygon, piece)) - plotArea(polygon)) > 0.5) return false;
            if (overlapsAny(polygon, occupied) || overlapsAny(polygon, cuts.siteIndex, 0.05)) return false;
            if (overlapsAny(polygon, cuts.accessIndex, 0.05) || overlapsAny(polygon, cuts.streetIndex, 0.05))
              return false;
            if (overlapsAny(polygon, cuts.waterIndex, 0.05) || overlapsAny(polygon, cuts.protectedIndex, 0.05))
              return false;
            return !buildingHitsCivicLandmark(document, polygon);
          });
          if (!built.length) {
            spare.push(piece);
            continue;
          }
          for (const polygon of built) {
            const owner =
              component.find(id =>
                convexInfillParts(facePoints(document.mesh, document.mesh.faces[id])).some(
                  cell => plotArea(intersectConvex(polygon, cell)) > plotArea(polygon) * 0.5
                )
              ) ?? component[0];
            lots.push({
              id: `facility-residual:${owner}:${serial++}`,
              faceId: owner,
              polygon,
              landmark: false,
              role: "main",
              uses: ["residential"]
            });
            occupied.add(polygon, bounds(polygon));
          }
          let left = [piece];
          for (const polygon of built) left = left.flatMap(item => subtractConvex(item, polygon, 0.4));
          next.push(...left.filter(item => plotArea(item) >= 4));
        }
        pending = next;
      }
      for (const piece of [...spare, ...pending]) {
        if (plotArea(piece) < 4) continue;
        const faceId =
          component.find(id =>
            pointInPolygon(polygonCentroid(piece), facePoints(document.mesh, document.mesh.faces[id]))
          ) ?? component[0];
        yards.push(
          yardFor(
            piece,
            faceId,
            yards.length,
            nearFacility(piece, cuts.siteIndex),
            accessibleEdges(piece, cuts.streets).length > 0
          )
        );
      }
    }
  }
  return { buildings: lots, openSpaces: yards };
}

function areaOf(parts: Point[][]): number {
  return parts.reduce((sum, part) => sum + plotArea(part), 0);
}

/** Classify empty land around the current buildings. Roads and required access are not remainder. */
export function facilityVacancy(
  document: CityDocument,
  buildings: readonly BuildingLot[],
  lanes: readonly Street[],
  openSpaces: readonly OpenSpace[] = []
): FacilityVacancy {
  const empty: FacilityVacancy = {
    buildableM2: 0,
    buildingM2: 0,
    facilitySiteM2: 0,
    requiredAccessM2: 0,
    yardM2: 0,
    shapeUnfitM2: 0,
    lotRemainderM2: 0,
    maxLotRemainderM2: 0,
    nearFacilityRemainderM2: 0,
    nearFacilityMaxM2: 0
  };
  if (!facilityLandmarks(document).length) return empty;
  const cuts = groundCuts(document, lanes);
  let ground = buildableFaces(document).flatMap(face => convexInfillParts(facePoints(document.mesh, face)));
  ground = cutPieces(ground, cuts.streetIndex);
  ground = cutPieces(ground, cuts.waterIndex);
  ground = cutPieces(ground, cuts.protectedIndex);
  const buildableM2 = areaOf(ground);
  const afterSites = cutPieces(ground, cuts.siteIndex);
  const afterAccess = cutPieces(afterSites, cuts.accessIndex);
  const buildingIndex = indexPolygons(buildings.map(building => building.polygon));
  const afterBuildings = cutPieces(afterAccess, buildingIndex);
  const yardIndex = indexPolygons(openSpaces.map(space => space.polygon));
  const leftovers = mergeTouching(cutPieces(afterBuildings, yardIndex));
  let shapeUnfitM2 = 0;
  let lotRemainderM2 = 0;
  let maxLotRemainderM2 = 0;
  const remainderPieces: Point[][] = [];
  for (const piece of leftovers) {
    const area = plotArea(piece);
    const frontage = accessibleEdges(piece, cuts.streets).length > 0;
    if (!usableLot(piece) || !frontage) shapeUnfitM2 += area;
    else {
      lotRemainderM2 += area;
      remainderPieces.push(piece);
    }
  }
  const mergedRemainder = mergeTouching(remainderPieces);
  maxLotRemainderM2 = mergedRemainder.reduce((max, piece) => Math.max(max, plotArea(piece)), 0);
  let nearFacilityRemainderM2 = 0;
  let nearFacilityMaxM2 = 0;
  for (const piece of mergedRemainder) {
    const area = plotArea(piece);
    const center = polygonCentroid(piece);
    const box = bounds(piece);
    const near = cuts.siteIndex
      .query([box[0] - 20, box[1] - 20, box[2] + 20, box[3] + 20])
      .some(site => nearestOnPolyline(center, [...site, site[0]]).dist <= 20);
    if (!near) continue;
    nearFacilityRemainderM2 += area;
    nearFacilityMaxM2 = Math.max(nearFacilityMaxM2, area);
  }
  return {
    buildableM2,
    buildingM2: areaOf(afterAccess) - areaOf(afterBuildings),
    facilitySiteM2: buildableM2 - areaOf(afterSites),
    requiredAccessM2: areaOf(afterSites) - areaOf(afterAccess),
    yardM2: areaOf(afterBuildings) - areaOf(leftovers),
    shapeUnfitM2,
    lotRemainderM2,
    maxLotRemainderM2,
    nearFacilityRemainderM2,
    nearFacilityMaxM2
  };
}

import { planBox, planBoxCorners, rotationFromFacing } from "../../buildings/placementContract";
import { placementFootprint } from "../../buildings/placementModels";
import type { MarketSite } from "../types/contracts/market";
import type { CityDocument, CityElement, Point } from "../types/document";
import { aerialLandmarkFootprints } from "./aerialFootprints";
import { buildBlockFabric } from "./blockInfill";
import { buildCityBuildings } from "./buildingLots";
import { orientedRectCorners, templeRectForElement } from "./civicPlacement";
import { FixedRoadReservation } from "./fixedRoadReservation";
import { boundaryEdges, boundaryRings, polygonOverlaps, refPoints } from "./fortifications";
import { commitPlacement } from "./freeform/commitPlacement";
import {
  isSimplePolygon,
  nearestOnPolyline,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  segmentSegmentHit
} from "./geom";
import { landmarkReservationHits } from "./landmarks";
import { convexInfillParts, insetConvexKernel, longestFrame } from "./lotGeometry";
import { MoatReservation } from "./moats";
import { bounds, boundsOverlap, corridor, PlotIndex } from "./parcelGeometry";
import { townExtentMeters } from "./settlementExtent";
import { cityTerrain } from "./terrainElevation";
import { classifyTownWater } from "./townWater";
import { documentWaterTest } from "./waterGeometry";

const PRODUCE = "market-produce-stall";
const CLOTH = "market-goods-booth";
const STALL_LIMIT = 6;
const AISLE_WIDTH = 4;
const PLOT_MARGIN = 1.2;
const EDGE_WALK = 2;

export type MarketPlacementReason = "plaza" | "field" | "existing" | "space" | "freeform" | "locked";
export interface MarketPlacementResult {
  document: CityDocument;
  placed: number;
  reason?: MarketPlacementReason;
}

/** One explicit plaza per click. Reloads and redraws never call this planner. */
export function placePlazaMarket(document: CityDocument, plazaId?: string): MarketPlacementResult {
  const fail = (reason: MarketPlacementReason): MarketPlacementResult => ({ document, placed: 0, reason });
  if (document.freeform) return fail("freeform");
  if ((document.markets?.length ?? 0) >= 128) return fail("space");
  const plaza = document.elements
    .filter(item => item.kind === "plaza" && (!plazaId || item.id === plazaId))
    .sort(
      (a, b) => Math.hypot(...(a.point ?? [0, 0])) - Math.hypot(...(b.point ?? [0, 0])) || a.id.localeCompare(b.id)
    )[0];
  if (!plaza) return fail("plaza");
  if (plaza.locked) return fail("locked");
  if (document.markets?.some(market => market.anchorElementId === plaza.id)) return fail("existing");
  if (!document.terrain?.field) return fail("field");
  const boundary = plazaBoundary(document, plaza);
  if (!boundary) return fail("space");
  const center = polygonCentroid(boundary);
  const frame = longestFrame(boundary);
  const u = frame.axis;
  const v: Point = [-u[1], u[0]];
  const project = (point: Point, axis: Point) => (point[0] - center[0]) * axis[0] + (point[1] - center[1]) * axis[1];
  const range = (axis: Point) => {
    const values = boundary.map(point => project(point, axis));
    return [Math.min(...values), Math.max(...values)];
  };
  const [u0, u1] = range(u);
  const [v0, v1] = range(v);
  const at = (x: number, y: number): Point => [center[0] + u[0] * x + v[0] * y, center[1] + u[1] * x + v[1] * y];
  const accessPaths: Point[][] = [];
  const accessTargets: Point[] = [];
  const fabric = buildBlockFabric(document);
  const reservations: Point[][] = [];
  const solids: Point[][] = [];
  const reservationKeys = new Set<string>();
  const solidKeys = new Set<string>();
  const solidIndex = new PlotIndex<Point[]>();
  const index = new PlotIndex<Point[]>();
  const localBounds = bounds(boundary).map((value, i) => value + (i < 2 ? -12 : 12)) as ReturnType<typeof bounds>;
  const reserve = (polygon: Point[], solid = false) => {
    if (polygon.length < 3 || !boundsOverlap(localBounds, bounds(polygon))) return;
    const key = JSON.stringify(polygon);
    if (!reservationKeys.has(key)) {
      reservationKeys.add(key);
      reservations.push(polygon);
      index.add(polygon, bounds(polygon));
    }
    if (solid && !solidKeys.has(key)) {
      solidKeys.add(key);
      solids.push(polygon);
      solidIndex.add(polygon, bounds(polygon));
    }
  };
  const reserveLine = (line: Point[], width: number, solid = false) => {
    for (let i = 1; i < line.length; i++) reserve(corridor(line[i - 1], line[i], width, width / 2), solid);
  };
  const closedBoundary = [...boundary, boundary[0]];
  const access = (point: Point) => {
    if (nearestOnPolyline(point, closedBoundary).dist > 8 && !pointInPolygon(point, boundary)) return;
    if (!accessTargets.some(other => Math.hypot(other[0] - point[0], other[1] - point[1]) < 0.5))
      accessTargets.push(point);
  };
  for (const lot of [...fabric.buildings, ...buildCityBuildings(document)]) reserve(lot.polygon, true);
  for (const lane of fabric.lanes) {
    reserveLine(lane.points, lane.widthMeters + 1);
    for (let segment = 1; segment < lane.points.length; segment++) {
      const a = lane.points[segment - 1],
        b = lane.points[segment];
      for (let i = 0; i < boundary.length; i++) {
        const hit = segmentSegmentHit(a, b, boundary[i], boundary[(i + 1) % boundary.length]);
        if (hit) access([a[0] + (b[0] - a[0]) * hit.t, a[1] + (b[1] - a[1]) * hit.t]);
      }
    }
  }
  for (const faceId of plaza.faceIds) for (const point of fabric.entrances.get(faceId) ?? []) access(point);
  for (const group of document.featureGroups) {
    if (group.kind === "river") continue;
    for (const ref of group.segments) {
      const edge = document.mesh.edges[ref.edgeId];
      if (!edge) continue;
      const a = document.mesh.vertices[edge.a].point;
      const b = document.mesh.vertices[edge.b].point;
      reserveLine([a, b], group.style.widthMeters + 1, group.kind === "wall");
      if (group.kind !== "road") continue;
      for (let i = 0; i < boundary.length; i++) {
        const hit = segmentSegmentHit(a, b, boundary[i], boundary[(i + 1) % boundary.length]);
        if (hit) access([a[0] + (b[0] - a[0]) * hit.t, a[1] + (b[1] - a[1]) * hit.t]);
      }
    }
  }
  for (const way of document.terrain.ways ?? []) reserveLine(way.centerline, way.widthMeters + 1);
  for (const road of document.frameRoads ?? [])
    for (const piece of road.pieces) reserveLine(piece.points, AISLE_WIDTH + 2);
  // The plain legacy view has no aerial plan and draws a basin at each plaza anchor.
  const detailedView =
    document.populationPlan ||
    document.urbanMorphology ||
    document.buildingPattern === "medieval" ||
    document.fabric?.version === 5 ||
    document.gridKind === "evolution" ||
    ["circulade", "bram", "classic"].includes(document.layout ?? "") ||
    Object.values(document.mesh.faces).some(
      face => face.properties.water === "land" && face.properties.ward === "harbor"
    );
  const aerial = detailedView ? fabric.aerialLandmarks : undefined;
  if (aerial) {
    for (const polygon of aerialLandmarkFootprints(aerial)) reserve(polygon, true);
    for (const water of aerial.domesticWater) {
      reserve(water.footprint, true);
      reserveLine(water.access, AISLE_WIDTH);
      if (water.access.length) access(water.access.at(-1)!);
    }
  } else if (plaza.point) {
    // Older layouts render a public basin at the plaza anchor.
    reserve(square(plaza.point, 4), true);
  }
  for (const item of document.elements) {
    if (!item.point || item.id === plaza.id) continue;
    if (item.kind === "object" && item.objectType) {
      const footprint = placementFootprint(item.objectType, item.objectQuality);
      if (footprint) {
        const scale = item.objectScale ?? 1;
        reserve(
          planBoxCorners(
            planBox(
              item.point,
              { halfX: footprint.halfX * scale + 1, halfZ: footprint.halfZ * scale + 1 },
              item.rotation ?? 0
            )
          ),
          true
        );
      }
    } else if (item.kind === "temple") {
      reserve(
        orientedRectCorners(
          templeRectForElement(
            item.point,
            item.sizeMeters,
            item.rotation,
            townExtentMeters(document.frame),
            item.templeType
          )
        ),
        true
      );
      const rect = templeRectForElement(
        item.point,
        item.sizeMeters,
        item.rotation,
        townExtentMeters(document.frame),
        item.templeType
      );
      access([
        item.point[0] - Math.cos(rect.rotation) * (rect.length / 2 + 3),
        item.point[1] - Math.sin(rect.rotation) * (rect.length / 2 + 3)
      ]);
    } else if (item.kind !== "plaza") {
      reserve(square(item.point, Math.max(4, (item.sizeMeters ?? 8) / 2)), true);
    }
  }
  for (const landmark of document.landmarks ?? []) {
    for (const part of landmark.site) reserve(part.outer, true);
    for (const path of landmark.accesses) reserveLine(path.points, Math.max(AISLE_WIDTH, path.widthMeters));
  }
  for (const cemetery of document.cemeteries ?? []) reserve(cemetery.boundary, true);
  for (const market of document.markets ?? []) {
    reserve(market.boundary);
    for (const path of market.accessPaths) reserveLine(path, AISLE_WIDTH);
  }
  for (const part of classifyTownWater(document).parts) reserve(part.polygon, true);
  for (const feature of document.terrain.features) {
    if (feature.kind !== "riverCorridor") continue;
    for (let i = 1; i < feature.centerline.length; i++) {
      const width = Math.max(feature.widthsMeters[i - 1] ?? 0, feature.widthsMeters[i] ?? 0);
      reserveLine([feature.centerline[i - 1], feature.centerline[i]], width, true);
    }
  }
  const moats = new MoatReservation(document, 1);
  const terrain = cityTerrain(document);
  const isWet = documentWaterTest(document);
  const clearAccess = (line: Point[]) => {
    for (let i = 1; i < line.length; i++) {
      const strip = corridor(line[i - 1], line[i], AISLE_WIDTH);
      if (
        solidIndex.query(bounds(strip)).some(solid => polygonOverlaps(strip, solid)) ||
        moats.hitsPolygon(strip) ||
        isWet(strip)
      )
        return false;
      const a = line[i - 1],
        b = line[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(length));
      let previous = terrain.heightAt(a);
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const height = terrain.heightAt([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        if (Math.abs(height - previous) > (length / steps) * 0.1 + 1e-5) return false;
        previous = height;
      }
    }
    return true;
  };
  const hub = [0, 4, -4, 8, -8]
    .flatMap(x => [0, 4, -4, 8, -8].map(y => at(x, y)))
    .sort((a, b) => Math.hypot(a[0] - center[0], a[1] - center[1]) - Math.hypot(b[0] - center[0], b[1] - center[1]))
    .find(
      point =>
        square(point, 2.1).every(p => pointInPolygon(p, boundary)) &&
        !solidIndex.query(bounds(square(point, 2.1))).some(solid => polygonOverlaps(square(point, 2.1), solid)) &&
        !isWet(square(point, 2.1))
    );
  if (!hub || accessTargets.length > 128) return fail("space");
  const edgeTargets: Point[] = [];
  for (const [a, b] of [
    [at(u0 - 1, 0), at(u1 + 1, 0)],
    [at(0, v0 - 1), at(0, v1 + 1)]
  ]) {
    for (let i = 0; i < boundary.length; i++) {
      const hit = segmentSegmentHit(a, b, boundary[i], boundary[(i + 1) % boundary.length]);
      if (hit) edgeTargets.push([a[0] + (b[0] - a[0]) * hit.t, a[1] + (b[1] - a[1]) * hit.t]);
    }
  }
  for (const target of [...edgeTargets, ...accessTargets]) {
    if (Math.hypot(target[0] - hub[0], target[1] - hub[1]) < 0.1) continue;
    const route = accessRoute(target, hub, boundary, solids, clearAccess);
    if (!route) return fail("space");
    accessPaths.push(route);
    reserveLine(route, AISLE_WIDTH);
  }
  const fixedRoads = new FixedRoadReservation(document);
  const footprint = placementFootprint(PRODUCE, "high")!;
  const halfU = footprint.halfX + PLOT_MARGIN;
  const halfV = footprint.halfZ + PLOT_MARGIN;
  const step = halfU * 2 + 0.2;
  const columns = Math.min(32, Math.ceil((u1 - u0) / step));
  const offsets = Array.from({ length: columns * 2 + 1 }, (_, i) => (i - columns) * step).sort(
    (a, b) => Math.abs(a) - Math.abs(b) || a - b
  );
  let current = document;
  const stallElementIds: string[] = [];
  const marketId = `plaza-market:${plaza.id}`;
  for (const x of offsets) {
    for (const side of [-1, 1]) {
      if (stallElementIds.length >= STALL_LIMIT) break;
      const y = side < 0 ? v0 + halfV + EDGE_WALK : v1 - halfV - EDGE_WALK;
      const facing = (Math.atan2(-side * v[0], -side * v[1]) * 180) / Math.PI;
      const position = at(x, y);
      const modelId = stallElementIds.length < 4 ? PRODUCE : CLOTH;
      const modelFootprint = placementFootprint(modelId, "high")!;
      const plot = planBoxCorners(
        planBox(
          position,
          { halfX: modelFootprint.halfX + PLOT_MARGIN, halfZ: modelFootprint.halfZ + PLOT_MARGIN },
          rotationFromFacing("+z", facing)
        )
      );
      if (!plot.every(point => pointInPolygon(point, boundary))) continue;
      if (index.query(bounds(plot)).some(polygon => polygonOverlaps(plot, polygon))) continue;
      if (fixedRoads.hitsPolygon(plot) || moats.hitsPolygon(plot) || landmarkReservationHits(document, plot)) continue;
      const id = `${marketId}:stall-${stallElementIds.length + 1}`;
      if (document.elements.some(item => item.id === id)) continue;
      const result = commitPlacement(current, {
        id,
        modelId,
        quality: "high",
        position,
        facingDegrees: (facing + 360) % 360,
        footprint: modelFootprint,
        marginMeters: PLOT_MARGIN
      });
      // A temporary market must not introduce a retaining wall or steep earthwork.
      if (!result.preview.ok || result.preview.edge.kind !== "slope" || result.preview.edge.runMeters > 0.5) continue;
      current = result.document;
      stallElementIds.push(id);
    }
    if (stallElementIds.length >= STALL_LIMIT) break;
  }
  if (!stallElementIds.length) return fail("space");
  const market: MarketSite = {
    version: 1,
    id: marketId,
    setting: "plaza",
    anchorElementId: plaza.id,
    boundary,
    accessPaths,
    reservedAreas: reservations,
    stallElementIds
  };
  return { document: { ...current, markets: [...(document.markets ?? []), market] }, placed: stallElementIds.length };
}

/** One convex component: concavities, holes and disconnected plazas never get bridged by a stall. */
function plazaBoundary(document: CityDocument, plaza: CityElement): Point[] | null {
  let parts: Point[][];
  if (plaza.faceIds.length) {
    if (plaza.faceIds.some(id => document.mesh.faces[id]?.properties.water !== "land")) return null;
    const rings = boundaryRings(document.mesh, boundaryEdges(document.mesh, plaza.faceIds));
    if (rings.length !== 1) return null;
    const ring = refPoints(document.mesh, rings[0]);
    if (!isSimplePolygon(ring)) return null;
    parts = convexInfillParts(ring);
  } else {
    if (!plaza.point || !Number.isFinite(plaza.sizeMeters) || !(plaza.sizeMeters! > 0)) return null;
    // Inscribed in the declared diameter; do not guess a default size for a point-only marker.
    parts = [square(plaza.point, plaza.sizeMeters! / (2 * Math.SQRT2))];
  }
  const part = parts.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))[0];
  if (!part) return null;
  const half = document.frame.extentMeters / 2;
  const boundary = insetConvexKernel(
    part,
    part.map(() => 0.1)
  );
  return boundary.length >= 3 && boundary.every(point => Math.abs(point[0]) <= half && Math.abs(point[1]) <= half)
    ? boundary
    : null;
}

function square(point: Point, half: number): Point[] {
  return [
    [point[0] - half, point[1] - half],
    [point[0] + half, point[1] - half],
    [point[0] + half, point[1] + half],
    [point[0] - half, point[1] + half]
  ];
}

/** Shortest visibility route around conservative obstacle boxes. Never cuts through a well. */
function accessRoute(
  start: Point,
  end: Point,
  boundary: Point[],
  solids: Point[][],
  clear: (line: Point[]) => boolean
): Point[] | null {
  if (clear([start, end])) return [start, end];
  const nodes: Point[] = [start, end];
  for (const solid of solids) {
    const [x0, y0, x1, y1] = bounds(solid);
    for (const point of [
      [x0 - 2.2, y0 - 2.2],
      [x0 - 2.2, y1 + 2.2],
      [x1 + 2.2, y0 - 2.2],
      [x1 + 2.2, y1 + 2.2]
    ] as Point[]) {
      if (pointInPolygon(point, boundary)) nodes.push(point);
    }
  }
  if (nodes.length > 256) return null;
  const costs = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const done = new Set<number>();
  costs[0] = 0;
  while (true) {
    let best = -1;
    for (let i = 0; i < nodes.length; i++) if (!done.has(i) && (best < 0 || costs[i] < costs[best])) best = i;
    if (best < 0 || !Number.isFinite(costs[best])) return null;
    if (best === 1) {
      const route = [nodes[1]];
      for (let i = previous[1]; i >= 0; i = previous[i]) route.push(nodes[i]);
      return route.reverse();
    }
    done.add(best);
    for (let i = 0; i < nodes.length; i++) {
      if (done.has(i)) continue;
      const cost = costs[best] + Math.hypot(nodes[i][0] - nodes[best][0], nodes[i][1] - nodes[best][1]);
      if (cost >= costs[i] || !clear([nodes[best], nodes[i]])) continue;
      costs[i] = cost;
      previous[i] = best;
    }
  }
}

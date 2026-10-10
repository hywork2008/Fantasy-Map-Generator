import { FixedRoadReservation } from "../fixedRoadReservation";
import { facePoints } from "../mesh";
import { MoatReservation } from "../moats";
import type { CityDocument, Point } from "../types";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "./geom";

export interface DomesticWaterPoint {
  id: string;
  kind: "well" | "cistern" | "spring" | "pond";
  name: string;
  center: Point;
  radius: number;
  footprint: Point[];
  access: Point[];
  placement: "plaza" | "neighborhood" | "outskirts";
  use: "domestic" | "service";
}

/** Uses the finished fabric: water points never consume a dwelling or sever a street. */
export interface WaterSite {
  document: CityDocument;
  inFrame(polygon: Point[]): boolean;
  hitsWater(polygon: Point[], clearance?: number): boolean;
  hitsRoutes(polygon: Point[], clearance: number, kinds?: Array<"road" | "wall" | "river">): boolean;
  hitsBlocked(polygon: Point[]): boolean;
  buildingsIn(polygon: Point[], clearance?: number): unknown[];
  hitsLanes(polygon: Point[]): boolean;
  farmsIn(polygon: Point[]): unknown[];
  claim(polygon: Point[]): void;
}

function ring(center: Point, radius: number): Point[] {
  // Circumscribed so the clearance contains the circular rendered basin.
  return Array.from({ length: 12 }, (_, i): Point => {
    const a = (i * Math.PI * 2) / 12;
    const r = radius / Math.cos(Math.PI / 12);
    return [center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r];
  });
}

export function placeDomesticWater(
  site: WaterSite,
  routes: Array<{ points: Point[]; widthMeters: number }>,
  buildingCount: number
): DomesticWaterPoint[] {
  const document = site.document;
  const moat = new MoatReservation(document, 1);
  const fixedRoads = new FixedRoadReservation(document);
  const result: DomesticWaterPoint[] = [];
  const dry = (polygon: Point[]) => site.inFrame(polygon) && !site.hitsWater(polygon, 2) && !moat.hitsPolygon(polygon);
  const free = (polygon: Point[]) =>
    dry(polygon) &&
    !site.hitsRoutes(polygon, 0.5) &&
    !fixedRoads.hitsPolygon(polygon) &&
    !site.hitsBlocked(polygon) &&
    !site.buildingsIn(polygon, 0.5).length &&
    !site.hitsLanes(polygon) &&
    !site.farmsIn(polygon).length;
  const sourcePoints = document.featureGroups.flatMap(group =>
    group.kind === "river" && group.source?.kind === "spring"
      ? [document.mesh.vertices[group.source.vertexId]?.point].filter((p): p is Point => !!p)
      : []
  );
  const add = (center: Point, placement: DomesticWaterPoint["placement"], preferred: DomesticWaterPoint["kind"]) => {
    const kind =
      preferred === "well" && sourcePoints.some(p => Math.hypot(p[0] - center[0], p[1] - center[1]) < 12)
        ? "spring"
        : preferred;
    const radius = kind === "pond" ? 5 : kind === "cistern" ? 2 : 1.2;
    const footprint = ring(center, radius + 1);
    if (!free(footprint)) return false;
    let access: Point[] | undefined;
    for (const route of routes) {
      const hit = nearestOnPolyline(center, route.points);
      if (hit.dist < radius + route.widthMeters / 2 + 1 || hit.dist > (placement === "plaza" ? 45 : 12)) continue;
      const path: Point[] = [center, hit.point];
      // A one-metre walking corridor may meet a street but cannot cross houses, walls or water.
      const dx = hit.point[0] - center[0],
        dy = hit.point[1] - center[1];
      const len = Math.hypot(dx, dy);
      const nx = (-dy / len) * 0.5,
        ny = (dx / len) * 0.5;
      const corridor: Point[] = [
        [center[0] + nx, center[1] + ny],
        [hit.point[0] + nx, hit.point[1] + ny],
        [hit.point[0] - nx, hit.point[1] - ny],
        [center[0] - nx, center[1] - ny]
      ];
      if (
        !dry(corridor) ||
        site.hitsRoutes(corridor, 0.2, ["wall"]) ||
        site.hitsBlocked(corridor) ||
        site.buildingsIn(corridor, 0.3).length ||
        site.farmsIn(corridor).length
      )
        continue;
      access = path;
      break;
    }
    if (!access) return false;
    site.claim(footprint);
    result.push({
      id: `domestic-water-${result.length}`,
      kind,
      name: {
        well: "Community Well",
        cistern: "Rainwater Cistern",
        spring: "Spring Basin",
        pond: "Service Water Pond"
      }[kind],
      center,
      radius,
      footprint,
      access,
      placement,
      use: kind === "pond" ? "service" : "domestic"
    });
    return true;
  };
  const faces = Object.values(document.mesh.faces).filter(
    f =>
      f.properties.water === "land" &&
      f.properties.settlement &&
      ["market", "merchant", "craftsmen", "patriciate", "empty", "farm"].includes(f.properties.ward ?? "")
  );
  const candidates = faces.flatMap(face => {
    const polygon = facePoints(document.mesh, face);
    const c = polygonCentroid(polygon);
    // Sample vacant ground across each block, including its street-facing edge.
    return [
      c,
      ...polygon.flatMap((p, i) => {
        const next = polygon[(i + 1) % polygon.length];
        const middle: Point = [(p[0] + next[0]) / 2, (p[1] + next[1]) / 2];
        return [0.25, 0.5, 0.75].map(t => [middle[0] * (1 - t) + c[0] * t, middle[1] * (1 - t) + c[1] * t] as Point);
      })
    ].map(center => ({ center, face, polygon }));
  });
  for (const plaza of document.elements.filter(e => e.kind === "plaza" && e.point)) {
    const center = plaza.point!;
    const r = Math.max(3, (plaza.sizeMeters ?? 16) * 0.3);
    for (const p of [center, ...ring(center, r)]) {
      if (Math.hypot(p[0] - center[0], p[1] - center[1]) > (plaza.sizeMeters ?? 16) / 2) continue;
      if (add(p, "plaza", "well")) break;
    }
  }
  const target = Math.min(64, Math.max(1, Math.ceil(buildingCount / 80)));
  for (const { center, face, polygon } of candidates) {
    if (result.filter(p => p.use === "domestic").length >= target) break;
    if (
      face.properties.ward === "farm" ||
      result.some(p => Math.hypot(p.center[0] - center[0], p.center[1] - center[1]) < 55)
    )
      continue;
    if (!ring(center, 3.1).every(p => pointInPolygon(p, polygon))) continue;
    add(center, "neighborhood", result.filter(p => p.use === "domestic").length % 4 === 3 ? "cistern" : "well");
  }
  // Small rain-fed storage basins on the settled periphery, never drinking-water claims.
  for (const { center, face, polygon } of candidates) {
    if (buildingCount < 80 || result.some(p => p.kind === "pond")) break;
    if (face.properties.settlement !== "outskirts" || !ring(center, 6.1).every(p => pointInPolygon(p, polygon)))
      continue;
    add(center, "outskirts", "pond");
  }
  return result;
}

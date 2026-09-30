import { featureGroupVertices } from "../features";
import { facePoints } from "../mesh";
import type { CityDocument, Point } from "../types";
import { evaluateApproachBeyond, externalGateRoads, normalizeApproachBeyond } from "./approachBeyond";
import type { DistrictFabric } from "./blockInfill";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";

type Profile = "trade" | "granary" | "frontier" | "rural";
interface Approach {
  points: Point[];
  profile: Profile;
  clearance: number;
  length: number;
}

/** Apply the land-use bands to existing mesh-owned lots. No new street or
 * rectangular field geometry is laid over the block and farm systems. */
export function shapeSuburbanFabric(document: CityDocument, fabric: DistrictFabric): DistrictFabric {
  const walls = document.featureGroups.flatMap(g =>
    g.kind === "wall"
      ? g.segments.map(ref => {
          const edge = document.mesh.edges[ref.edgeId];
          return [document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point];
        })
      : []
  );
  const approaches: Approach[] = externalGateRoads(document).flatMap(({ group }) => {
    const vertices = featureGroupVertices(document, group);
    const points = vertices.map(id => document.mesh.vertices[id]?.point).filter((p): p is Point => !!p);
    if (points.length < 2) return [];
    const norm = normalizeApproachBeyond(group.beyond);
    const assessment = evaluateApproachBeyond(group.beyond, {
      extentMeters: document.frame.extentMeters,
      hasWalls: walls.length > 0
    });
    const profile: Profile =
      assessment?.defenseLevel === "high" || assessment?.defenseLevel === "critical"
        ? "frontier"
        : norm?.settlement.role === "granary" || norm?.settlement.scale === "village"
          ? "granary"
          : assessment?.utilityLevel === "high" || assessment?.utilityLevel === "critical"
            ? "trade"
            : "rural";
    // The gate endpoint is the one farther from the map boundary.
    const boundaryDistance = (p: Point) => document.frame.extentMeters / 2 - Math.max(Math.abs(p[0]), Math.abs(p[1]));
    if (boundaryDistance(points[0]) < boundaryDistance(points.at(-1)!)) points.reverse();
    return [
      {
        points,
        profile,
        clearance: profile === "frontier" ? 70 : profile === "rural" ? 30 : 25,
        length: profile === "trade" ? 200 : profile === "granary" ? 50 : 60
      }
    ];
  });
  if (!approaches.length) return fabric;
  const wallDistance = (p: Point) =>
    walls.length ? Math.min(...walls.map(segment => nearestOnPolyline(p, segment).dist)) : Infinity;
  const nearest = (p: Point) =>
    approaches
      .map(road => ({
        road,
        distance: nearestOnPolyline(p, road.points).dist,
        gateDistance: Math.hypot(p[0] - road.points[0][0], p[1] - road.points[0][1])
      }))
      .sort((a, b) => a.distance - b.distance)[0];
  const outskirts = (id: string) => document.mesh.faces[id]?.properties.settlement === "outskirts";
  const buildings = fabric.buildings.filter(building => {
    if (!outskirts(building.faceId)) return true;
    const center = polygonCentroid(building.polygon);
    const near = nearest(center);
    if (
      !near ||
      near.road.profile === "frontier" ||
      near.distance > 20 ||
      near.gateDistance < near.road.clearance ||
      near.gateDistance > near.road.clearance + near.road.length ||
      wallDistance(center) < near.road.clearance
    )
      return false;
    // Keep only modest, existing face-owned roadside lots. A union block can
    // otherwise yield a house larger than the homes inside the wall.
    const area = Math.abs(polygonArea(building.polygon));
    if (area > 220 || area < 20) return false;
    if (building.polygon.some(p => wallDistance(p) < near.road.clearance)) return false;
    const spacing = near.road.profile === "trade" ? 0.62 : near.road.profile === "granary" ? 0.24 : 0.2;
    const hash = [...`${building.faceId}:${center[0].toFixed(1)}:${center[1].toFixed(1)}`].reduce(
      (n, c) => (n * 33 + c.charCodeAt(0)) >>> 0,
      5381
    );
    return hash / 0xffffffff < spacing;
  });
  const farms = fabric.farms.filter(farm => {
    const face = document.mesh.faces[farm.faceId];
    if (!face || face.properties.settlement !== "outskirts") return true;
    const center = polygonCentroid(farm.polygon);
    const near = nearest(center);
    if (
      !near ||
      near.road.profile === "frontier" ||
      wallDistance(center) < near.road.clearance ||
      near.gateDistance < near.road.clearance
    )
      return false;
    const min = near.road.profile === "granary" ? 20 : 35;
    const max = near.road.profile === "granary" ? 155 : near.road.profile === "trade" ? 150 : 115;
    return (
      near.distance >= min &&
      near.distance <= max &&
      farm.polygon.every(
        p => pointInPolygon(p, facePoints(document.mesh, face)) && wallDistance(p) >= near.road.clearance
      )
    );
  });
  return { ...fabric, buildings, farms, lanes: fabric.lanes.filter(lane => !outskirts(lane.faceId)) };
}

import { edgeBetween, facePoints } from "../mesh";
import type { CityDocument, Id, Point } from "../types";
import { laneHitsCivicLandmark } from "./buildingLots";
import { districtDocument, resolveDistricts, upgradeFabricPlan } from "./fabricDistricts";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { buildLocalFabric, type CityFabric, chord, convexInfillParts, FabricCache, type FarmPlot } from "./localInfill";
import { insetConvexKernel } from "./lotGeometry";

export type { CityFabric, FarmPlot, InfillLane } from "./localInfill";
export { convexInfillParts, FabricCache } from "./localInfill";
export interface DistrictFabric extends CityFabric {
  farms: FarmPlot[];
}
let defaultCache: FabricCache | null = null;
function getDefaultCache(): FabricCache {
  if (!defaultCache) {
    defaultCache = new FabricCache();
  }
  return defaultCache;
}

/** Cell IDs remain editing ownership; the building polygon may span several cells in its district. */
export function buildBlockFabric(document: CityDocument, cache = getDefaultCache()): DistrictFabric {
  if (!document.fabric) return { ...buildLocalFabric(document), farms: [] };
  const plan = upgradeFabricPlan(document)!;
  const districts = resolveDistricts(document, plan);
  const merged = districtDocument(document, districts);
  const local = buildLocalFabric(merged, {
    seed: plan.seed,
    parameters: new Map(districts.map(d => [d.id, d.parameters])),
    cache
  });
  const members = new Map(districts.map(d => [d.id, d.faceIds]));
  const polygons = new Map(Object.values(document.mesh.faces).map(f => [f.id, facePoints(document.mesh, f)]));
  const owner = (id: Id, p: Point) => {
    const ids = members.get(id)!;
    return ids.find(id => pointInPolygon(p, polygons.get(id)!)) ?? ids[0];
  };
  const buildings = local.buildings.map(b => ({ ...b, faceId: owner(b.faceId, polygonCentroid(b.polygon)) }));
  const lanes = local.lanes
    .filter(l => !laneHitsCivicLandmark(document, l.points))
    .map(l => ({ ...l, faceId: owner(l.faceId, l.points[0]) }));
  const entrances = new Map<Id, Point[]>();
  for (const [id, points] of local.entrances)
    for (const p of points) {
      const faceId = owner(id, p);
      entrances.set(faceId, [...(entrances.get(faceId) ?? []), p]);
    }
  // Farm detail is also derived; rows never become mesh edges or route features.
  const farms: FarmPlot[] = [];
  const rivers = document.featureGroups
    .filter(g => g.kind === "river")
    .flatMap(g =>
      g.vertices.slice(1).map((v, i) => ({
        points: [document.mesh.vertices[g.vertices[i]].point, document.mesh.vertices[v].point],
        width: g.style.widthMeters
      }))
    );
  const setbacks = new Map<Id, number>();
  for (const group of merged.featureGroups) {
    const ids =
      group.kind === "river"
        ? group.vertices.slice(1).flatMap((v, i) => {
            const e = edgeBetween(merged.mesh, group.vertices[i], v);
            return e ? [e.id] : [];
          })
        : group.segments.map(s => s.edgeId);
    for (const id of ids) setbacks.set(id, Math.max(setbacks.get(id) ?? 8, group.style.widthMeters / 2 + 4));
  }
  for (const district of districts) {
    const face = merged.mesh.faces[district.id];
    if (face.properties.water !== "land" || face.properties.ward !== "farm") continue;
    const outline = facePoints(merged.mesh, face);
    const nearby = rivers.filter(r => {
      const xs = outline.map(p => p[0]),
        ys = outline.map(p => p[1]);
      const rx = r.points.map(p => p[0]),
        ry = r.points.map(p => p[1]),
        margin = r.width / 2 + 4;
      return (
        Math.min(...rx) <= Math.max(...xs) + margin &&
        Math.max(...rx) >= Math.min(...xs) - margin &&
        Math.min(...ry) <= Math.max(...ys) + margin &&
        Math.max(...ry) >= Math.min(...ys) - margin
      );
    });
    const key = JSON.stringify([
      "farm-v2",
      district.id,
      outline,
      district.parameters,
      face.boundary.map(ref => setbacks.get(ref.edgeId)),
      nearby
    ]);
    const cached = cache.get(key);
    if (cached?.farms) {
      farms.push(...cached.farms);
      continue;
    }
    const plots: FarmPlot[] = [];
    for (const part of convexInfillParts(outline)) {
      const polygon = insetConvexKernel(
        part,
        part.map((a, i) => {
          const b = part[(i + 1) % part.length];
          const ref = face.boundary.find(
            (_, k) =>
              nearestOnPolyline(a, [outline[k], outline[(k + 1) % outline.length]]).dist < 1e-5 &&
              nearestOnPolyline(b, [outline[k], outline[(k + 1) % outline.length]]).dist < 1e-5
          );
          return ref ? (setbacks.get(ref.edgeId) ?? 8) : 3;
        })
      );
      if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 150) continue;
      const normal: Point = [Math.cos(district.parameters.orientation), Math.sin(district.parameters.orientation)];
      const values = polygon.map(p => p[0] * normal[0] + p[1] * normal[1]);
      const min = Math.min(...values),
        max = Math.max(...values);
      const rows: Point[][] = [];
      // At most 100 strokes per plot, independent of city dimensions.
      const spacing = Math.max(6, (max - min) / 100);
      for (let offset = min + spacing; offset < max; offset += spacing) {
        const row = chord(polygon, normal, offset);
        if (row && !nearby.some(r => row.some(p => nearestOnPolyline(p, r.points).dist < r.width / 2 + 4)))
          rows.push(row);
      }
      plots.push({ faceId: district.faceIds[0], polygon, rows });
    }
    cache.set(key, { buildings: [], lanes: [], entrances: new Map(), farms: plots });
    farms.push(...plots);
  }
  return { buildings, lanes, entrances, farms };
}

import type { HarborPlan } from "../../../generators/harborFabric";
import { facePoints } from "../../../generators/mesh";
import { nearestRoadAnchor } from "../../../generators/vector/generation/urbanPacking";
import { evaluateAnchor } from "../../../generators/vector/geometry/curves";
import { regionBoolean } from "../../../generators/vector/geometry/regions";
import { flatSeaDropMeters } from "../../../generators/waterGeometry";
import { collectShipSites } from "../../../renderers/shipSites";
import type { CityDocument } from "../../../types/document";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorHarborPlan } from "../../../types/vector/harbor";

export function copyLegacyHarbor(source: CityDocument, doc: VectorCityDocument, harbor: HarborPlan): VectorHarborPlan {
  const faces = Object.values(source.mesh.faces),
    land = faces.filter(f => f.properties.water === "land");
  const heights = land.map(f => f.properties.elevation).filter(Number.isFinite);
  if (source.terrain || (heights.length && Math.max(...heights) - Math.min(...heights) > 1e-6))
    throw Error("harbor-relief-not-supported");
  if (
    source.waterAreas?.length ||
    source.featureGroups.some(g => g.kind === "river") ||
    source.frameRoads?.length ||
    source.riverConnections?.length
  )
    throw Error("harbor-ribbon-crossing-not-supported");
  const landIds = new Map(land.map((f, i) => [f.id, `harbor-land:${i}`]));
  const wet = faces.filter(f => f.properties.water !== "land"),
    waterIds = new Map(wet.map((f, i) => [f.id, `harbor-water:${i}`]));
  const polygon = (f: (typeof faces)[number]) => ({ outer: facePoints(source.mesh, f), holes: [] });
  const requireId = (map: Map<string, string>, key: string | undefined) => {
    const id = key && map.get(key);
    if (!id) throw Error("harbor-owner");
    return id;
  };
  const roads = Object.values(doc.paths).filter(p => p.role === "road");
  const accesses = harbor.frontages.flatMap((f, i) => {
    const hits = roads
      .flatMap(path =>
        [f.a, f.b].map(point => {
          const anchor = nearestRoadAnchor(path, point),
            target = evaluateAnchor(path, anchor);
          return { anchor, point, distance: Math.hypot(target[0] - point[0], target[1] - point[1]) };
        })
      )
      .sort((a, b) => a.distance - b.distance);
    if (!hits[0] || hits[0].distance > 0.05) return [];
    const hit = hits[0],
      other = hit.point === f.a ? f.b : f.a;
    return [{ id: `harbor-access:${i}`, points: [other, hit.point], widthMeters: f.widthMeters, road: hit.anchor }];
  });
  if (!accesses.length) throw Error("harbor-road-access");
  const plan: VectorHarborPlan = {
    id: "harbor:legacy",
    editPolicy: "fixed",
    navigation: {
      extentMeters: source.frame.extentMeters,
      initialWater: !source.regionalWaterAreas?.length,
      openBoundary: !source.regionalWaterAreas?.length,
      land: regionBoolean(land.map(polygon), [], "union"),
      water: regionBoolean(
        [...wet.map(polygon), ...(source.regionalWaterAreas ?? []).map(outer => ({ outer, holes: [] }))],
        [],
        "union"
      ),
      depths: wet.map(f => ({
        id: requireId(waterIds, f.id),
        polygon: polygon(f),
        depthMeters: f.properties.depth ?? 3,
        levelMeters: -flatSeaDropMeters(source)
      }))
    },
    lands: land.map(f => ({ id: requireId(landIds, f.id), polygon: polygon(f) })),
    spaces: harbor.spaces.map(s => {
      if (s.kind !== "quay" && s.kind !== "loading-yard") throw Error("harbor-space-kind");
      return { id: s.id, landId: requireId(landIds, s.faceId), kind: s.kind, polygon: { outer: s.polygon, holes: [] } };
    }),
    frontages: structuredClone(harbor.frontages),
    accesses,
    piers: harbor.piers.map(p => ({
      id: p.id,
      landId: requireId(landIds, p.landFaceId),
      waterId: requireId(waterIds, p.waterFaceId),
      polygon: { outer: structuredClone(p.polygon), holes: [] },
      depthMeters: p.depth
    })),
    cranes: structuredClone(harbor.cranes),
    quays: (harbor.cargoQuays ?? []).map(({ landFaceId, waterFaceId, ...q }) => ({
      ...structuredClone(q),
      landId: requireId(landIds, landFaceId),
      waterId: requireId(waterIds, waterFaceId)
    })),
    cargoPiles: structuredClone(harbor.cargoPiles),
    ships: collectShipSites(source).map(s => {
      const element = source.elements.find(e => e.id === s.id)!;
      return {
        ...s,
        state: s.state!,
        landId: requireId(landIds, element.harborFaceId ?? source.elements.find(e => e.kind === "harbor")?.faceIds[0]),
        waterId: requireId(
          waterIds,
          element.faceIds.find(id => waterIds.has(id))
        ),
        ...(element.harborOperation ? { cargo: structuredClone(element.harborOperation) } : {})
      };
    })
  };
  return plan;
}

import { circuitRing, polygonOverlaps } from "../fortifications";
import { landmarkReservationHits } from "../landmarks";
import { edgeBetween, facePoints } from "../mesh";
import type { CityDocument, Id, Point } from "../types";
import { laneHitsCivicLandmark } from "./buildingLots";
import { buildCirculadeTownFabric } from "./circuladeFabric";
import {
  COASTAL_BUILDING_SETBACK_METERS,
  clipRowsToConvex,
  coastalBandOverlap,
  cultivableParts,
  oceanShoreSegments
} from "./coastalSuitability";
import { districtDocument, resolveDistricts, upgradeFabricPlan } from "./fabricDistricts";
import { relieveGatePlazaBuildings } from "./gatePlazaBuildings";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid, segmentInteriorInPolygon } from "./geom";
import { buildLocalFabric, type CityFabric, convexInfillParts, FabricCache, type FarmPlot } from "./localInfill";
import { insetConvexKernel } from "./lotGeometry";
import { buildMedievalFabric, medievalStreetDocument } from "./medievalFabric";
import { openFieldPlots } from "./openField";
import { buildParkLawns, type ParkLawn } from "./parkFabric";
import { buildPolygonalCirculadeFabric } from "./polygonalCirculadeFabric";
import {
  bramCoreRadiusForCity,
  bramPeripheryBufferMeters,
  planPolygonalCirculadeLayout
} from "./polygonalCirculadeLayout";
import { shapeSuburbanFabric } from "./suburbanLanduse";

export type { CityFabric, FarmPlot, InfillLane } from "./localInfill";
export { convexInfillParts, FabricCache } from "./localInfill";
export interface DistrictFabric extends CityFabric {
  farms: FarmPlot[];
  parks?: ParkLawn[];
}
let defaultCache: FabricCache | null = null;
function getDefaultCache(): FabricCache {
  if (!defaultCache) {
    defaultCache = new FabricCache();
  }
  return defaultCache;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}

function finishFabric(document: CityDocument, fabric: DistrictFabric): DistrictFabric {
  fabric = shapeSuburbanFabric(document, fabric);
  const shore = oceanShoreSegments(document);
  if (shore.length) {
    fabric = {
      ...fabric,
      farms: fabric.farms.flatMap(farm =>
        document.mesh.faces[farm.faceId]?.properties.locked
          ? [farm]
          : convexInfillParts(farm.polygon).flatMap(part =>
              cultivableParts(part, shore).flatMap(polygon => {
                const rows = clipRowsToConvex(farm.rows, polygon);
                return rows.length >= 2 ? [{ ...farm, polygon, rows }] : [];
              })
            )
      )
    };
  }
  const reserved = (document.defenseCircuits ?? [])
    .filter(c => c.scope === "castle")
    .map(c => circuitRing(document, c));
  return {
    ...fabric,
    buildings: relieveGatePlazaBuildings(
      document,
      fabric.buildings.filter(b => !reserved.some(r => polygonOverlaps(b.polygon, r)))
    ),
    lanes: fabric.lanes.filter(
      l =>
        !reserved.some(
          r =>
            l.points.some(p => pointInPolygon(p, r)) ||
            l.points.slice(1).some((p, i) => segmentInteriorInPolygon(l.points[i], p, r))
        )
    )
  };
}

/** Cell IDs remain editing ownership; the building polygon may span several cells in its district. */
export function buildBlockFabric(document: CityDocument, cache = getDefaultCache()): DistrictFabric {
  if ((document.buildingPattern ?? (document.fabric?.version === 5 ? "medieval" : "legacy")) === "medieval") {
    return finishCoastalBuildings(
      document,
      buildMedievalFabric(document, buildLegacyBlockFabric(medievalStreetDocument(document), cache))
    );
  }
  return finishCoastalBuildings(document, buildLegacyBlockFabric(document, cache));
}

function finishCoastalBuildings(document: CityDocument, fabric: DistrictFabric): DistrictFabric {
  const shore = oceanShoreSegments(document);
  return {
    ...fabric,
    buildings: fabric.buildings.filter(
      lot =>
        !landmarkReservationHits(document, lot.polygon) &&
        (document.mesh.faces[lot.faceId]?.properties.locked ||
          document.mesh.faces[lot.faceId]?.properties.ward === "harbor" ||
          !coastalBandOverlap(lot.polygon, shore, COASTAL_BUILDING_SETBACK_METERS))
    ),
    farms: fabric.farms.filter(farm => !landmarkReservationHits(document, farm.polygon)),
    openSpaces: fabric.openSpaces?.filter(space => !landmarkReservationHits(document, space.polygon))
  };
}

function buildLegacyBlockFabric(document: CityDocument, cache: FabricCache): DistrictFabric {
  const layout =
    document.layout ??
    document.fabric?.generation?.settings?.layout ??
    document.fabric?.generation?.settings?.config?.layout;
  const isBram = layout === "bram";
  const isCirculade = layout === "circulade";

  if (isBram) {
    const plazaElem = document.elements.find(e => e.kind === "plaza");
    const hub: Point = plazaElem?.point ?? [0, 0];
    const plan = document.fabric ? upgradeFabricPlan(document) : null;
    const seed = plan?.seed ?? "circulade-voronoi-seed";
    const templeElem = document.elements.find(e => e.kind === "temple");

    const walled = document.featureGroups.some(group => group.kind === "wall");
    const coreRadius = bramCoreRadiusForCity(document.frame.cityRadiusMeters, walled);
    const corePlan = planPolygonalCirculadeLayout(hub, seed, coreRadius, !!templeElem, 16);
    const coreFabric = buildPolygonalCirculadeFabric(document, { seed, plan: corePlan });

    // Stay clear of the outer ring road (4.2 m at the nominal 120 m core).
    const coreBufferRadius = bramPeripheryBufferMeters(coreRadius);
    const isInsideCore = (p: Point): boolean => {
      if (Math.hypot(p[0] - hub[0], p[1] - hub[1]) < coreBufferRadius) return true;
      if (pointInPolygon(p, corePlan.outerBoundary)) return true;
      return false;
    };

    // Peripheral faces: buildable land faces outside the core
    const peripheralFaces = Object.values(document.mesh.faces).filter(f => {
      if (f.properties.water !== "land" || !f.properties.buildable) return false;
      const pts = facePoints(document.mesh, f);
      if (pts.every(isInsideCore)) return false;
      const c = polygonCentroid(pts);
      return !isInsideCore(c);
    });

    let peripheralFabric: CityFabric = { buildings: [], lanes: [], entrances: new Map() };
    if (peripheralFaces.length > 0) {
      const local = buildLocalFabric(document, {
        seed,
        parameters: new Map(),
        cache,
        layout: "organic",
        hub
      });
      const peripheralSet = new Set(peripheralFaces.map(f => f.id));

      // Strictly exclude any peripheral Voronoi building that enters or touches the core
      const safeBuildings = local.buildings.filter(b => {
        if (!peripheralSet.has(b.faceId)) return false;
        for (const pt of b.polygon) {
          if (isInsideCore(pt)) return false;
        }
        for (let i = 0; i < b.polygon.length; i++) {
          const p1 = b.polygon[i];
          const p2 = b.polygon[(i + 1) % b.polygon.length];
          if (distToSegment(hub, p1, p2) < coreBufferRadius) return false;
        }
        const c = polygonCentroid(b.polygon);
        if (isInsideCore(c)) return false;
        return true;
      });

      // Strictly exclude any peripheral Voronoi lane that enters or crosses the core
      const safeLanes = local.lanes.filter(l => {
        if (!peripheralSet.has(l.faceId)) return false;
        for (const pt of l.points) {
          if (isInsideCore(pt)) return false;
        }
        for (let i = 0; i < l.points.length - 1; i++) {
          if (distToSegment(hub, l.points[i], l.points[i + 1]) < coreBufferRadius) return false;
        }
        return true;
      });

      peripheralFabric = {
        buildings: safeBuildings,
        lanes: safeLanes,
        entrances: new Map([...local.entrances.entries()].filter(([id]) => peripheralSet.has(id)))
      };
    }

    const lanes = [...coreFabric.lanes, ...peripheralFabric.lanes].filter(
      l => !laneHitsCivicLandmark(document, l.points)
    );
    const entrances = new Map<Id, Point[]>();
    for (const [id, pts] of [...coreFabric.entrances, ...peripheralFabric.entrances]) {
      entrances.set(id, [...(entrances.get(id) ?? []), ...pts]);
    }

    return finishFabric(document, {
      buildings: [...coreFabric.buildings, ...peripheralFabric.buildings],
      lanes,
      entrances,
      farms: []
    });
  }

  if (isCirculade) {
    const plazaElem = document.elements.find(e => e.kind === "plaza");
    const hub: Point = plazaElem?.point ?? [0, 0];
    const plan = document.fabric ? upgradeFabricPlan(document) : null;
    const seed = plan?.seed ?? "circulade-seed";

    const coreFabric = buildCirculadeTownFabric(document, { seed, hub });

    const outskirtsFaces = Object.values(document.mesh.faces).filter(
      f => f.properties.settlement === "outskirts" && f.properties.water === "land"
    );
    let outskirtsFabric: CityFabric = { buildings: [], lanes: [], entrances: new Map() };

    if (outskirtsFaces.length > 0) {
      const local = buildLocalFabric(document, {
        seed,
        parameters: new Map(),
        cache,
        layout: "organic",
        hub
      });
      const outskirtsSet = new Set(outskirtsFaces.map(f => f.id));
      outskirtsFabric = {
        buildings: local.buildings.filter(b => outskirtsSet.has(b.faceId)),
        lanes: local.lanes.filter(l => outskirtsSet.has(l.faceId)),
        entrances: new Map([...local.entrances.entries()].filter(([id]) => outskirtsSet.has(id)))
      };
    }

    const lanes = [...coreFabric.lanes, ...outskirtsFabric.lanes].filter(
      l => !laneHitsCivicLandmark(document, l.points)
    );
    const entrances = new Map<Id, Point[]>();
    for (const [id, pts] of [...coreFabric.entrances, ...outskirtsFabric.entrances]) {
      entrances.set(id, [...(entrances.get(id) ?? []), ...pts]);
    }

    return finishFabric(document, {
      buildings: [...coreFabric.buildings, ...outskirtsFabric.buildings],
      lanes,
      entrances,
      farms: []
    });
  }

  const effectiveSubLayout = layout === "classic" ? "classic" : "organic";

  if (!document.fabric) {
    const plazaElem = document.elements.find(e => e.kind === "plaza");
    const hub: Point = plazaElem?.point ?? [0, 0];
    const local = buildLocalFabric(document, {
      seed: "fabric-seed",
      parameters: new Map(),
      cache,
      layout: effectiveSubLayout,
      hub
    });
    const lanes = local.lanes.filter(l => !laneHitsCivicLandmark(document, l.points));
    return finishFabric(document, { ...local, lanes, farms: [] });
  }

  const plan = upgradeFabricPlan(document)!;
  const districts = resolveDistricts(document, plan);
  const merged = districtDocument(document, districts);
  const plazaElem = document.elements.find(e => e.kind === "plaza");
  const hub: Point = plazaElem?.point ?? [0, 0];
  const local = buildLocalFabric(merged, {
    seed: plan.seed,
    parameters: new Map(districts.map(d => [d.id, d.parameters])),
    cache,
    layout: effectiveSubLayout,
    hub
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
    // Farm frontage follows the same narrow road-edge gap as roadside houses.
    const setback = group.style.widthMeters / 2 + (group.kind === "road" ? 0.35 : 4);
    for (const id of ids) {
      setbacks.set(id, Math.max(setbacks.get(id) ?? 0, group.kind === "road" ? setback : Math.max(8, setback)));
    }
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
      "farm-v5",
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
      for (const field of openFieldPlots(polygon, district.parameters.orientation, `${district.id}:open-field`)) {
        const rows = field.rows.filter(
          row => !nearby.some(river => row.some(p => nearestOnPolyline(p, river.points).dist < river.width / 2 + 4))
        );
        if (rows.length >= 2)
          plots.push({ faceId: owner(district.id, polygonCentroid(field.polygon)), polygon: field.polygon, rows });
      }
    }
    cache.set(key, { buildings: [], lanes: [], entrances: new Map(), farms: plots });
    farms.push(...plots);
  }
  const parks = buildParkLawns(merged);
  return finishFabric(document, { buildings, lanes, entrances, farms, parks });
}

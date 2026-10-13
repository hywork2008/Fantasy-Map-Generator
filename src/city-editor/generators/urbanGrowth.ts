import {
  clampGrowth,
  growthRandom,
  outsidePopulationCap,
  relationAccess,
  relationDefense,
  residentialStoreys
} from "../../utils/urbanMorphology";
import type { BurgSiteRoadEntry } from "../types/contracts/burgSiteDescriptor";
import type { InfillLane } from "../types/contracts/localInfill";
import type { OpenSpace } from "../types/contracts/parcelTypes";
import type { UrbanGrowthPlan, UrbanGrowthRegion } from "../types/contracts/urbanGrowth";
import type { CityDocument, Point } from "../types/document";
import { aerialLandmarkFootprints } from "./aerialFootprints";
import type { DistrictFabric } from "./blockInfill";
import type { BuildingLot } from "./buildingLots";
import { buildingHitsCivicLandmark } from "./civicClearance";
import { curtainSegments, gapToLines, glacisOutworks, polygonClearsGlacis } from "./defenseClearance";
import { featureGroupVertices } from "./features";
import { FixedRoadReservation } from "./fixedRoadReservation";
import { polygonOverlaps } from "./fortifications";
import { nearestOnPolyline, pointInPolygon, polygonCentroid, segmentsIntersect } from "./geom";
import { facePoints } from "./mesh";
import { MoatReservation } from "./moats";
import { bounds, boundsOverlap } from "./parcelGeometry";
import { applyResidentialStoreys, isResidentialBuilding, residentialCapacity } from "./residentialCapacity";
import type { ApproachBand } from "./suburbanLanduse";
import { documentWaterTest, lineHitsDocumentWater } from "./waterGeometry";

/** Largest remainder with stable tie breaking; no traffic / fiscal input. */
export function allocateGrowthBudget(
  total: number,
  candidates: Array<{ id: string; weight: number; capacity?: number }>
): Record<string, number> {
  const out = Object.fromEntries(candidates.map(c => [c.id, 0]));
  let remaining = Math.max(0, Math.floor(total));
  let active = candidates.filter(c => c.weight > 0 && (c.capacity ?? Infinity) > 0);
  while (remaining && active.length) {
    const sum = active.reduce((n, c) => n + c.weight, 0);
    const shares = active.map(c => ({ c, exact: (remaining * c.weight) / sum }));
    let used = 0;
    for (const { c, exact } of shares) {
      const n = Math.min(Math.floor(exact), (c.capacity ?? Infinity) - out[c.id]);
      out[c.id] += n;
      used += n;
    }
    remaining -= used;
    if (remaining) {
      shares.sort((a, b) => (b.exact % 1) - (a.exact % 1) || a.c.id.localeCompare(b.c.id));
      for (const { c } of shares) {
        if (!remaining) break;
        if (out[c.id] >= (c.capacity ?? Infinity)) continue;
        out[c.id]++;
        remaining--;
      }
    }
    active = active.filter(c => out[c.id] < (c.capacity ?? Infinity));
  }
  return out;
}

export function approachGrowthWeight(
  road: BurgSiteRoadEntry | undefined,
  maxLogPopulation: number,
  minLogPopulation: number
): { weight: number; defense: number } {
  if (road?.group === "searoutes") return { weight: 0, defense: 0 };
  const neighbors = [...(road?.nextBurgs ?? []), ...(road?.nextBurg ? [road.nextBurg] : [])];
  if (!neighbors.length) return { weight: (road?.group === "trails" ? 0.55 : 1) * 0.625 * 0.8, defense: 0.15 };
  let weight = 0,
    defense = 0;
  for (const neighbor of neighbors) {
    const p = Math.log1p(neighbor.population ?? 0);
    const S =
      maxLogPopulation > minLogPopulation
        ? clampGrowth((p - minLogPopulation) / (maxLogPopulation - minLogPopulation))
        : 0.5;
    weight = Math.max(
      weight,
      (road?.group === "trails" ? 0.55 : 1) * (0.5 + 0.5 * S) * relationAccess(neighbor.diplomacyRelation)
    );
    defense = Math.max(defense, relationDefense(neighbor.diplomacyRelation));
  }
  return { weight, defense };
}

export function polylineArc(p: Point, line: Point[]): { s: number; distance: number } {
  const hit = nearestOnPolyline(p, line);
  let s = 0;
  for (let i = 1; i <= hit.segIndex; i++) s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  const a = line[hit.segIndex],
    b = line[hit.segIndex + 1];
  if (a && b) s += Math.hypot(b[0] - a[0], b[1] - a[1]) * hit.t;
  return { s, distance: hit.dist };
}

export function planUrbanGrowth(
  document: CityDocument,
  bands: ApproachBand[],
  roads: BurgSiteRoadEntry[],
  dwellings: number,
  fabric: DistrictFabric
): UrbanGrowthPlan {
  const profile = document.urbanMorphology!;
  const hasWalls = document.defenseCircuits?.some(c => c.scope === "town" && c.state !== "razed") ?? false;
  const currentPopulation = dwellings * 4.5;
  const cap = hasWalls ? Math.floor(outsidePopulationCap(profile, currentPopulation) * dwellings) : dwellings;
  const previousPopulation = profile.wallPhases.at(-1)?.people ?? currentPopulation;
  const growth = Math.max(0, (currentPopulation - previousPopulation) / 4.5);
  const budget = hasWalls
    ? Math.min(cap, Math.ceil(Math.max(profile.anchors.length ? dwellings * 0.01 : 0, growth * 0.35)))
    : dwellings;
  const populations = roads
    .filter(r => r.group !== "searoutes")
    .flatMap(r => [...(r.nextBurgs ?? []), ...(r.nextBurg ? [r.nextBurg] : [])])
    .map(b => Math.log1p(b.population ?? 0));
  const regions: UrbanGrowthRegion[] = [];
  const outsideFaces = Object.values(document.mesh.faces).filter(
    f => f.properties.settlement === "outskirts" && f.properties.water === "land" && f.properties.buildable
  );
  const faceSamples = outsideFaces.map(f => {
    const ring = facePoints(document.mesh, f);
    return [polygonCentroid(ring), ...ring];
  });
  const seen = new Set<string>();
  for (const band of bands) {
    const group = document.featureGroups.find(g => g.id === band.groupId);
    const sourceIndex = group?.kind === "road" ? group.sourceRoad?.index : undefined;
    const road = sourceIndex === undefined ? undefined : roads[sourceIndex];
    const id = road?.approachId ?? `${profile.seed}:${band.groupId}`;
    if (seen.has(id) || road?.group === "searoutes") continue;
    seen.add(id);
    const assessed = approachGrowthWeight(road, Math.max(...populations, 0), Math.min(...populations, Infinity));
    const major = assessed.weight >= 0.55;
    const start = hasWalls ? band.clearance : 0;
    const length = major ? 150 + 350 * assessed.weight : 50 + 130 * assessed.weight;
    const halfWidth = major ? 55 : 30;
    // Area availability is a geometric condition, never an economic role.
    const available = faceSamples.filter(samples =>
      samples.some(p => {
        const hit = polylineArc(p, band.points);
        return hit.s >= start && hit.s <= start + length && hit.distance <= halfWidth;
      })
    ).length;
    if (!available) continue;
    regions.push({
      id,
      kind: "approachRibbon",
      approachId: id,
      roadGroupId: band.groupId,
      gateVertexId: band.gateVertexId,
      points: band.points,
      weight: assessed.weight * Math.min(1, available / 3),
      start,
      length,
      halfWidth,
      budget: 0
    });
  }
  const addAnchor = (id: string, point: Point, access: Point[]) => {
    if (!outsideFaces.some(f => pointInPolygon(point, facePoints(document.mesh, f))) || access.length < 2) return;
    regions.push({
      id,
      kind: "anchorCluster",
      points: access,
      weight: 0.15,
      start: 0,
      length: 100,
      halfWidth: 35,
      budget: 0
    });
  };
  for (const cemetery of document.cemeteries ?? []) {
    const access = cemetery.accesses[0]?.points;
    if (access) addAnchor(`${profile.seed}:anchor:${cemetery.id}`, cemetery.gatePoint ?? access.at(-1)!, access);
  }
  for (const monastery of fabric.aerialLandmarks?.monasteries ?? []) {
    const nearest = bands
      .map(b => ({ b, hit: nearestOnPolyline(monastery.gate, b.points) }))
      .sort((a, b) => a.hit.dist - b.hit.dist)[0];
    if (nearest?.hit.dist && nearest.hit.dist <= 40)
      addAnchor(`${profile.seed}:anchor:${monastery.id}`, monastery.gate, [nearest.hit.point, monastery.gate]);
  }
  const connectAnchor = (id: string, point: Point) => {
    const nearest = bands
      .map(b => ({ b, hit: nearestOnPolyline(point, b.points) }))
      .sort((a, b) => a.hit.dist - b.hit.dist)[0];
    if (nearest && nearest.hit.dist > 0 && nearest.hit.dist <= 40) addAnchor(id, point, [nearest.hit.point, point]);
  };
  for (const element of document.elements) {
    if (element.kind === "temple" && element.point)
      connectAnchor(`${profile.seed}:anchor:${element.id}`, element.point);
  }
  if (profile.waterfrontResolved !== false) {
    for (const mill of fabric.watermills?.mills ?? [])
      connectAnchor(`${profile.seed}:anchor:${mill.id}`, polygonCentroid(mill.millhousePolygon));
    for (const tannery of fabric.aerialLandmarks?.tanneries ?? [])
      connectAnchor(`${profile.seed}:anchor:${tannery.id}`, polygonCentroid(tannery.yard));
  }
  const fairs: OpenSpace[] = [];
  if (profile.anchors.some(a => a.kind === "fair")) {
    const road = [...regions]
      .filter(r => r.kind === "approachRibbon" && r.halfWidth >= 45)
      .sort((a, b) => b.weight - a.weight)[0];
    if (road) {
      let walked = 0;
      const target = road.start + Math.min(100, road.length * 0.3);
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1],
          b = road.points[i];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!length || walked + length < target) {
          walked += length;
          continue;
        }
        const tx = (b[0] - a[0]) / length,
          ty = (b[1] - a[1]) / length;
        const centre: Point = [a[0] + tx * (target - walked) - ty * 31, a[1] + ty * (target - walked) + tx * 31];
        const polygon: Point[] = [
          [-12, -9],
          [12, -9],
          [12, 9],
          [-12, 9]
        ].map(([u, v]) => [centre[0] + tx * u - ty * v, centre[1] + ty * u + tx * v]);
        const face = outsideFaces.find(f => polygon.every(p => pointInPolygon(p, facePoints(document.mesh, f))));
        if (
          face &&
          !documentWaterTest(document)(polygon) &&
          !new MoatReservation(document, 2).hitsPolygon(polygon) &&
          !buildingHitsCivicLandmark(document, polygon) &&
          !fabric.buildings.some(b => polygonOverlaps(b.polygon, polygon))
        )
          fairs.push({ id: `${profile.seed}:fair`, faceId: face.id, kind: "courtyard", access: "shared", polygon });
        break;
      }
    }
  }
  const allocations = allocateGrowthBudget(budget, regions);
  for (const r of regions) r.budget = allocations[r.id];
  const angles = regions
    .filter(r => r.kind === "approachRibbon")
    .map(r => Math.atan2(r.points.at(-1)![1], r.points.at(-1)![0]))
    .sort((a, b) => a - b);
  const openWedges: UrbanGrowthPlan["openWedges"] = [];
  if (angles.length >= 2)
    for (let i = 0; i < angles.length; i++) {
      const delta = (angles[(i + 1) % angles.length] - angles[i] + 2 * Math.PI) % (2 * Math.PI);
      if (delta < Math.PI / 6) continue;
      const a = angles[i] + delta / 2;
      const r = document.frame.cityRadiusMeters;
      openWedges.push({
        points: [
          [Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6],
          [Math.cos(a) * (r + 600), Math.sin(a) * (r + 600)]
        ],
        widthMeters: 30
      });
    }
  const absorbedClusters: UrbanGrowthPlan["absorbedClusters"] = [];
  const absorbedFaceIds = new Set<string>();
  const phase = profile.wallPhases.at(-1);
  const actualRings = (document.defenseCircuits ?? []).filter(c => c.scope === "town");
  if (phase && profile.wallPhases.length > 1) {
    for (const band of bands) {
      const group = document.featureGroups.find(g => g.id === band.groupId);
      const path = group?.kind === "road" && group.sourceRoad ? roads[group.sourceRoad.index]?.path : undefined;
      const faces = Object.values(document.mesh.faces)
        .filter(
          f =>
            f.properties.settlement === "core" &&
            !absorbedFaceIds.has(f.id) &&
            (f.properties.wallRing ?? 0) > 0 &&
            nearestOnPolyline(polygonCentroid(facePoints(document.mesh, f)), path?.length ? path : band.points).dist <
              60
        )
        .map(f => f.id);
      for (const id of faces) absorbedFaceIds.add(id);
      if (faces.length)
        absorbedClusters.push({
          id: `${profile.seed}:old-suburb:${band.groupId}`,
          wallPhaseId: phase.id,
          faceIds: faces
        });
    }
  }
  return {
    version: 1,
    requiredDwellings: dwellings,
    outsideCap: cap,
    outsideBudget: budget,
    insideStoreys: residentialStoreys(profile.period).standard,
    regions,
    fairs,
    openWedges,
    absorbedClusters,
    outerEnclosedUrbanAreaShare: null,
    innerEnclosedAreaShare: null,
    reasons: [
      ...(regions.length ? [] : ["no-buildable-outside-approach"]),
      ...(profile.wallPhases.length > 1 && actualRings.length < 2 ? ["old-wall-not-representable-on-current-mesh"] : [])
    ]
  };
}

function regionForPolygon(document: CityDocument, polygon: Point[]): UrbanGrowthRegion | undefined {
  const plan = document.urbanGrowth;
  if (!plan) return undefined;
  if (plan.fairs?.some(f => polygonOverlaps(polygon, f.polygon))) return undefined;
  if (plan.openWedges.some(w => gapToLines(polygon, [w.points]) < w.widthMeters / 2)) return undefined;
  return plan.regions.find(region =>
    polygon.every(p => {
      const hit = polylineArc(p, region.points);
      return hit.s >= region.start && hit.s <= region.start + region.length && hit.distance <= region.halfWidth;
    })
  );
}

/** Minimum facade-axis error against the actual nearest street segment. */
export function frontageSkewDegrees(polygon: Point[], points: Point[]): number {
  const hit = nearestOnPolyline(polygonCentroid(polygon), points);
  const a = points[hit.segIndex],
    b = points[hit.segIndex + 1];
  if (!a || !b) return 90;
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy);
  if (!length) return 90;
  let error = 90;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i],
      q = polygon[(i + 1) % polygon.length];
    const ex = q[0] - p[0],
      ey = q[1] - p[1],
      edge = Math.hypot(ex, ey);
    if (edge < 3) continue;
    error = Math.min(error, (Math.acos(clampGrowth(Math.abs(dx * ex + dy * ey) / (length * edge))) * 180) / Math.PI);
  }
  return error;
}

/** Common final mask for every fabric style; suburb flags never waive it. */
export function shapeUrbanGrowthFabric(document: CityDocument, fabric: DistrictFabric): DistrictFabric {
  const lots = applyResidentialStoreys(
    document,
    fabric.buildings.filter(b => !b.id?.startsWith("growth-row:"))
  );
  if (!document.urbanGrowth) return { ...fabric, buildings: lots };
  const inside: BuildingLot[] = [];
  const candidates: BuildingLot[] = [];
  for (const lot of lots) {
    const face = document.mesh.faces[lot.faceId];
    if (face?.properties.settlement !== "outskirts" || face.properties.locked) {
      inside.push(lot);
      continue;
    }
    const region = regionForPolygon(document, lot.polygon);
    if (!region || (region.kind === "approachRibbon" && frontageSkewDegrees(lot.polygon, region.points) > 15)) continue;
    const centre = polygonCentroid(lot.polygon);
    const hit = polylineArc(centre, region.points);
    const progress = clampGrowth((hit.s - region.start) / region.length);
    // A shared random value per short street segment keeps consecutive groups of houses.
    const rowSeed = `${region.id}:row:${Math.floor(hit.s / 35)}`;
    if (growthRandom(rowSeed) > 0.85 - 0.55 * progress) continue;
    candidates.push({ ...lot, growthRegionId: region.id });
  }
  const rows = buildGrowthRows(document, fabric);
  candidates.push(
    ...rows.buildings.filter(b => {
      const r = document.urbanGrowth!.regions.find(r => r.id === b.growthRegionId);
      return r && frontageSkewDegrees(b.polygon, r.points) <= 15;
    })
  );
  const capacity = new Map<string, number>();
  for (const lot of candidates)
    capacity.set(lot.growthRegionId!, (capacity.get(lot.growthRegionId!) ?? 0) + residentialCapacity(lot));
  const lockedOutsideCapacity = inside
    .filter(lot => document.mesh.faces[lot.faceId]?.properties.settlement === "outskirts")
    .reduce((n, lot) => n + residentialCapacity(lot), 0);
  const available = allocateGrowthBudget(
    Math.max(0, document.urbanGrowth.outsideBudget - lockedOutsideCapacity),
    document.urbanGrowth.regions.map(r => ({ ...r, capacity: capacity.get(r.id) ?? 0 }))
  );
  candidates.sort((a, b) => {
    const ra = document.urbanGrowth!.regions.find(r => r.id === a.growthRegionId)!;
    const rb = document.urbanGrowth!.regions.find(r => r.id === b.growthRegionId)!;
    return (
      rb.weight - ra.weight ||
      polylineArc(polygonCentroid(a.polygon), ra.points).s - polylineArc(polygonCentroid(b.polygon), rb.points).s ||
      a.faceId.localeCompare(b.faceId)
    );
  });
  const chosen = candidates.filter(lot => {
    if (!isResidentialBuilding(lot)) return true;
    const n = residentialCapacity(lot);
    if (n > available[lot.growthRegionId!]) return false;
    available[lot.growthRegionId!] -= n;
    return n > 0;
  });
  const buildings = [...inside, ...chosen];
  const farms = fabric.farms.filter(
    farm =>
      !chosen.some(b => polygonOverlaps(farm.polygon, b.polygon)) &&
      !document.urbanGrowth!.fairs?.some(f => polygonOverlaps(farm.polygon, f.polygon))
  );
  const lanes = [
    ...fabric.lanes.filter(
      lane =>
        !lane.faceId.startsWith("growth-row:") &&
        (document.mesh.faces[lane.faceId]?.properties.settlement !== "outskirts" ||
          document.urbanGrowth!.regions.some(r =>
            lane.points.every(p => nearestOnPolyline(p, r.points).dist <= r.halfWidth)
          ))
    ),
    ...rows.lanes
  ];
  return {
    ...fabric,
    buildings,
    farms,
    openSpaces: [
      ...(fabric.openSpaces ?? []).filter(s => s.id !== `${document.urbanMorphology!.seed}:fair`),
      ...(document.urbanGrowth.fairs ?? [])
    ],
    lanes: [...new Map(lanes.map(l => [`${l.faceId}:${JSON.stringify(l.points)}`, l])).values()]
  };
}

/** Metre-scale frontages and service lanes on actual dry, mesh-owned outskirts. */
function buildGrowthRows(
  document: CityDocument,
  fabric: DistrictFabric
): { buildings: BuildingLot[]; lanes: InfillLane[] } {
  const plan = document.urbanGrowth!;
  const buildings: BuildingLot[] = [];
  const lanes: InfillLane[] = [];
  const faces = Object.values(document.mesh.faces).filter(
    f =>
      f.properties.water === "land" &&
      !f.properties.locked &&
      f.properties.buildable &&
      f.properties.settlement === "outskirts" &&
      !["castle", "cemetery", "park"].includes(f.properties.ward ?? "")
  );
  const faceRings = faces.map(f => ({ f, ring: facePoints(document.mesh, f) }));
  const water = documentWaterTest(document);
  const moat = new MoatReservation(document, 2);
  const fixed = new FixedRoadReservation(document);
  const footprint = fabric.aerialLandmarks ? aerialLandmarkFootprints(fabric.aerialLandmarks) : [];
  const obstacles = [
    ...fabric.buildings.filter(b => !b.id?.startsWith("growth-row:")).map(b => b.polygon),
    ...footprint,
    ...(document.urbanGrowth?.fairs?.map(f => f.polygon) ?? []),
    ...(fabric.harbor?.spaces.map(s => s.polygon) ?? []),
    ...(fabric.harbor?.piers.map(p => p.polygon) ?? []),
    ...(fabric.watermills?.mills.map(m => m.millhousePolygon) ?? [])
  ];
  const obstacleBoxes = obstacles.map(bounds);
  const buildingBoxes: ReturnType<typeof bounds>[] = [];
  const allRoads = document.featureGroups.flatMap(g =>
    g.kind === "road" ? [featureGroupVertices(document, g).map(id => document.mesh.vertices[id].point)] : []
  );
  const defenseBands = plan.regions.map(r => ({ points: r.points, clearance: r.start, gateVertexId: r.gateVertexId }));
  const glacis = {
    active: document.defenseCircuits?.some(c => c.scope === "town" && c.state !== "razed") ?? false,
    walls: curtainSegments(document),
    bands: defenseBands,
    outworks: glacisOutworks(document, fabric.aerialLandmarks?.barbicans ?? [], defenseBands)
  };
  const owner = (polygon: Point[]) =>
    faceRings.find(
      ({ ring }) =>
        polygon.every(p => pointInPolygon(p, ring)) &&
        !polygon.some((a, i) =>
          ring.some((b, j) => segmentsIntersect(a, polygon[(i + 1) % polygon.length], b, ring[(j + 1) % ring.length]))
        )
    )?.f;
  const atArc = (line: Point[], target: number) => {
    let s = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length && s + length >= target)
        return {
          point: [
            a[0] + ((b[0] - a[0]) * (target - s)) / length,
            a[1] + ((b[1] - a[1]) * (target - s)) / length
          ] as Point,
          tangent: [(b[0] - a[0]) / length, (b[1] - a[1]) / length] as Point
        };
      s += length;
    }
    return undefined;
  };
  for (const region of plan.regions) {
    if (region.kind !== "approachRibbon") continue;
    for (let s = region.start + 10; s < region.start + region.length - 10; s += 12) {
      const progress = (s - region.start) / region.length;
      if (growthRandom(`${region.id}:row:${Math.floor(s / 36)}`) > 0.85 - 0.55 * progress) continue;
      const loc = atArc(region.points, s);
      if (!loc) break;
      const [tx, ty] = loc.tangent;
      for (const side of [-1, 1])
        for (const row of region.halfWidth >= 45 ? [0, 1] : [0]) {
          // Leave one frontage every ~60m for the service lane's perpendicular connection.
          if (Math.floor(s / 12) % 5 === 0) continue;
          const width = 7 + 3 * growthRandom(`${region.id}:${s}:${side}:${row}`),
            depth = 10;
          const offset = side * (row ? 36 : 13);
          const centre: Point = [loc.point[0] - ty * offset, loc.point[1] + tx * offset];
          const polygon: Point[] = [
            [-width / 2, -depth / 2],
            [width / 2, -depth / 2],
            [width / 2, depth / 2],
            [-width / 2, depth / 2]
          ].map(([u, v]) => [centre[0] + tx * u - ty * v, centre[1] + ty * u + tx * v]);
          if (regionForPolygon(document, polygon)?.id !== region.id) continue;
          const face = owner(polygon);
          const box = bounds(polygon);
          if (
            !face ||
            water(polygon) ||
            moat.hitsPolygon(polygon) ||
            fixed.hitsPolygon(polygon) ||
            buildingHitsCivicLandmark(document, polygon) ||
            !polygonClearsGlacis(polygon, glacis) ||
            gapToLines(polygon, allRoads) < 6 ||
            obstacles.some((p, i) => boundsOverlap(box, obstacleBoxes[i]) && polygonOverlaps(polygon, p)) ||
            buildings.some((b, i) => boundsOverlap(box, buildingBoxes[i]) && polygonOverlaps(polygon, b.polygon))
          )
            continue;
          if (row) {
            const connectorS = Math.floor(s / 60) * 60;
            const from = atArc(region.points, Math.max(region.start + 5, connectorS));
            if (!from) continue;
            const portal: Point = [
              from.point[0] - from.tangent[1] * side * 26,
              from.point[1] + from.tangent[0] * side * 26
            ];
            const near: Point = [loc.point[0] - ty * side * 26, loc.point[1] + tx * side * 26];
            const access = [from.point, portal, near];
            // A rear row is only possible if the cross-link really passes an unbuilt frontage.
            if (
              lineHitsDocumentWater(document, access, 3, false, water) ||
              obstacles.some(p => access.slice(1).some((end, i) => gapToLines(p, [[access[i], end]]) < 2))
            )
              continue;
            lanes.push({ faceId: face.id, points: access, widthMeters: 3 });
          }
          buildingBoxes.push(box);
          buildings.push({
            id: `growth-row:${region.id}:${s}:${side}:${row}`,
            faceId: face.id,
            polygon,
            landmark: false,
            role: "main",
            uses: ["residential"],
            storeys: 2,
            growthRegionId: region.id
          });
        }
    }
  }
  // No building may occupy the lane that provides access to a rear row.
  return {
    buildings: buildings.filter(b => lanes.every(l => gapToLines(b.polygon, [l.points]) >= l.widthMeters / 2 + 1.5)),
    lanes
  };
}

export function validUrbanGrowth(value: unknown): value is UrbanGrowthPlan {
  if (!value || typeof value !== "object") return false;
  const p = value as UrbanGrowthPlan;
  const nonnegative = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  const points = (v: unknown) =>
    Array.isArray(v) && v.length >= 2 && v.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  return (
    p.version === 1 &&
    nonnegative(p.requiredDwellings) &&
    nonnegative(p.outsideCap) &&
    p.outsideCap <= p.requiredDwellings &&
    nonnegative(p.outsideBudget) &&
    p.outsideBudget <= p.outsideCap &&
    nonnegative(p.insideStoreys) &&
    p.insideStoreys >= 1 &&
    p.insideStoreys <= 5 &&
    Array.isArray(p.regions) &&
    p.regions.every(
      r =>
        r &&
        typeof r.id === "string" &&
        ["approachRibbon", "anchorCluster"].includes(r.kind) &&
        points(r.points) &&
        nonnegative(r.weight) &&
        nonnegative(r.start) &&
        nonnegative(r.length) &&
        r.length <= 500 &&
        nonnegative(r.halfWidth) &&
        r.halfWidth <= 100 &&
        nonnegative(r.budget)
    ) &&
    (p.fairs === undefined ||
      (Array.isArray(p.fairs) &&
        p.fairs.every(
          f =>
            f &&
            typeof f.id === "string" &&
            typeof f.faceId === "string" &&
            f.kind === "courtyard" &&
            f.access === "shared" &&
            points(f.polygon) &&
            f.polygon.length >= 3
        ))) &&
    Array.isArray(p.openWedges) &&
    p.openWedges.every(w => w && points(w.points) && nonnegative(w.widthMeters)) &&
    Array.isArray(p.absorbedClusters) &&
    p.absorbedClusters.every(
      c =>
        c &&
        typeof c.id === "string" &&
        typeof c.wallPhaseId === "string" &&
        Array.isArray(c.faceIds) &&
        c.faceIds.every(id => typeof id === "string")
    )
  );
}

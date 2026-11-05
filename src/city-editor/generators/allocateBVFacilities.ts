import type { CityDocument, LandmarkAsset, Point } from "../types/document";
import { aerialLandmarkFootprints } from "./aerialFootprints";
import { buildBlockFabric } from "./blockInfill";
import type { DistrictFabric } from "./blockInfill.types";
import { effectiveHeightLimit } from "./buildingHeightLimits";
import { CastleDefenseClearance } from "./castleDefenseClearance";
import { buildingHitsCivicLandmark } from "./civicClearance";
import { convexHull, nearestOnPolyline, polygonArea, polygonCentroid, segmentSegmentHit } from "./geom";
import { landmarkDwellingCapacity } from "./landmarkDwellings";
import { landmarkReservationParts, landmarkStreets } from "./landmarkIntegration";
import { buildLandmarkLaneNetwork } from "./landmarkLaneNetwork";
import {
  accessCorridor,
  connectedRoadEdgeIds,
  type LandmarkFrontage,
  placeLandmark,
  transformLandmarkPoint,
  transformLandmarkPolygons
} from "./landmarks";
import { clipHalfPlane, convexInfillParts } from "./lotGeometry";
import { faceNeighbors, facePoints } from "./mesh";
import { MoatReservation } from "./moats";
import { objectFootprint } from "./objectPlacement";
import { bounds, intersectConvex, PlotIndex, plotArea, subtractConvex } from "./parcelGeometry";
import { residentialCapacity } from "./residentialCapacityFormula";
import { approachBands } from "./suburbanLanduse";
import { cityTerrain } from "./terrainElevation";
import { classifyTownWater } from "./townWater";

export interface BVFacilityRequest {
  id: string;
  asset: LandmarkAsset;
  zone?: "core" | "outskirts";
  riverbankMaxDistanceMeters?: number;
}

/** Choose free building land, connect to an existing street, and measure the remaining housing. */
export function allocateBVFacilities(
  source: CityDocument,
  fabric: DistrictFabric,
  requests: readonly BVFacilityRequest[],
  requiredDwellings = source.populationPlan?.requiredDwellings ?? 0,
  options: { allowOutskirtsFields?: boolean } = {}
) {
  let document = source;
  const blockedWards = new Set(["castle", "market", "cemetery", "park", "farm", "harbor"]);
  const fieldFaces = new Set(
    Object.values(source.mesh.faces)
      .filter(
        f =>
          options.allowOutskirtsFields &&
          f.properties.buildable &&
          !f.properties.locked &&
          f.properties.water === "land" &&
          f.properties.settlement === "outskirts" &&
          ["farm", "empty"].includes(f.properties.ward ?? "empty")
      )
      .map(f => f.id)
  );
  const protectedLand = [
    ...fabric.buildings.filter(b => b.landmark || source.mesh.faces[b.faceId]?.properties.locked).map(b => b.polygon),
    ...fabric.farms.filter(f => !(f.sourceFaceIds ?? [f.faceId]).every(id => fieldFaces.has(id))).map(f => f.polygon),
    ...(fabric.parks ?? []).flatMap(p => p.lawnPolygons),
    ...(fabric.openSpaces ?? []).map(s => s.polygon),
    ...(fabric.aerialLandmarks ? aerialLandmarkFootprints(fabric.aerialLandmarks) : []),
    ...(fabric.watermills?.mills ?? []).map(m => m.millhousePolygon),
    ...source.elements.filter(e => e.kind === "object").map(objectFootprint),
    ...classifyTownWater(source).parts.map(p => p.polygon),
    ...Object.values(source.mesh.faces)
      .filter(
        f =>
          f.properties.locked ||
          f.properties.water !== "land" ||
          (blockedWards.has(f.properties.ward ?? "") && !fieldFaces.has(f.id))
      )
      .map(f => facePoints(source.mesh, f))
  ].flatMap(convexInfillParts);
  const lanes = buildLandmarkLaneNetwork(source, fabric.lanes);
  const streets = landmarkStreets(source, fabric.lanes);
  const connectedRoads = connectedRoadEdgeIds(source);
  const frontages: (LandmarkFrontage & { widthMeters: number })[] = [
    ...source.featureGroups.flatMap(g =>
      g.kind === "road"
        ? g.segments.flatMap(ref => {
            if (!connectedRoads.has(ref.edgeId)) return [];
            const edge = source.mesh.edges[ref.edgeId];
            return [
              {
                kind: "road" as const,
                id: g.id,
                points: [source.mesh.vertices[edge.a].point, source.mesh.vertices[edge.b].point] as [Point, Point],
                widthMeters: g.style.widthMeters
              }
            ];
          })
        : []
    ),
    ...lanes
      .filter(l => l.connectedToRoad)
      .flatMap(l =>
        l.points.slice(1).map((b, i) => ({
          kind: "lane" as const,
          id: l.id,
          points: [l.points[i], b] as [Point, Point],
          widthMeters: l.widthMeters
        }))
      )
  ];
  const frontageIndex = new PlotIndex<(typeof frontages)[number]>();
  for (const frontage of frontages) frontageIndex.add(frontage, bounds(frontage.points));
  const streetIndex = new PlotIndex<[Point, Point]>();
  for (const street of streets)
    for (let i = 1; i < street.points.length; i++) {
      const segment: [Point, Point] = [street.points[i - 1], street.points[i]];
      streetIndex.add(segment, bounds(segment));
    }
  const accessIndex = new PlotIndex<[Point, Point]>();
  const addAccesses = (instance: NonNullable<CityDocument["landmarks"]>[number]) => {
    for (const access of instance.accesses)
      for (let i = 1; i < access.points.length; i++) {
        const segment: [Point, Point] = [access.points[i - 1], access.points[i]];
        accessIndex.add(segment, bounds(segment));
      }
  };
  for (const instance of source.landmarks ?? []) addAccesses(instance);
  const crosses = ([a, b]: [Point, Point], [c, d]: [Point, Point]) => {
    const hit = segmentSegmentHit(a, b, c, d),
      reverse = segmentSegmentHit(c, d, a, b);
    return hit && reverse && hit.t > 1e-5 && hit.t < 1 - 1e-5 && reverse.t > 1e-5 && reverse.t < 1 - 1e-5;
  };
  const widest = streets.reduce((n, street) => Math.max(n, street.widthMeters), 0);

  const streetCuts = streets.flatMap(s => accessCorridor(s.points, s.widthMeters).map(p => p.outer));
  const cuts = [...protectedLand, ...streetCuts, ...landmarkReservationParts(source)];
  const fixed = new PlotIndex<Point[]>();
  const protectedIndex = new PlotIndex<Point[]>();
  for (const polygon of protectedLand) protectedIndex.add(polygon, bounds(polygon));
  cuts.forEach(c => {
    fixed.add(c, bounds(c));
  });
  const cappedLand = new PlotIndex<{ polygon: Point[]; height: number }>();
  for (const face of Object.values(source.mesh.faces)) {
    const height = face.properties.buildingHeightLimit?.maxHeightMeters;
    if (height === undefined) continue;
    for (const polygon of convexInfillParts(facePoints(source.mesh, face)))
      cappedLand.add({ polygon, height }, bounds(polygon));
  }
  let plots = Object.values(source.mesh.faces)
    .filter(
      f =>
        f.properties.buildable &&
        !f.properties.locked &&
        f.properties.water === "land" &&
        (!blockedWards.has(f.properties.ward ?? "") || fieldFaces.has(f.id))
    )
    .flatMap(face => {
      let parts = convexInfillParts(facePoints(source.mesh, face));
      for (const cut of fixed.query(bounds(facePoints(source.mesh, face))))
        parts = parts.flatMap(p => subtractConvex(p, cut, 1));
      return parts.map(polygon => ({ face, polygon }));
    })
    .sort(
      (a, b) =>
        Math.hypot(...polygonCentroid(a.polygon)) - Math.hypot(...polygonCentroid(b.polygon)) ||
        a.face.id.localeCompare(b.face.id)
    );
  // Rural mesh edges are bookkeeping boundaries, not streets. Adjacent field cells may
  // supply one long site, while roads, tracks and every non-field face remain excluded.
  if (fieldFaces.size) {
    const obstacles = new PlotIndex<Point[]>();
    for (const face of Object.values(source.mesh.faces).filter(f => !fieldFaces.has(f.id)))
      for (const part of convexInfillParts(facePoints(source.mesh, face))) obstacles.add(part, bounds(part));
    for (const id of fieldFaces)
      for (const neighbor of faceNeighbors(source.mesh, id)) {
        if (id >= neighbor || !fieldFaces.has(neighbor)) continue;
        const face = source.mesh.faces[id];
        const polygon = convexHull([
          ...facePoints(source.mesh, face),
          ...facePoints(source.mesh, source.mesh.faces[neighbor])
        ]);
        let parts = [polygon];
        for (const cut of [...fixed.query(bounds(polygon)), ...obstacles.query(bounds(polygon))])
          parts = parts.flatMap(p => subtractConvex(p, cut, 1));
        plots.push(...parts.map(polygon => ({ face, polygon })));
      }
  }
  const riverWater = classifyTownWater(source).parts.filter(p => p.kind === "river");
  const terrain = cityTerrain(source),
    moat = new MoatReservation(source),
    defense = new CastleDefenseClearance(source, approachBands(source));
  const placed: string[] = [],
    unplaced: { id: string; reason: string }[] = [];
  for (const request of requests) {
    if (request.riverbankMaxDistanceMeters !== undefined && !riverWater.length) {
      unplaced.push({ id: request.id, reason: "river-required" });
      continue;
    }
    if (document.landmarks?.some(l => l.id === request.id)) {
      unplaced.push({ id: request.id, reason: "duplicate-id" });
      continue;
    }
    let accepted: CityDocument | null = null;
    let trials = 0;
    for (const plot of plots) {
      if (request.zone && plot.face.properties.settlement !== request.zone) continue;
      const area = request.asset.minimumSite.reduce((n, p) => n + plotArea(p.outer), 0);
      if (plotArea(plot.polygon) + 1e-6 < area) continue;
      const entrance = request.asset.entrances.find(e => e.required);
      if (!entrance) continue;
      const normalLength = Math.hypot(...entrance.outward);
      const localNormal: Point = [entrance.outward[0] / normalLength, entrance.outward[1] / normalLength];
      const entryInset = Math.max(
        0,
        ...request.asset.minimumSite
          .flatMap(p => p.outer)
          .map(p => (p[0] - entrance.point[0]) * localNormal[0] + (p[1] - entrance.point[1]) * localNormal[1])
      );
      const box = bounds(plot.polygon),
        reach = widest / 2 + entryInset + 2;
      const plotCenter = polygonCentroid(plot.polygon);
      const nearby = frontageIndex
        .query([box[0] - reach, box[1] - reach, box[2] + reach, box[3] + reach])
        .map(frontage => ({ frontage, distance: nearestOnPolyline(plotCenter, frontage.points).dist }))
        .sort((a, b) => a.distance - b.distance);
      candidates: for (const { frontage } of nearby) {
        const [a, b] = frontage.points;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < Math.max(2.5, entrance.widthMeters + 0.3)) continue;
        const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        let normal: Point = [-tangent[1], tangent[0]];
        if ((a[0] - plotCenter[0]) * normal[0] + (a[1] - plotCenter[1]) * normal[1] < 0)
          normal = [-normal[0], -normal[1]];
        const rotation = Math.atan2(normal[1], normal[0]) - Math.atan2(localNormal[1], localNormal[0]);
        const localPose = { position: [0, 0] as Point, rotation, scale: 1 };
        const local = transformLandmarkPolygons(request.asset.minimumSite, localPose).flatMap(p => p.outer);
        let centers = plot.polygon;
        const sign = -Math.sign(polygonArea(plot.polygon));
        for (let i = 0; i < plot.polygon.length && centers.length >= 3; i++) {
          const p = plot.polygon[i],
            q = plot.polygon[(i + 1) % plot.polygon.length];
          const edgeNormal: Point = [sign * (q[1] - p[1]), sign * (p[0] - q[0])];
          const support = Math.max(...local.map(p => p[0] * edgeNormal[0] + p[1] * edgeNormal[1]));
          centers = clipHalfPlane(
            centers,
            edgeNormal,
            p[0] * edgeNormal[0] + p[1] * edgeNormal[1] - support - 0.001 * Math.hypot(...edgeNormal)
          );
        }
        const entry = transformLandmarkPoint(entrance.point, localPose);
        const dot = (p: Point, v: Point) => p[0] * v[0] + p[1] * v[1];
        const halfDoor = entrance.widthMeters / 2 + 0.15;
        const maxLengthMeters = frontage.widthMeters / 2 + entryInset + 2;
        centers = clipHalfPlane(
          centers,
          [-tangent[0], -tangent[1]],
          -(dot(a, tangent) + halfDoor - dot(entry, tangent))
        );
        centers = clipHalfPlane(centers, tangent, dot(b, tangent) - halfDoor - dot(entry, tangent));
        centers = clipHalfPlane(
          centers,
          [-normal[0], -normal[1]],
          -(dot(a, normal) - dot(entry, normal) - maxLengthMeters)
        );
        centers = clipHalfPlane(centers, normal, dot(a, normal) - dot(entry, normal));
        if (centers.length < 3 || plotArea(centers) < 1e-6) continue;
        const positions: Point[] = [
          ...centers.map(
            (p, i) =>
              [
                (p[0] + centers[(i + 1) % centers.length][0]) / 2,
                (p[1] + centers[(i + 1) % centers.length][1]) / 2
              ] as Point
          ),
          ...centers,
          polygonCentroid(centers)
        ];
        const ordered = positions
          .map(position => ({ position, distance: dot(a, normal) - dot(entry, normal) - dot(position, normal) }))
          .sort((a, b) => a.distance - b.distance);
        for (const { position } of ordered) {
          if (
            request.riverbankMaxDistanceMeters !== undefined &&
            Math.min(...riverWater.map(b => nearestOnPolyline(position, [...b.polygon, b.polygon[0]]).dist)) >
              request.riverbankMaxDistanceMeters
          )
            continue;
          if (++trials > 256) break candidates;
          const pose = { id: request.id, position, rotation, scale: 1 };
          const site = transformLandmarkPolygons(request.asset.minimumSite, pose);
          if (site.some(p => Math.abs(plotArea(intersectConvex(p.outer, plot.polygon)) - plotArea(p.outer)) > 1e-5))
            continue;
          const height = request.asset.bvModel?.heightMeters ?? 0;
          if ((effectiveHeightLimit(source, plot.face.id).maxHeightMeters ?? Infinity) < height) continue;
          if (
            site.some(p =>
              cappedLand
                .query(bounds(p.outer))
                .some(c => c.height < height && plotArea(intersectConvex(p.outer, c.polygon)) > 1e-6)
            )
          )
            continue;
          const result = placeLandmark(document, request.asset, pose, lanes, { frontage, maxLengthMeters });
          if (!result.document) continue;
          const instance = result.document.landmarks!.at(-1)!;
          const operating = [
            ...instance.site.map(p => p.outer),
            ...instance.accesses.flatMap(a => accessCorridor(a.points, a.widthMeters).map(p => p.outer))
          ];
          if (
            instance.accesses.some(access =>
              access.points.slice(1).some((b, i) => {
                const segment: [Point, Point] = [access.points[i], b];
                return [...streetIndex.query(bounds(segment)), ...accessIndex.query(bounds(segment))].some(other =>
                  crosses(segment, other)
                );
              })
            )
          )
            continue;
          const base = terrain.heightAt(position);
          if (
            operating.some(
              p =>
                protectedIndex.query(bounds(p)).some(c => plotArea(intersectConvex(p, c)) > 1e-6) ||
                moat.hitsPolygon(p) ||
                buildingHitsCivicLandmark(source, p) ||
                !defense.clears(p) ||
                [polygonCentroid(p), ...p].some(
                  q => !Number.isFinite(terrain.heightAt(q)) || Math.abs(terrain.heightAt(q) - base) > 0.02
                )
            )
          )
            continue;
          accepted = result.document;
          addAccesses(instance);
          const reservations = [
            ...instance.site.map(p => p.outer),
            ...instance.accesses.flatMap(a => accessCorridor(a.points, a.widthMeters).map(p => p.outer))
          ];
          for (const cut of reservations)
            plots = plots.flatMap(p => subtractConvex(p.polygon, cut, 1).map(polygon => ({ ...p, polygon })));
          break candidates;
        }
      }
      if (accepted || trials > 256) break;
    }
    if (accepted) {
      document = accepted;
      placed.push(request.id);
    } else unplaced.push({ id: request.id, reason: trials > 256 ? "candidate-limit" : "no-fitting-site-and-access" });
  }
  const after = placed.length ? buildBlockFabric(document) : fabric;
  const beforeMixed = landmarkDwellingCapacity(source),
    afterMixed = landmarkDwellingCapacity(document);
  const beforeCapacity =
      fabric.buildings.reduce((n, b) => n + residentialCapacity(b), 0) + beforeMixed.inside + beforeMixed.outside,
    afterCapacity =
      after.buildings.reduce((n, b) => n + residentialCapacity(b), 0) + afterMixed.inside + afterMixed.outside;
  return {
    document,
    placed,
    unplaced,
    housing: {
      requiredDwellings,
      beforeCapacity,
      afterCapacity,
      lostCapacity: Math.max(0, beforeCapacity - afterCapacity),
      shortfall: Math.max(0, requiredDwellings - afterCapacity)
    }
  };
}

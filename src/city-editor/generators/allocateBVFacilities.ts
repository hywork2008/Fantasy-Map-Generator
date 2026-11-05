import type { CityDocument, LandmarkAsset, Point } from "../types/document";
import { aerialLandmarkFootprints } from "./aerialFootprints";
import { buildBlockFabric } from "./blockInfill";
import type { DistrictFabric } from "./blockInfill.types";
import { effectiveHeightLimit } from "./buildingHeightLimits";
import { CastleDefenseClearance } from "./castleDefenseClearance";
import { buildingHitsCivicLandmark } from "./civicClearance";
import { nearestOnPolyline, polygonArea, polygonCentroid } from "./geom";
import { landmarkDwellingCapacity } from "./landmarkDwellings";
import { landmarkReservationParts, landmarkStreets } from "./landmarkIntegration";
import { buildLandmarkLaneNetwork } from "./landmarkLaneNetwork";
import { accessCorridor, placeLandmark, transformLandmarkPolygons } from "./landmarks";
import { clipHalfPlane, convexInfillParts, longestFrame } from "./lotGeometry";
import { facePoints } from "./mesh";
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
  requiredDwellings = source.populationPlan?.requiredDwellings ?? 0
) {
  let document = source;
  const blockedWards = new Set(["castle", "market", "cemetery", "park", "farm", "harbor"]);
  const protectedLand = [
    ...fabric.buildings.filter(b => b.landmark || source.mesh.faces[b.faceId]?.properties.locked).map(b => b.polygon),
    ...fabric.farms.map(f => f.polygon),
    ...(fabric.parks ?? []).flatMap(p => p.lawnPolygons),
    ...(fabric.openSpaces ?? []).map(s => s.polygon),
    ...(fabric.aerialLandmarks ? aerialLandmarkFootprints(fabric.aerialLandmarks) : []),
    ...(fabric.watermills?.mills ?? []).map(m => m.millhousePolygon),
    ...source.elements.filter(e => e.kind === "object").map(objectFootprint),
    ...classifyTownWater(source).parts.map(p => p.polygon),
    ...Object.values(source.mesh.faces)
      .filter(f => f.properties.locked || f.properties.water !== "land" || blockedWards.has(f.properties.ward ?? ""))
      .map(f => facePoints(source.mesh, f))
  ].flatMap(convexInfillParts);
  const streets = landmarkStreets(source, fabric.lanes);
  const streetCuts = streets.flatMap(s => accessCorridor(s.points, s.widthMeters).map(p => p.outer));
  const cuts = [...protectedLand, ...streetCuts, ...landmarkReservationParts(source)];
  const fixed = new PlotIndex<Point[]>();
  cuts.forEach(c => {
    fixed.add(c, bounds(c));
  });
  let plots = Object.values(source.mesh.faces)
    .filter(
      f =>
        f.properties.buildable &&
        !f.properties.locked &&
        f.properties.water === "land" &&
        !blockedWards.has(f.properties.ward ?? "")
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
  const riverWater = classifyTownWater(source).parts.filter(p => p.kind === "river");
  const lanes = buildLandmarkLaneNetwork(source, fabric.lanes);
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
      const axis = longestFrame(plot.polygon).axis;
      candidates: for (let turn = 0; turn < 4; turn++) {
        const rotation = Math.atan2(axis[1], axis[0]) + (turn * Math.PI) / 2;
        const local = transformLandmarkPolygons(request.asset.minimumSite, {
          position: [0, 0],
          rotation,
          scale: 1
        }).flatMap(p => p.outer);
        let centers = plot.polygon;
        const sign = -Math.sign(polygonArea(plot.polygon));
        for (let i = 0; i < plot.polygon.length && centers.length >= 3; i++) {
          const a = plot.polygon[i],
            b = plot.polygon[(i + 1) % plot.polygon.length];
          const normal: Point = [sign * (b[1] - a[1]), sign * (a[0] - b[0])];
          const support = Math.max(...local.map(p => p[0] * normal[0] + p[1] * normal[1]));
          centers = clipHalfPlane(centers, normal, a[0] * normal[0] + a[1] * normal[1] - support - 1e-5);
        }
        if (centers.length < 3 || plotArea(centers) < 1e-6) continue;
        const center = polygonCentroid(centers);
        const positions: Point[] = [
          center,
          ...centers.map(p => [p[0] * 0.99 + center[0] * 0.01, p[1] * 0.99 + center[1] * 0.01] as Point)
        ];
        const streetDistance = (p: Point) => Math.min(...streets.map(s => nearestOnPolyline(p, s.points).dist));
        positions.sort((a, b) => streetDistance(a) - streetDistance(b));
        for (const position of positions) {
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
          const result = placeLandmark(document, request.asset, pose, lanes);
          if (!result.document) continue;
          const instance = result.document.landmarks!.at(-1)!;
          const operating = [
            ...instance.site.map(p => p.outer),
            ...instance.accesses.flatMap(a => accessCorridor(a.points, a.widthMeters).map(p => p.outer))
          ];
          const base = terrain.heightAt(position);
          if (
            operating.some(
              p =>
                protectedLand.some(c => plotArea(intersectConvex(p, c)) > 1e-6) ||
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

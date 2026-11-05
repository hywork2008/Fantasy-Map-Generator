import { aerialLandmarkFootprints } from "../generators/aerialFootprints";
import { buildBlockFabric } from "../generators/blockInfill";
import type { DistrictFabric } from "../generators/blockInfill.types";
import { effectiveHeightLimit } from "../generators/buildingHeightLimits";
import { CastleDefenseClearance } from "../generators/castleDefenseClearance";
import { buildingHitsCivicLandmark } from "../generators/civicClearance";
import { nearestOnPolyline, polygonCentroid } from "../generators/geom";
import { landmarkReservationParts, landmarkStreets } from "../generators/landmarkIntegration";
import { buildLandmarkLaneNetwork } from "../generators/landmarkLaneNetwork";
import { accessCorridor, placeLandmark, transformLandmarkPolygons } from "../generators/landmarks";
import { convexInfillParts, longestFrame } from "../generators/lotGeometry";
import { facePoints } from "../generators/mesh";
import { MoatReservation } from "../generators/moats";
import { objectFootprint } from "../generators/objectPlacement";
import { bounds, intersectConvex, PlotIndex, plotArea, subtractConvex } from "../generators/parcelGeometry";
import { residentialCapacity } from "../generators/residentialCapacityFormula";
import { approachBands } from "../generators/suburbanLanduse";
import { cityTerrain } from "../generators/terrainElevation";
import { classifyTownWater } from "../generators/townWater";
import type { CityDocument, LandmarkAsset, Point } from "../types/document";

export interface BVFacilityRequest {
  id: string;
  asset: LandmarkAsset;
  zone?: "core" | "outskirts";
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
  const lanes = buildLandmarkLaneNetwork(source, fabric.lanes);
  const terrain = cityTerrain(source),
    moat = new MoatReservation(source),
    defense = new CastleDefenseClearance(source, approachBands(source));
  const placed: string[] = [],
    unplaced: { id: string; reason: string }[] = [];
  for (const request of requests) {
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
      const center = polygonCentroid(plot.polygon),
        axis = longestFrame(plot.polygon).axis;
      const positions = [
        center,
        ...fabric.buildings
          .filter(b => b.faceId === plot.face.id && !b.landmark)
          .slice(0, 16)
          .map(b => polygonCentroid(b.polygon))
      ];
      candidates: for (const position of positions) {
        const nearest = streets.map(s => nearestOnPolyline(position, s.points)).sort((a, b) => a.dist - b.dist)[0];
        const outward = request.asset.entrances.find(e => e.required)?.outward ?? [0, -1];
        const rotations = Array.from(
          { length: 4 },
          (_, turn) => Math.atan2(axis[1], axis[0]) + (turn * Math.PI) / 2
        ).sort((a, b) => {
          if (!nearest) return 0;
          const score = (angle: number) =>
            (outward[0] * Math.cos(angle) - outward[1] * Math.sin(angle)) * (nearest.point[0] - position[0]) +
            (outward[0] * Math.sin(angle) + outward[1] * Math.cos(angle)) * (nearest.point[1] - position[1]);
          return score(b) - score(a);
        });
        for (const rotation of rotations) {
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
  const beforeCapacity = fabric.buildings.reduce((n, b) => n + residentialCapacity(b), 0),
    afterCapacity = after.buildings.reduce((n, b) => n + residentialCapacity(b), 0);
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

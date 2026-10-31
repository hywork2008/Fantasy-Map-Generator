import type { CityDocument, Point } from "../../../types/document";
import {
  orientedRectPolylineDistance,
  orientTempleHybrid,
  placeAndClearTempleRect,
  polygonHitsOrientedRect,
  templeFitsLand,
  templeHazards,
  templeRectForElement
} from "../../civicPlacement";
import { COASTAL_BUILDING_SETBACK_METERS, oceanShoreSegments } from "../../coastalSuitability";
import { featureGroupVertices } from "../../features";
import { pointInPolygon, polygonCentroid } from "../../geom";
import { templeReservationMeters } from "../../housing";
import { facePoints } from "../../mesh";
import { townExtentMeters } from "../../settlementExtent";

/** Push the temple nave off finished roads, rivers and walls, then re-align it. */
export function settleTempleOnDocument(document: CityDocument): void {
  const temple = document.elements.find(element => element.kind === "temple" && element.point);
  if (!temple?.point) return;
  const roads: Point[][] = [];
  const rivers: Point[][] = [];
  const hazards: { points: Point[]; clearance: number }[] = [];
  const walls: { points: Point[]; clearance: number }[] = [];
  for (const group of document.featureGroups) {
    if (group.kind === "wall") {
      const points = featureGroupVertices(document, group)
        .map(id => document.mesh.vertices[id]?.point)
        .filter((p): p is Point => !!p);
      if (points.length >= 2) {
        const wall = { points, clearance: group.style.widthMeters / 2 + 4 };
        walls.push(wall);
        hazards.push(wall);
      }
    } else if (group.kind === "road") {
      const points = featureGroupVertices(document, group)
        .map(id => document.mesh.vertices[id]?.point)
        .filter((p): p is Point => !!p);
      if (points.length < 2) continue;
      roads.push(points);
      hazards.push({ points, clearance: Math.max(group.style.widthMeters / 2 + 2.2, 10.2) });
    } else if (group.kind === "river") {
      const points = group.vertices.map(id => document.mesh.vertices[id]?.point).filter((p): p is Point => !!p);
      if (points.length < 2) continue;
      rivers.push(points);
      hazards.push({ points, clearance: Math.max(group.style.widthMeters / 2 + 2, 10.2) });
    }
  }
  const land: Point[][] = [];
  const water: Point[][] = [];
  for (const face of Object.values(document.mesh.faces)) {
    (face.properties.water === "land" ? land : water).push(facePoints(document.mesh, face));
  }
  // Coast and map boundaries prevent the clearance nudge from escaping dry land.
  for (const edge of Object.values(document.mesh.edges)) {
    const left = edge.leftFace ? document.mesh.faces[edge.leftFace] : undefined;
    const right = edge.rightFace ? document.mesh.faces[edge.rightFace] : undefined;
    if ((left?.properties.water === "land") === (right?.properties.water === "land")) continue;
    hazards.push({
      points: [document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point],
      clearance: 2
    });
  }
  // The rendered beach occupies roughly 17 m inland from an ocean edge.
  // Give a cathedral at least the same inland setback as ordinary buildings.
  for (const [a, b] of oceanShoreSegments(document)) {
    hazards.push({ points: [a, b], clearance: COASTAL_BUILDING_SETBACK_METERS });
  }
  const plazaGuides: Point[][] = [];
  const plaza = document.elements.find(element => element.kind === "plaza");
  if (plaza) {
    for (const id of plaza.faceIds) {
      const face = document.mesh.faces[id];
      if (!face) continue;
      const ring = facePoints(document.mesh, face);
      if (ring.length >= 3) plazaGuides.push([...ring, ring[0]]);
    }
  }
  const guides = [...roads, ...plazaGuides];
  const parkPlots = Object.values(document.mesh.faces)
    .filter(face => face.properties.ward === "park" || face.properties.ward === "cemetery")
    .map(face => facePoints(document.mesh, face));
  const reservation = templeReservationMeters(townExtentMeters(document.frame), temple.sizeMeters, temple.templeType);
  let rect = placeAndClearTempleRect(
    temple.point,
    townExtentMeters(document.frame),
    guides,
    hazards.length ? hazards : templeHazards(roads, rivers, townExtentMeters(document.frame)),
    reservation
  );
  const validSite = (candidate: typeof rect): boolean =>
    hazards.every(hazard => orientedRectPolylineDistance(candidate, hazard.points) >= hazard.clearance - 0.2) &&
    !parkPlots.some(plot => polygonHitsOrientedRect(plot, candidate)) &&
    templeFitsLand(candidate, land, water);
  if (!validSite(rect)) {
    const candidates = Object.values(document.mesh.faces)
      .filter(
        face =>
          face.properties.settlement === "core" && face.properties.water === "land" && face.properties.ward !== "park"
      )
      .map(face => polygonCentroid(facePoints(document.mesh, face)))
      .sort(
        (a, b) =>
          Math.hypot(a[0] - temple.point![0], a[1] - temple.point![1]) -
          Math.hypot(b[0] - temple.point![0], b[1] - temple.point![1])
      );
    for (const center of candidates) {
      const candidate = placeAndClearTempleRect(center, townExtentMeters(document.frame), guides, hazards, reservation);
      if (!validSite(candidate)) continue;
      rect = candidate;
      break;
    }
    // A cramped town may have no site large enough for the nave and its clearance.
    if (!validSite(rect)) {
      document.elements = document.elements.filter(element => element !== temple);
      return;
    }
  }
  const plazaCenter = plaza?.point ?? (plazaGuides.length ? polygonCentroid(plazaGuides[0]) : undefined);
  temple.point = rect.center;
  temple.rotation = orientTempleHybrid(rect.center, rect.rotation, plazaCenter, document.historicalPeriod);

  const nave = templeRectForElement(
    temple.point,
    temple.sizeMeters,
    temple.rotation,
    townExtentMeters(document.frame),
    temple.templeType
  );
  const hitFaces = Object.values(document.mesh.faces).filter(face => {
    const poly = facePoints(document.mesh, face);
    return pointInPolygon(temple.point!, poly) || polygonHitsOrientedRect(poly, nave);
  });
  if (hitFaces.length) {
    temple.faceIds = hitFaces.map(f => f.id);
  }
}

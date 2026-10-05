import { footprintTouchesWater } from "../../services/riverPhysicalGeometry";
import { regionalRevision } from "../../types/cityRegional";
import { riverRibbons } from "../core/bridgeDeck";
import { featureGroupVertices } from "../core/features";
import { reservedCastleFaces } from "../core/fortifications";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../core/gen/geom";
import { landmarkReservationHits } from "../core/landmarks";
import { facePoints } from "../core/mesh";
import { MoatReservation } from "../core/moats";
import type { CityDocument, Point } from "../core/types";
import { polygonHitsWater } from "../core/waterGeometry";
import { fixedDocumentGeometry } from "./fixedDocumentGeometry";

export const PREVIEW_SYMBOL_BUDGET = 300;
export const PREVIEW_BLOCK_SYMBOL_BUDGET = 3;

/** A fixed number of direct candidates per block, never lot subdivision/infill. */
export function renderPreviewSymbols(city: CityDocument): SVGGElement {
  const ns = "http://www.w3.org/2000/svg";
  const layer = document.createElementNS(ns, "g");
  layer.setAttribute("class", "ce-preview-symbols");
  layer.setAttribute("pointer-events", "none");
  const fixed = fixedDocumentGeometry(city);
  if (city.importedFixedCrossings && !fixed) return layer;
  const reserved = reservedCastleFaces(city);
  for (const item of city.elements) for (const id of item.faceIds) reserved.add(id);
  const roads = city.featureGroups.flatMap(group =>
    group.kind === "road"
      ? [
          {
            points: featureGroupVertices(city, group).map(id => city.mesh.vertices[id].point),
            width: group.style.widthMeters
          }
        ]
      : []
  );
  if (fixed)
    for (const crossing of fixed.crossings) {
      roads.push({
        points: [crossing.approachA, crossing.deckA, crossing.deckB, crossing.approachB].map(p => [p[0], p[1]]),
        width: fixed.roadWidthMeters
      });
    }
  const approachBoxes = (city.fixedCrossingApproaches ?? []).flatMap(approach =>
    approach.corridor.pieces.map(piece => {
      const padding = (fixed?.roadWidthMeters ?? 6) / 2 + 7;
      const points =
        piece.kind === "arc"
          ? [
              [piece.center[0] - piece.radiusMeters, piece.center[1] - piece.radiusMeters],
              [piece.center[0] + piece.radiusMeters, piece.center[1] + piece.radiusMeters]
            ]
          : [piece.start, piece.end];
      return {
        minX: Math.min(...points.map(p => p[0])) - padding,
        minY: Math.min(...points.map(p => p[1])) - padding,
        maxX: Math.max(...points.map(p => p[0])) + padding,
        maxY: Math.max(...points.map(p => p[1])) + padding
      };
    })
  );
  const moats = new MoatReservation(city);
  const ribbons = riverRibbons(city);
  const wet = (city.waterAreas ?? []).map(area => area.polygon);
  const faces = Object.values(city.mesh.faces).filter(
    face =>
      face.properties.water === "land" &&
      face.properties.buildable &&
      !reserved.has(face.id) &&
      ["merchant", "craftsmen", "patriciate"].includes(face.properties.ward ?? "")
  );
  // Seed and stable block identity distribute the bounded budget across the city.
  faces.sort((a, b) =>
    regionalRevision([city.generationSeed, a.id]).localeCompare(regionalRevision([city.generationSeed, b.id]))
  );
  let count = 0;
  for (const face of faces) {
    if (count >= PREVIEW_SYMBOL_BUDGET) break;
    const outline = facePoints(city.mesh, face);
    if (outline.length < 3 || outline.length > 16) continue;
    const centroid = polygonCentroid(outline);
    const offset = parseInt(regionalRevision([city.generationSeed, face.id]), 16) % outline.length;
    const ring = [...outline, outline[0]];
    for (let candidate = 0; candidate < PREVIEW_BLOCK_SYMBOL_BUDGET && count < PREVIEW_SYMBOL_BUDGET; candidate++) {
      const vertex = outline[(offset + candidate) % outline.length];
      const center: Point = candidate === 0 ? centroid : [(centroid[0] + vertex[0]) / 2, (centroid[1] + vertex[1]) / 2];
      // Circumscribed circle is also a conservative reservation against corridors.
      if (
        nearestOnPolyline(center, ring).dist < 12 ||
        roads.some(road => nearestOnPolyline(center, road.points).dist < road.width / 2 + 7) ||
        ribbons.some(river => nearestOnPolyline(center, river.points).dist < river.width / 2 + 7)
      )
        continue;
      const polygon: Point[] = [
        [center[0] - 4, center[1] - 5],
        [center[0] + 4, center[1] - 5],
        [center[0] + 4, center[1] + 5],
        [center[0] - 4, center[1] + 5]
      ];
      if (
        !polygon.every(p => pointInPolygon(p, outline)) ||
        polygonHitsWater(polygon, wet) ||
        (fixed && [...fixed.rivers, ...(fixed.obstacles ?? [])].some(body => footprintTouchesWater(polygon, body))) ||
        moats.hitsPolygon(polygon) ||
        approachBoxes.some(
          box => center[0] >= box.minX && center[0] <= box.maxX && center[1] >= box.minY && center[1] <= box.maxY
        ) ||
        landmarkReservationHits(city, polygon)
      )
        continue;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", `${polygon.map((p, i) => `${i ? "L" : "M"}${p[0]} ${-p[1]}`).join(" ")} Z`);
      path.setAttribute("fill", "#746653");
      path.setAttribute("data-preview-block", face.id);
      layer.appendChild(path);
      count++;
    }
  }
  return layer;
}

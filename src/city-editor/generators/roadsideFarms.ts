import type { CityDocument, Point } from "../types/document";
import { normalizeApproachBeyond } from "./approachBeyond";
import { cultivableParts, oceanShoreSegments } from "./coastalSuitability";
import { nearestOnPolyline, polygonCentroid } from "./geom";
import { facePoints } from "./mesh";

/** Fill the rural land beside external approaches after their destinations are known. */
export function cultivateRoadside(document: CityDocument): void {
  if (document.ruralFieldVersion === 1) {
    cultivateCountryside(document);
    return;
  }
  const shore = oceanShoreSegments(document);
  const roads = document.featureGroups
    .flatMap(group =>
      group.kind === "road" && group.beyond
        ? [
            {
              hostile: normalizeApproachBeyond(group.beyond)?.realm.relation === "Enemy",
              width: group.style.widthMeters,
              lines: group.segments.flatMap(ref => {
                const edge = document.mesh.edges[ref.edgeId];
                const a = edge && document.mesh.vertices[edge.a]?.point;
                const b = edge && document.mesh.vertices[edge.b]?.point;
                return a && b ? [[a, b] as Point[]] : [];
              })
            }
          ]
        : []
    )
    .filter(road => road.lines.length);
  if (!roads.length) return;

  // Two or three coarse cells on either side form a continuous cultivated belt.
  const reach = Math.max(document.frame.blockSizeMeters * 2.5, document.frame.cityRadiusMeters * 0.45);
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.locked || face.properties.water !== "land" || face.properties.settlement === "core") continue;
    if (face.properties.ward && face.properties.ward !== "empty" && face.properties.ward !== "farm") continue;
    const polygon = facePoints(document.mesh, face);
    if (!cultivableParts(polygon, shore).length) {
      if (face.properties.ward === "farm") face.properties.ward = "empty";
      continue;
    }
    const center = polygonCentroid(polygon);
    let nearest: { distance: number; hostile: boolean } | undefined;
    for (const road of roads) {
      for (const line of road.lines) {
        const distance = nearestOnPolyline(center, line).dist - road.width / 2;
        if (!nearest || distance < nearest.distance) nearest = { distance, hostile: road.hostile };
      }
    }
    if (!nearest || nearest.distance > reach) continue;
    if (nearest.hostile) {
      // The hostile approach remains an uncultivated corridor even when the
      // earlier ward pass happened to select a farm here.
      if (face.properties.ward === "farm") face.properties.ward = "empty";
      continue;
    }
    face.properties.ward = "farm";
    face.properties.buildable = true;
    face.properties.settlement = "outskirts";
  }
}

/** Choose a finite hinterland around the town, independently of highway strips.
 * The downstream planner reserves access, dry land and the actual net-area budget. */
function cultivateCountryside(document: CityDocument): void {
  const shore = oceanShoreSegments(document);
  const reserved = new Set(document.elements.flatMap(element => element.faceIds));
  const budget = document.farmlandAreaHectares;
  const radius = document.frame.cityRadiusMeters;
  const reach = Math.min(
    document.frame.extentMeters,
    Math.max(
      document.frame.blockSizeMeters * 3,
      radius * (budget === undefined ? 2 : 1.4),
      Math.sqrt(radius * radius + (Math.max(0, budget ?? 0) * 10_000 * 2) / Math.PI)
    )
  );
  for (const face of Object.values(document.mesh.faces)) {
    if (
      face.properties.locked ||
      reserved.has(face.id) ||
      face.properties.water !== "land" ||
      face.properties.settlement === "core"
    )
      continue;
    if (face.properties.ward && face.properties.ward !== "empty" && face.properties.ward !== "farm") continue;
    const polygon = facePoints(document.mesh, face);
    const center = polygonCentroid(polygon);
    if (budget === 0 || Math.hypot(...center) > reach || !cultivableParts(polygon, shore).length) {
      if (face.properties.ward === "farm") face.properties.ward = "empty";
      continue;
    }
    face.properties.ward = "farm";
    face.properties.buildable = true;
    face.properties.settlement = "outskirts";
  }
}

/** Explicit, undoable upgrade of a saved city's countryside. */
export function regenerateRuralLand(document: CityDocument): CityDocument {
  const next = structuredClone(document);
  next.ruralFieldVersion = 1;
  cultivateRoadside(next);
  return next;
}

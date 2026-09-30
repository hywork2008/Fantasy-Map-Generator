import { facePoints } from "../mesh";
import type { CityDocument, Point } from "../types";
import { normalizeApproachBeyond } from "./approachBeyond";
import { nearestOnPolyline, polygonCentroid } from "./geom";

/** Fill the rural land beside external approaches after their destinations are known. */
export function cultivateRoadside(document: CityDocument): void {
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
    const center = polygonCentroid(facePoints(document.mesh, face));
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

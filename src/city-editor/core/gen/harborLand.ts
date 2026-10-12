import { faceNeighbors, facePoints } from "../mesh";
import type { CityDocument, Id, Point } from "../types";
import { cellInsideWaterPolygons, waterPolygons } from "../waterGeometry";
import { pointInPolygon } from "./geom";

export function harborLandFace(document: CityDocument, id: Id): boolean {
  const face = document.mesh.faces[id];
  return (
    !!face &&
    face.properties.water === "land" &&
    face.properties.ward === "harbor" &&
    face.properties.buildable &&
    !cellInsideWaterPolygons(facePoints(document.mesh, face), waterPolygons(document))
  );
}

/** A berth needs a dry root on its owning ward, even when the adjacent
 * coarse water cell still has a plausible sea-facing edge. */
export function harborRootIsDry(document: CityDocument, id: Id, root: Point): boolean {
  const face = document.mesh.faces[id];
  return (
    !!face &&
    face.properties.water === "land" &&
    face.properties.ward === "harbor" &&
    face.properties.buildable &&
    pointInPolygon(root, facePoints(document.mesh, face)) &&
    !waterPolygons(document).some(p => pointInPolygon(root, p))
  );
}

/** Ships are stored on water faces: their land owner is needed to remove
 * them along with a flooded ward rather than leave them in neighbouring cells. */
export function pruneInvalidHarbors(document: CityDocument): void {
  const oldHarbors = new Set([
    ...Object.values(document.mesh.faces)
      .filter(f => f.properties.ward === "harbor")
      .map(f => f.id),
    ...document.elements.filter(e => e.kind === "harbor").flatMap(e => e.faceIds)
  ]);
  const valid = new Set(
    Object.values(document.mesh.faces)
      .filter(f => harborLandFace(document, f.id))
      .map(f => f.id)
  );
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.ward === "harbor" && !valid.has(face.id) && !face.properties.locked) {
      face.properties.ward = null;
      face.properties.buildable = false;
    }
  }
  document.elements = document.elements.filter(element => {
    if (element.locked) return true;
    if (element.harborFaceId) return valid.has(element.harborFaceId);
    // Earlier documents stored only the receiving water cell on ships.
    // Remove those generated ships if their adjacent harbour has disappeared.
    if (element.kind === "ship" && element.id.startsWith("gc:")) {
      const owners = element.faceIds
        .flatMap(id => (document.mesh.faces[id] ? faceNeighbors(document.mesh, id) : []))
        .filter(id => oldHarbors.has(id));
      if (owners.length && !owners.some(id => valid.has(id))) return false;
    }
    if (element.kind !== "harbor") return true;
    element.faceIds = element.faceIds.filter(id => valid.has(id));
    return element.faceIds.length > 0;
  });
}

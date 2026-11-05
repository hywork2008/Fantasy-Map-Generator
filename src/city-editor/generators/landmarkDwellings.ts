import type { CityDocument } from "../types/document";
import { pointInPolygon } from "./geom";
import { facePoints } from "./mesh";

/** Count explicitly modelled dwellings once, independently of the ordinary lots they replace. */
export function landmarkDwellingCapacity(document: CityDocument) {
  let inside = 0,
    outside = 0;
  for (const instance of document.landmarks ?? []) {
    const asset = document.landmarkAssets?.find(
      a => a.id === instance.assetId && a.revision === instance.assetRevision
    );
    const capacity = asset?.residentialDwellings ?? 0;
    if (!capacity) continue;
    const face = Object.values(document.mesh.faces).find(f =>
      pointInPolygon(instance.position, facePoints(document.mesh, f))
    );
    if (face?.properties.settlement === "core") inside += capacity;
    if (face?.properties.settlement === "outskirts") outside += capacity;
  }
  return { inside, outside };
}

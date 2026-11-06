import type { VectorCityDocument, VectorPath } from "../../../types/vector/document";
import { replaceVectorPath } from "./paths";
/** Defer only repairable automatic bridge validation to the dependency transaction. */
export function replaceVectorPathCandidate(document: VectorCityDocument, candidate: VectorPath): VectorCityDocument {
  const doc = structuredClone(document);
  for (const bridge of Object.values(doc.connections.bridges))
    if (
      (bridge.riverAnchor.pathId === candidate.id || bridge.roadPathId === candidate.id) &&
      bridge.editPolicy === "editable" &&
      doc.paths[bridge.roadPathId].origin === "automatic" &&
      doc.paths[bridge.roadPathId].editPolicy === "editable"
    )
      delete doc.connections.bridges[bridge.id];
  return replaceVectorPath(doc, candidate);
}

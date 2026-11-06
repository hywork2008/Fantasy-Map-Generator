import type { CityDocument } from "./document";
import type { VectorCityDocument } from "./vector/document";

/** Dispatch at the editor boundary; mesh-only functions retain CityDocument. */
export type EditorDocument = CityDocument | VectorCityDocument;

export function isVectorDocument(document: EditorDocument): document is VectorCityDocument {
  return document.format === "fmg-vector-city";
}

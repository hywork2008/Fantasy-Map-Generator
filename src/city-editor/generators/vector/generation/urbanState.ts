import type { VectorCityDocument } from "../../../types/vector/document";
/** Ownership evidence excludes the evidence itself and display-only stage selection. */
export function vectorUrbanFingerprint(doc: VectorCityDocument): string {
  return JSON.stringify({
    paths: doc.paths,
    connections: doc.connections,
    placements: doc.placements,
    regions: doc.regions,
    context: doc.context,
    site: doc.site,
    recipe: doc.recipe
  });
}

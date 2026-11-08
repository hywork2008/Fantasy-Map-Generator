import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorUrbanAlgorithm } from "../../../types/vector/urban";

/** Output-changing revisions bump this; recipe links refuse documents adopted by another version. */
export const VECTOR_URBAN_ALGORITHM: VectorUrbanAlgorithm = "vector-urban-v6";

/** Ownership evidence excludes the evidence itself and display-only stage selection. */
function urbanState(doc: VectorCityDocument): string {
  return JSON.stringify({
    paths: doc.paths,
    connections: doc.connections,
    placements: doc.placements,
    regions: doc.regions,
    context: doc.context,
    site: doc.site,
    recipe: doc.recipe,
    ...(doc.environment
      ? {
          environment: {
            features: doc.environment.features,
            landscape: doc.environment.landscape,
            harbor: doc.environment.harbor,
            defenses: doc.environment.defenses,
            terrain: doc.environment.terrain
          }
        }
      : {}),
    // Fabric records carry content hashes; the fingerprint never re-serialises their packed geometry.
    ...(doc.fabric
      ? {
          fabric: [
            doc.fabric.algorithm,
            Object.values(doc.fabric.districts).map(d => d.hash),
            Object.values(doc.fabric.cells).map(c => c.hash)
          ]
        }
      : {})
  });
}

/** Compact ownership evidence; legacy files stored the complete JSON a second time. */
export function vectorUrbanFingerprint(doc: VectorCityDocument): string {
  const value = urbanState(doc);
  let a = 0x811c9dc5,
    b = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
  }
  return `urban-v2:${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
export function matchesVectorUrbanFingerprint(doc: VectorCityDocument, fingerprint: string) {
  return fingerprint === (fingerprint.startsWith("{") ? urbanState(doc) : vectorUrbanFingerprint(doc));
}

import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorUrbanAlgorithm } from "../../../types/vector/urban";

/** Output-changing revisions bump this; recipe links refuse documents adopted by another version. */
export const VECTOR_URBAN_ALGORITHM: VectorUrbanAlgorithm = "vector-urban-v16";

/** The requested settings without the housing culture, which changes how houses look, not what was generated: it
 * is applied to the open city without regenerating it. */
function generatedContext(context: VectorCityDocument["context"]): VectorCityDocument["context"] {
  const requested = context.requestedSettings as { buildingAppearanceProfile?: unknown } | undefined;
  if (!requested || !("buildingAppearanceProfile" in requested)) return context;
  const { buildingAppearanceProfile: _look, ...rest } = requested;
  return { ...context, requestedSettings: rest as NonNullable<VectorCityDocument["context"]["requestedSettings"]> };
}

/** Ownership evidence excludes the evidence itself, display-only stage selection and the housing culture.
 * `legacy` keeps the culture, as documents adopted before it became display-only were fingerprinted. */
function urbanState(doc: VectorCityDocument, legacy = false): string {
  return JSON.stringify({
    paths: doc.paths,
    connections: doc.connections,
    placements: doc.placements,
    regions: doc.regions,
    context: legacy ? doc.context : generatedContext(doc.context),
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
export function vectorUrbanFingerprint(doc: VectorCityDocument, legacy = false): string {
  const value = urbanState(doc, legacy);
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
  return fingerprint.startsWith("{")
    ? fingerprint === urbanState(doc) || fingerprint === urbanState(doc, true)
    : fingerprint === vectorUrbanFingerprint(doc) || fingerprint === vectorUrbanFingerprint(doc, true);
}

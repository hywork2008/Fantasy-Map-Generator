import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorUrbanAlgorithm, VectorUrbanSettings } from "../../../types/vector/urban";

/** Output-changing revisions bump this; recipe links refuse documents adopted by another version. */
// v21–v23: the Opus shop-house workhomes (docs/plan/bv-workhome-facade-variation.md W3, W4) on each plot fabric.
// v24–v26: guild halls by the town's culture and size (same plan, W5a).
// v27–v29: German-style guild houses as town houses in the street row (W5b).
// v30–v32: an English-style town's guildhall in its market place (W5c).
// v33–v34: burgage town trades as a shop-house and its rear works (docs/plan/ce-town-trade-rear-works.md R2).
// v35–v36: fishmongers and butchers so too, in the rows facing the market place (same plan, R3).
// v37–v38: a rear works stands only in the backland, clear of the streets beside or behind its plot; a street block
// bent by a gate road is inset edge by edge, not cut into long triangles.
// v39–v40: a cut from a block's notch leaves its wedge open; no front house is a wedge's corner.
// v41–v43: the Opus ropewalk (docs/plan/opus-ropewalk.md): same plot and door, its own height.
// v44–v45: each butcher his own shop in the Butcher Row of a burgage town (ce-town-trade-rear-works.md §10.8).
// v46–v48: ropewalks beside the roads out of the gates (docs/plan/ce-outskirts-workshop-sizes.md S1).
// v47–v49: the Opus smithy after Newington on a 10 x 8 m envelope (same plan, S2); the ropewalks behind the row
// facing the road, a lane to their door (§8.2).
// v48–v50: coopers at the inland rate of York, more in ports (same plan, S3).
// v49–v51: ropewalks as long as the ground allows (54 to 180 m, a port's to 300 m), along the wall when no road
// has room, else left unplaced (same plan, §8.9).
// v50–v52: a coastal town's ropewalks too, its wall closed along the shore for them (same plan, §8.11).
export const VECTOR_URBAN_ALGORITHM: VectorUrbanAlgorithm = "vector-urban-v50";
/** Burgage plots (docs/plan/ce-burgage-plot-fabric.md) are their own revision. */
export const VECTOR_URBAN_BURGAGE_ALGORITHM: VectorUrbanAlgorithm = "vector-urban-v51";
/** Dense burgage plots (plan §8.7). */
export const VECTOR_URBAN_DENSE_BURGAGE_ALGORITHM: VectorUrbanAlgorithm = "vector-urban-v52";

/** The algorithm that generates with these settings. */
export function vectorUrbanAlgorithm(
  settings: Pick<VectorUrbanSettings, "plotFabric"> | undefined
): VectorUrbanAlgorithm {
  return settings?.plotFabric === "burgage"
    ? VECTOR_URBAN_BURGAGE_ALGORITHM
    : settings?.plotFabric === "burgage-dense"
      ? VECTOR_URBAN_DENSE_BURGAGE_ALGORITHM
      : VECTOR_URBAN_ALGORITHM;
}

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

import type { ProcessingProfiler } from "../../utils/processingProfiler";
import type { CityDocument } from "../types/document";
import { buildBlockFabric, documentFabricFingerprint } from "./blockInfill";
import { hasForestState } from "./forestSettings";
import type { FabricCache } from "./localInfill";
import { regenerateRuralLand } from "./roadsideFarms";
import { applyRuralFields } from "./ruralFields";
import { installLotPads } from "./terrainField/pads";

/** Capture the same geometry as Regenerate farmland in a portable stage result. */
export function generateRuralFieldStage(
  document: CityDocument,
  options?: {
    preserveLandUse?: boolean;
    createLotPads?: boolean;
    fabricCache?: FabricCache;
    profiler?: ProcessingProfiler;
  }
): CityDocument {
  if (document.appearance !== "town") {
    if (options?.createLotPads && document.terrain?.field)
      installLotPads(document, buildBlockFabric(document).buildings);
    return document;
  }
  const next: CityDocument = {
    ...document,
    ruralFieldVersion: 2,
    ruralFieldSettings: {
      ...document.ruralFieldSettings,
      coveragePercent: document.ruralFieldSettings?.coveragePercent ?? 70
    }
  };
  if (hasForestState(next)) next.version = 6;
  if (!options?.createLotPads && next.ruralFieldSnapshot?.fingerprint === documentFabricFingerprint(next)) return next;
  delete next.ruralFieldSnapshot;
  const regenerated = options?.preserveLandUse ? next : regenerateRuralLand(next);
  const fingerprint = documentFabricFingerprint(regenerated);
  // Pad generation shares the final fabric already needed for farmland.
  const fabric = buildBlockFabric(regenerated, options?.fabricCache, options?.profiler);
  if (options?.createLotPads && regenerated.terrain?.field) {
    regenerated.terrain = { ...regenerated.terrain, features: [...regenerated.terrain.features] };
    installLotPads(regenerated, fabric.buildings);
  }
  const result = applyRuralFields(regenerated, fabric);
  regenerated.ruralFieldSnapshot = {
    fingerprint,
    farms: result.farms,
    lanes: result.lanes,
    ruralFields: result.ruralFields
  };
  return regenerated;
}

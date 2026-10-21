import type { CityDocument } from "../types/document";
import { buildBlockFabric, documentFabricFingerprint } from "./blockInfill";
import { regenerateRuralLand } from "./roadsideFarms";
import { applyRuralFields } from "./ruralFields";

/** Capture the same geometry as Regenerate farmland in a portable stage result. */
export function generateRuralFieldStage(document: CityDocument): CityDocument {
  if (document.appearance !== "town") return document;
  const next: CityDocument = {
    ...document,
    ruralFieldVersion: 2,
    ruralFieldSettings: {
      ...document.ruralFieldSettings,
      coveragePercent: document.ruralFieldSettings?.coveragePercent ?? 70
    }
  };
  if (next.ruralFieldSnapshot?.fingerprint === documentFabricFingerprint(next)) return next;
  delete next.ruralFieldSnapshot;
  const regenerated = regenerateRuralLand(next);
  const fingerprint = documentFabricFingerprint(regenerated);
  const result = applyRuralFields(regenerated, buildBlockFabric(regenerated));
  regenerated.ruralFieldSnapshot = {
    fingerprint,
    farms: result.farms,
    lanes: result.lanes,
    ruralFields: result.ruralFields
  };
  return regenerated;
}

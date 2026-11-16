import { BUILDING_APPEARANCE_PROFILES, type BuildingAppearanceProfile } from "../../../../buildings/appearance/types";
import type { VectorCityDocument } from "../../../types/vector/document";

/** The housing culture a meshless city was given, kept with its requested settings; absent means automatic. */
export function vectorHousingCulture(doc: Pick<VectorCityDocument, "context">): BuildingAppearanceProfile | undefined {
  const value = (doc.context.requestedSettings as { buildingAppearanceProfile?: unknown } | undefined)
    ?.buildingAppearanceProfile;
  return (BUILDING_APPEARANCE_PROFILES as readonly unknown[]).includes(value)
    ? (value as BuildingAppearanceProfile)
    : undefined;
}

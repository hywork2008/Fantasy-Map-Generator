import type { GenerationSettings } from "../../../types/generation";
import { defaultGenerationSettings } from "../../generation/settings";

/** How meshless treats each mesh-editor generation setting. Mirrors the setting rows of the parity table
 * (docs/plan/data/ce-meshless-parity.json); a test keeps the two equal. */
export type MeshlessSettingState =
  | "equivalent"
  | "partial"
  | "authored-only"
  | "converted-only"
  | "missing"
  | "not-applicable";
export const MESHLESS_SETTING_SUPPORT: Record<string, { state: MeshlessSettingState; stage: string }> = {
  seed: { state: "equivalent", stage: "-" },
  "population.targetPopulation": { state: "equivalent", stage: "-" },
  historicalPeriod: { state: "partial", stage: "P3" },
  descriptor: { state: "partial", stage: "P1" },
  generationMethod: { state: "not-applicable", stage: "-" },
  "config.coast": { state: "missing", stage: "P5" },
  "config.rivers": { state: "partial", stage: "P5" },
  "config.relief": { state: "missing", stage: "P8" },
  "config.features.walls": { state: "partial", stage: "P4" },
  "config.features.citadel": { state: "missing", stage: "P4" },
  "config.features.plaza": { state: "partial", stage: "P6" },
  "config.features.temple": { state: "partial", stage: "P6" },
  "config.features.port": { state: "missing", stage: "P5" },
  "config.features.shanty": { state: "missing", stage: "P6" },
  "config.wall.envelope": { state: "missing", stage: "P4" },
  "config.wall.coast": { state: "missing", stage: "P5" },
  "config.wall.line": { state: "missing", stage: "P4" },
  "config.wall.material": { state: "equivalent", stage: "P4" },
  layout: { state: "missing", stage: "P4" },
  wallShape: { state: "equivalent", stage: "P4" },
  wallSides: { state: "equivalent", stage: "P4" },
  townWallRings: { state: "equivalent", stage: "P4" },
  townWallBuildOrder: { state: "equivalent", stage: "P4" },
  innerWallState: { state: "equivalent", stage: "P4" },
  townWallDefensePolicy: { state: "missing", stage: "P4" },
  walledAreaShare: { state: "partial", stage: "P4" },
  townFortification: { state: "partial", stage: "P4" },
  moats: { state: "authored-only", stage: "P4" },
  castle: { state: "authored-only", stage: "P4" },
  castleStreetLinks: { state: "missing", stage: "P4" },
  castleOutward: { state: "missing", stage: "P4" },
  legacyCastles: { state: "missing", stage: "P4" },
  riverPlacement: { state: "missing", stage: "P5" },
  elevationPreset: { state: "missing", stage: "P8" },
  elevationRelief: { state: "missing", stage: "P8" },
  elevationRotation: { state: "missing", stage: "P8" },
  terrainField: { state: "missing", stage: "P8" },
  riverDropMeters: { state: "missing", stage: "P8" },
  terraces: { state: "missing", stage: "P8" },
  buildingPattern: { state: "partial", stage: "P3" },
  buildingHeightPolicy: { state: "partial", stage: "P3" },
  buildingHeightLimit: { state: "equivalent", stage: "P3" },
  housingAreaScale: { state: "not-applicable", stage: "-" },
  forestSettings: { state: "authored-only", stage: "P7" },
  burialProfile: { state: "missing", stage: "P6" },
  streets: { state: "missing", stage: "P9" },
  approachGrowthSource: { state: "missing", stage: "P9" },
  approachCommerce: { state: "missing", stage: "P6" },
  urbanCoreMode: { state: "missing", stage: "P9" },
  urbanNPatches: { state: "not-applicable", stage: "P9" },
  facilityLayout: { state: "partial", stage: "P6" },
  mode: { state: "missing", stage: "P9" }
};

const valueAt = (settings: unknown, id: string): unknown =>
  id
    .split(".")
    .reduce<unknown>(
      (v, key) => (v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined),
      settings
    );

/**
 * Requested settings that meshless does not generate as the mesh editor would, in table order. A city feature
 * counts when it is switched on; any other setting when it is present and differs from the editor default.
 * Equivalent and cell-specific settings are never listed.
 */
export function meshlessSettingGaps(
  settings: GenerationSettings
): { id: string; state: MeshlessSettingState; stage: string }[] {
  const defaults = defaultGenerationSettings();
  return Object.entries(MESHLESS_SETTING_SUPPORT)
    .filter(([id, row]) => {
      if (row.state === "equivalent" || row.state === "not-applicable") return false;
      const value = valueAt(settings, id);
      if (id.startsWith("config.features.")) return value === true;
      return value !== undefined && JSON.stringify(value) !== JSON.stringify(valueAt(defaults, id));
    })
    .map(([id, row]) => ({ id, ...row }));
}

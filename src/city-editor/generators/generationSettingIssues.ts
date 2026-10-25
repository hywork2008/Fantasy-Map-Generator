import { editorText } from "../../i18n/editorMessages";
import type { CityDocument } from "../types/document";
import type { GenerationSettings } from "../types/generation";
import { bastionedTownSettingConflicts, fortressSettingsMessage } from "./bastionedTown/validate";
import { skeletonUnsupportedSettings } from "./generation/settings";
import { validatePopulationGeneration } from "./populationGeneration";
import { PopulationSettingError } from "./populationPlan";

/** Semantic field names keep validation independent of DOM and React. */
export interface GenerationSettingIssue {
  code:
    | "fortress-settings"
    | "population-settings"
    | "unsupported-skeleton-settings"
    | "fortress-water-conflict"
    | "port-without-coast";
  /** Omitted for blocking errors; warnings must not stop generation. */
  severity?: "warning";
  fields: string[];
  message: string;
  remedy: string;
}

const conflictFields: Record<string, string> = {
  "town fortification": "townFortification",
  outworks: "outworks",
  ditch: "ditch",
  "street plan": "streetPlan",
  "dimension policy": "dimensionPolicy",
  mode: "mode",
  "double walls": "townWallRings",
  "generation method": "generationMethod",
  "wall shape": "wallShape",
  "walled share": "walledAreaShare",
  walls: "walls",
  "bastion count": "wallSides",
  layout: "layout",
  moat: "moats",
  river: "riverPlacement",
  "coast roads": "avoidSea",
  era: "historicalPeriod",
  castle: "citadel",
  moats: "moats",
  bram: "layout",
  circulade: "layout",
  "river placement": "riverPlacement",
  "urban patch count": "urbanNPatches",
  "legacy urban allocation": "urbanCoreMode",
  "street far end": "farNode",
  "manual road bearings": "manualBearings",
  "roads over water": "avoidSea",
  "coastal wall mode": "coastalWall"
};

/** Only deterministic setting conflicts belong here; geometric search failures do not. */
export function generationSettingIssues(
  document: CityDocument,
  settings: GenerationSettings
): GenerationSettingIssue[] {
  if (settings.mode === "fort" && !settings.townFortification) return [];
  const issues: GenerationSettingIssue[] = [];
  if (!settings.descriptor && settings.config.features.port && settings.config.coast === "none")
    issues.push({
      code: "port-without-coast",
      severity: "warning",
      fields: ["port", "coast"],
      message: editorText("cityEditor.messages.settingPortWithoutCoast"),
      remedy: editorText("cityEditor.messages.settingFixPortWithoutCoast")
    });
  const conflicts = bastionedTownSettingConflicts(settings);
  if (conflicts)
    issues.push({
      code: "fortress-settings",
      fields: ["townFortification", ...conflicts.map(c => conflictFields[c] ?? c)],
      message: fortressSettingsMessage(conflicts),
      remedy: editorText("cityEditor.messages.settingFixFortress")
    });
  if (settings.population && settings.population.source !== "fmg") {
    try {
      validatePopulationGeneration(document, settings);
    } catch (error) {
      issues.push({
        code: "population-settings",
        fields: ["populationEnabled", ...(error instanceof PopulationSettingError ? error.fields : ["population"])],
        message: error instanceof Error ? error.message : String(error),
        remedy: editorText("cityEditor.messages.settingFixPopulation")
      });
    }
  }
  const unsupported = settings.townFortification ? [] : skeletonUnsupportedSettings(settings);
  if (unsupported.length)
    issues.push({
      code: "unsupported-skeleton-settings",
      fields: [
        "generationMethod",
        ...unsupported.map(
          c =>
            conflictFields[c] ??
            (c.startsWith("wall sides")
              ? "wallSides"
              : c.startsWith("bastioned walls")
                ? "historicalPeriod"
                : "wallShape")
        )
      ],
      message: editorText("cityEditor.messages.skeletonUnsupported", { features: unsupported.join(", ") }),
      remedy: editorText("cityEditor.messages.settingFixSkeleton")
    });
  // Imported water is resolved from surveyed geometry by the planner. Do not infer
  // an intersection from a river or coast merely existing in the source region.
  if (settings.townFortification?.ditch === "wet" && !settings.descriptor) {
    const fields = ["townFortification", "ditch"];
    if (settings.config.rivers.length) fields.push("rivers");
    if (settings.config.coast !== "none") fields.push("coast");
    if (fields.length > 2)
      issues.push({
        code: "fortress-water-conflict",
        fields,
        message: editorText("cityEditor.messages.settingWetWater"),
        remedy: editorText("cityEditor.messages.settingFixWetWater")
      });
  }
  return issues;
}

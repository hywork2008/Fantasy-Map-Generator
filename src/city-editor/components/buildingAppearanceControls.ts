import {
  BUILDING_APPEARANCE_CLIMATES,
  BUILDING_APPEARANCE_PROFILES,
  type BuildingAppearanceClimate,
  type BuildingAppearanceProfile
} from "../../buildings/appearance/types";
import { MODEL_QUALITIES, type ModelQuality } from "../../buildings/modelQuality";
import { type EditorMessageKey, editorText } from "../../i18n/editorMessages";
import { withBuildingAppearance } from "../generators/buildingAppearance";
import {
  readModelQualityPreference,
  readTerrainSpacingPreference,
  type TerrainSpacingPreference,
  writeModelQualityPreference,
  writeTerrainSpacingPreference
} from "../services/browserPreferences";
import type { EditorLifetime } from "../services/editorLifetime";
import type { CityDocument } from "../types/document";
import { div, text } from "./editorControls";

const PROFILE_LABELS: Record<BuildingAppearanceProfile, EditorMessageKey> = {
  legacy: "cityEditor.messages.housingCultureLegacy",
  mediterranean: "cityEditor.messages.housingCultureMediterranean",
  atlantic: "cityEditor.messages.housingCultureAtlantic",
  "northern-wooded": "cityEditor.messages.housingCultureNorthernWooded",
  "northern-urban": "cityEditor.messages.housingCultureNorthernUrban",
  "stone-upland": "cityEditor.messages.housingCultureStoneUpland"
};
const QUALITY_LABELS: Record<ModelQuality, EditorMessageKey> = {
  low: "cityEditor.messages.modelQualityLow",
  standard: "cityEditor.messages.modelQualityStandard",
  high: "cityEditor.messages.modelQualityHigh"
};
const CLIMATE_LABELS: Record<BuildingAppearanceClimate, EditorMessageKey> = {
  temperate: "cityEditor.messages.housingClimateTemperate",
  forest: "cityEditor.messages.housingClimateForest",
  wetland: "cityEditor.messages.housingClimateWetland",
  "wet-forest": "cityEditor.messages.housingClimateWetForest",
  arid: "cityEditor.messages.housingClimateArid"
};

export function buildBuildingAppearanceControls(ctx: {
  scope: EditorLifetime;
  getDocument(): CityDocument;
  updateDocument(next: CityDocument): void;
  select(values: string[], selected: string): HTMLSelectElement;
  label(value: string, control: HTMLElement): HTMLLabelElement;
  /** 3D model quality is a viewer preference, not part of the document. */
  modelQualityChanged(): void;
}) {
  const root = div("ce-building-appearance-controls");
  const quality = ctx.select([...MODEL_QUALITIES], readModelQualityPreference());
  quality.className = "ce-model-quality";
  quality.setAttribute("aria-label", editorText("cityEditor.messages.modelQuality"));
  for (const option of quality.options) option.textContent = editorText(QUALITY_LABELS[option.value as ModelQuality]);
  const culture = ctx.select(["auto", ...BUILDING_APPEARANCE_PROFILES.filter(p => p !== "legacy"), "legacy"], "auto");
  culture.className = "ce-housing-culture";
  culture.setAttribute("aria-label", editorText("cityEditor.messages.housingCulture"));
  const climate = ctx.select(["auto", ...BUILDING_APPEARANCE_CLIMATES], "auto");
  climate.className = "ce-housing-climate";
  climate.setAttribute("aria-label", editorText("cityEditor.messages.housingClimate"));
  for (const option of culture.options)
    option.textContent = editorText(
      option.value === "auto"
        ? "cityEditor.messages.housingSiteAuto"
        : PROFILE_LABELS[option.value as BuildingAppearanceProfile]
    );
  for (const option of climate.options)
    option.textContent = editorText(
      option.value === "auto"
        ? "cityEditor.messages.housingSiteAuto"
        : CLIMATE_LABELS[option.value as BuildingAppearanceClimate]
    );
  const spacing = ctx.select(["auto", "1", "2", "4", "8"], String(readTerrainSpacingPreference()));
  spacing.className = "ce-terrain-spacing";
  spacing.setAttribute("aria-label", editorText("cityEditor.messages.terrainSpacing"));
  for (const option of spacing.options)
    option.textContent =
      option.value === "auto" ? editorText("cityEditor.messages.terrainSpacingAuto") : `${option.value} m`;
  root.append(
    ctx.label(editorText("cityEditor.messages.modelQuality"), quality),
    ctx.label(editorText("cityEditor.messages.terrainSpacing"), spacing),
    ctx.label(editorText("cityEditor.messages.housingCulture"), culture),
    ctx.label(editorText("cityEditor.messages.housingClimate"), climate),
    text(editorText("cityEditor.messages.housingAppearanceHelp"))
  );
  const change = () => {
    const current = ctx.getDocument();
    const next = withBuildingAppearance({
      ...current,
      buildingAppearanceProfile: culture.value === "auto" ? undefined : (culture.value as BuildingAppearanceProfile),
      buildingAppearanceClimate: climate.value === "auto" ? undefined : (climate.value as BuildingAppearanceClimate)
    });
    ctx.updateDocument(next);
  };
  ctx.scope.listen(quality, "change", () => {
    writeModelQualityPreference(quality.value as ModelQuality);
    ctx.modelQualityChanged();
  });
  ctx.scope.listen(spacing, "change", () => {
    writeTerrainSpacingPreference(spacing.value as TerrainSpacingPreference);
    ctx.modelQualityChanged();
  });
  ctx.scope.listen(culture, "change", change);
  ctx.scope.listen(climate, "change", change);
  const sync = () => {
    const city = ctx.getDocument();
    culture.value = city.buildingAppearanceProfile ?? "auto";
    climate.value = city.buildingAppearanceClimate ?? "auto";
  };
  sync();
  return { root, sync };
}

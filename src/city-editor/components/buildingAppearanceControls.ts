import {
  BUILDING_APPEARANCE_CLIMATES,
  BUILDING_APPEARANCE_PROFILES,
  type BuildingAppearanceClimate,
  type BuildingAppearanceProfile
} from "../../buildings/appearance/types";
import { type EditorMessageKey, editorText } from "../../i18n/editorMessages";
import { withBuildingAppearance } from "../generators/buildingAppearance";
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
}) {
  const root = div("ce-building-appearance-controls");
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
  root.append(
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

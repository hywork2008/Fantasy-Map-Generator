import {
  BUILDING_APPEARANCE_CLIMATES,
  BUILDING_APPEARANCE_PROFILES,
  type BuildingAppearanceClimate,
  type BuildingAppearanceProfile
} from "../../buildings/appearance/types";
import { MODEL_QUALITIES, type ModelQuality } from "../../buildings/modelQuality";
import { type EditorMessageKey, editorText } from "../../i18n/editorMessages";
import { documentFabricFingerprint } from "../generators/blockInfill";
import { withBuildingAppearance } from "../generators/buildingAppearance";
import {
  DEFAULT_BUILDING_HEIGHT_POLICY,
  hasBuildingHeightVariation,
  heightPeriod,
  supportsBuildingHeightVariation
} from "../generators/buildingHeightPolicy";
import { ruralFieldOverlay, storeRuralFieldOverlay } from "../generators/ruralFieldOverlay";
import { withBuildingHeightPolicy } from "../generators/updateBuildingHeights";
import {
  readModelQualityPreference,
  readTerrainSpacingPreference,
  type TerrainSpacingPreference,
  writeModelQualityPreference,
  writeTerrainSpacingPreference
} from "../services/browserPreferences";
import type { EditorLifetime } from "../services/editorLifetime";
import type { CityDocument } from "../types/document";
import { buildingHeightLimitControls } from "./buildingHeightLimitControls";
import { div } from "./editorControls";

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
  getGenerationHeightPolicy?(): CityDocument["buildingHeightPolicy"];
  updateDocument(next: CityDocument, label?: string): void;
  select(values: string[], selected: string): HTMLSelectElement;
  label(value: string, control: HTMLElement): HTMLLabelElement;
  /** 3D model quality is a viewer preference, not part of the document. */
  modelQualityChanged(): void;
}) {
  const root = div("ce-building-appearance-controls");
  const mode = ctx.select(["varied", "uniform"], "varied");
  mode.className = "ce-building-height-mode";
  mode.options[0].textContent = editorText("cityEditor.messages.buildingHeightModeVaried");
  mode.options[1].textContent = editorText("cityEditor.messages.buildingHeightModeUniform");
  mode.setAttribute("aria-label", editorText("cityEditor.messages.buildingHeightMode"));
  ctx.scope.listen(mode, "change", () =>
    ctx.updateDocument(
      withBuildingHeightPolicy(ctx.getDocument(), mode.value === "varied" ? DEFAULT_BUILDING_HEIGHT_POLICY : undefined),
      editorText("cityEditor.messages.changeBuildingHeights")
    )
  );
  const cityLimits = div("ce-city-height-controls");
  cityLimits.append(
    buildingHeightLimitControls(ctx.scope, ctx.getDocument().buildingHeightLimit, "ce-city-height", limit =>
      ctx.updateDocument(
        withBuildingHeightPolicy(
          { ...ctx.getDocument(), buildingHeightLimit: limit },
          mode.value === "varied" ? DEFAULT_BUILDING_HEIGHT_POLICY : undefined,
          ctx.getDocument()
        ),
        editorText("cityEditor.messages.changeBuildingHeights")
      )
    )
  );
  const limitNote = document.createElement("small");
  limitNote.textContent = editorText("cityEditor.messages.buildingHeightLimitScope");
  cityLimits.append(limitNote);
  const heightStatus = document.createElement("output");
  heightStatus.className = "ce-building-height-status";
  const heightButton = document.createElement("button");
  heightButton.type = "button";
  heightButton.className = "ce-update-building-heights";
  heightButton.textContent = editorText("cityEditor.messages.updateBuildingHeights");
  ctx.scope.listen(heightButton, "click", () =>
    ctx.updateDocument(
      withBuildingHeightPolicy(ctx.getDocument(), DEFAULT_BUILDING_HEIGHT_POLICY),
      editorText("cityEditor.messages.updateBuildingHeights")
    )
  );
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
  const viewControls = div("ce-building-view-controls");
  viewControls.append(
    ctx.label(editorText("cityEditor.messages.modelQuality"), quality),
    ctx.label(editorText("cityEditor.messages.terrainSpacing"), spacing)
  );
  root.append(
    ctx.label(editorText("cityEditor.messages.housingCulture"), culture),
    ctx.label(editorText("cityEditor.messages.housingClimate"), climate),
    ctx.label(editorText("cityEditor.messages.buildingHeightMode"), mode),
    cityLimits,
    heightStatus,
    heightButton
  );
  const change = () => {
    const current = ctx.getDocument();
    const fingerprint = documentFabricFingerprint(current);
    const fields = ruralFieldOverlay(current, fingerprint);
    let next = withBuildingAppearance({
      ...current,
      buildingAppearanceProfile: culture.value === "auto" ? undefined : (culture.value as BuildingAppearanceProfile),
      buildingAppearanceClimate: climate.value === "auto" ? undefined : (climate.value as BuildingAppearanceClimate)
    });
    if (fields) {
      const nextFingerprint = documentFabricFingerprint(next);
      // Appearance changes do not alter field geometry or its access lanes.
      if (current.ruralFieldSnapshot?.fingerprint === fingerprint) {
        next = { ...next, ruralFieldSnapshot: { ...current.ruralFieldSnapshot, fingerprint: nextFingerprint } };
      }
      storeRuralFieldOverlay(next, nextFingerprint, fields);
    }
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
    mode.value = (
      city.appearance === "town" || !ctx.getGenerationHeightPolicy
        ? city.buildingHeightPolicy
        : ctx.getGenerationHeightPolicy()
    )
      ? "varied"
      : "uniform";
    cityLimits.querySelector<HTMLInputElement>(".ce-city-height-storeys")!.value =
      city.buildingHeightLimit?.maxStoreys === undefined ? "" : String(city.buildingHeightLimit.maxStoreys);
    cityLimits.querySelector<HTMLInputElement>(".ce-city-height-meters")!.value =
      city.buildingHeightLimit?.maxHeightMeters === undefined ? "" : String(city.buildingHeightLimit.maxHeightMeters);
    const supported = supportsBuildingHeightVariation(heightPeriod(city), city.civilization?.tradition);
    heightStatus.textContent = editorText(
      !supported
        ? "cityEditor.messages.buildingHeightsUnsupported"
        : mode.value === "varied"
          ? "cityEditor.messages.buildingHeightsVaried"
          : "cityEditor.messages.buildingHeightsLegacy"
    );
    heightButton.disabled = !supported || hasBuildingHeightVariation(city);
    culture.value = city.buildingAppearanceProfile ?? "auto";
    climate.value = city.buildingAppearanceClimate ?? "auto";
  };
  sync();
  return { root, viewControls, sync };
}

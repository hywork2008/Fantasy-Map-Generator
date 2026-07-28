import { getWorldState } from "../actions";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { Biomes } from "../generators/biomes";
import { Features } from "../generators/features";
import { Lakes } from "../generators/lakes";
import { Rivers } from "../generators/river-generator";
import {
  BiomesRenderer,
  CoordinatesRenderer,
  drawTemperature,
  PrecipitationRenderer,
  RiversRenderer
} from "../renderers";
import { ThreeDRenderer } from "../renderers/three-d-renderer";
import { legacyMutation } from "../runtime/worldRuntime";
import { viewLayerService as view } from "../services/viewLayerService";
import { openDialog } from "../ui/dialogs/dialogService";
import { layerIsOn } from "../utils/nodeUtils";

export function editWorld(): void {
  if (view.customization) return;
  openDialog("worldConfigurator");
  // Notify the dialog to refresh its displayed values (fires even when already open)
  document.dispatchEvent(new CustomEvent("fmg:world-configurator-refresh"));
}

export function updateWorld(): void {
  updateClimateData({ includeNames: true });

  if (layerIsOn("toggleTemperature")) drawTemperature(worldContext, viewContext, appServices);
  if (layerIsOn("togglePrecipitation")) PrecipitationRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBiomes")) BiomesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCoordinates")) CoordinatesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleRivers")) RiversRenderer.render(worldContext, viewContext, appServices);
  if (ThreeDRenderer.options.isOn) requestAnimationFrame(() => ThreeDRenderer.update());
  document.dispatchEvent(new CustomEvent("fmg:world-configurator-updated"));
}

/** Recalculate climate data before cultures exist during staged map generation. */
export function updateClimateDuringStagedGeneration(): void {
  updateClimateData({ includeNames: false });
  document.dispatchEvent(new CustomEvent("fmg:world-configurator-updated"));
}

function updateClimateData({ includeNames }: { includeNames: boolean }): void {
  document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { temps: true, prec: true } }));
  legacyMutation(() => {
    const state = getWorldState();
    const pack = worldContext.pack;
    const heights = new Uint8Array(pack.cells.h);
    Rivers.generate(worldContext, viewContext, appServices, state);
    if (includeNames) Rivers.specify(worldContext, viewContext, appServices, state);
    pack.cells.h = new Float32Array(heights);
    Biomes.define(state);
    Features.defineGroups();
    if (includeNames) Lakes.defineNames(state);
    return { result: undefined, topics: ["map.physical", "map.networks"] };
  });
}

export function initWorldConfigurator(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}
document.addEventListener("fmg:edit-world", () => editWorld());

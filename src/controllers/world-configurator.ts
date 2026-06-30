import { getWorldState } from "../actions";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";

import {
  BiomesRenderer,
  CoordinatesRenderer,
  drawTemperature,
  PrecipitationRenderer,
  RiversRenderer
} from "../renderers";
import { ThreeDRenderer } from "../renderers/three-d-renderer";
import { GenerationPipeline } from "../services/generationPipeline";
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
  document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { temps: true, prec: true } }));
  const state = getWorldState();
  const heights = new Uint8Array(worldContext.pack.cells.h);
  GenerationPipeline.Rivers.generate(worldContext, viewContext, appServices, state);
  GenerationPipeline.Rivers.specify(worldContext, viewContext, appServices, state);
  worldContext.pack.cells.h = new Float32Array(heights);
  GenerationPipeline.Biomes.define(state);
  GenerationPipeline.Features.defineGroups();
  GenerationPipeline.Lakes.defineNames(state);

  if (layerIsOn("toggleTemperature")) drawTemperature(worldContext, viewContext, appServices);
  if (layerIsOn("togglePrecipitation")) PrecipitationRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBiomes")) BiomesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCoordinates")) CoordinatesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleRivers")) RiversRenderer.render(worldContext, viewContext, appServices);
  if (ThreeDRenderer.options.isOn) requestAnimationFrame(() => ThreeDRenderer.update());
}

export function initWorldConfigurator(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}

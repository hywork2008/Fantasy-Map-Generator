// @ts-nocheck
// Temporary compatibility layer for legacy global consumers.
// Remove this file when all callers are migrated to explicit ESM imports.

import { applyLayersPreset, drawLayers, drawRoute, drawRoutes, layerIsOn } from "./modules/ui/layers";
import {
  applyOption,
  clearMainTip,
  getFriendlyHeight,
  lock,
  locked,
  onMouseMove,
  showDataTip,
  showElementLockTip,
  showMainTip,
  store,
  stored,
  tip,
  unlock
} from "./modules/ui/general";
import {
  applyGraphSize,
  applyStoredOptions,
  fitMapToScreen,
  hideOptions,
  randomizeOptions,
  showOptions,
  toggleOptions
} from "./modules/ui/options";
import { closeDialogs, restoreDefaultEvents } from "./modules/ui/editors";
import { applyStyleOnLoad } from "./modules/ui/style-presets";
import { Rulers, createDefaultRuler } from "./modules/ui/measurers";
import { initiateAutosave, saveMap, saveToStorage, saveToMachine, saveToDropbox } from "./modules/io/save";
import {
  exportToJpeg,
  exportToPng,
  exportToPngTiles,
  exportToSvg,
  saveGeoJsonCells,
  saveGeoJsonMarkers,
  saveGeoJsonRivers,
  saveGeoJsonRoutes,
  saveGeoJsonZones
} from "./modules/io/export";
import { burgIconsRenderer, drawBurgIconRenderer, removeBurgIconRenderer } from "#renderers/draw-burg-icons";
import { burgLabelsRenderer, drawBurgLabelRenderer, removeBurgLabelRenderer } from "#renderers/draw-burg-labels";
import { Ice } from "@fmg/core/modules/ice";
import { Lakes } from "@fmg/core/modules/lakes";
import { Biomes } from "@fmg/core/modules/biomes";
import { Names } from "@fmg/core/modules/names-generator";
import { COA } from "@fmg/core/modules/emblem/generator";
import { COArenderer } from "@fmg/core/modules/emblem/renderer";
import { Military } from "@fmg/core/modules/military-generator";
import { Rivers } from "@fmg/core/modules/river-generator";
import { Routes } from "@fmg/core/modules/routes-generator";
import { States } from "@fmg/core/modules/states-generator";

Object.assign(window, {
  tip,
  showDataTip,
  onMouseMove,
  getFriendlyHeight,
  showMainTip,
  clearMainTip,
  showElementLockTip,
  lock,
  unlock,
  locked,
  stored,
  store,
  applyOption,

  applyLayersPreset,
  drawLayers,
  drawRoute,
  drawRoutes,
  layerIsOn,

  drawBurgIcons: burgIconsRenderer,
  drawBurgIcon: drawBurgIconRenderer,
  removeBurgIcon: removeBurgIconRenderer,
  drawBurgLabels: burgLabelsRenderer,
  drawBurgLabel: drawBurgLabelRenderer,
  removeBurgLabel: removeBurgLabelRenderer,
  Ice,
  Lakes,
  Biomes,
  Names,
  COA,
  COArenderer,
  Military,
  Rivers,
  Routes,
  States,

  showOptions,
  hideOptions,
  toggleOptions,
  applyGraphSize,
  fitMapToScreen,
  applyStoredOptions,
  randomizeOptions,

  restoreDefaultEvents,
  closeDialogs,

  applyStyleOnLoad,

  Rulers,
  createDefaultRuler,

  initiateAutosave,
  saveMap,
  saveToStorage,
  saveToMachine,
  saveToDropbox,

  exportToSvg,
  exportToPng,
  exportToJpeg,
  exportToPngTiles,
  saveGeoJsonCells,
  saveGeoJsonRoutes,
  saveGeoJsonRivers,
  saveGeoJsonMarkers,
  saveGeoJsonZones
});

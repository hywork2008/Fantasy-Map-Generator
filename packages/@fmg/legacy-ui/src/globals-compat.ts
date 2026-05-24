// Temporary compatibility layer for legacy global consumers.
// Remove this file when all callers are migrated to explicit ESM imports.

import { ThreeD } from "./modules/ui/3d";
import { Cloud } from "./modules/io/cloud";
import {
  applyLayersPreset,
  getCurrentPreset,
  drawLayers,
  drawStates,
  drawRoute,
  drawRoutes,
  layerIsOn,
  toggleHeight,
  toggleTemperature,
  toggleBiomes,
  togglePrecipitation,
  togglePopulation,
  toggleCells,
  toggleIce,
  toggleCultures,
  toggleReligions,
  toggleStates,
  toggleBorders,
  toggleProvinces,
  toggleGrid,
  toggleCoordinates,
  toggleCompass,
  toggleRelief,
  toggleLakes,
  toggleTexture,
  toggleRivers,
  toggleRoutes,
  toggleMilitary,
  toggleMarkers,
  toggleLabels,
  toggleBurgIcons,
  toggleRulers,
  toggleScaleBar,
  toggleZones,
  toggleEmblems,
  toggleVignette,
  handleLayersPresetChange,
  savePreset,
  removePreset
} from "./modules/ui/layers";
import {
  applyOption,
  clearMainTip,
  getCellPopulation,
  getDepth,
  getElevation,
  getFriendlyHeight,
  getFriendlyPopulation,
  getFriendlyPrecipitation,
  getHeight,
  getPopulationTip,
  getPrecipitation,
  getRiverInfo,
  highlightEmblemElement,
  lock,
  locked,
  onMouseMove,
  showDataTip,
  showElementLockTip,
  showInfo,
  showMainTip,
  store,
  stored,
  tip,
  unlock
} from "./modules/ui/general";
import {
  applyGraphSize,
  applyStoredOptions,
  changeDialogsTheme,
  changeThemeHue,
  changeTooltipSize,
  changeUiSize,
  changeZoomExtent,
  fitMapToScreen,
  hideOptions,
  getUImaxSize,
  mapSizeInputChange,
  copyMapURL,
  randomizeOptions,
  randomizeCultureSet,
  randomizeHeightmapTemplate,
  generateEra,
  showOptions,
  toggleOptions,
  showSupporters,
  regeneratePrompt,
  copyLinkToClickboard,
  connectToDropbox,
  loadURL,
  openExportToPngTiles
} from "./modules/ui/options";
import { allowHotkeys, closeAllDialogs, handleBracketSizeChange, handleKeydown, handleKeyup } from "./modules/ui/hotkeys";
import {
  closeDialogs,
  restoreDefaultEvents,
  clicked,
  editStates,
  editCultures,
  editReligions,
  editCoastlineSettings,
  getFileName,
  downloadFile,
  confirmationDialog,
  unselect,
  removeCircle,
  fitContent,
  applySortingByHeader,
  applySorting,
  fitLegendBox,
  redrawLegend,
  clearLegend,
  drawLegend,
  dragLegendBox,
  createPicker,
  openPicker,
  dragPicker,
  clickPickerControl,
  dragPickerControl,
  changePickerSpace,
  selectIcon,
  getBBox,
  highlightElement,
  getAreaUnit,
  getArea,
  listen,
  refreshAllEditors,
  fog,
  unfog,
  moveCircle
} from "./modules/ui/editors";
import { editNotes } from "./modules/ui/notes-editor";
import { showBurgTemperatureGraph } from "./modules/ui/temperature-graph";
import { editBiomes } from "./modules/ui/biomes-editor";
import { editBurgGroups } from "./modules/ui/burg-group-editor";
import { editRiver } from "./modules/ui/rivers-editor";
import { editRoute } from "./modules/ui/routes-editor";
import { editRouteGroups } from "./modules/ui/route-group-editor";
import { editLabel } from "./modules/ui/labels-editor";
import { editLake } from "./modules/ui/lakes-editor";
import { editCoastline } from "./modules/ui/coastline-editor";
import { editMarker } from "./modules/ui/markers-editor";
import { editReliefIcon } from "./modules/ui/relief-editor";
import { editRegiment } from "./modules/ui/regiment-editor";
import { editIce } from "./modules/ui/ice-editor";
import { editProvinces } from "./modules/ui/provinces-editor";
import { editZones } from "./modules/ui/zones-editor";
import { editUnits } from "./modules/ui/units-editor";
import { editDiplomacy } from "./modules/ui/diplomacy-editor";
import { editEmblem } from "./modules/ui/emblems-editor";
import { editHeightmap } from "./modules/ui/heightmap-editor";
import {
  applyStyleOnLoad,
  applyStyle,
  applyStyleWithUiRefresh,
  changeStyle,
  requestStylePresetChange,
  addStylePreset,
  requestRemoveStylePreset
} from "./modules/ui/style-presets";
import { Rulers, createDefaultRuler } from "./modules/ui/measurers";
import { initiateAutosave, saveMap, saveToStorage, saveToMachine, saveToDropbox } from "./modules/io/save";
import {
  openLocalMapFilePicker,
  quickLoad,
  loadFromDropbox,
  createSharableDropboxLink,
  loadMapPrompt,
  showUploadMessage,
  loadMapFromURL,
  showUploadErrorMessage,
  uploadMap
} from "./modules/io/load";
import { addLabelOnClick, addRiverOnClick, addMarkerOnClick, toggleAddRiver, configMarkersGeneration } from "./modules/ui/tools";
import { overviewBurgs } from "./modules/ui/burgs-overview";
import { overviewMarkers } from "./modules/ui/markers-overview";
import { overviewRivers } from "./modules/ui/rivers-overview";
import { overviewRoutes } from "./modules/ui/routes-overview";
import { overviewMilitary } from "./modules/ui/military-overview";
import {
  setSeedFlow,
  addLakesInDeepDepressionsFlow,
  openNearSeaLakesFlow,
  generateMapFlow
} from "./modules/ui/generation-flow";
import {
  reGraphFlow,
  rankCellsFlow
} from "./modules/ui/generation-graph";
import {
  showStatisticsFlow,
  undrawFlow,
  regenerateMapFlow,
  createRegenerateMap
} from "./modules/ui/generation-runtime";
import {
  buildGenerationModules,
  buildGenerateDeps
} from "./modules/ui/generation-deps";
import { zoomToPoint, resetZoomToInitial, invokeActiveZoomingView } from "./modules/ui/zoom-utils";
import {
  defineMapSizeFlow,
  calculateMapCoordinatesFlow,
  calculateTemperaturesFlow,
  generatePrecipitationFlow
} from "./modules/ui/generation-climate";
import {
  checkLoadParametersFlow,
  generateMapOnLoadFlow,
  focusOnFlow,
  findBurgForMFCGFlow
} from "./modules/ui/initial-load";
import { initStartupOnDomContentLoaded } from "./modules/ui/startup-init";
import {
  buildCheckLoadParametersDeps,
  buildGenerateMapOnLoadDeps,
  buildFocusOnDeps,
  buildFindBurgForMFCGDeps
} from "./modules/ui/initial-load-deps";
import { buildZoomToPointDeps, buildResetZoomDeps, buildInvokeActiveZoomingDeps } from "./modules/ui/zoom-deps";
import { hideLoadingUI, showLoadingUI } from "./modules/ui/loading-ui";
import { openMinimapDialog } from "./modules/ui/minimap";
import { toggleAssistantWidget, initTourPromptButtonUI } from "./modules/ui/assistant";
import { initDragToUpload } from "./modules/ui/drag-upload";
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
import { exportToJson } from "./modules/dynamic/export-json";
import { editWorld } from "./modules/ui/world-configurator";
import { editBurg } from "./modules/ui/burg-editor";
import {
  textureProvideURL,
  editStyle,
  addCustomColorScheme,
  getColorScheme,
  getColor,
  selectStyleElement,
  updateElements
} from "./modules/ui/style";
import { cleanupData } from "./versioning";
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
import type { FmgGlobalContext } from "@fmg/types";

const legacyCompat = {
  tip,
  showDataTip,
  onMouseMove,
  getElevation,
  getDepth,
  getFriendlyHeight,
  getFriendlyPopulation,
  getFriendlyPrecipitation,
  getHeight,
  getPrecipitation,
  getRiverInfo,
  getPopulationTip,
  highlightEmblemElement,
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
  getCurrentPreset,
  drawLayers,
  drawStates,
  drawRoute,
  drawRoutes,
  layerIsOn,
  toggleHeight,
  toggleTemperature,
  toggleBiomes,
  togglePrecipitation,
  togglePopulation,
  toggleCells,
  toggleIce,
  toggleCultures,
  toggleReligions,
  toggleStates,
  toggleBorders,
  toggleProvinces,
  toggleGrid,
  toggleCoordinates,
  toggleCompass,
  toggleRelief,
  toggleLakes,
  toggleTexture,
  toggleRivers,
  toggleRoutes,
  toggleMilitary,
  toggleMarkers,
  toggleLabels,
  toggleBurgIcons,
  toggleRulers,
  toggleScaleBar,
  toggleZones,
  toggleEmblems,
  toggleVignette,
  handleLayersPresetChange,
  savePreset,
  removePreset,

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
  showSupporters,
  regeneratePrompt,
  copyLinkToClickboard,
  copyMapURL,
  connectToDropbox,
  loadURL,
  openExportToPngTiles,
  mapSizeInputChange,
  changeUiSize,
  getUImaxSize,
  changeTooltipSize,
  changeThemeHue,
  changeDialogsTheme,
  changeZoomExtent,
  randomizeCultureSet,
  randomizeHeightmapTemplate,
  generateEra,
  handleKeydown,
  handleKeyup,
  allowHotkeys,
  handleBracketSizeChange,
  closeAllDialogs,
  applyGraphSize,
  fitMapToScreen,
  applyStoredOptions,
  randomizeOptions,

  restoreDefaultEvents,
  clicked,
  unselect,
  closeDialogs,
  removeCircle,
  fitContent,
  applySortingByHeader,
  applySorting,
  fitLegendBox,
  redrawLegend,
  clearLegend,
  drawLegend,
  dragLegendBox,
  createPicker,
  openPicker,
  dragPicker,
  clickPickerControl,
  dragPickerControl,
  changePickerSpace,
  selectIcon,
  getBBox,
  highlightElement,
  getFileName,
  downloadFile,
  getAreaUnit,
  getArea,
  listen,
  refreshAllEditors,
  fog,
  unfog,
  moveCircle,
  confirmationDialog,
  editBiomes,
  editBurgGroups,
  editStates,
  editCultures,
  editReligions,
  editProvinces,
  editZones,
  editUnits,
  editDiplomacy,
  editCoastlineSettings,
  editEmblem,
  editHeightmap,
  editNotes,
  showBurgTemperatureGraph,
  editRiver,
  editRoute,
  editRouteGroups,
  editLabel,
  editLake,
  editCoastline,
  editMarker,
  editReliefIcon,
  editRegiment,
  editIce,

  applyStyleOnLoad,
  applyStyle,
  applyStyleWithUiRefresh,
  changeStyle,
  requestStylePresetChange,
  addStylePreset,
  requestRemoveStylePreset,
  editStyle,
  selectStyleElement,
  updateElements,
  addCustomColorScheme,
  getColorScheme,
  getColor,
  editBurg,
  editWorld,
  textureProvideURL,
  cleanupData,
  exportToJson,

  Rulers,
  createDefaultRuler,

  initiateAutosave,
  saveMap,
  saveToStorage,
  saveToMachine,
  saveToDropbox,

  quickLoad,
  openLocalMapFilePicker,
  loadFromDropbox,
  createSharableDropboxLink,
  loadMapPrompt,
  showUploadMessage,
  loadMapFromURL,
  showUploadErrorMessage,
  uploadMap,

  addLabelOnClick,
  addRiverOnClick,
  addMarkerOnClick,
  toggleAddRiver,
  configMarkersGeneration,

  overviewBurgs,
  overviewMarkers,
  overviewRivers,
  overviewRoutes,
  overviewMilitary,
  getCellPopulation,
  showInfo,

  setSeedFlow,
  addLakesInDeepDepressionsFlow,
  openNearSeaLakesFlow,
  generateMapFlow,
  reGraphFlow,
  rankCellsFlow,
  showStatisticsFlow,
  undrawFlow,
  regenerateMapFlow,
  createRegenerateMap,
  buildGenerationModules,
  buildGenerateDeps,

  zoomToPoint,
  resetZoomToInitial,
  invokeActiveZoomingView,

  defineMapSizeFlow,
  calculateMapCoordinatesFlow,
  calculateTemperaturesFlow,
  generatePrecipitationFlow,

  checkLoadParametersFlow,
  generateMapOnLoadFlow,
  focusOnFlow,
  findBurgForMFCGFlow,
  initStartupOnDomContentLoaded,

  buildCheckLoadParametersDeps,
  buildGenerateMapOnLoadDeps,
  buildFocusOnDeps,
  buildFindBurgForMFCGDeps,
  buildZoomToPointDeps,
  buildResetZoomDeps,
  buildInvokeActiveZoomingDeps,
  hideLoadingUI,
  showLoadingUI,
  openMinimapDialog,
  toggleAssistantWidget,
  initTourPromptButtonUI,
  initDragToUpload,

  exportToSvg,
  exportToPng,
  exportToJpeg,
  exportToPngTiles,
  saveGeoJsonCells,
  saveGeoJsonRoutes,
  saveGeoJsonRivers,
  saveGeoJsonMarkers,
  saveGeoJsonZones,

  // Phase 5: IIFE globals converted to ESM exports
  ThreeD,
  Cloud
};

// Migration period: dual publish to keep legacy window handlers working while
// new callers move to window.fmg. Window root publish can be removed later.
Object.assign(window, legacyCompat);
const fmg = window.fmg || (window.fmg = {} as FmgGlobalContext);
Object.assign(fmg as FmgGlobalContext & Record<string, unknown>, legacyCompat);

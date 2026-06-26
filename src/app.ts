import { getWorldState, resetZoom, zoomTo } from "./actions";
import { appServices } from "./context/appServices";
import { viewContext } from "./context/viewContext";
import { worldContext } from "./context/worldContext";
import { editBurg } from "./controllers/burg-editor";
import { restoreDefaultEvents, unselect } from "./controllers/editors";
import { initControllers } from "./controllers/index";
import {
  handleLayersPresetChange,
  registerDrawLayerHook,
  registerLayerElement,
  registerLayerToggle,
  registerToolAction,
  removePreset,
  savePreset,
  toggleBurgIcons,
  toggleLabels,
  toggleLayerById,
  turnButtonOff,
  turnButtonOn,
  unregisterToolAction
} from "./controllers/layers";
import { changeViewMode } from "./controllers/options";
import { initExtensions } from "./extensions/index";
import { initModules } from "./generators/index";
import { buildGeoJsonZones, saveGeoJsonZones } from "./io/export";
import { generate, initMain, regenerateMap } from "./main";
import { initRenderers } from "./renderers/index";
import { UITour } from "./services/ui-tour";
import { useExtensionState } from "./store/extensionState";
import { useLayerState } from "./store/layerState";
import type { ExtensionAPI } from "./types/extension-api";
import { closeDialog, isDialogOpen, openDialog, openRichDialog } from "./ui/dialogs/dialogService";
import { initUtils } from "./utils/index";
import { layerIsOn } from "./utils/nodeUtils";
import { tooltipExtensions } from "./utils/uiHelpers";

function buildExtensionAPI(): ExtensionAPI {
  const extState = useExtensionState.getState;
  const layerState = useLayerState.getState;

  return {
    worldContext,
    viewContext,

    registerExtension: (config, defaultEnabled) => extState().registerExtension(config, defaultEnabled),
    registerAction: action => extState().registerAction(action),
    registerDialog: dialog => extState().registerDialog(dialog),
    unregisterExtension: id => extState().unregisterExtension(id),
    toggleExtension: (id, forceState) => extState().toggleExtension(id, forceState),
    isExtensionEnabled: id => extState().enabledExtensions[id] ?? false,
    subscribeExtensionState: listener =>
      useExtensionState.subscribe((state, prev) =>
        listener({ enabledExtensions: state.enabledExtensions }, { enabledExtensions: prev.enabledExtensions })
      ),

    addLayers: layers => layerState().addLayers(layers),
    removeLayers: ids => layerState().removeLayers(ids),
    toggleLayerById,
    layerIsOn,
    turnLayerOn: turnButtonOn,
    turnLayerOff: turnButtonOff,
    registerLayerToggle,
    registerLayerElement,
    registerDrawLayerHook,

    openRichDialog,
    openDialog: id => openDialog(id),
    closeDialog,
    isDialogOpen,

    registerToolAction,
    unregisterToolAction,

    zoomTo,

    tooltipExtensions
  };
}

async function initApp(): Promise<void> {
  console.log("initApp starting...");
  console.log("Initializing React UI...");
  const { initReactUI } = await import("./ui/index");
  initReactUI();
  await new Promise(resolve => setTimeout(resolve, 0));

  console.log("Initializing utils...");
  initUtils();
  console.log("Initializing modules...");
  initModules();
  console.log("Initializing renderers...");
  initRenderers();
  console.log("Initializing controllers...");
  initControllers(worldContext, viewContext, appServices);
  console.log("Initializing main...");
  initMain();

  // Assemble the public API surface before loading extensions so that
  // dynamically loaded extension modules can call window.fmg.extensionAPI.
  window.fmg = Object.freeze({
    world: worldContext,
    view: viewContext,
    actions: Object.freeze({
      generate,
      regenerateMap,
      zoomTo,
      resetZoom,
      toggleLayer: toggleLayerById,
      handleLayersPresetChange,
      savePreset,
      removePreset,
      changeViewMode,
      restoreDefaultEvents,
      unselect,
      getWorldState,
      UITour,
      layerIsOn,
      toggleLabels,
      toggleBurgIcons,
      saveGeoJsonZones,
      getGeoJsonZones: buildGeoJsonZones,
      editBurg
    }),
    extensionAPI: buildExtensionAPI()
  });

  console.log("Initializing extensions...");
  await initExtensions();

  console.log("initApp completed!");
}

initApp();

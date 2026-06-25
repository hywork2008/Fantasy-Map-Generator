import { getWorldState, resetZoom, zoomTo } from "./actions";
import { appServices } from "./context/appServices";
import { viewContext } from "./context/viewContext";
import { worldContext } from "./context/worldContext";
import { restoreDefaultEvents, unselect } from "./controllers/editors";
import { initControllers } from "./controllers/index";
import {
  handleLayersPresetChange,
  removePreset,
  savePreset,
  toggleBurgIcons,
  toggleLabels,
  toggleLayerById
} from "./controllers/layers";
import { changeViewMode } from "./controllers/options";
import { UITour } from "./controllers/ui-tour";
import { editBurg } from "./editors/burg-editor";
import { initExtensions } from "./extensions/index";
import { buildGeoJsonZones, saveGeoJsonZones } from "./io/export";
import { generate, initMain, regenerateMap } from "./main";
import { initModules } from "./modules/index";
import { initRenderers } from "./renderers/index";
import { initUtils } from "./utils/index";
import { layerIsOn } from "./utils/nodeUtils";

async function initApp(): Promise<void> {
  console.log("initApp starting...");
  console.log("Initializing React UI...");
  const { initReactUI } = await import("./ui/index");
  initReactUI();
  await new Promise(resolve => setTimeout(resolve, 0));

  console.log("Initializing utils...");
  initUtils();
  console.log("Initializing extensions...");
  initExtensions();
  console.log("Initializing modules...");
  initModules();
  console.log("Initializing renderers...");
  initRenderers();
  console.log("Initializing controllers...");
  initControllers(worldContext, viewContext, appServices);
  console.log("Initializing main...");
  initMain();

  // Assemble the single typed public API surface — frozen after all modules are ready.
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
    })
  });

  console.log("initApp completed!");
}

initApp();

import { getWorldState, resetZoom, zoomTo } from "./actions";
import { appServices } from "./context/appServices";
import type { SvgGroup } from "./context/viewContext";
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
  registerPreset,
  registerToolAction,
  removePreset,
  savePreset,
  toggleBurgIcons,
  toggleLabels,
  toggleLayerById,
  turnButtonOff,
  turnButtonOn,
  unregisterPreset,
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
import type { SvgLayerSpec } from "./store/layerState";
import { useLayerState } from "./store/layerState";
import type { ExtensionAPI } from "./types/extension-api";
import { closeDialog, isDialogOpen, openDialog, openRichDialog } from "./ui/dialogs/dialogService";
import { initUtils } from "./utils/index";
import { layerIsOn } from "./utils/nodeUtils";
import { tooltipExtensions } from "./utils/uiHelpers";

function buildExtensionAPI(): ExtensionAPI {
  const extState = useExtensionState.getState;
  const layerState = useLayerState.getState;

  // Internal registry of extension-owned SVG layers.
  const _svgLayerMap = new Map<string, SvgGroup>();
  const _registeredSvgSpecs: SvgLayerSpec[] = [];
  const _mapReinitHooks: Array<() => void> = [];

  /** Select an existing SVG <g> or create one at the position described by spec. */
  function createOrAcquireSvgLayer(spec: SvgLayerSpec): SvgGroup {
    const existing = viewContext.viewbox.select<SVGGElement>(`#${spec.id}`);
    if (!existing.empty()) return existing;

    let group: SvgGroup;
    if (spec.insertBefore) {
      const anchor = document.getElementById(spec.insertBefore);
      group = anchor
        ? viewContext.viewbox.insert<SVGGElement>("g", () => anchor)
        : viewContext.viewbox.append<SVGGElement>("g");
    } else if (spec.insertAfter) {
      const anchor = document.getElementById(spec.insertAfter);
      group = anchor?.nextSibling
        ? viewContext.viewbox.insert<SVGGElement>("g", () => anchor.nextSibling as Element)
        : viewContext.viewbox.append<SVGGElement>("g");
    } else {
      group = viewContext.viewbox.append<SVGGElement>("g");
    }

    group.attr("id", spec.id);
    if (spec.display) group.style("display", spec.display);
    return group;
  }

  // After the host reinitialises SVG layer references (map load), re-acquire all
  // registered extension SVG layers and call extension reinit hooks.
  document.addEventListener("fmg:map-layers-reinitialized", () => {
    for (const spec of _registeredSvgSpecs) {
      _svgLayerMap.set(spec.id, createOrAcquireSvgLayer(spec));
    }
    for (const hook of _mapReinitHooks) {
      hook();
    }
  });

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

    registerPreset,
    unregisterPreset,

    addLayers: layers => {
      layerState().addLayers(layers);
      // Create or re-acquire SVG <g> elements declared in each layer's svgLayers spec.
      for (const layer of layers) {
        for (const spec of layer.svgLayers ?? []) {
          if (!_registeredSvgSpecs.some(s => s.id === spec.id)) {
            _registeredSvgSpecs.push(spec);
          }
          _svgLayerMap.set(spec.id, createOrAcquireSvgLayer(spec));
        }
      }
    },
    removeLayers: ids => layerState().removeLayers(ids),
    toggleLayerById,
    layerIsOn,
    turnLayerOn: turnButtonOn,
    turnLayerOff: turnButtonOff,
    registerLayerToggle,
    registerLayerElement,
    registerDrawLayerHook,
    getSvgLayer: id => _svgLayerMap.get(id) ?? null,
    registerMapReinitHook: fn => {
      _mapReinitHooks.push(fn);
    },

    openRichDialog,
    openDialog: (id, config) => openDialog(id, config),
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

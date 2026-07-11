import { getWorldState, resetZoom, setRenderMode, zoomTo } from "./actions";
import { appServices } from "./context/appServices";
import { simulationContext } from "./context/simulationContext";
import type { SvgGroup } from "./context/viewContext";
import { viewContext } from "./context/viewContext";
import { worldContext } from "./context/worldContext";
import { editBurg } from "./controllers/burg-editor";
import { moveCircle, restoreDefaultEvents, unselect } from "./controllers/editors";
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
  scheduleWebglUpdate,
  toggleBurgIcons,
  toggleLabels,
  toggleLayerById,
  turnButtonOff,
  turnButtonOn,
  unregisterPreset,
  unregisterToolAction
} from "./controllers/layers";
import { changeViewMode } from "./controllers/viewMode";
import { injectInfrastructure, injectVisibleUI } from "./dom/initDOM";
import { initExtensions } from "./extensions/index";
import { initModules } from "./generators/index";
import { advanceTime, registerTimeTickHook } from "./generators/timeEngine";
import { buildGeoJsonZones, saveGeoJsonZones } from "./io/export";
import { generate, initMain, regenerateMap } from "./main";
import { initRenderers } from "./renderers/index";
import {
  registerExtensionWebglLayers,
  unregisterExtensionWebglLayers
} from "./renderers/webgl/extensionWebglLayerRegistry";
import { burgEconomyExtensions } from "./services/burgEconomyExtensions";
import { getBurgSiteDescriptor } from "./services/burgSiteDescriptor";
import {
  registerExtensionMapPickHandler,
  unregisterExtensionMapPickHandler
} from "./services/extensionMapPickHandlers";
import { getEffectiveSkill, registerSkillModifier } from "./services/skillModifierService";
import { tooltipExtensions } from "./services/tooltipService";
import { UITour } from "./services/ui-tour";
import { useExtensionState } from "./store/extensionState";
import type { SvgLayerSpec } from "./store/layerState";
import { useLayerState } from "./store/layerState";
import type { ExtensionAPI } from "./types/extension-api";
import { closeDialog, isDialogOpen, openDialog, openRichDialog } from "./ui/dialogs/dialogService";
import { removeCircle } from "./utils/domUtils";
import { initUtils } from "./utils/index";
import { layerIsOn } from "./utils/nodeUtils";

export interface FMGInitOptions {
  container?: HTMLElement;
  drawMap?: boolean;
  drawUI?: boolean;
}

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
    appServices,
    simulationContext,

    registerExtension: (config, defaultEnabled) => extState().registerExtension(config, defaultEnabled),
    registerAction: action => extState().registerAction(action),
    registerDialog: dialog => extState().registerDialog(dialog),
    registerEditorTab: tab => extState().registerEditorTab(tab),
    registerStyleConfig: config => extState().registerStyleConfig(config),
    registerBurgOverviewColumn: column => extState().registerBurgOverviewColumn(column),
    unregisterBurgOverviewColumn: id => extState().unregisterBurgOverviewColumn(id),
    registerStateOverviewColumn: column => extState().registerStateOverviewColumn(column),
    unregisterStateOverviewColumn: id => extState().unregisterStateOverviewColumn(id),
    registerCellInfoRow: row => extState().registerCellInfoRow(row),
    unregisterCellInfoRow: id => extState().unregisterCellInfoRow(id),
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
    registerWebglLayers: registerExtensionWebglLayers,
    unregisterWebglLayers: unregisterExtensionWebglLayers,
    requestWebglRender: scheduleWebglUpdate,
    registerMapPickHandler: registerExtensionMapPickHandler,
    unregisterMapPickHandler: unregisterExtensionMapPickHandler,

    openRichDialog,
    openDialog: (id, config) => openDialog(id, config),
    closeDialog,
    isDialogOpen,

    registerToolAction,
    unregisterToolAction,

    registerTimeTickHook,

    registerSkillModifier,
    getEffectiveSkill,

    zoomTo,
    restoreDefaultEvents,
    moveCircle,
    removeCircle,

    tooltipExtensions,
    burgEconomyExtensions
  };
}

export async function initApp(options: FMGInitOptions = {}): Promise<void> {
  console.log("initApp starting with options:", options);

  const drawMap = options.drawMap ?? true;
  const drawUI = options.drawUI ?? true;

  let container = options.container;
  if (!container) {
    container = document.createElement("div");
    container.id = "fmg-container";
    container.style.width = "100%";
    container.style.height = "100%";
    document.body.appendChild(container);
  }

  const mapSvg = document.getElementById("map");
  if (drawMap) {
    if (mapSvg && mapSvg.parentElement !== container) {
      container.appendChild(mapSvg);
    }
  } else {
    if (mapSvg) mapSvg.remove();
  }
  // Save options to skip or allow rendering logic
  viewContext.renderMap = drawMap;

  const defElementsSvg = document.getElementById("defElements");
  if (defElementsSvg && defElementsSvg.parentElement !== container) {
    container.appendChild(defElementsSvg);
  }

  injectInfrastructure(container);

  if (drawUI) {
    injectVisibleUI(container);
    console.log("Initializing React UI...");
    const { initReactUI } = await import("./ui/index");
    initReactUI(container);
    await new Promise(resolve => setTimeout(resolve, 0));
  } else {
    // If we don't draw UI, we must remove existing placeholders if they were in HTML
    document.getElementById("loading")?.remove();
  }

  console.log("Initializing utils...");
  initUtils();
  console.log("Initializing modules...");
  initModules();
  if (drawMap) {
    console.log("Initializing renderers...");
    initRenderers();
  }
  console.log("Initializing controllers...");
  initControllers(worldContext, viewContext, appServices);
  console.log("Initializing main...");
  // We need to pass drawMap to main so it knows not to call drawLayers
  initMain(drawMap);

  // Assemble the public API surface before loading extensions so that
  // dynamically loaded extension modules can call window.fmg.extensionAPI.
  window.fmg = Object.freeze({
    world: worldContext,
    view: viewContext,
    simulation: simulationContext,
    actions: Object.freeze({
      generate,
      regenerateMap,
      zoomTo,
      resetZoom,
      setRenderMode,
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
      editBurg,
      advanceTime,
      getBurgSiteDescriptor
    }),
    extensionAPI: buildExtensionAPI()
  });

  console.log("Initializing extensions...");
  await initExtensions();

  console.log("initApp completed!");
}

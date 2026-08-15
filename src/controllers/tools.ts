import Alea from "alea";
import * as d3 from "d3";
import { pointer, quadtree } from "d3";
import { getWorldState } from "../actions";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { isNomadicBiome } from "../data/biomeCatalog";
import { refreshRiverHydrology } from "../generators/riverHydrology";
import { applyInitialSettlementPattern } from "../generators/settlementPattern";
import { runTimeSimulation } from "../generators/timeEngine";
import { assignWildLandTags } from "../generators/wildLandTags";
import { rankCells } from "../main";
import {
  BordersRenderer,
  BurgIconsRenderer,
  BurgLabelsRenderer,
  CulturesRenderer,
  drawStateLabels,
  EmblemsRenderer,
  IceRenderer,
  MarkersRenderer,
  MilitaryRenderer,
  PopulationRenderer,
  ProvincesRenderer,
  ReliefIconsRenderer,
  ReligionsRenderer,
  RiversRenderer,
  RoutesRenderer,
  StatesRenderer,
  ZonesRenderer
} from "../renderers";
import { COArenderer } from "../renderers/emblem-renderer";
import { appendMarkerToLayer } from "../renderers/index";
import { legacyMutation } from "../runtime/worldRuntime";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { useBurgsOverviewState } from "../store/burgsOverviewState";
import { dialogStore } from "../store/dialogState";
import { elSelected, modules } from "../store/editorState";
import { heightmapEditModeStore } from "../store/heightmapDialogState";
import { useLayerState } from "../store/layerState";
import { useMarkersOverviewState } from "../store/markersOverviewState";
import { useMilitaryOverviewState } from "../store/militaryOverviewState";
import { useOptionsState } from "../store/optionsState";
import { useRiversOverviewState } from "../store/riversOverviewState";
import { useUiPreferencesState } from "../store/uiPreferencesState";
import type { MarkerConfig } from "../types/MarkerConfig";
import type {
  Burg,
  InternationalRoutePolicy,
  LandRouteGenerationMode,
  Marker,
  Province,
  Religion,
  River,
  Route,
  SeaRouteGenerationMode,
  State
} from "../types/models";
import type { WorldNote } from "../types/WorldState";
import * as Dialogservice from "../ui/dialogs/dialogService";
import { closeDialog, closeDialogs, openDialog, openPrompt } from "../ui/dialogs/dialogService";
import type { RegenerateConfirmConfig, RouteRegenerationModes } from "../ui/dialogs/RegenerateConfirmDialog";
import { findCell, gauss, generateSeed, getNextId, isCtrlClick, P, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { getElementById, getElementBySelector, getElementsBySelector, layerIsOn } from "../utils/nodeUtils";
import { overviewBurgs } from "./burgs-overview";
import { openChartsOverview } from "./charts-overview";
import { editDiplomacy, openRelationsHistory } from "./diplomacy-editor";
import { editCoastlineSettings, editCultures, editReligions, refreshAllEditors } from "./editors";
import { editEmblem } from "./emblems-editor";
import { editHeightmap } from "./heightmapEditor";
import { interactionManager } from "./interactionManager";
import {
  getToolActionHandler,
  toggleBorders,
  toggleCultures,
  toggleEmblems,
  toggleIce,
  toggleLabels,
  toggleMarkers,
  toggleMilitary,
  togglePopulation,
  toggleProvinces,
  toggleRelief,
  toggleReligions,
  toggleRivers,
  toggleRoutes,
  toggleStates,
  turnButtonOn
} from "./layers";
import { editMarker } from "./markers-editor";
import * as MarkersOverview from "./markers-overview";
import { overviewMilitary } from "./military-overview";
import { openMinimapDialog } from "./minimap";
import { NamesbaseEditor } from "./namesbase-editor";
import { editNotes } from "./notes-editor";
import { cellsDensityMap } from "./options";
import { overviewPopulation } from "./population-overview";
import { editProvinces } from "./provinces-editor";
import { overviewRegiments } from "./regiments-overview";
import * as RiversOverview from "./rivers-overview";
import { createRoute } from "./routes-editor";
import { overviewRoutes } from "./routes-overview";
import { openSubmapTool } from "./submap-tool";
import { openTransformTool } from "./transform-tool";
import { editUnits } from "./units-editor";
import { editWorld } from "./world-configurator";
import { editZones } from "./zones-editor";

let worldContext: WorldContext;
let appServices: AppServices;

// ─── Layer state restoration when dialogs close ───────────────────────────────
// For each dialog opened via toggleEditor, stores the before-open state of every
// layer that changed when openFunc() ran (diff of activeLayers before vs after).
// When any dialog closes (including via closeAllDialogs), only those diff layers
// are restored — unrelated manual layer changes during the dialog session are
// left untouched. Simultaneously closed dialogs are unwound last-opened first,
// so an editor opened on top of another cannot overwrite the earlier editor's
// original layer state.
const dialogLayerChanges = new Map<string, Map<string, boolean>>();

dialogStore.subscribe((state, prevState) => {
  for (const dialogId of Array.from(prevState.openDialogs).reverse()) {
    if (!state.openDialogs.has(dialogId)) {
      const changes = dialogLayerChanges.get(dialogId);
      if (changes) {
        const currentLayers = useLayerState.getState().activeLayers;
        for (const [layerId, wasOn] of changes) {
          const isOn = currentLayers[layerId] ?? false;
          if (wasOn !== isOn) {
            getElementById(layerId)?.click();
          }
        }
        dialogLayerChanges.delete(dialogId);
      }
    }
  }
});

// ─── Tools panel event dispatcher ────────────────────────────────────────────

document.addEventListener("react-tool-action", e => {
  const detail = (e as CustomEvent).detail;
  const button = detail?.action;
  if (!button) return;

  const toggleEditor = (dialogId: string, _layerId: string | null, openFunc: () => void) => {
    if (Dialogservice.isDialogOpen(dialogId)) {
      Dialogservice.closeDialog(dialogId);
      // Layer restoration is handled by the dialogStore subscriber above.
    } else {
      // Snapshot layers before openFunc runs, diff after to capture every layer
      // the editor toggles internally (e.g. editProvinces also touches toggleStates).
      const before = { ...useLayerState.getState().activeLayers };
      openFunc();
      const after = useLayerState.getState().activeLayers;
      const changes = new Map<string, boolean>();
      for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const wasBefore = before[id] ?? false;
        const isAfter = after[id] ?? false;
        if (wasBefore !== isAfter) changes.set(id, wasBefore);
      }
      if (changes.size > 0) dialogLayerChanges.set(dialogId, changes);
    }
  };

  // Heightmap editor can toggle even during its own customization mode (customization === 1)
  if (button === "editHeightmapButton") {
    if (view.customization === 1) {
      // In heightmap edit mode: finalize via the Exit Customization button
      getElementById("finalizeHeightmap")?.click();
    } else if (view.customization === 0) {
      if (modules.editHeightmap) {
        // Mode selection dialog is currently open: close it and reset state
        modules.editHeightmap = false;
        heightmapEditModeStore.getState().close();
      } else {
        editHeightmap();
      }
    } else {
      tip("Please exit the customization mode first", false, "error");
    }
    return;
  }

  if (view.customization) return tip("Please exit the customization mode first", false, "error");

  if (button === "editBiomesButton") toggleEditor("biomesEditor", "toggleBiomes", EditorBus.editBiomes);
  else if (button === "editStatesButton") toggleEditor("statesEditor", "toggleStates", EditorBus.editStates);
  else if (button === "editProvincesButton") toggleEditor("provincesEditor", "toggleProvinces", editProvinces!);
  else if (button === "editDiplomacyButton") toggleEditor("diplomacyEditor", "toggleStates", editDiplomacy!);
  else if (button === "openDiplomacyHistory") toggleEditor("diplomacyHistory", null, openRelationsHistory);
  else if (button === "editCoastlineSettings") toggleEditor("coastlineSettingsDialog", null, editCoastlineSettings);
  else if (button === "editCulturesButton") toggleEditor("culturesEditor", "toggleCultures", editCultures);
  else if (button === "editReligions") toggleEditor("religionsEditor", "toggleReligions", editReligions);
  else if (button === "editEmblemButton") toggleEditor("emblemEditor", "toggleEmblems", openEmblemEditor);
  else if (button === "editNamesBaseButton") toggleEditor("namesbaseEditor", null, NamesbaseEditor.open);
  else if (button === "editUnitsButton") toggleEditor("unitsEditor", "toggleMilitary", editUnits);
  else if (button === "editNotesButton") toggleEditor("notesEditor", null, editNotes);
  else if (button === "editZonesButton") toggleEditor("zonesEditor", "toggleZones", editZones!);
  else if (button === "overviewChartsButton") toggleEditor("chartsOverview", null, overviewCharts);
  else if (button === "overviewBurgsButton") toggleEditor("burgsOverview", "toggleBurgIcons", overviewBurgs);
  else if (button === "overviewRoutesButton") toggleEditor("routesOverview", "toggleRoutes", overviewRoutes);
  else if (button === "overviewRiversButton")
    toggleEditor("riversOverview", "toggleRivers", RiversOverview.overviewRivers);
  else if (button === "overviewMilitaryButton") toggleEditor("militaryOverview", "toggleMilitary", overviewMilitary);
  else if (button === "overviewPopulationButton") toggleEditor("populationOverview", null, overviewPopulation);
  else if (button === "overviewRegimentsButton") toggleEditor("regimentsOverview", "toggleMilitary", overviewRegiments);
  else if (button === "overviewMarkersButton")
    toggleEditor("markersOverview", "toggleMarkers", MarkersOverview.overviewMarkers);
  else if (button === "overviewCellsButton") viewCellDetails();
  else if (button === "openMinimapButton") openMinimap?.();
  else if (button === "openAdvanceTimeDialog") openDialog("advanceTime");
  else if (button === "openFrontierOperationsDialog") openDialog("frontierOperations");
  else getToolActionHandler(button)?.(detail);

  if (button.startsWith("regenerate")) {
    const { dontAskRegenerateFeature, setDontAskRegenerateFeature } = useUiPreferencesState.getState();
    if (dontAskRegenerateFeature && button !== "regenerateRoutes") return processFeatureRegeneration(null, button);

    const featureName = button
      .replace(/^regenerate/, "")
      .replace(/([A-Z])/g, " $1")
      .trim()
      .toLowerCase();

    const regenerateConfig: RegenerateConfirmConfig = {
      featureName,
      showDontAskAgain: button !== "regenerateRoutes",
      seaRouteGenerationMode:
        button === "regenerateRoutes" ? (worldContext.options.seaRouteGenerationMode ?? "augmented") : undefined,
      landRouteGenerationMode:
        button === "regenerateRoutes" ? (worldContext.options.landRouteGenerationMode ?? "elevationAware") : undefined,
      landRouteElevationAversion:
        button === "regenerateRoutes" ? (worldContext.options.landRouteElevationAversion ?? 1) : undefined,
      internationalRoutePolicy:
        button === "regenerateRoutes"
          ? (worldContext.options.internationalRoutePolicy ?? "settlementDefault")
          : undefined,
      onProceed: (dontAskAgain, routeModes) => {
        if (dontAskAgain) setDontAskRegenerateFeature(true);
        processFeatureRegeneration(null, button, routeModes);
      }
    };
    openDialog("regenerateConfirm", regenerateConfig);
  }

  if (button === "configRegenerateMarkers") configMarkersGeneration();

  if (button === "addLabel") toggleAddLabel();
  else if (button === "addBurgTool") toggleAddBurg();
  else if (button === "addRiver") toggleAddRiver();
  else if (button === "addRoute") createRoute();
  else if (button === "addMarker") toggleAddMarker();
  else if (button === "openSubmapTool") openSubmapTool?.();
  else if (button === "openTransformTool") openTransformTool?.();
  else if (button === "openWorldConfigurator") editWorld();
  else if (button === "advanceTimeButton") {
    const years = detail.years !== undefined ? Number(detail.years) : 0;
    const months = detail.months !== undefined ? Number(detail.months) : 0;
    const days = detail.days !== undefined ? Number(detail.days) : 0;
    runTimeSimulation(years, months, days);
  }
});

// ─── Regeneration dispatcher ──────────────────────────────────────────────────

function processFeatureRegeneration(
  event: MouseEvent | null,
  button: string,
  routeModes?: RouteRegenerationModes
): void {
  if (button === "regenerateStateLabels") {
    d3.select("#labels").style("display", "block");
    drawStateLabels(worldContext, viewContext, appServices);
  } else if (button === "regenerateReliefIcons") {
    ReliefIconsRenderer.render(worldContext, viewContext, appServices);
    if (!layerIsOn("toggleRelief")) toggleRelief();
  } else if (button === "regenerateRoutes") {
    regenerateRoutes(
      routeModes?.seaRouteGenerationMode ?? worldContext.options.seaRouteGenerationMode ?? "augmented",
      routeModes?.landRouteGenerationMode ?? worldContext.options.landRouteGenerationMode ?? "elevationAware",
      routeModes?.landRouteElevationAversion ?? worldContext.options.landRouteElevationAversion ?? 1,
      routeModes?.internationalRoutePolicy ?? worldContext.options.internationalRoutePolicy ?? "settlementDefault"
    );
    if (!layerIsOn("toggleRoutes")) toggleRoutes();
  } else if (button === "regenerateRivers") regenerateRivers();
  else if (button === "regeneratePopulation") recalculatePopulation();
  else if (button === "regenerateStates") regenerateStates();
  else if (button === "regenerateSettlementPattern") regenerateSettlementPattern();
  else if (button === "regenerateProvinces") regenerateProvinces();
  else if (button === "regenerateBurgs") regenerateBurgs();
  else if (button === "regenerateEmblems") regenerateEmblems();
  else if (button === "regenerateReligions") regenerateReligions();
  else if (button === "regenerateCultures") regenerateCultures();
  else if (button === "regenerateMilitary") regenerateMilitary();
  else if (button === "regenerateIce") regenerateIce();
  else if (button === "regenerateMarkers") regenerateMarkers();
  else if (button === "regenerateZones") regenerateZones(event);
}

// ─── Emblem editor opener ────────────────────────────────────────────────────

export async function openEmblemEditor(): Promise<void> {
  let type: string, id: string, el: State | Burg;

  const firstState = worldContext.pack.states.find((s: State) => s.i && !s.removed && s.coa);
  const firstBurg = worldContext.pack.burgs.find((b: Burg) => b.i && !b.removed && b.coa);

  if (firstState) {
    type = "state";
    id = `stateCOA${firstState.i}`;
    el = firstState;
  } else if (firstBurg) {
    type = "burg";
    id = `burgCOA${firstBurg.i}`;
    el = firstBurg;
  } else {
    tip("No emblems to edit, please generate states and burgs first", false, "error");
    return;
  }

  await COArenderer.trigger(id, el.coa!);
  editEmblem?.(type, id, el);
  openDialog("emblemEditor");
}

// ─── Regenerate functions ─────────────────────────────────────────────────────

function regenerateRoutes(
  seaRouteGenerationMode: SeaRouteGenerationMode = worldContext.options.seaRouteGenerationMode ?? "augmented",
  landRouteGenerationMode: LandRouteGenerationMode = worldContext.options.landRouteGenerationMode ?? "elevationAware",
  landRouteElevationAversion: number = worldContext.options.landRouteElevationAversion ?? 1,
  internationalRoutePolicy: InternationalRoutePolicy = worldContext.options.internationalRoutePolicy ??
    "settlementDefault"
): void {
  worldContext.options.landRouteElevationAversion = landRouteElevationAversion;
  worldContext.options.internationalRoutePolicy = internationalRoutePolicy;
  const locked = worldContext.pack.routes
    .filter((route: Route) => route.lock)
    .map((route: Route, index: number) => ({ ...route, i: index }));
  legacyMutation(() => {
    GenerationPipeline.Routes.generate(
      worldContext,
      viewContext,
      appServices,
      getWorldState(),
      locked,
      seaRouteGenerationMode,
      landRouteGenerationMode
    );
    return { result: undefined, topics: ["map.networks"] };
  });

  view.routes.selectAll("path").remove();
  if (layerIsOn("toggleRoutes")) RoutesRenderer.render(worldContext, viewContext, appServices);
}

function regenerateRivers(): void {
  const state = getWorldState();
  legacyMutation(() => {
    GenerationPipeline.Rivers.generate(worldContext, viewContext, appServices, state);
    GenerationPipeline.Rivers.specify(worldContext, viewContext, appServices, state);
    GenerationPipeline.Features.defineGroups();
    GenerationPipeline.Lakes.defineNames(state);
    return { result: undefined, topics: ["map.physical", "map.networks"] };
  });
  if (layerIsOn("toggleRivers")) RiversRenderer.render(worldContext, viewContext, appServices);
}

export async function recalculatePopulation(): Promise<void> {
  legacyMutation(() => {
    rankCells();

    worldContext.pack.burgs.forEach((b: Burg) => {
      if (!b.i || b.removed || b.lock) return;
      const i = b.cell;
      b.population = rn(Math.max(worldContext.pack.cells.s[i] / 8 + b.i! / 1000 + (i % 100) / 1000, 0.1), 3);
      if (b.capital) b.population = b.population! * 1.3;
      if (b.port) b.population = b.population! * 1.3;
      b.population = rn(b.population * gauss(2, 3, 0.6, 20, 3), 3);
    });

    return { result: undefined, topics: ["map.settlements", "simulation.burgs"] };
  });

  layerIsOn("togglePopulation")
    ? PopulationRenderer.render(worldContext, viewContext, appServices)
    : togglePopulation();

  regenerateMilitary();
  refreshAllEditors();
}

function regenerateStates(): void {
  const commit = legacyMutation(() => {
    const newStates = recreateStates();
    if (!newStates) return { result: false, topics: [] };

    const pack = worldContext.pack;
    pack.states = newStates;
    const state = getWorldState();
    GenerationPipeline.States.expandStates(worldContext, viewContext, appServices);
    GenerationPipeline.States.normalize();
    GenerationPipeline.States.getPoles(state);
    GenerationPipeline.States.findNeighbors();
    GenerationPipeline.States.collectStatistics(state);
    GenerationPipeline.States.assignColors(worldContext, viewContext, appServices);
    GenerationPipeline.States.generateCampaigns();
    GenerationPipeline.States.generateDiplomacy();
    GenerationPipeline.States.defineStateForms(state);

    GenerationPipeline.Provinces.generate(worldContext, viewContext, appServices, state, true);
    GenerationPipeline.Provinces.getPoles(state);
    GenerationPipeline.Military.generate(worldContext, viewContext, appServices, state);

    return {
      result: true,
      topics: ["map.politics", "map.settlements", "simulation.states", "simulation.burgs"]
    };
  });
  if (!commit) return;

  layerIsOn("toggleStates") ? StatesRenderer.render(worldContext, viewContext, appServices) : toggleStates();
  layerIsOn("toggleBorders") ? BordersRenderer.render(worldContext, viewContext, appServices) : toggleBorders();
  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);

  drawStateLabels(worldContext, viewContext, appServices);
  if (layerIsOn("toggleEmblems")) EmblemsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBurgIcons")) BurgIconsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleLabels")) BurgLabelsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleMilitary")) MilitaryRenderer.render(worldContext, viewContext, appServices);

  closeDialog("regimentEditor");
  closeDialog("battleScreen");

  const openDialogs = dialogStore.getState().openDialogs;
  if (openDialogs.has("burgsOverview")) useBurgsOverviewState.getState().refresh();
  if (openDialogs.has("militaryOverview")) useMilitaryOverviewState.getState().refresh();
  document.dispatchEvent(new CustomEvent("fmg:refresh-editors"));
}

function recreateStates(): State[] | null {
  const pack = worldContext.pack;
  const localSeed = generateSeed();
  (Math as Record<"random", () => number>).random = Alea(localSeed);

  const statesCount = useOptionsState.getState().statesNumber;
  if (!statesCount) {
    tip(`<i>GenerationPipeline.States Number</i> option value is zero. No counties are generated`, false, "error");
    return null;
  }

  const validBurgs = worldContext.pack.burgs.filter((b: Burg) => b.i && !b.removed);
  if (!validBurgs.length) {
    tip("There are no any burgs to generate states. Please create burgs first", false, "error");
    return null;
  }

  if (validBurgs.length < statesCount) {
    tip(
      `Not enough burgs to generate ${statesCount} states. Will generate only ${validBurgs.length} states`,
      false,
      "warn"
    );
  }

  const validStates = worldContext.pack.states.filter((s: State) => s.i && !s.removed);
  const lockedStates = validStates.filter((s: State) => s.lock);
  const lockedStatesIds = lockedStates.map((s: State) => s.i);
  const lockedStatesCapitals = lockedStates.map((s: State) => s.capital);

  if (validStates.length && lockedStates.length === validStates.length) {
    tip("Unable to regenerate as all states are locked", false, "error");
    return null;
  }

  for (const burg of validBurgs) {
    if (burg.capital) {
      if (lockedStatesCapitals.includes(burg.i!)) continue;
      burg.capital = 0;
      GenerationPipeline.Burgs.changeGroup(burg);
    }
  }

  for (const state of worldContext.pack.states as State[]) {
    if (!state.i || state.removed || state.lock) continue;
    getElementById(`stateLabel${state.i}`)?.remove();
    getElementById(`textPath_stateLabel${state.i}`)?.remove();
    getElementById(`stateCOA${state.i}`)?.remove();
    getElementBySelector<SVGUseElement>(`#stateEmblems > use[data-i="${state.i}"]`)?.remove();

    for (const provinceId of state.provinces ?? []) {
      getElementById(`provinceCOA${provinceId}`)?.remove();
      getElementBySelector<SVGUseElement>(`#provinceEmblems > use[data-i="${provinceId}"]`)?.remove();
      pack.provinces[provinceId].removed = true;
    }
  }

  EditorBus.unfog("");

  const sortedBurgs = validBurgs
    .filter((b: Burg) => !lockedStatesIds.includes(b.state!))
    .map((b: Burg) => [b, (b.population ?? 0) * Math.random()] as [Burg, number])
    .sort((a, b) => b[1] - a[1])
    .map(pair => pair[0]);

  const count = Math.min(statesCount, validBurgs.length) + 1;
  let spacing = (worldContext.graphWidth + worldContext.graphHeight) / 2 / count;

  const capitalsTree = quadtree<[number, number]>()
    .x(d => d[0])
    .y(d => d[1]);
  const isTooClose = (x: number, y: number, sp: number) => Boolean(capitalsTree.find(x, y, sp));

  const newStates: State[] = [{ i: 0, name: worldContext.pack.states[0].name } as State];

  lockedStates.forEach((state: State) => {
    const newId = newStates.length;
    const { x, y } = worldContext.pack.burgs[state.capital];
    capitalsTree.add([x, y]);

    getElementById(`textPath_stateLabel${state.i}`)?.setAttribute("id", `textPath_stateLabel${newId}`);
    const $label = getElementById(`stateLabel${state.i}`);
    if ($label) {
      $label.setAttribute("id", `stateLabel${newId}`);
      const $textPath = $label.querySelector("textPath");
      if ($textPath) {
        $textPath.removeAttribute("href");
        $textPath.setAttribute("href", `#textPath_stateLabel${newId}`);
      }
    }

    getElementById(`stateCOA${state.i}`)?.setAttribute("id", `stateCOA${newId}`);
    getElementBySelector<SVGUseElement>(`#stateEmblems > use[data-i="${state.i}"]`)?.setAttribute(
      "data-i",
      String(newId)
    );

    (state.provinces ?? []).forEach((provinceId: number) => {
      if (!pack.provinces[provinceId]) return;
      pack.provinces[provinceId].state = newId;
    });

    state.i = newId;
    newStates.push(state);
  });

  for (const i of pack.cells.i) {
    const stateId = pack.cells.state[i];
    const lockedStateIndex = lockedStatesIds.indexOf(stateId) + 1;
    pack.cells.state[i] = lockedStateIndex;
  }

  for (let i = newStates.length; i < count; i++) {
    let capital: Burg | null = null;

    for (const burg of sortedBurgs) {
      const { x, y } = burg;
      if (!isTooClose(x, y, spacing)) {
        burg.capital = 1;
        capital = burg;
        capitalsTree.add([x, y]);
        GenerationPipeline.Burgs.changeGroup(capital);
        break;
      }
      spacing = Math.max(spacing - 1, 1);
    }

    if (!capital) break;

    const culture = capital.culture!;
    const capitalName = capital.name!;
    const basename =
      capitalName.length < 9 && capital.cell % 5 === 0
        ? capitalName
        : (
            GenerationPipeline.Names as { getCulture(c: number, a: number, b: number, s: string, n: number): string }
          ).getCulture(culture, 3, 6, "", 0);
    const name = GenerationPipeline.Names.getState(basename, culture);
    const nomadic = isNomadicBiome(worldContext.biomesData, worldContext.pack.cells.biomeCode[capital.cell]);
    const type = nomadic
      ? "Nomadic"
      : worldContext.pack.cultures[culture!].type === "Nomadic"
        ? "Generic"
        : worldContext.pack.cultures[culture!].type;
    const expansionism = rn(Math.random() * useOptionsState.getState().sizeVariety + 1, 1);
    const cultureType = worldContext.pack.cultures[culture!].type;
    const coa = GenerationPipeline.COA.generate(capital.coa || null, 0.3, null, cultureType ?? "Generic");
    coa.shield = capital.coa?.shield;
    newStates.push({
      i,
      name,
      type: type ?? "Generic",
      capital: capital.i!,
      center: capital.cell,
      culture,
      expansionism,
      coa
    } as State);
  }

  return newStates;
}

/**
 * Oikoumene land share (and other settlement-pattern options) only take effect
 * through `applyInitialSettlementPattern`, which core generation runs exactly
 * once, before burgs exist. `regenerateStates`/`regenerateBurgs` reuse the
 * population footprint that call produced and cannot widen or shrink it, so
 * changing the option after generation has no visible effect through them.
 * This action re-derives the footprint from the current option and rebuilds
 * everything seeded from it (burgs, routes, states, religions, provinces,
 * military) — it intentionally cannot preserve locked burgs/states/provinces,
 * since the land they sat on may no longer be part of the oikoumene.
 */
function regenerateSettlementPattern(): void {
  const commit = legacyMutation(() => {
    const pack = worldContext.pack;
    const cells = pack.cells;
    const optionsSnap = useOptionsState.getState();
    const state = getWorldState();

    // `worldContext.options.initialSettlementPattern` (and the other fields
    // `prepareGenerationStage` copies) is only refreshed by a full Generate
    // run. Every generator below branches on it directly, so a stale value
    // here silently ignores whatever pattern the user currently has selected.
    worldContext.options.initialSettlementPattern = optionsSnap.initialSettlementPattern;

    const localSeed = generateSeed();
    (Math as Record<"random", () => number>).random = Alea(localSeed);

    const settlementPattern = applyInitialSettlementPattern(
      cells,
      optionsSnap.initialSettlementPattern,
      optionsSnap.initialPopulationSaturation / 100,
      Math.random,
      { temperature: worldContext.grid.cells.temp, precipitation: worldContext.grid.cells.prec },
      optionsSnap.statesNumber,
      optionsSnap.oikoumeneLandShare
    );
    if (settlementPattern.plan) pack.settlementFoundation = settlementPattern.plan;
    else delete pack.settlementFoundation;

    // Burgs/states/provinces are all rebuilt from scratch below, so any note
    // attached to one of them is about to point at an id that no longer exists.
    worldContext.notes = worldContext.notes.filter(
      (note: WorldNote) =>
        !note.id.startsWith("burg") && !note.id.startsWith("state") && !note.id.startsWith("province")
    );

    GenerationPipeline.Burgs.generate(worldContext, viewContext, appServices, state);
    GenerationPipeline.Routes.generate(worldContext, viewContext, appServices, state);
    GenerationPipeline.States.generate(worldContext, viewContext, appServices, state);
    GenerationPipeline.Burgs.shift();
    GenerationPipeline.Routes.generate(worldContext, viewContext, appServices, state);
    GenerationPipeline.Religions.generate(worldContext, viewContext, appServices, state);
    GenerationPipeline.Burgs.specify(worldContext, viewContext, appServices, state);
    GenerationPipeline.States.collectStatistics(state);
    GenerationPipeline.States.defineStateForms(state);
    assignWildLandTags(cells);
    GenerationPipeline.Provinces.generate(worldContext, viewContext, appServices, state);
    GenerationPipeline.Provinces.getPoles(state);
    GenerationPipeline.Rivers.specify(worldContext, viewContext, appServices, state);
    GenerationPipeline.Lakes.defineNames(state);
    GenerationPipeline.Military.generate(worldContext, viewContext, appServices, state);

    return {
      result: true,
      topics: ["map.politics", "map.settlements", "map.networks", "simulation.states", "simulation.burgs"]
    };
  });
  if (!commit) return;

  EditorBus.unfog("");

  getElementsBySelector<HTMLElement>("[id^=burgCOA]").forEach(el => {
    el.remove();
  });
  getElementsBySelector<HTMLElement>("[id^=stateCOA]").forEach(el => {
    el.remove();
  });
  getElementsBySelector<HTMLElement>("[id^=provinceCOA]").forEach(el => {
    el.remove();
  });
  view.emblems.selectAll("use").remove();

  if (layerIsOn("togglePopulation")) PopulationRenderer.render(worldContext, viewContext, appServices);
  layerIsOn("toggleStates") ? StatesRenderer.render(worldContext, viewContext, appServices) : toggleStates();
  layerIsOn("toggleBorders") ? BordersRenderer.render(worldContext, viewContext, appServices) : toggleBorders();
  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleRoutes")) RoutesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleReligions")) ReligionsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleEmblems")) EmblemsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBurgIcons")) BurgIconsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleLabels")) BurgLabelsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleMilitary")) MilitaryRenderer.render(worldContext, viewContext, appServices);
  drawStateLabels(worldContext, viewContext, appServices);

  closeDialog("burgEditor");
  closeDialog("regimentEditor");
  closeDialog("battleScreen");

  const openDialogs = dialogStore.getState().openDialogs;
  if (openDialogs.has("burgsOverview")) useBurgsOverviewState.getState().refresh();
  if (openDialogs.has("militaryOverview")) useMilitaryOverviewState.getState().refresh();
  refreshAllEditors();
  document.dispatchEvent(new CustomEvent("fmg:refresh-editors"));
}

function regenerateProvinces(): void {
  EditorBus.unfog("");
  const state = getWorldState();
  legacyMutation(() => {
    GenerationPipeline.Provinces.generate(worldContext, viewContext, appServices, state, true, true);
    GenerationPipeline.Provinces.getPoles(state);
    return { result: undefined, topics: ["map.politics", "map.settlements"] };
  });

  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
  layerIsOn("toggleProvinces") ? ProvincesRenderer.render(worldContext, viewContext, appServices) : toggleProvinces();

  getElementsBySelector<HTMLElement>("[id^=provinceCOA]").forEach(el => {
    el.remove();
  });
  view.emblems.selectAll("use").remove();
  if (layerIsOn("toggleEmblems")) EmblemsRenderer.render(worldContext, viewContext, appServices);
  refreshAllEditors();
}

async function regenerateBurgs(): Promise<void> {
  legacyMutation(() => {
    const pack = worldContext.pack;
    const { cells, burgs: packBurgs, states, provinces } = pack;

    rankCells();

    worldContext.notes = worldContext.notes.filter((note: WorldNote) => {
      if (note.id.startsWith("burg")) {
        const burgId = +note.id.slice(4);
        return packBurgs[burgId]?.lock;
      }
      return true;
    });

    const newBurgs: Burg[] = [0 as unknown as Burg];
    const burgsTree = quadtree<[number, number]>()
      .x(d => d[0])
      .y(d => d[1]);

    cells.burg = new Uint16Array(cells.i.length);
    states
      .filter((s: State) => s.i)
      .forEach((s: State) => {
        s.capital = 0;
      });
    provinces
      .filter((p: Province) => p.i)
      .forEach((p: Province) => {
        p.burg = 0;
      });

    const lockedburgs = packBurgs.filter((burg: Burg) => burg.i && !burg.removed && burg.lock);
    for (let j = 0; j < lockedburgs.length; j++) {
      const lockedBurg = lockedburgs[j];
      const newId = newBurgs.length;

      const noteIndex = worldContext.notes.findIndex((note: WorldNote) => note.id === `burg${lockedBurg.i}`);
      if (noteIndex !== -1) worldContext.notes[noteIndex].id = `burg${newId}`;

      lockedBurg.i = newId;
      newBurgs.push(lockedBurg);
      burgsTree.add([lockedBurg.x, lockedBurg.y]);
      cells.burg[lockedBurg.cell] = newId;

      if (lockedBurg.capital) {
        const stateId = lockedBurg.state!;
        states[stateId].capital = newId;
        states[stateId].center = lockedBurg.cell;
      }
    }

    const score = new Int16Array(cells.s.map((s: number) => s * Math.random()));
    const sorted = cells.i
      .filter((i: number) => score[i] > 0 && cells.culture[i])
      .sort((a: number, b: number) => score[b] - score[a]);
    const existingStatesCount = states.filter((s: State) => s.i && !s.removed).length;
    const manorsInputEl = getElementById("manorsInput") as HTMLInputElement;
    const burgsCount =
      (manorsInputEl.value === "1000"
        ? rn(sorted.length / 5 / (worldContext.grid.points.length / 10000) ** 0.8)
        : +manorsInputEl.value) + existingStatesCount;
    const burgSpacing = (worldContext.graphWidth + worldContext.graphHeight) / 150 / (burgsCount ** 0.7 / 66);

    for (let i = 0; i < sorted.length && newBurgs.length < burgsCount; i++) {
      const id = newBurgs.length;
      const cell = sorted[i];
      const [x, y] = cells.p[cell] as [number, number];

      const s = burgSpacing * gauss(1, 0.3, 0.2, 2, 2);
      if (burgsTree.find(x, y, s) !== undefined) continue;

      const stateId = cells.state[cell];
      const isCapital = stateId && !states[stateId].capital;
      if (isCapital) {
        states[stateId].capital = id;
        states[stateId].center = cell;
      }

      const culture = cells.culture[cell];
      const name = GenerationPipeline.Names.getCulture(culture);
      newBurgs.push({
        cell,
        x,
        y,
        state: stateId,
        i: id,
        culture,
        name,
        capital: isCapital ? 1 : 0,
        feature: cells.f[cell]
      });
      burgsTree.add([x, y]);
      cells.burg[cell] = id;
    }

    pack.burgs = newBurgs;
    GenerationPipeline.Burgs.shift();

    states
      .filter((s: State) => s.i && !s.removed && !s.capital)
      .forEach((s: State) => {
        const [x, y] = cells.p[s.center!] as [number, number];
        const { burgId } = GenerationPipeline.Burgs.add([x, y]);
        s.capital = burgId;
        s.center = worldContext.pack.burgs[burgId].cell;
        const burg = worldContext.pack.burgs[burgId];
        burg.state = s.i;
        burg.capital = 1;
        GenerationPipeline.Burgs.changeGroup(burg);
      });

    GenerationPipeline.Burgs.specify(worldContext, viewContext, appServices, getWorldState());
    return {
      result: undefined,
      topics: ["map.politics", "map.settlements", "map.networks", "simulation.states", "simulation.burgs"]
    };
  });
  regenerateRoutes();
  BurgIconsRenderer.render(worldContext, viewContext, appServices);
  BurgLabelsRenderer.render(worldContext, viewContext, appServices);

  getElementsBySelector<HTMLElement>("[id^=burgCOA]").forEach(el => {
    el.remove();
  });
  view.emblems.selectAll("use").remove();
  if (layerIsOn("toggleEmblems")) EmblemsRenderer.render(worldContext, viewContext, appServices);

  regenerateMilitary();
  closeDialog("burgEditor");

  const openDialogs = dialogStore.getState().openDialogs;
  if (openDialogs.has("burgsOverview")) useBurgsOverviewState.getState().refresh();
  document.dispatchEvent(new CustomEvent("fmg:refresh-editors"));
}

export function regenerateEmblems(): void {
  getElementsBySelector<HTMLElement>("[id^=stateCOA]").forEach(el => {
    el.remove();
  });
  getElementsBySelector<HTMLElement>("[id^=provinceCOA]").forEach(el => {
    el.remove();
  });
  getElementsBySelector<HTMLElement>("[id^=burgCOA]").forEach(el => {
    el.remove();
  });
  view.emblems.selectAll("use").remove();

  legacyMutation(() => {
    worldContext.pack.states.forEach((state: State) => {
      if (!state.i || state.removed) return;
      const cultureType = worldContext.pack.cultures[state.culture!].type;
      state.coa = GenerationPipeline.COA.generate(null, 0, null, cultureType ?? "Generic");
      state.coa.shield = GenerationPipeline.COA.getShield(state.culture!);
    });

    worldContext.pack.burgs.forEach((burg: Burg) => {
      if (!burg.i || burg.removed) return;
      const state = worldContext.pack.states[burg.state!];
      let kinship = state ? 0.25 : 0;
      if (burg.capital) kinship += 0.1;
      else if (burg.port) kinship -= 0.1;
      if (state && burg.culture !== state.culture) kinship -= 0.25;
      burg.coa = GenerationPipeline.COA.generate(state ? state.coa : null, kinship, null, burg.type);
      burg.coa.shield = GenerationPipeline.COA.getShield(burg.culture!, state ? burg.state! : 0);
    });

    worldContext.pack.provinces.forEach((province: Province) => {
      if (!province.i || province.removed) return;
      const parent = province.burg ? worldContext.pack.burgs[province.burg] : worldContext.pack.states[province.state!];
      let dominion = false;

      if (!province.burg) {
        dominion = P(0.2);
        if (province.formName === "Colony") dominion = P(0.95);
        else if (province.formName === "Island") dominion = P(0.6);
        else if (province.formName === "Islands") dominion = P(0.5);
        else if (province.formName === "Territory") dominion = P(0.4);
        else if (province.formName === "Land") dominion = P(0.3);
      }

      const nameByBurg = province.burg && province.name.slice(0, 3) === (parent as Burg | State).name?.slice(0, 3);
      const kinship = dominion ? 0 : nameByBurg ? 0.8 : 0.4;
      const culture = worldContext.pack.cells.culture[province.center!];
      const type = GenerationPipeline.Burgs.getType(province.center!, (parent as Burg).port);
      province.coa = GenerationPipeline.COA.generate((parent as State).coa, kinship, dominion ? 1 : 0, type);
      province.coa.shield = GenerationPipeline.COA.getShield(culture, province.state!);
    });

    return { result: undefined, topics: ["map.politics", "map.settlements"] };
  });

  layerIsOn("toggleEmblems") ? EmblemsRenderer.render(worldContext, viewContext, appServices) : toggleEmblems();
}

function regenerateReligions(): void {
  legacyMutation(() => {
    GenerationPipeline.Religions.generate(worldContext, viewContext, appServices, getWorldState());
    return { result: undefined, topics: ["map.politics"] };
  });
  layerIsOn("toggleReligions") ? ReligionsRenderer.render(worldContext, viewContext, appServices) : toggleReligions();
  refreshAllEditors();
}

function regenerateCultures(): void {
  const state = getWorldState();
  legacyMutation(() => {
    const pack = worldContext.pack;
    GenerationPipeline.Cultures.generate(worldContext, viewContext, appServices, state);
    GenerationPipeline.Cultures.expand(state);

    pack.states = pack.states.map((st: State) => {
      if (!st.i || st.removed) return st;
      return { ...st, culture: pack.cells.culture[st.center!] };
    });

    pack.burgs = pack.burgs.map((burg: Burg) => {
      if (!burg.i || burg.removed) return burg;
      return { ...burg, culture: pack.cells.culture[burg.cell] };
    });

    pack.religions = pack.religions.map((religion: Religion) => {
      if (!religion.i || religion.removed) return religion;
      return { ...religion, culture: pack.cells.culture[religion.center!] };
    });

    return { result: undefined, topics: ["map.politics", "map.settlements"] };
  });

  layerIsOn("toggleCultures") ? CulturesRenderer.render(worldContext, viewContext, appServices) : toggleCultures();
  regenerateEmblems();
  refreshAllEditors();
}

function regenerateMilitary(): void {
  legacyMutation(() => {
    GenerationPipeline.Military.generate(worldContext, viewContext, appServices, getWorldState());
    return { result: undefined, topics: ["map.politics", "simulation.states", "simulation.burgs"] };
  });
  if (layerIsOn("toggleMilitary")) MilitaryRenderer.render(worldContext, viewContext, appServices);
  else toggleMilitary();

  closeDialog("regimentEditor");
  closeDialog("battleScreen");

  if (dialogStore.getState().openDialogs.has("militaryOverview")) useMilitaryOverviewState.getState().refresh();
}

function regenerateIce(): void {
  if (!layerIsOn("toggleIce")) toggleIce();
  legacyMutation(() => {
    GenerationPipeline.Ice.generate(worldContext, viewContext, appServices, getWorldState());
    return { result: undefined, topics: ["map.physical"] };
  });
  IceRenderer.render(worldContext, viewContext, appServices);
}

export function regenerateMarkers(): void {
  legacyMutation(() => {
    GenerationPipeline.Markers.regenerate();
    return { result: undefined, topics: ["map.annotations"] };
  });
  turnButtonOn("toggleMarkers");
  MarkersRenderer.render(worldContext, viewContext, appServices);
  if (dialogStore.getState().openDialogs.has("markersOverview")) useMarkersOverviewState.getState().refresh();
}

function regenerateZones(event: MouseEvent | null): void {
  if (event && isCtrlClick(event)) {
    openPrompt({
      message: "Please provide zones number multiplier",
      default: 1,
      step: 0.01,
      min: 0,
      max: 100,
      onConfirm: v => addNumberOfZones(+v)
    });
  } else {
    addNumberOfZones(gauss(1, 0.5, 0.6, 5, 2));
  }

  function addNumberOfZones(number: number) {
    legacyMutation(() => {
      GenerationPipeline.Zones.generate(worldContext, viewContext, appServices, getWorldState(), number);
      return { result: undefined, topics: ["map.annotations"] };
    });
    document.dispatchEvent(new CustomEvent("fmg:refresh-editors"));
    if (layerIsOn("toggleZones")) ZonesRenderer.render(worldContext, viewContext, appServices);
  }
}

// ─── Add/toggle feature tools ─────────────────────────────────────────────────

function unpressClickToAddButton(): void {
  document
    .getElementById("addFeature")!
    .querySelectorAll<HTMLButtonElement>("button.pressed")
    .forEach(b => {
      b.classList.remove("pressed");
    });
  EditorBus.restoreDefaultEvents();
  clearMainTip();
}

export function toggleAddLabel(): void {
  const addLabelBtn = getElementById("addLabel")!;
  if (addLabelBtn.classList.contains("pressed")) {
    unpressClickToAddButton();
    return;
  }

  document
    .getElementById("addFeature")!
    .querySelectorAll<HTMLButtonElement>("button.pressed")
    .forEach(b => {
      b.classList.remove("pressed");
    });
  addLabelBtn.classList.add("pressed");
  closeDialogs(".stable");
  view.viewbox.style("cursor", "crosshair");
  interactionManager.setClickHandler(addLabelOnClick);
  tip("Click on map to place label. Hold Shift to add multiple", true);
  if (!layerIsOn("toggleLabels")) toggleLabels();
}

function addLabelOnClick(event: MouseEvent): void {
  const point = pointer(event, view.viewbox.node()!);

  const cell = findCell(point[0], point[1]);
  const culture = worldContext.pack.cells.culture[cell];
  const name = GenerationPipeline.Names.getCulture(culture);
  const id = getNextId("label");

  const lastSelected = (getElementById("labelGroupSelect") as HTMLSelectElement).value;
  const groupId = ["", "states", "burgLabels"].includes(lastSelected) ? "#addedLabels" : `#${lastSelected}`;

  let group = view.labels.select<SVGGElement>(groupId);
  if (!group.size()) {
    group = view.labels
      .append("g")
      .attr("id", "addedLabels")
      .attr("fill", "#3e3e4b")
      .attr("opacity", 1)
      .attr("stroke", "#3a3a3a")
      .attr("stroke-width", 0)
      .attr("font-family", "Almendra SC")
      .attr("font-size", 18)
      .attr("data-size", 18)
      .attr("filter", null);
  }

  const example = group.append("text").attr("x", 0).attr("y", 0).text(name);
  const width = (example.node() as SVGTextElement).getBBox().width;
  example.remove();

  group.classed("hidden", false);
  group
    .append("text")
    .attr("text-rendering", "optimizeSpeed")
    .attr("id", id)
    .append("textPath")
    .attr("text-rendering", "optimizeSpeed")
    .attr("xlink:href", `#textPath_${id}`)
    .attr("startOffset", "50%")
    .attr("font-size", "100%")
    .append("tspan")
    .attr("x", 0)
    .text(name);

  view.defs
    .select("#textPaths")
    .append("path")
    .attr("id", `textPath_${id}`)
    .attr("d", `M${point[0] - width},${point[1]} h${width * 2}`);

  if (!event.shiftKey) unpressClickToAddButton();
}

export function toggleAddBurg(): void {
  unpressClickToAddButton();
  getElementById("addBurgTool")!.classList.add("pressed");
  overviewBurgs();
  useBurgsOverviewState.getState().setAddMode(true);
}

export function toggleAddRiver(): void {
  const addRiverBtn = getElementById("addRiver")!;
  // addNewRiver is a secondary button in the rivers overview dialog; may not exist
  const addNewRiverEl = getElementById("addNewRiver");

  if (addRiverBtn.classList.contains("pressed")) {
    unpressClickToAddButton();
    addNewRiverEl?.classList.remove("pressed");
    return;
  }

  document
    .getElementById("addFeature")!
    .querySelectorAll<HTMLButtonElement>("button.pressed")
    .forEach(b => {
      b.classList.remove("pressed");
    });
  addRiverBtn.classList.add("pressed");
  addNewRiverEl?.classList.add("pressed");
  closeDialogs(".stable");
  view.viewbox.style("cursor", "crosshair");
  interactionManager.setClickHandler(addRiverOnClick);
  tip("Click on map to place new river or extend an existing one. Hold Shift to place multiple rivers", true, "warn");
  if (!layerIsOn("toggleRivers")) toggleRivers();
}

function addRiverOnClick(event: MouseEvent): void {
  const { cells, rivers: packRivers } = worldContext.pack;
  const point = pointer(event, view.viewbox.node()!);
  let i = findCell(point[0], point[1]);

  if (cells.r[i]) {
    tip("There is already a river here", false, "error");
    return;
  }
  if (cells.h[i] < 20) {
    tip("Cannot create river in water cell", false, "error");
    return;
  }
  if (cells.b[i]) return;

  const riverCells: number[] = [];
  let riverId = GenerationPipeline.Rivers.getNextId(packRivers);
  let parent = riverId;

  const initialFlux = worldContext.grid.cells.prec[cells.g[i]];
  cells.fl[i] = initialFlux;

  const h = GenerationPipeline.Rivers.alterHeights();
  GenerationPipeline.Rivers.resolveDepressions(h);

  while (i) {
    cells.r[i] = riverId;
    riverCells.push(i);

    const min = cells.c[i].sort((a: number, b: number) => h[a] - h[b])[0];
    if (h[i] <= h[min]) {
      // Roll back any cells.r assignments made during this aborted attempt
      // so stale river IDs don't interfere with future clicks.
      riverCells.forEach(ci => {
        if (cells.r[ci] === riverId) cells.r[ci] = 0;
      });
      tip(`Cell ${i} is depressed, river cannot flow further`, false, "error");
      return;
    }

    if (h[min] < 20) {
      riverCells.push(min);
      const feature = worldContext.pack.features[cells.f[min]];
      if (feature.type === "lake") {
        if (feature.outlet) parent = feature.outlet;
        if (feature.inlets) {
          feature.inlets.push(riverId);
        } else {
          feature.inlets = [riverId];
        }
      }
      break;
    }

    if (cells.b[min]) {
      cells.fl[min] += cells.fl[i];
      riverCells.push(-1);
      break;
    }

    if (!cells.r[min]) {
      cells.fl[min] += cells.fl[i];
      i = min;
      continue;
    }

    const oldRiverId = cells.r[min];
    const oldRiver = packRivers.find((river: River) => river.i === oldRiverId);
    const oldRiverCells: number[] =
      oldRiver?.cells || Array.from(cells.i.filter((ci: number) => cells.r[ci] === oldRiverId));
    const oldRiverCellsUpper = oldRiverCells.filter((ci: number) => h[ci] > h[min]);

    if (riverCells.length <= oldRiverCellsUpper.length) {
      cells.conf[min] += cells.fl[i];
      riverCells.push(min);
      parent = oldRiverId;
      break;
    }

    getElementById(`river${oldRiverId}`)?.remove();
    riverCells.forEach((ci: number) => {
      cells.r[ci] = oldRiverId;
    });
    oldRiverCells.forEach((cell: number) => {
      if (h[cell] > h[min]) {
        cells.r[cell] = 0;
        cells.fl[cell] = worldContext.grid.cells.prec[cells.g[cell]];
      } else {
        riverCells.push(cell);
        cells.fl[cell] += cells.fl[i];
      }
    });
    riverId = oldRiverId;
    break;
  }

  const river = packRivers.find((r: River) => r.i === riverId);
  const source = riverCells[0];
  const mouth = riverCells[riverCells.length - 2];

  // Degenerate path: not enough cells to form a valid river segment
  if (source === undefined || mouth === undefined) return;

  const defaultWidthFactor = rn(1 / ((cellsDensityMap[useOptionsState.getState().points] ?? 10000) / 10000) ** 0.25, 2);
  const widthFactor =
    river?.widthFactor || (!parent || parent === riverId ? defaultWidthFactor * 1.2 : defaultWidthFactor);
  const sourceWidth = river?.sourceWidth || GenerationPipeline.Rivers.getSourceWidth(cells.fl[source]);
  const meanderedPoints = GenerationPipeline.Rivers.addMeandering(riverCells);

  const discharge = cells.fl[mouth];
  const length = GenerationPipeline.Rivers.getApproximateLength(
    meanderedPoints.map(([x, y]) => [x, y] as [number, number])
  );
  const width = GenerationPipeline.Rivers.getWidth(
    GenerationPipeline.Rivers.getOffset({
      flux: discharge,
      pointIndex: meanderedPoints.length,
      widthFactor,
      startingWidth: sourceWidth
    })
  );

  if (river) {
    river.source = source;
    river.length = length;
    river.discharge = discharge;
    river.width = width;
    river.cells = riverCells;
    refreshRiverHydrology(river, worldContext);
  } else {
    const basin = GenerationPipeline.Rivers.getBasin(parent);
    const name = GenerationPipeline.Rivers.getName(mouth);
    const type = GenerationPipeline.Rivers.getType({ i: riverId, length, parent });
    const createdRiver: River = {
      i: riverId,
      source,
      mouth,
      discharge,
      length,
      width,
      widthFactor,
      sourceWidth,
      parent,
      cells: riverCells,
      basin,
      name,
      type
    };
    refreshRiverHydrology(createdRiver, worldContext);
    packRivers.push(createdRiver);
  }

  const path = GenerationPipeline.Rivers.getRiverPath(meanderedPoints, widthFactor, sourceWidth);
  const id = `river${riverId}`;
  const riversG = view.viewbox.select("#rivers");
  riversG.append("path").attr("id", id).attr("d", path);

  if (!event.shiftKey) {
    GenerationPipeline.Lakes.cleanupLakeData();
    unpressClickToAddButton();
    getElementById("addNewRiver")?.classList.remove("pressed");
    if (dialogStore.getState().openDialogs.has("riversOverview")) useRiversOverviewState.getState().refresh();
  }
}

export function toggleAddMarker(): void {
  const addMarkerBtn = getElementById("addMarker")!;
  if (addMarkerBtn.classList.contains("pressed")) {
    unpressClickToAddButton();
    return;
  }

  document
    .getElementById("addFeature")!
    .querySelectorAll<HTMLButtonElement>("button.pressed")
    .forEach(b => {
      b.classList.remove("pressed");
    });
  addMarkerBtn.classList.add("pressed");
  const markersAddFromOverviewEl = getElementById("markersAddFromOverview");
  if (markersAddFromOverviewEl) markersAddFromOverviewEl.classList.add("pressed");

  view.viewbox.style("cursor", "crosshair");
  interactionManager.setClickHandler(addMarkerOnClick);
  tip("Click on map to add a marker. Hold Shift to add multiple", true);
  if (!layerIsOn("toggleMarkers")) toggleMarkers();
}

function addMarkerOnClick(event: MouseEvent): void {
  const { markers: packMarkers } = worldContext.pack;
  const point = pointer(event, view.viewbox.node()!);
  const x = rn(point[0], 2);
  const y = rn(point[1], 2);
  const cell = findCell(point[0], point[1]);

  const isMarkerSelected = packMarkers.length && elSelected?.node()?.parentElement?.id === "markers";
  const selectedMarker = isMarkerSelected
    ? packMarkers.find((marker: Marker) => marker.i === +elSelected!.attr("id").slice(6))
    : null;

  const selectedType = useMarkersOverviewState.getState().addedMarkerType;
  const selectedConfig = GenerationPipeline.Markers.getConfig().find(({ type }: MarkerConfig) => type === selectedType);
  const baseMarker = selectedMarker || selectedConfig || { icon: "❓" };
  const marker = GenerationPipeline.Markers.add({ ...baseMarker, x, y, cell } as Marker);

  if (selectedConfig?.add) {
    selectedConfig.add(`marker${marker.i}`, cell);
  }

  const markersElement = view.markers.node()!;
  const rescale = +markersElement.getAttribute("rescale")!;
  appendMarkerToLayer(markersElement, worldContext, viewContext, appServices, marker, rescale);

  if (!event.shiftKey) {
    getElementById("markerAdd")?.classList.remove("pressed");
    getElementById("markersAddFromOverview")?.classList.remove("pressed");
    unpressClickToAddButton();
    editMarker(marker.i);
  }
}

// ─── GenerationPipeline.Markers config ───────────────────────────────────────────────────────────

export function configMarkersGeneration(): void {
  openDialog("markerConfig");
}

// ─── Cell details & overview dialogs ─────────────────────────────────────────

export function viewCellDetails(): void {
  openDialog("cellInfo", {
    resizable: false,
    width: "22em",
    title: "Cell Details",
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });
}

export function overviewCharts(): void {
  openChartsOverview();
}

function openMinimap(): void {
  openMinimapDialog();
}

export function initTools(wc: WorldContext, _vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  appServices = as;
}

// CustomEvent Listeners
document.addEventListener("fmg:regenerate-emblems", () => regenerateEmblems());

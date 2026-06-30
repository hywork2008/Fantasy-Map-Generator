import * as d3 from "d3";
import { mean, pointer } from "d3";
import { getWorldState, resetZoom } from "../actions";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { Biomes } from "../generators/biomes";
import { Burgs } from "../generators/burgs-generator";
import { Cultures } from "../generators/cultures-generator";
import { Features } from "../generators/features";
import { Ice } from "../generators/ice";
import { Lakes } from "../generators/lakes";
import { Markers } from "../generators/markers-generator";
import { Military } from "../generators/military-generator";
import { Provinces } from "../generators/provinces-generator";
import { Religions } from "../generators/religions-generator";
import { Rivers } from "../generators/river-generator";
import { Routes } from "../generators/routes-generator";
import { States } from "../generators/states-generator";
import { Zones } from "../generators/zones-generator";
import {
  addLakesInDeepDepressions,
  calculateTemperatures,
  generatePrecipitation,
  openNearSeaLakes,
  rankCells,
  reGraph,
  undraw
} from "../main";
import { FeaturesRenderer, removeBurgCOA } from "../renderers";
import { OceanLayers } from "../renderers/ocean-layers";
import { ThreeDRenderer } from "../renderers/three-d-renderer";
import { viewLayerService as view } from "../services/viewLayerService";
import { modules } from "../store/editorState";
import { heightmapEditModeStore, imageConverterCloseStore } from "../store/heightmapDialogState";
import { setHeightmapEditorState, useHeightmapEditorState } from "../store/heightmapEditorState";
import { useLayerState } from "../store/layerState";
import { useOptionsState } from "../store/optionsState";
import type { Burg, Culture, Province, Zone } from "../types/models";
import { closeDialogs, isDialogOpen, openDialog } from "../ui/dialogs/dialogService";
import { findCell, findGridCell, getGridPolygon, rn, unique } from "../utils";
import { getColorScheme } from "../utils/colorUtils";
import { INFO, TIME } from "../utils/debug";
import { EditorBus } from "../utils/editorBus";
import { getFileName } from "../utils/editorHelpers";
import { getElementById, layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, showMainTip, tip } from "../utils/uiHelpers";
import { HeightmapEditorHistoryClass as HeightmapEditorHistory } from "./HeightmapEditorHistory";
import {
  disruptAllHeights,
  rescale,
  rescaleWithCondition,
  setupBrushes,
  smoothAllHeights,
  startFromScratch,
  toggleBrushMode
} from "./heightmapBrushes";
import {
  applyConversion,
  assignHeight,
  autoAssign,
  cancelConversion,
  restoreImageConverterState,
  selectColor,
  setColorsNumber,
  setOverlayOpacity,
  openImageConverter as startImageConverter,
  uploadImage
} from "./heightmapImage";
import { changeTemplate, downloadTemplate, executeTemplate, uploadTemplate } from "./heightmapTemplate";
import { interactionManager } from "./interactionManager";
import { getCurrentPreset, toggleLayerById, turnButtonOff, turnButtonOn } from "./layers";
import { changeViewMode, enterStandardView } from "./viewMode";

// ─── Module-level state ───────────────────────────────────────────────────────

let editHeightmapLayers: string[] = [];
let heightmapHistory: InstanceType<typeof HeightmapEditorHistory> | undefined;

export const HeightmapEditorActions = {
  toggleBrushMode: (_mode: string) => {},
  undoHistory: () => {},
  redoHistory: () => {},
  rescale: (_v: number) => {},
  rescaleWithCondition: () => {},
  smoothAllHeights: () => {},
  disruptAllHeights: () => {},
  startFromScratch: () => {},
  executeTemplate: () => {},
  downloadTemplate: () => {},
  uploadTemplate: (_input: HTMLInputElement) => {},
  changeTemplate: (_template: string) => {},
  imageConverterAutoAssign: (_type: string) => {},
  imageConverterSetColorsNumber: () => {},
  imageConverterCancel: () => {},
  imageConverterApply: () => {},
  imageConverterSelectColor: (_color: string) => {},
  imageConverterAssignHeight: (_height: number) => {},
  imageConverterSetOverlayOpacity: (_val: number) => {},
  imageConverterUploadImage: (_input: HTMLInputElement) => {},
  openBrushesPanel: () => {},
  openTemplateEditor: () => {},
  openImageConverter: () => {},
  toggleHeightmapPreview: () => {},
  changeViewMode: (_e?: unknown) => {},
  finalizeHeightmap: () => {},
  mockHeightmap: () => {}
};

// ─── Main entry point ─────────────────────────────────────────────────────────

export function editHeightmap(options?: { mode?: string; tool?: string }): void {
  const { mode, tool } = options || {};
  restartHistory();
  view.viewbox.selectAll("#heights").remove();
  view.viewbox.insert("g", "#terrs").attr("id", "heights");

  if (!mode) showModeDialog();
  else enterHeightmapEditMode(mode);

  if (modules.editHeightmap) return;
  modules.editHeightmap = true;

  HeightmapEditorActions.openBrushesPanel = openBrushesPanel;
  HeightmapEditorActions.openTemplateEditor = openTemplateEditor;
  HeightmapEditorActions.openImageConverter = openImageConverter;
  HeightmapEditorActions.toggleHeightmapPreview = toggleHeightmapPreview;
  HeightmapEditorActions.changeViewMode = changeViewMode as unknown as (_e?: unknown) => void;
  HeightmapEditorActions.finalizeHeightmap = finalizeHeightmap;
  HeightmapEditorActions.mockHeightmap = mockHeightmap;
  HeightmapEditorActions.undoHistory = undoHistory;
  HeightmapEditorActions.redoHistory = redoHistory;

  HeightmapEditorActions.executeTemplate = () =>
    executeTemplate({
      restartHistory,
      updateHistory,
      updateStatistics,
      mockHeightmap,
      drawHeightmapPreview: () => {
        if (getElementById("preview")) drawHeightmapPreview();
      },
      redraw3d: () => {
        if (getElementById("canvas3d")) ThreeDRenderer.redraw();
      }
    });
  HeightmapEditorActions.downloadTemplate = downloadTemplate;
  HeightmapEditorActions.uploadTemplate = uploadTemplate;
  HeightmapEditorActions.changeTemplate = changeTemplate;

  HeightmapEditorActions.imageConverterAutoAssign = autoAssign;
  HeightmapEditorActions.imageConverterSetColorsNumber = setColorsNumber;
  HeightmapEditorActions.imageConverterCancel = cancelConversion;
  HeightmapEditorActions.imageConverterApply = applyConversion;
  HeightmapEditorActions.imageConverterSelectColor = selectColor;
  HeightmapEditorActions.imageConverterAssignHeight = assignHeight;
  HeightmapEditorActions.imageConverterSetOverlayOpacity = setOverlayOpacity;
  HeightmapEditorActions.imageConverterUploadImage = uploadImage;

  HeightmapEditorActions.toggleBrushMode = toggleBrushMode;
  HeightmapEditorActions.rescale = rescale;
  HeightmapEditorActions.rescaleWithCondition = rescaleWithCondition;
  HeightmapEditorActions.smoothAllHeights = smoothAllHeights;
  HeightmapEditorActions.disruptAllHeights = disruptAllHeights;
  HeightmapEditorActions.startFromScratch = startFromScratch;

  setupBrushes({
    updateHeightmap,
    mockHeightmapSelection
  });

  function showModeDialog() {
    heightmapEditModeStore.getState().open({
      onErase: () => enterHeightmapEditMode("erase"),
      onKeep: () => enterHeightmapEditMode("keep"),
      onRisk: () => enterHeightmapEditMode("risk"),
      onCancel: () => {
        modules.editHeightmap = false;
      }
    });
  }

  async function enterHeightmapEditMode(mode: string) {
    editHeightmapLayers = Array.from(mapLayers.querySelectorAll("li:not(.buttonoff)")).map(
      node => (node as HTMLElement).id
    );
    editHeightmapLayers.forEach(l => {
      getElementById(l)!.click();
    });

    view.setCustomization(1);
    closeDialogs();
    tip('Heightmap edit mode is active. Click on "Exit Customization" to finalize the heightmap', true);

    // Tell React to switch to customization mode (shows CustomizationMenu, sets toolsTab active)
    document.dispatchEvent(new CustomEvent("react-enter-heightmap-edit"));

    // Set the edit mode label after React has rendered the element
    requestAnimationFrame(() => {
      const editModeEl = getElementById("heightmapEditMode");
      if (editModeEl) editModeEl.textContent = mode;
    });

    if (mode === "erase") {
      undraw();
      setHeightmapEditorState({ cellTypeFilter: "all" });
    } else if (mode === "keep") {
      view.viewbox.selectAll("#landmass, #lakes").style("display", "none");
      setHeightmapEditorState({ cellTypeFilter: "land" });
    } else if (mode === "risk") {
      view.defs.selectAll("#land, #water").selectAll("path").remove();
      view.defs.select("#featurePaths").selectAll("path").remove();
      view.viewbox.selectAll("#coastline use, #lakes path, #oceanLayers path").remove();
      setHeightmapEditorState({ cellTypeFilter: "all" });
    }

    // These elements live inside CustomizationMenu; set their styles after React renders
    requestAnimationFrame(() => {
      const applyTemplateEl = getElementById("applyTemplate");
      const convertImageEl = getElementById("convertImage");
      const allowErosionBoxEl = getElementById("allowErosionBox");
      if (applyTemplateEl) applyTemplateEl.style.display = mode === "erase" ? "inline-block" : "none";
      if (convertImageEl) convertImageEl.style.display = mode === "erase" ? "inline-block" : "none";
      if (allowErosionBoxEl) allowErosionBoxEl.style.display = mode === "keep" ? "none" : "inline-block";
    });

    if (!sessionStorage.getItem("noExitButtonAnimation")) {
      sessionStorage.setItem("noExitButtonAnimation", "true");
      const width = 12 * useOptionsState.getState().uiSize * 11;
      document.dispatchEvent(
        new CustomEvent("react-show-exit-customization", {
          detail: {
            opacity: "0",
            right: `${(view.svgWidth - width) / 2}px`,
            bottom: `${view.svgHeight / 2}px`,
            transform: "scale(2)"
          }
        })
      );
      d3.select("#exitCustomization")
        .transition()
        .duration(1000)
        .style("opacity", 1)
        .transition()
        .duration(2000)
        .ease(d3.easeSinInOut)
        .style("right", "10px")
        .style("bottom", "10px")
        .style("transform", "scale(1)");
    } else {
      document.dispatchEvent(new CustomEvent("react-show-exit-customization", {}));
    }

    turnButtonOn("toggleHeight");
    useLayerState.getState().setActivePreset("heightmap");
    useLayerState.getState().setPresetDisabled(true);
    mockHeightmap();

    interactionManager.setMouseMoveHandler(moveCursor);
    view.svg.on("dblclick.zoom", null);

    if (tool === "templateEditor") openTemplateEditor();
    else if (tool === "imageConverter") openImageConverter();
    else openBrushesPanel();
  }

  function moveCursor(this: SVGElement, event: MouseEvent): void {
    const [x, y] = pointer(event, this);
    const cell = findGridCell(x, y, worldContext.grid);
    heightmapInfoX.textContent = String(rn(x));
    heightmapInfoY.textContent = String(rn(y));
    heightmapInfoCell.textContent = String(cell);
    heightmapInfoHeight.textContent = `${worldContext.grid.cells.h[cell]} (${getHeight(worldContext.grid.cells.h[cell])})`;
    if ((tooltip as HTMLElement).dataset.main) showMainTip();

    const brushMode = useHeightmapEditorState.getState().brushMode;
    if (!brushMode) return;

    if (brushMode === "brushLine") {
      view.debug.select("line").attr("x2", x).attr("y2", y);
      return;
    }
    if (brushMode === "brushFill") {
      EditorBus.removeCircle();
      return;
    }
    EditorBus.moveCircle(x, y, useHeightmapEditorState.getState().brushRadius);
  }

  function getHeight(h: number): string {
    const unit = (heightUnit as HTMLSelectElement).value;
    let unitRatio = 3.281;
    if (unit === "m") unitRatio = 1;
    else if (unit === "f") unitRatio = 0.5468;

    let height = -990;
    if (h >= 20) height = (h - 18) ** +(heightExponentInput as HTMLInputElement).value;
    else if (h < 20 && h > 0) height = ((h - 20) / h) * 50;

    return `${rn(height * unitRatio)} ${unit}`;
  }

  async function finalizeHeightmap(): Promise<void> {
    if (view.viewbox.select("#heights").selectAll("*").size() < 200) {
      tip("Insufficient land area. There should be at least 200 land cells!", false, "error");
      return;
    }
    if (isDialogOpen("imageConverter")) {
      tip("Please exit the Image Conversion mode first", false, "error");
      return;
    }

    heightmapHistory = undefined;
    setHeightmapEditorState({ canUndo: false, canRedo: false });

    view.setCustomization(0);
    modules.editHeightmap = false;
    useLayerState.getState().setPresetDisabled(false);
    // Tell React to exit customization mode (restores normal tabs and hides CustomizationMenu)
    document.dispatchEvent(new CustomEvent("react-exit-heightmap-edit"));
    document.dispatchEvent(new CustomEvent("react-hide-exit-customization"));

    EditorBus.restoreDefaultEvents();
    clearMainTip();
    closeDialogs();
    resetZoom();

    if (getElementById("preview")) getElementById("preview")!.remove();
    if (getElementById("canvas3d")) enterStandardView();

    const mode = heightmapEditMode.textContent;
    if (mode === "erase") await regenerateErasedData();
    else if (mode === "keep") restoreKeptData();
    else if (mode === "risk") await restoreRiskedData();

    FeaturesRenderer.render(worldContext, viewContext, appServices);
    view.viewbox.selectAll("#heights").remove();

    turnButtonOff("toggleHeight");
    useLayerState.getState().layers.forEach(layer => {
      const wasOn = editHeightmapLayers.includes(layer.id);
      if ((wasOn && !layerIsOn(layer.id)) || (!wasOn && layerIsOn(layer.id))) {
        toggleLayerById(layer.id);
      }
    });
    if (!layerIsOn("toggleBorders")) view.borders.selectAll("path").remove();
    if (!layerIsOn("toggleStates")) view.regions.selectAll("path").remove();
    if (!layerIsOn("toggleRivers")) view.rivers.selectAll("*").remove();

    getCurrentPreset();
  }

  async function regenerateErasedData(): Promise<void> {
    INFO && console.group("Edit Heightmap");
    TIME && console.time("regenerateErasedData");
    worldContext.pack.cultures = [];
    worldContext.pack.burgs = [];
    worldContext.pack.states = [];
    worldContext.pack.provinces = [];
    worldContext.pack.religions = [];

    const erosionAllowed = (allowErosion as HTMLInputElement).checked;
    Features.markupGrid();
    if (erosionAllowed) {
      addLakesInDeepDepressions();
      openNearSeaLakes();
    }
    OceanLayers();
    calculateTemperatures();
    generatePrecipitation();
    reGraph();
    Features.markupPack();

    const state = getWorldState();
    Rivers.generate(worldContext, viewContext, appServices, state, erosionAllowed);

    if (!erosionAllowed) {
      for (const i of worldContext.pack.cells.i) {
        const g = worldContext.pack.cells.g[i];
        if (
          worldContext.pack.cells.h[i] !== worldContext.grid.cells.h[g] &&
          worldContext.pack.cells.h[i] >= 20 === worldContext.grid.cells.h[g] >= 20
        )
          worldContext.pack.cells.h[i] = worldContext.grid.cells.h[g];
      }
    }

    Biomes.define(state);
    Features.defineGroups();
    rankCells();
    Cultures.generate(worldContext, viewContext, appServices, state);
    Cultures.expand(state);
    Burgs.generate(worldContext, viewContext, appServices, state);
    States.generate(worldContext, viewContext, appServices, state);
    Routes.generate(worldContext, viewContext, appServices, state);
    Religions.generate(worldContext, viewContext, appServices, state);
    Burgs.specify(worldContext, viewContext, appServices, state);
    States.collectStatistics(state);
    States.defineStateForms(state);
    Provinces.generate(worldContext, viewContext, appServices, state);
    Provinces.getPoles(state);
    Rivers.specify(worldContext, viewContext, appServices, state);
    Lakes.defineNames(state);
    Ice.generate(worldContext, viewContext, appServices, state);
    Military.generate(worldContext, viewContext, appServices, state);
    Markers.generate(worldContext, viewContext, appServices, state);
    Zones.generate(worldContext, viewContext, appServices, state);

    TIME && console.timeEnd("regenerateErasedData");
    INFO && console.groupEnd();
  }

  function restoreKeptData(): void {
    view.viewbox.selectAll("#landmass, #lakes").style("display", null);
    for (const i of worldContext.pack.cells.i) {
      worldContext.pack.cells.h[i] = worldContext.grid.cells.h[worldContext.pack.cells.g[i]];
    }
  }

  async function restoreRiskedData(): Promise<void> {
    INFO && console.group("Edit Heightmap");
    TIME && console.time("restoreRiskedData");
    const erosionAllowed = (allowErosion as HTMLInputElement).checked;

    const l = worldContext.grid.cells.i.length;
    const biome = new Uint8Array(l);
    const pop = new Uint16Array(l);
    const routesMap: Record<number, Record<number, number>> = {};
    const s = new Uint16Array(l);
    const burg = new Uint16Array(l);
    const stateArr = new Uint16Array(l);
    const province = new Uint16Array(l);
    const culture = new Uint16Array(l);
    const religion = new Uint16Array(l);
    const fl = new Uint16Array(l);
    const r = new Uint16Array(l);
    const conf = new Uint8Array(l);

    for (const i of worldContext.pack.cells.i) {
      const g = worldContext.pack.cells.g[i];
      biome[g] = worldContext.pack.cells.biome[i];
      culture[g] = worldContext.pack.cells.culture[i];
      pop[g] = worldContext.pack.cells.pop[i];
      routesMap[g] = worldContext.pack.cells.routes[i];
      s[g] = worldContext.pack.cells.s[i];
      stateArr[g] = worldContext.pack.cells.state[i];
      province[g] = worldContext.pack.cells.province[i];
      burg[g] = worldContext.pack.cells.burg[i];
      religion[g] = worldContext.pack.cells.religion[i];
      if (!erosionAllowed) {
        fl[g] = worldContext.pack.cells.fl[i];
        r[g] = worldContext.pack.cells.r[i];
        conf[g] = worldContext.pack.cells.conf[i];
      }
    }

    for (const i of worldContext.grid.cells.i) {
      if (!burg[i]) continue;
      if (worldContext.grid.cells.h[i] < 20) worldContext.grid.cells.h[i] = 20;
    }

    for (const c of worldContext.pack.cultures as (Culture & { x?: number; y?: number })[]) {
      if (!c.i || c.removed) continue;
      const p = worldContext.pack.cells.p[c.center!] as [number, number];
      c.x = p[0];
      c.y = p[1];
    }

    const zoneGridCellsMap = new Map<number, number[]>();
    for (const zone of worldContext.pack.zones as Zone[]) {
      if (!zone.cells?.length) continue;
      const zoneGridCells = zone.cells.map(i => worldContext.pack.cells.g[i]);
      zoneGridCellsMap.set(zone.i, unique(zoneGridCells));
    }

    Features.markupGrid();
    if (erosionAllowed) addLakesInDeepDepressions();
    OceanLayers();
    calculateTemperatures();
    generatePrecipitation();
    reGraph();
    Features.markupPack();

    if (erosionAllowed) {
      const worldState = getWorldState();
      Rivers.generate(worldContext, viewContext, appServices, worldState, true);
      Features.defineGroups();
    }

    const n = worldContext.pack.cells.i.length;
    worldContext.pack.cells.pop = new Float32Array(n);
    worldContext.pack.cells.routes = {};
    worldContext.pack.cells.s = new Uint16Array(n);
    worldContext.pack.cells.burg = new Uint16Array(n);
    worldContext.pack.cells.state = new Uint16Array(n);
    worldContext.pack.cells.province = new Uint16Array(n);
    worldContext.pack.cells.culture = new Uint16Array(n);
    worldContext.pack.cells.religion = new Uint16Array(n);
    worldContext.pack.cells.biome = new Uint8Array(n);

    if (!erosionAllowed) {
      worldContext.pack.cells.r = new Uint16Array(n);
      worldContext.pack.cells.conf = new Uint8Array(n);
      worldContext.pack.cells.fl = new Uint16Array(n);
    }

    for (const i of worldContext.pack.cells.i) {
      const g = worldContext.pack.cells.g[i];
      const isLand = worldContext.pack.cells.h[i] >= 20;

      if (!erosionAllowed) {
        worldContext.pack.cells.r[i] = r[g];
        worldContext.pack.cells.conf[i] = conf[g];
        worldContext.pack.cells.fl[i] = fl[g];
      }

      worldContext.pack.cells.biome[i] =
        isLand && biome[g]
          ? biome[g]
          : Biomes.getId(
              worldContext.grid.cells.prec[g],
              worldContext.grid.cells.temp[g],
              worldContext.pack.cells.h[i],
              Boolean(worldContext.pack.cells.r[i])
            );

      if (!isLand) continue;
      worldContext.pack.cells.culture[i] = culture[g];
      worldContext.pack.cells.pop[i] = pop[g];
      worldContext.pack.cells.routes[i] = routesMap[g];
      worldContext.pack.cells.s[i] = s[g];
      worldContext.pack.cells.state[i] = stateArr[g];
      worldContext.pack.cells.province[i] = province[g];
      worldContext.pack.cells.religion[i] = religion[g];
    }

    const findBurgCell = (x: number, y: number): number => {
      const i = findCell(x, y);
      if (worldContext.pack.cells.h[i] >= 20) return i;
      const dist = worldContext.pack.cells.c[i].map((c: number) =>
        worldContext.pack.cells.h[c] < 20
          ? Infinity
          : (worldContext.pack.cells.p[c][0] - x) ** 2 + (worldContext.pack.cells.p[c][1] - y) ** 2
      );
      return worldContext.pack.cells.c[i][d3.leastIndex(dist) ?? 0];
    };

    for (const b of worldContext.pack.burgs as Burg[]) {
      if (!b.i || b.removed) continue;
      b.cell = findBurgCell(b.x!, b.y!);
      b.feature = worldContext.pack.cells.f[b.cell];
      worldContext.pack.cells.burg[b.cell] = b.i!;
      if (!b.capital && worldContext.pack.cells.h[b.cell] < 20) {
        const hasCOA = !!b.coa;
        Burgs.remove(b.i);
        if (hasCOA) removeBurgCOA(viewContext, b.i!);
      }
      if (b.capital) worldContext.pack.states[b.state!].center = b.cell;
    }

    for (const p of worldContext.pack.provinces as Province[]) {
      if (!p.i || p.removed) continue;
      const provCells = Array.from(worldContext.pack.cells.i).filter(i => worldContext.pack.cells.province[i] === p.i);
      if (!provCells.length) {
        const st = p.state;
        const stateProvs = worldContext.pack.states[st].provinces as number[];
        if (stateProvs.includes(p.i)) stateProvs.splice(stateProvs.indexOf(p.i), 1);
        p.removed = true;
        continue;
      }
      if (p.burg && !worldContext.pack.burgs[p.burg].removed) p.center = worldContext.pack.burgs[p.burg].cell;
      else {
        p.center = provCells[0];
        p.burg = worldContext.pack.cells.burg[p.center];
      }
    }

    for (const c of worldContext.pack.cultures as (Culture & { x?: number; y?: number })[]) {
      if (!c.i || c.removed) continue;
      c.center = findCell(c.x!, c.y!);
    }

    const worldState = getWorldState();
    if (erosionAllowed) {
      Rivers.specify(worldContext, viewContext, appServices, worldState);
      Lakes.defineNames(worldState);
    }

    const gridToPackMap = new Map<number, number[]>();
    for (const i of worldContext.pack.cells.i) {
      const g = worldContext.pack.cells.g[i];
      if (!gridToPackMap.has(g)) gridToPackMap.set(g, []);
      gridToPackMap.get(g)!.push(i);
    }

    for (const zone of worldContext.pack.zones as Zone[]) {
      const gridCells = zoneGridCellsMap.get(zone.i);
      if (gridCells?.length) {
        const packCells = gridCells.flatMap(g => gridToPackMap.get(g) || []);
        zone.cells = unique(packCells);
      } else {
        zone.cells = [];
      }
    }

    Ice.generate(worldContext, viewContext, appServices, worldState);
    view.ice.selectAll("*").remove();

    TIME && console.timeEnd("restoreRiskedData");
    INFO && console.groupEnd();
  }

  function updateHeightmap(): void {
    const prev = heightmapHistory?.current as Uint8Array | undefined;
    const changed = prev
      ? (worldContext.grid.cells.h as Uint8Array).reduce((s, h, i) => (h !== prev[i] ? s + 1 : s), 0)
      : 0;
    tip(`Cells changed: ${changed}`);
    if (!changed) return;

    const filter = useHeightmapEditorState.getState().cellTypeFilter;

    if (prev && filter === "land") {
      for (const i of worldContext.grid.cells.i) {
        if (prev[i] < 20 || worldContext.grid.cells.h[i] < 20) worldContext.grid.cells.h[i] = prev[i];
      }
    }
    if (prev && filter === "water") {
      for (const i of worldContext.grid.cells.i) {
        if (prev[i] >= 20 || worldContext.grid.cells.h[i] >= 20) worldContext.grid.cells.h[i] = prev[i];
      }
    }

    mockHeightmap();
    updateHistory();
  }

  function getColor(value: number, scheme?: (t: number) => string): string {
    const s = scheme || getColorScheme(null);
    return s(1 - (value < 20 ? value - 5 : value) / 100);
  }

  function mockHeightmap(): void {
    const all = Array.from(worldContext.grid.cells.i) as number[];
    const data = (getElementById("renderOcean") as HTMLInputElement).checked
      ? all
      : all.filter(i => worldContext.grid.cells.h[i] >= 20);
    view.viewbox
      .select<SVGGElement>("#heights")
      .selectAll<SVGPolygonElement, number>("polygon")
      .data(data)
      .join("polygon")
      .attr("points", d => getGridPolygon(d, worldContext.grid).join(" "))
      .attr("id", d => `cell${d}`)
      .attr("fill", d => getColor(worldContext.grid.cells.h[d]));
  }

  function mockHeightmapSelection(selection: number[]): void {
    const ocean = (getElementById("renderOcean") as HTMLInputElement).checked;
    const heights = view.viewbox.select<SVGGElement>("#heights");
    selection.forEach(i => {
      let cell = heights.select<SVGPolygonElement>(`#cell${i}`);
      if (!ocean && worldContext.grid.cells.h[i] < 20) {
        cell.remove();
        return;
      }
      if (!cell.size())
        cell = heights
          .append<SVGPolygonElement>("polygon")
          .attr("points", getGridPolygon(i, worldContext.grid).join(" "))
          .attr("id", `cell${i}`);
      cell.attr("fill", getColor(worldContext.grid.cells.h[i]));
    });
  }

  function updateStatistics(): void {
    const landCells = (worldContext.grid.cells.h as Uint8Array).reduce((s, h) => (h >= 20 ? s + 1 : s), 0);
    getElementById("landmassCounter")!.innerText =
      `${landCells} (${rn((landCells / worldContext.grid.cells.i.length) * 100)}%)`;
    getElementById("landmassAverage")!.innerText = String(rn(mean(Array.from(worldContext.grid.cells.h)) ?? 0));
  }

  function updateHistory(noStat?: string): void {
    heightmapHistory!.push(worldContext.grid.cells.h);
    setHeightmapEditorState({
      canUndo: heightmapHistory!.canUndo,
      canRedo: heightmapHistory!.canRedo
    });
    if (!noStat) {
      updateStatistics();
      if (getElementById("preview")) drawHeightmapPreview();
      if (getElementById("canvas3d")) ThreeDRenderer.redraw();
    }
  }

  function undoHistory(): void {
    if (!heightmapHistory) return;
    const h = heightmapHistory.undo();
    if (!h) return;
    worldContext.grid.cells.h = h;
    setHeightmapEditorState({
      canUndo: heightmapHistory.canUndo,
      canRedo: heightmapHistory.canRedo
    });
    mockHeightmap();
    updateStatistics();
    if (getElementById("preview")) drawHeightmapPreview();
    if (getElementById("canvas3d")) ThreeDRenderer.redraw();
  }

  function redoHistory(): void {
    if (!heightmapHistory) return;
    const h = heightmapHistory.redo();
    if (!h) return;
    worldContext.grid.cells.h = h;
    setHeightmapEditorState({
      canUndo: heightmapHistory.canUndo,
      canRedo: heightmapHistory.canRedo
    });
    mockHeightmap();
    updateStatistics();
    if (getElementById("preview")) drawHeightmapPreview();
    if (getElementById("canvas3d")) ThreeDRenderer.redraw();
  }

  function restartHistory(): void {
    heightmapHistory = new HeightmapEditorHistory();
    setHeightmapEditorState({ canUndo: false, canRedo: false });
    updateHistory(); // push initial snapshot
  }

  // ─── Brushes panel ───────────────────────────────────────────────────────────

  function openBrushesPanel(): void {
    if (isDialogOpen("brushesPanel")) return;
    openDialog("brushesPanel");

    if (modules.openBrushesPanel) return;
    modules.openBrushesPanel = true;
  }

  // ─── Template editor ──────────────────────────────────────────────────────────

  function openTemplateEditor(): void {
    if (isDialogOpen("templateEditor")) return;
    openDialog("templateEditor");

    if (modules.openTemplateEditor) return;
    modules.openTemplateEditor = true;
  }

  // ─── Image converter ──────────────────────────────────────────────────────────

  function openImageConverter(): void {
    if (isDialogOpen("imageConverter")) return;
    (getElementById("imageToLoad") as HTMLInputElement)?.click();
    closeDialogs("#imageConverter");

    openDialog("imageConverter", {
      title: "Image Converter",
      beforeClose: closeImageConverter
    });

    if (modules.openImageConverter) return;
    modules.openImageConverter = true;

    startImageConverter({
      updateHeightmap,
      undoHistory,
      openBrushesPanel
    });

    function closeImageConverter(event: Event): void {
      event.preventDefault();
      event.stopPropagation();
      imageConverterCloseStore.getState().open({
        onComplete: () => applyConversion(),
        onClose: () => {
          restoreImageConverterState();
          view.viewbox.select("#heights").selectAll("polygon").remove();
          undoHistory();
        }
      });
    }
  }

  // ─── Heightmap preview ────────────────────────────────────────────────────────

  function toggleHeightmapPreview(): void {
    const existing = getElementById("preview");
    if (existing) {
      existing.remove();
      return;
    }
    const preview = document.createElement("canvas");
    preview.id = "preview";
    preview.width = worldContext.grid.cellsX;
    preview.height = worldContext.grid.cellsY;
    optionsContainer.parentNode?.insertBefore(preview, optionsContainer);
    preview.addEventListener("mouseover", () => tip("Heightmap preview. Click to download a screen-sized image"));
    preview.addEventListener("click", downloadPreview);
    drawHeightmapPreview();
  }

  function drawHeightmapPreview(): void {
    const canvas = getElementById("preview") as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(worldContext.grid.cellsX, worldContext.grid.cellsY);

    (worldContext.grid.cells.h as Uint8Array).forEach((height, i) => {
      const h = height < 20 ? Math.max(height / 1.5, 0) : height;
      const v = (h / 100) * 255;
      const n = i * 4;
      imageData.data[n] = v;
      imageData.data[n + 1] = v;
      imageData.data[n + 2] = v;
      imageData.data[n + 3] = 255;
    });
    ctx.putImageData(imageData, 0, 0);
  }

  function downloadPreview(): void {
    const preview = getElementById("preview") as HTMLCanvasElement;
    if (!preview) return;
    const dataURL = preview.toDataURL("image/png");
    const img = new Image();
    img.src = dataURL;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = worldContext.graphWidth;
      canvas.height = worldContext.graphHeight;
      optionsContainer.parentNode?.insertBefore(canvas, optionsContainer);
      ctx.drawImage(img, 0, 0, worldContext.graphWidth, worldContext.graphHeight);
      const imgBig = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `${getFileName("Heightmap")}.png`;
      link.href = imgBig;
      link.click();
      canvas.remove();
    };
  }
}

// ─── Global registration ───────────────────────────────────────────────────────
export function initHeightmapEditor(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}

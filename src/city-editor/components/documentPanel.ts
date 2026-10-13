import { editorOptionText, editorText } from "../../i18n/editorMessages";
import type { PanelEventsContext } from "../controllers/panelEvents";
import { bindPanelEvents } from "../controllers/panelEvents";
import { emptySelection } from "../controllers/tools/toolTypes";
import {
  CITY_SIZE_PRESETS,
  type CitySizePreset,
  createGridDocument,
  DEFAULT_CITY_SIZE,
  DEFAULT_GRID_KIND,
  DEFAULT_MAX_PATCHES,
  MAX_PATCHES_CEILING,
  resolveMaxPatches
} from "../generators/document";
import { finishRiver, smoothFeatureGroups } from "../generators/features";
import { clearGenerationPreviewCache } from "../generators/generation/previews";
import { randomSeed } from "../generators/generation/settings";
import { DEFAULT_HEX_SIZE_METERS, HEX_SIZE_MAX_METERS, HEX_SIZE_MIN_METERS } from "../generators/hexGrid";
import { DocumentHistory } from "../generators/history";
import { scaleDocument } from "../generators/mesh";
import { writeMaxPatchesPreference } from "../services/browserPreferences";
import { exportCityMap, exportCitySvg, exportGenerationDebugSvg } from "../services/io/cityEditorFile";
import type { DisplayState, DocumentsState, GenerationState, InteractionState } from "../state/editorSession";
import type { FixedApproachProvider } from "../types/contracts/fixedApproachAdoption";
import type { CityDocument } from "../types/document";
import { formatDistance } from "../utils/editorUnits";
import { div, text } from "./editorControls";
export interface DocumentPanelContext {
  select: (values: string[], selected: string) => HTMLSelectElement;
  panelEventContext: () => {
    readonly scope: import("../services/editorLifetime").EditorLifetime;
    readonly landmarkSelect: HTMLSelectElement;
    readonly interaction: InteractionState;
    readonly refresh: () => void;
    readonly landmarkAngle: HTMLInputElement;
    readonly updateLandmarkPreview: () => void;
    readonly landmarkFile: HTMLInputElement;
    readonly documents: DocumentsState;
    readonly commit: (next: CityDocument, label?: string) => void;
    readonly showNotice: (value: string, redraw?: boolean) => void;
    readonly shipSelect: HTMLSelectElement;
    readonly shipSizeInput: HTMLInputElement;
    readonly updateShipPreview: () => void;
    readonly shipAngle: HTMLInputElement;
    readonly hexSizeInput: HTMLInputElement;
    readonly hexSizeValue: HTMLSpanElement;
    readonly gridKindSelect: HTMLSelectElement;
    readonly syncGridKindUi: () => void;
    readonly showLabelsInput: HTMLInputElement;
    readonly display: DisplayState;
    readonly redrawMap: () => void;
    readonly brushSizeInput: HTMLInputElement;
    readonly brushSizeValue: HTMLSpanElement;
    readonly brushSizeText: () => string;
    readonly updateWardBrushPreview: (event?: PointerEvent) => void;
    readonly eraseTargetInput: HTMLSelectElement;
    readonly junctionMaxGapInput: HTMLInputElement;
    readonly junctionMaxGapValue: HTMLSpanElement;
    readonly refreshJunctionGapScale: () => void;
    readonly gridEvoSlider: HTMLInputElement;
    readonly generation: GenerationState;
    readonly syncGridEvoUi: () => void;
    readonly currentBuildingPatternSelect: HTMLSelectElement;
    readonly syncGenerateControls: () => void;
    readonly historicalPeriodSelect: HTMLSelectElement;
    readonly layoutSelect: HTMLSelectElement;
    readonly buildingPatternSelect: HTMLSelectElement;
    readonly coastSelect: HTMLSelectElement;
    readonly seaWallSelect: HTMLSelectElement;
    readonly wallMaterialSelect: HTMLSelectElement;
    readonly riversSelect: HTMLSelectElement;
    readonly riverPlacementSelect: HTMLSelectElement;
    readonly stageSlider: HTMLInputElement;
    readonly setStageStep: (step: number) => void;
    readonly urbanNPatchesInput: HTMLInputElement;
    readonly urbanCoreModeSelect: HTMLSelectElement;
    readonly rerunLastStage: () => void;
    readonly walledShareInput: HTMLInputElement;
    readonly townWallBuildOrderSelect: HTMLSelectElement;
    syncStageUi: (step: number) => void;
    readonly townWallRingsSelect: HTMLSelectElement;
    readonly inferredHistoryWalls: () => { townWallRings: "single" | "double"; walledAreaShare: number } | null;
    readonly farNodeSelect: HTMLSelectElement;
    readonly syncBearingsRow: () => void;
    readonly bearingsInput: HTMLInputElement;
    readonly renderQualitySelect: HTMLSelectElement;
    readonly seedInput: HTMLInputElement;
    readonly runCompleteGeneration: () => void;
    readonly map: HTMLDivElement;
    readonly importMapFile: (file: File | undefined) => Promise<void>;
    readonly hideWardBrushPreview: () => void;
    readonly hideCircularWallPreview: () => void;
    readonly finishDrag: (event: PointerEvent) => void;
    readonly scheduleRedraw: () => void;
    readonly updateViewport: (zoomChanged?: boolean) => void;
    readonly updateCircularWallPreview: (event?: PointerEvent) => void;
    readonly refreshScaleBar: () => void;
  };
  rangeInput: (value: string, min: string, max: string, step: string) => HTMLInputElement;
  label: (value: string, control: HTMLElement) => HTMLLabelElement;
  documents: DocumentsState;
  makeIconButton: (icon: string, label: string, onClick: () => void) => HTMLButtonElement;
  generation: GenerationState;
  importedFrame: () => Pick<
    import("../generators/document").CreateGridOptions,
    "extentMeters" | "meshExtentMeters" | "settlementExtentMeters" | "cityRadiusMeters"
  >;
  fixedApproachProvider: FixedApproachProvider;
  generationLog: {
    reset: () => void;
    append: (sample: import("../types/contracts/generationDiagnostics").GenerationSample, seed: string) => void;
  };
  interaction: InteractionState;
  display: DisplayState;
  stepStatus: HTMLOutputElement;
  clearGridEvo: () => void;
  clearMeasurement: () => void;
  rebuildEditorIndexes: () => void;
  refresh: () => void;
  restore: (next: CityDocument | null) => void;
  showNotice: (value: string, redraw?: boolean) => void;
  documentForOutput: (current: CityDocument) => CityDocument;
  importDocument: () => Promise<void>;
  numberInput: (value: string, min: string, step: string) => HTMLInputElement;
  brushSizeText: () => string;
  commit: (next: CityDocument, label?: string) => void;
  toolbar: import("./editorControls").FloatingWindow;
  divider: () => HTMLHRElement;
  paintGrid: HTMLDivElement;
  scope: import("../services/editorLifetime").EditorLifetime;
  runGridEvo: () => void;
  makeButton: (value: string, onClick: () => void) => HTMLButtonElement;
  stepGridEvo: (delta: number) => void;
  checkbox: (checked: boolean, onChange: (checked: boolean) => void) => HTMLInputElement;
  redrawMap: () => void;
  toggleLabel: (caption: string, input: HTMLInputElement) => HTMLLabelElement;
  adoptGridEvo: () => void;
}
export function buildDocumentPanel(ctx: DocumentPanelContext) {
  const events: PanelEventsContext = Object.create(ctx.panelEventContext());
  Object.defineProperties(events, {
    size: { get: () => size },
    gridKindSelect: { get: () => gridKindSelect },
    hexSizeInput: { get: () => hexSizeInput },
    hexSizeValue: { get: () => hexSizeValue },
    hexSizeControl: { get: () => hexSizeControl },
    hexSizeLabel: { get: () => hexSizeLabel },
    gridKindLabel: { get: () => gridKindLabel },
    syncGridKindUi: { get: () => syncGridKindUi },
    newButton: { get: () => newButton },
    sizeLabel: { get: () => sizeLabel },
    undoButton: { get: () => undoButton },
    redoButton: { get: () => redoButton },
    exportButton: { get: () => exportButton },
    exportSvgButton: { get: () => exportSvgButton },
    importButton: { get: () => importButton },
    scaleInput: { get: () => scaleInput },
    showLabelsInput: { get: () => showLabelsInput },
    brushSizeInput: { get: () => brushSizeInput },
    brushSizeValue: { get: () => brushSizeValue },
    brushSizeControl: { get: () => brushSizeControl },
    brushSizeLabel: { get: () => brushSizeLabel },
    eraseTargetInput: { get: () => eraseTargetInput },
    eraseTargetLabel: { get: () => eraseTargetLabel },
    junctionMaxGapInput: { get: () => junctionMaxGapInput },
    junctionMaxGapValue: { get: () => junctionMaxGapValue },
    junctionMaxGapSliderRow: { get: () => junctionMaxGapSliderRow },
    junctionGapScale: { get: () => junctionGapScale },
    junctionGapLine: { get: () => junctionGapLine },
    junctionGapLength: { get: () => junctionGapLength },
    junctionMaxGapControl: { get: () => junctionMaxGapControl },
    junctionMaxGapLabel: { get: () => junctionMaxGapLabel },
    scaleButton: { get: () => scaleButton },
    finishButton: { get: () => finishButton },
    smoothingModeInput: { get: () => smoothingModeInput },
    smoothGroupsButton: { get: () => smoothGroupsButton },
    actions: { get: () => actions },
    documentActions: { get: () => documentActions },
    gridParamLabels: { get: () => gridParamLabels },
    gridParamControls: { get: () => gridParamControls },
    gridParamDefault: { get: () => gridParamDefault },
    syncGridParamControls: { get: () => syncGridParamControls },
    gridEvoBuildButton: { get: () => gridEvoBuildButton },
    gridEvoReseedButton: { get: () => gridEvoReseedButton },
    gridEvoSlider: { get: () => gridEvoSlider },
    gridEvoFirstButton: { get: () => gridEvoFirstButton },
    gridEvoPrevButton: { get: () => gridEvoPrevButton },
    gridEvoNextButton: { get: () => gridEvoNextButton },
    gridEvoLastButton: { get: () => gridEvoLastButton },
    gridEvoLabel: { get: () => gridEvoLabel },
    gridEvoSliderRow: { get: () => gridEvoSliderRow },
    gridLayerInputs: { get: () => gridLayerInputs },
    gridLayerRow: { get: () => gridLayerRow },
    gridEvoAdoptButton: { get: () => gridEvoAdoptButton },
    gridEvoBuildRow: { get: () => gridEvoBuildRow },
    gridEvoControls: { get: () => gridEvoControls }
  });
  const size = ctx.select(Object.keys(CITY_SIZE_PRESETS), DEFAULT_CITY_SIZE);
  size.className = "ce-map-size";
  for (const option of [...size.options]) {
    const preset = CITY_SIZE_PRESETS[option.value as CitySizePreset];
    option.textContent = editorText("cityEditor.messages.mapSizeWithExtent", {
      value0: preset.label,
      value1: preset.extentMeters / 1000
    });
  }
  const gridKindSelect = ctx.select(["hex", "voronoi", "evolution"], DEFAULT_GRID_KIND);
  bindPanelEvents(events, "gridKindSelect:change");
  gridKindSelect.className = "ce-grid-kind";
  for (const option of [...gridKindSelect.options]) {
    option.textContent =
      option.value === "hex"
        ? editorText("cityEditor.messages.hexagonal")
        : option.value === "voronoi"
          ? editorText("cityEditor.messages.voronoi")
          : editorText("cityEditor.messages.gridEvolution");
  }
  const hexSizeInput = ctx.rangeInput(
    String(DEFAULT_HEX_SIZE_METERS),
    String(HEX_SIZE_MIN_METERS),
    String(HEX_SIZE_MAX_METERS),
    "1"
  );
  bindPanelEvents(events, "hexSizeInput:input");
  hexSizeInput.className = "ce-hex-size";
  hexSizeInput.title = editorText("cityEditor.messages.sideLengthOfEachRegularHexagonMetres");
  const hexSizeValue = text(formatDistance(DEFAULT_HEX_SIZE_METERS));
  const hexSizeControl = div("ce-brush-size-control");
  hexSizeControl.append(hexSizeInput, hexSizeValue);
  const hexSizeLabel = ctx.label(editorText("cityEditor.messages.hexSize"), hexSizeControl);
  const gridKindLabel = ctx.label(editorText("cityEditor.messages.grid"), gridKindSelect);
  gridKindLabel.className = "ce-size-choice";
  const syncGridKindUi = (): void => {
    hexSizeLabel.hidden = ctx.documents.gridKind !== "hex";
  };
  syncGridKindUi();
  const newButton = ctx.makeIconButton("🆕", editorText("cityEditor.messages.generateANewGrid"), () => {
    ctx.documents.gridSeed = randomSeed();
    ctx.documents.documentState = createGridDocument({
      size: size.value as CitySizePreset,
      grid: ctx.documents.gridKind,
      seed: ctx.documents.gridSeed,
      hexSizeMeters: ctx.documents.hexSizeMeters,
      patchParams: { ...ctx.generation.gridEvoParams },
      ...ctx.importedFrame(),
      measureBlockSize: ctx.documents.measureTownCells
    });
    ctx.documents.history = new DocumentHistory(
      ctx.documents.documentState,
      editorText("cityEditor.messages.newGrid"),
      undefined,
      ctx.fixedApproachProvider
    );
    ctx.generationLog.reset();
    ctx.documents.referenceImage = null;
    ctx.interaction.selection = emptySelection();
    ctx.interaction.activeGroupId = null;
    ctx.display.halfView = ctx.documents.documentState.frame.extentMeters / 2;
    ctx.display.viewCenter = [0, 0];
    // A fresh mesh may reuse the old town's face ids — drop any stale step state.
    ctx.generation.activeStepStage = null;
    ctx.generation.stepIndex = -1;
    ctx.generation.urbanCoreHighlight = null;
    ctx.generation.stepOverlayPaths = null;
    ctx.stepStatus.textContent = "";
    ctx.generation.lastGeneratedStep = null;
    ctx.generation.completeSource = null;
    ctx.generation.completeResult = null;
    clearGenerationPreviewCache();
    ctx.display.showBlockMesh = false;
    ctx.clearGridEvo();
    ctx.clearMeasurement();
    ctx.rebuildEditorIndexes();
    ctx.refresh();
  });
  const sizeLabel = ctx.label(editorText("cityEditor.messages.mapSize"), size);
  sizeLabel.className = "ce-size-choice";
  const undoButton = ctx.makeIconButton("🔙", editorText("cityEditor.messages.undo"), () =>
    ctx.restore(ctx.documents.history.undo(ctx.documents.documentState))
  );
  const redoButton = ctx.makeIconButton("➜]", editorText("cityEditor.messages.redo"), () =>
    ctx.restore(ctx.documents.history.redo(ctx.documents.documentState))
  );
  const exportButton = ctx.makeIconButton("📥", editorText("cityEditor.messages.exportEditableCityMapJSON"), () => {
    exportCityMap(
      ctx.documents.referenceImage
        ? { ...ctx.documents.documentState, referenceImage: ctx.documents.referenceImage }
        : ctx.documents.documentState
    );
    ctx.showNotice(editorText("cityEditor.messages.mapExported"));
  });
  const exportSvgButton = ctx.makeIconButton("🗺️", editorText("cityEditor.messages.exportCityMapAsSVG"), () => {
    if (ctx.generation.failurePreview) {
      exportGenerationDebugSvg(ctx.generation.failurePreview);
      ctx.showNotice(editorText("cityEditor.messages.exportedSVGFromTheFailedGeneration"));
      return;
    }
    exportCitySvg(
      ctx.documentForOutput(
        ctx.documents.referenceImage
          ? { ...ctx.documents.documentState, referenceImage: ctx.documents.referenceImage }
          : ctx.documents.documentState
      )
    );
    ctx.showNotice(editorText("cityEditor.messages.sVGExported"));
  });
  const importButton = ctx.makeIconButton(
    "📤",
    editorText("cityEditor.messages.importCityMapOrSVGReference"),
    () => void ctx.importDocument()
  );
  const scaleInput = ctx.numberInput("1", "0.1", "0.1");
  const showLabelsInput = document.createElement("input");
  bindPanelEvents(events, "showLabelsInput:change");
  showLabelsInput.type = "checkbox";
  const brushSizeInput = ctx.rangeInput("1", "1", "8", "1");
  bindPanelEvents(events, "brushSizeInput:input");
  const brushSizeValue = text(ctx.brushSizeText());
  const brushSizeControl = div("ce-brush-size-control");
  brushSizeControl.append(brushSizeInput, brushSizeValue);
  const brushSizeLabel = ctx.label(editorText("cityEditor.messages.brushSize"), brushSizeControl);
  const eraseTargetInput = ctx.select(["both", "cells", "edges"], "both");
  bindPanelEvents(events, "eraseTargetInput:change");
  for (const option of [...eraseTargetInput.options]) {
    option.textContent =
      option.value === "both"
        ? editorText("cityEditor.messages.cellsAndEdges")
        : editorText("cityEditor.messages.eraseTargetOnly", { target: editorOptionText(option.value) });
  }
  const eraseTargetLabel = ctx.label(editorText("cityEditor.messages.erase"), eraseTargetInput);
  const junctionMaxGapInput = ctx.rangeInput("8", "1", "50", "1");
  bindPanelEvents(events, "junctionMaxGapInput:input");
  const junctionMaxGapValue = text(formatDistance(ctx.interaction.junctionMaxGapMeters));
  const junctionMaxGapSliderRow = div("ce-brush-size-control");
  junctionMaxGapSliderRow.append(junctionMaxGapInput, junctionMaxGapValue);
  const junctionGapScale = div("ce-junction-gap-scale");
  const junctionGapLine = div("ce-junction-gap-line");
  const junctionGapLength = text("");
  junctionGapScale.append(junctionGapLine, junctionGapLength);
  const junctionMaxGapControl = div("ce-junction-gap-control");
  junctionMaxGapControl.append(junctionMaxGapSliderRow, junctionGapScale);
  const junctionMaxGapLabel = ctx.label(editorText("cityEditor.messages.maxJunctionGap"), junctionMaxGapControl);
  const scaleButton = ctx.makeIconButton("⤢", editorText("cityEditor.messages.scaleAllMapGeometry"), () => {
    const factor = Number(scaleInput.value);
    const next = scaleDocument(ctx.documents.documentState, factor);
    if (next) {
      ctx.display.halfView *= factor;
      ctx.commit(next, editorText("cityEditor.messages.scaleGeometry", { value0: factor }));
    }
  });
  const finishButton = ctx.makeIconButton("✓", editorText("cityEditor.messages.finishActiveRiver"), () => {
    if (!ctx.interaction.activeGroupId) return;
    const next = finishRiver(ctx.documents.documentState, ctx.interaction.activeGroupId);
    if (next) ctx.commit(next, editorText("cityEditor.messages.finishRiver"));
  });
  const smoothingModeInput = ctx.select(["safe", "include loops & shared"], "safe");
  const smoothGroupsButton = ctx.makeIconButton("⌁", editorText("cityEditor.messages.smoothAllRoutes"), () => {
    const mode = smoothingModeInput.value === "include loops & shared" ? "includeSharedAndLoops" : "safe";
    const next = smoothFeatureGroups(ctx.documents.documentState, mode);
    if (next) ctx.commit(next, editorText("cityEditor.messages.smoothAllRoutes"));
    else ctx.showNotice(editorText("cityEditor.messages.noMovableRiverRoadOrWallVerticesToSmooth"));
  });
  const actions = div("ce-icon-row");
  actions.append(undoButton, redoButton, importButton, exportButton, exportSvgButton);
  ctx.toolbar.content.append(
    ctx.divider(),
    actions,
    text(editorText("cityEditor.messages.paintCellsCityEditorPage")),
    ctx.paintGrid,
    brushSizeLabel,
    eraseTargetLabel,
    junctionMaxGapLabel,
    ctx.label(editorText("cityEditor.messages.cellIDs"), showLabelsInput)
  );
  const documentActions = div("ce-icon-row");
  documentActions.append(newButton, scaleButton, finishButton, smoothGroupsButton);
  const gridParamLabels: HTMLLabelElement[] = [];
  const gridParamControls: Partial<
    Record<
      "nPatches" | "relaxCount" | "relaxPasses" | "rimGrowthPercent" | "maxPatches",
      { slider: HTMLInputElement; readout: HTMLSpanElement }
    >
  > = {};
  const gridParamDefault = (key: keyof typeof gridParamControls): number =>
    ctx.generation.gridEvoParams[key] ?? (key === "maxPatches" ? DEFAULT_MAX_PATCHES : 100);
  for (const { key, caption, min, max } of [
    {
      key: "nPatches",
      caption: editorText("cityEditor.messages.patchesNPatches"),
      min: 6,
      max: resolveMaxPatches(ctx.generation.gridEvoParams.maxPatches)
    },
    { key: "relaxCount", caption: editorText("cityEditor.messages.relaxKCentreSites"), min: 0, max: 200 },
    { key: "relaxPasses", caption: editorText("cityEditor.messages.relaxPasses"), min: 0, max: 100 },
    { key: "rimGrowthPercent", caption: editorText("cityEditor.messages.rimCellGrowth"), min: 0, max: 100 },
    {
      key: "maxPatches",
      caption: editorText("cityEditor.messages.nPatchesLimit"),
      min: DEFAULT_MAX_PATCHES,
      max: MAX_PATCHES_CEILING
    }
  ] as const) {
    const slider = ctx.rangeInput(String(gridParamDefault(key)), String(min), String(max), "1");
    const readout = text(String(gridParamDefault(key)));
    const control = div("ce-grid-slider-control");
    control.append(slider, readout);
    ctx.scope.listen(slider, "input", () => {
      ctx.generation.gridEvoParams[key] = Number(slider.value);
      readout.textContent = slider.value;
      if (key === "maxPatches") {
        writeMaxPatchesPreference(ctx.generation.gridEvoParams.maxPatches!);
        ctx.generation.gridEvoParams.nPatches = Math.min(
          ctx.generation.gridEvoParams.nPatches,
          ctx.generation.gridEvoParams.maxPatches!
        );
        syncGridParamControls();
      }
      ctx.runGridEvo(); // live — same output as the Preview button (~25 ms)
    });
    gridParamControls[key] = { slider, readout };
    gridParamLabels.push(ctx.label(caption, control));
  }
  const syncGridParamControls = (): void => {
    const nPatchesSlider = gridParamControls.nPatches?.slider;
    // Widen the range before setting the value; a range input clamps to its max.
    if (nPatchesSlider) nPatchesSlider.max = String(resolveMaxPatches(ctx.generation.gridEvoParams.maxPatches));
    for (const key of ["maxPatches", "nPatches", "relaxCount", "relaxPasses", "rimGrowthPercent"] as const) {
      const control = gridParamControls[key];
      if (!control) continue;
      control.slider.value = String(gridParamDefault(key));
      control.readout.textContent = control.slider.value;
    }
  };
  const gridEvoBuildButton = ctx.makeButton(editorText("cityEditor.messages.previewGridEvolution"), () =>
    ctx.runGridEvo()
  );
  const gridEvoReseedButton = ctx.makeIconButton("🎲", editorText("cityEditor.messages.newScatterSeed"), () => {
    ctx.generation.gridEvoSeed = randomSeed();
    if (ctx.generation.gridEvoStages) ctx.runGridEvo();
  });
  const gridEvoSlider = ctx.rangeInput("0", "0", "0", "1");
  bindPanelEvents(events, "gridEvoSlider:input");
  gridEvoSlider.className = "ce-grid-step";
  const gridEvoFirstButton = ctx.makeIconButton("⏮", editorText("cityEditor.messages.firstStage"), () =>
    ctx.stepGridEvo(-Infinity)
  );
  const gridEvoPrevButton = ctx.makeIconButton("◀", editorText("cityEditor.messages.previousStage"), () =>
    ctx.stepGridEvo(-1)
  );
  const gridEvoNextButton = ctx.makeIconButton("▶", editorText("cityEditor.messages.nextStage"), () =>
    ctx.stepGridEvo(1)
  );
  const gridEvoLastButton = ctx.makeIconButton("⏭", editorText("cityEditor.messages.lastStage"), () =>
    ctx.stepGridEvo(Infinity)
  );
  const gridEvoLabel = document.createElement("output");
  gridEvoLabel.className = "ce-grid-evo-status";
  const gridEvoSliderRow = div("ce-brush-size-control");
  gridEvoSliderRow.append(gridEvoSlider, gridEvoFirstButton, gridEvoPrevButton, gridEvoNextButton, gridEvoLastButton);
  const gridLayerInputs = new Map<keyof typeof ctx.display.gridEvoLayers, HTMLInputElement>();
  const gridLayerRow = div("ce-grid-layers");
  for (const [key, caption] of [
    ["showCells", editorText("cityEditor.messages.voronoi")],
    ["showDelaunay", editorText("cityEditor.messages.delaunay")],
    ["showSites", editorText("cityEditor.messages.sites")]
  ] as const) {
    const input = ctx.checkbox(ctx.display.gridEvoLayers[key], checked => {
      ctx.display.gridEvoLayers[key] = checked;
      ctx.redrawMap();
    });
    gridLayerInputs.set(key, input);
    gridLayerRow.append(ctx.toggleLabel(caption, input));
  }
  const gridEvoAdoptButton = ctx.makeButton(editorText("cityEditor.messages.adoptThisGrid"), () => ctx.adoptGridEvo());
  const gridEvoBuildRow = div("ce-icon-row");
  gridEvoBuildRow.append(gridEvoBuildButton, gridEvoReseedButton);
  const gridEvoControls = div("ce-grid-controls");
  gridEvoControls.append(
    ...gridParamLabels,
    gridEvoBuildRow,
    gridEvoSliderRow,
    gridEvoLabel,
    gridLayerRow,
    gridEvoAdoptButton
  );
  return {
    size,
    gridKindSelect,
    hexSizeInput,
    hexSizeValue,
    hexSizeLabel,
    gridKindLabel,
    syncGridKindUi,
    sizeLabel,
    undoButton,
    redoButton,
    scaleInput,
    showLabelsInput,
    brushSizeInput,
    brushSizeValue,
    brushSizeLabel,
    eraseTargetInput,
    junctionMaxGapInput,
    junctionMaxGapValue,
    junctionGapLine,
    junctionGapLength,
    junctionMaxGapLabel,
    finishButton,
    smoothingModeInput,
    documentActions,
    syncGridParamControls,
    gridEvoSlider,
    gridEvoFirstButton,
    gridEvoPrevButton,
    gridEvoNextButton,
    gridEvoLastButton,
    gridEvoLabel,
    gridEvoAdoptButton,
    gridEvoControls
  };
}

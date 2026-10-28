import { editorOptionText, editorText } from "../../i18n/editorMessages";
import { inferredWallSettings, supportsUrbanMorphology } from "../../utils/urbanMorphology";
import { GENERATION_STAGES, generationStages } from "../controllers/generationStages";
import type { PanelEventsContext } from "../controllers/panelEvents";
import { bindPanelEvents } from "../controllers/panelEvents";
import { removeBastionedTown } from "../generators/bastionedTown/edit";
import { bastionedTownSettingConflicts } from "../generators/bastionedTown/validate";
import { inheritBuildingAppearance } from "../generators/buildingAppearance";
import { withForestSettings } from "../generators/forestLandCover";
import { clearGenerationPreviewCache } from "../generators/generation/previews";
import { bastionEra, skeletonUnsupportedSettings } from "../generators/generation/settings";
import { generationSettingIssues } from "../generators/generationSettingIssues";
import { CITY_LAYOUTS, FEATURE_KEYS, WALL_MATERIAL_CHOICES } from "../generators/site/siteConfig";
import type { DisplayState, DocumentsState, GenerationState, InteractionState } from "../state/editorSession";
import type { CityFeatureSet, WallCoastChoice, WallMaterialChoice } from "../types/contracts/siteConfig";
import type { FarNodeMode } from "../types/contracts/streets";
import type { CityDocument } from "../types/document";
import type { GenerationStage } from "../types/generation";
import { buildBiomeControls } from "./biomeControls";
import { buildBuildingAppearanceControls } from "./buildingAppearanceControls";
import { div, text } from "./editorControls";
import { buildForestControls } from "./forestControls";
import { renderGenerationSettingFeedback } from "./generationSettingFeedback";
import { syncGenerationSections } from "./generationWorkspace";
import { buildPopulationControls } from "./populationControls";
export interface GenerationPanelContext {
  restoringSession?: boolean;
  select: (values: string[], selected: string) => HTMLSelectElement;
  syncCity3d: () => void;
  documents: DocumentsState;
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
  documentPanel: import("./editorControls").FloatingWindow;
  sizeLabel: HTMLLabelElement;
  gridKindLabel: HTMLLabelElement;
  hexSizeLabel: HTMLLabelElement;
  documentActions: HTMLDivElement;
  label: (value: string, control: HTMLElement) => HTMLLabelElement;
  scaleInput: HTMLInputElement;
  smoothingModeInput: HTMLSelectElement;
  divider: () => HTMLHRElement;
  gridEvoControls: HTMLDivElement;
  syncGridEvoUi: () => void;
  generation: GenerationState;
  checkbox: (checked: boolean, onChange: (checked: boolean) => void) => HTMLInputElement;
  toggleLabel: (caption: string, input: HTMLInputElement) => HTMLLabelElement;
  makeIconButton: (icon: string, label: string, onClick: () => void) => HTMLButtonElement;
  syncStageUi: (step: number) => void;
  runGenerationStage: (stage: GenerationStage) => void;
  numberInput: (value: string, min: string, step: string) => HTMLInputElement;
  runStep: (delta: number) => void;
  display: DisplayState;
  interaction: InteractionState;
  refresh: () => void;
  redrawMap: () => void;
  makeButton: (value: string, onClick: () => void) => HTMLButtonElement;
  useStandaloneSite: () => void;
  copyShareLink: (button: HTMLButtonElement) => Promise<void>;
}
export function buildGenerationPanel(ctx: GenerationPanelContext) {
  const events: PanelEventsContext = Object.create(ctx.panelEventContext());
  Object.defineProperties(events, {
    currentBuildingPatternSelect: { get: () => currentBuildingPatternSelect },
    periodOptions: { get: () => periodOptions },
    historicalPeriodSelect: { get: () => historicalPeriodSelect },
    periodOptionLabels: { get: () => periodOptionLabels },
    layoutSelect: { get: () => layoutSelect },
    buildingPatternSelect: { get: () => buildingPatternSelect },
    coastSelect: { get: () => coastSelect },
    SEA_WALL_LABELS: { get: () => SEA_WALL_LABELS },
    seaWallSelect: { get: () => seaWallSelect },
    seaWallOrder: { get: () => seaWallOrder },
    WALL_MATERIAL_LABELS: { get: () => WALL_MATERIAL_LABELS },
    wallMaterialSelect: { get: () => wallMaterialSelect },
    riversSelect: { get: () => riversSelect },
    riverPlacementSelect: { get: () => riverPlacementSelect },
    reliefInput: { get: () => reliefInput },
    featureInputs: { get: () => featureInputs },
    featureGrid: { get: () => featureGrid },
    stageContainer: { get: () => stageContainer },
    stageHeader: { get: () => stageHeader },
    stageBadge: { get: () => stageBadge },
    stageProgress: { get: () => stageProgress },
    stageSlider: { get: () => stageSlider },
    stagePrevBtn: { get: () => stagePrevBtn },
    stageNextBtn: { get: () => stageNextBtn },
    stageSliderRow: { get: () => stageSliderRow },
    changeStageStep: { get: () => changeStageStep },
    setStageStep: { get: () => setStageStep },
    urbanNPatchesInput: { get: () => urbanNPatchesInput },
    urbanCoreModeSelect: { get: () => urbanCoreModeSelect },
    walledShareInput: { get: () => walledShareInput },
    inferredHistoryWalls: { get: () => inferredHistoryWalls },
    townWallRingsValue: { get: () => townWallRingsValue },
    townWallRingsSelect: { get: () => townWallRingsSelect },
    townWallBuildOrderSelect: { get: () => townWallBuildOrderSelect },
    wallFallbackNotice: { get: () => wallFallbackNotice },
    housingSummary: { get: () => housingSummary },
    avoidSeaInput: { get: () => avoidSeaInput },
    FAR_NODE_MODES: { get: () => FAR_NODE_MODES },
    farNodeSelect: { get: () => farNodeSelect },
    bearingsInput: { get: () => bearingsInput },
    bearingsLabel: { get: () => bearingsLabel },
    syncBearingsRow: { get: () => syncBearingsRow },
    stepStatus: { get: () => stepStatus },
    stepPrevButton: { get: () => stepPrevButton },
    stepNextButton: { get: () => stepNextButton },
    stepRow: { get: () => stepRow },
    blockMeshInput: { get: () => blockMeshInput },
    gridLinesInput: { get: () => gridLinesInput },
    coreLayerInput: { get: () => coreLayerInput },
    regionalLayerInput: { get: () => regionalLayerInput },
    renderQualitySelect: { get: () => renderQualitySelect },
    meshToggleRow: { get: () => meshToggleRow },
    importedBox: { get: () => importedBox },
    importedHeading: { get: () => importedHeading },
    importedText: { get: () => importedText },
    standaloneButton: { get: () => standaloneButton },
    seedInput: { get: () => seedInput },
    seedLabel: { get: () => seedLabel },
    copyLinkButton: { get: () => copyLinkButton }
  });
  const currentBuildingPatternSelect = ctx.select(
    ["legacy", "medieval"],
    ctx.documents.documentState.buildingPattern ?? "legacy"
  );
  bindPanelEvents(events, "currentBuildingPatternSelect:change");
  currentBuildingPatternSelect.className = "ce-document-building-pattern";
  currentBuildingPatternSelect.setAttribute("aria-label", editorText("cityEditor.messages.currentBuildingGeneration"));
  currentBuildingPatternSelect.options[0].textContent = editorText("cityEditor.messages.legacyHousing");
  currentBuildingPatternSelect.options[1].textContent = editorText(
    "cityEditor.messages.medievalLotsStoresHousesAndGardens"
  );
  const periodOptions: import("../types/document").HistoricalPeriod[] = [
    "ageOfExploration",
    "lateMedieval",
    "highMedieval",
    "earlyMedieval",
    "lateAntiquity",
    "classicalAntiquity",
    "maritimeEra",
    "preIndustrialEra",
    "steamEra"
  ];
  const historicalPeriodSelect = ctx.select(
    periodOptions,
    ctx.documents.documentState.historicalPeriod ?? "ageOfExploration"
  );
  bindPanelEvents(events, "historicalPeriodSelect:change");
  historicalPeriodSelect.className = "ce-document-historical-period";
  historicalPeriodSelect.setAttribute("aria-label", editorText("cityEditor.messages.historicalPeriod"));
  const periodOptionLabels: Record<string, string> = {
    get ageOfExploration() {
      return editorText("cityEditor.messages.ageOfExplorationC14501600Default");
    },
    get lateMedieval() {
      return editorText("cityEditor.messages.lateMiddleAgesC13001450");
    },
    get highMedieval() {
      return editorText("cityEditor.messages.highMiddleAgesC10001300");
    },
    get earlyMedieval() {
      return editorText("cityEditor.messages.earlyMiddleAgesC5001000");
    },
    get lateAntiquity() {
      return editorText("cityEditor.messages.lateAntiquityC250500");
    },
    get classicalAntiquity() {
      return editorText("cityEditor.messages.classicalAntiquityAndRome");
    },
    get maritimeEra() {
      return editorText("cityEditor.messages.maritimeEraC16001750");
    },
    get preIndustrialEra() {
      return editorText("cityEditor.messages.preIndustrialEraC17501830");
    },
    get steamEra() {
      return editorText("cityEditor.messages.steamEraC18301880");
    }
  };
  for (const option of [...historicalPeriodSelect.options]) {
    if (periodOptionLabels[option.value]) option.textContent = periodOptionLabels[option.value];
  }
  const appearanceControls = buildBuildingAppearanceControls({
    scope: events.scope,
    getDocument: () => ctx.documents.documentState,
    getGenerationHeightPolicy: () => ctx.generation.generateSettings.buildingHeightPolicy,
    select: ctx.select,
    label: ctx.label,
    modelQualityChanged: () => {
      ctx.redrawMap();
      ctx.syncCity3d();
    },
    updateDocument(next, label) {
      if (
        next.buildingHeightPolicy ||
        ctx.documents.documentState.appearance === "town" ||
        label === editorText("cityEditor.messages.changeBuildingHeights")
      )
        ctx.generation.generateSettings.buildingHeightPolicy = next.buildingHeightPolicy;
      ctx.generation.generateSettings.buildingHeightLimit = next.buildingHeightLimit;
      clearGenerationPreviewCache();
      if (ctx.generation.completeSource)
        ctx.generation.completeSource = {
          ...inheritBuildingAppearance(ctx.generation.completeSource, next),
          buildingHeightPolicy: next.buildingHeightPolicy,
          buildingHeightLimit: next.buildingHeightLimit
        };
      events.commit(next, label ?? editorText("cityEditor.messages.changeHousingAppearance"));
      if (next.appearance === "town") ctx.generation.completeResult = next;
      events.syncGenerateControls();
    }
  });
  const forestControls = buildForestControls({
    scope: events.scope,
    getDocument: () => ctx.documents.documentState,
    generation: ctx.generation,
    select: ctx.select,
    label: ctx.label,
    viewChanged: () => {
      ctx.redrawMap();
      ctx.syncCity3d();
    },
    apply(next) {
      clearGenerationPreviewCache();
      if (ctx.generation.completeSource)
        ctx.generation.completeSource = withForestSettings(ctx.generation.completeSource, next.forestSettings);
      if (ctx.generation.completeResult)
        ctx.generation.completeResult = withForestSettings(ctx.generation.completeResult, next.forestSettings);
      ctx.generation.completeResultSettings = JSON.stringify(ctx.generation.generateSettings);
      events.commit(next, editorText("cityEditor.forest.apply"));
    }
  });
  const biomeControls = buildBiomeControls({
    scope: events.scope,
    getDocument: () => ctx.documents.documentState,
    isImported: () => !!ctx.generation.generateSettings.descriptor,
    select: ctx.select,
    label: ctx.label,
    updateDocument(next) {
      clearGenerationPreviewCache();
      events.commit(next, editorText("cityEditor.messages.changeBiome"));
    }
  });
  ctx.documentPanel.content.append(
    ctx.sizeLabel,
    ctx.gridKindLabel,
    ctx.hexSizeLabel,
    ctx.documentActions,
    biomeControls.root,
    ctx.label(editorText("cityEditor.messages.scale"), ctx.scaleInput),
    ctx.label(editorText("cityEditor.messages.smoothing"), ctx.smoothingModeInput),
    ctx.divider(),
    ctx.gridEvoControls
  );
  ctx.syncGridEvoUi();
  const layoutSelect = ctx.select(
    CITY_LAYOUTS,
    ctx.generation.generateSettings.layout ?? ctx.generation.generateSettings.config.layout ?? "auto"
  );
  bindPanelEvents(events, "layoutSelect:change");
  layoutSelect.className = "ce-generate-layout";
  for (const option of [...layoutSelect.options]) {
    option.textContent =
      option.value === "auto"
        ? editorText("cityEditor.messages.auto")
        : option.value === "organic"
          ? editorText("cityEditor.messages.organic")
          : option.value === "circulade"
            ? editorText("cityEditor.messages.circulade")
            : option.value === "bram"
              ? editorText("cityEditor.messages.bram")
              : editorText("cityEditor.messages.classic");
  }
  const buildingPatternSelect = ctx.select(
    ["legacy", "medieval"],
    ctx.generation.generateSettings.buildingPattern ?? "legacy"
  );
  bindPanelEvents(events, "buildingPatternSelect:change");
  buildingPatternSelect.className = "ce-generate-building-pattern";
  buildingPatternSelect.setAttribute("aria-label", editorText("cityEditor.messages.buildingGeneration"));
  buildingPatternSelect.options[0].textContent = editorText("cityEditor.messages.legacyHousing");
  buildingPatternSelect.options[1].textContent = editorText("cityEditor.messages.medievalLotsStoresHousesAndGardens");
  const coastSelect = ctx.select(["none", "straight", "bay", "cape"], ctx.generation.generateSettings.config.coast);
  coastSelect.className = "ce-generate-coast";
  bindPanelEvents(events, "coastSelect:change");
  const SEA_WALL_LABELS: Record<WallCoastChoice, string> = {
    get auto() {
      return editorText("cityEditor.messages.automatic");
    },
    get seaWall() {
      return editorText("cityEditor.messages.fullyWalled");
    },
    get open() {
      return editorText("cityEditor.messages.openCoast");
    },
    get opening() {
      return editorText("cityEditor.messages.oneOpening");
    }
  };
  const seaWallSelect = document.createElement("select");
  bindPanelEvents(events, "seaWallSelect:change");
  seaWallSelect.className = "ce-generate-seawall";
  const seaWallOrder: WallCoastChoice[] = ["auto", "seaWall", "open", "opening"];
  for (const value of seaWallOrder) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = SEA_WALL_LABELS[value];
    seaWallSelect.appendChild(option);
  }
  seaWallSelect.value = ctx.generation.generateSettings.config.wall.coast;
  seaWallSelect.title = editorText("cityEditor.messages.coastalDefencesIndependentOfCapitalOrCitadelStatusUseA");
  const WALL_MATERIAL_LABELS: Record<WallMaterialChoice, string> = {
    get auto() {
      return editorText("cityEditor.messages.automaticLargeCityStoneSmallVillageWood");
    },
    get stone() {
      return editorText("cityEditor.messages.stoneMasonryWalls");
    },
    get wood() {
      return editorText("cityEditor.messages.woodPalisadeAndDefensiveWalls");
    }
  };
  const wallMaterialSelect = document.createElement("select");
  bindPanelEvents(events, "wallMaterialSelect:change");
  wallMaterialSelect.className = "ce-generate-wall-material";
  for (const value of WALL_MATERIAL_CHOICES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = WALL_MATERIAL_LABELS[value];
    wallMaterialSelect.appendChild(option);
  }
  wallMaterialSelect.value = ctx.generation.generateSettings.config.wall.material ?? "auto";
  wallMaterialSelect.title = editorText("cityEditor.messages.wallMaterialAutomaticUsesStoneForLargeCitiesAndWooden");
  const riversSelect = ctx.select(["0", "1", "2"], String(ctx.generation.generateSettings.config.rivers.length));
  riversSelect.className = "ce-generate-river-count";
  bindPanelEvents(events, "riversSelect:change");
  const riverPlacementSelect = ctx.select(
    ["through", "outsideNear", "outside"],
    ctx.generation.generateSettings.riverPlacement ?? "through"
  );
  bindPanelEvents(events, "riverPlacementSelect:change");
  riverPlacementSelect.className = "ce-generate-river-placement";
  riverPlacementSelect.options[0].textContent = editorText("cityEditor.messages.throughTheCityDefault");
  riverPlacementSelect.options[1].textContent = editorText("cityEditor.messages.outsideCityWallsAbout12Cells");
  riverPlacementSelect.options[2].textContent = editorText("cityEditor.messages.outsideCityWallsAbout13Cells");
  riverPlacementSelect.title = editorText("cityEditor.messages.appliesWithOneRiverAndCityWallsEnabled");
  const reliefInput = ctx.checkbox(ctx.generation.generateSettings.config.relief, checked => {
    ctx.generation.generateSettings.config.relief = checked;
  });
  const featureInputs = new Map<keyof CityFeatureSet, HTMLInputElement>();
  const featureGrid = div("ce-generate-features");
  for (const key of FEATURE_KEYS) {
    const input = ctx.checkbox(ctx.generation.generateSettings.config.features[key], checked => {
      ctx.generation.generateSettings.config.features[key] = checked;
    });
    input.dataset.feature = key;
    featureInputs.set(key, input);
    featureGrid.appendChild(ctx.toggleLabel(editorOptionText(key), input));
  }
  const stageContainer = div("ce-generate-stages");
  const stageHeader = div("ce-generate-stage-header");
  const stageBadge = document.createElement("span");
  stageBadge.className = "ce-generate-stage-badge";
  const stageProgress = document.createElement("span");
  stageProgress.className = "ce-generate-stage-num";
  stageHeader.append(stageBadge, stageProgress);
  const stageSlider = document.createElement("input");
  bindPanelEvents(events, "stageSlider:input");
  stageSlider.type = "range";
  stageSlider.className = "ce-generate-stage-slider";
  stageSlider.min = "1";
  stageSlider.max = String(GENERATION_STAGES.length);
  stageSlider.step = "1";
  stageSlider.value = String(ctx.generation.currentStageStep);
  stageSlider.setAttribute("aria-label", editorText("cityEditor.messages.generationStageSlider"));
  const stagePrevBtn = ctx.makeIconButton("◀", editorText("cityEditor.messages.previousGenerationStage"), () =>
    changeStageStep(-1)
  );
  stagePrevBtn.className += " ce-stage-prev";
  const stageNextBtn = ctx.makeIconButton("▶", editorText("cityEditor.messages.nextGenerationStage"), () =>
    changeStageStep(1)
  );
  stageNextBtn.className += " ce-stage-next";
  const stageSliderRow = div("ce-generate-slider-row");
  stageSliderRow.append(stagePrevBtn, stageSlider, stageNextBtn);
  stageContainer.append(stageHeader, stageSliderRow);
  ctx.syncStageUi = (step: number) => {
    ctx.generation.currentStageStep = step;
    const stage = generationStages(ctx.generation.generateSettings).find(s => s.step === step);
    if (!stage) return;
    stageBadge.textContent = stage.label;
    stageBadge.dataset.i18nKey = stage.labelKey;
    const total = generationStages(ctx.generation.generateSettings).length;
    stageSlider.max = String(total);
    stageProgress.textContent = `${step}/${total}`;
    stageSlider.value = String(step);
    stagePrevBtn.disabled = step <= 1;
    stageNextBtn.disabled = step >= total;
    syncStepControls();
  };
  const changeStageStep = (delta: number) => {
    const target = Math.max(
      1,
      Math.min(generationStages(ctx.generation.generateSettings).length, ctx.generation.currentStageStep + delta)
    );
    if (target !== ctx.generation.currentStageStep) {
      setStageStep(target);
    }
  };
  const setStageStep = (step: number) => {
    const stage = generationStages(ctx.generation.generateSettings).find(s => s.step === step);
    if (!stage) return;
    ctx.syncStageUi(step);
    ctx.runGenerationStage(stage);
  };
  const urbanNPatchesInput = ctx.numberInput("", "1", "1");
  bindPanelEvents(events, "urbanNPatchesInput:change");
  urbanNPatchesInput.className = "ce-generate-npatches";
  urbanNPatchesInput.placeholder = editorText("cityEditor.messages.automaticPlaceholder");
  urbanNPatchesInput.title = editorText("cityEditor.messages.cap3SFloodFillToTheFirstNCells");
  const urbanCoreModeSelect = ctx.select(
    ["legacy", "compact"],
    ctx.generation.generateSettings.urbanCoreMode ?? "legacy"
  );
  bindPanelEvents(events, "urbanCoreModeSelect:change");
  urbanCoreModeSelect.options[0].textContent = editorText("cityEditor.messages.legacyIncludesOuterHousingBelt");
  urbanCoreModeSelect.options[1].textContent = editorText("cityEditor.messages.compactUrbanCoreOnly");
  const walledShareInput = ctx.numberInput("", "5", "5");
  bindPanelEvents(events, "walledShareInput:change");
  walledShareInput.max = "100";
  walledShareInput.className = "ce-generate-walled-share";
  walledShareInput.title = editorText("cityEditor.messages.allocateUrbanAreaAsAGuideToHousingCapacityLanes");
  const inferredHistoryWalls = () => {
    const descriptor = ctx.generation.generateSettings.descriptor;
    return descriptor?.urbanMorphology && supportsUrbanMorphology(descriptor.urbanMorphology.period)
      ? inferredWallSettings(descriptor.urbanMorphology, descriptor.burg.dwellings)
      : null;
  };
  const townWallRingsValue = () =>
    (ctx.generation.generateSettings.townWallRings ?? inferredHistoryWalls()?.townWallRings) !== "double"
      ? "single"
      : ctx.generation.generateSettings.innerWallState === "razed"
        ? "razed"
        : "double";
  const townWallRingsSelect = ctx.select(["single", "double", "razed"], townWallRingsValue());
  bindPanelEvents(events, "townWallRingsSelect:change");
  townWallRingsSelect.className = "ce-generate-town-wall-rings";
  townWallRingsSelect.options[0].textContent = editorText("cityEditor.messages.townWallRingsSingle");
  townWallRingsSelect.options[1].textContent = editorText("cityEditor.messages.townWallRingsDouble");
  townWallRingsSelect.options[2].textContent = editorText("cityEditor.messages.townWallRingsRazed");
  const townWallBuildOrderSelect = ctx.select(
    ["outer-first", "inner-first"],
    ctx.generation.generateSettings.townWallBuildOrder ?? "outer-first"
  );
  bindPanelEvents(events, "townWallBuildOrderSelect:change");
  townWallBuildOrderSelect.className = "ce-generate-town-wall-build-order";
  townWallBuildOrderSelect.options[0].textContent = editorText("cityEditor.messages.townWallBuildOrderOuter");
  townWallBuildOrderSelect.options[1].textContent = editorText("cityEditor.messages.townWallBuildOrderInner");
  townWallBuildOrderSelect.disabled = townWallRingsValue() === "single";
  const wallFallbackNotice = (doc: CityDocument, checkpoint = false) => {
    const reason = doc.townWallGeneration?.fallbackReason;
    const detail =
      reason === "open-defense"
        ? editorText("cityEditor.messages.oldTownWallOpenDefense")
        : reason === "gap" || reason === "too-small"
          ? editorText("cityEditor.messages.oldTownWallInsufficientGap")
          : reason === "castle-crowds"
            ? editorText("cityEditor.messages.oldTownWallCastleCrowds")
            : reason === "no-gate"
              ? editorText("cityEditor.messages.oldTownWallNoGate")
              : "";
    return [
      editorText(
        checkpoint ? "cityEditor.messages.oldTownWallStageFailed" : "cityEditor.messages.oldTownWallDidNotFitSingleWall"
      ),
      detail
    ]
      .filter(Boolean)
      .join(" ");
  };
  const housingSummary = document.createElement("output");
  housingSummary.className = "ce-generate-housing-summary";
  housingSummary.title = editorText("cityEditor.messages.buildingCountsByDistrictInTheCoreAndOuterBelt");
  if (!ctx.generation.generateSettings.streets)
    ctx.generation.generateSettings.streets = { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true };
  ctx.generation.streets = ctx.generation.generateSettings.streets;
  const avoidSeaInput = ctx.checkbox(ctx.generation.streets.avoidSea !== false, checked => {
    ctx.generation.streets.avoidSea = checked;
  });
  avoidSeaInput.className = "ce-generate-avoidsea";
  avoidSeaInput.title = editorText("cityEditor.messages.keepRoadsWallsAndBuildingsOffTheWaterTowngenComparison");
  const FAR_NODE_MODES: { value: FarNodeMode; label: string }[] = [
    { value: "descriptorEnd", label: editorText("cityEditor.messages.descriptorEnd") },
    { value: "radial", label: editorText("cityEditor.messages.radial") },
    { value: "manualBearings", label: editorText("cityEditor.messages.manualBearings") }
  ];
  const farNodeSelect = document.createElement("select");
  bindPanelEvents(events, "farNodeSelect:change");
  farNodeSelect.className = "ce-generate-farnode";
  for (const mode of FAR_NODE_MODES) {
    const option = document.createElement("option");
    option.value = mode.value;
    option.textContent = mode.label;
    option.selected = mode.value === (ctx.generation.streets.farNode ?? "descriptorEnd");
    farNodeSelect.appendChild(option);
  }
  const bearingsInput = document.createElement("input");
  bindPanelEvents(events, "bearingsInput:change");
  bearingsInput.type = "text";
  bearingsInput.className = "ce-generate-bearings";
  bearingsInput.placeholder = "90, 180, 270";
  bearingsInput.title = editorText("cityEditor.messages.commaSeparatedCompassBearingsDegreesForEachLandGate");
  const bearingsLabel = ctx.label(editorText("cityEditor.messages.manualBearings"), bearingsInput);
  const syncBearingsRow = (): void => {
    bearingsLabel.style.display = farNodeSelect.value === "manualBearings" ? "" : "none";
  };
  syncBearingsRow();
  const stepStatus = document.createElement("output");
  stepStatus.className = "ce-generate-step-status";
  const stepPrevButton = ctx.makeIconButton("◀", editorText("cityEditor.messages.previousStep"), () => ctx.runStep(-1));
  const stepNextButton = ctx.makeIconButton("▶", editorText("cityEditor.messages.nextStep"), () => ctx.runStep(1));
  const stepRow = div("ce-icon-row ce-generation-step-row");
  stepRow.append(stepPrevButton, stepStatus, stepNextButton);
  function syncStepControls(): void {
    const stage = ctx.generation.activeStepStage;
    const enabled =
      ctx.generation.generateSettings.mode !== "fort" &&
      stage != null &&
      ["coast", "river", "urban", "gates", "streets", "wards"].includes(stage) &&
      generationStages(ctx.generation.generateSettings).find(s => s.step === ctx.generation.currentStageStep)?.id ===
        stage;
    stepPrevButton.disabled = !enabled;
    stepNextButton.disabled = !enabled;
  }
  ctx.syncStageUi(ctx.generation.currentStageStep);
  const blockMeshInput = ctx.checkbox(false, checked => {
    ctx.display.showBlockMesh = checked;
    if (!checked && ctx.interaction.tool !== "select") {
      ctx.interaction.tool = "select";
    }
    ctx.refresh();
  });
  const gridLinesInput = ctx.checkbox(false, checked => {
    ctx.display.showGridLines = checked;
    ctx.redrawMap();
  });
  const coreLayerInput = ctx.checkbox(true, () => ctx.redrawMap());
  const regionalLayerInput = ctx.checkbox(true, () => ctx.redrawMap());
  const renderQualitySelect = ctx.select(["auto", "detailed", "light", "minimal"], "auto");
  bindPanelEvents(events, "renderQualitySelect:change");
  renderQualitySelect.className = "ce-render-quality";
  renderQualitySelect.setAttribute("aria-label", editorText("cityEditor.messages.renderQuality"));
  [
    editorText("cityEditor.messages.automaticLightweightForLarge"),
    editorText("cityEditor.messages.detailed"),
    editorText("cityEditor.messages.lightweightGroupBuildings"),
    editorText("cityEditor.messages.minimalReduceBuildingsAndTrees")
  ].forEach((text, i) => {
    renderQualitySelect.options[i].textContent = text;
  });
  const meshToggleRow = div("ce-icon-row");
  meshToggleRow.append(
    ctx.toggleLabel(editorText("cityEditor.messages.blockEditingView"), blockMeshInput),
    ctx.toggleLabel(editorText("cityEditor.messages.showGridLines"), gridLinesInput)
  );
  const importedBox = div("ce-imported");
  const importedHeading = text(editorText("cityEditor.fmgParameters.title"));
  importedHeading.dataset.i18nKey = "cityEditor.fmgParameters.title";
  const importedText = div("ce-imported-body");
  const standaloneButton = ctx.makeButton(editorText("cityEditor.messages.useStandaloneSite"), () =>
    ctx.useStandaloneSite()
  );
  importedBox.append(importedHeading, importedText, standaloneButton);
  importedBox.hidden = true;
  const seedInput = document.createElement("input");
  bindPanelEvents(events, "seedInput:keydown");
  bindPanelEvents(events, "seedInput:input");
  seedInput.type = "text";
  seedInput.className = "ce-generate-seed";
  seedInput.spellcheck = false;
  seedInput.value = ctx.generation.generateSeed;
  const seedLabel = ctx.label(editorText("cityEditor.messages.seed"), seedInput);
  const copyLinkButton = ctx.makeButton(
    editorText("cityEditor.messages.copyShareableLink"),
    () => void ctx.copyShareLink(copyLinkButton)
  );
  const skeletonControls = div("ce-skeleton-controls");
  const methodSelect = ctx.select(
    ["mesh-first", "skeleton-first"],
    ctx.generation.generateSettings.generationMethod ?? "mesh-first"
  );
  methodSelect.className = "ce-generation-method";
  methodSelect.options[0].textContent = editorText("cityEditor.messages.meshFirst");
  methodSelect.options[1].textContent = editorText("cityEditor.messages.skeletonFirst");
  const shapeSelect = ctx.select(
    ["auto", "organic", "round", "oval", "square", "polygon", "bastioned"],
    ctx.generation.generateSettings.wallShape ?? "auto"
  );
  shapeSelect.className = "ce-wall-shape";
  for (const option of shapeSelect.options) {
    option.textContent = editorOptionText(option.value);
  }
  const sidesInput = ctx.numberInput(String(ctx.generation.generateSettings.wallSides ?? ""), "3", "1");
  sidesInput.max = "12";
  sidesInput.className = "ce-wall-sides";
  const shapeLabel = ctx.label(editorText("cityEditor.messages.skeletonWallShape"), shapeSelect);
  const sidesLabel = ctx.label(editorText("cityEditor.messages.skeletonWallSides"), sidesInput);
  const fortSelect = ctx.select(
    ["ordinary", "bastioned"],
    ctx.generation.generateSettings.townFortification ? "bastioned" : "ordinary"
  );
  fortSelect.className = "ce-town-fortification";
  fortSelect.options[0].textContent = editorText("cityEditor.messages.townFortificationOrdinary");
  fortSelect.options[1].textContent = editorText("cityEditor.messages.townFortificationBastioned");
  const outworksSelect = ctx.select(
    ["none", "ravelins"],
    ctx.generation.generateSettings.townFortification?.outworks ?? "ravelins"
  );
  outworksSelect.className = "ce-fortress-outworks";
  outworksSelect.options[0].textContent = editorText("cityEditor.messages.townFortificationOutworksNone");
  outworksSelect.options[1].textContent = editorText("cityEditor.messages.townFortificationOutworksRavelins");
  const ditchSelect = ctx.select(["dry", "wet"], ctx.generation.generateSettings.townFortification?.ditch ?? "dry");
  ditchSelect.className = "ce-fortress-ditch";
  ditchSelect.options[0].textContent = editorText("cityEditor.messages.townFortificationDitchDry");
  ditchSelect.options[1].textContent = editorText("cityEditor.messages.townFortificationDitchWet");
  const streetsSelect = ctx.select(
    ["radial", "organic"],
    ctx.generation.generateSettings.townFortification?.streetPlan ?? "radial"
  );
  streetsSelect.className = "ce-fortress-streets";
  streetsSelect.options[0].textContent = editorText("cityEditor.messages.townFortificationStreetsRadial");
  streetsSelect.options[1].textContent = editorText("cityEditor.messages.townFortificationStreetsOrganic");
  const dimensionsSelect = ctx.select(
    ["artillery-v1", "legacy"],
    ctx.generation.generateSettings.townFortification?.dimensionPolicy ?? "legacy"
  );
  dimensionsSelect.className = "ce-fortress-dimensions";
  dimensionsSelect.options[0].textContent = editorText("cityEditor.messages.fortressDimensionsArtillery");
  dimensionsSelect.options[1].textContent = editorText("cityEditor.messages.fortressDimensionsLegacy");
  const dimensionsLabel = ctx.label(editorText("cityEditor.messages.fortressDimensions"), dimensionsSelect);
  const outworksLabel = ctx.label(editorText("cityEditor.messages.townFortificationOutworks"), outworksSelect);
  const ditchLabel = ctx.label(editorText("cityEditor.messages.townFortificationDitch"), ditchSelect);
  const streetsLabel = ctx.label(editorText("cityEditor.messages.townFortificationStreets"), streetsSelect);
  const fortressNotice = div("ce-fortress-notice");
  const removeFortressButton = ctx.makeButton(editorText("cityEditor.messages.removeBastionedTown"), () => {
    const city = ctx.documents.documentState;
    if (!city.bastionedTown) return;
    ctx.panelEventContext().commit(removeBastionedTown(city), editorText("cityEditor.messages.bastionedTownRemoved"));
  });
  removeFortressButton.classList.add("ce-remove-bastioned-town");
  skeletonControls.append(ctx.label(editorText("cityEditor.messages.generationMethod"), methodSelect));
  const fortificationControls = div("ce-fortification-controls");
  fortificationControls.append(
    ctx.label(editorText("cityEditor.messages.townFortification"), fortSelect),
    outworksLabel,
    ditchLabel,
    streetsLabel,
    dimensionsLabel,
    fortressNotice,
    removeFortressButton
  );
  const wallShapeControls = div("ce-wall-shape-controls");
  wallShapeControls.append(shapeLabel, sidesLabel);
  const unavailable = (control: HTMLInputElement | HTMLSelectElement, active: boolean) => {
    if (active) {
      if (!control.dataset.skeletonTitle) control.dataset.skeletonTitle = control.title || " ";
      if (!control.dataset.skeletonDisabled) control.dataset.skeletonDisabled = String(control.disabled);
      control.disabled = true;
      control.title = editorText("cityEditor.messages.skeletonLater");
    } else if (control.dataset.skeletonTitle) {
      control.disabled = control.dataset.skeletonDisabled === "true";
      delete control.dataset.skeletonDisabled;
      control.title = control.dataset.skeletonTitle.trim();
      delete control.dataset.skeletonTitle;
    }
  };
  const settingFeedback = div("ce-setting-feedback");
  settingFeedback.id = `ce-setting-feedback-${crypto.randomUUID()}`;
  settingFeedback.setAttribute("aria-live", "polite");
  function syncSettingFeedback() {
    const container = skeletonControls.closest<HTMLElement>(".ce-generate");
    const find = (selector: string) => container?.querySelector<HTMLElement>(selector);
    renderGenerationSettingFeedback(
      settingFeedback,
      {
        townFortification: fortSelect,
        ditch: ditchSelect,
        rivers: riversSelect,
        coast: coastSelect,
        outworks: outworksSelect,
        streetPlan: streetsSelect,
        dimensionPolicy: dimensionsSelect,
        generationMethod: methodSelect,
        wallShape: shapeSelect,
        wallSides: sidesInput,
        historicalPeriod: historicalPeriodSelect,
        layout: layoutSelect,
        townWallRings: townWallRingsSelect,
        walledAreaShare: walledShareInput,
        walls: featureInputs.get("walls"),
        port: featureInputs.get("port"),
        citadel: featureInputs.get("citadel"),
        riverPlacement: riverPlacementSelect,
        avoidSea: avoidSeaInput,
        coastalWall: seaWallSelect,
        urbanNPatches: urbanNPatchesInput,
        urbanCoreMode: urbanCoreModeSelect,
        farNode: farNodeSelect,
        manualBearings: bearingsInput,
        populationEnabled: populationControls.panel.querySelector(".ce-population-enabled"),
        population: populationControls.panel.querySelector(".ce-population-input"),
        frameMode: populationControls.panel.querySelector(".ce-population-frame"),
        moats: find(".ce-moat-town"),
        frame: ctx.sizeLabel.querySelector("select")
      },
      generationSettingIssues(ctx.documents.documentState, ctx.generation.generateSettings)
    );
  }
  const skeletonParents = new WeakSet<HTMLElement>();
  const populationControls = buildPopulationControls(ctx);
  if (ctx.generation.generateSettings.population)
    historicalPeriodSelect.value = ctx.generation.generateSettings.historicalPeriod ?? "ageOfExploration";
  function syncSkeletonControls() {
    biomeControls.sync();
    forestControls.sync();
    appearanceControls.sync();
    populationControls.sync();
    const settings = ctx.generation.generateSettings;
    const active = settings.generationMethod === "skeleton-first";
    const fortress = !!settings.townFortification;
    methodSelect.value = settings.generationMethod ?? "mesh-first";
    shapeSelect.value = settings.wallShape ?? "auto";
    sidesInput.value = String(settings.wallSides ?? "");
    fortSelect.value = fortress ? "bastioned" : "ordinary";
    outworksLabel.hidden = !fortress;
    ditchLabel.hidden = !fortress;
    streetsLabel.hidden = !fortress;
    dimensionsLabel.hidden = !fortress;
    if (fortress && settings.townFortification) {
      outworksSelect.value = settings.townFortification.outworks;
      ditchSelect.value = settings.townFortification.ditch;
      streetsSelect.value = settings.townFortification.streetPlan;
      dimensionsSelect.value = settings.townFortification.dimensionPolicy ?? "legacy";
    }
    const conflicts = bastionedTownSettingConflicts(settings);
    fortressNotice.hidden = true;
    fortressNotice.textContent = "";
    const military = ctx.documents.documentState.bastionedTown?.military;
    if (fortress && military && !conflicts) {
      fortressNotice.hidden = false;
      fortressNotice.textContent =
        editorText("cityEditor.messages.fortressMilitarySummary", {
          depth: Math.round(military.minBastionDepthMeters),
          distance: Math.round(military.maxFlankingDistanceMeters),
          setback: Math.round(military.urbanToDefenseEdgeMeters)
        }) + (military.profile === "rifled-era" ? ` ${editorText("cityEditor.messages.fortressRifledExposure")}` : "");
    }
    removeFortressButton.hidden = !ctx.documents.documentState.bastionedTown;
    sidesInput.min = fortress ? "5" : "3";
    sidesInput.max = fortress ? "9" : "12";
    const unsupported = fortress
      ? []
      : skeletonUnsupportedSettings({ ...settings, generationMethod: "skeleton-first" });
    methodSelect.options[1].disabled = !active && unsupported.length > 0;
    methodSelect.options[1].title = unsupported.length
      ? editorText("cityEditor.messages.skeletonUnsupported", { features: unsupported.join(", ") })
      : "";
    methodSelect.title = methodSelect.options[1].title;
    shapeLabel.hidden = !active;
    const bastioned = shapeSelect.querySelector<HTMLOptionElement>('option[value="bastioned"]')!;
    bastioned.disabled = !bastionEra(settings.historicalPeriod ?? settings.descriptor?.historicalPeriod);
    bastioned.title = bastioned.disabled ? editorText("cityEditor.messages.skeletonBastionEra") : "";
    sidesLabel.hidden = !active || !["polygon", "bastioned"].includes(shapeSelect.value);
    if (active && settings.townWallRings !== "double") townWallRingsSelect.value = "single";
    if (active && settings.urbanCoreMode === undefined) urbanCoreModeSelect.value = "compact";
    for (const [key, input] of featureInputs) {
      input.disabled = !!settings.descriptor || (key === "citadel" && active && !fortress);
      input.title = settings.descriptor
        ? editorText("cityEditor.generationWorkspace.importedFeatures", {
            action: editorText("cityEditor.messages.useStandaloneSite")
          })
        : input.disabled
          ? editorText("cityEditor.messages.skeletonLater")
          : "";
    }
    layoutSelect.disabled = fortress;
    for (const option of layoutSelect.options) {
      option.disabled = active && ["bram", "circulade"].includes(option.value);
      option.title = option.disabled ? editorText("cityEditor.messages.skeletonLater") : "";
    }
    for (const option of townWallRingsSelect.options) {
      option.disabled = active && option.value !== "single";
      option.title = option.disabled ? editorText("cityEditor.messages.skeletonLater") : "";
    }
    for (const control of [
      townWallBuildOrderSelect,
      riverPlacementSelect,
      urbanCoreModeSelect,
      urbanNPatchesInput,
      farNodeSelect,
      bearingsInput,
      avoidSeaInput,
      seaWallSelect
    ])
      unavailable(control, active);
    syncSettingFeedback();
    const container = skeletonControls.closest<HTMLElement>(".ce-generate");
    if (container) syncGenerationSections(container, settings);
    if (container && !skeletonParents.has(container)) {
      skeletonParents.add(container);
      ctx.panelEventContext().scope.listen(container, "change", syncSkeletonControls);
      ctx.panelEventContext().scope.listen(container, "input", syncSettingFeedback);
    }
    for (const control of container?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      ".ce-moat-settings input, .ce-castle-settings select"
    ) ?? [])
      unavailable(control, active);
  }
  const invalidateSkeletonSelection = () => {
    ctx.generation.completeResult = null;
    ctx.panelEventContext().syncGenerateControls();
    ctx.syncStageUi(1);
  };
  ctx.panelEventContext().scope.listen(methodSelect, "change", () => {
    if (methodSelect.selectedOptions[0]?.disabled) {
      syncSkeletonControls();
      return;
    }
    ctx.generation.generateSettings.generationMethod = methodSelect.value as "mesh-first" | "skeleton-first";
    invalidateSkeletonSelection();
  });
  ctx.panelEventContext().scope.listen(shapeSelect, "change", () => {
    ctx.generation.generateSettings.wallShape = shapeSelect.value as import("../types/generation").WallShapeChoice;
    invalidateSkeletonSelection();
  });
  ctx.panelEventContext().scope.listen(sidesInput, "change", () => {
    const value = Number(sidesInput.value);
    const fortress = !!ctx.generation.generateSettings.townFortification;
    const min = fortress ? 5 : 3;
    const max = fortress ? 9 : 12;
    if (sidesInput.value && (!Number.isInteger(value) || value < min || value > max)) {
      syncSkeletonControls();
      return;
    }
    ctx.generation.generateSettings.wallSides = sidesInput.value ? value : undefined;
    invalidateSkeletonSelection();
  });
  const rememberFortress = () => {
    const current = ctx.generation.generateSettings.townFortification;
    if (!current) return;
    current.outworks = outworksSelect.value === "none" ? "none" : "ravelins";
    current.ditch = ditchSelect.value === "wet" ? "wet" : "dry";
    current.streetPlan = streetsSelect.value === "organic" ? "organic" : "radial";
    current.dimensionPolicy = dimensionsSelect.value === "artillery-v1" ? "artillery-v1" : "legacy";
    if (current.streetPlan === "radial") delete ctx.generation.generateSettings.layout;
    else ctx.generation.generateSettings.layout = "organic";
    invalidateSkeletonSelection();
  };
  ctx.panelEventContext().scope.listen(fortSelect, "change", () => {
    const settings = ctx.generation.generateSettings;
    if (fortSelect.value === "ordinary") delete settings.townFortification;
    else {
      settings.townFortification = {
        kind: "bastioned",
        outworks: "ravelins",
        ditch: "dry",
        streetPlan: "radial",
        dimensionPolicy: "artillery-v1"
      };
      settings.generationMethod = "skeleton-first";
      settings.wallShape = "bastioned";
      settings.walledAreaShare = 1;
      settings.config.features.walls = true;
      delete settings.layout;
      const walls = featureInputs.get("walls");
      if (walls) walls.checked = true;
      walledShareInput.value = "100";
      methodSelect.value = "skeleton-first";
      shapeSelect.value = "bastioned";
    }
    invalidateSkeletonSelection();
  });
  ctx.panelEventContext().scope.listen(outworksSelect, "change", rememberFortress);
  ctx.panelEventContext().scope.listen(ditchSelect, "change", rememberFortress);
  ctx.panelEventContext().scope.listen(streetsSelect, "change", rememberFortress);
  ctx.panelEventContext().scope.listen(dimensionsSelect, "change", rememberFortress);
  return {
    biomeControls,
    appearanceControls,
    forestControls,
    populationControls: populationControls.panel,
    skeletonControls,
    fortificationControls,
    wallShapeControls,
    settingFeedback,
    syncSkeletonControls,
    currentBuildingPatternSelect,
    historicalPeriodSelect,
    layoutSelect,
    buildingPatternSelect,
    coastSelect,
    seaWallSelect,
    wallMaterialSelect,
    riversSelect,
    riverPlacementSelect,
    reliefInput,
    featureInputs,
    featureGrid,
    stageContainer,
    stageSlider,
    setStageStep,
    urbanNPatchesInput,
    urbanCoreModeSelect,
    walledShareInput,
    inferredHistoryWalls,
    townWallRingsValue,
    townWallRingsSelect,
    townWallBuildOrderSelect,
    wallFallbackNotice,
    housingSummary,
    avoidSeaInput,
    farNodeSelect,
    bearingsInput,
    bearingsLabel,
    syncBearingsRow,
    stepStatus,
    stepRow,
    syncStepControls,
    blockMeshInput,
    gridLinesInput,
    coreLayerInput,
    regionalLayerInput,
    renderQualitySelect,
    meshToggleRow,
    importedBox,
    importedText,
    seedInput,
    seedLabel,
    copyLinkButton
  };
}

import i18n from "../../i18n";
import { type EditorMessageKey, editorHtml, editorOptionText, editorText } from "../../i18n/editorMessages";
import { rn } from "../../utils/numberUtils";
import { getUrbanDwellings } from "../../utils/urbanDwellings";
import { inferredWallSettings, supportsUrbanMorphology } from "../../utils/urbanMorphology";
import { historicLandmarkPrototypes } from "../assets/catalog";
import { cityFixedApproachProvider } from "../core/automaticFixedApproaches";
import {
  createCastleOnFace,
  deleteCastle,
  regenerateCastleInterior,
  setCastleLocked,
  setCastlePartLocked
} from "../core/castles";
import {
  CITY_SIZE_PRESETS,
  type CitySizePreset,
  createGridDocument,
  DEFAULT_CITY_SIZE,
  DEFAULT_GRID_KIND,
  DEFAULT_MAX_PATCHES,
  descriptorFrameGridOptions,
  type GridKind,
  MAX_PATCHES_CEILING,
  resolveMaxPatches,
  seaPortShoreDistanceMeters
} from "../core/document";
import type { FaceRoutePreview } from "../core/features";
import {
  appendEdge,
  appendRiverVertex,
  createGroup,
  encloseCircleWithWalls,
  encloseWardComponentWithWalls,
  featureGroupVertices,
  finishRiver,
  gateOpeningCandidates,
  groupUsesEdge,
  placeGateOpening,
  previewRouteAcrossFace,
  removeEdgeFromGroup,
  removeEdgesFromGroups,
  removeGroup,
  rerouteGroupAcrossFace,
  smoothFeatureGroup,
  smoothFeatureGroups,
  toggleGate,
  vertexHasWall,
  vertexHasWallPassage
} from "../core/features";
import { type FixedApproachProvider, restoreFixedCrossingApproaches } from "../core/fixedApproachAdoption";
import { reservedCastleFaces, townCircuits, validateFortifications } from "../core/fortifications";
import {
  approachBeyondLabel,
  evaluateApproachBeyond,
  normalizeApproachBeyond,
  REALM_RELATION_LABELS,
  REALM_RELATIONS,
  SETTLEMENT_ROLE_LABELS,
  SETTLEMENT_ROLES,
  SETTLEMENT_SCALE_LABELS,
  SETTLEMENT_SCALES
} from "../core/gen/approachBeyond";
import { buildBlockFabric, type InfillLane } from "../core/gen/blockInfill";
import { refreshCastleLayouts } from "../core/gen/castleLayout";
import { DEFAULT_CASTLE_SETTINGS } from "../core/gen/castlePlacement";
import { syncDocumentCemeteries } from "../core/gen/cemeteryLayout";
import { orientTempleHybrid } from "../core/gen/civicPlacement";
import {
  defaultDistrictParameters,
  resolveDistricts,
  setBuildingPattern,
  setDistrictParameters
} from "../core/gen/fabricDistricts";
import { buildGridEvolution, type GridEvolutionStage } from "../core/gen/gridEvolution";
import { DEFAULT_HEX_SIZE_METERS, HEX_SIZE_MAX_METERS, HEX_SIZE_MIN_METERS } from "../core/gen/hexGrid";
import { buildLandmarkLaneNetwork, repairLandmarkLaneTargets } from "../core/gen/landmarkLaneNetwork";
import { DEFAULT_PATCH_PARAMS, type PatchParams } from "../core/gen/patches";
import { makeRng } from "../core/gen/prng";
import { defaultWalledAreaShare } from "../core/gen/settlementExtent";
import type { BurgSiteDescriptor } from "../core/gen/site/burgSiteDescriptor";
import { shoreDistanceMeters } from "../core/gen/site/shoreDistance";
import {
  WALL_COAST_CHOICES,
  WALL_MATERIAL_CHOICES,
  type WallCoastChoice,
  type WallMaterialChoice
} from "../core/gen/site/siteConfig";
import {
  CITY_LAYOUTS,
  type CityFeatureSet,
  type CityLayout,
  COMPLETE_CITY_ATTEMPTS,
  clearGenerationPreviewCache,
  defaultGenerationSettings,
  type FarNodeMode,
  FEATURE_KEYS,
  GENERATION_STAGES,
  type GenerationSettings,
  type GenerationStage,
  type GenerationStepResult,
  generateCityOnDocument,
  generateCoastWalkStep,
  generateGateStep,
  generateRiverWalkStep,
  generateRoadStep,
  generateStageOnDocument,
  generateUrbanPatchStep,
  generateWardStep,
  generationStages,
  randomGeography,
  randomSeed,
  riversForCount,
  type SiteConfig
} from "../core/generate";
import type { GenerationDebugPreview } from "../core/generationDebug";
import { type GenerationSample, generationPhaseLabel, logGenerationFailures } from "../core/generationDiagnostics";
import { startCityGeneration } from "../core/generationWorkerClient";
import { DocumentHistory } from "../core/history";
import {
  placeLandmark,
  transformLandmarkPolygons,
  transformPlacedLandmark,
  validateLandmarks
} from "../core/landmarks";
import {
  clone,
  edgeBetween,
  faceNeighbors,
  facePoints,
  faceVertices,
  mergeFaces,
  mergeVertices,
  meshFromCells,
  moveVertex,
  optimizeJunctions,
  scaleDocument,
  setFaceDepth,
  setFaceElevation,
  setFaceWater,
  splitFace,
  validate
} from "../core/mesh";
import { openGatePassage } from "../core/passages";
import type {
  ApproachBeyond,
  ApproachBeyondData,
  BeyondRealmRelation,
  CastleSettings,
  CityDocument,
  CityElement,
  EdgeFeatureGroup,
  FeatureGroup,
  Id,
  LandmarkAsset,
  Point,
  SettlementRole,
  SettlementScale,
  Tool,
  WardKind,
  WaterKind
} from "../core/types";
import {
  exportCityMap,
  exportCitySvg,
  exportGenerationDebugSvg,
  type ImportedCityMap,
  pickCityMap,
  readCityMap
} from "../io/cityEditorFile";
import {
  buildShare,
  type CityEditorShare,
  cityLinkFor,
  encodeShare,
  forgetIncomingCity,
  type IncomingOrigin,
  readIncomingCity,
  readMaxPatchesPreference,
  writeMaxPatchesPreference
} from "../io/incomingCity";
import { CASTLE_STYLE_PROFILES, type CastleStyle, resolveCastleStyle } from "../render/castlePatterns";
import { clearRenderDerivedCaches } from "../render/derivedCaches";
import { renderFixedSitePreview } from "../render/fixedSitePreview";
import { renderGenerationDebugSvg } from "../render/generationDebugSvg";
import {
  getShipAngleFromPoint,
  renderShipRotationHandle,
  renderShipSvg,
  SHIP_SPECS,
  type ShipType
} from "../render/shipSvg";
import {
  appendFaceSelectionLabels,
  faceClassName,
  type GridOverlay,
  parsePickInfo,
  type RenderQuality,
  type RenderSelection,
  renderApproachLabels,
  renderCemeteries,
  renderEditorSvg,
  renderFaceWardLandmark,
  renderHoverOverlay,
  renderMeasureOverlay,
  renderRoutePreview,
  type SvgPickInfo
} from "../render/svg";
import { generationLogPanel } from "./generationLogPanel";

const TOOLS: Array<[Tool, EditorMessageKey, string]> = [
  ["select", "cityEditor.messages.selectAndMove", "↖"],
  ["landmark", "cityEditor.messages.placeHistoricLandmark", "⌂"],
  ["ship", "cityEditor.messages.placeShips", "⛵"],
  ["vertex", "cityEditor.messages.editVertices", "⌘"],
  ["road", "cityEditor.messages.drawRoad", "╱"],
  ["wall", "cityEditor.messages.drawWall", "▥"],
  ["river", "cityEditor.messages.drawRiver", "〰"],
  ["wardWall", "cityEditor.messages.drawCircularWardWall", "◯"],
  ["junction", "cityEditor.messages.cleanShortJunctions", "⌬"],
  ["face", "cityEditor.messages.editCell", "⬡"]
];

const PAINT_BRUSHES: Array<{ kind: WardKind | "sea" | "erase"; label: string }> = [
  { kind: "market", label: "💰" },
  { kind: "castle", label: "🏰" },
  { kind: "merchant", label: "⚖️" },
  { kind: "craftsmen", label: "🛠️" },
  { kind: "patriciate", label: "🏛️" },
  { kind: "harbor", label: "⚓" },
  { kind: "park", label: "🌳" },
  { kind: "cemetery", label: "🪦" },
  { kind: "farm", label: "🌾" },
  { kind: "empty", label: "󠁪󠁪 " },
  { kind: "erase", label: "🧹" },
  { kind: "sea", label: "🌊" }
];

interface ContextMenuAction {
  label: string;
  run: () => void;
  highlight?: { vertexId: Id; edgeId: Id };
  disabled?: boolean;
  title?: string;
  isSeparator?: boolean;
}

type RoutePaintKind = "river" | "road" | "wall";
type EraseTarget = "cells" | "edges" | "both";

interface RouteStroke {
  kind: RoutePaintKind;
  initialEdgeId: Id;
  groupId: Id | null;
  endpointId: Id | null;
  initialized: boolean;
  startPoint: Point;
  lastPoint: Point;
  changed: boolean;
  /** True once the stroke has pushed its single history entry; further steps
   * amend that entry in place so one drag is one undo. */
  committed: boolean;
}

interface CircularWallStroke {
  center: Point;
  centerClient: { clientX: number; clientY: number };
  radiusMeters: number;
}

interface FloatingWindow {
  root: HTMLDivElement;
  content: HTMLDivElement;
}

export interface CityEditorOptions {
  /** Complete current water/support/passage contract; retained only in this editor session. */
  fixedApproachProvider?: FixedApproachProvider;
}

export function mountCityEditor(root: HTMLElement, options: CityEditorOptions = {}): void {
  clearGenerationPreviewCache();
  clearRenderDerivedCaches();
  const fixedApproachProvider = options.fixedApproachProvider ?? cityFixedApproachProvider;
  let lastOutputDocInput: CityDocument | null = null;
  let lastOutputDocProvider: FixedApproachProvider | null = null;
  let lastOutputDocResult: CityDocument | null = null;

  function documentForOutput(current: CityDocument): CityDocument {
    if (!fixedApproachProvider || current.fixedCrossingApproaches === undefined) return current;
    if (current === lastOutputDocInput && fixedApproachProvider === lastOutputDocProvider && lastOutputDocResult) {
      return lastOutputDocResult;
    }
    const checked = restoreFixedCrossingApproaches(current, fixedApproachProvider);
    // Discard any previous object authorization when the current contract fails.
    const result = "document" in checked ? checked.document : clone(current);
    lastOutputDocInput = current;
    lastOutputDocProvider = fixedApproachProvider;
    lastOutputDocResult = result;
    return result;
  }
  let gridSeed = randomSeed();
  let documentState = createGridDocument({ size: DEFAULT_CITY_SIZE, grid: DEFAULT_GRID_KIND, seed: gridSeed });
  let gridKind: GridKind = DEFAULT_GRID_KIND;
  /** Fitted hamlet import: the scale bar's cell length follows the mesh, not 50 m. */
  let measureTownCells = false;
  let hexSizeMeters = DEFAULT_HEX_SIZE_METERS;
  let history = new DocumentHistory(
    documentState,
    editorText("cityEditor.messages.initialState"),
    undefined,
    fixedApproachProvider
  );
  // An imported MFCG SVG backdrop can be a multi-megabyte data URL. Keep it out
  // of `documentState` so it is never cloned into a history snapshot or an
  // undo/redo step; it is re-attached only for export and passed to the
  // renderer separately.
  let referenceImage: CityDocument["referenceImage"] | null = null;
  let tool: Tool = "select";
  let landmarkAssetId = "";
  let landmarkRotationDegrees = 0;
  let landmarkHoverPoint: Point | null = null;
  let shipType: ShipType = "small";
  let shipSizeMeters = SHIP_SPECS.small.defaultSizeMeters;
  let shipAngleDegrees = 0;
  let shipHoverPoint: Point | null = null;
  interface ShipDragState {
    shipId: string;
    mode: "move" | "rotate";
    startPoint: Point;
    initialShipPoint: Point;
    initialRotation: number;
    moved: boolean;
  }
  let shipDrag: ShipDragState | null = null;
  let shipDragBefore: CityDocument | null = null;
  let landmarkLaneSource: CityDocument | null = null;
  let landmarkLanes: InfillLane[] = [];
  let selection: RenderSelection = { faceId: null, edgeId: null, vertexId: null, groupId: null, inspectedId: null };
  let inspectedInfo: SvgPickInfo | null = null;
  let activeGroupId: Id | null = null;
  let dragBefore: CityDocument | null = null;
  let dragMergeCandidateId: Id | null = null;
  let isVertexDragging = false;
  let isWardPainting = false;
  let wardPaintChanged = false;
  let edgePaintChanged = false;
  let paintedWardFaceIds = new Set<Id>();
  let paintedEdgeIds = new Set<Id>();
  let isJunctionPainting = false;
  let junctionPaintChanged = false;
  let circularWallStroke: CircularWallStroke | null = null;
  let routeDrag: { groupId: Id; edgeId: Id; startX: number; startY: number; moved: boolean } | null = null;
  let routeStroke: RouteStroke | null = null;
  let routePreview: FaceRoutePreview | null = null;
  let routePreviewFaceId: Id | null = null;
  let isPanning = false;
  let isSpacePressed = false;
  let showSelectionLabels = false;
  let wardBrush: WardKind | null = "market";
  // Erase remains a Ward brush so it can use the same size and preview, but it
  // may also remove routes placed on mesh edges.
  let eraseTarget: EraseTarget = "both";
  // The brush is expressed in macro cells, so its size stays meaningful when
  // switching between city presets or changing the map scale.
  let brushSizeCells = 1;
  let junctionMaxGapMeters = 8;
  let wardBrushPointer: { clientX: number; clientY: number } | null = null;
  let circularWallPointer: { clientX: number; clientY: number } | null = null;
  let hasPanned = false;
  let suppressNextClick = false;
  let lastPanX = 0;
  let lastPanY = 0;
  let viewCenter: [number, number] = [0, 0];
  let closeContextMenuOnPointerMove = false;
  let notice = "";
  let measureFrom: [number, number] | null = null;
  let measureTo: [number, number] | null = null;
  const generateSettings: GenerationSettings = {
    ...defaultGenerationSettings(),
    buildingPattern: "medieval",
    townWallRings: "double"
  };
  // Shown in the Generate panel and encoded in a shareable `city-editor/#…`
  // link. Re-rolled by "🎲 新しい都市"; every stage regenerates THIS town so
  // ①→⑧ stay consistent with each other.
  let generateSeed = randomSeed();
  let hideBuildings = false;
  /** Stage ⑬. Same document as ⑫; the town drawing omits intramural roads and block lanes. */
  let hideStreetLines = false;
  let currentStageStep = 16;
  let syncStageUi: (step: number) => void = () => {};
  let importedOrigin: IncomingOrigin | null = null;
  let completeSource: CityDocument | null = null;
  let completeResult: CityDocument | null = null;
  let completeResultSettings: string | null = null;
  const generationHistory = new WeakMap<
    object,
    {
      source: CityDocument;
      result: CityDocument | null;
      resultSettings: string | null;
      settings: GenerationSettings;
      seed: string;
      stage: number;
      lastStage: number | null;
      activeStage: GenerationStage["id"] | null;
      stepIndex: number;
      stepStatus: string;
      coreHighlight: Set<Id> | null;
      overlayPaths: Point[][] | null;
      hideBuildings: boolean;
      hideStreetLines: boolean;
    }
  >();
  let generationJob: ReturnType<typeof startCityGeneration> | null = null;
  let generationSamples: GenerationSample[] = [];
  let generationLogHover: { ids: string[]; seed: string } = { ids: [], seed: "" };
  let pendingFailurePreview: GenerationDebugPreview | null = null;
  let failurePreview: GenerationDebugPreview | null = null;
  let failureRenderContext: GenerationDebugPreview | null = null;
  let failurePreviewHistoryIndex: number | null = null;
  const failureDebugInput = checkbox(false, checked => {
    if (!checked) clearFailurePreview();
  });
  failureDebugInput.setAttribute("aria-label", editorText("cityEditor.messages.debugShowGenerationFailurePreview"));
  const failureDebugSummary = document.createElement("div");
  failureDebugSummary.className = "ce-generation-debug-summary";
  failureDebugSummary.setAttribute("aria-live", "polite");
  failureDebugSummary.hidden = true;
  const closeFailurePreview = makeButton(editorText("cityEditor.messages.closeFailureHighlighting"), () =>
    clearFailurePreview()
  );
  closeFailurePreview.hidden = true;
  const generationProgress = document.createElement("output");
  generationProgress.className = "ce-generation-progress";
  generationProgress.setAttribute("aria-live", "polite");
  const cancelGeneration = makeButton(editorText("cityEditor.messages.cancelGeneration"), () =>
    generationJob?.cancel()
  );
  cancelGeneration.hidden = true;
  // Keep the document and settings stable until the result is committed.
  for (const eventName of ["click", "pointerdown", "change", "input", "keydown"]) {
    root.addEventListener(
      eventName,
      event => {
        if (!generationJob || event.target === cancelGeneration) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true
    );
  }

  let showBlockMesh = false;
  let showGridLines = false;
  let lastGeneratedStep: number | null = null;
  // Per-loop process scrub (towngen-comparison.md): ◀/▶ steps through
  // WHICHEVER of the generation processes was last activated (by pressing its stage
  // button, or by ◀/▶ itself), one loop iteration at a time. `stepIndex` is
  // -1 = nothing stepped yet, so the first ▶ press lands on iteration 0.
  // `urbanCoreHighlight` / `stepOverlayPaths` are transient render tints for
  // the two stages with nothing else on the document to show a partial result
  // (③'s `buildable` has no fill of its own; ①/② are a walk, not cells) —
  // cleared whenever a different stage becomes active.
  let activeStepStage: GenerationStage["id"] | null = null;
  let stepIndex = -1;
  let urbanCoreHighlight: Set<Id> | null = null;
  let stepOverlayPaths: Point[][] | null = null;
  // Document panel "Grid evolution" (Phase G1): the TownGeneratorTS-style
  // spiral-scatter → incremental-Voronoi → central-relax pipeline captured one
  // for-loop iteration at a time. `gridEvoStages` is a transient preview overlay
  // (not on the document) until "採用" adopts a stage's cells as the new mesh.
  const gridEvoParams: Omit<PatchParams, "extentMeters"> = {
    ...DEFAULT_PATCH_PARAMS,
    maxPatches: readMaxPatchesPreference()
  };
  let gridEvoSeed = randomSeed();
  let gridEvoStages: GridEvolutionStage[] | null = null;
  let gridEvoIndex = 0;
  const gridEvoLayers = { showCells: true, showDelaunay: false, showSites: true };
  let halfView = documentState.frame.extentMeters / 2;
  let routeEdgesByGroup = new Map<Id, Id[]>();
  let routeGroupsByEdge = new Map<Id, Id[]>();
  let edgeIdsByVertex = new Map<Id, Id[]>();
  let faceBuckets = new Map<string, Id[]>();
  let vertexBuckets = new Map<string, Id[]>();
  let faceBucketSize = documentState.frame.blockSizeMeters * 2;
  // Coalesce the map redraws that fire on every pointermove (pan, vertex drag,
  // paint, route stroke) into one repaint per animation frame. A full
  // renderEditorSvg() pass rebuilds thousands of nodes on a Medium/Large grid.
  let redrawHandle = 0;
  // renderHistory() reuses these row nodes across calls instead of rebuilding
  // the whole list every edit (see renderHistory for why).
  let historyListEl: HTMLDivElement | null = null;
  let historySummaryEl: HTMLElement | null = null;
  let historyClearButton: HTMLButtonElement | null = null;
  let historyRows: HTMLButtonElement[] = [];
  // Rebuilt every full redrawMap() pass; patchFaceRender() uses these to
  // update one face's <path>/landmark in place after a ward/sea paint,
  // instead of a full renderEditorSvg() pass over the whole mesh.
  let faceElementsById = new Map<Id, SVGPathElement>();
  let wardLandmarkElementsById = new Map<Id, SVGGElement>();
  let wardLandmarksGroup: SVGGElement | null = null;

  const canvas = div("ce-canvas");
  const map = div("ce-map");
  const wardBrushPreview = div("ce-ward-brush-preview");
  wardBrushPreview.hidden = true;
  const circularWallPreview = div("ce-wall-circle-preview");
  circularWallPreview.hidden = true;
  const circularWallCenter = div("ce-wall-center-marker");
  circularWallCenter.textContent = "+";
  circularWallCenter.hidden = true;
  canvas.appendChild(map);
  canvas.appendChild(wardBrushPreview);
  canvas.append(circularWallPreview, circularWallCenter);
  const toolbar = floatingWindow("ce-toolbar", editorText("cityEditor.messages.tools"));
  const documentPanel = floatingWindow("ce-document", editorText("cityEditor.messages.document"));
  const inspector = floatingWindow("ce-inspector", editorText("cityEditor.messages.inspector"));
  const groups = floatingWindow("ce-groups", editorText("cityEditor.messages.objects"));
  const historyPanel = floatingWindow("ce-history", editorText("cityEditor.messages.history"));
  const logPanel = floatingWindow("ce-generation-log", editorText("cityEditor.messages.generationLog"));
  const generationLog = generationLogPanel(logPanel.content, hoverGenerationLogObjects);
  const generatePanel = floatingWindow("ce-generate", editorText("cityEditor.messages.generate"));
  const status = document.createElement("output");
  status.className = "ce-status";
  const scaleBar = div("ce-scale-bar");
  const scaleLine = div("ce-scale-bar-line");
  const scaleLabel = document.createElement("output");
  scaleLabel.className = "ce-scale-bar-label";
  scaleBar.append(scaleLine, scaleLabel);
  const contextMenu = div("ce-context-menu");
  contextMenu.hidden = true;
  contextMenu.setAttribute("role", "menu");
  root.replaceChildren(
    canvas,
    toolbar.root,
    documentPanel.root,
    inspector.root,
    groups.root,
    historyPanel.root,
    logPanel.root,
    generatePanel.root,
    status,
    scaleBar,
    contextMenu
  );
  contextMenu.addEventListener("pointerdown", event => event.stopPropagation());
  contextMenu.addEventListener("contextmenu", event => event.preventDefault());

  const toolButtons = new Map<Tool, HTMLButtonElement>();
  const toolGrid = div("ce-icon-row");
  for (const [id, labelKey, icon] of TOOLS) {
    const button = makeIconButton(icon, editorText(labelKey), () => {
      tool = id;
      if (id !== "select") {
        inspectedInfo = null;
        selection.inspectedId = null;
      } else {
        showBlockMesh = false;
      }
      refresh();
    });
    toolButtons.set(id, button);
    toolGrid.appendChild(button);
  }
  toolbar.content.appendChild(toolGrid);
  const landmarkControls = div("ce-landmark-controls");
  const landmarkSelect = document.createElement("select");
  landmarkSelect.setAttribute("aria-label", editorText("cityEditor.messages.historicLandmarkAsset"));
  landmarkSelect.addEventListener("change", () => {
    landmarkAssetId = landmarkSelect.value;
    refresh();
  });
  const landmarkAngle = document.createElement("input");
  landmarkAngle.type = "number";
  landmarkAngle.min = "-180";
  landmarkAngle.max = "180";
  landmarkAngle.step = "15";
  landmarkAngle.value = "0";
  landmarkAngle.title = editorText("cityEditor.messages.landmarkRotationInDegrees");
  landmarkAngle.addEventListener("change", () => {
    landmarkRotationDegrees = Number(landmarkAngle.value) || 0;
    updateLandmarkPreview();
  });
  const landmarkFile = document.createElement("input");
  landmarkFile.type = "file";
  landmarkFile.accept = ".json,application/json";
  landmarkFile.title = editorText("cityEditor.messages.importAReviewedLandmarkAssetJSON");
  landmarkFile.addEventListener("change", () => {
    const file = landmarkFile.files?.[0];
    if (!file) return;
    void file.text().then(source => {
      try {
        const asset = JSON.parse(source) as LandmarkAsset;
        const trial: CityDocument = {
          ...documentState,
          version: documentState.sceneRegions ? 4 : 3,
          landmarkAssets: [asset],
          landmarks: []
        };
        if (validateLandmarks(trial).length) throw new Error(editorText("cityEditor.messages.invalidAsset"));
        const already = (documentState.landmarkAssets ?? []).some(
          item => item.id === asset.id && item.revision === asset.revision
        );
        if (!already)
          commit(
            {
              ...documentState,
              version: documentState.sceneRegions ? 4 : 3,
              landmarkAssets: [...(documentState.landmarkAssets ?? []), asset]
            },
            editorText("cityEditor.messages.import", { value0: asset.name })
          );
        landmarkAssetId = `${asset.id}@${asset.revision}`;
        tool = "landmark";
        refresh();
      } catch {
        showNotice(editorText("cityEditor.messages.checkTheLandmarkAssetFormat"));
      }
    });
  });
  landmarkControls.append(landmarkSelect, landmarkAngle, landmarkFile);
  toolbar.content.appendChild(landmarkControls);

  const shipControls = div("ce-ship-controls");
  const shipSelect = document.createElement("select");
  shipSelect.setAttribute("aria-label", editorText("cityEditor.messages.shipType"));
  for (const [key, spec] of Object.entries(SHIP_SPECS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = `${spec.label}`;
    shipSelect.appendChild(opt);
  }
  shipSelect.value = shipType;

  const shipSizeInput = document.createElement("input");
  shipSizeInput.type = "number";
  shipSizeInput.min = "6";
  shipSizeInput.max = "80";
  shipSizeInput.step = "1";
  shipSizeInput.value = String(shipSizeMeters);
  shipSizeInput.title = editorText("cityEditor.messages.shipLengthInMetres");

  shipSelect.addEventListener("change", () => {
    shipType = shipSelect.value as ShipType;
    shipSizeMeters = SHIP_SPECS[shipType].defaultSizeMeters;
    shipSizeInput.value = String(shipSizeMeters);
    updateShipPreview();
    refresh();
  });

  shipSizeInput.addEventListener("input", () => {
    shipSizeMeters = Number(shipSizeInput.value) || SHIP_SPECS[shipType].defaultSizeMeters;
    updateShipPreview();
  });

  const shipAngle = document.createElement("input");
  shipAngle.type = "number";
  shipAngle.min = "-180";
  shipAngle.max = "180";
  shipAngle.step = "15";
  shipAngle.value = "0";
  shipAngle.title = editorText("cityEditor.messages.shipRotationInDegrees");
  shipAngle.addEventListener("input", () => {
    shipAngleDegrees = Number(shipAngle.value) || 0;
    updateShipPreview();
  });

  shipControls.append(
    shipSelect,
    label(editorText("cityEditor.messages.lengthM"), shipSizeInput),
    label(editorText("cityEditor.messages.angle"), shipAngle)
  );
  toolbar.content.appendChild(shipControls);
  const paintButtons = new Map<WardKind | "sea" | "erase", HTMLButtonElement>();
  const paintGrid = div("ce-icon-row");
  for (const { kind, label: paintLabel } of PAINT_BRUSHES) {
    const paintButton = makeButton(paintLabel, () => {
      inspectedInfo = null;
      selection.inspectedId = null;
      if (kind === "sea") tool = "sea";
      else {
        wardBrush = kind === "erase" ? null : kind;
        tool = "ward";
      }
      refresh();
    });
    paintButton.title =
      kind === "erase"
        ? editorText("cityEditor.messages.eraseWardAssignments")
        : editorText("cityEditor.messages.paintCells", { value0: editorOptionText(kind) });
    paintButton.className = "ce-icon-button";
    paintButtons.set(kind, paintButton);
    paintGrid.appendChild(paintButton);
  }
  const size = select(Object.keys(CITY_SIZE_PRESETS), DEFAULT_CITY_SIZE);
  size.className = "ce-map-size";
  for (const option of [...size.options]) {
    const preset = CITY_SIZE_PRESETS[option.value as CitySizePreset];
    option.textContent = editorText("cityEditor.messages.mapSizeWithExtent", {
      value0: preset.label,
      value1: preset.extentMeters / 1000
    });
  }
  const gridKindSelect = select(["hex", "voronoi", "evolution"], DEFAULT_GRID_KIND);
  gridKindSelect.className = "ce-grid-kind";
  for (const option of [...gridKindSelect.options]) {
    option.textContent =
      option.value === "hex"
        ? editorText("cityEditor.messages.hexagonal")
        : option.value === "voronoi"
          ? editorText("cityEditor.messages.voronoi")
          : editorText("cityEditor.messages.gridEvolution");
  }
  const hexSizeInput = rangeInput(
    String(DEFAULT_HEX_SIZE_METERS),
    String(HEX_SIZE_MIN_METERS),
    String(HEX_SIZE_MAX_METERS),
    "1"
  );
  hexSizeInput.className = "ce-hex-size";
  hexSizeInput.title = editorText("cityEditor.messages.sideLengthOfEachRegularHexagonMetres");
  const hexSizeValue = text(formatDistance(DEFAULT_HEX_SIZE_METERS));
  const hexSizeControl = div("ce-brush-size-control");
  hexSizeControl.append(hexSizeInput, hexSizeValue);
  const hexSizeLabel = label(editorText("cityEditor.messages.hexSize"), hexSizeControl);
  hexSizeInput.addEventListener("input", () => {
    hexSizeMeters = Number(hexSizeInput.value);
    hexSizeValue.textContent = formatDistance(hexSizeMeters);
  });
  const gridKindLabel = label(editorText("cityEditor.messages.grid"), gridKindSelect);
  gridKindLabel.className = "ce-size-choice";
  const syncGridKindUi = (): void => {
    hexSizeLabel.hidden = gridKind !== "hex";
  };
  gridKindSelect.addEventListener("change", () => {
    gridKind = gridKindSelect.value as GridKind;
    syncGridKindUi();
  });
  syncGridKindUi();
  const newButton = makeIconButton("🆕", editorText("cityEditor.messages.generateANewGrid"), () => {
    gridSeed = randomSeed();
    documentState = createGridDocument({
      size: size.value as CitySizePreset,
      grid: gridKind,
      seed: gridSeed,
      hexSizeMeters,
      patchParams: { ...gridEvoParams },
      ...importedFrame(),
      measureBlockSize: measureTownCells
    });
    history = new DocumentHistory(
      documentState,
      editorText("cityEditor.messages.newGrid"),
      undefined,
      fixedApproachProvider
    );
    generationLog.reset();
    referenceImage = null;
    selection = emptySelection();
    activeGroupId = null;
    halfView = documentState.frame.extentMeters / 2;
    viewCenter = [0, 0];
    // A fresh mesh may reuse the old town's face ids — drop any stale step state.
    activeStepStage = null;
    stepIndex = -1;
    urbanCoreHighlight = null;
    stepOverlayPaths = null;
    stepStatus.textContent = "";
    lastGeneratedStep = null;
    completeSource = null;
    completeResult = null;
    clearGenerationPreviewCache();
    showBlockMesh = false;
    clearGridEvo();
    clearMeasurement();
    rebuildEditorIndexes();
    refresh();
  });
  const sizeLabel = label(editorText("cityEditor.messages.mapSize"), size);
  sizeLabel.className = "ce-size-choice";
  const undoButton = makeIconButton("🔙", editorText("cityEditor.messages.undo"), () =>
    restore(history.undo(documentState))
  );
  const redoButton = makeIconButton("➜]", editorText("cityEditor.messages.redo"), () =>
    restore(history.redo(documentState))
  );
  const exportButton = makeIconButton("📥", editorText("cityEditor.messages.exportEditableCityMapJSON"), () => {
    exportCityMap(referenceImage ? { ...documentState, referenceImage } : documentState);
    showNotice(editorText("cityEditor.messages.mapExported"));
  });
  const exportSvgButton = makeIconButton("🗺️", editorText("cityEditor.messages.exportCityMapAsSVG"), () => {
    if (failurePreview) {
      exportGenerationDebugSvg(failurePreview);
      showNotice(editorText("cityEditor.messages.exportedSVGFromTheFailedGeneration"));
      return;
    }
    exportCitySvg(documentForOutput(referenceImage ? { ...documentState, referenceImage } : documentState));
    showNotice(editorText("cityEditor.messages.sVGExported"));
  });
  const importButton = makeIconButton(
    "📤",
    editorText("cityEditor.messages.importCityMapOrSVGReference"),
    () => void importDocument()
  );
  const scaleInput = numberInput("1", "0.1", "0.1");
  const showLabelsInput = document.createElement("input");
  showLabelsInput.type = "checkbox";
  showLabelsInput.addEventListener("change", () => {
    showSelectionLabels = showLabelsInput.checked;
    redrawMap();
  });
  const brushSizeInput = rangeInput("1", "1", "8", "1");
  const brushSizeValue = text(brushSizeText());
  const brushSizeControl = div("ce-brush-size-control");
  brushSizeControl.append(brushSizeInput, brushSizeValue);
  const brushSizeLabel = label(editorText("cityEditor.messages.brushSize"), brushSizeControl);
  brushSizeInput.addEventListener("input", () => {
    brushSizeCells = Number(brushSizeInput.value);
    brushSizeValue.textContent = brushSizeText();
    updateWardBrushPreview();
  });
  const eraseTargetInput = select(["both", "cells", "edges"], "both");
  for (const option of [...eraseTargetInput.options]) {
    option.textContent =
      option.value === "both"
        ? editorText("cityEditor.messages.cellsAndEdges")
        : editorText("cityEditor.messages.eraseTargetOnly", { target: editorOptionText(option.value) });
  }
  const eraseTargetLabel = label(editorText("cityEditor.messages.erase"), eraseTargetInput);
  eraseTargetInput.addEventListener("change", () => {
    eraseTarget = eraseTargetInput.value as EraseTarget;
  });
  const junctionMaxGapInput = rangeInput("8", "1", "50", "1");
  const junctionMaxGapValue = text(formatDistance(junctionMaxGapMeters));
  const junctionMaxGapSliderRow = div("ce-brush-size-control");
  junctionMaxGapSliderRow.append(junctionMaxGapInput, junctionMaxGapValue);
  const junctionGapScale = div("ce-junction-gap-scale");
  const junctionGapLine = div("ce-junction-gap-line");
  const junctionGapLength = text("");
  junctionGapScale.append(junctionGapLine, junctionGapLength);
  const junctionMaxGapControl = div("ce-junction-gap-control");
  junctionMaxGapControl.append(junctionMaxGapSliderRow, junctionGapScale);
  const junctionMaxGapLabel = label(editorText("cityEditor.messages.maxJunctionGap"), junctionMaxGapControl);
  junctionMaxGapInput.addEventListener("input", () => {
    junctionMaxGapMeters = Number(junctionMaxGapInput.value);
    junctionMaxGapValue.textContent = formatDistance(junctionMaxGapMeters);
    refreshJunctionGapScale();
  });
  const scaleButton = makeIconButton("⤢", editorText("cityEditor.messages.scaleAllMapGeometry"), () => {
    const factor = Number(scaleInput.value);
    const next = scaleDocument(documentState, factor);
    if (next) {
      halfView *= factor;
      commit(next, editorText("cityEditor.messages.scaleGeometry", { value0: factor }));
    }
  });
  const finishButton = makeIconButton("✓", editorText("cityEditor.messages.finishActiveRiver"), () => {
    if (!activeGroupId) return;
    const next = finishRiver(documentState, activeGroupId);
    if (next) commit(next, editorText("cityEditor.messages.finishRiver"));
  });
  const smoothingModeInput = select(["safe", "include loops & shared"], "safe");
  const smoothGroupsButton = makeIconButton("⌁", editorText("cityEditor.messages.smoothAllRoutes"), () => {
    const mode = smoothingModeInput.value === "include loops & shared" ? "includeSharedAndLoops" : "safe";
    const next = smoothFeatureGroups(documentState, mode);
    if (next) commit(next, editorText("cityEditor.messages.smoothAllRoutes"));
    else showNotice(editorText("cityEditor.messages.noMovableRiverRoadOrWallVerticesToSmooth"));
  });
  const actions = div("ce-icon-row");
  actions.append(undoButton, redoButton, importButton, exportButton, exportSvgButton);
  toolbar.content.append(
    divider(),
    actions,
    text(editorText("cityEditor.messages.paintCellsCityEditorPage")),
    paintGrid,
    brushSizeLabel,
    eraseTargetLabel,
    junctionMaxGapLabel,
    label(editorText("cityEditor.messages.cellIDs"), showLabelsInput)
  );
  const documentActions = div("ce-icon-row");
  documentActions.append(newButton, scaleButton, finishButton, smoothGroupsButton);

  // --- Grid evolution (Phase G1): step through the TownGeneratorTS-style
  //     buildPatches pipeline one for-loop iteration at a time. Dragging a
  //     parameter slider rebuilds the preview live and lands on the final
  //     stage — the same result as the "Preview grid evolution" button. ---
  const gridParamLabels: HTMLLabelElement[] = [];
  const gridParamControls: Partial<
    Record<
      "nPatches" | "relaxCount" | "relaxPasses" | "rimGrowthPercent" | "maxPatches",
      { slider: HTMLInputElement; readout: HTMLSpanElement }
    >
  > = {};
  const gridParamDefault = (key: keyof typeof gridParamControls): number =>
    gridEvoParams[key] ?? (key === "maxPatches" ? DEFAULT_MAX_PATCHES : 100);
  for (const { key, caption, min, max } of [
    {
      key: "nPatches",
      caption: editorText("cityEditor.messages.patchesNPatches"),
      min: 6,
      max: resolveMaxPatches(gridEvoParams.maxPatches)
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
    const slider = rangeInput(String(gridParamDefault(key)), String(min), String(max), "1");
    const readout = text(String(gridParamDefault(key)));
    const control = div("ce-grid-slider-control");
    control.append(slider, readout);
    slider.addEventListener("input", () => {
      gridEvoParams[key] = Number(slider.value);
      readout.textContent = slider.value;
      if (key === "maxPatches") {
        writeMaxPatchesPreference(gridEvoParams.maxPatches!);
        gridEvoParams.nPatches = Math.min(gridEvoParams.nPatches, gridEvoParams.maxPatches!);
        syncGridParamControls();
      }
      runGridEvo(); // live — same output as the Preview button (~25 ms)
    });
    gridParamControls[key] = { slider, readout };
    gridParamLabels.push(label(caption, control));
  }
  const syncGridParamControls = (): void => {
    const nPatchesSlider = gridParamControls.nPatches?.slider;
    // Widen the range before setting the value; a range input clamps to its max.
    if (nPatchesSlider) nPatchesSlider.max = String(resolveMaxPatches(gridEvoParams.maxPatches));
    for (const key of ["maxPatches", "nPatches", "relaxCount", "relaxPasses", "rimGrowthPercent"] as const) {
      const control = gridParamControls[key];
      if (!control) continue;
      control.slider.value = String(gridParamDefault(key));
      control.readout.textContent = control.slider.value;
    }
  };
  const gridEvoBuildButton = makeButton(editorText("cityEditor.messages.previewGridEvolution"), () => runGridEvo());
  const gridEvoReseedButton = makeIconButton("🎲", editorText("cityEditor.messages.newScatterSeed"), () => {
    gridEvoSeed = randomSeed();
    if (gridEvoStages) runGridEvo();
  });
  const gridEvoSlider = rangeInput("0", "0", "0", "1");
  gridEvoSlider.className = "ce-grid-step";
  const gridEvoFirstButton = makeIconButton("⏮", editorText("cityEditor.messages.firstStage"), () =>
    stepGridEvo(-Infinity)
  );
  const gridEvoPrevButton = makeIconButton("◀", editorText("cityEditor.messages.previousStage"), () => stepGridEvo(-1));
  const gridEvoNextButton = makeIconButton("▶", editorText("cityEditor.messages.nextStage"), () => stepGridEvo(1));
  const gridEvoLastButton = makeIconButton("⏭", editorText("cityEditor.messages.lastStage"), () =>
    stepGridEvo(Infinity)
  );
  const gridEvoLabel = document.createElement("output");
  gridEvoLabel.className = "ce-grid-evo-status";
  const gridEvoSliderRow = div("ce-brush-size-control");
  gridEvoSliderRow.append(gridEvoSlider, gridEvoFirstButton, gridEvoPrevButton, gridEvoNextButton, gridEvoLastButton);
  gridEvoSlider.addEventListener("input", () => {
    gridEvoIndex = Number(gridEvoSlider.value);
    syncGridEvoUi();
    redrawMap();
  });
  const gridLayerInputs = new Map<keyof typeof gridEvoLayers, HTMLInputElement>();
  const gridLayerRow = div("ce-grid-layers");
  for (const [key, caption] of [
    ["showCells", editorText("cityEditor.messages.voronoi")],
    ["showDelaunay", editorText("cityEditor.messages.delaunay")],
    ["showSites", editorText("cityEditor.messages.sites")]
  ] as const) {
    const input = checkbox(gridEvoLayers[key], checked => {
      gridEvoLayers[key] = checked;
      redrawMap();
    });
    gridLayerInputs.set(key, input);
    gridLayerRow.append(toggleLabel(caption, input));
  }
  const gridEvoAdoptButton = makeButton(editorText("cityEditor.messages.adoptThisGrid"), () => adoptGridEvo());
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

  const currentBuildingPatternSelect = select(["legacy", "medieval"], documentState.buildingPattern ?? "legacy");
  currentBuildingPatternSelect.className = "ce-document-building-pattern";
  currentBuildingPatternSelect.setAttribute("aria-label", editorText("cityEditor.messages.currentBuildingGeneration"));
  currentBuildingPatternSelect.options[0].textContent = editorText("cityEditor.messages.legacyHousing");
  currentBuildingPatternSelect.options[1].textContent = editorText(
    "cityEditor.messages.medievalLotsStoresHousesAndGardens"
  );
  currentBuildingPatternSelect.addEventListener("change", () => {
    const pattern = currentBuildingPatternSelect.value as "legacy" | "medieval";
    generateSettings.buildingPattern = pattern;
    commit(setBuildingPattern(documentState, pattern), editorText("cityEditor.messages.changeBuildingPattern"));
    if (documentState.appearance === "town") {
      completeResult = documentState;
      completeResultSettings = JSON.stringify(generateSettings);
    }
    syncGenerateControls();
  });

  const periodOptions: import("../core/types").HistoricalPeriod[] = [
    "ageOfExploration",
    "lateMedieval",
    "highMedieval",
    "earlyMedieval",
    "classicalAntiquity",
    "maritimeEra",
    "preIndustrialEra",
    "steamEra"
  ];
  const historicalPeriodSelect = select(periodOptions, documentState.historicalPeriod ?? "ageOfExploration");
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
  historicalPeriodSelect.addEventListener("change", () => {
    const period = historicalPeriodSelect.value as import("../core/types").HistoricalPeriod;
    generateSettings.historicalPeriod = period;
    const next = { ...documentState, historicalPeriod: period };
    const plaza = next.elements.find(e => e.kind === "plaza");
    for (const elem of next.elements) {
      if (elem.kind === "temple" && elem.point && !elem.locked) {
        elem.rotation = orientTempleHybrid(elem.point, elem.rotation ?? 0, plaza?.point, period);
      }
    }
    commit(next, editorText("cityEditor.messages.changeHistoricalPeriod"));
    if (documentState.appearance === "town") {
      completeResult = next;
      completeResultSettings = JSON.stringify(generateSettings);
    }
    syncGenerateControls();
  });

  documentPanel.content.append(
    sizeLabel,
    gridKindLabel,
    hexSizeLabel,
    documentActions,
    label(editorText("cityEditor.messages.historicalPeriod"), historicalPeriodSelect),
    label(editorText("cityEditor.messages.currentBuildingGeneration"), currentBuildingPatternSelect),
    label(editorText("cityEditor.messages.scale"), scaleInput),
    label(editorText("cityEditor.messages.smoothing"), smoothingModeInput),
    text(editorText("cityEditor.messages.chooseAGridThenPressToStartANewCity")),
    divider(),
    text(editorText("cityEditor.messages.gridEvolutionSpiralScatterIncrementalVoronoiCentralRelaxationOneIteration")),
    gridEvoControls
  );
  syncGridEvoUi();

  const layoutSelect = select(CITY_LAYOUTS, generateSettings.layout ?? generateSettings.config.layout ?? "auto");
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
  layoutSelect.addEventListener("change", () => {
    const val = layoutSelect.value as CityLayout;
    generateSettings.layout = val;
    generateSettings.config.layout = val;
  });

  const buildingPatternSelect = select(["legacy", "medieval"], generateSettings.buildingPattern ?? "legacy");
  buildingPatternSelect.className = "ce-generate-building-pattern";
  buildingPatternSelect.setAttribute("aria-label", editorText("cityEditor.messages.buildingGeneration"));
  buildingPatternSelect.options[0].textContent = editorText("cityEditor.messages.legacyHousing");
  buildingPatternSelect.options[1].textContent = editorText("cityEditor.messages.medievalLotsStoresHousesAndGardens");
  buildingPatternSelect.addEventListener("change", () => {
    generateSettings.buildingPattern = buildingPatternSelect.value as "legacy" | "medieval";
    completeResult = null;
    clearGenerationPreviewCache();
  });

  const coastSelect = select(["none", "straight", "bay", "cape"], generateSettings.config.coast);
  coastSelect.addEventListener("change", () => {
    generateSettings.config.coast = coastSelect.value as SiteConfig["coast"];
    generateSettings.config.rivers = riversForCount(generateSettings.config, generateSettings.config.rivers.length);
  });
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
  seaWallSelect.className = "ce-generate-seawall";
  const seaWallOrder: WallCoastChoice[] = ["auto", "seaWall", "open", "opening"];
  for (const value of seaWallOrder) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = SEA_WALL_LABELS[value];
    seaWallSelect.appendChild(option);
  }
  seaWallSelect.value = generateSettings.config.wall.coast;
  seaWallSelect.title = editorText("cityEditor.messages.coastalDefencesIndependentOfCapitalOrCitadelStatusUseA");
  seaWallSelect.addEventListener("change", () => {
    generateSettings.config.wall.coast = seaWallSelect.value as WallCoastChoice;
    completeResult = null;
    clearGenerationPreviewCache();
  });
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
  wallMaterialSelect.className = "ce-generate-wall-material";
  for (const value of WALL_MATERIAL_CHOICES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = WALL_MATERIAL_LABELS[value];
    wallMaterialSelect.appendChild(option);
  }
  wallMaterialSelect.value = generateSettings.config.wall.material ?? "auto";
  wallMaterialSelect.title = editorText("cityEditor.messages.wallMaterialAutomaticUsesStoneForLargeCitiesAndWooden");
  wallMaterialSelect.addEventListener("change", () => {
    generateSettings.config.wall.material = wallMaterialSelect.value as WallMaterialChoice;
    completeResult = null;
    clearGenerationPreviewCache();
  });
  const riversSelect = select(["0", "1", "2"], String(generateSettings.config.rivers.length));
  riversSelect.addEventListener("change", () => {
    generateSettings.config.rivers = riversForCount(generateSettings.config, Number(riversSelect.value));
  });
  const riverPlacementSelect = select(
    ["through", "outsideNear", "outside"],
    generateSettings.riverPlacement ?? "through"
  );
  riverPlacementSelect.className = "ce-generate-river-placement";
  riverPlacementSelect.options[0].textContent = editorText("cityEditor.messages.throughTheCityDefault");
  riverPlacementSelect.options[1].textContent = editorText("cityEditor.messages.outsideCityWallsAbout12Cells");
  riverPlacementSelect.options[2].textContent = editorText("cityEditor.messages.outsideCityWallsAbout13Cells");
  riverPlacementSelect.title = editorText("cityEditor.messages.appliesWithOneRiverAndCityWallsEnabled");
  riverPlacementSelect.addEventListener("change", () => {
    generateSettings.riverPlacement = riverPlacementSelect.value as GenerationSettings["riverPlacement"];
    completeResult = null;
    clearGenerationPreviewCache();
  });
  const reliefInput = checkbox(generateSettings.config.relief, checked => {
    generateSettings.config.relief = checked;
  });
  const featureInputs = new Map<keyof CityFeatureSet, HTMLInputElement>();
  const featureGrid = div("ce-generate-features");
  for (const key of FEATURE_KEYS) {
    const input = checkbox(generateSettings.config.features[key], checked => {
      generateSettings.config.features[key] = checked;
    });
    featureInputs.set(key, input);
    featureGrid.appendChild(toggleLabel(editorOptionText(key), input));
  }
  const stageContainer = div("ce-generate-stages");
  const stageHeader = div("ce-generate-stage-header");
  const stageBadge = document.createElement("span");
  stageBadge.className = "ce-generate-stage-badge";
  const stageProgress = document.createElement("span");
  stageProgress.className = "ce-generate-stage-num";
  stageHeader.append(stageBadge, stageProgress);

  const stageHint = div("ce-generate-stage-hint");

  const stageSlider = document.createElement("input");
  stageSlider.type = "range";
  stageSlider.className = "ce-generate-stage-slider";
  stageSlider.min = "1";
  stageSlider.max = String(GENERATION_STAGES.length);
  stageSlider.step = "1";
  stageSlider.value = String(currentStageStep);
  stageSlider.setAttribute("aria-label", editorText("cityEditor.messages.generationStageSlider"));

  const stagePrevBtn = makeIconButton("◀", editorText("cityEditor.messages.previousGenerationStage"), () =>
    changeStageStep(-1)
  );
  stagePrevBtn.className += " ce-stage-prev";
  const stageNextBtn = makeIconButton("▶", editorText("cityEditor.messages.nextGenerationStage"), () =>
    changeStageStep(1)
  );
  stageNextBtn.className += " ce-stage-next";
  const stageSliderRow = div("ce-generate-slider-row");
  stageSliderRow.append(stagePrevBtn, stageSlider, stageNextBtn);

  stageContainer.append(stageHeader, stageSliderRow, stageHint);

  syncStageUi = (step: number) => {
    currentStageStep = step;
    const stage = generationStages(generateSettings).find(s => s.step === step);
    if (!stage) return;
    stageBadge.textContent = stage.label;
    stageBadge.dataset.i18nKey = stage.labelKey;
    stageHint.dataset.i18nKey = stage.hintKey;
    stageProgress.textContent = `${step}/${GENERATION_STAGES.length}`;
    stageHint.textContent = stage.hint;
    stageSlider.value = String(step);
    stagePrevBtn.disabled = step <= 1;
    stageNextBtn.disabled = step >= GENERATION_STAGES.length;
  };

  const changeStageStep = (delta: number) => {
    const target = Math.max(1, Math.min(GENERATION_STAGES.length, currentStageStep + delta));
    if (target !== currentStageStep) {
      setStageStep(target);
    }
  };

  const setStageStep = (step: number) => {
    const stage = generationStages(generateSettings).find(s => s.step === step);
    if (!stage) return;
    syncStageUi(step);
    runGenerationStage(stage);
  };

  stageSlider.addEventListener("input", () => {
    const step = Number(stageSlider.value);
    setStageStep(step);
  });

  syncStageUi(currentStageStep);

  // ③'s nPatches count cutoff (towngen-comparison.md §2.1) — the one tunable
  // knob among the generation processes so far; the ◀/▶ scrub below applies to all six.
  const urbanNPatchesInput = numberInput("", "1", "1");
  urbanNPatchesInput.className = "ce-generate-npatches";
  urbanNPatchesInput.placeholder = editorText("cityEditor.messages.automaticPlaceholder");
  urbanNPatchesInput.title = editorText("cityEditor.messages.cap3SFloodFillToTheFirstNCells");
  urbanNPatchesInput.addEventListener("change", () => {
    const raw = urbanNPatchesInput.value.trim();
    if (raw === "") {
      generateSettings.urbanNPatches = undefined;
      return;
    }
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 1) {
      urbanCoreModeSelect.value = generateSettings.urbanCoreMode ?? "legacy";
      urbanNPatchesInput.value = generateSettings.urbanNPatches != null ? String(generateSettings.urbanNPatches) : "";
      return;
    }
    generateSettings.urbanNPatches = n;
  });

  const urbanCoreModeSelect = select(["legacy", "compact"], generateSettings.urbanCoreMode ?? "legacy");
  urbanCoreModeSelect.options[0].textContent = editorText("cityEditor.messages.legacyIncludesOuterHousingBelt");
  urbanCoreModeSelect.options[1].textContent = editorText("cityEditor.messages.compactUrbanCoreOnly");
  urbanCoreModeSelect.addEventListener("change", () => {
    generateSettings.urbanCoreMode = urbanCoreModeSelect.value as "legacy" | "compact";
    completeResult = null;
    clearGenerationPreviewCache();
    completeResultSettings = null;
    rerunLastStage();
  });

  const walledShareInput = numberInput("", "5", "5");
  walledShareInput.max = "100";
  walledShareInput.className = "ce-generate-walled-share";
  walledShareInput.title = editorText("cityEditor.messages.allocateUrbanAreaAsAGuideToHousingCapacityLanes");
  walledShareInput.addEventListener("change", () => {
    const raw = walledShareInput.value.trim();
    const n = Number(raw);
    if (!raw) generateSettings.walledAreaShare = undefined;
    else if (Number.isFinite(n) && n >= 5 && n <= 100) generateSettings.walledAreaShare = n / 100;
    walledShareInput.value =
      generateSettings.walledAreaShare === undefined ? "" : String(generateSettings.walledAreaShare * 100);
  });
  // Old town + new wall (docs/plan/ce-multi-ring-walls.md). The walled share
  // then sizes the old town; the outer wall encloses the whole built-up area.
  const inferredHistoryWalls = () => {
    const descriptor = generateSettings.descriptor;
    return descriptor?.urbanMorphology && supportsUrbanMorphology(descriptor.urbanMorphology.period)
      ? inferredWallSettings(descriptor.urbanMorphology, descriptor.burg.dwellings)
      : null;
  };
  const townWallRingsValue = () =>
    (generateSettings.townWallRings ?? inferredHistoryWalls()?.townWallRings) !== "double"
      ? "single"
      : generateSettings.innerWallState === "razed"
        ? "razed"
        : "double";
  const townWallRingsSelect = select(["single", "double", "razed"], townWallRingsValue());
  townWallRingsSelect.className = "ce-generate-town-wall-rings";
  townWallRingsSelect.options[0].textContent = editorText("cityEditor.messages.townWallRingsSingle");
  townWallRingsSelect.options[1].textContent = editorText("cityEditor.messages.townWallRingsDouble");
  townWallRingsSelect.options[2].textContent = editorText("cityEditor.messages.townWallRingsRazed");
  const townWallBuildOrderSelect = select(
    ["outer-first", "inner-first"],
    generateSettings.townWallBuildOrder ?? "outer-first"
  );
  townWallBuildOrderSelect.className = "ce-generate-town-wall-build-order";
  townWallBuildOrderSelect.options[0].textContent = editorText("cityEditor.messages.townWallBuildOrderOuter");
  townWallBuildOrderSelect.options[1].textContent = editorText("cityEditor.messages.townWallBuildOrderInner");
  townWallBuildOrderSelect.disabled = townWallRingsValue() === "single";
  townWallBuildOrderSelect.addEventListener("change", () => {
    generateSettings.townWallBuildOrder = townWallBuildOrderSelect.value === "inner-first" ? "inner-first" : undefined;
    delete generateSettings.townWallDefensePolicy;
    completeResult = null;
    clearGenerationPreviewCache();
    completeResultSettings = null;
    syncStageUi(currentStageStep);
  });
  townWallRingsSelect.addEventListener("change", () => {
    const value = townWallRingsSelect.value;
    generateSettings.townWallRings = value === "single" ? (inferredHistoryWalls() ? "single" : undefined) : "double";
    generateSettings.innerWallState = value === "razed" ? "razed" : undefined;
    townWallBuildOrderSelect.disabled = value === "single";
    completeResult = null;
    clearGenerationPreviewCache();
    completeResultSettings = null;
    syncStageUi(currentStageStep);
  });
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

  if (!generateSettings.streets)
    generateSettings.streets = { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true };
  const streets = generateSettings.streets;
  const avoidSeaInput = checkbox(streets.avoidSea !== false, checked => {
    streets.avoidSea = checked;
  });
  avoidSeaInput.className = "ce-generate-avoidsea";
  avoidSeaInput.title = editorText("cityEditor.messages.keepRoadsWallsAndBuildingsOffTheWaterTowngenComparison");
  const FAR_NODE_MODES: { value: FarNodeMode; label: string }[] = [
    { value: "descriptorEnd", label: editorText("cityEditor.messages.descriptorEnd") },
    { value: "radial", label: editorText("cityEditor.messages.radial") },
    { value: "manualBearings", label: editorText("cityEditor.messages.manualBearings") }
  ];
  const farNodeSelect = document.createElement("select");
  farNodeSelect.className = "ce-generate-farnode";
  for (const mode of FAR_NODE_MODES) {
    const option = document.createElement("option");
    option.value = mode.value;
    option.textContent = mode.label;
    option.selected = mode.value === (streets.farNode ?? "descriptorEnd");
    farNodeSelect.appendChild(option);
  }
  const bearingsInput = document.createElement("input");
  bearingsInput.type = "text";
  bearingsInput.className = "ce-generate-bearings";
  bearingsInput.placeholder = "90, 180, 270";
  bearingsInput.title = editorText("cityEditor.messages.commaSeparatedCompassBearingsDegreesForEachLandGate");
  const bearingsLabel = label(editorText("cityEditor.messages.manualBearings"), bearingsInput);
  const syncBearingsRow = (): void => {
    bearingsLabel.style.display = farNodeSelect.value === "manualBearings" ? "" : "none";
  };
  farNodeSelect.addEventListener("change", () => {
    streets.farNode = farNodeSelect.value as FarNodeMode;
    syncBearingsRow();
  });
  bearingsInput.addEventListener("change", () => {
    const parsed = bearingsInput.value
      .split(/[,\s]+/)
      .map(s => Number(s))
      .filter(n => Number.isFinite(n));
    streets.manualBearings = parsed.length ? parsed.map(n => ((n % 360) + 360) % 360) : undefined;
    bearingsInput.value = streets.manualBearings?.map(n => String(n)).join(", ") ?? "";
  });
  syncBearingsRow();

  // One shared ◀/▶ scrub for whichever of the generation processes was last activated
  // (pressing its stage button, or ◀/▶ itself) — towngen-comparison.md's
  // per-loop verification tool, generalised from ③ to the other processes.
  const stepStatus = document.createElement("output");
  stepStatus.className = "ce-generate-step-status";
  const stepPrevButton = makeIconButton("◀", editorText("cityEditor.messages.previousStep"), () => runStep(-1));
  const stepNextButton = makeIconButton("▶", editorText("cityEditor.messages.nextStep"), () => runStep(1));
  const stepRow = div("ce-icon-row");
  stepRow.append(stepPrevButton, stepStatus, stepNextButton);

  const blockMeshInput = checkbox(false, checked => {
    showBlockMesh = checked;
    if (!checked && tool !== "select") {
      tool = "select";
    }
    refresh();
  });

  const gridLinesInput = checkbox(false, checked => {
    showGridLines = checked;
    redrawMap();
  });

  const coreLayerInput = checkbox(true, () => redrawMap());
  const regionalLayerInput = checkbox(true, () => redrawMap());
  const renderQualitySelect = select(["auto", "detailed", "light", "minimal"], "auto");
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
  renderQualitySelect.addEventListener("change", () => redrawMap());
  const renderQualityHelp = text(
    editorText("cityEditor.messages.lightweightRenderingOmitsFieldRowsAndPlantingDetailsMinimalRendering")
  );

  const meshToggleRow = div("ce-icon-row");
  meshToggleRow.append(
    toggleLabel(editorText("cityEditor.messages.blockEditingView"), blockMeshInput),
    toggleLabel(editorText("cityEditor.messages.showGridLines"), gridLinesInput)
  );

  const importedBox = div("ce-imported");
  const importedHeading = text(editorText("cityEditor.fmgParameters.title"));
  importedHeading.dataset.i18nKey = "cityEditor.fmgParameters.title";
  const importedText = div("ce-imported-body");
  const standaloneButton = makeButton(editorText("cityEditor.messages.useStandaloneSite"), () => useStandaloneSite());
  importedBox.append(importedHeading, importedText, standaloneButton);
  importedBox.hidden = true;

  const seedInput = document.createElement("input");
  seedInput.type = "text";
  seedInput.className = "ce-generate-seed";
  seedInput.spellcheck = false;
  seedInput.value = generateSeed;
  seedInput.addEventListener("input", () => {
    generateSeed = seedInput.value;
  });
  seedInput.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!generateSeed.trim()) generateSeed = randomSeed();
    seedInput.value = generateSeed;
    runCompleteGeneration();
  });
  const seedLabel = label(editorText("cityEditor.messages.seed"), seedInput);
  const copyLinkButton = makeButton(
    editorText("cityEditor.messages.copyShareableLink"),
    () => void copyShareLink(copyLinkButton)
  );

  const moatInputs = new Map<"town" | "castle", HTMLInputElement>();
  const moatControls = div("ce-moat-settings");
  for (const scope of ["town", "castle"] as const) {
    const input = checkbox(!!generateSettings.moats?.[scope], checked => {
      generateSettings.moats = { ...generateSettings.moats, [scope]: checked };
      completeResult = null;
      clearGenerationPreviewCache();
      runContextAction(() => {
        const next = structuredClone(documentState);
        if (next.fabric?.generation)
          next.fabric.generation.settings.moats = { ...next.fabric.generation.settings.moats, [scope]: checked };
        for (const circuit of next.defenseCircuits ?? []) {
          if (circuit.scope === scope && !circuit.locked)
            circuit.moat = { enabled: checked, widthMeters: circuit.moat?.widthMeters ?? (scope === "town" ? 12 : 8) };
        }
        return next;
      }, editorOptionText("moat"));
    });
    input.className = `ce-moat-${scope}`;
    moatInputs.set(scope, input);
    moatControls.append(
      toggleLabel(
        scope === "town"
          ? editorText("cityEditor.messages.townWallOuterMoat")
          : editorText("cityEditor.messages.citadelOuterMoat"),
        input
      )
    );
  }

  const castleControls = div("ce-castle-settings");
  const castleInputs = new Map<keyof CastleSettings, HTMLSelectElement>();
  const castleChoices: Array<[keyof CastleSettings, string, string[]]> = [
    ["position", editorText("cityEditor.messages.castlePosition"), ["auto", "edge", "central"]],
    ["relationship", editorText("cityEditor.messages.relationshipToTownWalls"), ["auto", "integrated", "detached"]],
    ["form", editorText("cityEditor.messages.castleForm"), ["auto", "keep-bailey", "courtyard"]],
    ["size", editorText("cityEditor.messages.castleSize"), ["auto", "small", "standard", "large"]],
    ["style", editorText("cityEditor.messages.castleStyle"), ["auto", ...Object.keys(CASTLE_STYLE_PROFILES)]]
  ];
  for (const [key, title, choices] of castleChoices) {
    const input = select(choices, generateSettings.castle?.[key] ?? DEFAULT_CASTLE_SETTINGS[key] ?? "auto");
    const titles: Record<string, string> = {
      get auto() {
        return editorText("cityEditor.messages.automaticPeriodAndCulture");
      },
      get edge() {
        return editorText("cityEditor.messages.edgeOfTheCity");
      },
      get central() {
        return editorText("cityEditor.messages.cityCentre");
      },
      get integrated() {
        return editorText("cityEditor.messages.integratedWithTownWalls");
      },
      get detached() {
        return editorText("cityEditor.messages.detachedEnclosure");
      },
      "keep-bailey": editorText("cityEditor.messages.keepAndCourtyard"),
      get courtyard() {
        return editorText("cityEditor.messages.residenceAroundACourtyard");
      },
      get small() {
        return editorText("cityEditor.messages.smallShipSvg");
      },
      get standard() {
        return editorText("cityEditor.messages.standard");
      },
      get large() {
        return editorText("cityEditor.messages.largeShipSvg");
      },
      ...Object.fromEntries(Object.entries(CASTLE_STYLE_PROFILES).map(([k, p]) => [k, p.label]))
    };
    for (const option of input.options) option.textContent = titles[option.value] ?? option.value;
    castleInputs.set(key, input);
    input.addEventListener("change", () => {
      generateSettings.castle = { ...generateSettings.castle, [key]: input.value };
      if (generateSettings.castle.position === "central" && generateSettings.castle.relationship === "integrated")
        generateSettings.castle.relationship = "detached";
      generateSettings.legacyCastles = false;
      syncGenerateControls();
    });
    castleControls.append(label(title, input));
  }
  const synthControls = div("ce-generate-synth");
  synthControls.append(
    label(editorText("cityEditor.messages.cityLayout"), layoutSelect),
    label(editorText("cityEditor.messages.buildingGeneration"), buildingPatternSelect),
    label(editorText("cityEditor.messages.coast"), coastSelect),
    label(editorText("cityEditor.messages.rivers"), riversSelect),
    label(editorText("cityEditor.messages.riverPlacement"), riverPlacementSelect),
    toggleLabel(editorText("cityEditor.messages.reliefHilltop"), reliefInput),
    text(editorText("cityEditor.messages.features")),
    featureGrid,
    makeButton(editorText("cityEditor.messages.randomizeGeography"), () => {
      generateSettings.config = randomGeography();
      generateSeed = randomSeed();
      syncGenerateControls();
      stepIndex = -1;
      rerunLastStage();
      showNotice(editorText("cityEditor.messages.geographyRandomized"));
    })
  );

  generatePanel.content.append(
    generationProgress,
    cancelGeneration,
    toggleLabel(editorText("cityEditor.messages.debugShowGenerationFailurePreview"), failureDebugInput),
    failureDebugSummary,
    closeFailurePreview,
    makeButton(editorText("cityEditor.messages.generateCompleteCity"), () => runCompleteGeneration()),
    makeButton(editorText("cityEditor.messages.newCity"), () => rollNewTown()),
    copyLinkButton,
    seedLabel,
    meshToggleRow,
    label(editorText("cityEditor.messages.renderQuality"), renderQualitySelect),
    renderQualityHelp,
    toggleLabel(editorText("cityEditor.messages.showUrbanCore"), coreLayerInput),
    toggleLabel(editorText("cityEditor.messages.showFMGSurroundings"), regionalLayerInput),
    divider(),
    importedBox,
    synthControls,
    label(editorText("cityEditor.messages.wallMaterial"), wallMaterialSelect),
    label(editorText("cityEditor.messages.coastalWalls"), seaWallSelect),
    castleControls,
    moatControls,
    label(editorText("cityEditor.messages.townWallRings"), townWallRingsSelect),
    label(editorText("cityEditor.messages.townWallBuildOrder"), townWallBuildOrderSelect),
    label(editorText("cityEditor.messages.urbanAreaInsideWalls"), walledShareInput),
    text(editorText("cityEditor.messages.blankUsesTinySmall100Medium45Large20Approximate")),
    housingSummary,
    divider(),
    text(editorText("cityEditor.messages.completeGenerationBuildsWallsStreetsAndBuildingsUseTheSlider")),
    text(editorText("cityEditor.generationStages.title")),
    stageContainer,
    divider(),
    label(editorText("cityEditor.messages.urbanCoreAllocationMode"), urbanCoreModeSelect),
    label(editorText("cityEditor.messages.3NPatchesBlankAuto"), urbanNPatchesInput),
    toggleLabel(editorText("cityEditor.messages.avoidSea"), avoidSeaInput),
    label(editorText("cityEditor.messages.streetFarEnd"), farNodeSelect),
    bearingsLabel,
    text(editorText("cityEditor.messages.stepThroughTheLastPressedProcessOneLoopIterationAt")),
    stepRow
  );
  syncGenerateControls();

  map.addEventListener("pointerdown", event => {
    hideContextMenu();
    // A wheel-zoom just before this click may still be waiting on its frame;
    // hit-testing below reads the SVG, so settle it first.
    flushRedraw();
    if (event.button === 1 || (event.button === 0 && isSpacePressed)) {
      event.preventDefault();
      isPanning = true;
      hasPanned = false;
      lastPanX = event.clientX;
      lastPanY = event.clientY;
      map.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const point = localPoint(event);
    if (documentState.sceneRegions && !pointInPolygon(point, documentState.sceneRegions.coreBoundary)) return;
    if (tool === "wardWall") {
      event.preventDefault();
      circularWallStroke = {
        center: point,
        centerClient: { clientX: event.clientX, clientY: event.clientY },
        radiusMeters: 0
      };
      updateCircularWallPreview(event);
      suppressNextClick = true;
      map.setPointerCapture(event.pointerId);
      return;
    }
    if (isPaintBrushTool(tool)) {
      if (!canPaintAtPoint(point)) return;
      event.preventDefault();
      isWardPainting = true;
      wardPaintChanged = false;
      edgePaintChanged = false;
      paintedWardFaceIds = new Set();
      paintedEdgeIds = new Set();
      paintCellsAtPoint(point);
      suppressNextClick = true;
      map.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "junction") {
      event.preventDefault();
      isJunctionPainting = true;
      junctionPaintChanged = false;
      optimizeJunctionsAtPoint(point);
      suppressNextClick = true;
      map.setPointerCapture(event.pointerId);
      return;
    }
    if (isRoutePaintTool(tool)) {
      const edgeId = closestMeshEdgeId(point, 18);
      if (edgeId) {
        const connection = routeEndpointOnEdge(tool, edgeId, point);
        event.preventDefault();
        routeStroke = {
          kind: tool,
          initialEdgeId: edgeId,
          groupId: connection?.groupId ?? null,
          endpointId: connection?.vertexId ?? null,
          initialized: false,
          startPoint: point,
          lastPoint: point,
          changed: false,
          committed: false
        };
        suppressNextClick = true;
        map.setPointerCapture(event.pointerId);
        return;
      }
    }
    if (tool === "select") {
      const targetEl = event.target instanceof Element ? event.target : null;
      const shipHandle = targetEl?.closest<SVGElement>("[data-ship-handle='rotate']");
      if (shipHandle) {
        const shipId = shipHandle.getAttribute("data-ship-id");
        const ship = documentState.elements.find(e => e.id === shipId && e.kind === "ship");
        if (ship?.point && !ship.locked) {
          event.preventDefault();
          shipDragBefore = clone(documentState);
          shipDrag = {
            shipId: ship.id,
            mode: "rotate",
            startPoint: point,
            initialShipPoint: [...ship.point],
            initialRotation: ship.rotation ?? 0,
            moved: false
          };
          map.setPointerCapture(event.pointerId);
          suppressNextClick = true;
          return;
        }
      }

      const shipPick = targetEl?.closest<SVGElement>(".ce-ship[data-pick]");
      if (shipPick) {
        const rawPick = shipPick.getAttribute("data-pick");
        const info = parsePickInfo(rawPick);
        if (info && info.kind === "ship") {
          const shipId = String(info.id);
          const ship = documentState.elements.find(e => e.id === shipId);
          if (ship?.point) {
            selection = {
              faceId: null,
              edgeId: null,
              vertexId: null,
              groupId: null,
              inspectedId: ship.id
            };
            inspectedInfo = info;
            activeGroupId = null;
            if (!ship.locked) {
              event.preventDefault();
              shipDragBefore = clone(documentState);
              shipDrag = {
                shipId: ship.id,
                mode: "move",
                startPoint: point,
                initialShipPoint: [...ship.point],
                initialRotation: ship.rotation ?? 0,
                moved: false
              };
              map.setPointerCapture(event.pointerId);
              suppressNextClick = true;
            }
            refresh();
            return;
          }
        }
      }

      const nearestVertexId = closestVertexId(point);
      const v = nearestVertexId ? documentState.mesh.vertices[nearestVertexId] : null;
      const vDist = v ? Math.hypot(v.point[0] - point[0], v.point[1] - point[1]) : Number.POSITIVE_INFINITY;
      const vertexGrabRadius = routeHitRadius(14);

      if (nearestVertexId && v && vDist <= vertexGrabRadius) {
        event.preventDefault();
        dragBefore = clone(documentState);
        isVertexDragging = true;
        dragMergeCandidateId = null;
        selection = {
          faceId: null,
          edgeId: null,
          groupId: null,
          vertexId: nearestVertexId,
          inspectedId: nearestVertexId
        };
        activeGroupId = null;
        inspectedInfo = {
          layer: "vertices",
          kind: "vertex",
          id: nearestVertexId,
          label: editorText("cityEditor.messages.vertexIdentifier", { value0: nearestVertexId }),
          point: v.point
        };
        map.setPointerCapture(event.pointerId);
        return;
      }

      const route = routeAtEvent(event, point, true, true);
      if (route) {
        event.preventDefault();
        const routeGroup = documentState.featureGroups.find(g => g.id === route.groupId);
        if (routeGroup) {
          activeGroupId = routeGroup.id;
          selection = {
            faceId: null,
            vertexId: null,
            groupId: routeGroup.id,
            edgeId: route.edgeId,
            inspectedId: routeGroup.id
          };
          inspectedInfo = {
            layer: "features",
            kind: routeGroup.kind,
            id: routeGroup.id,
            label: `${routeGroup.kind} (${routeGroup.name})`,
            name: routeGroup.name,
            selectedEdgeId: route.edgeId,
            locked: routeGroup.locked,
            widthMeters: routeGroup.style.widthMeters,
            color: routeGroup.style.color,
            segmentCount: routeGroup.kind === "river" ? routeGroup.vertices.length : routeGroup.segments.length
          };
          if (!routeGroup.locked) {
            routeDrag = { ...route, startX: event.clientX, startY: event.clientY, moved: false };
          }
          map.setPointerCapture(event.pointerId);
          return;
        }
      }
    }

    const vertexId = targetId(event, "vertex") ?? (tool === "vertex" ? closestVertexId(point) : null);
    if (vertexId && tool === "vertex") {
      event.preventDefault();
      selection = { ...selection, vertexId, faceId: null, edgeId: null, groupId: null, inspectedId: vertexId };
      activeGroupId = null;
      const v = documentState.mesh.vertices[vertexId];
      if (v) {
        inspectedInfo = {
          layer: "vertices",
          kind: "vertex",
          id: vertexId,
          label: editorText("cityEditor.messages.vertexIdentifier", { value0: vertexId }),
          point: v.point
        };
      }
      suppressNextClick = true;
      refresh();
      return;
    }
  });
  map.addEventListener("dragover", event => {
    event.preventDefault();
    map.classList.add("ce-map--drop-target");
  });
  map.addEventListener("dragleave", () => map.classList.remove("ce-map--drop-target"));
  map.addEventListener("drop", event => {
    event.preventDefault();
    map.classList.remove("ce-map--drop-target");
    void importMapFile(event.dataTransfer?.files[0]);
  });
  map.addEventListener("pointermove", event => {
    if (shipDrag) {
      const point = localPoint(event);
      if (Math.hypot(point[0] - shipDrag.startPoint[0], point[1] - shipDrag.startPoint[1]) > 0.5) {
        shipDrag.moved = true;
        suppressNextClick = true;
      }
      if (shipDrag.mode === "move") {
        const dx = point[0] - shipDrag.startPoint[0];
        const dy = point[1] - shipDrag.startPoint[1];
        const nextPoint: Point = [shipDrag.initialShipPoint[0] + dx, shipDrag.initialShipPoint[1] + dy];
        documentState = {
          ...documentState,
          elements: documentState.elements.map(e => (e.id === shipDrag!.shipId ? { ...e, point: nextPoint } : e))
        };
      } else if (shipDrag.mode === "rotate") {
        const nextAngle = getShipAngleFromPoint(shipDrag.initialShipPoint, point);
        documentState = {
          ...documentState,
          elements: documentState.elements.map(e => (e.id === shipDrag!.shipId ? { ...e, rotation: nextAngle } : e))
        };
        shipAngleDegrees = Math.round((nextAngle * 180) / Math.PI);
      }
      scheduleRedraw();
      return;
    }
    if (tool === "landmark" && !isPanning) {
      landmarkHoverPoint = localPoint(event);
      updateLandmarkPreview();
      return;
    }
    if (tool === "ship" && !isPanning) {
      shipHoverPoint = localPoint(event);
      updateShipPreview();
      return;
    }
    if (tool === "wardWall" || circularWallStroke) updateCircularWallPreview(event);
    if (circularWallStroke) return;
    if (isBrushTool(tool)) updateWardBrushPreview(event);
    if (isWardPainting) {
      paintCellsAtPoint(localPoint(event));
      return;
    }
    if (isJunctionPainting) {
      optimizeJunctionsAtPoint(localPoint(event));
      return;
    }
    if (routeStroke) {
      extendRouteStroke(localPoint(event));
      return;
    }
    if (routeDrag) {
      if (Math.abs(event.clientX - routeDrag.startX) > 2 || Math.abs(event.clientY - routeDrag.startY) > 2)
        routeDrag.moved = true;
      const faceId = faceAtPoint(localPoint(event));
      if (faceId !== routePreviewFaceId) {
        routePreviewFaceId = faceId;
        routePreview = faceId
          ? previewRouteAcrossFace(documentState, routeDrag.groupId, faceId, { edgeId: routeDrag.edgeId })
          : null;
        updateRoutePreview();
      }
      return;
    }
    if (isVertexDragging && selection.vertexId) {
      const point = localPoint(event);
      const next = moveVertex(documentState, selection.vertexId, point, !!failureRenderContext);
      if (!next) return;
      documentState = next;
      if (inspectedInfo?.kind === "vertex")
        inspectedInfo = { ...inspectedInfo, point: next.mesh.vertices[selection.vertexId].point };
      dragMergeCandidateId = closestMergeCandidate(selection.vertexId);
      selection.hoverVertexId = dragMergeCandidateId;
      scheduleRedraw();
      suppressNextClick = true;
      return;
    }
    if (!isPanning) updateHover(event);
    if (!isPanning) return;
    const dx = event.clientX - lastPanX;
    const dy = event.clientY - lastPanY;
    if (!hasPanned && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      hasPanned = true;
      suppressNextClick = true;
      map.classList.add("ce-map--panning");
      map.setPointerCapture(event.pointerId);
    }
    if (!hasPanned) return;
    const point = localPoint(event);
    const previous = localPointAt(lastPanX, lastPanY);
    viewCenter = [viewCenter[0] - (point[0] - previous[0]), viewCenter[1] - (point[1] - previous[1])];
    lastPanX = event.clientX;
    lastPanY = event.clientY;
    updateViewport();
  });
  map.addEventListener("pointerleave", () => {
    if (!isWardPainting && !isJunctionPainting) hideWardBrushPreview();
    if (!circularWallStroke) hideCircularWallPreview();
  });
  const finishDrag = (event: PointerEvent): void => {
    if (shipDrag) {
      const wasMoved = shipDrag.moved;
      const dragMode = shipDrag.mode;
      const before = shipDragBefore;
      shipDrag = null;
      shipDragBefore = null;
      if (map.hasPointerCapture(event.pointerId)) map.releasePointerCapture(event.pointerId);
      if (wasMoved && before) {
        commit(
          documentState,
          dragMode === "move"
            ? editorText("cityEditor.messages.moveShip")
            : editorText("cityEditor.messages.rotateShip")
        );
      } else {
        refresh();
      }
      return;
    }
    if (
      !isVertexDragging &&
      !isWardPainting &&
      !isJunctionPainting &&
      !circularWallStroke &&
      !isPanning &&
      !routeDrag &&
      !routeStroke
    )
      return;
    const wasVertexDragging = isVertexDragging;
    const vertexMoved = Boolean(
      wasVertexDragging && dragBefore && JSON.stringify(dragBefore) !== JSON.stringify(documentState)
    );
    const wasWardPainting = isWardPainting;
    const wasJunctionPainting = isJunctionPainting;
    const circle = circularWallStroke;
    const mergeCandidateId = dragMergeCandidateId;
    const stroke = routeStroke;
    const draggedRoute = routeDrag;
    const preview = routePreview;
    const previewFaceId = routePreviewFaceId;
    isVertexDragging = false;
    isWardPainting = false;
    isJunctionPainting = false;
    circularWallStroke = null;
    routeStroke = null;
    routeDrag = null;
    routePreview = null;
    routePreviewFaceId = null;
    updateRoutePreview();
    isPanning = false;
    hasPanned = false;
    dragMergeCandidateId = null;
    map.classList.remove("ce-map--panning");
    if (map.hasPointerCapture(event.pointerId)) map.releasePointerCapture(event.pointerId);
    if (event.type !== "pointercancel" && wasVertexDragging && selection.vertexId && mergeCandidateId) {
      const merged = mergeVertices(documentState, selection.vertexId, mergeCandidateId);
      if (merged) documentState = merged;
    }
    if (wasVertexDragging && vertexMoved) {
      history.commit(
        documentState,
        mergeCandidateId
          ? editorText("cityEditor.messages.mergeVertices")
          : editorText("cityEditor.messages.moveVertex")
      );
      rememberFailureGenerationState();
      rebuildEditorIndexes();
    }
    selection.hoverVertexId = null;
    if (wasWardPainting && wardPaintChanged) {
      history.commit(documentState, paintHistoryLabel());
      rememberFailureGenerationState();
      if (edgePaintChanged) rebuildEditorIndexes();
    }
    if (wasJunctionPainting && junctionPaintChanged) {
      history.commit(documentState, editorText("cityEditor.messages.cleanJunctions"));
      rememberFailureGenerationState();
      rebuildEditorIndexes();
    }
    if (circle && event.type !== "pointercancel") {
      const next = encloseCircleWithWalls(documentState, circle.center, circle.radiusMeters);
      if (next) commit(next, editorText("cityEditor.messages.circularWardWall"));
      else showNotice(editorText("cityEditor.messages.drawACircleOverAtLeastOneCityCellTo"));
    }
    if (stroke) {
      if (event.type !== "pointercancel") finishRouteStroke(stroke, localPoint(event));
    }
    dragBefore = null;
    paintedWardFaceIds.clear();
    paintedEdgeIds.clear();
    if (draggedRoute) {
      suppressNextClick = true;
      if (event.type !== "pointercancel" && draggedRoute.moved && preview && previewFaceId) {
        selection.vertexId = null;
        selection.edgeId = null;
        const next = rerouteGroupAcrossFace(documentState, draggedRoute.groupId, previewFaceId, {
          edgeId: draggedRoute.edgeId
        });
        if (next) commit(next, editorText("cityEditor.messages.rerouteAcrossCell"));
      }
      if (draggedRoute.moved) {
        selection.vertexId = null;
        selection.edgeId = null;
      }
    }
    if (wasVertexDragging) {
      suppressNextClick = true;
      if (!vertexMoved) {
        const point = localPoint(event);
        const route = routeAtEvent(event, point, true, true);
        if (route) {
          const routeGroup = documentState.featureGroups.find(g => g.id === route.groupId);
          if (routeGroup) {
            activeGroupId = routeGroup.id;
            selection = {
              faceId: null,
              vertexId: null,
              groupId: routeGroup.id,
              edgeId: route.edgeId,
              inspectedId: routeGroup.id
            };
            inspectedInfo = {
              layer: "features",
              kind: routeGroup.kind,
              id: routeGroup.id,
              label: `${routeGroup.kind} (${routeGroup.name})`,
              name: routeGroup.name,
              selectedEdgeId: route.edgeId,
              locked: routeGroup.locked,
              widthMeters: routeGroup.style.widthMeters,
              color: routeGroup.style.color,
              segmentCount: routeGroup.kind === "river" ? routeGroup.vertices.length : routeGroup.segments.length
            };
          }
        }
      }
    }
    if (event.type === "pointercancel") suppressNextClick = false;
    // Cell-only painting patches its faces live. Edge erasing changes route
    // groups, so it needs one full redraw once the stroke is complete.
    if (wasWardPainting) {
      if (edgePaintChanged || documentState.fixedCrossingApproaches !== undefined) refresh();
      else refreshUiOnly();
    } else if (wasVertexDragging || wasJunctionPainting || circle || stroke || draggedRoute) refresh();
  };
  map.addEventListener("pointerup", finishDrag);
  map.addEventListener("pointercancel", finishDrag);
  map.addEventListener(
    "click",
    event => {
      if (!suppressNextClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = false;
    },
    true
  );
  map.addEventListener("click", event => {
    if (
      documentState.sceneRegions &&
      tool !== "select" &&
      !pointInPolygon(localPoint(event as PointerEvent), documentState.sceneRegions.coreBoundary)
    )
      return;
    if (tool === "landmark") {
      const asset = selectedLandmarkAsset();
      if (!asset) {
        showNotice(editorText("cityEditor.messages.loadALandmarkAssetFirst"));
        return;
      }
      const result = placeLandmark(
        documentState,
        asset,
        {
          id: `landmark-${crypto.randomUUID()}`,
          position: localPoint(event as PointerEvent),
          rotation: (landmarkRotationDegrees * Math.PI) / 180,
          scale: 1
        },
        preservedLandmarkLanes()
      );
      if (result.document) {
        commit(result.document, editorText("cityEditor.messages.placeCityEditorPage", { value0: asset.name }));
        landmarkHoverPoint = null;
      } else showNotice(result.reasons.join("; "));
      return;
    }
    if (tool === "ship") {
      const p = localPoint(event as PointerEvent);
      const newElement: CityElement = {
        id: `ship-${crypto.randomUUID()}`,
        kind: "ship",
        shipType,
        faceIds: [],
        point: p,
        sizeMeters: shipSizeMeters,
        rotation: (shipAngleDegrees * Math.PI) / 180,
        locked: false
      };
      commit(
        { ...documentState, elements: [...documentState.elements, newElement] },
        editorText("cityEditor.messages.placeCityEditorPage", { value0: SHIP_SPECS[shipType].label })
      );
      return;
    }
    let target = event.target instanceof Element ? event.target : null;
    if (target === map || target?.tagName.toLowerCase() === "svg") {
      const under =
        typeof document.elementFromPoint === "function"
          ? document.elementFromPoint(event.clientX, event.clientY)
          : null;
      if (under && map.contains(under) && under !== map) {
        target = under;
      }
    }
    const pickHost = target?.closest<SVGElement>("[data-pick]");
    const selectedPick = pickHost && map.contains(pickHost) ? pickHost : null;

    if (tool === "select") {
      const point = localPoint(event as PointerEvent);
      const activeGroup = activeGroupId ? documentState.featureGroups.find(group => group.id === activeGroupId) : null;
      const edgeId = targetId(event, "edge");
      if (
        edgeId &&
        activeGroup &&
        !activeGroup.locked &&
        activeGroup.kind !== "river" &&
        !groupUsesEdge(documentState, activeGroup, edgeId)
      ) {
        const next = appendEdge(documentState, activeGroup.id, edgeId);
        if (next) {
          commit(next, editorText("cityEditor.messages.extend", { value0: activeGroup.name }));
          return;
        }
      }

      // A building is an explicit district selection, even near a wide street.
      const pickedBuilding = selectedPick?.classList.contains("ce-building") ?? false;
      const route = routeAtEvent(event, point, !pickedBuilding, true);
      if (route) {
        const routeGroup = documentState.featureGroups.find(g => g.id === route.groupId);
        if (routeGroup) {
          activeGroupId = routeGroup.id;
          inspectedInfo = {
            layer: "features",
            kind: routeGroup.kind,
            id: routeGroup.id,
            label: `${routeGroup.kind} (${routeGroup.name})`,
            name: routeGroup.name,
            selectedEdgeId: route.edgeId,
            locked: routeGroup.locked,
            widthMeters: routeGroup.style.widthMeters,
            color: routeGroup.style.color,
            segmentCount: routeGroup.kind === "river" ? routeGroup.vertices.length : routeGroup.segments.length
          };
          applySelection({
            faceId: null,
            vertexId: null,
            groupId: routeGroup.id,
            edgeId: route.edgeId,
            inspectedId: routeGroup.id
          });
          return;
        }
      }

      if (selectedPick) {
        const rawPick = selectedPick.getAttribute("data-pick");
        const info = parsePickInfo(rawPick);
        if (info) {
          inspectedInfo = info;
          const infoId = (info.id ?? null) as Id | null;
          if (info.layer === "cells" || info.kind === "cell") {
            activeGroupId = null;
            applySelection({
              ...selection,
              faceId: infoId,
              edgeId: null,
              vertexId: null,
              groupId: null,
              inspectedId: infoId
            });
            return;
          } else if (info.layer === "buildings" || info.kind === "building") {
            const faceId = (info.faceId as Id) ?? null;
            activeGroupId = null;
            applySelection({ ...selection, faceId, edgeId: null, vertexId: null, groupId: null, inspectedId: infoId });
            return;
          } else if (info.layer === "features") {
            activeGroupId = infoId;
            applySelection({
              ...selection,
              groupId: infoId,
              faceId: null,
              edgeId: null,
              vertexId: null,
              inspectedId: infoId
            });
            return;
          } else if (info.layer === "edges" || info.kind === "edge") {
            applySelection({ ...selection, edgeId: infoId, faceId: null, vertexId: null, inspectedId: infoId });
            return;
          } else if (info.layer === "vertices" || info.kind === "vertex") {
            activeGroupId = null;
            applySelection({
              ...selection,
              vertexId: infoId,
              faceId: null,
              edgeId: null,
              groupId: null,
              inspectedId: infoId
            });
            return;
          } else if (info.layer === "gates" || info.kind === "gate") {
            const vertexId = (info.vertexId as Id) ?? null;
            const wallId = (info.wallId as Id) ?? null;
            activeGroupId = wallId;
            applySelection({
              ...selection,
              vertexId,
              faceId: null,
              edgeId: null,
              groupId: wallId,
              inspectedId: infoId
            });
            return;
          } else if (info.layer === "fortifications" || info.kind === "tower") {
            const wallId = (info.wallId as Id) ?? null;
            activeGroupId = wallId;
            applySelection({
              ...selection,
              faceId: null,
              edgeId: null,
              vertexId: null,
              groupId: wallId,
              inspectedId: infoId
            });
            return;
          } else {
            applySelection({ ...selection, inspectedId: infoId });
            return;
          }
        }
      }

      inspectedInfo = null;
      activeGroupId = null;
      applySelection({ faceId: null, edgeId: null, vertexId: null, groupId: null, inspectedId: null });
      return;
    }

    const vertexId = targetId(event, "vertex");
    const edgeId = targetId(event, "edge");
    const faceId = targetId(event, "face");
    const groupId = targetId(event, "group");
    if (groupId) {
      selection.groupId = groupId;
      activeGroupId = groupId;
      tool = "select";
      refresh();
      return;
    }
    const activeGroup = activeGroupId ? documentState.featureGroups.find(group => group.id === activeGroupId) : null;
    if (edgeId && activeGroup && !activeGroup.locked && activeGroup.kind !== "plank" && tool === activeGroup.kind) {
      if (groupUsesEdge(documentState, activeGroup, edgeId)) {
        selection = { ...selection, edgeId, faceId: null, vertexId: null };
        refresh();
        return;
      }
      if (activeGroup.kind !== "river") {
        const next = appendEdge(documentState, activeGroup.id, edgeId);
        if (next) commit(next, editorText("cityEditor.messages.extend", { value0: activeGroup.name }));
        else showNotice(editorText("cityEditor.messages.chooseAnUnusedEdgeBesideARouteEndpoint"));
        return;
      }
    }
    if (tool === "river" && vertexId) {
      appendSelectedRiverVertex(vertexId);
      return;
    }
    if ((tool === "road" || tool === "wall") && edgeId) {
      appendSelectedEdge(edgeId, tool);
      return;
    }
    if (faceId) selection = { ...selection, faceId, edgeId: null, vertexId: null };
    else if (edgeId) selection = { ...selection, edgeId, faceId: null, vertexId: null };
    else if (vertexId) selection = { ...selection, vertexId, faceId: null, edgeId: null };
    refresh();
  });
  map.addEventListener("contextmenu", event => {
    event.preventDefault();
    flushRedraw();
    if (documentState.sceneRegions && !pointInPolygon(localPoint(event), documentState.sceneRegions.coreBoundary))
      return;
    const isSelectTool = tool === "select";
    const faceId = targetId(event, "face") ?? faceAtPoint(localPoint(event));
    const vertexId = targetId(event, "vertex") ?? (isSelectTool ? closestVertexId(localPoint(event)) : null);
    const edgeId = targetId(event, "edge");
    const groupId = targetId(event, "group");
    const actions: ContextMenuAction[] = [];

    // A vertex context click is also an explicit vertex selection. Without
    // this, the Inspector keeps a previous face or route selection and cannot
    // offer the wall-gate action for the vertex under the pointer.
    if (vertexId) {
      selection = { ...selection, vertexId, faceId: null, edgeId: null, groupId: null };
      activeGroupId = null;
      if (!isSelectTool) tool = "vertex";
      refresh();
    }

    if (isSelectTool && vertexId && vertexHasWallPassage(documentState, vertexId)) {
      const gate = documentState.gates.find(candidate => candidate.vertexId === vertexId);
      actions.push({
        label: gate ? editorText("cityEditor.messages.deleteGate") : editorText("cityEditor.messages.drawGate"),
        run: () =>
          runContextAction(
            () => toggleGate(documentState, vertexId),
            gate ? editorText("cityEditor.messages.deleteGate") : editorText("cityEditor.messages.drawGate")
          )
      });
    }

    const activeGroup = activeGroupId ? documentState.featureGroups.find(group => group.id === activeGroupId) : null;
    const routeGroup = groupId ? documentState.featureGroups.find(group => group.id === groupId) : activeGroup;
    const routeEdgeId =
      routeGroup && edgeId && groupUsesEdge(documentState, routeGroup, edgeId)
        ? edgeId
        : routeGroup && groupId
          ? closestGroupEdgeId(routeGroup, localPointAt(event.clientX, event.clientY))
          : null;
    if (routeGroup) {
      activeGroupId = routeGroup.id;
      selection.groupId = routeGroup.id;
      selection.edgeId = routeEdgeId;
      tool = "select";
    }
    if (routeEdgeId && routeGroup && !routeGroup.locked) {
      actions.push({
        label: editorText("cityEditor.messages.deleteEdge", { value0: routeGroup.name }),
        run: () =>
          runContextAction(
            () => {
              const next = removeEdgeFromGroup(documentState, routeGroup.id, routeEdgeId);
              if (next && !next.featureGroups.some(group => group.id === routeGroup.id)) {
                activeGroupId = null;
                selection.groupId = null;
              }
              selection.edgeId = null;
              return next;
            },
            editorText("cityEditor.messages.deleteEdge", { value0: routeGroup.name })
          )
      });
    }

    const wardFace = faceId ? documentState.mesh.faces[faceId] : null;
    if (wardFace?.properties.ward) {
      actions.push({
        label: editorText("cityEditor.messages.encloseConnectedWardWithWalls", { value0: wardFace.properties.ward }),
        run: () =>
          runContextAction(
            () => encloseWardComponentWithWalls(documentState, wardFace.id),
            editorText("cityEditor.messages.encloseWard", { value0: wardFace.properties.ward })
          )
      });
    }

    if (
      faceId &&
      selection.faceId &&
      faceId !== selection.faceId &&
      faceNeighbors(documentState.mesh, selection.faceId).includes(faceId)
    ) {
      actions.push({
        label: editorText("cityEditor.messages.mergeWith", { value0: selection.faceId, value1: faceId }),
        run: () =>
          runContextAction(
            () => mergeFaces(documentState, selection.faceId as Id, faceId),
            editorText("cityEditor.messages.mergeCells")
          )
      });
    }

    if (vertexId && selection.vertexId && vertexId !== selection.vertexId) {
      if (edgeBetween(documentState.mesh, selection.vertexId, vertexId)) {
        actions.push({
          label: editorText("cityEditor.messages.mergeInto", { value0: vertexId, value1: selection.vertexId }),
          run: () =>
            runContextAction(
              () => mergeVertices(documentState, selection.vertexId as Id, vertexId),
              editorText("cityEditor.messages.mergeVertices")
            ),
          highlight: { vertexId, edgeId: edgeBetween(documentState.mesh, selection.vertexId, vertexId)?.id ?? "" }
        });
      } else {
        for (const face of Object.values(documentState.mesh.faces)) {
          const vertices = faceVertices(documentState.mesh, face);
          if (!vertices.includes(selection.vertexId) || !vertices.includes(vertexId)) continue;
          actions.push({
            label: editorText("cityEditor.messages.splitFromTo", {
              value0: face.id,
              value1: selection.vertexId,
              value2: vertexId
            }),
            run: () =>
              runContextAction(
                () => splitFace(documentState, face.id, selection.vertexId as Id, vertexId),
                editorText("cityEditor.messages.splitCell")
              )
          });
        }
      }
    }

    const clickPoint: [number, number] = [rn(localPoint(event)[0], 1), rn(localPoint(event)[1], 1)];
    const hasPriorActions = actions.length > 0;

    actions.push({
      label: i18n.t("mapContextMenu.distanceFromHere") || editorText("cityEditor.messages.distanceFromHere"),
      isSeparator: hasPriorActions,
      run: () => setDistanceFromHere(clickPoint)
    });

    actions.push({
      label: i18n.t("mapContextMenu.distanceToHere") || editorText("cityEditor.messages.distanceToHere"),
      disabled: !measureFrom,
      title: !measureFrom
        ? i18n.t("mapContextMenu.distanceToHereDisabled") ||
          editorText("cityEditor.messages.setAStartingPointWithDistanceFromHereFirst")
        : undefined,
      run: () => setDistanceToHere(clickPoint)
    });

    if (measureFrom || measureTo) {
      actions.push({
        label: editorText("cityEditor.messages.clearMeasurement"),
        run: () => clearMeasurement()
      });
    }

    showContextMenu(event, actions);
  });
  map.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      halfView = clamp(
        halfView * Math.exp(event.deltaY * 0.0012),
        documentState.frame.extentMeters / 40,
        documentState.frame.extentMeters / 2
      );
      if (showSelectionLabels) scheduleRedraw();
      else updateViewport(true);
      updateWardBrushPreview();
      updateCircularWallPreview();
      refreshScaleBar();
    },
    { passive: false }
  );
  window.addEventListener("keydown", event => {
    if (generationJob) return;
    if (event.code === "Space") isSpacePressed = true;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      restore(event.shiftKey ? history.redo(documentState) : history.undo(documentState));
    }
    if (failurePreview && event.key === "Escape") {
      clearFailurePreview();
      return;
    }
    if (event.key === "Enter") finishButton.click();
    if (event.key === "Escape") {
      routeStroke = null;
      selection = emptySelection();
      activeGroupId = null;
      hideContextMenu();
      clearMeasurement();
      refresh();
    }
  });
  window.addEventListener("keyup", event => {
    if (event.code === "Space") isSpacePressed = false;
  });
  window.addEventListener("blur", () => {
    isSpacePressed = false;
  });
  window.addEventListener("pointerdown", event => {
    if (event.target instanceof Node && !contextMenu.contains(event.target)) hideContextMenu();
  });
  window.addEventListener("pointermove", () => {
    if (closeContextMenuOnPointerMove) hideContextMenu();
  });
  window.addEventListener("resize", refreshScaleBar);

  rebuildEditorIndexes();
  try {
    const incoming = readIncomingCity();
    if (incoming) applyShare(incoming.share, incoming.origin);
    else refresh();
  } catch (error) {
    refresh();
    showNotice(error instanceof Error ? error.message : editorText("cityEditor.messages.couldNotLoadFMGRegionData"));
  }

  function appendSelectedEdge(edgeId: Id, kind: "road" | "wall"): void {
    let next = documentState;
    let groupId = activeGroupId;
    const active = groupId ? next.featureGroups.find(group => group.id === groupId) : null;
    if (!active || active.kind !== kind) {
      next = createGroup(next, kind);
      groupId = next.featureGroups.at(-1)?.id ?? null;
    }
    if (!groupId) return;
    const appended = appendEdge(next, groupId, edgeId);
    if (appended) {
      activeGroupId = groupId;
      selection.groupId = groupId;
      commit(
        appended,
        kind === "wall" ? editorText("cityEditor.messages.drawWall") : editorText("cityEditor.messages.drawRoad")
      );
    }
  }

  function appendSelectedRiverVertex(vertexId: Id): void {
    let next = documentState;
    let groupId = activeGroupId;
    const active = groupId ? next.featureGroups.find(group => group.id === groupId) : null;
    if (active?.kind !== "river" || active.mouth) {
      next = createGroup(next, "river");
      groupId = next.featureGroups.at(-1)?.id ?? null;
    }
    if (!groupId) return;
    const appended = appendRiverVertex(next, groupId, vertexId);
    if (appended) {
      activeGroupId = groupId;
      selection = { ...selection, vertexId, groupId };
      commit(appended, editorText("cityEditor.messages.drawRiver"));
    }
  }

  function commit(next: CityDocument, label = editorText("cityEditor.messages.edit")): void {
    // A no-op edit (re-selecting the same ward, scale ×1, re-applying "sea" to a
    // sea cell) returns the document unchanged. Skip the snapshot so it does not
    // add an empty undo step or a History-panel row.
    if (next === documentState) {
      refresh();
      return;
    }
    const fortificationErrors = validateFortifications(next);
    const existingErrors = failureRenderContext ? new Set(validateFortifications(documentState)) : new Set<string>();
    const preservesExistingErrors =
      failureRenderContext && fortificationErrors.every(error => existingErrors.has(error));
    if (
      fortificationErrors.length &&
      !preservesExistingErrors &&
      (!refreshCastleLayouts(next) || validateFortifications(next).length)
    ) {
      showNotice(editorText("cityEditor.messages.thisEditCannotPreserveCastleIntegrityCheckTheCastleArea"));
      return;
    }
    // Any real edit invalidates a Grid-evolution preview built against the old
    // mesh/frame — dismiss it rather than leave a stale overlay on screen.
    clearGridEvo();
    documentState = history.commit(next, label);
    rememberFailureGenerationState();
    rebuildEditorIndexes();
    refresh();
  }

  function runContextAction(
    operation: () => CityDocument | null,
    label = editorText("cityEditor.messages.edit")
  ): void {
    const next = operation();
    hideContextMenu();
    if (next) {
      commit(next, label);
      return;
    }
    showNotice(editorText("cityEditor.messages.thisOperationCannotBeAppliedToTheSelectedGeometry"));
  }

  function showContextMenu(event: MouseEvent, actions: ContextMenuAction[]): void {
    showContextMenuAt(event.clientX, event.clientY, actions);
  }

  function showContextMenuAt(clientX: number, clientY: number, actions: ContextMenuAction[]): void {
    contextMenu.replaceChildren();
    if (actions.length) {
      for (const action of actions) {
        if (action.isSeparator) {
          const hr = document.createElement("hr");
          contextMenu.appendChild(hr);
        }
        const button = makeButton(action.label, () => {
          if (!action.disabled) action.run();
        });
        if (action.disabled) {
          button.disabled = true;
          if (action.title) button.title = action.title;
        }
        const highlight = action.highlight;
        if (highlight) {
          button.addEventListener("pointerenter", () => setContextHighlight(highlight));
          button.addEventListener("pointerleave", clearContextHighlight);
        }
        contextMenu.appendChild(button);
      }
    } else {
      contextMenu.appendChild(text(editorText("cityEditor.messages.noActionAvailableHere")));
    }
    closeContextMenuOnPointerMove = actions.length === 0;
    contextMenu.hidden = false;
    contextMenu.style.left = `${clientX}px`;
    contextMenu.style.top = `${clientY}px`;
    const bounds = contextMenu.getBoundingClientRect();
    contextMenu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - bounds.width - 8))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - bounds.height - 8))}px`;
  }

  function hideContextMenu(): void {
    contextMenu.hidden = true;
    closeContextMenuOnPointerMove = false;
    clearContextHighlight();
  }

  function setContextHighlight(highlight: { vertexId: Id; edgeId: Id }): void {
    selection.hoverVertexId = highlight.vertexId;
    selection.hoverEdgeId = highlight.edgeId;
    updateHoverOverlay();
  }

  function clearContextHighlight(): void {
    if (!selection.hoverVertexId && !selection.hoverEdgeId) return;
    selection.hoverVertexId = null;
    selection.hoverEdgeId = null;
    updateHoverOverlay();
  }

  function setDistanceFromHere(point: [number, number]): void {
    measureFrom = point;
    measureTo = null;
    hideContextMenu();
    updateMeasureOverlay();
    showNotice(editorText("cityEditor.messages.startingPointSet"));
  }

  function setDistanceToHere(point: [number, number]): void {
    if (!measureFrom) {
      hideContextMenu();
      return;
    }
    measureTo = point;
    hideContextMenu();
    updateMeasureOverlay();
    const dist = Math.hypot(measureTo[0] - measureFrom[0], measureTo[1] - measureFrom[1]);
    showNotice(editorText("cityEditor.messages.distance", { value0: formatDistance(dist) }));
  }

  function clearMeasurement(): void {
    measureFrom = null;
    measureTo = null;
    hideContextMenu();
    updateMeasureOverlay();
  }

  function updateMeasureOverlay(): void {
    const layer = map.querySelector<SVGGElement>(".ce-measure-layer");
    if (!layer) return;
    const width = Math.max(map.getBoundingClientRect().width, 1);
    const metersPerPixel = (halfView * 2) / width;
    const dist =
      measureFrom && measureTo ? Math.hypot(measureTo[0] - measureFrom[0], measureTo[1] - measureFrom[1]) : 0;
    const label = measureFrom && measureTo ? formatDistance(dist) : "";
    const nodes = renderMeasureOverlay(measureFrom, measureTo, metersPerPixel, label);
    layer.replaceChildren(...nodes);
    const textEl = layer.querySelector<SVGTextElement>(".ce-measure-label");
    if (textEl) {
      textEl.style.cursor = "pointer";
      textEl.setAttribute("role", "button");
      textEl.setAttribute("title", editorText("cityEditor.messages.clickToClearMeasurement"));
      textEl.addEventListener("click", () => {
        clearMeasurement();
      });
    }
  }

  function rememberGenerationState(
    seed = completeResult?.generationSeed ?? documentState.generationSeed ?? generateSeed,
    stage = currentStageStep
  ): void {
    if (!completeSource) return;
    generationHistory.set(history.currentEntryKey, {
      source: completeSource,
      result: completeResult,
      resultSettings: completeResultSettings,
      settings: clone(generateSettings),
      seed,
      stage,
      lastStage: lastGeneratedStep,
      activeStage: activeStepStage,
      stepIndex,
      stepStatus: stepStatus.textContent ?? "",
      coreHighlight: urbanCoreHighlight ? new Set(urbanCoreHighlight) : null,
      overlayPaths: stepOverlayPaths ? clone(stepOverlayPaths) : null,
      hideBuildings,
      hideStreetLines
    });
  }

  /** Editing a rejected city must not turn its repaired mesh into the input
   * for earlier stages when that edit is restored through History. */
  function rememberFailureGenerationState(): void {
    if (failureRenderContext && completeSource) rememberGenerationState();
  }

  function restore(next: CityDocument | null): void {
    if (!next) return;
    clearGenerationPreviewCache();
    documentState = next;
    const playback = generationHistory.get(history.currentEntryKey);
    if (playback) {
      completeSource = playback.source;
      completeResult = playback.result;
      completeResultSettings = playback.resultSettings;
      const restoredSettings = clone(playback.settings);
      // Street controls capture this object, so preserve its identity.
      for (const key of Object.keys(streets)) delete streets[key as keyof typeof streets];
      Object.assign(streets, restoredSettings.streets);
      for (const key of Object.keys(generateSettings)) Reflect.deleteProperty(generateSettings, key);
      Object.assign(generateSettings, defaultGenerationSettings(), restoredSettings, { streets });
      generateSeed = playback.seed;
      lastGeneratedStep = playback.lastStage;
      activeStepStage = playback.activeStage;
      stepIndex = playback.stepIndex;
      stepStatus.textContent = playback.stepStatus;
      urbanCoreHighlight = playback.coreHighlight ? new Set(playback.coreHighlight) : null;
      stepOverlayPaths = playback.overlayPaths ? clone(playback.overlayPaths) : null;
      hideBuildings = playback.hideBuildings;
      hideStreetLines = playback.hideStreetLines;
      syncStageUi(playback.stage);
    } else {
      const recipe = next.fabric?.generation;
      completeSource = recipe ? clone(recipe.input) : null;
      completeResult = recipe ? next : null;
      completeResultSettings = recipe ? JSON.stringify(generateSettings) : null;
      lastGeneratedStep = null;
      activeStepStage = null;
      stepIndex = -1;
      stepStatus.textContent = "";
      urbanCoreHighlight = null;
      stepOverlayPaths = null;
      hideBuildings = false;
      hideStreetLines = false;
      if (recipe) generateSeed = recipe.seed;
      generateSettings.moats = {
        town: next.defenseCircuits?.some(c => c.scope === "town" && c.moat?.enabled) ?? false,
        castle: next.defenseCircuits?.some(c => c.scope === "castle" && c.moat?.enabled) ?? false
      };
      syncStageUi(next.appearance === "town" ? 16 : 1);
    }
    syncGenerateControls();
    rebuildEditorIndexes();
    selection = emptySelection();
    activeGroupId = null;
    clearGridEvo();
    refresh();
  }

  function jumpToHistory(index: number): void {
    restore(history.jumpTo(index));
  }

  function refresh(): void {
    redrawMap();
    refreshUiOnly();
  }

  /**
   * Everything refresh() does except the map redraw. Ward/sea painting calls
   * this directly after finishing a stroke, since it already kept the SVG
   * current itself (patchFaceRender) and a redrawMap() pass here would just
   * redo, over the whole mesh, work already done for the touched cells.
   */
  function refreshUiOnly(): void {
    const assets = [
      ...(documentState.landmarkAssets ?? []),
      ...historicLandmarkPrototypes.filter(
        prototype =>
          !(documentState.landmarkAssets ?? []).some(
            asset => asset.id === prototype.id && asset.revision === prototype.revision
          )
      )
    ];
    landmarkSelect.replaceChildren(
      ...assets.map(asset => {
        const option = document.createElement("option");
        option.value = `${asset.id}@${asset.revision}`;
        option.textContent = `${asset.name} (${asset.historicalPhase})`;
        return option;
      })
    );
    if (!assets.length) {
      const option = document.createElement("option");
      option.textContent = editorText("cityEditor.messages.importReviewedAsset");
      option.value = "";
      landmarkSelect.appendChild(option);
    }
    if (!assets.some(asset => `${asset.id}@${asset.revision}` === landmarkAssetId))
      landmarkAssetId = assets.length ? `${assets[0].id}@${assets[0].revision}` : "";
    landmarkSelect.value = landmarkAssetId;
    landmarkControls.hidden = tool !== "landmark";
    shipControls.hidden = tool !== "ship";
    currentBuildingPatternSelect.value =
      documentState.buildingPattern ?? (documentState.fabric?.version === 5 ? "medieval" : "legacy");
    historicalPeriodSelect.value = documentState.historicalPeriod ?? "ageOfExploration";
    walledShareInput.placeholder = editorText("cityEditor.messages.autoCityEditorPage", {
      value0: Math.round(
        (inferredHistoryWalls()?.walledAreaShare ?? defaultWalledAreaShare(documentState.frame.extentMeters)) * 100
      )
    });
    map.classList.toggle("ce-map--select", tool === "select");
    map.classList.toggle("ce-map--brush", isBrushTool(tool) || tool === "wardWall");
    for (const [id, button] of toolButtons) button.classList.toggle("is-active", id === tool);
    undoButton.disabled = !history.canUndo;
    redoButton.disabled = !history.canRedo;
    blockMeshInput.checked = showBlockMesh || tool !== "select";
    gridLinesInput.checked = showGridLines;
    for (const [kind, button] of paintButtons) {
      if (kind === "farm") button.hidden = documentState.gridKind !== "evolution";
      button.classList.toggle(
        "is-active",
        kind === "sea"
          ? tool === "sea"
          : tool === "ward" && (kind === "erase" ? wardBrush === null : wardBrush === kind)
      );
    }
    brushSizeInput.disabled = !isBrushTool(tool);
    brushSizeLabel.classList.toggle("is-disabled", !isBrushTool(tool));
    brushSizeValue.textContent = brushSizeText();
    junctionMaxGapInput.disabled = tool !== "junction";
    junctionMaxGapLabel.classList.toggle("is-disabled", tool !== "junction");
    junctionMaxGapValue.textContent = formatDistance(junctionMaxGapMeters);
    if (!isBrushTool(tool)) hideWardBrushPreview();
    else updateWardBrushPreview();
    if (tool !== "wardWall") hideCircularWallPreview();
    else updateCircularWallPreview();
    renderInspector();
    renderGroups();
    renderHistory();
    const errors = validate(documentState);
    status.textContent = editorText("cityEditor.messages.blocksGroups", {
      value0: Object.keys(documentState.mesh.faces).length,
      value1: documentState.featureGroups.length,
      value2: errors.length ? ` · ${errors.join(", ")}` : editorText("cityEditor.messages.valid"),
      value3: notice ? ` · ${notice}` : ""
    });
    refreshScaleBar();
  }

  /** Repaint on the next frame, collapsing bursts of pointermove events. */
  function scheduleRedraw(): void {
    if (redrawHandle) return;
    redrawHandle = requestAnimationFrame(() => {
      redrawHandle = 0;
      redrawMap();
    });
  }

  /** Force a pending frame-deferred repaint now, before code reads the SVG
   *  (hit-testing, getScreenCTM) and would otherwise see stale geometry. */
  function flushRedraw(): void {
    if (redrawHandle) redrawMap();
  }

  // Panning/zooming changes only the camera, never rebuild the city's SVG or fabric.
  function updateViewport(zoomChanged = false): void {
    const svg = map.querySelector("svg");
    if (!svg) return;
    svg.setAttribute(
      "viewBox",
      `${viewCenter[0] - halfView} ${-viewCenter[1] - halfView} ${halfView * 2} ${halfView * 2}`
    );
    if (zoomChanged)
      svg.querySelector(".ce-approach-labels")?.replaceWith(renderApproachLabels(documentState, zoomFactor()));
    updateHoverOverlay();
    updateMeasureOverlay();
  }

  function showFailurePreview(preview: GenerationDebugPreview, heading: string): void {
    failurePreview = preview;
    failureRenderContext = preview;
    const partial = structuredClone(preview.document);
    partial.generationSeed = preview.seed;
    documentState = history.commit(partial, editorText("cityEditor.messages.generationFailurePreviewCityEditorPage"));
    failurePreviewHistoryIndex = history.index;
    completeResult = null;
    clearGenerationPreviewCache();
    completeResultSettings = null;
    lastGeneratedStep = null;
    activeStepStage = null;
    stepIndex = -1;
    stepStatus.textContent = "";
    urbanCoreHighlight = null;
    stepOverlayPaths = null;
    hideBuildings = false;
    hideStreetLines = false;
    inspectedInfo = null;
    clearGridEvo();
    rebuildEditorIndexes();
    const { sample, seed, highlights } = preview;
    failureDebugSummary.textContent = editorText(
      "cityEditor.messages.seedThePreviewIsEditableHighlightsReflectDiagnosticsAtFailure",
      {
        value0: heading,
        value1: generationPhaseLabel(sample.phase),
        value2: sample.phase,
        value3: sample.failure?.message ?? "",
        value4: sample.failure?.reason ?? "",
        value5: seed,
        value6: highlights.contextual
          ? editorText("cityEditor.messages.relatedAreaHighlightExplanation")
          : editorText("cityEditor.messages.failureHighlightExplanation")
      }
    );
    failureDebugSummary.hidden = false;
    closeFailurePreview.hidden = false;
    rememberGenerationState(preview.seed);
    tool = "select";
    selection = emptySelection();
    activeGroupId = null;
    refresh();
  }

  function clearFailurePreview(): void {
    const wasVisible = failurePreview !== null;
    failurePreview = null;
    failurePreviewHistoryIndex = null;
    failureDebugSummary.hidden = true;
    closeFailurePreview.hidden = true;
    if (wasVisible) redrawMap();
  }

  function redrawMap(): void {
    if (redrawHandle) {
      cancelAnimationFrame(redrawHandle);
      redrawHandle = 0;
    }
    const box = `${viewCenter[0] - halfView} ${-viewCenter[1] - halfView} ${halfView * 2} ${halfView * 2}`;
    if (failurePreview && failurePreviewHistoryIndex !== null && history.index < failurePreviewHistoryIndex) {
      failurePreview = null;
      failureDebugSummary.hidden = true;
      closeFailurePreview.hidden = true;
    }
    if (failurePreview) failurePreview = { ...failurePreview, document: documentState };
    if (failureRenderContext && validate(documentState).length) {
      const editablePreview = failurePreview ?? {
        ...failureRenderContext,
        document: documentState,
        highlights: { vertices: [], edges: [], faces: [], contextual: false }
      };
      map.replaceChildren(
        renderGenerationDebugSvg(editablePreview, box, {
          showVertices: tool === "vertex" || tool === "river",
          selectedVertexId: selection.vertexId,
          selectedEdgeId: selection.edgeId
        })
      );
      housingSummary.hidden = true;
      faceElementsById.clear();
      wardLandmarksGroup = null;
      wardLandmarkElementsById.clear();
      updateGenerationLogHover();
      return;
    }
    const svg = renderEditorSvg(
      documentForOutput(documentState),
      tool,
      selection,
      box,
      zoomFactor(),
      showSelectionLabels,
      referenceImage,
      urbanCoreHighlight,
      stepOverlayPaths,
      gridOverlayForRender(),
      showBlockMesh,
      showGridLines,
      sample => root.dispatchEvent(new CustomEvent("city-render-diagnostics", { detail: sample })),
      hideBuildings,
      hideStreetLines,
      renderQualitySelect.value as RenderQuality,
      false,
      { core: coreLayerInput.checked, regional: regionalLayerInput.checked }
    );
    if (failurePreview) {
      svg.classList.add("ce-generation-debug");
      svg.setAttribute("data-attempt", String(failurePreview.sample.attempt));
      svg.setAttribute("data-seed", failurePreview.seed);
      const highlights = document.createElementNS("http://www.w3.org/2000/svg", "g");
      highlights.setAttribute("pointer-events", "none");
      highlights.append(
        ...renderGenerationDebugSvg(failurePreview, box).querySelectorAll(
          ".ce-generation-debug-highlight, [data-debug-restriction]"
        )
      );
      svg.querySelector(".ce-map-scene")!.append(highlights);
    }
    map.replaceChildren(svg);
    const coreBuildings = Number(svg.getAttribute("data-core-buildings") ?? 0);
    const outerBuildings = Number(svg.getAttribute("data-outskirts-buildings") ?? 0);
    const oldTownBuildings = Number(svg.getAttribute("data-old-town-buildings") ?? 0);
    const buildingCount = coreBuildings + outerBuildings;
    housingSummary.hidden = buildingCount === 0;
    housingSummary.textContent = !buildingCount
      ? ""
      : oldTownBuildings
        ? editorText("cityEditor.messages.buildingsOldTownBetweenWallsOutside", {
            value0: oldTownBuildings.toLocaleString(),
            value1: (coreBuildings - oldTownBuildings).toLocaleString(),
            value2: outerBuildings.toLocaleString(),
            value3: Math.round((outerBuildings / buildingCount) * 100)
          })
        : editorText("cityEditor.messages.buildingsCoreOuterBelt", {
            value0: coreBuildings.toLocaleString(),
            value1: outerBuildings.toLocaleString(),
            value2: Math.round((outerBuildings / buildingCount) * 100)
          });
    if (documentState.urbanMorphology && svg.hasAttribute("data-residential-capacity")) {
      housingSummary.textContent += ` · ${editorText("cityEditor.messages.residentialCapacitySummary", {
        value0: Number(svg.getAttribute("data-residential-capacity")).toLocaleString(),
        value1: Number(svg.getAttribute("data-assigned-outside-dwellings")).toLocaleString(),
        value2: Number(svg.getAttribute("data-unplaced-dwellings")).toLocaleString()
      })}`;
    }
    // Index the per-face nodes this pass just built so a later ward/sea paint
    // can patch just the touched faces (patchFaceRender) instead of forcing
    // another full pass over the whole mesh.
    faceElementsById = new Map(
      Array.from(svg.querySelectorAll<SVGPathElement>(".ce-face"), el => [el.getAttribute("data-face") as Id, el])
    );
    wardLandmarksGroup = svg.querySelector<SVGGElement>(".ce-ward-landmarks");
    wardLandmarkElementsById = new Map(
      Array.from(wardLandmarksGroup?.children ?? [], el => [
        (el.getAttribute("data-element") as string).slice("ward-".length),
        el as SVGGElement
      ])
    );
    updateRoutePreview();
    updateHoverOverlay();
    updateMeasureOverlay();
    updateLandmarkPreview();
  }

  function selectedLandmarkAsset(): LandmarkAsset | null {
    return (
      [...(documentState.landmarkAssets ?? []), ...historicLandmarkPrototypes].find(
        asset => `${asset.id}@${asset.revision}` === landmarkAssetId
      ) ?? null
    );
  }

  function preservedLandmarkLanes(): InfillLane[] {
    if (landmarkLaneSource === documentState) return landmarkLanes;
    landmarkLaneSource = documentState;
    if (
      documentState.appearance === "town" &&
      (documentState.buildingPattern === "medieval" ||
        documentState.fabric?.version === 5 ||
        documentState.gridKind === "evolution" ||
        ["circulade", "bram", "classic"].includes(documentState.layout ?? ""))
    ) {
      const fabric = buildBlockFabric(documentState);
      landmarkLanes = [
        ...buildLandmarkLaneNetwork(documentState, fabric.lanes),
        ...(fabric.parcels ?? []).flatMap(parcel =>
          parcel.access.map(access => ({
            faceId: parcel.faceIds[0],
            points: access.points,
            widthMeters: access.widthMeters
          }))
        )
      ];
    } else landmarkLanes = [];
    return landmarkLanes;
  }

  function updateShipPreview(): void {
    const svg = map.querySelector("svg");
    if (!svg) return;
    svg.querySelector(".ce-ship-preview")?.remove();
    if (tool !== "ship" || !shipHoverPoint) return;
    const preview = renderShipSvg({
      type: shipType,
      point: shipHoverPoint,
      sizeMeters: shipSizeMeters,
      rotation: (shipAngleDegrees * Math.PI) / 180,
      opacity: 0.68,
      className: "ce-ship-preview"
    });
    preview.style.pointerEvents = "none";
    svg.querySelector(".ce-map-scene")!.appendChild(preview);
  }

  function updateLandmarkPreview(): void {
    const svg = map.querySelector("svg");
    if (!svg) return;
    svg.querySelector(".ce-landmark-preview")?.remove();
    const asset = selectedLandmarkAsset();
    if (tool !== "landmark" || !asset || !landmarkHoverPoint) return;
    const placement = {
      id: "preview-landmark",
      position: landmarkHoverPoint,
      rotation: (landmarkRotationDegrees * Math.PI) / 180,
      scale: 1
    };
    const preview = placeLandmark(documentState, asset, placement, preservedLandmarkLanes());
    const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    layer.classList.add("ce-landmark-preview");
    layer.setAttribute("pointer-events", "none");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const site = transformLandmarkPolygons(asset.minimumSite, placement);
    path.setAttribute(
      "d",
      site
        .flatMap(part => [part.outer, ...part.holes])
        .map(ring => `M ${ring.map(point => `${point[0]} ${-point[1]}`).join(" L ")} Z`)
        .join(" ")
    );
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("fill", preview.document ? "#68aa6a66" : "#c2606066");
    path.setAttribute("stroke", preview.document ? "#267943" : "#a22525");
    path.setAttribute("stroke-width", "2");
    layer.appendChild(path);
    const footprint = document.createElementNS("http://www.w3.org/2000/svg", "path");
    footprint.setAttribute(
      "d",
      transformLandmarkPolygons(asset.footprint, placement)
        .flatMap(part => [part.outer, ...part.holes])
        .map(ring => `M ${ring.map(point => `${point[0]} ${-point[1]}`).join(" L ")} Z`)
        .join(" ")
    );
    footprint.setAttribute("fill-rule", "evenodd");
    footprint.setAttribute("fill", preview.document ? "#357a5477" : "#a8444477");
    footprint.setAttribute("stroke", preview.document ? "#1d6539" : "#8b1d1d");
    layer.appendChild(footprint);
    for (const access of preview.document?.landmarks?.at(-1)?.accesses ?? []) {
      const route = document.createElementNS("http://www.w3.org/2000/svg", "path");
      route.setAttribute("d", `M ${access.points.map(point => `${point[0]} ${-point[1]}`).join(" L ")}`);
      route.setAttribute("fill", "none");
      route.setAttribute("stroke", "#267943");
      route.setAttribute("stroke-width", String(access.widthMeters));
      layer.appendChild(route);
    }
    const message = document.createElementNS("http://www.w3.org/2000/svg", "text");
    message.textContent = preview.document
      ? editorText("cityEditor.messages.place", { value0: asset.name })
      : preview.reasons.slice(0, 2).join("; ");
    message.setAttribute("x", String(landmarkHoverPoint[0]));
    message.setAttribute("y", String(-landmarkHoverPoint[1] - 14));
    message.setAttribute("font-size", "11");
    message.setAttribute("fill", preview.document ? "#165a34" : "#8b1d1d");
    layer.appendChild(message);
    svg.querySelector(".ce-map-scene")!.appendChild(layer);
  }

  /**
   * Patch one face's rendered fill and Ward-landmark marker in place, without
   * a full redrawMap() pass. Only ward/sea painting may call this: it never
   * adds, removes, or moves a vertex/edge and never touches featureGroups,
   * gates, or elements. Cemetery layers are updated separately when needed.
   */
  function patchFaceRender(faceId: Id): void {
    const face = documentState.mesh.faces[faceId];
    if (!face) return;
    const path = faceElementsById.get(faceId);
    if (path) path.setAttribute("class", faceClassName(face, selection.faceId === faceId));
    wardLandmarkElementsById.get(faceId)?.remove();
    wardLandmarkElementsById.delete(faceId);
    const landmark = renderFaceWardLandmark(documentState.mesh, face, documentState);
    if (landmark && wardLandmarksGroup) {
      wardLandmarksGroup.appendChild(landmark);
      wardLandmarkElementsById.set(faceId, landmark as SVGGElement);
    }
  }

  function updateRoutePreview(): void {
    const layer = map.querySelector<SVGGElement>(".ce-route-preview-layer");
    if (!layer) return;
    layer.replaceChildren();
    if (!routePreview) return;
    const path = renderRoutePreview(documentState, routePreview.group, routePreview.replacementVertices);
    if (path) layer.appendChild(path);
  }

  /** Repaint only the hover marks (glowing route, edge, nearest vertex). */
  function updateHoverOverlay(): void {
    const layer = map.querySelector<SVGGElement>(".ce-hover-layer");
    if (!layer) return;
    layer.replaceChildren(...renderHoverOverlay(documentState, selection, zoomFactor()));
    updateGenerationLogHover();
  }

  /**
   * Fast path: update selection highlight CSS classes, selection labels and hover
   * overlay in place without rebuilding the entire SVG (which contains thousands of nodes).
   */
  function patchSelectionRender(): boolean {
    const svg = map.querySelector<SVGSVGElement>("svg");
    if (!svg || tool !== "select") return false;

    // Use the same classes and encoded pick metadata as renderEditorSvg().
    svg.querySelectorAll(".ce-selected, .ce-is-selected, .cg-is-selected, .ce-active-group").forEach(el => {
      el.classList.remove("ce-selected", "ce-is-selected", "cg-is-selected", "ce-active-group");
    });

    if (selection.faceId) {
      const faceEl =
        faceElementsById.get(selection.faceId) ?? svg.querySelector<SVGElement>(`[data-face="${selection.faceId}"]`);
      faceEl?.classList.add("ce-selected");
    }
    if (selection.edgeId) {
      svg.querySelector<SVGElement>(`[data-edge="${selection.edgeId}"]`)?.classList.add("ce-selected");
    }
    if (selection.vertexId) {
      svg.querySelector<SVGElement>(`[data-vertex="${selection.vertexId}"]`)?.classList.add("ce-selected");
    }

    if (selection.inspectedId) {
      const id = selection.inspectedId;
      const prefixes: Record<string, string> = {
        cells: "cell",
        edges: "edge",
        vertices: "vertex",
        features: "feature"
      };
      for (const el of svg.querySelectorAll<SVGElement>("[data-pick]")) {
        const info = parsePickInfo(el.getAttribute("data-pick"));
        if (!info) continue;
        const prefix = prefixes[info.layer];
        const selected =
          info.id === id ||
          (prefix && `${prefix}-${info.id}` === id) ||
          (info.layer === "buildings" && info.faceId === id);
        if (selected) el.classList.add("ce-is-selected", "cg-is-selected");
      }
    }

    if (selection.groupId) {
      svg.querySelectorAll<SVGElement>(`[data-group="${selection.groupId}"]`).forEach(el => {
        el.classList.add("ce-active-group");
      });
    }

    svg.querySelectorAll(".ce-ship-handle-group").forEach(handle => {
      handle.remove();
    });
    const selectedShip = documentState.elements.find(e => e.kind === "ship" && e.id === selection.inspectedId);
    if (selectedShip?.point) {
      svg.querySelector(".ce-elements")?.appendChild(
        renderShipRotationHandle({
          id: selectedShip.id,
          point: selectedShip.point,
          sizeMeters: selectedShip.sizeMeters,
          rotation: selectedShip.rotation
        })
      );
    }

    // Labels
    svg.querySelector(".ce-selection-labels")?.remove();
    if (showSelectionLabels && selection.faceId) {
      appendFaceSelectionLabels(svg, documentState, selection.faceId, zoomFactor());
    }

    updateRoutePreview();
    updateHoverOverlay();
    return true;
  }

  function applySelection(nextSelection: RenderSelection): void {
    selection = nextSelection;
    if (!patchSelectionRender()) {
      redrawMap();
    }
    refreshUiOnly();
  }

  function refreshScaleBar(): void {
    const width = map.getBoundingClientRect().width;
    if (width <= 0) return;
    const metersPerPixel = (halfView * 2) / width;
    const meters = niceScale(metersPerPixel * 120);
    scaleLine.style.width = `${meters / metersPerPixel}px`;
    const blockCount = Math.max(1, Math.round(meters / documentState.frame.blockSizeMeters));
    scaleLabel.textContent = editorText("cityEditor.messages.block1Cell", {
      value0: zoomFactor().toFixed(1),
      value1: formatDistance(meters),
      value2: blockCount,
      value3: blockCount === 1 ? "" : "s",
      value4: formatDistance(documentState.frame.blockSizeMeters)
    });
    refreshJunctionGapScale();
  }

  function refreshJunctionGapScale(): void {
    const width = map.getBoundingClientRect().width;
    if (width <= 0) return;
    const metersPerPixel = (halfView * 2) / width;
    const pixelLength = Math.max(1, junctionMaxGapMeters / metersPerPixel);
    junctionGapLine.style.width = `${pixelLength}px`;
    junctionGapLength.textContent = editorText("cityEditor.messages.edgeThreshold", {
      value0: formatDistance(junctionMaxGapMeters)
    });
  }

  function zoomFactor(): number {
    return documentState.frame.extentMeters / 2 / halfView;
  }

  function appendApproachBeyondControls(
    container: HTMLElement,
    groupId: Id,
    current: ApproachBeyond | undefined
  ): void {
    const wrap = document.createElement("div");
    wrap.className = "ce-beyond-controls";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "6px";
    wrap.style.marginTop = "8px";
    wrap.style.padding = "8px";
    wrap.style.border = "1px solid var(--line, #ccc)";
    wrap.style.borderRadius = "4px";
    wrap.style.background = "rgba(0,0,0,0.03)";

    const norm = normalizeApproachBeyond(current);

    const PRESETS = [
      {
        id: "city_domestic",
        get label() {
          return editorText("cityEditor.messages.cityHomeRealm");
        },
        data: {
          realm: { relation: "domestic" as const },
          settlement: { scale: "city" as const, role: "generic" as const, population: 15000, wealth: 70 }
        }
      },
      {
        id: "granary_domestic",
        get label() {
          return editorText("cityEditor.messages.foodSupplyingVillageHomeRealm");
        },
        data: {
          realm: { relation: "domestic" as const },
          settlement: { scale: "village" as const, role: "granary" as const, population: 800, wealth: 45 }
        }
      },
      {
        id: "fortress_enemy",
        get label() {
          return editorText("cityEditor.messages.fortressTownEnemyRealm");
        },
        data: {
          realm: { relation: "Enemy" as const },
          settlement: { scale: "town" as const, role: "fortress" as const, population: 4000, wealth: 55 }
        }
      },
      {
        id: "market_ally",
        get label() {
          return editorText("cityEditor.messages.tradingCityAlly");
        },
        data: {
          realm: { relation: "Ally" as const },
          settlement: { scale: "city" as const, role: "market" as const, population: 14000, wealth: 75 }
        }
      },
      {
        id: "hamlet_domestic",
        get label() {
          return editorText("cityEditor.messages.depopulatedHamletHomeRealm");
        },
        data: {
          realm: { relation: "domestic" as const },
          settlement: { scale: "hamlet" as const, role: "generic" as const, population: 150, wealth: 25 }
        }
      }
    ] as const;

    // プリセットセレクタ
    const presetSelect = document.createElement("select");
    presetSelect.className = "ce-approach-beyond-select";
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = editorText("cityEditor.messages.none");
    presetSelect.appendChild(noneOption);
    for (const p of PRESETS) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      presetSelect.appendChild(opt);
    }

    if (!norm) {
      presetSelect.value = "";
    } else if (norm.realm.relation === "domestic" && norm.settlement.scale === "city") {
      presetSelect.value = "city_domestic";
    } else if (norm.realm.relation === "domestic" && norm.settlement.scale === "village") {
      presetSelect.value = "granary_domestic";
    } else if (norm.realm.relation === "Enemy") {
      presetSelect.value = "fortress_enemy";
    } else if (norm.realm.relation === "Ally") {
      presetSelect.value = "market_ally";
    } else if (norm.realm.relation === "domestic" && norm.settlement.scale === "hamlet") {
      presetSelect.value = "hamlet_domestic";
    } else {
      presetSelect.value = "";
    }

    wrap.append(label(editorText("cityEditor.messages.beyondTheRoadPreset"), presetSelect));

    presetSelect.addEventListener("change", () => {
      const next = clone(documentState);
      const target = next.featureGroups.find(c => c.id === groupId);
      if (target?.kind !== "road") return;
      if (!presetSelect.value) {
        delete target.beyond;
        commit(next, editorText("cityEditor.messages.clearRoadDestination"));
        return;
      }
      const found = PRESETS.find(p => p.id === presetSelect.value);
      if (found) {
        target.beyond = structuredClone(found.data as ApproachBeyondData);
        commit(next, editorText("cityEditor.messages.changeRoadDestination"));
      }
    });

    if (norm) {
      // 1. 国・外交関係
      const realmSelect = document.createElement("select");
      realmSelect.className = "ce-beyond-realm-select";
      for (const rel of REALM_RELATIONS) {
        const opt = document.createElement("option");
        opt.value = rel;
        opt.textContent = REALM_RELATION_LABELS[rel];
        realmSelect.appendChild(opt);
      }
      realmSelect.value = norm.realm.relation;

      // 相手国名
      const stateInput = document.createElement("input");
      stateInput.type = "text";
      stateInput.className = "ce-beyond-state-input";
      stateInput.placeholder = editorText("cityEditor.messages.homeRealmOrRealmName");
      stateInput.value = norm.realm.stateName ?? "";

      // 2. 都市規模
      const scaleSelect = document.createElement("select");
      scaleSelect.className = "ce-beyond-scale-select";
      for (const s of SETTLEMENT_SCALES) {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = SETTLEMENT_SCALE_LABELS[s];
        scaleSelect.appendChild(opt);
      }
      scaleSelect.value = norm.settlement.scale;

      // 都市役割
      const roleSelect = document.createElement("select");
      roleSelect.className = "ce-beyond-role-select";
      for (const r of SETTLEMENT_ROLES) {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = SETTLEMENT_ROLE_LABELS[r];
        roleSelect.appendChild(opt);
      }
      roleSelect.value = norm.settlement.role ?? "generic";

      // 都市名
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "ce-beyond-name-input";
      nameInput.placeholder = editorText("cityEditor.messages.cityNameOptional");
      nameInput.value = norm.settlement.name ?? "";

      // 人口
      const popInput = document.createElement("input");
      popInput.type = "number";
      popInput.min = "10";
      popInput.step = "100";
      popInput.className = "ce-beyond-pop-input";
      popInput.value = String(norm.settlement.population ?? 1000);

      // 富
      const wealthInput = document.createElement("input");
      wealthInput.type = "number";
      wealthInput.min = "0";
      wealthInput.max = "100";
      wealthInput.className = "ce-beyond-wealth-input";
      wealthInput.value = String(norm.settlement.wealth ?? 50);

      // 評価パネル
      const assessBox = document.createElement("div");
      assessBox.className = "ce-beyond-assessment";
      assessBox.style.fontSize = "12px";
      assessBox.style.lineHeight = "1.4";
      assessBox.style.padding = "6px 8px";
      assessBox.style.background = "#fff";
      assessBox.style.borderRadius = "3px";
      assessBox.style.border = "1px solid rgba(0,0,0,0.12)";

      const assess = evaluateApproachBeyond(norm, {
        extentMeters: documentState.frame.extentMeters,
        hasWalls: documentState.featureGroups.some(g => g.kind === "wall")
      });

      if (assess) {
        assessBox.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span>${editorHtml("cityEditor.messages.utility")}<span style="color: #2e7d32;">${assess.utilityLabel}</span></span>
            <span>${editorHtml("cityEditor.messages.defenceNeeded")}<span style="color: #c62828;">${assess.defenseLabel}</span></span>
          </div>
          <div style="color: #333; margin-bottom: 2px;">• ${assess.utilityReason}</div>
          <div style="color: #333;">• ${assess.defenseReason}</div>
        `;
      }

      function updateData(mutator: (d: ApproachBeyondData) => void, desc: string) {
        const next = clone(documentState);
        const target = next.featureGroups.find(c => c.id === groupId);
        if (target?.kind !== "road") return;
        const currentData =
          normalizeApproachBeyond(target.beyond) ?? structuredClone(PRESETS[0].data as ApproachBeyondData);
        mutator(currentData);
        target.beyond = currentData;
        commit(next, desc);
      }

      realmSelect.addEventListener("change", () => {
        updateData(d => {
          d.realm.relation = realmSelect.value as BeyondRealmRelation;
        }, editorText("cityEditor.messages.changeDiplomaticRelationship"));
      });
      stateInput.addEventListener("change", () => {
        updateData(d => {
          d.realm.stateName = stateInput.value || undefined;
        }, editorText("cityEditor.messages.changeDestinationRealmName"));
      });
      scaleSelect.addEventListener("change", () => {
        updateData(d => {
          d.settlement.scale = scaleSelect.value as SettlementScale;
        }, editorText("cityEditor.messages.changeSettlementScale"));
      });
      roleSelect.addEventListener("change", () => {
        updateData(d => {
          d.settlement.role = roleSelect.value as SettlementRole;
        }, editorText("cityEditor.messages.changeSettlementRole"));
      });
      nameInput.addEventListener("change", () => {
        updateData(d => {
          d.settlement.name = nameInput.value || undefined;
        }, editorText("cityEditor.messages.changeSettlementName"));
      });
      popInput.addEventListener("change", () => {
        updateData(d => {
          d.settlement.population = Number(popInput.value) || 1000;
        }, editorText("cityEditor.messages.changeDestinationPopulation"));
      });
      wealthInput.addEventListener("change", () => {
        updateData(d => {
          d.settlement.wealth = Number(wealthInput.value) || 50;
        }, editorText("cityEditor.messages.changeDestinationEconomy"));
      });

      wrap.append(
        label(editorText("cityEditor.messages.realmAndDiplomacy"), realmSelect),
        label(editorText("cityEditor.messages.realmName"), stateInput),
        label(editorText("cityEditor.messages.settlementScale"), scaleSelect),
        label(editorText("cityEditor.messages.specialisedRole"), roleSelect),
        label(editorText("cityEditor.messages.settlementName"), nameInput),
        label(editorText("cityEditor.messages.estimatedPopulation"), popInput),
        label(editorText("cityEditor.messages.economicIndexWealth0100"), wealthInput),
        label(editorText("cityEditor.messages.settlementAndDefenceAssessment"), assessBox)
      );
    }

    container.appendChild(wrap);
  }

  function populateInspectorEditControls(container: HTMLElement): void {
    const castle = documentState.castles?.find(
      c =>
        c.id === selection.inspectedId ||
        (selection.faceId &&
          documentState.defenseCircuits?.find(d => d.id === c.circuitId)?.areaFaceIds.includes(selection.faceId))
    );
    if (castle) {
      const currentProfile = resolveCastleStyle(documentState, castle);
      const styleSelect = document.createElement("select");
      styleSelect.className = "ce-select";
      const styleChoices: Array<[string, string]> = [
        ["auto", editorText("cityEditor.messages.automaticAssessment")],
        ...Object.entries(CASTLE_STYLE_PROFILES).map(([k, p]) => [k, p.label] as [string, string])
      ];
      for (const [val, lbl] of styleChoices) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = lbl;
        if (val === (castle.castleStyle ?? "auto")) opt.selected = true;
        styleSelect.appendChild(opt);
      }
      styleSelect.onchange = () => {
        runContextAction(() => {
          const next = clone(documentState);
          const target = next.castles?.find(c => c.id === castle.id);
          if (!target) return null;
          if (styleSelect.value === "auto") {
            delete target.castleStyle;
          } else {
            target.castleStyle = styleSelect.value as CastleStyle;
          }
          return next;
        }, editorText("cityEditor.messages.castleStyleChange"));
      };

      container.append(
        text(
          editorText("cityEditor.messages.castleCityEditorPage", {
            value0: castle.position,
            value1: castle.relationship,
            value2: castle.form
          })
        ),
        label(editorText("cityEditor.messages.style", { value0: currentProfile.label }), styleSelect),
        makeButton(
          castle.locked ? editorText("cityEditor.messages.unlockCastle") : editorText("cityEditor.messages.lockCastle"),
          () =>
            runContextAction(
              () => setCastleLocked(documentState, castle.id, !castle.locked),
              editorText("cityEditor.messages.castleLock")
            )
        ),
        makeButton(editorText("cityEditor.messages.regenerateCastleInterior"), () =>
          runContextAction(
            () => regenerateCastleInterior(documentState, castle.id, false),
            editorText("cityEditor.messages.castleLayout")
          )
        ),
        makeButton(editorText("cityEditor.messages.switchCastleForm"), () =>
          runContextAction(
            () => regenerateCastleInterior(documentState, castle.id),
            editorText("cityEditor.messages.castleInterior")
          )
        ),
        makeButton(editorText("cityEditor.messages.deleteCastle"), () =>
          runContextAction(() => deleteCastle(documentState, castle.id), editorText("cityEditor.messages.deleteCastle"))
        )
      );
      for (const part of castle.parts) {
        const input = checkbox(part.locked, checked =>
          runContextAction(
            () => setCastlePartLocked(documentState, castle.id, part.id, checked),
            editorText("cityEditor.messages.castleBuildingLock")
          )
        );
        input.disabled = castle.locked;
        container.append(toggleLabel(editorText("cityEditor.messages.lock", { value0: part.role }), input));
      }
      return;
    }
    if (selection.faceId && !reservedCastleFaces(documentState).size)
      container.append(
        makeButton(editorText("cityEditor.messages.createACastleInTheSelectedCell"), () =>
          runContextAction(
            () => createCastleOnFace(documentState, selection.faceId!),
            editorText("cityEditor.messages.createCastle")
          )
        )
      );

    function appendWallMaterialControls(targetContainer: HTMLElement, wallGroup: EdgeFeatureGroup): void {
      const materialSelect = document.createElement("select");
      const optStone = document.createElement("option");
      optStone.value = "stone";
      optStone.textContent = editorText("cityEditor.messages.stoneMasonryWalls");
      const optWood = document.createElement("option");
      optWood.value = "wood";
      optWood.textContent = editorText("cityEditor.messages.woodPalisadeAndDefensiveWalls");
      materialSelect.append(optStone, optWood);
      materialSelect.value = wallGroup.wallMaterial ?? "stone";
      materialSelect.addEventListener("change", () => {
        const nextMat = materialSelect.value as "stone" | "wood";
        const next = clone(documentState);
        const target = next.featureGroups.find(c => c.id === wallGroup.id);
        if (target && target.kind === "wall") {
          target.wallMaterial = nextMat;
          target.style = {
            ...target.style,
            color: nextMat === "wood" ? "#7a522c" : "#342a22",
            widthMeters: nextMat === "wood" ? 2.4 : Math.max(4, target.style.widthMeters)
          };
          commit(
            next,
            editorText("cityEditor.messages.setMaterialTo", {
              value0: wallGroup.name,
              value1:
                nextMat === "wood" ? editorText("cityEditor.messages.wood") : editorText("cityEditor.messages.stone")
            })
          );
        }
      });

      const walkwaySelect = document.createElement("select");
      const optAuto = document.createElement("option");
      optAuto.value = "auto";
      optAuto.textContent = editorText("cityEditor.messages.automaticBasedOnWidth");
      const optWalkway = document.createElement("option");
      optWalkway.value = "walkway";
      optWalkway.textContent = editorText("cityEditor.messages.presentWallTopWalkway");
      const optNone = document.createElement("option");
      optNone.value = "none";
      optNone.textContent = editorText("cityEditor.messages.nonePalisadeOrSingleStoneWall");
      walkwaySelect.append(optAuto, optWalkway, optNone);
      walkwaySelect.value = wallGroup.walkway ?? "auto";
      walkwaySelect.addEventListener("change", () => {
        const nextWalkway = walkwaySelect.value as "auto" | "none" | "walkway";
        const next = clone(documentState);
        const target = next.featureGroups.find(c => c.id === wallGroup.id);
        if (target && target.kind === "wall") {
          target.walkway = nextWalkway;
          commit(next, editorText("cityEditor.messages.setWalkwayTo", { value0: wallGroup.name, value1: nextWalkway }));
        }
      });

      const currentWidth = wallGroup.style.widthMeters;
      const widthSlider = rangeInput(String(currentWidth), "1.0", "8.0", "0.2");
      const widthValue = document.createElement("span");
      widthValue.style.marginLeft = "6px";
      widthValue.style.fontSize = "11px";
      widthValue.textContent = editorText("cityEditor.messages.wallWidthMetres", { value0: currentWidth.toFixed(1) });

      widthSlider.addEventListener("input", () => {
        widthValue.textContent = editorText("cityEditor.messages.wallWidthMetres", {
          value0: parseFloat(widthSlider.value).toFixed(1)
        });
      });
      widthSlider.addEventListener("change", () => {
        const nextWidth = parseFloat(widthSlider.value);
        if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;
        const next = clone(documentState);
        const target = next.featureGroups.find(c => c.id === wallGroup.id);
        if (target && target.kind === "wall") {
          target.style = { ...target.style, widthMeters: nextWidth };
          commit(
            next,
            editorText("cityEditor.messages.setWidthToM", { value0: wallGroup.name, value1: nextWidth.toFixed(1) })
          );
        }
      });

      const widthRow = document.createElement("div");
      widthRow.style.display = "flex";
      widthRow.style.alignItems = "center";
      widthRow.append(widthSlider, widthValue);

      targetContainer.append(
        divider(),
        label(editorText("cityEditor.messages.wallMaterialCityEditorPage"), materialSelect),
        label(editorText("cityEditor.messages.wallTopWalkway"), walkwaySelect),
        label(editorText("cityEditor.messages.wallThicknessWidth"), widthRow)
      );
    }

    if (selection.edgeId && activeGroupId) {
      const group = documentState.featureGroups.find(candidate => candidate.id === activeGroupId);
      if (group) {
        container.append(
          text(editorText("cityEditor.messages.selectedEdgeIn", { value0: selection.edgeId, value1: group.name })),
          makeIconButton("×", editorText("cityEditor.messages.deleteSelectedEdge"), () => {
            const next = removeEdgeFromGroup(documentState, group.id, selection.edgeId as Id);
            if (next) {
              selection.edgeId = null;
              commit(next, editorText("cityEditor.messages.deleteEdgeIn", { value0: group.name }));
            }
          })
        );
        if (group.kind === "road") appendApproachBeyondControls(container, group.id, group.beyond);
        if (group.kind === "wall") appendWallMaterialControls(container, group as EdgeFeatureGroup);
        return;
      }
    }
    if (activeGroupId) {
      const group = documentState.featureGroups.find(candidate => candidate.id === activeGroupId);
      if (group) {
        if (group.kind === "road") appendApproachBeyondControls(container, group.id, group.beyond);
        if (group.kind === "wall") appendWallMaterialControls(container, group as EdgeFeatureGroup);
        container.appendChild(
          text(
            group.kind === "road"
              ? editorText("cityEditor.messages.describeTheDestinationOfARoadFromAnOuterWall")
              : group.locked
                ? `${group.name} is locked`
                : editorText("cityEditor.messages.routeDrawingInRiverRoadOrWallModeLeftDrag")
          )
        );
        return;
      }
    }
    if (selection.vertexId) {
      const vertex = documentState.mesh.vertices[selection.vertexId];
      if (!vertex) return;
      const gate = documentState.gates.find(candidate => candidate.vertexId === vertex.id);
      const wallVertex = vertexHasWall(documentState, vertex.id);
      const gateButton = makeIconButton(
        gate ? "⌑" : "＋",
        gate
          ? editorText("cityEditor.messages.removeGate")
          : editorText("cityEditor.messages.placeGateOnThisWallVertex"),
        () => {
          if (gate) {
            const next = toggleGate(documentState, vertex.id);
            if (next) commit(next, editorText("cityEditor.messages.removeGate"));
            return;
          }
          if (vertexHasWallPassage(documentState, vertex.id)) {
            const next = toggleGate(documentState, vertex.id);
            if (next) {
              commit(next, editorText("cityEditor.messages.placeGate"));
              return;
            }
          }
          const splitOpened = openGatePassage(documentState, vertex.id);
          if (splitOpened) {
            commit(splitOpened, editorText("cityEditor.messages.placeGate"));
            return;
          }
          const candidates = gateOpeningCandidates(documentState, vertex.id);
          if (candidates.length === 1) {
            const next = placeGateOpening(documentState, vertex.id, candidates[0].vertexId);
            if (next) commit(next, editorText("cityEditor.messages.placeGate"));
            else showNotice(editorText("cityEditor.messages.cannotCreateAThroughRoadAtThisWallVertex"));
            return;
          }
          if (!candidates.length) {
            showNotice(editorText("cityEditor.messages.thisWallVertexHasNoEdgeThatCanBecomeA"));
            return;
          }
          const bounds = gateButton.getBoundingClientRect();
          showContextMenuAt(
            bounds.right + 6,
            bounds.top,
            candidates.map(candidate => ({
              label: editorText("cityEditor.messages.openVia", {
                value0: candidate.edgeId,
                value1: candidate.vertexId
              }),
              run: () =>
                runContextAction(
                  () => placeGateOpening(documentState, vertex.id, candidate.vertexId),
                  editorText("cityEditor.messages.placeGate")
                ),
              highlight: { vertexId: candidate.vertexId, edgeId: candidate.edgeId }
            }))
          );
        }
      );
      gateButton.disabled = !wallVertex;
      container.append(
        text(editorText("cityEditor.messages.vertexCityEditorPage", { value0: vertex.id })),
        text(
          wallVertex
            ? editorText("cityEditor.messages.placeAGateToSplitAdjacentCellsAndCreateA")
            : editorText("cityEditor.messages.drawAnOuterWallThroughThisVertexBeforePlacingA")
        ),
        gateButton
      );
      return;
    }
    if (selection.faceId) {
      const face = documentState.mesh.faces[selection.faceId];
      if (!face) return;
      const water = select(["land", "sea", "lake", "openWater"], face.properties.water);
      water.addEventListener("change", () =>
        commit(
          setFaceWater(documentState, face.id, water.value as WaterKind),
          editorText("cityEditor.messages.setWater", { value0: water.value })
        )
      );
      const elevation = numberInput(String(face.properties.elevation), "-1000", "1");
      elevation.addEventListener("change", () =>
        commit(
          setFaceElevation(documentState, face.id, Number(elevation.value)),
          editorText("cityEditor.messages.setElevation")
        )
      );
      const depth = numberInput(String(face.properties.depth ?? 3), "0", "0.1");
      depth.disabled = face.properties.locked || face.properties.water === "land";
      depth.addEventListener("change", () =>
        commit(
          setFaceDepth(documentState, face.id, Number(depth.value)),
          editorText("cityEditor.messages.setWaterDepth")
        )
      );
      const ward = select(
        [
          "",
          "market",
          "castle",
          "merchant",
          "craftsmen",
          "patriciate",
          "harbor",
          "park",
          "cemetery",
          ...(documentState.gridKind === "evolution" ? ["farm"] : []),
          "empty"
        ],
        face.properties.ward ?? ""
      );
      const patriciateOption = [...ward.options].find(o => o.value === "patriciate");
      if (patriciateOption) patriciateOption.textContent = editorText("cityEditor.messages.patriciateWealthyDistrict");
      const cemeteryOption = [...ward.options].find(o => o.value === "cemetery");
      if (cemeteryOption) cemeteryOption.textContent = editorText("cityEditor.messages.cemeteryBurialGround");
      water.disabled = elevation.disabled = ward.disabled = face.properties.locked;
      ward.addEventListener("change", () => {
        if (face.properties.locked) return;
        const next = clone(documentState);
        next.mesh.faces[face.id].properties.ward = (ward.value || null) as WardKind | null;
        if (face.properties.ward === "cemetery" || ward.value === "cemetery") syncDocumentCemeteries(next, [face.id]);
        commit(
          next,
          ward.value
            ? editorText("cityEditor.messages.setWard", { value0: ward.value })
            : editorText("cityEditor.messages.clearWard")
        );
      });
      if (documentState.gridKind === "evolution" || documentState.buildingPattern === "medieval") {
        const district = resolveDistricts(documentState, documentState.fabric).find(d => d.faceIds.includes(face.id));
        const parameters = district?.parameters ?? defaultDistrictParameters(face, documentState);
        container.append(
          text(editorText("cityEditor.messages.districtCells", { value0: district?.faceIds.length ?? 1 }))
        );
        const fields = [
          ["occupancy", editorText("cityEditor.messages.lotOccupancy"), parameters.occupancy * 100, 0, 100, 1],
          ["coverage", editorText("cityEditor.messages.buildingCoverage"), parameters.coverage * 100, 15, 100, 1],
          ["lotArea", editorText("cityEditor.messages.targetLotAreaM2"), parameters.lotArea, 80, 3000, 10],
          ["laneWidth", editorText("cityEditor.messages.laneWidthM"), parameters.laneWidth, 1, 12, 0.2],
          [
            "orientation",
            editorText("cityEditor.messages.localStreetDirection"),
            (parameters.orientation * 180) / Math.PI,
            -180,
            180,
            1
          ]
        ] as const;
        for (const [key, title, value, min, max, step] of fields) {
          if (key === "coverage" && documentState.buildingPattern === "medieval") continue;
          const input = numberInput(String(Math.round(value * 100) / 100), String(min), String(step));
          input.max = String(max);
          input.setAttribute("aria-label", title);
          input.disabled = face.properties.locked;
          input.addEventListener("change", () => {
            const number = Number(input.value);
            const value =
              key === "occupancy" || key === "coverage"
                ? number / 100
                : key === "orientation"
                  ? (number * Math.PI) / 180
                  : number;
            const next = setDistrictParameters(documentState, face.id, { [key]: value });
            if (next) commit(next, editorText("cityEditor.messages.editDistrictDensity"));
            else showNotice(editorText("cityEditor.messages.enterAValueWithinTheDistrictSettingRange"));
          });
          container.append(label(title, input));
        }
        if (documentState.buildingPattern === "medieval" || documentState.fabric?.version === 5) {
          const composition = select(
            ["standard", "commercial", "warehouses", "estates"],
            parameters.composition ?? "standard"
          );
          for (const option of [...composition.options])
            option.textContent = (
              {
                get standard() {
                  return editorText("cityEditor.messages.matchDistrict");
                },
                get commercial() {
                  return editorText("cityEditor.messages.merchantHouses");
                },
                get warehouses() {
                  return editorText("cityEditor.messages.warehouses");
                },
                get estates() {
                  return editorText("cityEditor.messages.manors");
                }
              } as Record<string, string>
            )[option.value];
          composition.disabled = face.properties.locked;
          composition.addEventListener("change", () => {
            const next = setDistrictParameters(documentState, face.id, {
              composition: composition.value as NonNullable<typeof parameters.composition>
            });
            if (next) commit(next, editorText("cityEditor.messages.changeBuildingComposition"));
          });
          container.append(label(editorText("cityEditor.messages.buildingComposition"), composition));
          for (const [key, title, initial] of [
            ["sizeVariation", editorText("cityEditor.messages.sizeVariation"), 0.7],
            ["gardenAmount", editorText("cityEditor.messages.gardensAndWorkYards"), 0.55],
            ["parcelCoverage", editorText("cityEditor.messages.targetBuildingCoverage"), 0.55]
          ] as const) {
            const value = parameters[key] ?? (key === "parcelCoverage" ? null : initial);
            const input = numberInput(
              value === null ? "" : String(Math.round(Math.max(key === "parcelCoverage" ? 0.55 : 0, value) * 100)),
              key === "parcelCoverage" ? "55" : "0",
              "1"
            );
            if (key === "parcelCoverage") input.placeholder = editorText("cityEditor.messages.matchPurpose");
            input.max = key === "parcelCoverage" ? "90" : "100";
            input.disabled = face.properties.locked;
            input.addEventListener("change", () => {
              const next = setDistrictParameters(documentState, face.id, {
                [key]: key === "parcelCoverage" && input.value === "" ? undefined : Number(input.value) / 100
              });
              if (next) commit(next, editorText("cityEditor.messages.editParcelProfile"));
              else showNotice(editorText("cityEditor.messages.enterAValueWithinTheDistrictSettingRange"));
            });
            container.append(label(title, input));
          }
          const preset = select(["small", "dense", "warehouse"], parameters.harborPreset ?? "dense");
          preset.options[0].textContent = editorText("cityEditor.messages.smallHarbour");
          preset.options[1].textContent = editorText("cityEditor.messages.denseTradingHarbour");
          preset.options[2].textContent = editorText("cityEditor.messages.warehouseHarbour");
          preset.disabled = face.properties.locked;
          preset.addEventListener("change", () => {
            const next = setDistrictParameters(documentState, face.id, {
              harborPreset: preset.value as NonNullable<typeof parameters.harborPreset>
            });
            if (next) commit(next, editorText("cityEditor.messages.changeHarborPreset"));
          });
          if (face.properties.ward === "harbor" || parameters.composition === "warehouses")
            container.append(label(editorText("cityEditor.messages.harbourComposition"), preset));
        }
        container.append(divider());
      }
      const vertices = faceVertices(documentState.mesh, face);
      const splitFrom = select(vertices, vertices[0]);
      const splitTo = select(vertices, vertices[Math.floor(vertices.length / 2)]);
      const neighbors = faceNeighbors(documentState.mesh, face.id);
      const mergeWith = select(neighbors, neighbors[0] ?? "");
      container.append(
        label(editorText("cityEditor.messages.elevation"), elevation),
        label(editorText("cityEditor.messages.water"), water),
        ...(face.properties.water !== "land" ? [label(editorText("cityEditor.messages.depthM"), depth)] : []),
        label(editorText("cityEditor.messages.ward"), ward),
        text(editorText("cityEditor.messages.wardAutomaticallyControlsTheLandmarkDrawnInThisCell")),
        divider(),
        label(editorText("cityEditor.messages.splitFrom"), splitFrom),
        label(editorText("cityEditor.messages.splitTo"), splitTo),
        makeIconButton("✂", editorText("cityEditor.messages.splitCell"), () => {
          const next = splitFace(documentState, face.id, splitFrom.value, splitTo.value);
          if (next) commit(next, editorText("cityEditor.messages.splitCell"));
        }),
        label(editorText("cityEditor.messages.mergeWithCityEditorPage"), mergeWith),
        makeIconButton("⊕", editorText("cityEditor.messages.mergeCell"), () => {
          if (!mergeWith.value) return;
          const next = mergeFaces(documentState, face.id, mergeWith.value);
          if (next) commit(next, editorText("cityEditor.messages.mergeCells"));
        })
      );
    }
  }

  function renderInspector(): void {
    inspector.content.replaceChildren();

    if (inspectedInfo) {
      const kind = document.createElement("strong");
      kind.className = "ce-inspector-kind cg-inspector-kind";
      kind.textContent = inspectedInfo.label;

      const content = document.createElement("pre");
      content.className = "ce-inspector-content cg-inspector-content";
      content.textContent = JSON.stringify(inspectedInfo, null, 2);

      const clearButton = makeButton(editorText("cityEditor.messages.clearSelection"), () => {
        inspectedInfo = null;
        activeGroupId = null;
        applySelection({
          faceId: null,
          edgeId: null,
          vertexId: null,
          groupId: null,
          inspectedId: null
        });
      });

      inspector.content.append(kind, content, clearButton);

      if (inspectedInfo.layer === "landmarks" && typeof inspectedInfo.id === "string") {
        const instance = documentState.landmarks?.find(item => item.id === inspectedInfo?.id);
        if (instance && !instance.locked) {
          const x = numberInput(String(instance.position[0]), "-100000", "0.1");
          const y = numberInput(String(instance.position[1]), "-100000", "0.1");
          const angle = numberInput(String((instance.rotation * 180) / Math.PI), "-360", "1");
          const scale = numberInput(String(instance.scale), "0.01", "0.01");
          inspector.content.append(
            divider(),
            label(editorText("cityEditor.messages.xM"), x),
            label(editorText("cityEditor.messages.yM"), y),
            label(editorText("cityEditor.messages.rotation"), angle),
            label(editorText("cityEditor.messages.scale"), scale),
            makeButton(editorText("cityEditor.messages.updateLandmark"), () => {
              const result = transformPlacedLandmark(
                documentState,
                instance.id,
                {
                  position: [Number(x.value), Number(y.value)],
                  rotation: (Number(angle.value) * Math.PI) / 180,
                  scale: Number(scale.value)
                },
                preservedLandmarkLanes()
              );
              if (result.document)
                commit(
                  result.document,
                  editorText("cityEditor.messages.update", { value0: inspectedInfo?.label ?? "landmark" })
                );
              else showNotice(result.reasons.join("; "));
            })
          );
          inspector.content.appendChild(
            makeButton(editorText("cityEditor.messages.deleteLandmark"), () => {
              commit(
                { ...documentState, landmarks: documentState.landmarks?.filter(item => item.id !== instance.id) },
                editorText("cityEditor.messages.delete", { value0: inspectedInfo?.label ?? "landmark" })
              );
              inspectedInfo = null;
              selection.inspectedId = null;
              refresh();
            })
          );
        }
      }

      if (inspectedInfo.layer === "elements" && inspectedInfo.kind === "ship" && typeof inspectedInfo.id === "string") {
        const shipElem = documentState.elements.find(item => item.id === inspectedInfo?.id);
        if (shipElem && !shipElem.locked && shipElem.point) {
          const x = numberInput(String(shipElem.point[0]), "-100000", "0.1");
          const y = numberInput(String(shipElem.point[1]), "-100000", "0.1");
          const length = numberInput(String(shipElem.sizeMeters ?? SHIP_SPECS.small.defaultSizeMeters), "5", "1");
          const angle = numberInput(String(((shipElem.rotation ?? 0) * 180) / Math.PI), "-360", "1");
          inspector.content.append(
            divider(),
            label(editorText("cityEditor.messages.xM"), x),
            label(editorText("cityEditor.messages.yM"), y),
            label(editorText("cityEditor.messages.lengthM"), length),
            label(editorText("cityEditor.messages.rotation"), angle),
            makeButton(editorText("cityEditor.messages.updateShip"), () => {
              const updated = documentState.elements.map(item => {
                if (item.id !== shipElem.id) return item;
                return {
                  ...item,
                  point: [Number(x.value), Number(y.value)] as Point,
                  sizeMeters: Number(length.value) || item.sizeMeters,
                  rotation: (Number(angle.value) * Math.PI) / 180
                };
              });
              commit(
                { ...documentState, elements: updated },
                editorText("cityEditor.messages.updateShipCityEditorPage", { value0: shipElem.id })
              );
            }),
            makeButton(editorText("cityEditor.messages.deleteShip"), () => {
              commit(
                { ...documentState, elements: documentState.elements.filter(item => item.id !== shipElem.id) },
                editorText("cityEditor.messages.deleteShipCityEditorPage", { value0: shipElem.id })
              );
              inspectedInfo = null;
              selection.inspectedId = null;
              refresh();
            })
          );
        }
      }

      const editSection = div("ce-inspector-edit-section");
      populateInspectorEditControls(editSection);
      if (editSection.hasChildNodes()) {
        inspector.content.append(divider(), editSection);
      }
      return;
    }

    const editSection = div("ce-inspector-edit-section");
    populateInspectorEditControls(editSection);
    if (editSection.hasChildNodes()) {
      inspector.content.append(editSection);
    } else {
      inspector.content.appendChild(text(editorText("cityEditor.messages.selectACellToSetWaterAWardOrAn")));
    }
  }

  function renderGroups(): void {
    groups.content.replaceChildren();
    let selectedRowEl: HTMLElement | null = null;
    for (const group of documentState.featureGroups) {
      const isSelected = group.id === activeGroupId;
      const row = div(`ce-group-row${isSelected ? " is-active ce-group-selected" : ""}`);
      row.setAttribute("data-group-row", group.id);
      if (isSelected) selectedRowEl = row;
      const choose = makeIconButton(
        group.kind === "river" ? "〰" : group.kind === "road" ? "╱" : "▥",
        editorText("cityEditor.messages.select", { value0: group.name }),
        () => {
          activeGroupId = group.id;
          selection.groupId = group.id;
          selection.inspectedId = group.id;
          const beyondLabel = group.kind === "road" ? approachBeyondLabel(group.beyond) : null;
          inspectedInfo = {
            layer: "features",
            kind: group.kind,
            id: group.id,
            label: beyondLabel ? `${group.kind} (${group.name} · ${beyondLabel})` : `${group.kind} (${group.name})`,
            name: group.name,
            locked: group.locked,
            widthMeters: group.style.widthMeters,
            color: group.style.color,
            segmentCount: group.kind === "river" ? group.vertices.length : group.segments.length,
            ...(beyondLabel ? { beyond: group.kind === "road" ? group.beyond : undefined, beyondLabel } : {})
          };
          tool = "select";
          refresh();
        }
      );
      choose.classList.toggle("is-active", isSelected);
      row.append(
        choose,
        text(
          `${group.kind === "river" ? editorText("cityEditor.messages.vertexCount", { count: group.vertices.length }) : editorText("cityEditor.messages.edgeCount", { count: group.segments.length })}${
            group.kind === "road" && approachBeyondLabel(group.beyond) ? ` · ${approachBeyondLabel(group.beyond)}` : ""
          }${group.kind === "wall" ? ` · ${group.wallMaterial === "wood" ? editorText("cityEditor.messages.woodenWall") : editorText("cityEditor.messages.masonryWall")}` : ""}`
        )
      );
      const smooth = makeIconButton("⌁", editorText("cityEditor.messages.smooth", { value0: group.name }), () => {
        const next = smoothFeatureGroup(documentState, group.id);
        if (next) commit(next, editorText("cityEditor.messages.smooth", { value0: group.name }));
        else showNotice(editorText("cityEditor.messages.hasNoMovableVerticesToSmooth", { value0: group.name }));
      });
      smooth.disabled = group.locked || (group.kind !== "river" && group.kind !== "road" && group.kind !== "wall");
      smooth.title = editorText("cityEditor.messages.smoothThisGroupIncludingItsSharedVerticesAndClosedLoops");
      row.appendChild(smooth);
      row.appendChild(
        makeIconButton("×", editorText("cityEditor.messages.delete", { value0: group.name }), () => {
          const name = group.name;
          if (activeGroupId === group.id) {
            activeGroupId = null;
            selection.groupId = null;
            if (inspectedInfo?.id === group.id) inspectedInfo = null;
          }
          commit(removeGroup(documentState, group.id), editorText("cityEditor.messages.delete", { value0: name }));
        })
      );
      groups.content.appendChild(row);
    }
    if (selectedRowEl && typeof selectedRowEl.scrollIntoView === "function") {
      selectedRowEl.scrollIntoView({ block: "nearest" });
    }
    if (activeGroupId)
      groups.content.appendChild(
        text(editorText("cityEditor.messages.inSelectModeLeftDragAHighlightedRouteEdgeThrough"))
      );
  }

  function appendGenerationException(error: unknown, seed: string): void {
    generationLog.append(
      {
        phase: "runtime",
        elapsedMs: 0,
        attempt: 1,
        failure: { reason: "generation-exception", message: error instanceof Error ? error.message : String(error) }
      },
      seed
    );
  }

  function hoverGenerationLogObjects(ids: string[], seed: string): void {
    generationLogHover = { ids, seed };
    updateGenerationLogHover();
  }

  function updateGenerationLogHover(): void {
    const svg = map.querySelector("svg");
    if (!svg) return;
    svg.querySelector(".ce-generation-log-highlight")?.remove();
    if (generationLogHover.seed !== documentState.generationSeed || !generationLogHover.ids.length) return;
    const ns = "http://www.w3.org/2000/svg";
    const layer = document.createElementNS(ns, "g");
    layer.setAttribute("class", "ce-generation-log-highlight");
    layer.setAttribute("pointer-events", "none");
    for (const id of generationLogHover.ids) {
      const vertex = documentState.mesh.vertices[id],
        edge = documentState.mesh.edges[id],
        face = documentState.mesh.faces[id];
      let node: SVGElement;
      if (vertex) {
        node = document.createElementNS(ns, "circle");
        node.setAttribute("cx", String(vertex.point[0]));
        node.setAttribute("cy", String(-vertex.point[1]));
        node.setAttribute("r", String(Math.max(0.5, halfView / 70)));
        node.setAttribute("fill", "#ffdf0088");
      } else if (edge && documentState.mesh.vertices[edge.a] && documentState.mesh.vertices[edge.b]) {
        node = document.createElementNS(ns, "path");
        const a = documentState.mesh.vertices[edge.a].point,
          b = documentState.mesh.vertices[edge.b].point;
        node.setAttribute("d", `M${a[0]},${-a[1]}L${b[0]},${-b[1]}`);
        node.setAttribute("fill", "none");
      } else if (face?.boundary.every(ref => documentState.mesh.edges[ref.edgeId])) {
        node = document.createElementNS(ns, "path");
        node.setAttribute(
          "d",
          `${facePoints(documentState.mesh, face)
            .map((p, i) => `${i ? "L" : "M"}${p[0]},${-p[1]}`)
            .join(" ")}Z`
        );
        node.setAttribute("fill", "#ffdf0044");
      } else continue;
      node.setAttribute("data-object-id", id);
      node.setAttribute("stroke", "#ffdf00");
      node.setAttribute("stroke-width", "4");
      node.setAttribute("vector-effect", "non-scaling-stroke");
      layer.append(node);
    }
    svg.querySelector(".ce-map-scene")!.append(layer);
  }

  function renderHistory(): void {
    const entries = history.entries;
    const current = history.index;
    // A brush stroke commits one entry per edit, so painting a Large mesh one
    // cell at a time can push this into the hundreds within a session.
    // Rebuilding every row's DOM on every single commit made this panel cost
    // O(entries) per edit — O(entries²) over a session — even though only the
    // newest row (or the current one, via amendTop) actually changed. Reuse
    // existing row nodes and only patch what changed; fall back to a full
    // rebuild only when the list actually shrinks (undo-then-branch, or a
    // fresh document/history).
    if (!historyListEl || historyRows.length > entries.length) {
      historyPanel.content.replaceChildren();
      historyListEl = div("ce-history-list");
      const actions = div("ce-history-actions");
      historyClearButton = makeButton(editorText("cityEditor.messages.clearAllHistory"), () => {
        if (!history.canUndo && !history.canRedo) return;
        history.reset(documentState, editorText("cityEditor.messages.historyCleared"));
        rememberGenerationState();
        showNotice(editorText("cityEditor.messages.historyCleared"));
        refreshUiOnly();
      });
      historyClearButton.className = "ce-history-clear";
      actions.appendChild(historyClearButton);
      historySummaryEl = text("");
      historyPanel.content.append(historyListEl, actions, historySummaryEl);
      historyRows = [];
    }
    const list = historyListEl;
    entries.forEach((entry, index) => {
      let row = historyRows[index];
      if (!row) {
        row = makeButton("", () => jumpToHistory(index));
        row.className = "ce-history-row";
        const step = text(String(index));
        step.className = "ce-history-index";
        row.append(step, text(""), text(""));
        (row.children[1] as HTMLElement).className = "ce-history-label";
        (row.children[2] as HTMLElement).className = "ce-history-time";
        list.appendChild(row);
        historyRows[index] = row;
      }
      const label = row.children[1] as HTMLElement;
      const time = row.children[2] as HTMLElement;
      if (label.textContent !== entry.label) label.textContent = entry.label;
      const clock = formatClock(entry.time);
      if (time.textContent !== clock) time.textContent = clock;
      row.title = editorText("cityEditor.messages.restoreState", { value0: index, value1: entry.label });
      row.classList.toggle("is-current", index === current);
      row.classList.toggle("is-future", index > current);
    });
    historyClearButton!.disabled = entries.length <= 1;
    historySummaryEl!.textContent = editorText("cityEditor.messages.stepOfClickAStepToRestoreIt", {
      value0: current,
      value1: entries.length - 1
    });
    // Keep the active step visible as the timeline grows past the panel height.
    historyRows[current]?.scrollIntoView({ block: "nearest" });
  }

  function localPoint(event: PointerEvent): [number, number] {
    return localPointAt(event.clientX, event.clientY);
  }

  function closestVertexId(point: [number, number]): Id | null {
    // Accept a roughly 12 px drop target regardless of the current zoom.
    const radius = (halfView * 24) / Math.max(map.getBoundingClientRect().width, 1);
    const span = Math.max(1, Math.ceil(radius / faceBucketSize));
    const originX = Math.floor(point[0] / faceBucketSize);
    const originY = Math.floor(point[1] / faceBucketSize);
    let nearest: Id | null = null;
    let nearestDistance = radius;
    for (let x = originX - span; x <= originX + span; x++) {
      for (let y = originY - span; y <= originY + span; y++) {
        for (const vertexId of vertexBuckets.get(`${x},${y}`) ?? []) {
          const vertex = documentState.mesh.vertices[vertexId];
          if (!vertex) continue;
          const distance = Math.hypot(vertex.point[0] - point[0], vertex.point[1] - point[1]);
          if (distance <= nearestDistance) {
            nearest = vertex.id;
            nearestDistance = distance;
          }
        }
      }
    }
    return nearest;
  }

  function closestMergeCandidate(vertexId: Id): Id | null {
    const vertex = documentState.mesh.vertices[vertexId];
    if (!vertex) return null;
    const radius = (halfView * 26) / Math.max(map.getBoundingClientRect().width, 1);
    let candidate: Id | null = null;
    let distance = radius;
    for (const edgeId of edgeIdsByVertex.get(vertexId) ?? []) {
      const edge = documentState.mesh.edges[edgeId];
      if (!edge) continue;
      const otherId = edge.a === vertexId ? edge.b : edge.a;
      const other = documentState.mesh.vertices[otherId];
      if (!other) continue;
      const candidateDistance = Math.hypot(vertex.point[0] - other.point[0], vertex.point[1] - other.point[1]);
      if (candidateDistance <= distance) {
        candidate = otherId;
        distance = candidateDistance;
      }
    }
    return candidate;
  }

  function rebuildEditorIndexes(): void {
    const edgeByVertices = new Map<string, Id>();
    edgeIdsByVertex = new Map();
    for (const edge of Object.values(documentState.mesh.edges)) {
      edgeByVertices.set(vertexPairKey(edge.a, edge.b), edge.id);
      edgeIdsByVertex.set(edge.a, [...(edgeIdsByVertex.get(edge.a) ?? []), edge.id]);
      edgeIdsByVertex.set(edge.b, [...(edgeIdsByVertex.get(edge.b) ?? []), edge.id]);
    }

    routeEdgesByGroup = new Map();
    routeGroupsByEdge = new Map();
    for (const group of documentState.featureGroups) {
      const edgeIds =
        group.kind === "river"
          ? group.vertices.slice(1).flatMap((vertexId, index) => {
              const edgeId = edgeByVertices.get(vertexPairKey(group.vertices[index], vertexId));
              return edgeId ? [edgeId] : [];
            })
          : group.segments.map(segment => segment.edgeId);
      routeEdgesByGroup.set(group.id, edgeIds);
      for (const edgeId of edgeIds) routeGroupsByEdge.set(edgeId, [...(routeGroupsByEdge.get(edgeId) ?? []), group.id]);
    }

    faceBucketSize = Math.max(documentState.frame.blockSizeMeters * 2, documentState.frame.extentMeters / 32);
    faceBuckets = new Map();
    for (const face of Object.values(documentState.mesh.faces)) {
      if (face.boundary.some(ref => !documentState.mesh.edges[ref.edgeId])) continue;
      const points = facePoints(documentState.mesh, face);
      if (!points.length || points.some(p => !p.every(Number.isFinite))) continue;
      const minX = Math.min(...points.map(point => point[0]));
      const maxX = Math.max(...points.map(point => point[0]));
      const minY = Math.min(...points.map(point => point[1]));
      const maxY = Math.max(...points.map(point => point[1]));
      for (let x = Math.floor(minX / faceBucketSize); x <= Math.floor(maxX / faceBucketSize); x++) {
        for (let y = Math.floor(minY / faceBucketSize); y <= Math.floor(maxY / faceBucketSize); y++) {
          const key = `${x},${y}`;
          faceBuckets.set(key, [...(faceBuckets.get(key) ?? []), face.id]);
        }
      }
    }

    // Same grid, keyed by vertex position, so closestVertexId() can scan a
    // handful of nearby buckets instead of every vertex on each hover move.
    vertexBuckets = new Map();
    for (const vertex of Object.values(documentState.mesh.vertices)) {
      const key = `${Math.floor(vertex.point[0] / faceBucketSize)},${Math.floor(vertex.point[1] / faceBucketSize)}`;
      vertexBuckets.set(key, [...(vertexBuckets.get(key) ?? []), vertex.id]);
    }
  }

  function faceAtPoint(point: Point): Id | null {
    const key = `${Math.floor(point[0] / faceBucketSize)},${Math.floor(point[1] / faceBucketSize)}`;
    for (const faceId of faceBuckets.get(key) ?? []) {
      const face = documentState.mesh.faces[faceId];
      if (face && pointInPolygon(point, facePoints(documentState.mesh, face))) return face.id;
    }
    return null;
  }

  function faceIdsWithinWardBrush(center: Point): Id[] {
    return faceIdsWithinBrush(center, paintBrushRadiusMeters());
  }

  function faceIdsWithinBrush(center: Point, radius: number): Id[] {
    if (radius <= 0) {
      const faceId = faceAtPoint(center);
      return faceId ? [faceId] : [];
    }
    const faceIds = new Set<Id>();
    const minX = Math.floor((center[0] - radius) / faceBucketSize);
    const maxX = Math.floor((center[0] + radius) / faceBucketSize);
    const minY = Math.floor((center[1] - radius) / faceBucketSize);
    const maxY = Math.floor((center[1] + radius) / faceBucketSize);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (const faceId of faceBuckets.get(`${x},${y}`) ?? []) faceIds.add(faceId);
      }
    }
    return [...faceIds].filter(faceId => {
      const face = documentState.mesh.faces[faceId];
      return !!face && circleIntersectsPolygon(center, radius, facePoints(documentState.mesh, face));
    });
  }

  function updateHover(event: PointerEvent): void {
    // Only Select, Edit-vertices, and the route tools show a hover highlight
    // (route glow / nearest-vertex handle). The brush tools (ward, sea,
    // junction, circular wall) track the cursor with a lightweight CSS ring, so
    // recomputing hover for them here is pure waste.
    const usesHover = tool === "select" || tool === "vertex" || isRoutePaintTool(tool);
    const point = usesHover ? localPoint(event) : null;
    const route = point ? routeAtEvent(event, point, false) : null;
    const nextGroupId = route?.groupId ?? null;
    const nextVertexId = point && tool === "select" ? closestVertexId(point) : null;
    // Compare against the normalised value: without this, an idle pointer over
    // empty canvas (route === null → groupId undefined) never matches the
    // stored null and forces a repaint on every move.
    if (selection.hoverGroupId === nextGroupId && selection.hoverVertexId === nextVertexId) return;
    selection.hoverGroupId = nextGroupId;
    selection.hoverVertexId = nextVertexId;
    // Hover marks live in their own layer now, so this never rebuilds the mesh.
    updateHoverOverlay();
  }

  function paintCellsAtPoint(point: Point): void {
    const erasing = tool === "ward" && wardBrush === null;
    const eraseCells = !erasing || eraseTarget !== "edges";
    const eraseEdges = erasing && eraseTarget !== "cells";
    const faceIds = eraseCells ? faceIdsWithinWardBrush(point) : [];
    // Copy-on-write: a stroke fires this on every pointermove, so cloning the
    // whole document (all vertices/edges plus every face's boundary) here
    // would scale with total mesh size instead of the handful of cells the
    // brush actually touches — on a Large mesh that's ~16x the work of Small
    // for the same brush. Only the faces map is shallow-copied, and only the
    // faces the brush actually changes get a fresh object; every untouched
    // face keeps its original reference.
    let faces: CityDocument["mesh"]["faces"] | null = null;
    const touched: Id[] = [];
    let cemeteryChanged = false;
    for (const faceId of faceIds) {
      if (paintedWardFaceIds.has(faceId)) continue;
      paintedWardFaceIds.add(faceId);
      const face = documentState.mesh.faces[faceId];
      if (!face || face.properties.locked) continue;
      if (tool === "sea") {
        if (face.properties.water === "sea" && face.properties.elevation === 0) continue;
      } else if (face.properties.ward === wardBrush) continue;
      if (!faces) faces = { ...documentState.mesh.faces };
      const properties = { ...face.properties };
      if (tool === "sea") {
        // Match the Inspector's Water = sea operation exactly.
        properties.water = "sea";
        properties.elevation = 0;
      } else {
        if (properties.ward === "cemetery" || wardBrush === "cemetery") cemeteryChanged = true;
        properties.ward = wardBrush;
      }
      faces[faceId] = { ...face, properties };
      touched.push(faceId);
    }
    if (faces) {
      documentState = { ...documentState, mesh: { ...documentState.mesh, faces } };
      if (cemeteryChanged) {
        documentState.cemeteries = [...(documentState.cemeteries ?? [])];
        syncDocumentCemeteries(documentState, touched);
        map.querySelector(".ce-cemeteries")?.replaceWith(renderCemeteries(documentState, selection.inspectedId));
      }
      wardPaintChanged = true;
      // Patch just the touched faces' <path>/landmark directly, rather than
      // scheduling a full redrawMap() pass over the whole mesh next frame — on
      // a Large mesh a 1-cell brush touches one face out of ~9,000.
      for (const faceId of touched) patchFaceRender(faceId);
      if (documentState.fixedCrossingApproaches !== undefined) {
        // Face-only painting can change support/passage without changing mesh edges.
        for (const path of map.querySelectorAll("[data-fixed-approach-id]")) path.remove();
        map.querySelector("svg")?.setAttribute("data-fixed-approach-status", "unvalidated");
        scheduleRedraw();
      }
    }
    if (eraseEdges) eraseEdgesAtPoint(point);
  }

  function canPaintAtPoint(point: Point): boolean {
    if (tool !== "ward" || wardBrush !== null) return faceIdsWithinWardBrush(point).length > 0;
    return (
      (eraseTarget !== "edges" && faceIdsWithinWardBrush(point).length > 0) ||
      (eraseTarget !== "cells" && edgeIdsWithinEraseBrush(point).length > 0)
    );
  }

  /** Return mesh edges under the visible brush diameter, not just the cell
   * under its centre. This lets a 1-cell erase brush clear route segments on
   * that cell's perimeter, while larger brushes expand naturally. */
  function edgeIdsWithinEraseBrush(point: Point): Id[] {
    const radius = brushSizeMeters() / 2;
    const edgeIds = new Set<Id>();
    for (const faceId of faceIdsWithinBrush(point, radius)) {
      const face = documentState.mesh.faces[faceId];
      if (face) for (const ref of face.boundary) edgeIds.add(ref.edgeId);
    }
    return [...edgeIds].filter(edgeId => {
      const edge = documentState.mesh.edges[edgeId];
      const a = edge && documentState.mesh.vertices[edge.a]?.point;
      const b = edge && documentState.mesh.vertices[edge.b]?.point;
      return !!a && !!b && pointToSegmentDistance(point, a, b) <= radius;
    });
  }

  function eraseEdgesAtPoint(point: Point): void {
    const edgeIds = edgeIdsWithinEraseBrush(point).filter(edgeId => !paintedEdgeIds.has(edgeId));
    if (!edgeIds.length) return;
    for (const edgeId of edgeIds) paintedEdgeIds.add(edgeId);
    const next = removeEdgesFromGroups(documentState, edgeIds);
    if (!next) return;
    documentState = next;
    wardPaintChanged = true;
    edgePaintChanged = true;
    // Route groups cannot be patched face-by-face, so coalesce redraws while
    // dragging and finish with one final redraw on pointerup.
    scheduleRedraw();
  }

  function paintHistoryLabel(): string {
    if (tool === "sea") return editorText("cityEditor.messages.paintSea");
    if (wardBrush) return editorText("cityEditor.messages.paintWard", { value0: wardBrush });
    return eraseTarget === "cells"
      ? editorText("cityEditor.messages.eraseCells")
      : eraseTarget === "edges"
        ? editorText("cityEditor.messages.eraseEdges")
        : editorText("cityEditor.messages.eraseCellsAndEdges");
  }

  /**
   * The control expresses the visible painted diameter, not a geometric radius.
   * A point brush already covers the cell under the pointer, so subtract that
   * first cell before expanding into neighbouring cells.
   */
  function paintBrushRadiusMeters(): number {
    return Math.max(0, (brushSizeMeters() - documentState.frame.blockSizeMeters) / 2);
  }

  function brushSizeMeters(): number {
    return brushSizeCells * documentState.frame.blockSizeMeters;
  }

  function brushSizeText(): string {
    const unit = brushSizeCells === 1 ? "cell" : "cells";
    return `${brushSizeCells} ${unit} · ${formatDistance(brushSizeMeters())}`;
  }

  function optimizeJunctionsAtPoint(point: Point): void {
    const next = optimizeJunctions(documentState, point, brushSizeMeters() / 2, junctionMaxGapMeters);
    if (!next) return;
    documentState = next;
    junctionPaintChanged = true;
    scheduleRedraw();
  }

  function updateWardBrushPreview(event?: PointerEvent): void {
    if (event) wardBrushPointer = { clientX: event.clientX, clientY: event.clientY };
    if (!isBrushTool(tool) || !wardBrushPointer) {
      hideWardBrushPreview();
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const metersPerPixel = (halfView * 2) / Math.max(map.getBoundingClientRect().width, 1);
    const radiusPixels = Math.max(5, brushSizeMeters() / 2 / metersPerPixel);
    wardBrushPreview.style.width = `${radiusPixels * 2}px`;
    wardBrushPreview.style.height = `${radiusPixels * 2}px`;
    wardBrushPreview.style.left = `${wardBrushPointer.clientX - bounds.left}px`;
    wardBrushPreview.style.top = `${wardBrushPointer.clientY - bounds.top}px`;
    wardBrushPreview.hidden = false;
  }

  function hideWardBrushPreview(): void {
    wardBrushPreview.hidden = true;
    wardBrushPointer = null;
  }

  function updateCircularWallPreview(event?: PointerEvent): void {
    if (event) circularWallPointer = { clientX: event.clientX, clientY: event.clientY };
    if (tool !== "wardWall" || !circularWallPointer) {
      hideCircularWallPreview();
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const stroke = circularWallStroke;
    const centerClient = stroke?.centerClient ?? circularWallPointer;
    circularWallCenter.style.left = `${centerClient.clientX - bounds.left}px`;
    circularWallCenter.style.top = `${centerClient.clientY - bounds.top}px`;
    circularWallCenter.hidden = false;
    if (!stroke) {
      circularWallPreview.hidden = true;
      return;
    }
    const pointer = event ? localPoint(event) : stroke.center;
    stroke.radiusMeters = Math.hypot(pointer[0] - stroke.center[0], pointer[1] - stroke.center[1]);
    const metersPerPixel = (halfView * 2) / Math.max(map.getBoundingClientRect().width, 1);
    const radiusPixels = stroke.radiusMeters / metersPerPixel;
    circularWallPreview.style.width = `${radiusPixels * 2}px`;
    circularWallPreview.style.height = `${radiusPixels * 2}px`;
    circularWallPreview.style.left = `${centerClient.clientX - bounds.left}px`;
    circularWallPreview.style.top = `${centerClient.clientY - bounds.top}px`;
    circularWallPreview.hidden = radiusPixels < 1;
  }

  function hideCircularWallPreview(): void {
    circularWallPreview.hidden = true;
    circularWallCenter.hidden = true;
    circularWallPointer = null;
  }

  function extendRouteStroke(point: Point): void {
    const stroke = routeStroke;
    if (!stroke) return;
    if (!stroke.initialized) initializeRouteStroke(stroke, point);
    if (!stroke.groupId || !stroke.endpointId) return;

    const edgeId = closestStrokeContinuation(stroke, point);
    const edge = edgeId ? documentState.mesh.edges[edgeId] : null;
    if (edge && edgeId) {
      const nextEndpointId: Id = edge.a === stroke.endpointId ? edge.b : edge.a;
      const next =
        stroke.kind === "river"
          ? appendRiverVertex(documentState, stroke.groupId, nextEndpointId)
          : appendEdge(documentState, stroke.groupId, edgeId);
      if (next) {
        documentState = next;
        stroke.endpointId = nextEndpointId;
        stroke.changed = true;
        selection.groupId = stroke.groupId;
        activeGroupId = stroke.groupId;
        commitRouteStrokeStep(stroke);
      }
    }
    stroke.lastPoint = point;
    if (stroke.changed) scheduleRedraw();
  }

  function initializeRouteStroke(stroke: RouteStroke, point: Point): void {
    const edge = documentState.mesh.edges[stroke.initialEdgeId];
    if (!edge) return;
    if (stroke.groupId && stroke.endpointId) {
      const group = documentState.featureGroups.find(candidate => candidate.id === stroke.groupId);
      if (!group || group.locked || group.kind !== stroke.kind || (group.kind === "river" && group.mouth)) return;
      stroke.initialized = true;
      if (groupUsesEdge(documentState, group, stroke.initialEdgeId)) return;
      const nextEndpointId = edge.a === stroke.endpointId ? edge.b : edge.a;
      const next =
        stroke.kind === "river"
          ? appendRiverVertex(documentState, stroke.groupId, nextEndpointId)
          : appendEdge(documentState, stroke.groupId, stroke.initialEdgeId);
      if (!next) return;
      documentState = next;
      stroke.endpointId = nextEndpointId;
      stroke.changed = true;
      selection.groupId = stroke.groupId;
      activeGroupId = stroke.groupId;
      commitRouteStrokeStep(stroke);
      return;
    }
    const a = documentState.mesh.vertices[edge.a]?.point;
    const b = documentState.mesh.vertices[edge.b]?.point;
    if (!a || !b) return;
    const movement: Point = [point[0] - stroke.startPoint[0], point[1] - stroke.startPoint[1]];
    const startsAtA = (b[0] - a[0]) * movement[0] + (b[1] - a[1]) * movement[1] >= 0;
    const startVertexId = startsAtA ? edge.a : edge.b;
    const endVertexId = startsAtA ? edge.b : edge.a;
    let next = createGroup(documentState, stroke.kind);
    const groupId = next.featureGroups.at(-1)?.id;
    if (!groupId) return;

    if (stroke.kind === "river") {
      next = appendRiverVertex(next, groupId, startVertexId) ?? next;
      next = appendRiverVertex(next, groupId, endVertexId) ?? next;
    } else {
      next = appendEdge(next, groupId, stroke.initialEdgeId) ?? next;
      const group = next.featureGroups.find(candidate => candidate.id === groupId);
      if (group && group.kind !== "river" && group.segments[0]) group.segments[0].forward = startsAtA;
    }
    documentState = next;
    stroke.groupId = groupId;
    stroke.endpointId = endVertexId;
    stroke.initialized = true;
    stroke.changed = true;
    selection.groupId = groupId;
    activeGroupId = groupId;
    commitRouteStrokeStep(stroke);
  }

  function finishRouteStroke(stroke: RouteStroke, point: Point): void {
    if (!stroke.initialized) initializeRouteStroke(stroke, point);
  }

  function commitRouteStrokeStep(stroke: RouteStroke): void {
    // One drag = one undo entry. The first step of the stroke pushes it; every
    // later step rewrites that same entry so the History panel and memory only
    // ever see a single "Draw wall/road/river" per gesture.
    if (!stroke.committed) {
      history.commit(documentState, editorText("cityEditor.messages.draw", { value0: stroke.kind }));
      stroke.committed = true;
    } else {
      history.amendTop(documentState, editorText("cityEditor.messages.draw", { value0: stroke.kind }));
    }
    rememberFailureGenerationState();
    rebuildEditorIndexes();
  }

  function closestStrokeContinuation(stroke: RouteStroke, point: Point): Id | null {
    const endpointId = stroke.endpointId;
    if (!endpointId) return null;
    const endpoint = documentState.mesh.vertices[endpointId]?.point;
    if (!endpoint || Math.hypot(point[0] - endpoint[0], point[1] - endpoint[1]) < routeHitRadius() * 0.35) return null;
    const group = documentState.featureGroups.find(candidate => candidate.id === stroke.groupId);
    if (!group || (group.kind === "river" && group.mouth)) return null;
    const direction: Point = [point[0] - stroke.lastPoint[0], point[1] - stroke.lastPoint[1]];
    const directionLength = Math.hypot(direction[0], direction[1]) || 1;
    let nearest: Id | null = null;
    let nearestScore = Number.POSITIVE_INFINITY;
    for (const edgeId of edgeIdsByVertex.get(endpointId) ?? []) {
      const edge = documentState.mesh.edges[edgeId];
      if (!edge || groupUsesEdge(documentState, group, edgeId)) continue;
      const otherId = edge.a === endpointId ? edge.b : edge.a;
      const other = documentState.mesh.vertices[otherId]?.point;
      if (!other) continue;
      const distance = pointToSegmentDistance(point, endpoint, other);
      if (distance > routeHitRadius() * 1.75) continue;
      const edgeLength = Math.hypot(other[0] - endpoint[0], other[1] - endpoint[1]) || 1;
      const alignment =
        ((other[0] - endpoint[0]) * direction[0] + (other[1] - endpoint[1]) * direction[1]) /
        (edgeLength * directionLength);
      // The pointer trajectory is the user's branch choice. Never take a
      // backward or sideward edge just because it happens to pass closer to
      // the cursor than the intended forward edge.
      if (alignment < 0.15) continue;
      const score = distance + (1 - alignment) * routeHitRadius() * 4;
      if (score < nearestScore) {
        nearest = edgeId;
        nearestScore = score;
      }
    }
    return nearest;
  }

  function closestMeshEdgeId(point: Point, radiusPixels: number): Id | null {
    const radius = routeHitRadius(radiusPixels);
    let nearest: Id | null = null;
    let nearestDistance = radius;
    for (const edge of Object.values(documentState.mesh.edges)) {
      const a = documentState.mesh.vertices[edge.a]?.point;
      const b = documentState.mesh.vertices[edge.b]?.point;
      if (!a || !b) continue;
      const distance = pointToSegmentDistance(point, a, b);
      if (distance <= nearestDistance) {
        nearest = edge.id;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function routeEndpointOnEdge(kind: RoutePaintKind, edgeId: Id, point: Point): { groupId: Id; vertexId: Id } | null {
    const edge = documentState.mesh.edges[edgeId];
    if (!edge) return null;
    let closest: { groupId: Id; vertexId: Id; distance: number } | null = null;
    for (const group of documentState.featureGroups) {
      if (group.kind !== kind || group.locked || (group.kind === "river" && group.mouth)) continue;
      const vertices = featureGroupVertices(documentState, group);
      const endpoints = group.kind === "river" ? [vertices.at(-1)] : [vertices[0], vertices.at(-1)];
      for (const vertexId of new Set(endpoints)) {
        if (!vertexId || (vertexId !== edge.a && vertexId !== edge.b)) continue;
        const vertex = documentState.mesh.vertices[vertexId];
        if (!vertex) continue;
        const distance = Math.hypot(point[0] - vertex.point[0], point[1] - vertex.point[1]);
        const activeBonus = group.id === activeGroupId ? routeHitRadius() : 0;
        if (!closest || distance - activeBonus < closest.distance) {
          closest = { groupId: group.id, vertexId, distance: distance - activeBonus };
        }
      }
    }
    return closest;
  }

  function routeHitRadius(pixels = 18): number {
    return ((halfView * 2) / Math.max(map.getBoundingClientRect().width, 1)) * pixels;
  }

  function routeAtEvent(
    event: Event,
    point: Point,
    allowNearby: boolean,
    allowLocked = false
  ): { groupId: Id; edgeId: Id } | null {
    const directGroupId = targetId(event, "group");
    const directEdgeId = targetId(event, "edge");
    const activeGroup = activeGroupId ? documentState.featureGroups.find(group => group.id === activeGroupId) : null;
    const directEdgeGroups = directEdgeId ? (routeGroupsByEdge.get(directEdgeId) ?? []) : [];
    const group = directGroupId
      ? documentState.featureGroups.find(candidate => candidate.id === directGroupId)
      : directEdgeId && activeGroup && routeEdgesByGroup.get(activeGroup.id)?.includes(directEdgeId)
        ? activeGroup
        : directEdgeId
          ? documentState.featureGroups.find(candidate => candidate.id === directEdgeGroups[0])
          : null;
    if (!group) return allowNearby ? closestRouteAtPoint(point, allowLocked) : null;
    if (group.locked && !allowLocked) return null;
    const edgeId =
      directEdgeId && routeEdgesByGroup.get(group.id)?.includes(directEdgeId)
        ? directEdgeId
        : closestGroupEdgeId(group, point);
    return edgeId ? { groupId: group.id, edgeId } : null;
  }

  function closestRouteAtPoint(point: Point, allowLocked = false): { groupId: Id; edgeId: Id } | null {
    const metersPerPixel = (halfView * 2) / Math.max(map.getBoundingClientRect().width, 1);
    let closest: { groupId: Id; edgeId: Id } | null = null;
    let nearestRatio = Number.POSITIVE_INFINITY;
    for (const group of documentState.featureGroups) {
      if (group.locked && !allowLocked) continue;
      const hitRadius = Math.max(group.style.widthMeters / 2 + metersPerPixel * 8, metersPerPixel * 12);
      for (const edgeId of routeEdgesByGroup.get(group.id) ?? []) {
        const edge = documentState.mesh.edges[edgeId];
        if (!edge) continue;
        const a = documentState.mesh.vertices[edge.a]?.point;
        const b = documentState.mesh.vertices[edge.b]?.point;
        if (!a || !b) continue;
        const ratio = pointToSegmentDistance(point, a, b) / hitRadius;
        if (ratio > 1 || ratio >= nearestRatio) continue;
        closest = { groupId: group.id, edgeId };
        nearestRatio = ratio;
      }
    }
    return closest;
  }

  function closestGroupEdgeId(group: FeatureGroup, point: Point): Id | null {
    let nearest: Id | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const edgeId of routeEdgesByGroup.get(group.id) ?? []) {
      const edge = documentState.mesh.edges[edgeId];
      if (!edge) continue;
      const a = documentState.mesh.vertices[edge.a]?.point;
      const b = documentState.mesh.vertices[edge.b]?.point;
      if (!a || !b) continue;
      const distance = pointToSegmentDistance(point, a, b);
      if (distance < nearestDistance) {
        nearest = edgeId;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function localPointAt(clientX: number, clientY: number): [number, number] {
    const svg = map.querySelector("svg");
    if (!svg) return [0, 0];
    if (typeof DOMPoint !== "undefined" && typeof svg.getScreenCTM === "function") {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
        return [point.x, -point.y];
      }
    }
    return [clientX, -clientY];
  }

  async function importDocument(): Promise<void> {
    const parsed = await pickCityMap(fixedApproachProvider);
    applyImportedMap(parsed);
  }

  async function importMapFile(file: File | undefined): Promise<void> {
    applyImportedMap(await readCityMap(file, fixedApproachProvider));
  }

  function applyImportedMap(parsed: ImportedCityMap | null): void {
    if (!parsed) {
      showNotice(editorText("cityEditor.messages.importFailedSelectACityEditorMFCGJSONOrSVG"));
      return;
    }
    // Lift the (possibly multi-MB) backdrop out of the edited document before it
    // seeds the history, then keep it only in the closure for render + export.
    referenceImage = parsed.document.referenceImage ?? null;
    delete parsed.document.referenceImage;
    let unresolvedLandmarks: Id[] = [];
    if (parsed.document.landmarks?.some(instance => instance.accesses.some(access => access.target.kind === "lane"))) {
      const fabric = buildBlockFabric(parsed.document);
      const repaired = repairLandmarkLaneTargets(
        parsed.document,
        buildLandmarkLaneNetwork(parsed.document, fabric.lanes)
      );
      parsed.document = repaired.document;
      unresolvedLandmarks = repaired.unresolved;
    }
    clearGenerationPreviewCache();
    documentState = parsed.document;
    generateSettings.buildingPattern =
      documentState.buildingPattern ?? (documentState.fabric?.version === 5 ? "medieval" : "legacy");
    history = new DocumentHistory(
      parsed.document,
      editorText("cityEditor.messages.importedMap"),
      undefined,
      fixedApproachProvider
    );
    generationLog.reset();
    if (unresolvedLandmarks.length)
      showNotice(
        editorText("cityEditor.messages.landmarkLaneAccessEsNeedReview", { value0: unresolvedLandmarks.length })
      );
    rebuildEditorIndexes();
    selection = emptySelection();
    activeGroupId = null;
    activeStepStage = null;
    stepIndex = -1;
    urbanCoreHighlight = null;
    stepOverlayPaths = null;
    stepStatus.textContent = "";
    lastGeneratedStep = null;
    const recipe = documentState.fabric?.generation;
    completeSource = recipe ? clone(recipe.input) : null;
    completeResult = recipe ? documentState : null;
    if (recipe) {
      generateSeed = recipe.seed;
      Object.assign(
        generateSettings,
        {
          walledAreaShare: undefined,
          townWallRings: undefined,
          innerWallState: undefined,
          townWallBuildOrder: undefined,
          urbanCoreMode: undefined,
          descriptor: undefined,
          castle: undefined,
          moats: undefined,
          buildingPattern: "legacy"
        },
        clone(recipe.settings)
      );
      generateSettings.legacyCastles = recipe.algorithm === "evolution-city-v3";
      completeResultSettings = JSON.stringify(generateSettings);
      importedOrigin = generateSettings.descriptor ? (importedOrigin ?? "link") : null;
      syncGenerateControls();
    } else {
      delete generateSettings.descriptor;
      importedOrigin = null;
      syncGenerateControls();
    }
    showBlockMesh = false;
    clearGridEvo();
    generateSettings.moats = {
      town: documentState.defenseCircuits?.some(c => c.scope === "town" && c.moat?.enabled) ?? false,
      castle: documentState.defenseCircuits?.some(c => c.scope === "castle" && c.moat?.enabled) ?? false
    };
    syncGenerateControls();
    halfView = parsed.document.frame.extentMeters / 2;
    viewCenter = [0, 0];
    showNotice(
      parsed.source === "mfcg-svg"
        ? editorText("cityEditor.messages.sVGImportedAsAReferenceImage")
        : parsed.source === "mfcg-json"
          ? editorText("cityEditor.messages.mFCGMapImported")
          : editorText("cityEditor.messages.mapImported")
    );
  }

  function showNotice(value: string, redraw = true): void {
    notice = value;
    if (redraw) refresh();
    else refreshUiOnly();
    window.setTimeout(() => {
      if (notice !== value) return;
      notice = "";
      if (redraw) refresh();
      else refreshUiOnly();
    }, 1800);
  }

  function syncGenerateControls(): void {
    seedInput.value = generateSeed;
    for (const [scope, input] of moatInputs) input.checked = !!generateSettings.moats?.[scope];
    for (const [key, input] of castleInputs)
      input.value = generateSettings.castle?.[key] ?? DEFAULT_CASTLE_SETTINGS[key] ?? "auto";
    buildingPatternSelect.value = generateSettings.buildingPattern ?? "legacy";
    layoutSelect.value = generateSettings.layout ?? generateSettings.config.layout ?? "auto";
    coastSelect.value = generateSettings.config.coast;
    if (!generateSettings.config.wall) {
      generateSettings.config.wall = { envelope: "auto", coast: "auto", line: "auto", material: "auto" };
    }
    seaWallSelect.value = WALL_COAST_CHOICES.includes(generateSettings.config.wall.coast)
      ? generateSettings.config.wall.coast
      : "auto";
    wallMaterialSelect.value = WALL_MATERIAL_CHOICES.includes(
      generateSettings.config.wall.material as WallMaterialChoice
    )
      ? (generateSettings.config.wall.material as WallMaterialChoice)
      : "auto";
    riversSelect.value = String(Math.min(2, generateSettings.config.rivers.length));
    riverPlacementSelect.value = generateSettings.riverPlacement ?? "through";
    reliefInput.checked = generateSettings.config.relief;
    for (const [key, input] of featureInputs) input.checked = generateSettings.config.features[key];
    urbanCoreModeSelect.value = generateSettings.urbanCoreMode ?? "legacy";
    urbanNPatchesInput.value = generateSettings.urbanNPatches != null ? String(generateSettings.urbanNPatches) : "";
    walledShareInput.value =
      generateSettings.walledAreaShare === undefined ? "" : String(generateSettings.walledAreaShare * 100);
    townWallRingsSelect.value = townWallRingsValue();
    townWallBuildOrderSelect.value = generateSettings.townWallBuildOrder ?? "outer-first";
    townWallBuildOrderSelect.disabled = townWallRingsValue() === "single";
    if (!generateSettings.streets) {
      generateSettings.streets = { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true };
    }
    avoidSeaInput.checked = generateSettings.streets.avoidSea !== false;
    farNodeSelect.value = generateSettings.streets.farNode ?? "descriptorEnd";
    bearingsInput.value = generateSettings.streets.manualBearings?.map(n => String(n)).join(", ") ?? "";
    bearingsLabel.style.display = farNodeSelect.value === "manualBearings" ? "" : "none";
    const imported = generateSettings.descriptor != null;
    importedBox.hidden = !imported;
    synthControls.hidden = imported;
    if (imported && generateSettings.descriptor) {
      importedText.replaceChildren(...describeImportedSite(generateSettings.descriptor, importedOrigin));
    }
  }

  function importedFrame() {
    const descriptor = generateSettings.descriptor;
    return descriptor
      ? descriptorFrameGridOptions(
          descriptor.frame,
          descriptor.burg.waterAccess?.port.river === true,
          descriptor.burg.riverPlacement?.bankDistanceMeters,
          seaPortShoreDistanceMeters(descriptor)
        )
      : {};
  }

  function currentShare(): CityEditorShare {
    return buildShare({
      seed: generateSeed,
      grid: gridKind,
      size: size.value as CitySizePreset,
      hexSizeMeters: gridKind === "hex" ? hexSizeMeters : undefined,
      gridSeed,
      patchParams: gridKind === "evolution" ? { ...gridEvoParams } : undefined,
      measureBlockSize: measureTownCells,
      settings: {
        ...(documentState.fabric?.generation?.settings ?? generateSettings),
        historicalPeriod: documentState.historicalPeriod ?? generateSettings.historicalPeriod
      },
      descriptor: generateSettings.descriptor
    });
  }

  async function copyShareLink(button: HTMLButtonElement): Promise<void> {
    const share = currentShare();
    const url = cityLinkFor(share);
    try {
      await navigator.clipboard.writeText(url);
      window.history.replaceState(null, "", `${location.pathname}${location.search}#${encodeShare(share)}`);
      const label = button.textContent;
      button.textContent = editorText("cityEditor.messages.linkCopied");
      window.setTimeout(() => {
        if (button.textContent === editorText("cityEditor.messages.linkCopied")) button.textContent = label;
      }, 1400);
      // Copying is a UI-only operation; preserve the current SVG and selection.
      showNotice(editorText("cityEditor.messages.shareableLinkCopied"), false);
    } catch {
      showNotice(editorText("cityEditor.messages.copyFailed"), false);
    }
  }

  function useStandaloneSite(): void {
    delete generateSettings.descriptor;
    importedOrigin = null;
    measureTownCells = false;
    forgetIncomingCity();
    syncGenerateControls();
    showNotice(editorText("cityEditor.messages.standaloneSiteGeographyControlsUnlocked"));
  }

  function applyShare(share: CityEditorShare, origin: IncomingOrigin): void {
    generateSeed = share.seed;
    gridSeed = share.gridSeed ?? share.seed;
    gridKind = share.grid;
    hexSizeMeters = share.hexSizeMeters ?? DEFAULT_HEX_SIZE_METERS;
    if (share.patchParams) Object.assign(gridEvoParams, share.patchParams);
    // The ceiling is a viewer preference, but never below the shared count.
    gridEvoParams.maxPatches = Math.max(readMaxPatchesPreference(), resolveMaxPatches(gridEvoParams.nPatches));
    syncGridParamControls();
    measureTownCells = share.measureBlockSize === true;
    size.value = share.size;
    gridKindSelect.value = gridKind;
    hexSizeInput.value = String(hexSizeMeters);
    hexSizeValue.textContent = formatDistance(hexSizeMeters);
    syncGridKindUi();
    Object.assign(
      generateSettings,
      defaultGenerationSettings(),
      { buildingPattern: "legacy", townWallRings: undefined, innerWallState: undefined, townWallBuildOrder: undefined },
      structuredClone(share.settings)
    );
    generateSettings.descriptor = share.descriptor;
    importedOrigin = share.descriptor ? origin : null;
    documentState = createGridDocument({
      size: share.size,
      grid: share.grid,
      seed: gridSeed,
      hexSizeMeters,
      patchParams: { ...gridEvoParams },
      ...(share.descriptor
        ? descriptorFrameGridOptions(
            share.descriptor.frame,
            share.descriptor.burg.waterAccess?.port.river === true,
            share.descriptor.burg.riverPlacement?.bankDistanceMeters,
            seaPortShoreDistanceMeters(share.descriptor)
          )
        : {}),
      measureBlockSize: measureTownCells,
      biome: share.descriptor?.biome
    });
    history = new DocumentHistory(
      documentState,
      share.descriptor ? editorText("cityEditor.messages.importedSite") : editorText("cityEditor.messages.sharedCity"),
      undefined,
      fixedApproachProvider
    );
    generationLog.reset();
    referenceImage = null;
    selection = emptySelection();
    activeGroupId = null;
    completeSource = clone(documentState);
    completeResult = null;
    clearGenerationPreviewCache();
    halfView = documentState.frame.extentMeters / 2;
    viewCenter = [0, 0];
    activeStepStage = null;
    stepIndex = -1;
    urbanCoreHighlight = null;
    stepOverlayPaths = null;
    stepStatus.textContent = "";
    lastGeneratedStep = null;
    showBlockMesh = false;
    clearGridEvo();
    syncGenerateControls();
    rebuildEditorIndexes();
    runCompleteGeneration();
  }

  /** Roll a new random town, then re-show it at whatever stage is on screen. */
  function rollNewTown(): void {
    generateSeed = randomSeed();
    syncGenerateControls();
    stepIndex = -1;
    stepOverlayPaths = null;
    stepStatus.textContent = "";
    lastGeneratedStep = null;
    currentStageStep = 16;
    syncStageUi(16);
    runCompleteGeneration();
  }

  function rerunLastStage(): void {
    if (documentState.appearance === "town") {
      runCompleteGeneration();
      return;
    }
    if (lastGeneratedStep === null) return;
    const stage = generationStages(generateSettings).find(s => s.step === lastGeneratedStep);
    if (stage) runGenerationStage(stage);
  }

  function runCompleteGeneration(): void {
    // Reuse the input grid for successive rolls, preventing accumulated shrink
    // from finishing an already finished town. A real edit becomes a new input.
    if (!completeSource) {
      completeSource = documentState.fabric?.generation?.input
        ? clone(documentState.fabric.generation.input)
        : clone(documentState);
    } else if (
      documentState !== completeResult &&
      JSON.stringify(documentState) !== JSON.stringify(completeResult) &&
      lastGeneratedStep === null &&
      !generationHistory.has(history.currentEntryKey)
    ) {
      completeSource = clone(documentState);
    }
    if (generationJob) return;
    if (!generationHistory.has(history.currentEntryKey))
      rememberGenerationState(generateSeed, lastGeneratedStep ?? (documentState.appearance === "town" ? 16 : 1));
    clearFailurePreview();
    generationSamples = [];
    generationLog.reset();
    pendingFailurePreview = null;
    const onFailurePreview = (preview: GenerationDebugPreview) => {
      pendingFailurePreview = preview;
    };
    const onProgress = (sample: GenerationSample) => {
      generationSamples.push(sample);
      generationLog.append(
        sample,
        sample.failure?.details?.find(line => line.startsWith("seed="))?.slice(5) ??
          (sample.attempt === 1 ? generateSeed : `${generateSeed}:junction-retry:${sample.attempt - 1}`)
      );
      if (sample.failure) {
        generationProgress.textContent = editorText("cityEditor.messages.candidateRejected", {
          value0: sample.attempt,
          value1: generationPhaseLabel(sample.phase),
          value2: sample.failure.message
        });
        return;
      }
      generationProgress.textContent = editorText("cityEditor.messages.generatingCandidate", {
        value0: sample.attempt,
        value1: failureDebugInput.checked ? 1 : COMPLETE_CITY_ATTEMPTS,
        value2: generationPhaseLabel(sample.phase)
      });
    };
    if (typeof Worker !== "undefined") {
      const input = documentState;
      const before = JSON.stringify(input);
      generationProgress.textContent = editorText("cityEditor.messages.generatingCity");
      cancelGeneration.hidden = false;
      root.setAttribute("aria-busy", "true");
      try {
        const job = startCityGeneration(
          {
            document: completeSource,
            settings: generateSettings,
            seed: generateSeed,
            debugFailure: failureDebugInput.checked
          },
          onProgress,
          undefined,
          onFailurePreview
        );
        generationJob = job;
        const observer = new MutationObserver(() => {
          if (!root.isConnected) job.cancel();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        void job.result
          .then(next => {
            if (!root.isConnected || input !== documentState || before !== JSON.stringify(documentState)) return;
            acceptCompleteGeneration(next);
          })
          .catch(error => {
            if (root.isConnected) {
              if (error instanceof Error && error.name === "AbortError")
                generationProgress.textContent = editorText("cityEditor.messages.generationCancelled");
              else {
                console.error(error);
                appendGenerationException(error, generateSeed);
                generationProgress.textContent = editorText("cityEditor.messages.cityGenerationFailed");
              }
            }
          })
          .finally(() => {
            observer.disconnect();
            if (generationJob === job) generationJob = null;
            cancelGeneration.hidden = true;
            root.removeAttribute("aria-busy");
          });
      } catch (error) {
        console.error(error);
        appendGenerationException(error, generateSeed);
        cancelGeneration.hidden = true;
        root.removeAttribute("aria-busy");
        generationProgress.textContent = editorText("cityEditor.messages.couldNotStartCityGeneration");
      }
      return;
    }
    // Non-worker hosts (including jsdom) retain the synchronous API.
    try {
      acceptCompleteGeneration(
        generateCityOnDocument(
          clone(completeSource),
          generateSettings,
          generateSeed,
          onProgress,
          failureDebugInput.checked ? onFailurePreview : undefined
        )
      );
    } catch (error) {
      console.error(error);
      appendGenerationException(error, generateSeed);
      generationProgress.textContent = editorText("cityEditor.messages.cityGenerationFailed");
    }
  }

  function acceptCompleteGeneration(next: CityDocument | null): void {
    const roadIssues = next
      ? (generationSamples.filter(sample => sample.phase === "road-connection-validation").at(-1)
          ?.roadConnectionIssues ?? [])
      : [];
    const roadWarning = roadIssues.length
      ? editorText("cityEditor.messages.fmgRoadConnectionsNeedAttention", {
          value0: roadIssues.map(issue => issue.routeId).join(", ")
        })
      : "";
    generationProgress.textContent = next
      ? roadWarning || editorText("cityEditor.messages.generationComplete")
      : editorText("cityEditor.messages.cityGenerationFailed");
    root.dispatchEvent(new CustomEvent("city-generation-diagnostics", { detail: generationSamples.slice() }));
    if (!next) {
      const source = completeSource ?? documentState;
      const context = {
        seed: generateSeed,
        grid: source.gridKind ?? gridKind,
        size: size.value,
        extentMeters: source.frame.extentMeters,
        cityRadiusMeters: source.frame.cityRadiusMeters,
        faces: Object.keys(source.mesh.faces).length
      };
      if (generationSamples.some(sample => sample.failure)) logGenerationFailures(generationSamples, context);
      else {
        const message = editorText("cityEditor.messages.cityGenerationFailedNoRejectionReasonRecorded");
        console.error(`[City Editor] ${message}`, { ...context, samples: generationSamples });
        appendGenerationException(message, generateSeed);
      }
      if (failureDebugInput.checked && pendingFailurePreview) {
        showFailurePreview(
          pendingFailurePreview,
          editorText("cityEditor.messages.failedCandidateNoRetry", { value0: pendingFailurePreview.sample.attempt })
        );
      }
      pendingFailurePreview = null;
      showNotice(editorText("cityEditor.messages.cityGenerationFailed"));
      return;
    }
    pendingFailurePreview = null;
    if (next.generationSeed) {
      generateSeed = next.generationSeed;
      syncGenerateControls();
    }
    if (next.fabric?.generation?.input) {
      completeSource = clone(next.fabric.generation.input);
    }
    if (JSON.stringify(next) === JSON.stringify(documentState)) {
      showNotice(editorText("cityEditor.messages.showingTheSameCity"));
      return;
    }
    documentState = history.commit(
      documentForOutput(next),
      editorText("cityEditor.messages.generateCompleteCityCityEditorPage")
    );
    completeResult = documentState;
    lastGeneratedStep = null;
    activeStepStage = null;
    stepIndex = -1;
    stepStatus.textContent = "";
    urbanCoreHighlight = null;
    stepOverlayPaths = null;
    referenceImage = null;
    selection = emptySelection();
    activeGroupId = null;
    tool = "select";
    showBlockMesh = false;
    hideBuildings = false;
    hideStreetLines = false;
    syncStageUi(16);
    completeResultSettings = JSON.stringify(generateSettings);
    rememberGenerationState();
    rebuildEditorIndexes();
    refresh();
    // Double walls fall back to one curtain when the mesh has no room for an old
    // town (docs/plan/ce-multi-ring-walls.md §5); say why instead of staying silent.
    const doubleFallback =
      generateSettings.townWallRings === "double" && townCircuits(documentState).length < 2
        ? wallFallbackNotice(documentState)
        : "";
    showNotice(
      [roadWarning || editorText("cityEditor.messages.cityGeneratedWallsStreetsAndBuildings"), doubleFallback]
        .filter(Boolean)
        .join(" ")
    );
  }

  function runGenerationStage(stage: GenerationStage): void {
    if (!completeSource) {
      completeSource = documentState.fabric?.generation?.input
        ? clone(documentState.fabric.generation.input)
        : clone(documentState);
    }
    if (completeResult && completeResultSettings !== JSON.stringify(generateSettings)) {
      completeResult = null;
      clearGenerationPreviewCache();
    }
    if (!generationHistory.has(history.currentEntryKey))
      rememberGenerationState(undefined, lastGeneratedStep ?? (documentState.appearance === "town" ? 16 : 1));
    const source = clone(completeSource);
    const effectiveSeed = completeResult?.generationSeed ?? documentState.generationSeed ?? generateSeed;

    clearFailurePreview();
    pendingFailurePreview = null;
    generationLog.reset();
    let next: CityDocument | null = null;
    try {
      const finished =
        completeResult && (!completeResult.generationSeed || completeResult.generationSeed === effectiveSeed)
          ? completeResult
          : null;
      if (finished && ["blocks", "buildings", "conceal"].includes(stage.id)) {
        next = clone(finished);
      } else if (finished && stage.id === "geometry") {
        const s7 = clone(finished);
        delete s7.appearance;
        delete s7.fabric;
        next = s7;
      } else {
        next = generateStageOnDocument(
          source,
          generateSettings,
          effectiveSeed,
          stage.processStep,
          failureDebugInput.checked
            ? preview => {
                pendingFailurePreview = preview;
              }
            : undefined,
          stage.wallCheckpoint,
          sample => {
            generationLog.append(
              sample,
              sample.failure?.details?.find(line => line.startsWith("seed="))?.slice(5) ??
                (sample.attempt === 1 ? effectiveSeed : `${effectiveSeed}:junction-retry:${sample.attempt - 1}`)
            );
            if (sample.failure) logGenerationFailures([sample], { seed: effectiveSeed });
          }
        );
      }
    } catch (error) {
      console.error(error);
      appendGenerationException(error, effectiveSeed);
    }
    if (!next) {
      if (failureDebugInput.checked && pendingFailurePreview)
        showFailurePreview(
          pendingFailurePreview,
          editorText("cityEditor.messages.failedStage", { value0: stage.label })
        );
      pendingFailurePreview = null;
      showNotice(editorText("cityEditor.messages.generationFailedAt", { value0: stage.label }));
      return;
    }
    pendingFailurePreview = null;
    // Double walls fall back to one curtain when the town has no room for an
    // old town (docs/plan/ce-multi-ring-walls.md §5); say so rather than silently.
    const innerCheckpoint = stage.wallCheckpoint === "innerWall" || stage.wallCheckpoint === "firstInnerGates";
    const wallFallback =
      innerCheckpoint && next.townWallGeneration?.fallbackReason
        ? wallFallbackNotice(next, true)
        : generateSettings.townWallRings === "double" && next.appearance === "town" && townCircuits(next).length < 2
          ? wallFallbackNotice(next)
          : "";
    if (["buildings", "conceal"].includes(stage.id) && !completeResult) {
      completeResult = next;
      completeResultSettings = JSON.stringify(generateSettings);
    }
    lastGeneratedStep = stage.step;
    currentStageStep = stage.step;
    syncStageUi(stage.step);
    // This stage becomes the ◀/▶ scrub's target, reset to "not stepped yet".
    activeStepStage = stage.id;
    stepIndex = -1;
    stepStatus.textContent = "";
    // ③ itself keeps showing the debug tint on its finished core (nothing else
    // marks `buildable` on the document); every other stage already has its
    // own visual cue (river / walls+gates / roads / ward colours) and needs none.
    urbanCoreHighlight = stage.id === "urban" ? buildableLandFaceIds(next, generateSettings.urbanCoreMode) : null;
    stepOverlayPaths = null;
    hideBuildings = stage.id === "blocks";
    hideStreetLines = stage.id === "conceal";
    // Re-pressing the same stage on the same town is a no-op: keep the history
    // (and the undo timeline) clean.
    if (JSON.stringify(next) === JSON.stringify(documentState)) {
      rememberGenerationState(next.generationSeed ?? effectiveSeed);
      showNotice(wallFallback || editorText("cityEditor.messages.alreadyAt", { value0: stage.label }));
      redrawMap();
      return;
    }
    documentState = history.commit(
      next,
      editorText("cityEditor.messages.generateCityEditorPage", { value0: stage.label })
    );
    if (completeResult === next) completeResultSettings = JSON.stringify(generateSettings);
    rememberGenerationState(next.generationSeed ?? effectiveSeed);
    referenceImage = null;
    selection = emptySelection();
    activeGroupId = null;
    rebuildEditorIndexes();
    showNotice(wallFallback || editorText("cityEditor.messages.generatedUpTo", { value0: stage.label }));
  }

  /** ◀/▶: scrub whichever process ①…⑨ was last activated one loop iteration at
   * a time, right on the mesh (towngen-comparison.md) — independent of the
   * stage buttons themselves, which still jump straight to the finished result. */
  function runStep(delta: number): void {
    if (!activeStepStage) {
      showNotice(editorText("cityEditor.messages.pressAStageButtonFirst"));
      return;
    }
    const stage = activeStepStage;
    const label = generationStages(generateSettings).find(s => s.id === stage)?.label ?? "";
    const effectiveSeed = completeResult?.generationSeed ?? documentState.generationSeed ?? generateSeed;
    // Ward scrubbing is read-only and clones its output. Keep its weak cache
    // owned by the page's stable generation source rather than a temporary copy.
    const source = stage === "wards" ? (completeSource ?? documentState) : clone(completeSource ?? documentState);
    let result: UiStepResult;
    try {
      result = STEP_FNS[stage](source, generateSettings, effectiveSeed, stepIndex + delta);
    } catch (error) {
      console.error(error);
      showNotice(editorText("cityEditor.messages.stepFailed"));
      return;
    }
    if (!result.document || result.total === 0) {
      showNotice(editorText("cityEditor.messages.nothingToStepThroughFor", { value0: label }));
      return;
    }
    stepIndex = result.index;
    lastGeneratedStep = generationStages(generateSettings).find(s => s.id === stage)?.step ?? lastGeneratedStep;
    urbanCoreHighlight = result.highlightFaces ?? null;
    stepOverlayPaths = result.overlayPaths ?? null;
    stepStatus.textContent = `${label}: ${result.detail ?? ""}`;
    // Stepping past either end re-shows the same document: keep the history clean.
    if (JSON.stringify(result.document) === JSON.stringify(documentState)) {
      showNotice(editorText("cityEditor.messages.alreadyAtStep", { value0: result.index + 1, value1: result.total }));
      return;
    }
    documentState = history.commit(
      result.document,
      editorText("cityEditor.messages.processIterationProgress", {
        value0: label,
        value1: result.index + 1,
        value2: result.total
      })
    );
    rememberGenerationState(effectiveSeed);
    referenceImage = null;
    selection = emptySelection();
    activeGroupId = null;
    rebuildEditorIndexes();
    refresh(); // rebuildEditorIndexes() only rebuilds lookup tables — this repaints the SVG.
  }

  // --- Grid evolution (Phase G1) --------------------------------------------

  /** Rebuild the captured stages for the current params + seed, and jump to the
   * final one. Runs on the Preview button and live on every parameter-slider
   * `input` — `buildGridEvolution` is ~25 ms (stage count is capped), fast
   * enough to run per tick. */
  function runGridEvo(): void {
    try {
      gridEvoStages = buildGridEvolution(
        { extentMeters: documentState.frame.extentMeters, ...gridEvoParams },
        makeRng(gridEvoSeed)
      );
    } catch (error) {
      console.error(error);
      gridEvoStages = null;
      showNotice(editorText("cityEditor.messages.gridEvolutionFailed"));
    }
    gridEvoIndex = gridEvoStages ? gridEvoStages.length - 1 : 0;
    syncGridEvoUi();
    redrawMap();
  }

  function stepGridEvo(delta: number): void {
    if (!gridEvoStages?.length) return;
    const last = gridEvoStages.length - 1;
    gridEvoIndex = delta === -Infinity ? 0 : delta === Infinity ? last : clamp(gridEvoIndex + delta, 0, last);
    syncGridEvoUi();
    redrawMap();
  }

  function clearGridEvo(): void {
    if (!gridEvoStages) return;
    gridEvoStages = null;
    gridEvoIndex = 0;
    syncGridEvoUi();
    redrawMap();
  }

  function syncGridEvoUi(): void {
    const stages = gridEvoStages;
    const has = !!stages && stages.length > 0;
    for (const button of [
      gridEvoSlider,
      gridEvoFirstButton,
      gridEvoPrevButton,
      gridEvoNextButton,
      gridEvoLastButton,
      gridEvoAdoptButton
    ]) {
      button.disabled = !has;
    }
    if (!has || !stages) {
      gridEvoLabel.textContent = "";
      return;
    }
    gridEvoIndex = clamp(gridEvoIndex, 0, stages.length - 1);
    gridEvoSlider.max = String(stages.length - 1);
    gridEvoSlider.value = String(gridEvoIndex);
    gridEvoLabel.textContent = `${gridEvoIndex + 1} / ${stages.length} · ${stages[gridEvoIndex].label}`;
  }

  function gridOverlayForRender(): GridOverlay | null {
    if (!gridEvoStages?.length) return null;
    const stage = gridEvoStages[clamp(gridEvoIndex, 0, gridEvoStages.length - 1)];
    return { stage, ...gridEvoLayers };
  }

  /** Replace the document mesh with the shown stage's cells. Topology changes
   * wholesale, so feature groups / gates / elements are cleared (design §5.1
   * transfer report is a later milestone). */
  function adoptGridEvo(): void {
    const stages = gridEvoStages;
    if (!stages?.length) return;
    const stage = stages[clamp(gridEvoIndex, 0, stages.length - 1)];
    const mesh = meshFromCells(stage.cells);
    if (Object.keys(mesh.faces).length < 3) {
      showNotice(editorText("cityEditor.messages.thisStageHasTooFewCellsToUseAsA"));
      return;
    }
    const next: CityDocument = {
      ...documentState,
      gridKind: "evolution",
      mesh,
      featureGroups: [],
      gates: [],
      elements: []
    };
    delete next.appearance;
    if (validate(next).length) {
      showNotice(editorText("cityEditor.messages.theRebuiltGridFailedValidation"));
      return;
    }
    clearGridEvo();
    documentState = history.commit(next, editorText("cityEditor.messages.rebuildGrid", { value0: stage.label }));
    referenceImage = null;
    selection = emptySelection();
    activeGroupId = null;
    activeStepStage = null;
    stepIndex = -1;
    urbanCoreHighlight = null;
    stepOverlayPaths = null;
    stepStatus.textContent = "";
    lastGeneratedStep = null;
    completeSource = null;
    completeResult = null;
    clearGenerationPreviewCache();
    showBlockMesh = false;
    rebuildEditorIndexes();
    refresh();
    showNotice(editorText("cityEditor.messages.gridRebuiltCells", { value0: Object.keys(mesh.faces).length }));
  }
}

/** A ◀/▶ step result, unified across all generation processes — mirrors
 * `GenerationStepResult` but also carries ③'s face-tint highlight, since that
 * one adapts `generateUrbanPatchStep`'s own (slightly different) shape. */
interface UiStepResult {
  document: CityDocument | null;
  total: number;
  index: number;
  detail: string | null;
  highlightFaces?: Set<Id> | null;
  overlayPaths?: Point[][] | null;
}

type StepFn = (document: CityDocument, settings: GenerationSettings, seed: string, stepIndex: number) => UiStepResult;

function asUiStep(result: GenerationStepResult): UiStepResult {
  return {
    document: result.document,
    total: result.total,
    index: result.index,
    detail: result.detail,
    overlayPaths: result.overlayPaths ?? null
  };
}

const STEP_FNS: Record<GenerationStage["id"], StepFn> = {
  coast: (doc, settings, seed, idx) => asUiStep(generateCoastWalkStep(doc, settings, seed, idx)),
  river: (doc, settings, seed, idx) => asUiStep(generateRiverWalkStep(doc, settings, seed, idx)),
  urban: (doc, settings, seed, idx) => {
    const r = generateUrbanPatchStep(doc, settings, seed, idx);
    return {
      document: r.document,
      total: r.total,
      index: r.index,
      detail: r.total > 0 ? `cell #${r.cellId} — ${r.index + 1}/${r.total}` : null,
      highlightFaces: r.document ? buildableLandFaceIds(r.document, settings.urbanCoreMode) : null
    };
  },
  walls: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 4, undefined, "walls"),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.wallPlacementComplete");
    }
  }),
  riverPassages: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 4, undefined, "riverPassages"),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.riverCrossingCellSplitsAndWallRoutesComplete");
    }
  }),
  passages: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 4, undefined, "passages"),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.gatePassagesPrepared");
    }
  }),
  gates: (doc, settings, seed, idx) => asUiStep(generateGateStep(doc, settings, seed, idx)),
  streets: (doc, settings, seed, idx) => asUiStep(generateRoadStep(doc, settings, seed, idx)),
  wards: (doc, settings, seed, idx) => asUiStep(generateWardStep(doc, settings, seed, idx)),
  centerRoads: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 6),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.gateToCenterRoadsComplete");
    }
  }),
  townStreets: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 7, undefined, "streets"),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.townStreetsComplete");
    }
  }),
  innerWall: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 7, undefined, "innerWall"),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.innerWallComplete");
    }
  }),
  innerGates: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 7, undefined, "innerGates"),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.innerGatesAndRoadsComplete");
    }
  }),
  geometry: (doc, settings, seed) => {
    const d = generateStageOnDocument(doc, settings, seed, 7);
    return { document: d, total: 1, index: 0, detail: editorText("cityEditor.messages.geometrySmoothingComplete") };
  },
  blocks: (doc, settings, seed) => {
    const d = generateStageOnDocument(doc, settings, seed, 8);
    return { document: d, total: 1, index: 0, detail: editorText("cityEditor.messages.blocksAndLanesComplete") };
  },
  buildings: (doc, settings, seed) => {
    const d = generateStageOnDocument(doc, settings, seed, 9);
    return { document: d, total: 1, index: 0, detail: editorText("cityEditor.messages.housingPlacementComplete") };
  },
  conceal: (doc, settings, seed) => {
    const d = generateStageOnDocument(doc, settings, seed, 10);
    return { document: d, total: 1, index: 0, detail: editorText("cityEditor.messages.roadsAndLanesHidden") };
  }
};

/** The exact land faces a Generate press just marked buildable — the ③ urban-
 * core debug highlight's source set (towngen-comparison.md §2.1). */
function buildableLandFaceIds(document: CityDocument, coreMode?: "legacy" | "compact"): Set<Id> {
  const ids = new Set<Id>();
  for (const face of Object.values(document.mesh.faces)) {
    if (
      face.properties.water === "land" &&
      face.properties.buildable &&
      (coreMode !== "compact" || face.properties.settlement === "core")
    )
      ids.add(face.id);
  }
  return ids;
}

function describeImportedSite(descriptor: BurgSiteDescriptor, origin: IncomingOrigin | null): Node[] {
  const water = descriptor.waterbody
    ? `${editorOptionText(descriptor.waterbody.kind)}${descriptor.waterbody.isPort ? ` · ${editorOptionText("port")}` : ""}`
    : "none";
  const yesNo = (value: boolean): string =>
    value ? editorText("cityEditor.messages.yes") : editorText("cityEditor.messages.no");
  const source =
    origin === "world"
      ? editorText("cityEditor.messages.fromWorldMap")
      : origin === "link"
        ? editorText("cityEditor.messages.fromSharedLink")
        : editorText("cityEditor.messages.importedSite");
  const roads = descriptor.roads.filter(road => road.group !== "searoutes");
  const dwellings = descriptor.burg.dwellings ?? getUrbanDwellings(descriptor.burg.population);
  const rows: [string, string][] = [
    [source, descriptor.burg.name || "(unnamed burg)"],
    [editorText("cityEditor.messages.population"), descriptor.burg.population.toLocaleString()],
    [editorText("cityEditor.messages.dwellings"), dwellings.toLocaleString()],
    [editorText("cityEditor.messages.radius"), `${Math.round(descriptor.frame.cityRadiusMeters)} m`],
    [editorText("cityEditor.messages.coast"), water],
    [editorText("cityEditor.messages.rivers"), String(descriptor.rivers.length)],
    [editorText("cityEditor.messages.roads"), String(roads.length)],
    [editorText("cityEditor.messages.gates"), String(descriptor.suggestedGates)],
    [editorText("cityEditor.messages.walls"), yesNo(descriptor.burg.walls)],
    [editorText("cityEditor.messages.citadel"), yesNo(descriptor.burg.citadel)],
    [
      editorText("cityEditor.messages.plazaTemple"),
      `${yesNo(descriptor.burg.plaza)} · ${yesNo(descriptor.burg.temple)}`
    ],
    [
      editorText("cityEditor.messages.port"),
      descriptor.burg.port
        ? descriptor.waterbody
          ? editorText("cityEditor.messages.yes")
          : editorText("cityEditor.messages.yesNoWaterbody")
        : editorText("cityEditor.messages.no")
    ]
  ];
  if (descriptor.urbanMorphology) {
    const history = descriptor.urbanMorphology;
    rows.push([
      editorText(
        history.foundedSource === "estimated"
          ? "cityEditor.messages.estimatedUrbanFounding"
          : "cityEditor.messages.urbanFounding"
      ),
      String(history.foundedYear)
    ]);
    rows.push([
      editorText("cityEditor.messages.urbanWallYears"),
      history.wallPhases.map(p => p.year).join(" → ") || "—"
    ]);
  }
  const distanceText = (distance: number | null | undefined): string =>
    distance != null && Number.isFinite(distance) && distance >= 0
      ? formatDistance(distance)
      : editorText("cityEditor.fmgParameters.unknownDistance");
  const waterDistances: [string, string][] = [];
  if (descriptor.waterbody) {
    waterDistances.push([
      editorText(
        descriptor.waterbody.kind === "lake"
          ? "cityEditor.fmgParameters.lakeShoreDistance"
          : "cityEditor.fmgParameters.coastDistance"
      ),
      distanceText(shoreDistanceMeters(descriptor.waterbody))
    ]);
  }
  for (const river of descriptor.rivers) {
    const riverName = river.name || editorText("cityEditor.fmgParameters.unnamedRiver", { id: river.riverId });
    waterDistances.push([
      editorText("cityEditor.fmgParameters.riverDistance", { river: riverName }),
      distanceText(river.rawOffsetMeters ?? river.offsetMeters)
    ]);
  }
  rows.splice(6, 0, ...waterDistances);
  const waterfront = descriptor.burg.waterfrontCheck;
  if (waterfront?.status === "failed") {
    const issues = waterfront.issues.map(issue =>
      issue.kind === "shore-distance"
        ? editorText("cityEditor.fmgParameters.shoreBeyond", { meters: issue.excessMeters ?? 0 })
        : issue.kind === "bank-distance"
          ? editorText("cityEditor.fmgParameters.bankBeyond", { meters: issue.excessMeters ?? 0 })
          : issue.kind === "river-unresolved"
            ? editorText("cityEditor.fmgParameters.riverUnresolved", { reason: issue.reason ?? "" })
            : editorText("cityEditor.fmgParameters.shoreMissing")
    );
    rows.unshift([
      editorText("cityEditor.fmgParameters.waterfrontCheck"),
      editorText("cityEditor.fmgParameters.waterfrontFailed", { issues: issues.join("; ") })
    ]);
  }
  const nodes: Node[] = rows.map(([key, value]) => {
    const line = document.createElement("div");
    line.className = "ce-imported-row";
    if (waterDistances.some(([label]) => label === key)) {
      line.title = editorText("cityEditor.fmgParameters.distanceReference");
    }
    if (waterfront && key === editorText("cityEditor.fmgParameters.waterfrontCheck")) {
      line.title = editorText("cityEditor.fmgParameters.waterfrontReview");
      line.classList.add("ce-imported-warning");
      line.style.color = "#c62828";
    }
    const labelNode = document.createElement("span");
    labelNode.textContent = key;
    const valueNode = document.createElement("strong");
    valueNode.textContent = value;
    valueNode.title = value;
    line.append(labelNode, valueNode);
    return line;
  });
  const preview = renderFixedSitePreview(descriptor);
  if (preview) {
    const caption = document.createElement("div");
    caption.textContent = editorText("cityEditor.messages.importedFixedRiverCrossingsAndRoadDirections");
    nodes.push(caption, preview);
  }
  return nodes;
}

function emptySelection(): RenderSelection {
  return {
    faceId: null,
    edgeId: null,
    vertexId: null,
    groupId: null,
    hoverGroupId: null,
    hoverVertexId: null,
    hoverEdgeId: null
  };
}

function isRoutePaintTool(tool: Tool): tool is RoutePaintKind {
  return tool === "river" || tool === "road" || tool === "wall";
}

function isBrushTool(tool: Tool): tool is "ward" | "sea" | "junction" {
  return isPaintBrushTool(tool) || tool === "junction";
}

function isPaintBrushTool(tool: Tool): tool is "ward" | "sea" {
  return tool === "ward" || tool === "sea";
}

function targetId(event: Event, kind: "vertex" | "route-vertex" | "edge" | "face" | "group"): Id | null {
  const target = event.target instanceof Element ? event.target.closest(`[data-${kind}]`) : null;
  return target?.getAttribute(`data-${kind}`) ?? null;
}

let highestPanelZIndex = 10;

export function bringPanelToFront(panel: HTMLElement): void {
  const allPanels = Array.from(document.querySelectorAll<HTMLElement>(".ce-panel"));
  let maxZ = highestPanelZIndex;
  allPanels.forEach(p => {
    const z = parseInt(p.style.zIndex || "", 10);
    if (!Number.isNaN(z) && z > maxZ) maxZ = z;
  });
  const currentZ = parseInt(panel.style.zIndex || "", 10);
  if (Number.isNaN(currentZ) || currentZ < maxZ) {
    if (maxZ > 9000) {
      const sorted = allPanels
        .map(p => ({ panel: p, z: parseInt(p.style.zIndex || "4", 10) }))
        .sort((a, b) => a.z - b.z);
      sorted.forEach((item, index) => {
        item.panel.style.zIndex = `${10 + index}`;
      });
      highestPanelZIndex = 10 + sorted.length;
      maxZ = highestPanelZIndex;
    }
    highestPanelZIndex = maxZ + 1;
    panel.style.zIndex = `${highestPanelZIndex}`;
  }
}

function floatingWindow(className: string, title: string): FloatingWindow {
  const root = div(`ce-panel ${className}`);
  const titlebar = div("ce-panel-titlebar");
  const content = div("ce-panel-content");
  content.id = `${className.trim().split(/\s+/)[0]}-body`;
  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.className = "ce-panel-collapse";
  collapse.setAttribute("aria-controls", content.id);
  const setCollapsed = (collapsed: boolean): void => {
    root.classList.toggle("ce-panel--collapsed", collapsed);
    content.hidden = collapsed;
    const label = collapsed ? editorText("cityEditor.messages.restore") : editorText("cityEditor.messages.minimize");
    collapse.textContent = collapsed ? "▲" : "▼";
    collapse.title = label;
    collapse.setAttribute("aria-label", label);
    collapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
  };
  setCollapsed(false);
  collapse.addEventListener("pointerdown", event => event.stopPropagation());
  collapse.addEventListener("click", () => setCollapsed(!content.hidden));
  const actions = div("ce-panel-titlebar-actions");
  const grip = text("⠿");
  grip.setAttribute("aria-hidden", "true");
  actions.append(collapse, grip);
  titlebar.append(heading(title), actions);
  root.append(titlebar, content);
  root.addEventListener("pointerdown", () => bringPanelToFront(root), true);
  root.addEventListener("focusin", () => bringPanelToFront(root));
  makeWindowDraggable(root, titlebar);
  return { root, content };
}

function div(className = ""): HTMLDivElement {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

function heading(value: string): HTMLHeadingElement {
  const node = document.createElement("h1");
  node.textContent = value;
  return node;
}

function text(value: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.textContent = value;
  return node;
}

function makeButton(value: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = value;
  node.addEventListener("click", onClick);
  return node;
}

function makeIconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = makeButton(icon, onClick);
  node.className = "ce-icon-button";
  node.title = label;
  node.setAttribute("aria-label", label);
  return node;
}

function makeWindowDraggable(windowNode: HTMLElement, handle: HTMLElement): void {
  let startX = 0;
  let startY = 0;
  let left = 0;
  let top = 0;
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea")) return;
    event.preventDefault();
    bringPanelToFront(windowNode);
    const bounds = windowNode.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    left = bounds.left;
    top = bounds.top;
    windowNode.classList.add("ce-panel--dragging");
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", event => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    const bounds = windowNode.getBoundingClientRect();
    const nextLeft = clamp(left + event.clientX - startX, 8, Math.max(8, window.innerWidth - bounds.width - 8));
    const nextTop = clamp(top + event.clientY - startY, 8, Math.max(8, window.innerHeight - bounds.height - 8));
    windowNode.style.left = `${nextLeft}px`;
    windowNode.style.top = `${nextTop}px`;
    windowNode.style.right = "auto";
    windowNode.style.bottom = "auto";
  });
  const finish = (event: PointerEvent): void => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    windowNode.classList.remove("ce-panel--dragging");
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
}

function numberInput(value: string, min: string, step: string): HTMLInputElement {
  const node = document.createElement("input");
  node.type = "number";
  node.value = value;
  node.min = min;
  node.step = step;
  return node;
}

function rangeInput(value: string, min: string, max: string, step: string): HTMLInputElement {
  const node = document.createElement("input");
  node.type = "range";
  node.value = value;
  node.min = min;
  node.max = max;
  node.step = step;
  return node;
}

function checkbox(checked: boolean, onChange: (checked: boolean) => void): HTMLInputElement {
  const node = document.createElement("input");
  node.type = "checkbox";
  node.checked = checked;
  node.addEventListener("change", () => onChange(node.checked));
  return node;
}

function toggleLabel(caption: string, input: HTMLInputElement): HTMLLabelElement {
  const node = document.createElement("label");
  node.className = "ce-toggle";
  node.append(input, document.createTextNode(caption));
  return node;
}

function select(values: string[], selected: string): HTMLSelectElement {
  const node = document.createElement("select");
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = editorOptionText(value);
    option.selected = value === selected;
    node.appendChild(option);
  }
  return node;
}

function label(value: string, control: HTMLElement): HTMLLabelElement {
  const node = document.createElement("label");
  node.textContent = `${value} `;
  node.appendChild(control);
  return node;
}

function divider(): HTMLHRElement {
  return document.createElement("hr");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function niceScale(targetMeters: number): number {
  const exponent = 10 ** Math.floor(Math.log10(Math.max(targetMeters, 1)));
  const normalized = targetMeters / exponent;
  const unit = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return unit * exponent;
}

function formatDistance(meters: number): string {
  const rounded = meters >= 1000 ? rn(meters / 1000, 2) : rn(meters, 1);
  return meters >= 1000 ? `${rounded} km` : `${rounded} m`;
}

function formatClock(time: number): string {
  return new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function pointToSegmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const ratio = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (a[0] + ratio * dx), point[1] - (a[1] + ratio * dy));
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [x, y] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    if (y > point[1] === previousY > point[1]) continue;
    const crossingX = ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (point[0] < crossingX) inside = !inside;
  }
  return inside;
}

/** Whether a circular Ward brush reaches any part of a cell polygon. */
function circleIntersectsPolygon(center: Point, radius: number, polygon: Point[]): boolean {
  if (pointInPolygon(center, polygon)) return true;
  for (let index = 0; index < polygon.length; index++) {
    if (pointToSegmentDistance(center, polygon[index], polygon[(index + 1) % polygon.length]) <= radius) return true;
  }
  return false;
}

function vertexPairKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

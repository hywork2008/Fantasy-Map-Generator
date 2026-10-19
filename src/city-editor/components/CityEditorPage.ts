import { type EditorMessageKey, editorOptionText, editorText } from "../../i18n/editorMessages";
import { createContextMenuController } from "../controllers/contextMenu";
import { createDocumentIOController } from "../controllers/documentIO";
import { createEditingController } from "../controllers/editing";
import { createGenerationController } from "../controllers/generation";
import { generationLogPanel } from "../controllers/generationLogPanel";
import { createGenerationPlaybackController } from "../controllers/generationPlayback";
import { createGridPreviewController } from "../controllers/gridPreview";
import { createHistoryController } from "../controllers/history";
import { createInspectorController } from "../controllers/inspector";
import { createLayersController } from "../controllers/layers";
import { createMapDisplayController } from "../controllers/mapDisplay";
import { bindPanelEvents } from "../controllers/panelEvents";
import { createSpatialIndexController } from "../controllers/spatialIndex";
import { createBrushesController } from "../controllers/tools/brushes";
import { createDragCompletionController } from "../controllers/tools/dragCompletion";
import { bindKeyboard } from "../controllers/tools/keyboard";
import { bindMapAuxiliary } from "../controllers/tools/mapAuxiliary";
import { bindMapClick } from "../controllers/tools/mapClick";
import { bindMapContext } from "../controllers/tools/mapContext";
import { bindPointerDown } from "../controllers/tools/pointerDown";
import { bindPointerMove } from "../controllers/tools/pointerMove";
import { createRoutesController } from "../controllers/tools/routes";
import { createSelectionController } from "../controllers/tools/selection";
import { cityFixedApproachProvider } from "../generators/automaticFixedApproaches";
import { DEFAULT_CASTLE_SETTINGS } from "../generators/castlePlacement";
import { createGridDocument, DEFAULT_CITY_SIZE, DEFAULT_GRID_KIND } from "../generators/document";
import { restoreFixedCrossingApproaches } from "../generators/fixedApproachAdoption";
import { clearGenerationPreviewCache } from "../generators/generation/previews";
import { defaultGenerationSettings, randomGeography, randomSeed } from "../generators/generation/settings";
import { DEFAULT_HEX_SIZE_METERS } from "../generators/hexGrid";
import { DocumentHistory } from "../generators/history";
import { clone } from "../generators/mesh";
import { DEFAULT_PATCH_PARAMS } from "../generators/patches";
import { CASTLE_STYLE_PROFILES } from "../renderers/castlePatterns";
import { mountCity3d } from "../renderers/cityView";
import { clearRenderDerivedCaches } from "../renderers/derivedCaches";
import type { GridOverlay } from "../renderers/overlays/editorOverlays";
import { SHIP_SPECS } from "../renderers/shipSpecifications";
import { readMaxPatchesPreference } from "../services/browserPreferences";
import { beginEditorMount } from "../services/editorLifetime";
import { type ImportedCityMap, pickCityMap } from "../services/io/cityEditorFile";
import { type CityEditorShare, readIncomingCity } from "../services/io/incomingCity";
import type { DisplayState, GenerationState, InteractionState } from "../state/editorSession";
import { createDocumentsState } from "../state/editorSession";
import type { FixedApproachProvider } from "../types/contracts/fixedApproachAdoption";
import type { GenerationDebugPreview } from "../types/contracts/generationDebug";
import type { IncomingOrigin } from "../types/contracts/incomingCity";
import type { InfillLane } from "../types/contracts/localInfill";
import type {
  CastleSettings,
  CityDocument,
  FeatureGroup,
  Id,
  LandmarkAsset,
  Point,
  Tool,
  WardKind
} from "../types/document";
import type { ContextMenuAction, RoutePaintKind, RouteStroke } from "../types/editor";
import type { GenerationSettings, GenerationStage } from "../types/generation";
import type { RenderSelection } from "../types/selection";
import { buildDocumentPanel } from "./documentPanel";
import { createEditorControls, div, text } from "./editorControls";
import { buildFacilityPanel } from "./facilityPanel";
import { buildGenerationPanel } from "./generationPanel";

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

export interface CityEditorOptions {
  /** Complete current water/support/passage contract; retained only in this editor session. */
  fixedApproachProvider?: FixedApproachProvider;
}

export function mountCityEditor(root: HTMLElement, options: CityEditorOptions = {}): () => void {
  const scope = beginEditorMount(root);
  let syncCity3d = (): void => {};
  let editingController: ReturnType<typeof createEditingController> | undefined;
  function getEditingController() {
    if (!editingController)
      editingController = createEditingController({
        get scope() {
          return scope;
        },
        get documents() {
          return documents;
        },
        get refresh() {
          return refresh;
        },
        get generation() {
          return generation;
        },
        get showNotice() {
          return showNotice;
        },
        get clearGridEvo() {
          return clearGridEvo;
        },
        get rememberFailureGenerationState() {
          return rememberFailureGenerationState;
        },
        get rebuildEditorIndexes() {
          return rebuildEditorIndexes;
        },
        get stepStatus() {
          return stepStatus;
        },
        get display() {
          return display;
        },
        get syncStageUi() {
          return syncStageUi;
        },
        set syncStageUi(value) {
          syncStageUi = value;
        },
        get syncGenerateControls() {
          return syncGenerateControls;
        },
        get interaction() {
          return interaction;
        }
      });
    return editingController;
  }
  let spatialIndexController: ReturnType<typeof createSpatialIndexController> | undefined;
  function getSpatialIndexController() {
    if (!spatialIndexController)
      spatialIndexController = createSpatialIndexController({
        get edgeIdsByVertex() {
          return edgeIdsByVertex;
        },
        set edgeIdsByVertex(value) {
          edgeIdsByVertex = value;
        },
        get documents() {
          return documents;
        },
        get routeEdgesByGroup() {
          return routeEdgesByGroup;
        },
        set routeEdgesByGroup(value) {
          routeEdgesByGroup = value;
        },
        get routeGroupsByEdge() {
          return routeGroupsByEdge;
        },
        set routeGroupsByEdge(value) {
          routeGroupsByEdge = value;
        },
        get faceBucketSize() {
          return faceBucketSize;
        },
        set faceBucketSize(value) {
          faceBucketSize = value;
        },
        get faceBuckets() {
          return faceBuckets;
        },
        set faceBuckets(value) {
          faceBuckets = value;
        },
        get vertexBuckets() {
          return vertexBuckets;
        },
        set vertexBuckets(value) {
          vertexBuckets = value;
        }
      });
    return spatialIndexController;
  }
  function panelEventContext() {
    return {
      get scope() {
        return scope;
      },
      get landmarkSelect() {
        return landmarkSelect;
      },
      get interaction() {
        return interaction;
      },
      get refresh() {
        return refresh;
      },
      get landmarkAngle() {
        return landmarkAngle;
      },
      get updateLandmarkPreview() {
        return updateLandmarkPreview;
      },
      get landmarkFile() {
        return landmarkFile;
      },
      get documents() {
        return documents;
      },
      get commit() {
        return commit;
      },
      get showNotice() {
        return showNotice;
      },
      get shipSelect() {
        return shipSelect;
      },
      get shipSizeInput() {
        return shipSizeInput;
      },
      get updateShipPreview() {
        return updateShipPreview;
      },
      get shipAngle() {
        return shipAngle;
      },
      get hexSizeInput() {
        return hexSizeInput;
      },
      get hexSizeValue() {
        return hexSizeValue;
      },
      get gridKindSelect() {
        return gridKindSelect;
      },
      get syncGridKindUi() {
        return syncGridKindUi;
      },
      get showLabelsInput() {
        return showLabelsInput;
      },
      get display() {
        return display;
      },
      get redrawMap() {
        return redrawMap;
      },
      get brushSizeInput() {
        return brushSizeInput;
      },
      get brushSizeValue() {
        return brushSizeValue;
      },
      get brushSizeText() {
        return brushSizeText;
      },
      get updateWardBrushPreview() {
        return updateWardBrushPreview;
      },
      get eraseTargetInput() {
        return eraseTargetInput;
      },
      get junctionMaxGapInput() {
        return junctionMaxGapInput;
      },
      get junctionMaxGapValue() {
        return junctionMaxGapValue;
      },
      get refreshJunctionGapScale() {
        return refreshJunctionGapScale;
      },
      get gridEvoSlider() {
        return gridEvoSlider;
      },
      get generation() {
        return generation;
      },
      get syncGridEvoUi() {
        return syncGridEvoUi;
      },
      get currentBuildingPatternSelect() {
        return currentBuildingPatternSelect;
      },
      get syncGenerateControls() {
        return syncGenerateControls;
      },
      get historicalPeriodSelect() {
        return historicalPeriodSelect;
      },
      get layoutSelect() {
        return layoutSelect;
      },
      get buildingPatternSelect() {
        return buildingPatternSelect;
      },
      get coastSelect() {
        return coastSelect;
      },
      get seaWallSelect() {
        return seaWallSelect;
      },
      get wallMaterialSelect() {
        return wallMaterialSelect;
      },
      get riversSelect() {
        return riversSelect;
      },
      get riverPlacementSelect() {
        return riverPlacementSelect;
      },
      get stageSlider() {
        return stageSlider;
      },
      get setStageStep() {
        return setStageStep;
      },
      get urbanNPatchesInput() {
        return urbanNPatchesInput;
      },
      get urbanCoreModeSelect() {
        return urbanCoreModeSelect;
      },
      get rerunLastStage() {
        return rerunLastStage;
      },
      get walledShareInput() {
        return walledShareInput;
      },
      get townWallBuildOrderSelect() {
        return townWallBuildOrderSelect;
      },
      get syncStageUi() {
        return syncStageUi;
      },
      set syncStageUi(value) {
        syncStageUi = value;
      },
      get townWallRingsSelect() {
        return townWallRingsSelect;
      },
      get inferredHistoryWalls() {
        return inferredHistoryWalls;
      },
      get farNodeSelect() {
        return farNodeSelect;
      },
      get syncBearingsRow() {
        return syncBearingsRow;
      },
      get bearingsInput() {
        return bearingsInput;
      },
      get renderQualitySelect() {
        return renderQualitySelect;
      },
      get seedInput() {
        return seedInput;
      },
      get runCompleteGeneration() {
        return runCompleteGeneration;
      },
      get map() {
        return map;
      },
      get importMapFile() {
        return importMapFile;
      },
      get hideWardBrushPreview() {
        return hideWardBrushPreview;
      },
      get hideCircularWallPreview() {
        return hideCircularWallPreview;
      },
      get finishDrag() {
        return finishDrag;
      },
      get scheduleRedraw() {
        return scheduleRedraw;
      },
      get updateViewport() {
        return updateViewport;
      },
      get updateCircularWallPreview() {
        return updateCircularWallPreview;
      },
      get refreshScaleBar() {
        return refreshScaleBar;
      }
    };
  }

  let mapDisplayController: ReturnType<typeof createMapDisplayController> | undefined;
  function getMapDisplayController() {
    if (!mapDisplayController)
      mapDisplayController = createMapDisplayController({
        get scope() {
          return scope;
        },
        get documents() {
          return documents;
        },
        get landmarkSelect() {
          return landmarkSelect;
        },
        get interaction() {
          return interaction;
        },
        get landmarkControls() {
          return landmarkControls;
        },
        get shipControls() {
          return shipControls;
        },
        get currentBuildingPatternSelect() {
          return currentBuildingPatternSelect;
        },
        get historicalPeriodSelect() {
          return historicalPeriodSelect;
        },
        get walledShareInput() {
          return walledShareInput;
        },
        get inferredHistoryWalls() {
          return inferredHistoryWalls;
        },
        get map() {
          return map;
        },
        get toolButtons() {
          return toolButtons;
        },
        get undoButton() {
          return undoButton;
        },
        get redoButton() {
          return redoButton;
        },
        get blockMeshInput() {
          return blockMeshInput;
        },
        get display() {
          return display;
        },
        get gridLinesInput() {
          return gridLinesInput;
        },
        get paintButtons() {
          return paintButtons;
        },
        get brushSizeInput() {
          return brushSizeInput;
        },
        get brushSizeLabel() {
          return brushSizeLabel;
        },
        get brushSizeValue() {
          return brushSizeValue;
        },
        get brushSizeText() {
          return brushSizeText;
        },
        get junctionMaxGapInput() {
          return junctionMaxGapInput;
        },
        get junctionMaxGapLabel() {
          return junctionMaxGapLabel;
        },
        get junctionMaxGapValue() {
          return junctionMaxGapValue;
        },
        get hideWardBrushPreview() {
          return hideWardBrushPreview;
        },
        get updateWardBrushPreview() {
          return updateWardBrushPreview;
        },
        get hideCircularWallPreview() {
          return hideCircularWallPreview;
        },
        get updateCircularWallPreview() {
          return updateCircularWallPreview;
        },
        get renderInspector() {
          return renderInspector;
        },
        get renderGroups() {
          return renderGroups;
        },
        get renderHistory() {
          return renderHistory;
        },
        get status() {
          return status;
        },
        get redrawHandle() {
          return redrawHandle;
        },
        set redrawHandle(value) {
          redrawHandle = value;
        },
        get updateMeasureOverlay() {
          return updateMeasureOverlay;
        },
        get generation() {
          return generation;
        },
        get failureDebugSummary() {
          return failureDebugSummary;
        },
        get closeFailurePreview() {
          return closeFailurePreview;
        },
        get housingSummary() {
          return housingSummary;
        },
        get faceElementsById() {
          return faceElementsById;
        },
        set faceElementsById(value) {
          faceElementsById = value;
        },
        get wardLandmarksGroup() {
          return wardLandmarksGroup;
        },
        set wardLandmarksGroup(value) {
          wardLandmarksGroup = value;
        },
        get wardLandmarkElementsById() {
          return wardLandmarkElementsById;
        },
        set wardLandmarkElementsById(value) {
          wardLandmarkElementsById = value;
        },
        get documentForOutput() {
          return documentForOutput;
        },
        get gridOverlayForRender() {
          return gridOverlayForRender;
        },
        get root() {
          return root;
        },
        get renderQualitySelect() {
          return renderQualitySelect;
        },
        get vacantTreesInput() {
          return vacantTreesInput;
        },
        get generateVacantTreesButton() {
          return generateVacantTreesButton;
        },
        get coreLayerInput() {
          return coreLayerInput;
        },
        get regionalLayerInput() {
          return regionalLayerInput;
        },
        get scaleLine() {
          return scaleLine;
        },
        get scaleLabel() {
          return scaleLabel;
        },
        get junctionGapLine() {
          return junctionGapLine;
        },
        get junctionGapLength() {
          return junctionGapLength;
        }
      });
    return mapDisplayController;
  }
  const documents = createDocumentsState(previous => {
    if (previous) clearRenderDerivedCaches(previous);
    documents.lastOutputDocInput = null;
    documents.lastOutputDocResult = null;
    scope.invalidate("import");
    if (!generation.acceptingResult) generation.generationJob?.cancel();
  });
  const interaction = {} as InteractionState;
  const generation = { acceptingResult: false } as GenerationState;
  const display = {} as DisplayState;
  const controls = createEditorControls(scope);
  let inspectorController: ReturnType<typeof createInspectorController> | undefined;
  function getInspectorController() {
    if (!inspectorController)
      inspectorController = createInspectorController({
        controls,
        get scope() {
          return scope;
        },
        get commit() {
          return commit;
        },
        get runContextAction() {
          return runContextAction;
        },
        get showNotice() {
          return showNotice;
        },
        get showContextMenuAt() {
          return showContextMenuAt;
        },
        get inspector() {
          return inspector;
        },
        get applySelection() {
          return applySelection;
        },
        get preservedLandmarkLanes() {
          return preservedLandmarkLanes;
        },
        get refresh() {
          return refresh;
        },
        documents,
        interaction
      });
    return inspectorController;
  }
  let historyController: ReturnType<typeof createHistoryController> | undefined;
  function getHistoryController() {
    if (!historyController)
      historyController = createHistoryController({
        controls,
        get historyListEl() {
          return historyListEl;
        },
        set historyListEl(value) {
          historyListEl = value;
        },
        get historyRows() {
          return historyRows;
        },
        set historyRows(value) {
          historyRows = value;
        },
        get scope() {
          return scope;
        },
        get historyPanel() {
          return historyPanel;
        },
        get historyClearButton() {
          return historyClearButton;
        },
        set historyClearButton(value) {
          historyClearButton = value;
        },
        get rememberGenerationState() {
          return rememberGenerationState;
        },
        get showNotice() {
          return showNotice;
        },
        get refreshUiOnly() {
          return refreshUiOnly;
        },
        get historySummaryEl() {
          return historySummaryEl;
        },
        set historySummaryEl(value) {
          historySummaryEl = value;
        },
        get restore() {
          return restore;
        },
        documents
      });
    return historyController;
  }
  let layersController: ReturnType<typeof createLayersController> | undefined;
  function getLayersController() {
    if (!layersController)
      layersController = createLayersController({
        controls,
        get scope() {
          return scope;
        },
        get groups() {
          return groups;
        },
        get refresh() {
          return refresh;
        },
        get commit() {
          return commit;
        },
        get showNotice() {
          return showNotice;
        },
        documents,
        interaction
      });
    return layersController;
  }
  let generationController: ReturnType<typeof createGenerationController> | undefined;
  function getGenerationController() {
    if (!generationController)
      generationController = createGenerationController({
        root,
        get scope() {
          return scope;
        },
        get rememberGenerationState() {
          return rememberGenerationState;
        },
        get clearFailurePreview() {
          return clearFailurePreview;
        },
        get generationLog() {
          return generationLog;
        },
        get generationProgress() {
          return generationProgress;
        },
        get failureDebugInput() {
          return failureDebugInput;
        },
        get cancelGeneration() {
          return cancelGeneration;
        },
        get appendGenerationException() {
          return appendGenerationException;
        },
        get size() {
          return size;
        },
        get showFailurePreview() {
          return showFailurePreview;
        },
        get showNotice() {
          return showNotice;
        },
        get documentForOutput() {
          return documentForOutput;
        },
        get stepStatus() {
          return stepStatus;
        },
        get syncStageUi() {
          return syncStageUi;
        },
        set syncStageUi(value) {
          syncStageUi = value;
        },
        get rebuildEditorIndexes() {
          return rebuildEditorIndexes;
        },
        get refresh() {
          return refresh;
        },
        get wallFallbackNotice() {
          return wallFallbackNotice;
        },
        get redrawMap() {
          return redrawMap;
        },
        get seedInput() {
          return seedInput;
        },
        get syncSkeletonControls() {
          return syncSkeletonControls;
        },
        get moatInputs() {
          return moatInputs;
        },
        get castleInputs() {
          return castleInputs;
        },
        get buildingPatternSelect() {
          return buildingPatternSelect;
        },
        get layoutSelect() {
          return layoutSelect;
        },
        get coastSelect() {
          return coastSelect;
        },
        get seaWallSelect() {
          return seaWallSelect;
        },
        get wallMaterialSelect() {
          return wallMaterialSelect;
        },
        get riversSelect() {
          return riversSelect;
        },
        get riverPlacementSelect() {
          return riverPlacementSelect;
        },
        get reliefInput() {
          return reliefInput;
        },
        get featureInputs() {
          return featureInputs;
        },
        get urbanCoreModeSelect() {
          return urbanCoreModeSelect;
        },
        get urbanNPatchesInput() {
          return urbanNPatchesInput;
        },
        get walledShareInput() {
          return walledShareInput;
        },
        get townWallRingsSelect() {
          return townWallRingsSelect;
        },
        get townWallRingsValue() {
          return townWallRingsValue;
        },
        get townWallBuildOrderSelect() {
          return townWallBuildOrderSelect;
        },
        get avoidSeaInput() {
          return avoidSeaInput;
        },
        get farNodeSelect() {
          return farNodeSelect;
        },
        get bearingsInput() {
          return bearingsInput;
        },
        get bearingsLabel() {
          return bearingsLabel;
        },
        get importedBox() {
          return importedBox;
        },
        get synthControls() {
          return synthControls;
        },
        get importedText() {
          return importedText;
        },
        documents,
        interaction,
        generation,
        display
      });
    return generationController;
  }
  let generationPlaybackController: ReturnType<typeof createGenerationPlaybackController> | undefined;
  function getGenerationPlaybackController() {
    if (!generationPlaybackController)
      generationPlaybackController = createGenerationPlaybackController({
        get stepStatus() {
          return stepStatus;
        },
        get clearGridEvo() {
          return clearGridEvo;
        },
        get rebuildEditorIndexes() {
          return rebuildEditorIndexes;
        },
        get failureDebugSummary() {
          return failureDebugSummary;
        },
        get closeFailurePreview() {
          return closeFailurePreview;
        },
        get refresh() {
          return refresh;
        },
        get redrawMap() {
          return redrawMap;
        },
        get generationLog() {
          return generationLog;
        },
        documents,
        interaction,
        generation,
        display
      });
    return generationPlaybackController;
  }
  let documentIOController: ReturnType<typeof createDocumentIOController> | undefined;
  function getDocumentIOController() {
    if (!documentIOController)
      documentIOController = createDocumentIOController({
        get fixedApproachProvider() {
          return fixedApproachProvider;
        },
        get scope() {
          return scope;
        },
        get showNotice() {
          return showNotice;
        },
        get generationLog() {
          return generationLog;
        },
        get rebuildEditorIndexes() {
          return rebuildEditorIndexes;
        },
        get stepStatus() {
          return stepStatus;
        },
        get syncGenerateControls() {
          return syncGenerateControls;
        },
        get clearGridEvo() {
          return clearGridEvo;
        },
        get size() {
          return size;
        },
        get syncGridParamControls() {
          return syncGridParamControls;
        },
        get gridKindSelect() {
          return gridKindSelect;
        },
        get hexSizeInput() {
          return hexSizeInput;
        },
        get hexSizeValue() {
          return hexSizeValue;
        },
        get syncGridKindUi() {
          return syncGridKindUi;
        },
        get failureDebugInput() {
          return failureDebugInput;
        },
        get runCompleteGeneration() {
          return runCompleteGeneration;
        },
        get runGenerationStage() {
          return runGenerationStage;
        },
        get syncStageUi() {
          return syncStageUi;
        },
        documents,
        interaction,
        generation,
        display
      });
    return documentIOController;
  }
  let gridPreviewController: ReturnType<typeof createGridPreviewController> | undefined;
  function getGridPreviewController() {
    if (!gridPreviewController)
      gridPreviewController = createGridPreviewController({
        get showNotice() {
          return showNotice;
        },
        get redrawMap() {
          return redrawMap;
        },
        get gridEvoSlider() {
          return gridEvoSlider;
        },
        get gridEvoFirstButton() {
          return gridEvoFirstButton;
        },
        get gridEvoPrevButton() {
          return gridEvoPrevButton;
        },
        get gridEvoNextButton() {
          return gridEvoNextButton;
        },
        get gridEvoLastButton() {
          return gridEvoLastButton;
        },
        get gridEvoAdoptButton() {
          return gridEvoAdoptButton;
        },
        get gridEvoLabel() {
          return gridEvoLabel;
        },
        get stepStatus() {
          return stepStatus;
        },
        get rebuildEditorIndexes() {
          return rebuildEditorIndexes;
        },
        get refresh() {
          return refresh;
        },
        documents,
        interaction,
        generation,
        display
      });
    return gridPreviewController;
  }
  let brushesController: ReturnType<typeof createBrushesController> | undefined;
  function getBrushesController() {
    if (!brushesController)
      brushesController = createBrushesController({
        get faceAtPoint() {
          return faceAtPoint;
        },
        get faceBucketSize() {
          return faceBucketSize;
        },
        set faceBucketSize(value) {
          faceBucketSize = value;
        },
        get faceBuckets() {
          return faceBuckets;
        },
        set faceBuckets(value) {
          faceBuckets = value;
        },
        get map() {
          return map;
        },
        get patchFaceRender() {
          return patchFaceRender;
        },
        get scheduleRedraw() {
          return scheduleRedraw;
        },
        get syncCity3d() {
          return syncCity3d;
        },
        get canvas() {
          return canvas;
        },
        get wardBrushPreview() {
          return wardBrushPreview;
        },
        get circularWallCenter() {
          return circularWallCenter;
        },
        get circularWallPreview() {
          return circularWallPreview;
        },
        get localPoint() {
          return localPoint;
        },
        documents,
        interaction,
        display
      });
    return brushesController;
  }
  let routesController: ReturnType<typeof createRoutesController> | undefined;
  function getRoutesController() {
    if (!routesController)
      routesController = createRoutesController({
        get commit() {
          return commit;
        },
        get scheduleRedraw() {
          return scheduleRedraw;
        },
        get rememberFailureGenerationState() {
          return rememberFailureGenerationState;
        },
        get rebuildEditorIndexes() {
          return rebuildEditorIndexes;
        },
        get edgeIdsByVertex() {
          return edgeIdsByVertex;
        },
        set edgeIdsByVertex(value) {
          edgeIdsByVertex = value;
        },
        get map() {
          return map;
        },
        get routeGroupsByEdge() {
          return routeGroupsByEdge;
        },
        set routeGroupsByEdge(value) {
          routeGroupsByEdge = value;
        },
        get routeEdgesByGroup() {
          return routeEdgesByGroup;
        },
        set routeEdgesByGroup(value) {
          routeEdgesByGroup = value;
        },
        documents,
        interaction,
        display
      });
    return routesController;
  }
  let selectionController: ReturnType<typeof createSelectionController> | undefined;
  function getSelectionController() {
    if (!selectionController)
      selectionController = createSelectionController({
        get map() {
          return map;
        },
        get faceBucketSize() {
          return faceBucketSize;
        },
        set faceBucketSize(value) {
          faceBucketSize = value;
        },
        get vertexBuckets() {
          return vertexBuckets;
        },
        set vertexBuckets(value) {
          vertexBuckets = value;
        },
        get edgeIdsByVertex() {
          return edgeIdsByVertex;
        },
        set edgeIdsByVertex(value) {
          edgeIdsByVertex = value;
        },
        get faceBuckets() {
          return faceBuckets;
        },
        set faceBuckets(value) {
          faceBuckets = value;
        },
        get routeAtEvent() {
          return routeAtEvent;
        },
        get updateHoverOverlay() {
          return updateHoverOverlay;
        },
        get patchSelectionRender() {
          return patchSelectionRender;
        },
        get redrawMap() {
          return redrawMap;
        },
        get refreshUiOnly() {
          return refreshUiOnly;
        },
        documents,
        interaction,
        display
      });
    return selectionController;
  }
  let contextMenuController: ReturnType<typeof createContextMenuController> | undefined;
  function getContextMenuController() {
    if (!contextMenuController)
      contextMenuController = createContextMenuController({
        controls,
        get commit() {
          return commit;
        },
        get showNotice() {
          return showNotice;
        },
        get scope() {
          return scope;
        },
        get contextMenu() {
          return contextMenu;
        },
        get updateHoverOverlay() {
          return updateHoverOverlay;
        },
        get map() {
          return map;
        },
        interaction,
        display
      });
    return contextMenuController;
  }
  const {
    floatingWindow,
    makeButton,
    makeIconButton,
    numberInput,
    rangeInput,
    checkbox,
    toggleLabel,
    select,
    label,
    divider
  } = controls;
  clearGenerationPreviewCache();
  clearRenderDerivedCaches();
  const fixedApproachProvider = options.fixedApproachProvider ?? cityFixedApproachProvider;
  documents.lastOutputDocInput = null;
  documents.lastOutputDocProvider = null;
  documents.lastOutputDocResult = null;

  function documentForOutput(current: CityDocument): CityDocument {
    if (!fixedApproachProvider || current.fixedCrossingApproaches === undefined) return current;
    if (
      current === documents.lastOutputDocInput &&
      fixedApproachProvider === documents.lastOutputDocProvider &&
      documents.lastOutputDocResult
    ) {
      return documents.lastOutputDocResult;
    }
    const checked = restoreFixedCrossingApproaches(current, fixedApproachProvider);
    // Discard any previous object authorization when the current contract fails.
    const result = "document" in checked ? checked.document : clone(current);
    documents.lastOutputDocInput = current;
    documents.lastOutputDocProvider = fixedApproachProvider;
    documents.lastOutputDocResult = result;
    return result;
  }
  documents.gridSeed = randomSeed();
  documents.documentState = createGridDocument({
    size: DEFAULT_CITY_SIZE,
    grid: DEFAULT_GRID_KIND,
    seed: documents.gridSeed
  });
  documents.gridKind = DEFAULT_GRID_KIND;
  /** Fitted hamlet import: the scale bar's cell length follows the mesh, not 50 m. */
  documents.measureTownCells = false;
  documents.hexSizeMeters = DEFAULT_HEX_SIZE_METERS;
  documents.history = new DocumentHistory(
    documents.documentState,
    editorText("cityEditor.messages.initialState"),
    undefined,
    fixedApproachProvider
  );
  // An imported MFCG SVG backdrop can be a multi-megabyte data URL. Keep it out
  // of `documentState` so it is never cloned into a history snapshot or an
  // undo/redo step; it is re-attached only for export and passed to the
  // renderer separately.
  documents.referenceImage = null;
  interaction.tool = "select";
  interaction.landmarkAssetId = "";
  interaction.landmarkRotationDegrees = 0;
  interaction.landmarkHoverPoint = null;
  interaction.shipType = "small";
  interaction.shipSizeMeters = SHIP_SPECS.small.defaultSizeMeters;
  interaction.shipAngleDegrees = 0;
  interaction.shipHoverPoint = null;

  interaction.shipDrag = null;
  interaction.shipDragBefore = null;
  interaction.landmarkLaneSource = null;
  interaction.landmarkLanes = [];
  interaction.selection = { faceId: null, edgeId: null, vertexId: null, groupId: null, inspectedId: null };
  interaction.inspectedInfo = null;
  interaction.activeGroupId = null;
  interaction.dragBefore = null;
  interaction.dragMergeCandidateId = null;
  interaction.isVertexDragging = false;
  interaction.isWardPainting = false;
  interaction.wardPaintChanged = false;
  interaction.edgePaintChanged = false;
  interaction.paintedWardFaceIds = new Set<Id>();
  interaction.paintedEdgeIds = new Set<Id>();
  interaction.isJunctionPainting = false;
  interaction.junctionPaintChanged = false;
  interaction.circularWallStroke = null;
  interaction.routeDrag = null;
  interaction.routeStroke = null;
  interaction.routePreview = null;
  interaction.routePreviewFaceId = null;
  interaction.isPanning = false;
  interaction.isSpacePressed = false;
  display.showSelectionLabels = false;
  interaction.wardBrush = "market";
  // Erase remains a Ward brush so it can use the same size and preview, but it
  // may also remove routes placed on mesh edges.
  interaction.eraseTarget = "both";
  // The brush is expressed in macro cells, so its size stays meaningful when
  // switching between city presets or changing the map scale.
  interaction.brushSizeCells = 1;
  interaction.junctionMaxGapMeters = 8;
  interaction.wardBrushPointer = null;
  interaction.circularWallPointer = null;
  interaction.hasPanned = false;
  interaction.suppressNextClick = false;
  interaction.lastPanX = 0;
  interaction.lastPanY = 0;
  display.viewCenter = [0, 0];
  interaction.closeContextMenuOnPointerMove = false;
  display.notice = "";
  interaction.measureFrom = null;
  interaction.measureTo = null;
  generation.generateSettings = {
    ...defaultGenerationSettings(),
    buildingPattern: "medieval",
    townWallRings: "double"
  };
  // Shown in the Generate panel and encoded in a shareable `city-editor/#…`
  // link. Re-rolled by "🎲 新しい都市"; every stage regenerates THIS town so
  // ①→⑧ stay consistent with each other.
  generation.generateSeed = randomSeed();
  display.hideBuildings = false;
  /** Stage ⑬. Same document as ⑫; the town drawing omits intramural roads and block lanes. */
  display.hideStreetLines = false;
  generation.currentStageStep = 16;
  let syncStageUi: (step: number) => void = () => {};
  documents.importedOrigin = null;
  generation.completeSource = null;
  generation.completeResult = null;
  generation.completeResultSettings = null;
  generation.generationHistory = new WeakMap<
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
  generation.generationJob = null;
  scope.own(() => {
    generation.generationJob?.cancel();
    generation.generationJob = null;
    clearGenerationPreviewCache();
    clearRenderDerivedCaches();
    generation.completeSource = null;
    generation.completeResult = null;
    documents.lastOutputDocInput = null;
    documents.lastOutputDocResult = null;
    documents.lastOutputDocProvider = null;
    documents.referenceImage = null;
    generation.gridEvoStages = null;
  });
  generation.generationSamples = [];
  generation.generationLogHover = { ids: [], seed: "" };
  generation.pendingFailurePreview = null;
  generation.failurePreview = null;
  generation.failureRenderContext = null;
  generation.failurePreviewHistoryIndex = null;
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
    generation.generationJob?.cancel()
  );
  cancelGeneration.hidden = true;
  // Keep the document and settings stable until the result is committed.
  for (const eventName of ["click", "pointerdown", "change", "input", "keydown"]) {
    scope.listen(
      root,
      eventName,
      event => {
        if (!generation.generationJob || event.target === cancelGeneration) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true
    );
  }

  display.showBlockMesh = false;
  display.showGridLines = false;
  generation.lastGeneratedStep = null;
  // Per-loop process scrub (towngen-comparison.md): ◀/▶ steps through
  // WHICHEVER of the generation processes was last activated (by pressing its stage
  // button, or by ◀/▶ itself), one loop iteration at a time. `stepIndex` is
  // -1 = nothing stepped yet, so the first ▶ press lands on iteration 0.
  // `urbanCoreHighlight` / `stepOverlayPaths` are transient render tints for
  // the two stages with nothing else on the document to show a partial result
  // (③'s `buildable` has no fill of its own; ①/② are a walk, not cells) —
  // cleared whenever a different stage becomes active.
  generation.activeStepStage = null;
  generation.stepIndex = -1;
  generation.urbanCoreHighlight = null;
  generation.stepOverlayPaths = null;
  // Document panel "Grid evolution" (Phase G1): the TownGeneratorTS-style
  // spiral-scatter → incremental-Voronoi → central-relax pipeline captured one
  // for-loop iteration at a time. `gridEvoStages` is a transient preview overlay
  // (not on the document) until "採用" adopts a stage's cells as the new mesh.
  generation.gridEvoParams = {
    ...DEFAULT_PATCH_PARAMS,
    maxPatches: readMaxPatchesPreference()
  };
  generation.gridEvoSeed = randomSeed();
  generation.gridEvoStages = null;
  generation.gridEvoIndex = 0;
  display.gridEvoLayers = { showCells: true, showDelaunay: false, showSites: true };
  display.halfView = documents.documentState.frame.extentMeters / 2;
  let routeEdgesByGroup = new Map<Id, Id[]>();
  let routeGroupsByEdge = new Map<Id, Id[]>();
  let edgeIdsByVertex = new Map<Id, Id[]>();
  let faceBuckets = new Map<string, Id[]>();
  let vertexBuckets = new Map<string, Id[]>();
  let faceBucketSize = documents.documentState.frame.blockSizeMeters * 2;
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
  scope.replaceChildren(
    root,
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
  bindPointerDown({
    get scope() {
      return scope;
    },
    get contextMenu() {
      return contextMenu;
    },
    get map() {
      return map;
    },
    get hideContextMenu() {
      return hideContextMenu;
    },
    get flushRedraw() {
      return flushRedraw;
    },
    get interaction() {
      return interaction;
    },
    get localPoint() {
      return localPoint;
    },
    get documents() {
      return documents;
    },
    get updateCircularWallPreview() {
      return updateCircularWallPreview;
    },
    get canPaintAtPoint() {
      return canPaintAtPoint;
    },
    get paintCellsAtPoint() {
      return paintCellsAtPoint;
    },
    get optimizeJunctionsAtPoint() {
      return optimizeJunctionsAtPoint;
    },
    get closestMeshEdgeId() {
      return closestMeshEdgeId;
    },
    get routeEndpointOnEdge() {
      return routeEndpointOnEdge;
    },
    get refresh() {
      return refresh;
    },
    get closestVertexId() {
      return closestVertexId;
    },
    get routeHitRadius() {
      return routeHitRadius;
    },
    get routeAtEvent() {
      return routeAtEvent;
    }
  });
  bindMapContext({
    get scope() {
      return scope;
    },
    get contextMenu() {
      return contextMenu;
    },
    get map() {
      return map;
    },
    get flushRedraw() {
      return flushRedraw;
    },
    get documents() {
      return documents;
    },
    get localPoint() {
      return localPoint;
    },
    get interaction() {
      return interaction;
    },
    get faceAtPoint() {
      return faceAtPoint;
    },
    get closestVertexId() {
      return closestVertexId;
    },
    get refresh() {
      return refresh;
    },
    get runContextAction() {
      return runContextAction;
    },
    get closestGroupEdgeId() {
      return closestGroupEdgeId;
    },
    get localPointAt() {
      return localPointAt;
    },
    get setDistanceFromHere() {
      return setDistanceFromHere;
    },
    get setDistanceToHere() {
      return setDistanceToHere;
    },
    get clearMeasurement() {
      return clearMeasurement;
    },
    get showContextMenu() {
      return showContextMenu;
    }
  });

  const toolButtons = new Map<Tool, HTMLButtonElement>();
  const toolGrid = div("ce-icon-row");
  for (const [id, labelKey, icon] of TOOLS) {
    const button = makeIconButton(icon, editorText(labelKey), () => {
      interaction.tool = id;
      if (id !== "select") {
        interaction.inspectedInfo = null;
        interaction.selection.inspectedId = null;
      } else {
        display.showBlockMesh = false;
      }
      refresh();
    });
    toolButtons.set(id, button);
    toolGrid.appendChild(button);
  }
  toolbar.content.appendChild(toolGrid);
  const facilityPanel = buildFacilityPanel({ scope, getDocument: () => documents.documentState, commit });
  toolbar.content.appendChild(facilityPanel.root);
  const landmarkControls = div("ce-landmark-controls");
  const landmarkSelect = document.createElement("select");
  bindPanelEvents(panelEventContext(), "landmarkSelect:change");
  landmarkSelect.setAttribute("aria-label", editorText("cityEditor.messages.historicLandmarkAsset"));

  const landmarkAngle = document.createElement("input");
  bindPanelEvents(panelEventContext(), "landmarkAngle:change");
  landmarkAngle.type = "number";
  landmarkAngle.min = "-180";
  landmarkAngle.max = "180";
  landmarkAngle.step = "15";
  landmarkAngle.value = "0";
  landmarkAngle.title = editorText("cityEditor.messages.landmarkRotationInDegrees");

  const landmarkFile = document.createElement("input");
  bindPanelEvents(panelEventContext(), "landmarkFile:change");
  landmarkFile.type = "file";
  landmarkFile.accept = ".json,application/json";
  landmarkFile.title = editorText("cityEditor.messages.importAReviewedLandmarkAssetJSON");

  landmarkControls.append(landmarkSelect, landmarkAngle, landmarkFile);
  toolbar.content.appendChild(landmarkControls);

  const shipControls = div("ce-ship-controls");
  const shipSelect = document.createElement("select");
  bindPanelEvents(panelEventContext(), "shipSelect:change");
  shipSelect.setAttribute("aria-label", editorText("cityEditor.messages.shipType"));
  for (const [key, spec] of Object.entries(SHIP_SPECS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = `${spec.label}`;
    shipSelect.appendChild(opt);
  }
  shipSelect.value = interaction.shipType;

  const shipSizeInput = document.createElement("input");
  bindPanelEvents(panelEventContext(), "shipSizeInput:input");
  shipSizeInput.type = "number";
  shipSizeInput.min = "6";
  shipSizeInput.max = "80";
  shipSizeInput.step = "1";
  shipSizeInput.value = String(interaction.shipSizeMeters);
  shipSizeInput.title = editorText("cityEditor.messages.shipLengthInMetres");

  const shipAngle = document.createElement("input");
  bindPanelEvents(panelEventContext(), "shipAngle:input");
  shipAngle.type = "number";
  shipAngle.min = "-180";
  shipAngle.max = "180";
  shipAngle.step = "15";
  shipAngle.value = "0";
  shipAngle.title = editorText("cityEditor.messages.shipRotationInDegrees");

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
      interaction.inspectedInfo = null;
      interaction.selection.inspectedId = null;
      if (kind === "sea") interaction.tool = "sea";
      else {
        interaction.wardBrush = kind === "erase" ? null : kind;
        interaction.tool = "ward";
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
  const {
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
  } = buildDocumentPanel({
    get select() {
      return select;
    },
    get panelEventContext() {
      return panelEventContext;
    },
    get rangeInput() {
      return rangeInput;
    },
    get label() {
      return label;
    },
    get documents() {
      return documents;
    },
    get makeIconButton() {
      return makeIconButton;
    },
    get generation() {
      return generation;
    },
    get importedFrame() {
      return importedFrame;
    },
    get fixedApproachProvider() {
      return fixedApproachProvider;
    },
    get generationLog() {
      return generationLog;
    },
    get interaction() {
      return interaction;
    },
    get display() {
      return display;
    },
    get stepStatus() {
      return stepStatus;
    },
    get clearGridEvo() {
      return clearGridEvo;
    },
    get clearMeasurement() {
      return clearMeasurement;
    },
    get rebuildEditorIndexes() {
      return rebuildEditorIndexes;
    },
    get refresh() {
      return refresh;
    },
    get restore() {
      return restore;
    },
    get showNotice() {
      return showNotice;
    },
    get documentForOutput() {
      return documentForOutput;
    },
    get importDocument() {
      return importDocument;
    },
    get numberInput() {
      return numberInput;
    },
    get brushSizeText() {
      return brushSizeText;
    },
    get commit() {
      return commit;
    },
    get toolbar() {
      return toolbar;
    },
    get divider() {
      return divider;
    },
    get paintGrid() {
      return paintGrid;
    },
    get scope() {
      return scope;
    },
    get runGridEvo() {
      return runGridEvo;
    },
    get makeButton() {
      return makeButton;
    },
    get stepGridEvo() {
      return stepGridEvo;
    },
    get checkbox() {
      return checkbox;
    },
    get redrawMap() {
      return redrawMap;
    },
    get toggleLabel() {
      return toggleLabel;
    },
    get adoptGridEvo() {
      return adoptGridEvo;
    }
  });

  const {
    populationControls,
    currentBuildingPatternSelect,
    historicalPeriodSelect,
    skeletonControls,
    syncSkeletonControls,
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
    blockMeshInput,
    gridLinesInput,
    coreLayerInput,
    regionalLayerInput,
    renderQualitySelect,
    renderQualityHelp,
    meshToggleRow,
    importedBox,
    importedText,
    seedInput,
    seedLabel,
    copyLinkButton
  } = buildGenerationPanel({
    get select() {
      return select;
    },
    get documents() {
      return documents;
    },
    get panelEventContext() {
      return panelEventContext;
    },
    get documentPanel() {
      return documentPanel;
    },
    get sizeLabel() {
      return sizeLabel;
    },
    get gridKindLabel() {
      return gridKindLabel;
    },
    get hexSizeLabel() {
      return hexSizeLabel;
    },
    get documentActions() {
      return documentActions;
    },
    get label() {
      return label;
    },
    get scaleInput() {
      return scaleInput;
    },
    get smoothingModeInput() {
      return smoothingModeInput;
    },
    get divider() {
      return divider;
    },
    get gridEvoControls() {
      return gridEvoControls;
    },
    get syncGridEvoUi() {
      return syncGridEvoUi;
    },
    get generation() {
      return generation;
    },
    get checkbox() {
      return checkbox;
    },
    get toggleLabel() {
      return toggleLabel;
    },
    get makeIconButton() {
      return makeIconButton;
    },
    get syncStageUi() {
      return syncStageUi;
    },
    set syncStageUi(value) {
      syncStageUi = value;
    },
    get runGenerationStage() {
      return runGenerationStage;
    },
    get numberInput() {
      return numberInput;
    },
    get runStep() {
      return runStep;
    },
    get display() {
      return display;
    },
    get interaction() {
      return interaction;
    },
    get refresh() {
      return refresh;
    },
    get redrawMap() {
      return redrawMap;
    },
    get makeButton() {
      return makeButton;
    },
    get useStandaloneSite() {
      return useStandaloneSite;
    },
    get copyShareLink() {
      return copyShareLink;
    }
  });

  const moatInputs = new Map<"town" | "castle", HTMLInputElement>();
  const moatControls = div("ce-moat-settings");
  for (const scope of ["town", "castle"] as const) {
    const input = checkbox(!!generation.generateSettings.moats?.[scope], checked => {
      generation.generateSettings.moats = { ...generation.generateSettings.moats, [scope]: checked };
      generation.completeResult = null;
      clearGenerationPreviewCache();
      runContextAction(() => {
        const next = structuredClone(documents.documentState);
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
    const input = select(choices, generation.generateSettings.castle?.[key] ?? DEFAULT_CASTLE_SETTINGS[key] ?? "auto");
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
    scope.listen(input, "change", () => {
      generation.generateSettings.castle = { ...generation.generateSettings.castle, [key]: input.value };
      if (
        generation.generateSettings.castle.position === "central" &&
        generation.generateSettings.castle.relationship === "integrated"
      )
        generation.generateSettings.castle.relationship = "detached";
      generation.generateSettings.legacyCastles = false;
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
      generation.generateSettings.config = randomGeography();
      if (generation.generateSettings.generationMethod === "skeleton-first") {
        generation.generateSettings.config.features.citadel = false;
        generation.generateSettings.config.layout = "organic";
        generation.generateSettings.layout = "organic";
      }
      generation.generateSeed = randomSeed();
      syncGenerateControls();
      generation.stepIndex = -1;
      rerunLastStage();
      showNotice(editorText("cityEditor.messages.geographyRandomized"));
    })
  );

  const vacantTreesInput = checkbox(false, visible => {
    const current = documents.documentState;
    if (!current.vacantLotTrees) return;
    commit(
      { ...current, vacantLotTrees: { ...current.vacantLotTrees, visible } },
      editorText("cityEditor.messages.showVacantLotTrees")
    );
  });
  const generateVacantTreesButton = makeButton(editorText("cityEditor.messages.generateVacantLotTrees"), () => {
    const current = documents.documentState;
    if (current.appearance !== "town" || display.hideBuildings) return;
    commit(
      { ...current, vacantLotTrees: { seed: randomSeed(), visible: true } },
      editorText("cityEditor.messages.generateVacantLotTrees")
    );
  });
  const decorationControls = div("ce-city-decoration");
  decorationControls.append(
    text(editorText("cityEditor.messages.cityDecoration")),
    generateVacantTreesButton,
    toggleLabel(editorText("cityEditor.messages.showVacantLotTrees"), vacantTreesInput)
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
    decorationControls,
    seedLabel,
    meshToggleRow,
    label(editorText("cityEditor.messages.renderQuality"), renderQualitySelect),
    renderQualityHelp,
    toggleLabel(editorText("cityEditor.messages.showUrbanCore"), coreLayerInput),
    toggleLabel(editorText("cityEditor.messages.showFMGSurroundings"), regionalLayerInput),
    divider(),
    importedBox,
    populationControls,
    skeletonControls,
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
    Object.assign(
      text(editorText("cityEditor.messages.completeGenerationBuildsWallsStreetsAndBuildingsUseTheSlider")),
      { className: "ce-generation-process-help" }
    ),
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

  bindPointerMove({
    get scope() {
      return scope;
    },
    get map() {
      return map;
    },
    get interaction() {
      return interaction;
    },
    get localPoint() {
      return localPoint;
    },
    get documents() {
      return documents;
    },
    get scheduleRedraw() {
      return scheduleRedraw;
    },
    get updateLandmarkPreview() {
      return updateLandmarkPreview;
    },
    get updateShipPreview() {
      return updateShipPreview;
    },
    get updateCircularWallPreview() {
      return updateCircularWallPreview;
    },
    get updateWardBrushPreview() {
      return updateWardBrushPreview;
    },
    get paintCellsAtPoint() {
      return paintCellsAtPoint;
    },
    get optimizeJunctionsAtPoint() {
      return optimizeJunctionsAtPoint;
    },
    get extendRouteStroke() {
      return extendRouteStroke;
    },
    get faceAtPoint() {
      return faceAtPoint;
    },
    get updateRoutePreview() {
      return updateRoutePreview;
    },
    get generation() {
      return generation;
    },
    get closestMergeCandidate() {
      return closestMergeCandidate;
    },
    get updateHover() {
      return updateHover;
    },
    get localPointAt() {
      return localPointAt;
    },
    get display() {
      return display;
    },
    get updateViewport() {
      return updateViewport;
    }
  });

  const { finishDrag } = createDragCompletionController({
    get interaction() {
      return interaction;
    },
    get map() {
      return map;
    },
    get commit() {
      return commit;
    },
    get documents() {
      return documents;
    },
    get refresh() {
      return refresh;
    },
    get updateRoutePreview() {
      return updateRoutePreview;
    },
    get rememberFailureGenerationState() {
      return rememberFailureGenerationState;
    },
    get rebuildEditorIndexes() {
      return rebuildEditorIndexes;
    },
    get paintHistoryLabel() {
      return paintHistoryLabel;
    },
    get showNotice() {
      return showNotice;
    },
    get finishRouteStroke() {
      return finishRouteStroke;
    },
    get localPoint() {
      return localPoint;
    },
    get routeAtEvent() {
      return routeAtEvent;
    },
    get refreshUiOnly() {
      return refreshUiOnly;
    }
  });

  bindMapClick({
    get scope() {
      return scope;
    },
    get map() {
      return map;
    },
    get interaction() {
      return interaction;
    },
    get documents() {
      return documents;
    },
    get localPoint() {
      return localPoint;
    },
    get selectedLandmarkAsset() {
      return selectedLandmarkAsset;
    },
    get showNotice() {
      return showNotice;
    },
    get preservedLandmarkLanes() {
      return preservedLandmarkLanes;
    },
    get commit() {
      return commit;
    },
    get routeAtEvent() {
      return routeAtEvent;
    },
    get applySelection() {
      return applySelection;
    },
    get refresh() {
      return refresh;
    },
    get appendSelectedRiverVertex() {
      return appendSelectedRiverVertex;
    },
    get appendSelectedEdge() {
      return appendSelectedEdge;
    }
  });

  bindKeyboard({
    get scope() {
      return scope;
    },
    get generation() {
      return generation;
    },
    get interaction() {
      return interaction;
    },
    get restore() {
      return restore;
    },
    get documents() {
      return documents;
    },
    get clearFailurePreview() {
      return clearFailurePreview;
    },
    get finishButton() {
      return finishButton;
    },
    get hideContextMenu() {
      return hideContextMenu;
    },
    get clearMeasurement() {
      return clearMeasurement;
    },
    get refresh() {
      return refresh;
    },
    get contextMenu() {
      return contextMenu;
    },
    get refreshScaleBar() {
      return refreshScaleBar;
    }
  });

  bindMapAuxiliary(panelEventContext());
  rebuildEditorIndexes();
  const city3d = mountCity3d({
    canvasHost: canvas,
    map,
    scope,
    getDocument: () => documents.documentState
  });
  syncCity3d = () => city3d.sync();
  scope.own(() => city3d.dispose());
  try {
    const incoming = readIncomingCity();
    if (incoming) applyShare(incoming.share, incoming.origin);
    else refresh();
  } catch (error) {
    refresh();
    showNotice(error instanceof Error ? error.message : editorText("cityEditor.messages.couldNotLoadFMGRegionData"));
  }

  // A native bound method retains only the lifetime, not this mount's shared
  // closure context (document, history, controllers and previews).
  return scope.dispose.bind(scope);

  function appendSelectedEdge(edgeId: Id, kind: "road" | "wall"): void {
    getRoutesController().appendSelectedEdge(edgeId, kind);
  }

  function appendSelectedRiverVertex(vertexId: Id): void {
    getRoutesController().appendSelectedRiverVertex(vertexId);
  }

  function commit(next: CityDocument, label = editorText("cityEditor.messages.edit")): void {
    getEditingController().commit(next, label);
  }

  function runContextAction(
    operation: () => CityDocument | null,
    label = editorText("cityEditor.messages.edit")
  ): void {
    getContextMenuController().runContextAction(operation, label);
  }

  function showContextMenu(event: MouseEvent, actions: ContextMenuAction[]): void {
    getContextMenuController().showContextMenu(event, actions);
  }

  function showContextMenuAt(clientX: number, clientY: number, actions: ContextMenuAction[]): void {
    getContextMenuController().showContextMenuAt(clientX, clientY, actions);
  }

  function hideContextMenu(): void {
    getContextMenuController().hideContextMenu();
  }

  function setDistanceFromHere(point: [number, number]): void {
    getContextMenuController().setDistanceFromHere(point);
  }

  function setDistanceToHere(point: [number, number]): void {
    getContextMenuController().setDistanceToHere(point);
  }

  function clearMeasurement(): void {
    getContextMenuController().clearMeasurement();
  }

  function updateMeasureOverlay(): void {
    getContextMenuController().updateMeasureOverlay();
  }

  function rememberGenerationState(
    seed = generation.completeResult?.generationSeed ??
      documents.documentState.generationSeed ??
      generation.generateSeed,
    stage = generation.currentStageStep
  ): void {
    getGenerationPlaybackController().rememberGenerationState(seed, stage);
  }

  /** Editing a rejected city must not turn its repaired mesh into the input
   * for earlier stages when that edit is restored through History. */
  function rememberFailureGenerationState(): void {
    getGenerationPlaybackController().rememberFailureGenerationState();
  }

  function restore(next: CityDocument | null): void {
    getEditingController().restore(next);
  }

  function refresh(): void {
    getMapDisplayController().refresh();
  }

  /**
   * Everything refresh() does except the map redraw. Ward/sea painting calls
   * this directly after finishing a stroke, since it already kept the SVG
   * current itself (patchFaceRender) and a redrawMap() pass here would just
   * redo, over the whole mesh, work already done for the touched cells.
   */
  function refreshUiOnly(): void {
    getMapDisplayController().refreshUiOnly();
  }

  /** Repaint on the next frame, collapsing bursts of pointermove events. */
  function scheduleRedraw(): void {
    getMapDisplayController().scheduleRedraw();
  }

  /** Force a pending frame-deferred repaint now, before code reads the SVG
   *  (hit-testing, getScreenCTM) and would otherwise see stale geometry. */
  function flushRedraw(): void {
    getMapDisplayController().flushRedraw();
  }

  // Panning/zooming changes only the camera, never rebuild the city's SVG or fabric.
  function updateViewport(zoomChanged = false): void {
    getMapDisplayController().updateViewport(zoomChanged);
  }

  function showFailurePreview(preview: GenerationDebugPreview, heading: string): void {
    getGenerationPlaybackController().showFailurePreview(preview, heading);
  }

  function clearFailurePreview(): void {
    getGenerationPlaybackController().clearFailurePreview();
  }

  function redrawMap(): void {
    getMapDisplayController().redrawMap();
    syncCity3d();
  }

  function selectedLandmarkAsset(): LandmarkAsset | null {
    return getMapDisplayController().selectedLandmarkAsset();
  }

  function preservedLandmarkLanes(): InfillLane[] {
    return getMapDisplayController().preservedLandmarkLanes();
  }

  function updateShipPreview(): void {
    getMapDisplayController().updateShipPreview();
  }

  function updateLandmarkPreview(): void {
    getMapDisplayController().updateLandmarkPreview();
  }

  /**
   * Patch one face's rendered fill and Ward-landmark marker in place, without
   * a full redrawMap() pass. Only ward/sea painting may call this: it never
   * adds, removes, or moves a vertex/edge and never touches featureGroups,
   * gates, or elements. Cemetery layers are updated separately when needed.
   */
  function patchFaceRender(faceId: Id): void {
    getMapDisplayController().patchFaceRender(faceId);
  }

  function updateRoutePreview(): void {
    getMapDisplayController().updateRoutePreview();
  }

  /** Repaint only the hover marks (glowing route, edge, nearest vertex). */
  function updateHoverOverlay(): void {
    getMapDisplayController().updateHoverOverlay();
  }

  /**
   * Fast path: update selection highlight CSS classes, selection labels and hover
   * overlay in place without rebuilding the entire SVG (which contains thousands of nodes).
   */
  function patchSelectionRender(): boolean {
    return getMapDisplayController().patchSelectionRender();
  }

  function applySelection(nextSelection: RenderSelection): void {
    getSelectionController().applySelection(nextSelection);
  }

  function refreshScaleBar(): void {
    getMapDisplayController().refreshScaleBar();
  }

  function refreshJunctionGapScale(): void {
    getMapDisplayController().refreshJunctionGapScale();
  }

  function renderInspector(): void {
    facilityPanel.sync();
    getInspectorController().renderInspector();
  }

  function renderGroups(): void {
    getLayersController().renderGroups();
  }

  function appendGenerationException(error: unknown, seed: string): void {
    getGenerationPlaybackController().appendGenerationException(error, seed);
  }

  function hoverGenerationLogObjects(ids: string[], seed: string): void {
    getMapDisplayController().hoverGenerationLogObjects(ids, seed);
  }

  function renderHistory(): void {
    getHistoryController().renderHistory();
  }

  function localPoint(event: PointerEvent): [number, number] {
    return getSelectionController().localPoint(event);
  }

  function closestVertexId(point: [number, number]): Id | null {
    return getSelectionController().closestVertexId(point);
  }

  function closestMergeCandidate(vertexId: Id): Id | null {
    return getSelectionController().closestMergeCandidate(vertexId);
  }

  function rebuildEditorIndexes(): void {
    getSpatialIndexController().rebuildEditorIndexes();
  }

  function faceAtPoint(point: Point): Id | null {
    return getSelectionController().faceAtPoint(point);
  }

  function updateHover(event: PointerEvent): void {
    getSelectionController().updateHover(event);
  }

  function paintCellsAtPoint(point: Point): void {
    getBrushesController().paintCellsAtPoint(point);
  }

  function canPaintAtPoint(point: Point): boolean {
    return getBrushesController().canPaintAtPoint(point);
  }

  function paintHistoryLabel(): string {
    return getBrushesController().paintHistoryLabel();
  }

  function brushSizeText(): string {
    return getBrushesController().brushSizeText();
  }

  function optimizeJunctionsAtPoint(point: Point): void {
    getBrushesController().optimizeJunctionsAtPoint(point);
  }

  function updateWardBrushPreview(event?: PointerEvent): void {
    getBrushesController().updateWardBrushPreview(event);
  }

  function hideWardBrushPreview(): void {
    getBrushesController().hideWardBrushPreview();
  }

  function updateCircularWallPreview(event?: PointerEvent): void {
    getBrushesController().updateCircularWallPreview(event);
  }

  function hideCircularWallPreview(): void {
    getBrushesController().hideCircularWallPreview();
  }

  function extendRouteStroke(point: Point): void {
    getRoutesController().extendRouteStroke(point);
  }

  function finishRouteStroke(stroke: RouteStroke, point: Point): void {
    getRoutesController().finishRouteStroke(stroke, point);
  }

  function closestMeshEdgeId(point: Point, radiusPixels: number): Id | null {
    return getRoutesController().closestMeshEdgeId(point, radiusPixels);
  }

  function routeEndpointOnEdge(kind: RoutePaintKind, edgeId: Id, point: Point): { groupId: Id; vertexId: Id } | null {
    return getRoutesController().routeEndpointOnEdge(kind, edgeId, point);
  }

  function routeHitRadius(pixels = 18): number {
    return getRoutesController().routeHitRadius(pixels);
  }

  function routeAtEvent(
    event: Event,
    point: Point,
    allowNearby: boolean,
    allowLocked = false
  ): { groupId: Id; edgeId: Id } | null {
    return getRoutesController().routeAtEvent(event, point, allowNearby, allowLocked);
  }

  function closestGroupEdgeId(group: FeatureGroup, point: Point): Id | null {
    return getRoutesController().closestGroupEdgeId(group, point);
  }

  function localPointAt(clientX: number, clientY: number): [number, number] {
    return getSelectionController().localPointAt(clientX, clientY);
  }

  async function importDocument(): Promise<void> {
    const current = scope.ticket("import");
    const parsed = await pickCityMap(fixedApproachProvider);
    if (!current()) return;
    applyImportedMap(parsed);
  }

  async function importMapFile(file: File | undefined): Promise<void> {
    return getDocumentIOController().importMapFile(file);
  }

  function applyImportedMap(parsed: ImportedCityMap | null): void {
    getDocumentIOController().applyImportedMap(parsed);
  }

  function showNotice(value: string, redraw = true): void {
    if (!scope.active) return;
    display.notice = value;
    if (redraw) refresh();
    else refreshUiOnly();
    scope.timeout(() => {
      if (display.notice !== value) return;
      display.notice = "";
      if (redraw) refresh();
      else refreshUiOnly();
    }, 1800);
  }

  function syncGenerateControls(): void {
    getGenerationController().syncGenerateControls();
  }

  function importedFrame() {
    return getDocumentIOController().importedFrame();
  }

  async function copyShareLink(button: HTMLButtonElement): Promise<void> {
    return getDocumentIOController().copyShareLink(button);
  }

  function useStandaloneSite(): void {
    getDocumentIOController().useStandaloneSite();
  }

  function applyShare(share: CityEditorShare, origin: IncomingOrigin): void {
    getDocumentIOController().applyShare(share, origin);
  }

  /** Roll a new random town, then re-show it at whatever stage is on screen. */
  function rollNewTown(): void {
    getGenerationController().rollNewTown();
  }

  function rerunLastStage(): void {
    getGenerationController().rerunLastStage();
  }

  function runCompleteGeneration(): void {
    getGenerationController().runCompleteGeneration();
  }

  function runGenerationStage(stage: GenerationStage): void {
    getGenerationController().runGenerationStage(stage);
  }

  /** ◀/▶: scrub whichever process ①…⑨ was last activated one loop iteration at
   * a time, right on the mesh (towngen-comparison.md) — independent of the
   * stage buttons themselves, which still jump straight to the finished result. */
  function runStep(delta: number): void {
    getGenerationController().runStep(delta);
  }

  // --- Grid evolution (Phase G1) --------------------------------------------

  /** Rebuild the captured stages for the current params + seed, and jump to the
   * final one. Runs on the Preview button and live on every parameter-slider
   * `input` — `buildGridEvolution` is ~25 ms (stage count is capped), fast
   * enough to run per tick. */
  function runGridEvo(): void {
    getGridPreviewController().runGridEvo();
  }

  function stepGridEvo(delta: number): void {
    getGridPreviewController().stepGridEvo(delta);
  }

  function clearGridEvo(): void {
    getGridPreviewController().clearGridEvo();
  }

  function syncGridEvoUi(): void {
    getGridPreviewController().syncGridEvoUi();
  }

  function gridOverlayForRender(): GridOverlay | null {
    return getGridPreviewController().gridOverlayForRender();
  }

  /** Replace the document mesh with the shown stage's cells. Topology changes
   * wholesale, so feature groups / gates / elements are cleared (design §5.1
   * transfer report is a later milestone). */
  function adoptGridEvo(): void {
    getGridPreviewController().adoptGridEvo();
  }
}

/** A ◀/▶ step result, unified across all generation processes — mirrors
 * `GenerationStepResult` but also carries ③'s face-tint highlight, since that
 * one adapts `generateUrbanPatchStep`'s own (slightly different) shape. */

/** The exact land faces a Generate press just marked buildable — the ③ urban-
 * core debug highlight's source set (towngen-comparison.md §2.1). */

/** Whether a circular Ward brush reaches any part of a cell polygon. */

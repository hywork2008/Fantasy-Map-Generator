import type { GridKind } from "../types/contracts/document";
import type { FaceRoutePreview } from "../types/contracts/features";
import type { FixedApproachProvider } from "../types/contracts/fixedApproachAdoption";
import type { GenerationDebugPreview } from "../types/contracts/generationDebug";
import type { GenerationSample } from "../types/contracts/generationDiagnostics";
import type { GridEvolutionStage } from "../types/contracts/gridEvolution";
import type { IncomingOrigin } from "../types/contracts/incomingCity";
import type { InfillLane } from "../types/contracts/localInfill";
import type { PatchParams } from "../types/contracts/patches";
import type { CityDocument, Id, Point, Tool, WardKind } from "../types/document";
import type { CircularWallStroke, EraseTarget, RouteStroke, ShipDragState } from "../types/editor";
import type { GenerationSettings, GenerationStage } from "../types/generation";
import type { DocumentHistoryState } from "../types/history";
import type { RenderSelection, SvgPickInfo } from "../types/selection";
import type { ShipType } from "../types/ships";

/** Four owners: persisted document/history, generation requests/previews, display and transient gestures. No document copies live in the other owners. */
export interface DocumentsState {
  documentState: CityDocument;
  history: DocumentHistoryState;
  referenceImage: { href: string; width: number; height: number } | null | undefined;
  lastOutputDocInput: CityDocument | null;
  lastOutputDocProvider: FixedApproachProvider | null;
  lastOutputDocResult: CityDocument | null;
  gridKind: GridKind;
  gridSeed: string;
  hexSizeMeters: number;
  measureTownCells: boolean;
  importedOrigin: IncomingOrigin | null;
}
export interface InteractionState {
  tool: Tool;
  selection: RenderSelection;
  inspectedInfo: SvgPickInfo | null;
  activeGroupId: string | null;
  dragBefore: CityDocument | null;
  dragMergeCandidateId: string | null;
  isVertexDragging: boolean;
  isWardPainting: boolean;
  wardPaintChanged: boolean;
  edgePaintChanged: boolean;
  paintedWardFaceIds: Set<string>;
  paintedEdgeIds: Set<string>;
  isJunctionPainting: boolean;
  junctionPaintChanged: boolean;
  circularWallStroke: CircularWallStroke | null;
  routeDrag: { groupId: Id; edgeId: Id; startX: number; startY: number; moved: boolean } | null;
  routeStroke: RouteStroke | null;
  routePreview: FaceRoutePreview | null;
  routePreviewFaceId: string | null;
  isPanning: boolean;
  isSpacePressed: boolean;
  hasPanned: boolean;
  suppressNextClick: boolean;
  lastPanX: number;
  lastPanY: number;
  wardBrush: WardKind | null;
  eraseTarget: EraseTarget;
  brushSizeCells: number;
  junctionMaxGapMeters: number;
  wardBrushPointer: { clientX: number; clientY: number } | null;
  circularWallPointer: { clientX: number; clientY: number } | null;
  landmarkAssetId: string;
  landmarkRotationDegrees: number;
  landmarkHoverPoint: Point | null;
  shipType: ShipType;
  shipSizeMeters: number;
  shipAngleDegrees: number;
  shipHoverPoint: Point | null;
  shipDrag: ShipDragState | null;
  shipDragBefore: CityDocument | null;
  landmarkLaneSource: CityDocument | null;
  landmarkLanes: InfillLane[];
  closeContextMenuOnPointerMove: boolean;
  measureFrom: [number, number] | null;
  measureTo: [number, number] | null;
}
export interface GenerationState {
  generateSettings: GenerationSettings;
  generateSeed: string;
  streets: Partial<import("../types/generation").StreetSettings>;
  completeSource: CityDocument | null;
  completeResult: CityDocument | null;
  completeResultSettings: string | null;
  acceptingResult: boolean;
  generationJob: { result: Promise<CityDocument | null>; cancel: () => void } | null;
  generationSamples: GenerationSample[];
  generationLogHover: { ids: string[]; seed: string };
  pendingFailurePreview: GenerationDebugPreview | null;
  failurePreview: GenerationDebugPreview | null;
  failureRenderContext: GenerationDebugPreview | null;
  failurePreviewHistoryIndex: number | null;
  generationHistory: WeakMap<
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
  >;
  gridEvoSeed: string;
  gridEvoStages: GridEvolutionStage[] | null;
  gridEvoIndex: number;
  gridEvoParams: Omit<PatchParams, "extentMeters">;
  activeStepStage: GenerationStage["id"] | null;
  stepIndex: number;
  urbanCoreHighlight: Set<string> | null;
  stepOverlayPaths: Point[][] | null;
  currentStageStep: number;
  lastGeneratedStep: number | null;
}
export interface DisplayState {
  showSelectionLabels: boolean;
  showBlockMesh: boolean;
  showGridLines: boolean;
  hideBuildings: boolean;
  hideStreetLines: boolean;
  viewCenter: [number, number];
  halfView: number;
  notice: string;
  gridEvoLayers: { showCells: boolean; showDelaunay: boolean; showSites: boolean };
}

/** A canonical document replacement invalidates only the outgoing document's
 * derived data; immutable district results in the bounded shared LRU can be reused. */
export function createDocumentsState(
  onReplace: (previous: CityDocument | undefined, next: CityDocument) => void
): DocumentsState {
  const state = {} as DocumentsState;
  let current: CityDocument;
  Object.defineProperty(state, "documentState", {
    enumerable: true,
    get: () => current,
    set: (next: CityDocument) => {
      if (next === current) return;
      const previous = current;
      current = next;
      onReplace(previous, next);
    }
  });
  return state;
}

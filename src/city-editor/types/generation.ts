import type { EditorMessageKey } from "../../i18n/editorMessages";
import type { CityDocument, EdgeRef } from "./document";
import type { Point } from "./primitives";

/** One visible process, in order. `processStep` is the S-index it recomputes up to;
 * the grid step (S0) is intentionally absent — the mesh is the Document panel's. */
/** A stage that stops part-way through its `processStep` so each sub-process is visible on its own. */
export type StageCheckpoint =
  | "walls"
  | "riverPassages"
  | "passages"
  | "wards"
  | "streets"
  | "innerWall"
  | "innerGates"
  | "firstInnerGates";

export interface GenerationStageDefinition {
  id:
    | "skeletonInputs"
    | "skeletonCore"
    | "skeletonWall"
    | "skeletonCrossings"
    | "skeletonCheck"
    | "conformingMesh"
    | "coast"
    | "river"
    | "urban"
    | "walls"
    | "riverPassages"
    | "passages"
    | "gates"
    | "streets"
    | "wards"
    | "centerRoads"
    | "townStreets"
    | "innerWall"
    | "innerGates"
    | "geometry"
    | "blocks"
    | "buildings"
    | "farmland"
    | "conceal";
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18;
  /** Original planning pass; separate from the visible slider number. */
  processStep: number;
  wallCheckpoint?: StageCheckpoint;
  labelKey: EditorMessageKey;
  hintKey: EditorMessageKey;
}

export interface UrbanPatchStep {
  /** The document with only THIS step's cumulative cells marked buildable — null
   * if the mesh is unusable or the result fails validation. */
  document: CityDocument | null;
  /** Total flood-fill iterations for this `(document, settings, seed)` (0 when
   * there is no eligible land at all). */
  total: number;
  /** The step actually shown, clamped to `[0, total - 1]` (-1 when `total` is 0). */
  index: number;
  /** The cell id admitted to the urban core at this step, or null. */
  cellId: number | null;
}

export interface GenerationStepResult {
  /** The document with only this step's cumulative result shown — null if the
   * mesh is unusable or the result fails validation. */
  document: CityDocument | null;
  /** Total iterations for this `(document, settings, seed)` (0 = nothing to
   * step through, e.g. no coastline configured, or Walls is off for ④). */
  total: number;
  /** The step actually shown, clamped to `[0, total - 1]` (-1 when `total` is 0). */
  index: number;
  /** A short label for what this step is (e.g. "vertex 4/12", "gate 2/5"), or
   * null when `total` is 0. */
  detail: string | null;
  /** Raw graph-walk polylines to draw as an overlay (① a single shoreline, ②
   * one per configured river) — omitted for ④⑤⑥, whose partial result is
   * already visible on `document` itself (gates / roads / ward colours). */
  overlayPaths?: Point[][];
}

/** An urban-component outline: the exact mesh edges (for a Wall group) and their
 * vertex coordinates (for the generator's BorderLoop shape). */
export interface MeshBorderLoop {
  segments: EdgeRef[];
  points: Point[];
  cellIds: number[];
}

/** Localized presentation of a generation stage; constructed by the controller. */
export interface GenerationStage extends GenerationStageDefinition {
  readonly label: string;
  readonly hint: string;
}

export type {
  GenerationMethod,
  GenerationRetry,
  GenerationSettings,
  StreetSettings,
  WallShape,
  WallShapeChoice
} from "./generationSettings";

import type { CityDocument, Id, Point } from "./document";
import type { GenerationSettings } from "./generation";
export interface ContextMenuAction {
  label: string;
  run: () => void;
  highlight?: { vertexId: Id; edgeId: Id };
  disabled?: boolean;
  title?: string;
  isSeparator?: boolean;
}

export type RoutePaintKind = "river" | "road" | "wall";

export type EraseTarget = "cells" | "edges" | "both";

export interface RouteStroke {
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

export interface CircularWallStroke {
  center: Point;
  centerClient: { clientX: number; clientY: number };
  radiusMeters: number;
}

export interface UiStepResult {
  document: CityDocument | null;
  total: number;
  index: number;
  detail: string | null;
  highlightFaces?: Set<Id> | null;
  overlayPaths?: Point[][] | null;
}

export type StepFn = (
  document: CityDocument,
  settings: GenerationSettings,
  seed: string,
  stepIndex: number
) => UiStepResult;

export interface ShipDragState {
  shipId: string;
  mode: "move" | "rotate";
  startPoint: Point;
  initialShipPoint: Point;
  initialRotation: number;
  moved: boolean;
}

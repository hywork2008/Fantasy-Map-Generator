import { create } from "zustand";

export type BrushMode =
  | "brushRaise"
  | "brushElevate"
  | "brushLower"
  | "brushDepress"
  | "brushAlign"
  | "brushSmooth"
  | "brushDisrupt"
  | "brushFill"
  | "brushLine"
  | null;
export type CellTypeFilter = "all" | "land" | "water";
export type RescaleMode = "slider" | "condition" | null;
export type ConditionSign = "multiply" | "divide" | "add" | "subtract" | "exponent";

export interface TemplateStep {
  id: string;
  type: string;
  y?: string;
  x?: string;
  h?: string;
  n?: string;
  dist?: string; // direction or category
  skip?: boolean;
}

export interface HeightmapColorMapping {
  color: string;
  height: number;
}

export interface HeightmapEditorState {
  // Brushes Panel
  brushMode: BrushMode;
  brushRadius: number;
  brushPower: number;
  linePower: number;
  cellTypeFilter: CellTypeFilter;
  rescaleMode: RescaleMode;
  rescaleValue: number;
  rescaleLower: number;
  rescaleHigher: number;
  rescaleSign: ConditionSign;
  rescaleModifier: number;

  // Template Editor
  templateSelected: string;
  templateSteps: TemplateStep[];
  templateSeed: number;
  templateSeedLocked: boolean;

  // Image Converter
  imageConverterOverlay: number;
  imageConverterColorsMax: number;
  imageConverterUnassigned: string[];
  imageConverterAssigned: Record<string, number>;
  imageConverterSelectedColor: string | null;
  imageConverterHoveredHeight: number | null;
  imageConverterOriginalImage: HTMLImageElement | null;
  imageConverterCanvas: HTMLCanvasElement | null;

  canUndo: boolean;
  canRedo: boolean;
}

export const useHeightmapEditorState = create<HeightmapEditorState>(() => ({
  brushMode: null,
  brushRadius: 25,
  brushPower: 5,
  linePower: 30,
  cellTypeFilter: "all",
  rescaleMode: null,
  rescaleValue: 0,
  rescaleLower: 20,
  rescaleHigher: 100,
  rescaleSign: "multiply",
  rescaleModifier: 0.9,

  templateSelected: "custom",
  templateSteps: [],
  templateSeed: 123456789,
  templateSeedLocked: false,

  imageConverterOverlay: 0,
  imageConverterColorsMax: 100,
  imageConverterUnassigned: [],
  imageConverterAssigned: {},
  imageConverterSelectedColor: null,
  imageConverterHoveredHeight: null,
  imageConverterOriginalImage: null,
  imageConverterCanvas: null,

  canUndo: false,
  canRedo: false
}));

export const getHeightmapEditorState = useHeightmapEditorState.getState;
export const setHeightmapEditorState = useHeightmapEditorState.setState;

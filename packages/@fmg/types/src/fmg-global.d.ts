/**
 * FMG Global Context Type Definition
 * All shared utilities and functions are organized under window.fmg namespace
 */

import type { Cells, Grid, Point, Vertices } from "./Grid";
import type { PackedGraph } from "./PackedGraph";

type Isoline = {
  polygons?: [number, number][][];
  fill?: string;
  halo?: string;
  waterGap?: string;
};

type RollupResult<R> = Array<[unknown, R | RollupResult<R>]>;
type LegacyLayerToggleEvent = Event;
type SaveMethod = "storage" | "machine" | "dropbox";
type JsonExportType = "Full" | "Minimal" | "PackCells" | "GridCells";

export interface FmgGlobalContext {
  // ==================== Number Utils ====================
  rn: (min: number, max: number) => number;
  lim: (value: number, min: number, max: number) => number;
  minmax: (value: number, min: number, max: number) => number;
  normalize: (val: number, min: number, max: number) => number;
  lerp: (start: number, end: number, t: number) => number;

  // ==================== Language Utils ====================
  vowel: (char: string) => boolean;
  trimVowels: (str: string) => string;
  getAdjective: (name: string) => string;
  nth: (n: number) => string;
  abbreviate: (str: string) => string;
  list: (arr: string[], joiner?: string, finisher?: string) => string;

  // ==================== Array Utils ====================
  last: <T>(arr: T[]) => T;
  unique: <T>(arr: T[]) => T[];
  getTypedArray: (maxValue: number) => typeof Uint8Array | typeof Uint16Array | typeof Uint32Array;
  createTypedArray: (options: { maxValue: number; length: number; from?: ArrayLike<number> }) => 
    Uint8Array | Uint16Array | Uint32Array;
  INT8_MAX: number;
  UINT8_MAX: number;
  UINT16_MAX: number;
  UINT32_MAX: number;

  // ==================== Probability Utils ====================
  rand: (min?: number, max?: number) => number;
  P: (probability: number) => boolean;
  each: (n: number) => (i: number) => boolean;
  gauss: (mean?: number, stdDev?: number) => number;
  Pint: (float: number) => number;
  ra: <T>(arr: T[]) => T;
  rw: (object: { [key: string]: number }) => string;
  biased: (min: number, max: number, ex: number) => number;
  getNumberInRange: (r: string) => number;
  generateSeed: () => string;

  // ==================== Unit Utils ====================
  convertTemperature: (temp: number, scale?: string) => string;
  si: (value: number) => string;
  getInteger: (str: string) => number;

  // ==================== Color Utils ====================
  toHEX: (rgba: string) => string;
  getColors: (count: number) => string[];
  getRandomColor: () => string;
  getMixedColor: (colorToMix: string, mix?: number, bright?: number) => string;
  C_12: string[];

  // ==================== DOM Utils ====================
  ensureEl: <T extends HTMLElement | null = HTMLElement | null>(id: string) => T;
  getComposedPath: (event: Node | Window | ShadowRoot | Document) => Array<Node | Window>;
  getNextId: (prefix: string) => string;

  // ==================== Function Utils ====================
  rollups: <T, R>(
    values: T[],
    reduce: (values: T[]) => R,
    ...keys: ((value: T, index: number, array: T[]) => unknown)[]
  ) => RollupResult<R>;
  dist2: ([x1, y1]: [number, number], [x2, y2]: [number, number]) => number;

  // ==================== Path Utils ====================
  getIsolines: (
    graph: Pick<PackedGraph, "cells" | "vertices" | "features">,
    getType: (cellId: number) => string | number,
    options?: {
      polygons?: boolean;
      fill?: boolean;
      halo?: boolean;
      waterGap?: boolean;
    }
  ) => Record<string | number, Isoline>;
  getPolesOfInaccessibility: (
    graph: Pick<PackedGraph, "cells" | "vertices" | "features">,
    getType: (cellId: number) => string | number
  ) => Record<string | number, [number, number]>;
  connectVertices: (options: {
    vertices: Vertices;
    startingVertex: number;
    ofSameType: (cellId: number) => boolean;
    addToChecked?: (cellId: number) => void;
    closeRing?: boolean;
  }) => number[];
  findPath: (
    start: number,
    isExit: (id: number) => boolean,
    getCost: (current: number, next: number) => number,
    packedGraph?: Pick<PackedGraph, "cells">
  ) => number[] | null;
  getVertexPath: (cellsArray: number[], packedGraph?: Pick<PackedGraph, "cells" | "vertices" | "features">) => string;

  // ==================== String Utils ====================
  round: (inputString?: string, decimals?: number) => string;
  capitalize: (str: string) => string;
  splitInTwo: (str: string) => string[];
  parseTransform: (str: string) => [number, number, number, number, number, number];
  sanitizeId: (str: string) => string;

  // ==================== Graph Utils ====================
  shouldRegenerateGrid: (grid: Grid, expectedSeed: number) => boolean;
  generateGrid: () => Grid;
  findGridAll: (x: number, y: number, radius: number) => number[];
  findGridCell: (x: number, y: number) => number;
  findCell: (x: number, y: number, radius?: number) => number | undefined;
  findAll: (x: number, y: number, radius: number) => number[];
  getPackPolygon: (cellIndex: number) => number[][];
  getGridPolygon: (cellIndex: number) => number[][];
  calculateVoronoi: (points: Point[], boundary: Point[]) => { cells: Cells; vertices: Vertices };
  poissonDiscSampler: (x0: number, y0: number, x1: number, y1: number, r: number, k?: number) => Generator<[number, number], void, unknown>;

  // ==================== Legacy UI Globals (migration period) ====================
  handleLayersPresetChange?: (preset: string) => void;
  savePreset?: () => void;
  removePreset?: () => void;
  getCurrentPreset?: () => void;
  drawStates?: () => void;

  toggleHeight?: (event?: LegacyLayerToggleEvent) => void;
  toggleTemperature?: (event?: LegacyLayerToggleEvent) => void;
  toggleBiomes?: (event?: LegacyLayerToggleEvent) => void;
  togglePrecipitation?: (event?: LegacyLayerToggleEvent) => void;
  togglePopulation?: (event?: LegacyLayerToggleEvent) => void;
  toggleCells?: (event?: LegacyLayerToggleEvent) => void;
  toggleIce?: (event?: LegacyLayerToggleEvent) => void;
  toggleCultures?: (event?: LegacyLayerToggleEvent) => void;
  toggleReligions?: (event?: LegacyLayerToggleEvent) => void;
  toggleStates?: (event?: LegacyLayerToggleEvent) => void;
  toggleBorders?: (event?: LegacyLayerToggleEvent) => void;
  toggleProvinces?: (event?: LegacyLayerToggleEvent) => void;
  toggleGrid?: (event?: LegacyLayerToggleEvent) => void;
  toggleCoordinates?: (event?: LegacyLayerToggleEvent) => void;
  toggleCompass?: (event?: LegacyLayerToggleEvent) => void;
  toggleRelief?: (event?: LegacyLayerToggleEvent) => void;
  toggleLakes?: (event?: LegacyLayerToggleEvent) => void;
  toggleTexture?: (event?: LegacyLayerToggleEvent) => void;
  toggleRivers?: (event?: LegacyLayerToggleEvent) => void;
  toggleRoutes?: (event?: LegacyLayerToggleEvent) => void;
  toggleMilitary?: (event?: LegacyLayerToggleEvent) => void;
  toggleMarkers?: (event?: LegacyLayerToggleEvent) => void;
  toggleLabels?: (event?: LegacyLayerToggleEvent) => void;
  toggleBurgIcons?: (event?: LegacyLayerToggleEvent) => void;
  toggleRulers?: (event?: LegacyLayerToggleEvent) => void;
  toggleScaleBar?: (event?: LegacyLayerToggleEvent) => void;
  toggleZones?: (event?: LegacyLayerToggleEvent) => void;
  toggleEmblems?: (event?: LegacyLayerToggleEvent) => void;
  toggleVignette?: (event?: LegacyLayerToggleEvent) => void;

  handleKeydown?: (event: KeyboardEvent) => void;
  handleKeyup?: (event: KeyboardEvent) => void;
  allowHotkeys?: () => boolean;
  handleBracketSizeChange?: (code: string) => boolean;
  closeAllDialogs?: () => void;

  requestStylePresetChange?: (preset: string) => void;
  applyStyle?: (styleJSON: Record<string, Record<string, string | number | null>>) => void;
  applyStyleWithUiRefresh?: (style: Record<string, Record<string, string | number | null>>) => void;
  changeStyle?: (desiredPreset: string) => Promise<void>;
  addStylePreset?: () => void;
  requestRemoveStylePreset?: () => void;
  editBurg?: (id?: number | string) => void;
  editRiver?: (id: string) => void;
  editRoute?: (id: string) => void;
  editLabel?: () => void;
  editLake?: () => void;
  editCoastline?: () => void;
  editMarker?: (markerI?: number) => void;
  editReliefIcon?: () => void;
  editRegiment?: (selector?: string) => void;
  editIce?: (element: EventTarget | null) => void;
  editStyle?: (element: string, group?: string) => void;
  editBiomes?: () => void;
  editBurgGroups?: () => void;
  editStates?: () => Promise<void>;
  editCultures?: () => Promise<void>;
  editReligions?: () => Promise<void>;
  editProvinces?: () => void;
  editZones?: () => void;
  editUnits?: () => void;
  editDiplomacy?: () => void;
  editCoastlineSettings?: () => void;
  editEmblem?: (type: string, id: string, el: unknown) => void;
  editHeightmap?: (options?: unknown) => void;
  editNotes?: (id?: string, name?: string) => void;
  editRouteGroups?: () => void;
  showBurgTemperatureGraph?: (id: number) => void;
  addCustomColorScheme?: (scheme: string) => void;
  getColorScheme?: (scheme?: string) => unknown;
  getColor?: (value: number, scheme?: unknown) => string;
  getElevation?: (feature: unknown, height: number) => string | undefined;
  getDepth?: (feature: unknown, point: [number, number]) => string;
  getPrecipitation?: (precipitation: number) => string;
  getFriendlyPrecipitation?: (cellIndex: number) => string;
  getRiverInfo?: (riverId: number | string) => string;
  getFriendlyPopulation?: (cellIndex: number) => string;
  getPopulationTip?: (cellIndex: number) => string;
  highlightEmblemElement?: (type: string, element: unknown) => void;
  removeCircle?: () => void;
  clicked?: () => void;
  fitContent?: () => string;
  applySortingByHeader?: (headerContainer: string) => void;
  applySorting?: (headers: Element) => void;
  fitLegendBox?: () => void;
  redrawLegend?: () => void;
  clearLegend?: () => void;
  drawLegend?: (name: string, data: unknown[]) => void;
  dragLegendBox?: () => void;
  createPicker?: () => void;
  openPicker?: (fill: string, callback: (newFill: string) => void) => void;
  dragPicker?: () => void;
  clickPickerControl?: () => void;
  dragPickerControl?: () => void;
  changePickerSpace?: () => void;
  selectIcon?: (initial: string, callback: (value: string) => void) => void;
  getBBox?: (element: Element) => { x: number; y: number; width: number; height: number };
  highlightElement?: (element: Element, zoom?: number) => void;
  getAreaUnit?: (squareMark?: string) => string;
  getArea?: (rawArea: number) => number;
  listen?: (element: { on: (...args: unknown[]) => void; off: (...args: unknown[]) => void }, event: string, handler: (...args: unknown[]) => void) => () => void;
  refreshAllEditors?: () => void;
  fog?: (id: string, path: string) => void;
  unfog?: (id?: string) => void;
  moveCircle?: (x: number, y: number, r?: number) => void;
  confirmationDialog?: (options: {
    title?: string;
    message?: string;
    cancel?: string;
    confirm?: string;
    onCancel?: () => void;
    onConfirm?: () => void;
  }) => void;
  getHeight?: (height: number, abs?: boolean | string) => string;
  mapSizeInputChange?: () => void;
  copyMapURL?: () => void;
  changeUiSize?: (value: number | string) => void;
  getUImaxSize?: () => number;
  changeTooltipSize?: (value: number | string) => void;
  changeThemeHue?: (hue: number | string) => void;
  changeDialogsTheme?: (themeColor: string, transparency: number | string) => void;
  changeZoomExtent?: (value: number | string) => void;
  randomizeHeightmapTemplate?: () => void;
  randomizeCultureSet?: () => void;
  generateEra?: () => void;
  unselect?: () => void;

  saveMap?: (method: SaveMethod) => Promise<void>;
  quickLoad?: () => Promise<void>;
  loadFromDropbox?: () => Promise<void>;
  createSharableDropboxLink?: () => Promise<void>;
  loadMapPrompt?: (blob: Blob) => void;
  showUploadMessage?: (type: string, mapData: any[], mapVersion: string) => void;
  loadMapFromURL?: (maplink: string, random?: number) => Promise<void>;
  showUploadErrorMessage?: (error: any, maplink: string, random?: number) => void;
  uploadMap?: (file: Blob | File, callback?: () => void) => void;
  connectToDropbox?: () => Promise<void>;
  loadURL?: () => void;
  addLabelOnClick?: () => void;
  addRiverOnClick?: () => void;
  addMarkerOnClick?: () => void;
  toggleAddRiver?: () => void;
  configMarkersGeneration?: () => void;
  overviewBurgs?: (settings?: { stateId: number | null; cultureId: number | null }) => void;
  overviewMarkers?: () => void;
  overviewRivers?: () => void;
  overviewRoutes?: () => void;
  overviewMilitary?: () => void;
  getCellPopulation?: (i: number) => [number, number];
  showInfo?: () => void;
  setSeedFlow?: (deps: any, precreatedSeed?: string) => void;
  addLakesInDeepDepressionsFlow?: (deps: any) => void;
  openNearSeaLakesFlow?: (deps: any) => void;
  generateMapFlow?: (deps: any, options?: { seed?: string; graph?: unknown }) => Promise<void>;
  reGraphFlow?: (deps: any) => void;
  rankCellsFlow?: (deps: any) => void;
  showStatisticsFlow?: (deps: any) => void;
  undrawFlow?: (deps: any) => void;
  regenerateMapFlow?: (options: unknown, deps: any) => Promise<void>;
  createRegenerateMap?: (debounceFn: any, deps: any) => (options: unknown) => void;
  buildGenerationModules?: (deps: any) => any;
  buildGenerateDeps?: <T>(deps: T) => T;
  zoomToPoint?: (deps: any, x: number, y: number, z?: number, d?: number) => void;
  resetZoomToInitial?: (deps: any, d?: number) => void;
  invokeActiveZoomingView?: (deps: any) => void;
  defineMapSizeFlow?: (deps: any) => void;
  calculateMapCoordinatesFlow?: (deps: any) => any;
  calculateTemperaturesFlow?: (deps: any) => void;
  generatePrecipitationFlow?: (deps: any) => void;
  checkLoadParametersFlow?: (deps: any) => Promise<void>;
  generateMapOnLoadFlow?: (deps: any) => Promise<void>;
  focusOnFlow?: (deps: any) => void;
  findBurgForMFCGFlow?: (deps: any) => number | undefined;
  initStartupOnDomContentLoaded?: (deps: any) => void;
  buildCheckLoadParametersDeps?: <T>(deps: T) => T;
  buildGenerateMapOnLoadDeps?: <T>(deps: T) => T;
  buildFocusOnDeps?: <T>(deps: T) => T;
  buildFindBurgForMFCGDeps?: <T>(deps: T) => T;
  buildZoomToPointDeps?: <T>(deps: T) => T;
  buildResetZoomDeps?: <T>(deps: T) => T;
  buildInvokeActiveZoomingDeps?: <T>(deps: T) => T;
  hideLoadingUI?: (deps: any) => void;
  showLoadingUI?: (deps: any) => void;
  openMinimapDialog?: () => void;
  toggleAssistantWidget?: (deps: any) => void;
  initTourPromptButtonUI?: (deps: any) => void;
  initDragToUpload?: (deps: any) => void;
  selectStyleElement?: () => void;
  updateElements?: () => void;

  exportToSvg?: () => Promise<void>;
  exportToPng?: () => Promise<void>;
  exportToJpeg?: () => Promise<void>;
  openExportToPngTiles?: () => void;
  exportToPngTiles?: () => Promise<void>;

  saveGeoJsonCells?: () => void;
  saveGeoJsonRoutes?: () => void;
  saveGeoJsonRivers?: () => void;
  saveGeoJsonMarkers?: () => void;
  saveGeoJsonZones?: () => void;
  exportToJson?: (type: JsonExportType) => void;
}

declare global {
  interface Window {
    fmg?: FmgGlobalContext;
  }
}

export {};

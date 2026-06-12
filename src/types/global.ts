import type { Quadtree, Selection } from "d3";
import type { ViewState } from "../context/viewState";
import type { WorldContext } from "../context/worldContext";

import type { Battle as BattleClass } from "../controllers/battle-screen";
import type {
  Opisometer as OpismeterClass,
  Planimeter as PlanimeterClass,
  RouteOpisometer as RouteOpisometerClass,
  Ruler as RulerClass,
  Rulers as RulersClass
} from "../controllers/measurers";
import type { NameBase } from "../modules/names-generator";
import type { Route } from "../modules/routes-generator";
import type { Grid } from "../utils/graphUtils";
import type { PackedGraph } from "./PackedGraph";
import type { BiomesData, MapStyle, WorldNote, WorldOptions } from "./WorldState";

interface HeightmapTemplate {
  name: string;
  template: string;
  [key: string]: unknown;
}

declare global {
  /** DEV-only: organized access to world data and SVG state for console debugging. */
  var __fmg: { worldContext: WorldContext; viewState: ViewState } | undefined;

  var seed: string;
  var pack: PackedGraph;
  var grid: Grid;
  var graphHeight: number;
  var graphWidth: number;
  var TIME: boolean;
  var INFO: boolean;
  var WARN: boolean;
  var ERROR: boolean;
  var VERSION: string;
  var DEBUG: { stateLabels?: boolean; [key: string]: boolean | undefined };
  var options: WorldOptions;

  var heightmapTemplates: Record<string, HeightmapTemplate>;
  var populationRate: number;
  var urbanDensity: number;
  var urbanization: number;
  var distanceScale: number;
  var nameBases: NameBase[];

  var pointsInput: HTMLInputElement;
  var culturesInput: HTMLInputElement;
  var culturesSet: HTMLSelectElement;
  var heightExponentInput: HTMLInputElement;
  var alertMessage: HTMLElement;
  var mapName: HTMLInputElement;
  var religionsNumber: HTMLInputElement;
  var distanceUnitInput: HTMLInputElement;
  var heightUnit: HTMLSelectElement;

  var compass: Selection<SVGGElement, unknown, null, undefined>;
  var terrain: Selection<SVGGElement, unknown, null, undefined>;
  var icons: Selection<SVGGElement, unknown, null, undefined>;
  var borders: Selection<SVGGElement, unknown, null, undefined>;
  var ruler: Selection<SVGGElement, unknown, null, undefined>;
  var statesBody: Selection<SVGGElement, unknown, null, undefined>;
  var statesHalo: Selection<SVGGElement, unknown, null, undefined>;
  var scaleBar: Selection<SVGGElement, unknown, null, undefined>;
  var legend: Selection<SVGGElement, unknown, null, undefined>;

  var rivers: Selection<SVGElement, unknown, null, undefined>;
  var ocean: Selection<SVGGElement, unknown, null, undefined>;
  var oceanLayers: Selection<SVGGElement, unknown, null, undefined>;
  var oceanPattern: Selection<SVGGElement, unknown, null, undefined>;
  var landmass: Selection<SVGGElement, unknown, null, undefined>;
  var fogging: Selection<SVGGElement, unknown, null, undefined>;
  var debug: Selection<SVGGElement, unknown, null, undefined>;
  var roads: Selection<SVGGElement, unknown, null, undefined>;
  var trails: Selection<SVGGElement, unknown, null, undefined>;
  var searoutes: Selection<SVGGElement, unknown, null, undefined>;
  var stateBorders: Selection<SVGGElement, unknown, null, undefined>;
  var provinceBorders: Selection<SVGGElement, unknown, null, undefined>;
  var emblems: Selection<SVGElement, unknown, null, undefined>;
  var svg: Selection<SVGSVGElement, unknown, null, undefined>;
  var ice: Selection<SVGGElement, unknown, null, undefined>;
  var labels: Selection<SVGGElement, unknown, null, undefined>;
  var burgLabels: Selection<SVGGElement, unknown, null, undefined>;
  var burgIcons: Selection<SVGGElement, unknown, null, undefined>;
  var anchors: Selection<SVGGElement, unknown, null, undefined>;
  var terrs: Selection<SVGGElement, unknown, null, undefined>;
  var temperature: Selection<SVGGElement, unknown, null, undefined>;
  var markers: Selection<SVGGElement, unknown, null, undefined>;
  var defs: Selection<SVGDefsElement, unknown, null, undefined>;
  var coastline: Selection<SVGGElement, unknown, null, undefined>;
  var lakes: Selection<SVGGElement, unknown, null, undefined>;
  var provs: Selection<SVGGElement, unknown, null, undefined>;
  var biomes: Selection<SVGGElement, unknown, null, undefined>;
  var cults: Selection<SVGGElement, unknown, null, undefined>;
  var relig: Selection<SVGGElement, unknown, null, undefined>;
  var regions: Selection<SVGGElement, unknown, null, undefined>;
  var prec: Selection<SVGGElement, unknown, null, undefined>;
  var population: Selection<SVGGElement, unknown, null, undefined>;
  var cells: Selection<SVGGElement, unknown, null, undefined>;
  var gridOverlay: Selection<SVGGElement, unknown, null, undefined>;
  var coordinates: Selection<SVGGElement, unknown, null, undefined>;
  var texture: Selection<SVGGElement, unknown, null, undefined>;
  var zones: Selection<SVGGElement, unknown, null, undefined>;
  var armies: Selection<SVGGElement, unknown, null, undefined>;
  var getColorScheme: (scheme: string | null) => (t: number) => string;
  var getColor: (height: number, scheme: (t: number) => string) => string;
  var svgWidth: number;
  var svgHeight: number;
  var viewbox: Selection<SVGElement, unknown, null, undefined>;
  var routes: Selection<SVGElement, unknown, null, undefined>;
  var biomesData: BiomesData;
  var notes: WorldNote[];
  var style: MapStyle;

  var shapeRendering: HTMLSelectElement;
  var mapWidthInput: HTMLInputElement;
  var mapHeightInput: HTMLInputElement;

  var layerIsOn: (layerId: string) => boolean;
  var turnButtonOn: (layerId: string) => void;
  var turnButtonOff: (layerId: string) => void;
  var getCurrentPreset: () => void;
  var applyLayersPreset: () => void;
  var drawLayers: () => void;
  var handleLayersPresetChange: (preset: string) => void;
  var savePreset: () => void;
  var removePreset: () => void;

  var drawRoute: (route: Route) => void;
  var drawBiomes: () => void;
  var drawPrecipitation: () => void;
  var drawPopulation: () => void;
  var drawCells: () => void;
  var drawCultures: () => void;
  var drawReligions: () => void;
  var drawStates: () => void;
  var drawProvinces: () => void;
  var drawGrid: () => void;
  var drawCoordinates: () => void;
  var drawTexture: () => void;
  var drawRivers: () => void;
  var drawRoutes: () => void;
  var drawZones: () => void;
  var drawHeightmap: () => void;
  var drawBorders: () => void;
  var drawBurgIcons: () => void;
  var drawBurgLabels: () => void;
  var drawStateLabels: (list?: number[]) => void;
  var drawTemperature: () => void;
  var drawMilitary: () => void;
  var drawMarkers: () => void;
  var drawEmblems: () => void;
  var drawFeatures: () => void;
  var drawIce: () => void;
  var drawReliefIcons: () => void;
  var invokeActiveZooming: () => void;

  var toggleHeight: (event?: MouseEvent) => void;
  var toggleTemperature: (event?: MouseEvent) => void;
  var toggleBiomes: (event?: MouseEvent) => void;
  var togglePrecipitation: (event?: MouseEvent) => void;
  var togglePopulation: (event?: MouseEvent) => void;
  var toggleCells: (event?: MouseEvent) => void;
  var toggleIce: (event?: MouseEvent) => void;
  var toggleCultures: (event?: MouseEvent) => void;
  var toggleReligions: (event?: MouseEvent) => void;
  var toggleStates: (event?: MouseEvent) => void;
  var toggleBorders: (event?: MouseEvent) => void;
  var toggleProvinces: (event?: MouseEvent) => void;
  var toggleGrid: (event?: MouseEvent) => void;
  var toggleCoordinates: (event?: MouseEvent) => void;
  var toggleCompass: (event?: MouseEvent) => void;
  var toggleRelief: (event?: MouseEvent) => void;
  var toggleLakes: (event?: MouseEvent) => void;
  var toggleTexture: (event?: MouseEvent) => void;
  var toggleRivers: (event?: MouseEvent) => void;
  var toggleRoutes: (event?: MouseEvent) => void;
  var toggleMilitary: (event?: MouseEvent) => void;
  var toggleMarkers: (event?: MouseEvent) => void;
  var toggleLabels: (event?: MouseEvent) => void;
  var toggleBurgIcons: (event?: MouseEvent) => void;
  var toggleRulers: (event?: MouseEvent) => void;
  var toggleScaleBar: (event?: MouseEvent) => void;
  var toggleZones: (event?: MouseEvent) => void;
  var toggleEmblems: (event?: MouseEvent) => void;
  var toggleVignette: (event?: MouseEvent) => void;

  var rulers: {
    draw: () => void;
    data: { id: number; draw: () => unknown; undraw: () => void }[];
    create: <T>(Type: new (points: [number, number][]) => T, points: [number, number][]) => T;
    remove: (id: number) => void;
    fromString: (str: string) => void;
    toString: () => string;
    undraw: () => void;
  };
  var editStyle: (layerId: string, group?: string) => void;
  var calculateFriendlyGridSize: () => void;
  var selectStyleElement: () => void;
  var updateElements: () => void;
  var textureProvideURL: () => void;
  var fetchTextureURL: (url: string) => void;
  var heightmapColorSchemes: Record<string, (t: number) => string>;
  var addCustomColorScheme: (scheme: string) => void;
  var applyStyleOnLoad: () => Promise<void>;
  var applyStyle: (styleJSON: Record<string, Record<string, string | number | null>>) => void;
  var applyStyleWithUiRefresh: (styleJSON: Record<string, Record<string, string | number | null>>) => void;
  var changeStyle: (preset: string) => Promise<void>;
  var addStylePreset: () => void;
  var requestStylePresetChange: (preset: string) => void;
  var requestRemoveStylePreset: () => void;
  var removeStylePreset: () => void;
  var updateMapFilter: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var FlatQueue: new <T = any>() => {
    push: (item: T, priority: number) => void;
    pop: () => T;
    peekValue: () => number;
    length: number;
  };

  var tip: (
    message: string,
    autoHide?: boolean,
    type?: "info" | "warn" | "error" | "success",
    timeout?: number
  ) => void;
  var locked: (settingId: string) => boolean;
  var lock: (settingId: string) => void;
  var unlock: (settingId: string) => void;
  var showOptions: (event?: Event) => void;
  var redrawLegend: () => void;
  var confirmationDialog: (options: {
    title?: string;
    message?: string;
    cancel?: string;
    confirm?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }) => void;
  var applyOption: (select: HTMLSelectElement | HTMLInputElement, value: string, name?: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var $: (selector: any) => any;
  var scale: number;
  var changeFont: () => void;
  var getFriendlyHeight: (coords: [number, number]) => string;
  var addLakesInDeepDepressions: () => void;
  var openNearSeaLakes: () => void;
  var calculateMapCoordinates: () => void;
  var calculateTemperatures: () => void;
  var reGraph: () => void;
  var createDefaultRuler: () => void;
  var showStatistics: () => void;
  var closeDialogs: (except?: string) => void;
  var restoreDefaultEvents: (() => void) | undefined;
  var editWorld: () => void;
  var showExportPane: () => void;
  var getHeight: (h: number, abs?: string) => string;
  var getLatitude: (y: number, precision?: number) => number;
  var getLongitude: (x: number, precision?: number) => number;
  var getFileName: (name?: string) => string;
  var customization: number;
  var speak: (text: string) => void;
  var uploadFile: (el: HTMLInputElement, callback: (data: string) => void) => void;
  var downloadFile: (content: string | Blob, name: string, type?: string) => void;
  var zoomTo: (x: number, y: number, zoom: number, duration: number) => void;
  var modules: Record<string, boolean>;

  // Additional HTML inputs (settings UI)
  var distanceScaleInput: HTMLInputElement;
  var populationRateInput: HTMLInputElement;
  var urbanizationInput: HTMLInputElement;
  var urbanDensityInput: HTMLInputElement;
  var mapSizeInput: HTMLInputElement;
  var latitudeInput: HTMLInputElement;
  var precInput: HTMLInputElement;
  var longitudeInput: HTMLInputElement;

  // Additional UI functions
  var editUnits: () => void;
  var clearLegend: () => void;

  // Utility globals (window-wrapped versions)
  var last: <T>(arr: T[]) => T;
  var findCell: (x: number, y: number, radius?: number) => number;
  var parseError: (error: unknown) => string;

  // ─── I/O module globals ───────────────────────────────────────────────────

  // HTML inputs for world settings (used by save/load)
  var areaUnit: HTMLSelectElement;
  var temperatureScale: HTMLSelectElement;
  var mapSizeOutput: HTMLOutputElement;
  var latitudeOutput: HTMLOutputElement;
  var longitudeOutput: HTMLOutputElement;
  var precOutput: HTMLOutputElement;
  var hideLabels: HTMLInputElement;
  var stylePreset: HTMLSelectElement;
  var rescaleLabels: HTMLInputElement;
  var hideEmblems: HTMLInputElement;
  var growthRate: HTMLInputElement;
  var stateLabelsModeInput: HTMLSelectElement;
  var yearInput: HTMLInputElement;
  var eraInput: HTMLInputElement;
  var optionsSeed: HTMLInputElement;
  var mapToLoad: HTMLInputElement;
  var customizationMenu: HTMLElement;
  var styleTab: HTMLElement;
  var autosaveIntervalOutput: HTMLInputElement;
  var pngResolutionInput: HTMLInputElement;
  var renderOcean: HTMLInputElement;

  // Map state
  var mapId: number;
  var mapHistory: Array<{ seed: string; width: number; height: number; template: string; created: number }>;

  // IndexedDB wrapper
  var ldb: {
    get: (key: string) => Promise<Blob | null>;
    set: (key: string, value: Blob) => Promise<void>;
  };

  // Cloud module is declared in src/io/cloud.ts

  // Versioning helpers (from versioning.js)
  var compareVersions: (a: string, b: string) => { isEqual: boolean; isNewer: boolean; isOlder: boolean };
  var parseMapVersion: (version: string) => string;
  var isValidVersion: (version: string) => boolean;

  // App lifecycle functions (from main.ts)
  var generate: (options?: { seed?: string; graph?: Grid | null }) => Promise<void>;
  var getWorldState: () => import("./WorldState").WorldState;
  var generateMapOnLoad: () => Promise<void>;
  var checkLoadParameters: () => Promise<void>;
  var defineMapSize: () => void;
  var focusOn: () => void;
  var regenerateMap: (opts?: { seed?: string } | string) => void;
  var showLoading: () => void;
  var hideLoading: () => void;
  var color: (t: number) => string;
  var isWetLand: (moisture: number, temperature: number, height: number) => boolean;
  var cleanupData: () => void;
  var clearMainTip: () => void;
  var fitMapToScreen: () => void;
  var updateTextureSelectValue: (href: string) => void;
  var getCellPopulation: (i: number) => [number, number];
  var getCoordinates: (x: number, y: number, decimals?: number) => [number, number];

  // ─── I/O: save module ───────────────────────────────────────────────────────
  var prepareMapData: () => string;
  var saveToStorage: (mapData: string, showTip?: boolean) => Promise<void>;
  var saveToMachine: (mapData: string, filename: string) => void;
  var saveMap: (method: string) => Promise<void>;
  var initiateAutosave: () => Promise<void>;
  var toggleSaveReminder: () => void;

  // ─── I/O: export module ─────────────────────────────────────────────────────
  var exportToSvg: () => Promise<void>;
  var exportToPng: () => Promise<void>;
  var exportToJpeg: () => Promise<void>;
  var exportToPngTiles: () => Promise<void>;
  var getMapURL: (
    type: string,
    options?: {
      debug?: boolean;
      noLabels?: boolean;
      noWater?: boolean;
      noScaleBar?: boolean;
      noIce?: boolean;
      noVignette?: boolean;
      noViewbox?: boolean;
      fullMap?: boolean;
    }
  ) => Promise<string>;
  var removeUnusedElements: (clone: Selection<SVGGElement, unknown, null, undefined>) => void;
  var inlineStyle: (clone: Selection<SVGGElement, unknown, null, undefined>) => void;
  var saveGeoJsonCells: () => void;
  var saveGeoJsonRoutes: () => void;
  var saveGeoJsonRivers: () => void;
  var saveGeoJsonMarkers: () => void;
  var saveGeoJsonZones: () => void;

  // ─── I/O: load module ───────────────────────────────────────────────────────
  var quickLoad: () => Promise<void>;
  var loadFromDropbox: () => Promise<void>;
  var createSharableDropboxLink: () => Promise<void>;
  var loadMapPrompt: (blob: Blob) => void;
  var loadMapFromURL: (maplink: string, random: number) => Promise<void>;
  var uploadMap: (file: Blob, callback?: () => void) => void;
  var showUploadErrorMessage: (error: string, maplink: string, random: number) => void;
  var parseLoadedResult: (
    result: ArrayBuffer | Uint8Array
  ) => Promise<{ mapData: string[] | null; mapVersion: string | null }>;
  var parseLoadedData: (data: string[], mapVersion: string) => Promise<void>;

  // ─── Phase 8: hotkeys / uiHelpers / measurers ────────────────────────────

  // Zoom behavior (d3, from main.js)
  var zoom: ZoomBehaviorExtended;
  interface ZoomBehaviorExtended {
    translateBy: (selection: unknown, dx: number, dy: number) => ZoomBehaviorExtended;
    scaleTo: (selection: unknown, scale: number) => ZoomBehaviorExtended;
    scaleBy: (selection: unknown, factor: number) => ZoomBehaviorExtended;
    translateExtent: (extent: [[number, number], [number, number]]) => ZoomBehaviorExtended;
    scaleExtent: (extent: [number, number]) => ZoomBehaviorExtended;
  }

  var MOBILE: boolean;
  var hideOptions: () => void;
  var toggleOptions: (event?: Event) => void;
  var regeneratePrompt: (opts?: { seed?: string }) => void;
  var generateSeed: () => string;
  var shouldRegenerateGrid: (grid: Grid | null | undefined, expectedSeed: number) => boolean;
  var generateGrid: () => Grid;
  var drawHeights: (opts: {
    heights: number[];
    width: number;
    height: number;
    scheme: (v: number) => string;
    renderOcean: boolean;
  }) => string;
  var findAllInQuadtree: (x: number, y: number, radius: number, quadtree: Quadtree<unknown>) => unknown[];
  var toggle3dOptions: () => void;
  var zonesRemove: HTMLButtonElement | null;
  var undo: HTMLButtonElement | null;
  var redo: HTMLButtonElement | null;
  var resetZoom: (duration?: number) => void;

  // Editor openers
  var editHeightmap: (options?: { mode?: string; tool?: string }) => void;
  var editBiomes: () => void;
  var editStates: () => void;
  var editProvinces: () => void;
  var editDiplomacy: () => void;
  var editCoastlineSettings: () => void;
  var editCultures: () => void;
  var editZones: () => void;
  var editReligions: () => void;
  var editNotes: (id?: string, name?: string) => void;
  var overviewRoutes: () => void;
  var overviewRivers: () => void;
  var overviewMilitary: () => void;
  var overviewBurgs: (settings?: { stateId?: number | null; cultureId?: number | null }) => void;
  var overviewMarkers: () => void;
  var createRoute: () => void;

  // Tooltip element
  var tooltip: HTMLElement;

  // Dialog editor elements (jQuery UI dialogs, mounted on window)
  var notesEditor: HTMLElement | undefined;
  var markerEditor: HTMLElement | undefined;
  var riversOverview: HTMLElement | undefined;
  var burgsOverview: HTMLElement | undefined;
  var zonesEditor: HTMLElement | undefined;
  var biomesEditor: HTMLElement | undefined;
  var religionsEditor: HTMLElement | undefined;
  var statesEditor: HTMLElement | undefined;
  var diplomacyEditor: HTMLElement | undefined;
  var militaryOverview: HTMLElement | undefined;
  var provincesEditor: HTMLElement | undefined;
  var culturesEditor: HTMLElement | undefined;

  // UI helper functions (from uiHelpers.ts)
  var showInfo: () => void;
  var showElementLockTip: (event: MouseEvent) => void;
  var highlightEditorLine: (editor: HTMLElement, id: number, timeout?: number) => void;
  var onMouseMove: (event: MouseEvent) => void;
  var stored: (key: string) => string | null;
  var store: (key: string, value: string) => void;
  var toDMS: (coord: number, c: "lat" | "lon") => string;
  var getRiverInfo: (id: number) => string;
  var getFriendlyPrecipitation: (i: number) => string;
  var getPopulationTip: (i: number) => string;

  // Map coordinate helpers (from main.js / general.js)
  var getArea: (area: number) => number;
  var getAreaUnit: (squareMark?: string) => string;

  // Cell info panel DOM elements
  var infoX: HTMLElement;
  var infoY: HTMLElement;
  var infoLat: HTMLElement;
  var infoLon: HTMLElement;
  var infoGeozone: HTMLElement;
  var infoCell: HTMLElement;
  var infoArea: HTMLElement;
  var infoElevation: HTMLElement;
  var infoDepth: HTMLElement;
  var infoTemp: HTMLElement;
  var infoPrec: HTMLElement;
  var infoRiver: HTMLElement;
  var infoState: HTMLElement;
  var infoProvince: HTMLElement;
  var infoCulture: HTMLElement;
  var infoReligion: HTMLElement;
  var infoPopulation: HTMLElement;
  var infoBurg: HTMLElement;
  var infoFeature: HTMLElement;
  var infoBiome: HTMLElement;

  // d3 line generator (from main.js)
  var lineGen: import("d3").Line<[number, number]>;

  // polylabel library (loaded via <script> in index.html)
  var polylabel: (polygon: [number, number][][], precision?: number) => [number, number];

  // Measurer constructors (from measurers.ts)
  var Rulers: typeof RulersClass;
  var Ruler: typeof RulerClass;
  var Opisometer: typeof OpismeterClass;
  var RouteOpisometer: typeof RouteOpisometerClass;
  var Planimeter: typeof PlanimeterClass;

  // ─── Phase 10: editors.js → editors.ts ────────────────────────────────────

  // from editors.ts
  var fitContent: () => string;
  var applySorting: (header: HTMLElement) => void;
  var applySortingByHeader: (headerContainer: string) => void;
  var sortLines: (headerElement: HTMLElement) => void;
  var openPicker: (fill: string, callback: (newFill: string) => void) => void;
  var selectIcon: (current: string, callback: (value: string) => void) => void;
  var drawLegend: (name: string, data: Array<[string | number, string, string]>) => void;
  var fitLegendBox: () => void;
  var refreshAllEditors: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var elSelected: import("d3").Selection<any, unknown, null, undefined> | null;
  var unselect: () => void;
  var listen: (el: EventTarget, event: string, handler: EventListener) => () => void;
  var moveCircle: (x: number, y: number, r?: number) => void;
  var removeCircle: () => void;
  var fog: (id: string, path: string) => void;
  var unfog: (id?: string) => void;
  var highlightElement: (element: Element, zoom?: number) => void;

  // editor openers from editors.ts (dynamic modules)
  var editEmblem: ((type?: string, id?: string, el?: unknown) => void) | undefined;
  var editLabel: ((tspan?: Element) => void) | undefined;
  var editBurg: ((burgId?: number) => void) | undefined;
  var editIce: ((el: SVGElement) => void) | undefined;
  var editReliefIcon: ((el?: Element) => void) | undefined;
  var editRegiment: ((selectorOrEl?: string | Element) => void) | undefined;
  // from tools.ts
  var recalculatePopulation: () => void;
  var regenerateRoutes: () => void;
  var regenerateRivers: () => void;
  var regenerateStates: () => void;
  var regenerateProvinces: () => void;
  var regenerateBurgs: () => void;
  var regenerateEmblems: () => void;
  var regenerateReligions: () => void;
  var regenerateCultures: () => void;
  var regenerateMilitary: () => void;
  var regenerateIce: () => void;
  var regenerateMarkers: () => void;
  var regenerateZones: (event: MouseEvent) => void;
  var openEmblemEditor: () => Promise<void>;
  var configMarkersGeneration: () => void;
  var viewCellDetails: () => void;
  var overviewCharts: () => void;
  var openMinimap: () => void;
  var toggleAddLabel: () => void;
  var toggleAddBurg: () => void;
  var toggleAddRiver: () => void;
  var toggleAddMarker: () => void;
  var unpressClickToAddButton: () => void;
  var openSubmapTool: (() => void) | undefined;
  var openTransformTool: (() => void) | undefined;
  // from route-group-editor.js
  var editRouteGroups: () => void;

  // from rivers-creator.js (not yet migrated)
  var createRiver: () => void;

  // from editors.js
  var editRoute: (id: string) => void;
  var editRiver: (id: string) => void;
  var editMarker: (markerI?: number) => void;
  var editLake: (event?: MouseEvent) => void;

  // from ai-generator.js
  var generateWithAi: (prompt: string, onApply: (result: string) => void) => void;

  var showMainTip: () => void;

  // ─── Phase 10: options.ts globals ────────────────────────────────────────────

  // DOM elements referenced by id as globals
  var optionsTrigger: HTMLElement;
  var regenerate: HTMLElement;
  var collapsible: HTMLElement;
  var layersContent: HTMLElement;
  var styleContent: HTMLElement;
  var optionsContent: HTMLElement;
  var toolsContent: HTMLElement;
  var aboutContent: HTMLElement;
  var optionsContainer: HTMLElement;
  var viewMode: HTMLElement;
  var viewStandard: HTMLElement;
  var heightmap3DView: HTMLElement;
  var preview3d: HTMLElement;

  // Input elements for options panel
  var manorsInput: HTMLInputElement;
  var manorsOutput: HTMLInputElement;
  var pointsOutputFormatted: HTMLInputElement;
  var themeColorInput: HTMLInputElement;
  var transparencyInput: HTMLInputElement;
  var themeHueInput: HTMLInputElement;
  var zoomExtentMin: HTMLInputElement;
  var zoomExtentMax: HTMLInputElement;
  var uiSize: HTMLInputElement;
  var statesNumber: HTMLInputElement;
  var sizeVariety: HTMLInputElement;
  var provincesRatio: HTMLInputElement;
  var culturesOutput: HTMLInputElement;

  // 3D options elements
  var options3dUpdate: HTMLElement;
  var options3dMesh: HTMLElement;
  var options3dGlobe: HTMLElement;
  var options3dOBJSave: HTMLElement;
  var options3dColorSection: HTMLElement;
  var options3dScaleRange: HTMLInputElement;
  var options3dScaleNumber: HTMLInputElement;
  var options3dLightnessRange: HTMLInputElement;
  var options3dLightnessNumber: HTMLInputElement;
  var options3dSunX: HTMLInputElement;
  var options3dSunY: HTMLInputElement;
  var options3dMeshSkinResolution: HTMLInputElement;
  var options3dMeshRotationRange: HTMLInputElement;
  var options3dMeshRotationNumber: HTMLInputElement;
  var options3dGlobeRotationRange: HTMLInputElement;
  var options3dGlobeRotationNumber: HTMLInputElement;
  var options3dMeshLabels3d: HTMLInputElement;
  var options3dMeshSkyMode: HTMLInputElement;
  var options3dMeshSky: HTMLInputElement;
  var options3dMeshWater: HTMLInputElement;
  var options3dGlobeResolution: HTMLInputElement;
  var options3dMeshWireframeMode: HTMLInputElement;
  var options3dSunColor: HTMLInputElement;
  var options3dSubdivide: HTMLInputElement;
  var options3dTimeOfDay: HTMLSelectElement;

  // Template data
  var precreatedHeightmaps: Record<string, HeightmapTemplate>;

  // Utility functions
  var minmax: (value: number, min: number, max: number) => number;
  var toggleAssistant: (() => void) | undefined;

  // Functions exported from options.ts
  var applyGraphSize: () => void;
  var applyStoredOptions: () => void;
  var randomizeOptions: () => void;
  var randomizeHeightmapTemplate: () => void;
  var randomizeCultureSet: () => void;
  var generateEra: () => void;
  var regenerateEra: () => void;
  var changeYear: () => void;
  var changeEra: () => void;
  var changeCellsDensity: (value: number) => void;
  var changeCultureSet: () => void;
  var changeEmblemShape: (shape: string) => void;
  var changeStatesNumber: (value: string) => void;
  var changeUiSize: (value: number) => void;
  var changeTooltipSize: (value: string) => void;
  var changeThemeHue: (hue: string) => void;
  var changeDialogsTheme: (themeColor: string, transparency: string) => void;
  var restoreDefaultThemeColor: () => void;
  var setRendering: (value: string) => void;
  var showSavePane: () => void;
  var showLoadPane: () => Promise<void>;
  var copyLinkToClickboard: () => void;
  var exportToJson: (type: string) => void;
  var mapCoordinates: { latT?: number; latN?: number; latS?: number; lonT?: number; lonW?: number; lonE?: number };
  var connectToDropbox: () => Promise<void>;
  var loadURL: () => void;
  var openExportToPngTiles: () => void;
  var updateTilesOptions: (this: HTMLInputElement | undefined) => void;
  var enterStandardView: () => void;
  var enter3dView: (type: string) => Promise<void>;
  var resize3d: () => void;
  var showSupporters: () => Promise<void>;
  var showSeedHistoryDialog: () => void;
  var restoreSeed: (id: number) => void;
  var copyMapURL: () => void;
  var initGoogleTranslate: () => void;
  var openTemplateSelectionDialog: () => void;

  // ─── Phase 10: heightmap-editor.ts globals ──────────────────────────────────

  // Edit-mode DOM elements
  var heightmapEditMode: HTMLElement;
  var applyTemplate: HTMLButtonElement;
  var convertImage: HTMLButtonElement;
  var allowErosionBox: HTMLElement;
  var allowErosion: HTMLInputElement;
  var exitCustomization: HTMLElement;
  var mapLayers: HTMLElement;
  var cellTypeFilter: HTMLElement;
  var heightmapBrushRadius: HTMLElement;
  var heightmapBrushPower: HTMLElement;
  var heightmapLinePower: HTMLElement;
  var templateRedo: HTMLButtonElement;
  var templateUndo: HTMLButtonElement;
  var templateBody: HTMLElement;
  var templateToLoad: HTMLInputElement;
  var templateSelect: HTMLSelectElement;
  var templateTools: HTMLElement;
  var templateSeed: HTMLInputElement;
  var imageToLoad: HTMLInputElement;
  var convertColors: HTMLInputElement;
  var colorsSelect: HTMLElement;
  var colorsUnassigned: HTMLElement;
  var colorsAssigned: HTMLElement;
  var colorsSelectValue: HTMLElement;
  var colorsSelectFriendly: HTMLElement;
  var imageConverterPalette: HTMLElement;
  var colorsUnassignedContainer: HTMLElement;
  var colorsAssignedContainer: HTMLElement;
  var convertOverlay: HTMLInputElement;
  var convertOverlayNumber: HTMLInputElement;
  var imageConverter: HTMLElement;
  var rescaleLower: HTMLInputElement;
  var rescaleHigher: HTMLInputElement;
  var conditionSign: HTMLSelectElement;
  var rescaleModifier: HTMLInputElement;

  // Heightmap info panel elements
  var heightmapInfoX: HTMLElement;
  var heightmapInfoY: HTMLElement;
  var heightmapInfoCell: HTMLElement;
  var heightmapInfoHeight: HTMLElement;

  // Grid / generation helpers
  var findGridCell: (x: number, y: number, grid: Grid) => number;
  var findGridAll: (x: number, y: number, r: number) => number[];
  var getGridPolygon: (i: number) => [number, number][];
  var generatePrecipitation: () => void;
  var OceanLayers: () => void;
  var rankCells: () => void;
  var createTypedArray: (options: {
    maxValue: number;
    length: number;
    from?: ArrayLike<number>;
  }) => Uint8Array | Uint16Array | Uint32Array;
  var aleaPRNG: (seed: string) => () => number;
  var RgbQuant: new (options: unknown) => unknown;

  // UI helpers
  var link: (url: string, text: string) => string;
  var undraw: () => void;
  var changeViewMode: (event: MouseEvent) => void;
  var clicked: (this: SVGElement, event: MouseEvent) => void;

  var layersPreset: HTMLSelectElement;

  // utility globals (already on window via utils/index.ts, declared here for external JS compat)
  var si: (value: number, decimals?: number) => string;
  var rn: (value: number, decimals?: number) => number;
  var rand: (min?: number, max?: number) => number;
  var unique: <T>(arr: T[]) => T[];
  var findAll: (x: number, y: number, radius: number) => number[];
  var isLand: (i: number) => boolean;
  var getPackPolygon: (i: number) => [number, number][];
  var getRandomColor: () => string;
  var getSegmentId: (points: [number, number][], point: [number, number], dimension?: number) => number;

  // ─── Phase 10: provinces-editor.ts globals ──────────────────────────────────

  var P: (probability: number) => boolean;
  var updateLockStatus: (provinceId: number, classList: DOMTokenList) => void;

  // ─── Phase 12: overview panels & small utilities ─────────────────────────────

  // from main.js (zoom/pan state)
  var viewX: number;
  var viewY: number;

  // overview panel openers
  var overviewRegiments: (state?: number) => void;
  var showBurgTemperatureGraph: (id: number) => void;

  // from minimap.ts
  var updateMinimap: () => void;

  // from options.ts (cells density helpers)
  var cellsDensityMap: Record<number, number>;
  var getCellsDensityColor: (cells: number) => string;

  // HTML elements (browser global per element id)
  var regimentAdd: HTMLButtonElement;
  var addMarker: HTMLButtonElement;
  var markerAdd: HTMLButtonElement;
  var markersFooterTotal: HTMLElement;
  var markerTypeSelectMenu: HTMLElement;
  var iceNew: HTMLButtonElement;
  var regimentsFilter: HTMLSelectElement;
  var routeCreatorGroupSelect: HTMLSelectElement;
  var routeGroup: HTMLSelectElement;

  // ─── Phase 13: medium editors ────────────────────────────────────────────────

  // from uiHelpers.ts (exposed for emblems-editor)
  var highlightEmblemElement: (
    type: string,
    el: {
      i: number;
      x?: number;
      y?: number;
      pole?: [number, number];
      center?: number;
      fullName?: string;
      name?: string;
    }
  ) => void;

  // HTML elements for units-editor
  var unitsBottom: HTMLElement;

  // HTML elements for relief-editor
  var reliefTools: HTMLElement;
  var reliefBulkAdd: HTMLButtonElement;
  var reliefBulkRemove: HTMLButtonElement;
  var reliefIndividual: HTMLButtonElement;
  var reliefIconsDiv: HTMLElement;
  var reliefSize: HTMLInputElement;
  var reliefSizeNumber: HTMLInputElement;
  var reliefEditorSet: HTMLSelectElement;
  var reliefRadiusNumber: HTMLInputElement;
  var reliefSpacingNumber: HTMLInputElement;
  var reliefIconsSeletionAny: HTMLElement;

  // HTML elements for burg-group-editor
  var burgGroupsBody: HTMLElement;
  var burgGroupsForm: HTMLFormElement;

  // HTML elements for burg-editor
  var burgBody: HTMLElement;
  var burgName: HTMLInputElement;
  var burgGroup: HTMLSelectElement;
  var burgPopulation: HTMLInputElement;

  // HTML elements for regiment-editor
  var regimentComposition: HTMLElement;
  var militaryOverviewRefresh: HTMLButtonElement;
  var regimentsOverviewRefresh: HTMLButtonElement;
  var burgsOverviewRefresh: HTMLButtonElement;

  // HTML elements for emblems-editor
  var emblemsDownloadSize: HTMLInputElement;

  // editor openers for phase 13
  var editBurgGroups: () => void;
  var getTemperatureLikeness: (temperature: number) => string | null;

  // ─── Phase 14: large editors ──────────────────────────────────────────────

  // battle-screen.ts
  var Battle: typeof BattleClass;
  var battleAttackers: HTMLElement;
  var battleDefenders: HTMLElement;
  var regimentSelectorHeader: HTMLElement;

  // burgs-overview.ts
  var burgsFooterBurgs: HTMLElement;
  var burgsFooterPopulation: HTMLElement;
  var burgsHeader: HTMLElement;
  var convertTemperature: (temp: number, scale?: string) => string;

  // diplomacy-editor.ts
  var diplomacyMatrix: HTMLElement;

  // 3d.ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var throttle: (fn: () => void, ms: number) => () => void;

  // battle-screen.ts
  var wiki: (topic: string) => void;
}

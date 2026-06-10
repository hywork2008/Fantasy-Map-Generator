import type { Selection } from "d3";
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
  var ThreeD: { update: () => void };
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
  var FlatQueue: new () => { push: (item: any, priority: number) => void; pop: () => any; length: number };

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
  var UITour: { start: () => void };
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
  var mapHistory: Array<{ created: number }>;

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

  // App lifecycle functions
  var focusOn: () => void;
  var regenerateMap: (reason?: string) => void;
  var cleanupData: () => void;
  var clearMainTip: () => void;
  var fitMapToScreen: () => void;
  var updateTextureSelectValue: (href: string) => void;
  var generateMapOnLoad: () => void;
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
  var zoom: {
    translateBy: (selection: unknown, dx: number, dy: number) => unknown;
    scaleTo: (selection: unknown, scale: number) => unknown;
    scaleBy: (selection: unknown, factor: number) => unknown;
  };

  var MOBILE: boolean;
  var hideOptions: () => void;
  var toggleOptions: (event?: Event) => void;
  var regeneratePrompt: () => void;
  var toggle3dOptions: () => void;
  var zonesRemove: HTMLButtonElement | null;
  var undo: HTMLButtonElement | null;
  var redo: HTMLButtonElement | null;
  var resetZoom: (duration?: number) => void;

  // Editor openers (editors.js — not yet migrated)
  var editHeightmap: () => void;
  var editBiomes: () => void;
  var editStates: () => void;
  var editProvinces: () => void;
  var editDiplomacy: () => void;
  var editCoastlineSettings: () => void;
  var editCultures: () => void;
  var editZones: () => void;
  var editReligions: () => void;
  var openEmblemEditor: () => void;
  var editNotes: (id?: string, name?: string) => void;
  var overviewCharts: () => void;
  var overviewBurgs: () => void;
  var overviewRoutes: () => void;
  var overviewRivers: () => void;
  var overviewMilitary: () => void;
  var overviewMarkers: () => void;
  var viewCellDetails: () => void;
  var toggleAddBurg: () => void;
  var toggleAddLabel: () => void;
  var toggleAddRiver: () => void;
  var createRoute: () => void;
  var toggleAddMarker: () => void;

  // Tooltip element
  var tooltip: HTMLElement;

  // UI helper functions (from uiHelpers.ts)
  var showInfo: () => void;
  var showElementLockTip: (event: MouseEvent) => void;
  var highlightEditorLine: (editor: HTMLElement, id: number, timeout?: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var onMouseMove: (...args: any[]) => void;
  var stored: (key: string) => string | null;
  var store: (key: string, value: string) => void;
  var toDMS: (coord: number, c: "lat" | "lon") => string;
  var getRiverInfo: (id: number) => string;
  var getFriendlyPrecipitation: (i: number) => string;
  var getPopulationTip: (i: number) => string;

  // Map coordinate helpers (from main.js / general.js)
  var getArea: (area: number) => number;
  var getAreaUnit: () => string;

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
  var lineGen: { (points: [number, number][]): string; curve: (curve: unknown) => typeof lineGen };

  // polylabel library (loaded via <script> in index.html)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var polylabel: (polygon: any, precision?: number) => [number, number];

  // Measurer constructors (from measurers.ts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var Rulers: new () => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var Ruler: new (points: [number, number][]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var Opisometer: new (points: [number, number][]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var RouteOpisometer: new (points: [number, number][]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var Planimeter: new (points: [number, number][]) => any;

  // ─── Phase 9: editor dependencies from not-yet-migrated JS ───────────────────

  // from editors.js
  var fitContent: () => number;
  var applySorting: (header: HTMLElement) => void;
  var openPicker: (fill: string, callback: (newFill: string) => void) => void;
  var selectIcon: (current: string, callback: (value: string) => void) => void;
  var drawLegend: (name: string, data: Array<[string | number, string, string]>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var elSelected: import("d3").Selection<any, unknown, null, undefined> | null;
  var unselect: () => void;
  var listen: (el: EventTarget, event: string, handler: EventListener) => () => void;
  var moveCircle: (x: number, y: number, r?: number) => void;
  var removeCircle: () => void;
  var fog: (id: string, path: string) => void;
  var unfog: (id: string) => void;
  var highlightElement: (element: HTMLElement, timeout: number) => void;

  // from tools.js
  var recalculatePopulation: () => void;

  // from route-group-editor.js
  var editRouteGroups: () => void;

  // from rivers-creator.js (not yet migrated)
  var createRiver: () => void;

  // from editors.js
  var editRoute: (id: string) => void;
  var editRiver: (id: string) => void;
  var editMarker: (markerI: number) => void;
  var editLake: () => void;

  // from elevation-profile.ts
  var ElevationProfile: { open: (cells: number[], routeLen: number, isRiver: boolean) => void };

  // from ai-generator.js
  var generateWithAi: (prompt: string, onApply: (result: string) => void) => void;

  // from main.js
  var getWorldState: () => import("./WorldState").WorldState;
  var showMainTip: () => void;

  // utility globals (already on window via utils/index.ts, declared here for external JS compat)
  var si: (value: number, decimals?: number) => string;
  var rn: (value: number, decimals?: number) => number;
  var rand: (n: number) => number;
  var unique: <T>(arr: T[]) => T[];
  var findAll: (x: number, y: number, radius: number) => number[];
  var isLand: (i: number) => boolean;
  var getPackPolygon: (i: number) => [number, number][];
  var getRandomColor: () => string;
  var getSegmentId: (points: [number, number][], point: [number, number], dimension?: number) => number;
}

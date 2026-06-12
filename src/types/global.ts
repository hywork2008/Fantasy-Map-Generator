import type { Selection } from "d3";
import type { ViewState } from "../context/viewState";
import type { WorldContext } from "../context/worldContext";

import type { NameBase } from "../modules/names-generator";
import type { Route } from "../modules/routes-generator";
import type { Grid } from "../utils/graphUtils";
import type { PackedGraph } from "./PackedGraph";
import type { BiomesData, MapStyle, WorldNote, WorldOptions } from "./WorldState";

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

  var rulers: {
    draw: () => void;
    data: { id: number; draw: () => unknown; undraw: () => void }[];
    create: <T>(Type: new (points: [number, number][]) => T, points: [number, number][]) => T;
    remove: (id: number) => void;
    fromString: (str: string) => void;
    toString: () => string;
    undraw: () => void;
  };
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
  var applyOption: (select: HTMLSelectElement | HTMLInputElement, value: string, name?: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var $: (selector: any) => any;
  var scale: number;
  var getFriendlyHeight: (coords: [number, number]) => string;
  var addLakesInDeepDepressions: () => void;
  var openNearSeaLakes: () => void;
  var calculateMapCoordinates: () => void;
  var calculateTemperatures: () => void;
  var reGraph: () => void;
  var showStatistics: () => void;
  var getHeight: (h: number, abs?: string) => string;
  var getLatitude: (y: number, precision?: number) => number;
  var getLongitude: (x: number, precision?: number) => number;
  var customization: number;
  var speak: (text: string) => void;
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

  // Utility globals (window-wrapped versions)
  var findCell: (x: number, y: number, radius?: number) => number;

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

  // Versioning helpers (from versioning.ts)
  var compareVersions: (
    version1: string,
    version2: string,
    options?: { major?: boolean; minor?: boolean; patch?: boolean }
  ) => { isEqual: boolean; isNewer: boolean; isOlder: boolean };
  var parseMapVersion: (version: string) => string;
  var isValidVersion: (versionString: string | null | undefined) => boolean;

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
  var clearMainTip: () => void;
  var getCellPopulation: (i: number) => [number, number];

  // ─── I/O: save module ───────────────────────────────────────────────────────
  // (functions are now ES module exports — no global declarations needed)

  // ─── I/O: export module ─────────────────────────────────────────────────────
  // (functions are now ES module exports — no global declarations needed)

  // ─── I/O: load module ───────────────────────────────────────────────────────
  // (functions are now ES module exports — no global declarations needed)

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
  var zonesRemove: HTMLButtonElement | null;
  var undo: HTMLButtonElement | null;
  var redo: HTMLButtonElement | null;
  var resetZoom: (duration?: number) => void;

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
  var onMouseMove: (event: MouseEvent) => void;
  var stored: (key: string) => string | null;
  var store: (key: string, value: string) => void;
  // Map coordinate helpers (now ES module exports from editors.ts)

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

  // ─── Phase 10: editors.js → editors.ts ────────────────────────────────────

  var applySorting: (header: HTMLElement) => void;
  var applySortingByHeader: (headerContainer: string) => void;
  var sortLines: (headerElement: HTMLElement) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var elSelected: import("d3").Selection<any, unknown, null, undefined> | null;

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

  var toggleAssistant: (() => void) | undefined;

  // Functions from options.ts are now ES module exports — no global declarations needed
  var mapCoordinates: { latT?: number; latN?: number; latS?: number; lonT?: number; lonW?: number; lonE?: number };

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
  var generatePrecipitation: () => void;
  var OceanLayers: () => void;
  var aleaPRNG: (seed: string) => () => number;
  var RgbQuant: new (options: unknown) => unknown;
  var undraw: () => void;
  var clicked: (this: SVGElement, event: MouseEvent) => void;

  var layersPreset: HTMLSelectElement;

  // ─── Phase 10: provinces-editor.ts globals ──────────────────────────────────

  var updateLockStatus: (provinceId: number, classList: DOMTokenList) => void;

  // ─── Phase 12: overview panels & small utilities ─────────────────────────────

  // from main.js (zoom/pan state)
  var viewX: number;
  var viewY: number;

  // cellsDensityMap and getCellsDensityColor are now ES module exports from options.ts

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

  // ─── Phase 14: large editors ──────────────────────────────────────────────

  var battleAttackers: HTMLElement;
  var battleDefenders: HTMLElement;
  var regimentSelectorHeader: HTMLElement;

  // burgs-overview.ts
  var burgsFooterBurgs: HTMLElement;
  var burgsFooterPopulation: HTMLElement;
  var burgsHeader: HTMLElement;

  // diplomacy-editor.ts
  var diplomacyMatrix: HTMLElement;

  // battle-screen.ts
}

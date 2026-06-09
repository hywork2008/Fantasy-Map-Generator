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
  var oceanLayers: Selection<SVGGElement, unknown, null, undefined>;
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
    data: unknown[];
    create: (...args: unknown[]) => unknown;
    remove: (id: unknown) => void;
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
  var applyOption: (select: HTMLSelectElement, value: string, name?: string) => void;
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
  var editWorld: () => void;
  var showExportPane: () => void;
  var UITour: { start: () => void };
  var getHeight: (h: number) => string;
  var getLatitude: (y: number, precision?: number) => number;
  var getLongitude: (x: number, precision?: number) => number;
  var getFileName: (name: string) => string;
  var customization: number;
  var speak: (text: string) => void;
  var uploadFile: (el: HTMLInputElement, callback: (data: string) => void) => void;
  var downloadFile: (content: string | Blob, name: string, type?: string) => void;
  var zoomTo: (x: number, y: number, zoom: number, duration: number) => void;
  var modules: Record<string, boolean>;
}

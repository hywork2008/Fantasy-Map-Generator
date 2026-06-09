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
  var WARN: boolean;
  var ERROR: boolean;
  var DEBUG: { stateLabels?: boolean; [key: string]: boolean | undefined };
  var options: WorldOptions;

  var heightmapTemplates: Record<string, HeightmapTemplate>;
  var Routes: {
    isConnected: (cellId: number) => boolean;
    isCrossroad: (cellId: number) => boolean;
    hasRoad: (cellId: number) => boolean;
    getConnectivityRate: (cellId: number) => number;
    getRoute: (from: number, to: number) => Route | null;
    connect: (cellId: number) => Route | undefined;
    buildLinks: (routes: Route[]) => Record<number, Record<number, number>>;
    getPath: (route: { group: string; points: number[][] }) => string;
  };
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
  var invokeActiveZooming: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var FlatQueue: new () => { push: (item: any, priority: number) => void; pop: () => any; length: number };

  var tip: (
    message: string,
    autoHide?: boolean,
    type?: "info" | "warn" | "error" | "success",
    timeout?: number
  ) => void;
  var locked: (settingId: string) => boolean;
  var unlock: (settingId: string) => void;
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
  var downloadFile: (content: string | Blob, name: string) => void;
  var zoomTo: (x: number, y: number, zoom: number, duration: number) => void;
  var modules: Record<string, boolean>;
}

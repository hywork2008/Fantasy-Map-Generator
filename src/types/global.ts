import type { Route } from "@fmg/core/modules/routes-generator";
import type { Grid, PackedGraph } from "@fmg/types";
import type { Selection } from "d3";

type LegacyNameBase = {
  name: string;
  b: string;
  min: number;
  max: number;
  d: string;
  [key: string]: unknown;
};

type LegacyHeightmapTemplate = {
  name?: string;
  template?: string;
  probability?: number;
  [key: string]: any;
};

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
  var options: { year: number; stateLabelsMode?: string; burgs?: BurgsConfig; [key: string]: any };

  var heightmapTemplates: Record<string, LegacyHeightmapTemplate>;
  var populationRate: number;
  var urbanDensity: number;
  var urbanization: number;
  var distanceScale: number;
  var nameBases: LegacyNameBase[];

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
  var getColorScheme: (scheme: string | null) => (t: number) => string;
  var getColor: (height: number, scheme: (t: number) => string) => string;
  var svgWidth: number;
  var svgHeight: number;
  var viewbox: Selection<SVGElement, unknown, null, undefined>;
  var routes: Selection<SVGElement, unknown, null, undefined>;
  var biomesData: {
    i: number[];
    name: string[];
    color: string[];
    biomesMatrix: Uint8Array[];
    habitability: number[];
    iconsDensity: number[];
    icons: string[][];
    cost: number[];
  };
  var style: {
    burgLabels?: Record<string, Record<string, string>>;
    burgIcons?: Record<string, Record<string, string>>;
    anchors?: Record<string, Record<string, string>>;
    [key: string]: unknown;
  };

  var layerIsOn: (layerId: string) => boolean;
  var drawRoute: (route: Route) => void;
  var invokeActiveZooming: () => void;
  var FlatQueue: any;

  var tip: (
    message: string,
    autoHide?: boolean,
    type?: "info" | "warn" | "error" | "success",
    timeout?: number
  ) => void;
  var locked: (settingId: string) => boolean;
  var unlock: (settingId: string) => void;

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
  var getFileName: (name?: string) => string;
  var customization: number;
  var speak: (text: string) => void;
  var uploadFile: (el: HTMLInputElement, callback: (data: string) => void) => void;
  var downloadFile: (content: string | Blob, name: string, type?: string) => void;
  var zoomTo: (x: number, y: number, zoom: number, duration: number) => void;

  // Zones editor globals (pending full migration to imports)
  var zones: any;
  var drawZones: () => void;
  var drawPopulation: () => void;
  var areaUnit: HTMLSelectElement;
  var openPicker: any;
  var drawLegend: (...args: any[]) => void;
  var legend: Selection<SVGGElement, unknown, null, undefined>;
  var ruralPop: HTMLInputElement;
  var urbanPop: HTMLInputElement;
  var totalPop: HTMLElement;
  var totalPopPerc: HTMLElement;
  var confirmationDialog: any;
  var zonesEditor: HTMLElement;
  var zonesFooter: HTMLElement;
  var zonesFooterCells: HTMLElement;
  var zonesFooterArea: HTMLElement;
  var zonesFooterPopulation: HTMLElement;
  var zonesBodySection: HTMLElement;
  var clearLegend: () => void;

  var modules: Record<string, boolean>;
}

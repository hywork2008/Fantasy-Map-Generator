/**
 * Global type declarations for public scripts
 */

import type { Selection } from "d3";

declare global {
  // Core map data
  var seed: string;
  var pack: any; // PackedGraph type defined in src/types/PackedGraph.ts
  var grid: any;
  var graphHeight: number;
  var graphWidth: number;

  // Config
  var TIME: boolean;
  var WARN: boolean;
  var ERROR: boolean;
  var DEBUG: { stateLabels?: boolean; [key: string]: boolean | undefined };
  var options: any;

  // Settings
  var heightmapTemplates: any;
  var Routes: any;
  var populationRate: number;
  var urbanDensity: number;
  var urbanization: number;
  var distanceScale: number;
  var nameBases: any[];
  var mapCoordinates: any;

  // Input elements
  var pointsInput: HTMLInputElement;
  var culturesInput: HTMLInputElement;
  var culturesSet: HTMLSelectElement;
  var heightExponentInput: HTMLInputElement;
  var alertMessage: HTMLElement;
  var mapName: HTMLInputElement;
  var religionsNumber: HTMLInputElement;
  var distanceUnitInput: HTMLInputElement;
  var heightUnit: HTMLSelectElement;

  // SVG selection elements
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

  // Color and style functions
  var getColorScheme: (scheme: string | null) => (t: number) => string;
  var getColor: (height: number, scheme: (t: number) => string) => string;

  // SVG dimensions
  var svgWidth: number;
  var svgHeight: number;
  var viewbox: Selection<SVGElement, unknown, null, undefined>;
  var routes: Selection<SVGElement, unknown, null, undefined>;

  // Biome data
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

  // Notes and style
  var notes: any[];
  var style: {
    burgLabels: { [key: string]: { [key: string]: string } };
    burgIcons: { [key: string]: { [key: string]: string } };
    anchors: { [key: string]: { [key: string]: string } };
    [key: string]: any;
  };

  // UI functions and state
  var layerIsOn: (layerId: string) => boolean;
  var drawRoute: (route: any) => void;
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

  // Map generation and editing functions
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

  // UI state
  var UITour: { start: () => void };

  // Utility functions
  var getHeight: (h: number) => string;
  var getLatitude: (y: number, precision?: number) => number;
  var getLongitude: (x: number, precision?: number) => number;
  var getFileName: (name: string) => string;

  // Settings
  var customization: number;
  var temperatureScale: { value: string };

  // Additional functions
  var speak: (text: string) => void;
  var uploadFile: (el: HTMLInputElement, callback: (data: string) => void) => void;
  var downloadFile: (content: string | Blob, name: string) => void;
  var zoomTo: (x: number, y: number, zoom: number, duration: number) => void;

  // Module states
  var modules: Record<string, boolean>;

  // Generation modules - COA (Coat of Arms)
  var COA: any;
  var COArenderer: any;

  // Generation modules - Lakes
  var Lakes: any;

  // Generation modules - Names
  var Names: any;

  // Generation modules - Military
  var Military: any;

  // Generation modules - other state objects
  var Biomes: any;
  var Burgs: any;
  var Cultures: any;
  var Features: any;
  var Ice: any;
  var Provinces: any;
  var Religions: any;
  var Routes: any;
  var States: any;
  var Zones: any;
  var packedGraph: any;
  var terrs: any;
}

export {};

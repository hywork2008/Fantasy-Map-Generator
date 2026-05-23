/**
 * Global type declarations for public scripts
 */

import type { Selection } from "d3";
import type { PackedGraph } from "./PackedGraph";
import type { Grid } from "./Grid";
import type { Route } from "@fmg/core/modules/routes-generator";
import type { Burg } from "@fmg/core/modules/burgs-generator";

type MapCoordinates = {
  latT?: number;
  latN?: number;
  latS?: number;
  lonT?: number;
  lonW?: number;
  lonE?: number;
};

type LegacyNote = {
  id: string;
  name: string;
  legend: string;
  [key: string]: unknown;
};

type NameBase = {
  name: string;
  b: string;
  min: number;
  max: number;
  d: string;
  [key: string]: unknown;
};

type HeightmapTemplate = {
  name?: string;
  template?: string;
  probability?: number;
  [key: string]: any;
};

type BiomesGlobal = typeof import("@fmg/core/modules/biomes").Biomes;
type BurgsGlobal = typeof import("@fmg/core/modules/burgs-generator").Burgs;
type CulturesGlobal = typeof import("@fmg/core/modules/cultures-generator").Cultures;
type FeaturesGlobal = typeof import("@fmg/core/modules/features").Features;
type IceGlobal = typeof import("@fmg/core/modules/ice").Ice;
type ProvincesGlobal = typeof import("@fmg/core/modules/provinces-generator").Provinces;
type ReligionsGlobal = typeof import("@fmg/core/modules/religions-generator").Religions;
type RoutesGlobal = typeof import("@fmg/core/modules/routes-generator").Routes;
type StatesGlobal = typeof import("@fmg/core/modules/states-generator").States;
type ZonesGlobal = typeof import("@fmg/core/modules/zones-generator").Zones;
type PackedGraphGlobal = import("@fmg/types/PackedGraph").PackedGraph;

declare global {
  // Core map data
  var seed: string;
  var pack: PackedGraph;
  var grid: Grid;
  var graphHeight: number;
  var graphWidth: number;

  // Config
  var TIME: boolean;
  var WARN: boolean;
  var ERROR: boolean;
  var DEBUG: { stateLabels?: boolean; [key: string]: boolean | undefined };
  var options: { year: number; stateLabelsMode?: string; burgs?: BurgsConfig; [key: string]: any };

  // Settings
  var heightmapTemplates: Record<string, HeightmapTemplate>;
  var populationRate: number;
  var urbanDensity: number;
  var urbanization: number;
  var distanceScale: number;
  var nameBases: NameBase[];
  var mapCoordinates: MapCoordinates;
  var notes: LegacyNote[];

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

  type BurgGroup = Record<string, any>;

  type BurgsConfig = {
    groups: Record<string, any>[];
  };

  // Style object
  var style: {
    burgLabels?: Record<string, Record<string, string>>;
    burgIcons?: Record<string, Record<string, string>>;
    anchors?: Record<string, Record<string, string>>;
    [key: string]: unknown;
  };

  // UI functions and state
  var drawRoute: (route: Route) => void;
  var invokeActiveZooming: () => void;
  var FlatQueue: typeof import("flatqueue").FlatQueue<unknown>;

  var $: JQueryStatic;
  var scale: number;

  // Map generation and editing functions
  var changeFont: () => void;
  var addLakesInDeepDepressions: () => void;
  var openNearSeaLakes: () => void;
  var calculateMapCoordinates: () => void;
  var calculateTemperatures: () => void;
  var reGraph: () => void;
  var showStatistics: () => void;
  var editWorld: () => void;
  var showExportPane: () => void;

  // UI state
  var UITour: { start: () => void };

  // Utility functions
  var getHeight: (h: number) => string;
  var getLatitude: (y: number, precision?: number) => number;
  var getLongitude: (x: number, precision?: number) => number;
  var getFileName: (name?: string) => string;

  // Settings
  var customization: number;
  var temperatureScale: { value: string };

  // Additional functions
  var speak: (text: string) => void;
  var uploadFile: (el: HTMLInputElement, callback: (data: string) => void) => void;
  var downloadFile: (content: string | Blob, name: string, type?: string) => void;
  var zoomTo: (x: number, y: number, zoom: number, duration: number) => void;

  // Module states
  var modules: Record<string, boolean>;

  // Generation modules - COA (Coat of Arms)
  var COA: typeof import("@fmg/core/modules/emblem/generator").COA;
  var COArenderer: typeof import("@fmg/core/modules/emblem/renderer").COArenderer;

  // Generation modules - Lakes
  var Lakes: typeof import("@fmg/core/modules/lakes").Lakes;

  // Generation modules - Names
  var Names: typeof import("@fmg/core/modules/names-generator").Names;

  // Generation modules - Military
  var Military: typeof import("@fmg/core/modules/military-generator").Military;

  // Generation modules - other state objects
  var Biomes: BiomesGlobal;
  var Burgs: BurgsGlobal;
  var Cultures: CulturesGlobal;
  var Features: FeaturesGlobal;
  var Ice: IceGlobal;
  var Provinces: ProvincesGlobal;
  var Religions: ReligionsGlobal;
  var Routes: RoutesGlobal;
  var States: StatesGlobal;
  var Zones: ZonesGlobal;
  var packedGraph: PackedGraphGlobal;

  // Renderer utility hooks still provided by legacy UI runtime
  var drawBurgIcon: (burg: Burg) => void;
  var drawBurgLabel: (burg: Burg) => void;
  var removeBurgIcon: (burgId: number) => void;
  var removeBurgLabel: (burgId: number) => void;
  var redrawIceberg: (cellId: number) => void;
  var redrawGlacier: (cellId: number) => void;

  // Legacy UI compatibility globals (temporary migration bridge)
  var PRODUCTION: boolean;
  var d3: any;
  var THREE: any;
  var ensureEl: <T = any>(id: string) => T;
  var editUnits: (...args: unknown[]) => unknown;
  var clearLegend: () => void;
  var drawCoordinates: (...args: unknown[]) => unknown;
  var drawScaleBar: (scaleBar: Selection<SVGGElement, unknown, HTMLElement, unknown>, scaleLevel: number) => void;
  var fitScaleBar: (
    scaleBar: Selection<SVGGElement, unknown, HTMLElement, unknown>,
    fullWidth: number,
    fullHeight: number
  ) => void;
  var updateMinimap: (...args: unknown[]) => unknown;
  var mapWidthInput: HTMLInputElement;
  var mapHeightInput: HTMLInputElement;
  var loadMapFromURL: (...args: unknown[]) => unknown;
  var showUploadErrorMessage: (...args: unknown[]) => unknown;
  var ldb: unknown;
  var uploadMap: (...args: unknown[]) => unknown;
  var shapeRendering: any;
  var rescaleLabels: (...args: unknown[]) => unknown;
  var hideLabels: HTMLInputElement;
  var hideEmblems: (...args: unknown[]) => unknown;
  var renderGroupCOAs: (g: SVGGElement) => Promise<void>;
}
  var unlock: (settingId: string) => void;

export {};

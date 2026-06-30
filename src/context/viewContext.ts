import type { Line, Selection, ZoomBehavior } from "d3";

export type SvgGroup = Selection<SVGGElement, unknown, null, undefined>;

/** Core SVG structure and viewport infrastructure. */
export interface RootLayers {
  svg: Selection<SVGSVGElement, unknown, null, undefined>;
  defs: Selection<SVGDefsElement, unknown, null, undefined>;
  viewbox: SvgGroup;
  scaleBar: SvgGroup;
  legend: SvgGroup;
  ruler: SvgGroup;
  debug: SvgGroup;
  fogging: SvgGroup | null;
}

/** Natural environment layers. */
export interface EnvironmentLayers {
  ocean: SvgGroup;
  oceanLayers: SvgGroup;
  oceanPattern: SvgGroup;
  landmass: SvgGroup;
  texture: SvgGroup;
  terrs: SvgGroup;
  lakes: SvgGroup;
  biomes: SvgGroup;
  rivers: SvgGroup;
  terrain: SvgGroup;
  coastline: SvgGroup;
  ice: SvgGroup;
  prec: SvgGroup;
  temperature: SvgGroup;
}

/** Political and cultural division layers. */
export interface PoliticalLayers {
  relig: SvgGroup;
  cults: SvgGroup;
  regions: SvgGroup;
  statesBody: SvgGroup;
  statesHalo: SvgGroup;
  provs: SvgGroup;
  zones: SvgGroup;
  borders: SvgGroup;
  stateBorders: SvgGroup;
  provinceBorders: SvgGroup;
}

/** Route and transport infrastructure layers. */
export interface InfrastructureLayers {
  routes: SvgGroup;
  roads: SvgGroup;
  trails: SvgGroup;
  searoutes: SvgGroup;
}

/** Settlement, label and military layers. */
export interface SettlementLayers {
  icons: SvgGroup;
  labels: SvgGroup;
  burgLabels: SvgGroup;
  burgIcons: SvgGroup;
  anchors: SvgGroup;
  armies: SvgGroup;
  markers: SvgGroup;
  emblems: SvgGroup;
  population: SvgGroup;
}

/** Map overlay and diagnostic layers. */
export interface OverlayLayers {
  cells: SvgGroup;
  gridOverlay: SvgGroup;
  coordinates: SvgGroup;
  compass: SvgGroup;
}

/** Zoom/pan state, display dimensions, and editor mode. */
export interface ViewState {
  zoom: ZoomBehavior<SVGSVGElement, unknown>;
  viewX: number;
  viewY: number;
  /** Zoom scale level (1 = no zoom) */
  scale: number;
  /** Current editor customization mode (0 = default, 1 = heightmap edit, etc.) */
  customization: number;
  /**
   * Display width of the SVG element — Math.min(graphWidth, window.innerWidth).
   * Changes on browser resize; view concern, not world data.
   */
  svgWidth: number;
  /**
   * Display height of the SVG element — Math.min(graphHeight, window.innerHeight).
   * Changes on browser resize; view concern, not world data.
   */
  svgHeight: number;
  /** D3 curveBasis line generator shared by renderers and editors. */
  lineGen: Line<[number, number]>;
}

/**
 * Full view context: composition of all domain-grouped layer interfaces.
 * Renderers should declare only the group(s) they need rather than this full type.
 */
export interface ViewContext
  extends RootLayers,
    EnvironmentLayers,
    PoliticalLayers,
    InfrastructureLayers,
    SettlementLayers,
    OverlayLayers,
    ViewState {}

/**
 * Single mutable container for all SVG layer references and zoom state.
 * Cast as ViewContext immediately — properties are guaranteed to be assigned by
 * initViewLayers.createViewLayers() during the synchronous SVG setup phase before any renderer runs.
 */
export const viewContext = {
  fogging: null,
  scale: 1,
  customization: 0,
  svgWidth: 0,
  svgHeight: 0,
  lineGen: (() => "") as unknown as Line<[number, number]>
} as ViewContext;

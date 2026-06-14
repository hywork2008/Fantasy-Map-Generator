import type { Selection, ZoomBehavior } from "d3";

export interface ViewContext {
  svg: Selection<SVGSVGElement, unknown, null, undefined>;
  defs: Selection<SVGDefsElement, unknown, null, undefined>;
  viewbox: Selection<SVGElement, unknown, null, undefined>;
  scaleBar: Selection<SVGGElement, unknown, null, undefined>;
  legend: Selection<SVGGElement, unknown, null, undefined>;
  ocean: Selection<SVGGElement, unknown, null, undefined>;
  oceanLayers: Selection<SVGGElement, unknown, null, undefined>;
  oceanPattern: Selection<SVGGElement, unknown, null, undefined>;
  landmass: Selection<SVGGElement, unknown, null, undefined>;
  texture: Selection<SVGGElement, unknown, null, undefined>;
  terrs: Selection<SVGGElement, unknown, null, undefined>;
  lakes: Selection<SVGGElement, unknown, null, undefined>;
  biomes: Selection<SVGGElement, unknown, null, undefined>;
  cells: Selection<SVGGElement, unknown, null, undefined>;
  gridOverlay: Selection<SVGGElement, unknown, null, undefined>;
  coordinates: Selection<SVGGElement, unknown, null, undefined>;
  compass: Selection<SVGGElement, unknown, null, undefined>;
  rivers: Selection<SVGElement, unknown, null, undefined>;
  terrain: Selection<SVGGElement, unknown, null, undefined>;
  relig: Selection<SVGGElement, unknown, null, undefined>;
  cults: Selection<SVGGElement, unknown, null, undefined>;
  regions: Selection<SVGGElement, unknown, null, undefined>;
  statesBody: Selection<SVGGElement, unknown, null, undefined>;
  statesHalo: Selection<SVGGElement, unknown, null, undefined>;
  provs: Selection<SVGGElement, unknown, null, undefined>;
  zones: Selection<SVGGElement, unknown, null, undefined>;
  borders: Selection<SVGGElement, unknown, null, undefined>;
  stateBorders: Selection<SVGGElement, unknown, null, undefined>;
  provinceBorders: Selection<SVGGElement, unknown, null, undefined>;
  routes: Selection<SVGElement, unknown, null, undefined>;
  roads: Selection<SVGGElement, unknown, null, undefined>;
  trails: Selection<SVGGElement, unknown, null, undefined>;
  searoutes: Selection<SVGGElement, unknown, null, undefined>;
  temperature: Selection<SVGGElement, unknown, null, undefined>;
  coastline: Selection<SVGGElement, unknown, null, undefined>;
  ice: Selection<SVGGElement, unknown, null, undefined>;
  prec: Selection<SVGGElement, unknown, null, undefined>;
  population: Selection<SVGGElement, unknown, null, undefined>;
  emblems: Selection<SVGElement, unknown, null, undefined>;
  icons: Selection<SVGGElement, unknown, null, undefined>;
  labels: Selection<SVGGElement, unknown, null, undefined>;
  burgLabels: Selection<SVGGElement, unknown, null, undefined>;
  burgIcons: Selection<SVGGElement, unknown, null, undefined>;
  anchors: Selection<SVGGElement, unknown, null, undefined>;
  armies: Selection<SVGGElement, unknown, null, undefined>;
  markers: Selection<SVGGElement, unknown, null, undefined>;
  fogging: Selection<SVGGElement, unknown, null, undefined> | null;
  ruler: Selection<SVGGElement, unknown, null, undefined>;
  debug: Selection<SVGGElement, unknown, null, undefined>;
  // d3 zoom behavior attached to the svg element
  zoom: ZoomBehavior<SVGSVGElement, unknown>;
  // Current zoom state
  viewX: number;
  viewY: number;
  /** Zoom scale level (1 = no zoom) */
  scale: number;
  /** Current editor customization mode (0 = default, 1 = heightmap edit, etc.) */
  customization: number;
}

/**
 * Single mutable container for all SVG layer references and zoom state.
 * Cast as ViewContext immediately — properties are guaranteed to be assigned by
 * main.ts during the synchronous SVG setup phase before any renderer runs.
 */
export const viewContext = {
  fogging: null,
  scale: 1,
  customization: 0
} as ViewContext;

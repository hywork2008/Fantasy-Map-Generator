/**
 * @fmg/types - Central type definitions for Fantasy Map Generator
 */

import type { PackedGraph, TypedArray } from "./PackedGraph";
import type { Grid, Point } from "./Grid";

// Re-export global type declarations
export * from "./globals";
export * from "./fmg-global";
export type { PackedGraph, TypedArray };
export type { Grid, Point };

// UI State type definitions
export interface UIState {
  pinNotes: boolean;
  winds: number[];
  temperatureEquator: number;
  temperatureNorthPole: number;
  temperatureSouthPole: number;
  stateLabelsMode: string;
  showBurgPreview: boolean;
  burgs: {
    groups: any[];
  };
}

export interface StyleState {
  burgLabels?: Record<string, any>;
  burgIcons?: Record<string, any>;
  anchors?: Record<string, any>;
}

export interface MapCoordinates {
  latT?: number;
  latN?: number;
  latS?: number;
  lonT?: number;
  lonW?: number;
  lonE?: number;
}

export interface LegacyNote {
  id: string;
  name: string;
  legend: string;
  [key: string]: unknown;
}

export interface MapData {
  seed: string | number;
  grid: Grid;
  pack: PackedGraph;
  mapId: string | number;
  mapCoordinates: MapCoordinates;
  customization: number;
}

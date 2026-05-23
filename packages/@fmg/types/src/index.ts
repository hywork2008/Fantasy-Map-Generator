/**
 * @fmg/types - Central type definitions for Fantasy Map Generator
 */

import type { PackedGraph, TypedArray } from "./PackedGraph";
import type { Grid, Point, Cells, Vertices } from "./Grid";

// Re-export global type declarations
export * from "./globals";
export * from "./fmg-global";
export type { PackedGraph, TypedArray };
export type { Grid, Point, Cells, Vertices };

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type StyleGroupAttributes = Record<string, string>;

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
    groups: StyleGroupAttributes[];
  };
}

export interface StyleState {
  burgLabels?: Record<string, StyleGroupAttributes>;
  burgIcons?: Record<string, StyleGroupAttributes>;
  anchors?: Record<string, StyleGroupAttributes>;
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
  [key: string]: JsonValue;
}

export interface MapData {
  seed: string | number;
  grid: Grid;
  pack: PackedGraph;
  mapId: string | number;
  mapCoordinates: MapCoordinates;
  customization: number;
}

// Legacy name base for cultural names generation
export interface NameBase {
  name: string;
  b: string;
  min: number;
  max: number;
  d: string;
  [key: string]: unknown;
}

// Legacy heightmap template for terrain generation
export interface HeightmapTemplate {
  id?: number;
  name: string;
  template: string;
  probability: number;
}

// Burgs styling configuration
export interface BurgGroup {
  name: string;
  order: number;
  active?: boolean;
  isDefault?: boolean;
  min?: number;
  max?: number;
  percentile?: number;
  biomes?: number[];
  features?: Record<string, boolean>;
  icon?: string;
  preview?: string;
  [key: string]: unknown;
}

export interface BurgsConfig {
  groups: BurgGroup[];
}

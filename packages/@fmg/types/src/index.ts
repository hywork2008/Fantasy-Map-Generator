/**
 * @fmg/types - Central type definitions for Fantasy Map Generator
 */

// Re-export global type declarations
export * from "./globals";

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

export interface MapData {
  seed: string | number;
  grid: any;
  pack: any;
  mapId: string | number;
  mapCoordinates: Record<string, number>;
  customization: number;
}

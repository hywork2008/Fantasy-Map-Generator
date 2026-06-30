export interface StyleElementOption {
  value: string;
  label: string;
}

export const ENVIRONMENT_ELEMENTS: StyleElementOption[] = [
  { value: "biomes", label: "Biomes" },
  { value: "coastline", label: "Coastline" },
  { value: "ice", label: "Ice" },
  { value: "lakes", label: "Lakes" },
  { value: "landmass", label: "Landmass" },
  { value: "ocean", label: "Ocean" },
  { value: "prec", label: "Precipitation" },
  { value: "rivers", label: "Rivers" },
  { value: "temperature", label: "Temperature" },
  { value: "texture", label: "Texture" },
  { value: "vignette", label: "Vignette" }
];

export const TERRAIN_ELEMENTS: StyleElementOption[] = [
  { value: "terrs", label: "Heightmap" },
  { value: "terrain", label: "Relief Icons" },
  { value: "routes", label: "Routes" }
];

export const POLITICAL_ELEMENTS: StyleElementOption[] = [
  { value: "borders", label: "Borders" },
  { value: "cults", label: "Cultures" },
  { value: "provs", label: "Provinces" },
  { value: "regions", label: "States" },
  { value: "relig", label: "Religions" },
  { value: "zones", label: "Zones" }
];

export const SETTLEMENTS_ELEMENTS: StyleElementOption[] = [
  { value: "anchors", label: "Anchor Icons" },
  { value: "armies", label: "Military" },
  { value: "burgIcons", label: "Burg Icons" },
  { value: "emblems", label: "Emblems" },
  { value: "labels", label: "Labels" },
  { value: "markers", label: "Markers" },
  { value: "population", label: "Population" }
];

export const OVERLAYS_ELEMENTS: StyleElementOption[] = [
  { value: "cells", label: "Cells" },
  { value: "compass", label: "Wind Rose" },
  { value: "coordinates", label: "Coordinates" },
  { value: "fogging", label: "Fogging" },
  { value: "gridOverlay", label: "Grid" },
  { value: "legend", label: "Legend" },
  { value: "ruler", label: "Rulers" },
  { value: "scaleBar", label: "Scale Bar" }
];

export type StyleSubTab = "environment" | "terrain" | "political" | "settlements" | "overlays";

export const STYLE_SUB_TAB_FIRST_ELEMENT: Record<StyleSubTab, string> = {
  environment: "ocean",
  terrain: "terrs",
  political: "regions",
  settlements: "burgIcons",
  overlays: "scaleBar"
};

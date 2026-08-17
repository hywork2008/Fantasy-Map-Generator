/**
 * Earth-region heightmaps: public-domain DEM + land polygons sampled at
 * cell centroids. See docs/plan/earth-geography-heightmaps.md.
 */

import { earthRegionView } from "./earthConfig";

export interface EarthClimateAnchor {
  mapSize: number;
  /** Geographic center latitude in degrees (not the legacy 0–100 shift). */
  latitude: number;
  /** Legacy-compatible 0–100 longitude shift used by calculateMapCoordinates. */
  longitude: number;
}

export interface EarthStrait {
  name: string;
  a: [number, number];
  b: [number, number];
  /** Real-world width in kilometres. Encoded as max(1, round(widthKm / cellKm)) cells. */
  widthKm: number;
}

export interface EarthRegion {
  id: string;
  name: string;
  /** WGS84. west < east, south < north. Dateline-crossing regions are out of scope. */
  west: number;
  east: number;
  south: number;
  north: number;
  projection: "equirectangular";
  climateAnchor: EarthClimateAnchor;
  /** Packed FMGE raster (land bits + int16 elevation). */
  raster: { path: string };
  topology?: {
    keepStraits?: EarthStrait[];
    minIslandAreaKm2?: number;
  };
  previewPng?: string;
  /** One-line note on how Natural Earth admin-0 is interpreted for this region. */
  attribution: string;
}

const JAPAN_STRAITS: EarthStrait[] = [
  { name: "Tsugaru", a: [140.848, 41.255], b: [140.209, 41.425], widthKm: 19.5 },
  { name: "Kanmon", a: [130.945, 33.958], b: [130.955, 33.906], widthKm: 0.7 },
  { name: "Bungo", a: [132.017, 33.267], b: [131.885, 33.276], widthKm: 14 },
  { name: "Akashi", a: [135.035, 34.645], b: [135.01, 34.575], widthKm: 4 },
  { name: "Naruto", a: [134.662, 34.255], b: [134.638, 34.205], widthKm: 1.3 },
  { name: "Kurushima", a: [133.199, 34.407], b: [132.999, 34.066], widthKm: 4 },
  { name: "KiiChannel", a: [135.35, 33.9], b: [134.45, 34.05], widthKm: 40 },
  { name: "Kojima-Sakaide", a: [133.84, 34.5], b: [133.84, 34.28], widthKm: 12 },
  { name: "BisanEast", a: [133.95, 34.5], b: [133.95, 34.28], widthKm: 12 }
];

/**
 * East Asia: eastern Himalaya / Yunnan through Japan and the Korean peninsula.
 *
 * Chosen as a clean equirectangular box (not reverse-engineered from the
 * Heightmapper screenshot). Legacy public/main.js `east-asia → [11, 28, 9.4]`
 * reconstructed to ~110.3–149.9°E, center ~35.2°N — a tighter window on
 * the same theatre. This bbox is wider so Tibet and Hokkaido stay on-map
 * together; climate uses this bbox, not the legacy shift.
 */
export const EAST_ASIA_REGION: EarthRegion = {
  id: "east-asia",
  name: "East Asia",
  west: 90,
  east: 150,
  south: 18,
  north: 54,
  projection: "equirectangular",
  climateAnchor: {
    mapSize: 16.6667,
    latitude: 36,
    longitude: 10
  },
  raster: { path: "./heightmaps/earth/east-asia.bin" },
  topology: {
    keepStraits: JAPAN_STRAITS
  },
  previewPng: "./heightmaps/east-asia.png",
  attribution:
    "Natural Earth 10m admin-0 land polygons (public domain). Japan is the JPN feature; Korea/China follow Natural Earth."
};

/**
 * Japan home waters: Kyushu at the lower-left of the *content* box, Hokkaido
 * at the upper-right. Padded ~1° past Cape Soya and Cape Sata so a coastal
 * sea lane can pass those capes. The painted window grows with the canvas
 * at true km scale (no window-aspect squash); leftover space is more of the
 * same geography — in-frame islands, Korea, China, and Russia stay on the
 * land mask. Islands SW of Kyushu or NE of Hokkaido need not drive the frame.
 */
export const JAPAN_REGION: EarthRegion = {
  id: "japan",
  name: "Japan",
  west: 128.6,
  east: 146.4,
  south: 29.9,
  north: 46.6,
  projection: "equirectangular",
  climateAnchor: {
    mapSize: 4.9444,
    latitude: 38.25,
    longitude: 9.82
  },
  raster: { path: "./heightmaps/earth/japan.bin" },
  topology: { keepStraits: JAPAN_STRAITS },
  attribution:
    "Natural Earth 10m admin-0 land (public domain). In-frame islands and neighboring land are kept; the canvas is not stretched to the window."
};

export const earthRegions: Record<string, EarthRegion> = {
  "east-asia": EAST_ASIA_REGION,
  japan: JAPAN_REGION
};

export function isEarthRegion(id: string): boolean {
  return id in earthRegions;
}

export function getEarthRegion(id: string): EarthRegion | undefined {
  return earthRegions[id];
}

export function earthRegionMapCoordinates(
  region: EarthRegion,
  graphWidth?: number,
  graphHeight?: number
): {
  latT: number;
  latN: number;
  latS: number;
  lonT: number;
  lonW: number;
  lonE: number;
} {
  const view = graphWidth != null && graphHeight != null ? earthRegionView(region, graphWidth, graphHeight) : region;
  return {
    latT: view.north - view.south,
    latN: view.north,
    latS: view.south,
    lonT: view.east - view.west,
    lonW: view.west,
    lonE: view.east
  };
}

/**
 * Legacy `getSizeAndLatitude()` triples from public/main.js, converted to
 * approximate geographic extents. latitude was a 0–100 north-edge shift;
 * longitude is still the 0–100 shift `calculateMapCoordinates` uses.
 */
export const LEGACY_PRECREATED_CLIMATE: Record<string, { mapSize: number; latitudeShift: number; longitude: number }> =
  {
    "africa-centric": { mapSize: 45, latitudeShift: 53, longitude: 38 },
    arabia: { mapSize: 20, latitudeShift: 35, longitude: 35 },
    atlantics: { mapSize: 42, latitudeShift: 23, longitude: 65 },
    britain: { mapSize: 7, latitudeShift: 20, longitude: 51.3 },
    caribbean: { mapSize: 15, latitudeShift: 40, longitude: 74.8 },
    "east-asia": { mapSize: 11, latitudeShift: 28, longitude: 9.4 },
    eurasia: { mapSize: 38, latitudeShift: 19, longitude: 27 },
    europe: { mapSize: 20, latitudeShift: 16, longitude: 44.8 },
    "europe-accented": { mapSize: 14, latitudeShift: 22, longitude: 44.8 },
    "europe-and-central-asia": { mapSize: 25, latitudeShift: 10, longitude: 39.5 },
    "europe-central": { mapSize: 11, latitudeShift: 22, longitude: 46.4 },
    "europe-north": { mapSize: 7, latitudeShift: 18, longitude: 48.9 },
    greenland: { mapSize: 22, latitudeShift: 7, longitude: 55.8 },
    hellenica: { mapSize: 8, latitudeShift: 27, longitude: 43.5 },
    iceland: { mapSize: 2, latitudeShift: 15, longitude: 55.3 },
    "indian-ocean": { mapSize: 45, latitudeShift: 55, longitude: 14 },
    "mediterranean-sea": { mapSize: 10, latitudeShift: 29, longitude: 45.8 },
    "middle-east": { mapSize: 8, latitudeShift: 31, longitude: 34.4 },
    "north-america": { mapSize: 37, latitudeShift: 17, longitude: 87 },
    "us-centric": { mapSize: 66, latitudeShift: 27, longitude: 100 },
    "us-mainland": { mapSize: 16, latitudeShift: 30, longitude: 77.5 },
    world: { mapSize: 78, latitudeShift: 27, longitude: 40 },
    "world-from-pacific": { mapSize: 75, latitudeShift: 32, longitude: 30 }
  };

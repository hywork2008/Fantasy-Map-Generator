/**
 * Earth-region heightmaps: public-domain DEM + land polygons sampled at
 * cell centroids. See docs/plan/earth-geography-heightmaps.md.
 */

import { earthRegionView } from "./earthConfig";

export interface EarthClimateAnchor {
  mapSize: number;
  /** Initial geographic center latitude in degrees. Users may move it later. */
  latitude: number;
  /** Initial 0–100 longitude shift for calculateMapCoordinates. Users may move it later. */
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

const BRITAIN_STRAITS: EarthStrait[] = [
  { name: "Dover", a: [1.32, 51.13], b: [1.59, 50.87], widthKm: 33 },
  { name: "NorthChannel", a: [-5.73, 55.31], b: [-6.06, 55.2], widthKm: 20 },
  { name: "Solent", a: [-1.3, 50.8], b: [-1.3, 50.68], widthKm: 4 },
  { name: "Menai", a: [-4.18, 53.24], b: [-4.14, 53.12], widthKm: 0.5 },
  { name: "Pentland", a: [-3.14, 58.64], b: [-3.14, 58.78], widthKm: 10 }
];

const MEDITERRANEAN_STRAITS: EarthStrait[] = [
  { name: "Gibraltar", a: [-5.61, 36.01], b: [-5.42, 35.92], widthKm: 14 },
  { name: "Messina", a: [15.64, 38.22], b: [15.57, 38.19], widthKm: 3.2 },
  { name: "Bonifacio", a: [9.16, 41.39], b: [9.19, 41.24], widthKm: 11 },
  { name: "Dardanelles", a: [26.36, 40.2], b: [26.42, 40.14], widthKm: 1.4 },
  { name: "Bosporus", a: [28.99, 41.12], b: [29.07, 41.12], widthKm: 0.7 }
];

const EUROPE_CENTRAL_STRAITS: EarthStrait[] = [{ name: "Dover", a: [1.32, 51.13], b: [1.59, 50.87], widthKm: 33 }];

const ATLANTICS_STRAITS: EarthStrait[] = [...BRITAIN_STRAITS, ...MEDITERRANEAN_STRAITS];

const CARIBBEAN_STRAITS: EarthStrait[] = [
  { name: "FloridaStrait", a: [-81.8, 24.55], b: [-82.2, 23.3], widthKm: 80 },
  { name: "WindwardPassage", a: [-74.13, 20.24], b: [-73.42, 19.82], widthKm: 80 }
];

const EUROPE_STRAITS: EarthStrait[] = [...BRITAIN_STRAITS, ...MEDITERRANEAN_STRAITS];

const INDIAN_OCEAN_STRAITS: EarthStrait[] = [
  { name: "Gibraltar", a: [-5.61, 36.01], b: [-5.42, 35.92], widthKm: 14 },
  { name: "BabElMandeb", a: [43.32, 12.69], b: [43.48, 12.65], widthKm: 26 },
  { name: "Hormuz", a: [56.35, 26.57], b: [56.52, 27.05], widthKm: 39 },
  { name: "Malacca", a: [100.35, 2.85], b: [101.35, 2.45], widthKm: 65 },
  { name: "Sunda", a: [105.4, -5.9], b: [105.7, -6.5], widthKm: 24 }
];

const ANCIENT_ROME_STRAITS: EarthStrait[] = [
  { name: "Dover", a: [1.32, 51.13], b: [1.59, 50.87], widthKm: 33 },
  ...MEDITERRANEAN_STRAITS
];

const ARABIA_STRAITS: EarthStrait[] = [
  { name: "Dardanelles", a: [26.36, 40.2], b: [26.42, 40.14], widthKm: 1.4 },
  { name: "Bosporus", a: [28.99, 41.12], b: [29.07, 41.12], widthKm: 0.7 },
  { name: "BabElMandeb", a: [43.32, 12.69], b: [43.48, 12.65], widthKm: 26 },
  { name: "Hormuz", a: [56.35, 26.57], b: [56.52, 27.05], widthKm: 39 },
  { name: "Palk", a: [79.4, 9.25], b: [79.75, 9.12], widthKm: 20 }
];

/**
 * East Asia: eastern Himalaya / Yunnan through Japan and the Korean peninsula.
 *
 * Chosen as a clean equirectangular box (not reverse-engineered from the
 * Heightmapper screenshot). Legacy public/main.js `east-asia → [11, 28, 9.4]`
 * reconstructed to ~110.3–149.9°E, center ~35.2°N — a tighter window on
 * the same theatre. This bbox is wider so Tibet and Hokkaido stay on-map
 * together; climate uses this bbox, not the legacy shift.
 *
 * Deliberately has no `topology.keepStraits`, unlike `JAPAN_REGION`. This bbox covers roughly
 * 5.6x JAPAN_REGION's area at the same default cell budget, so its grid is ~2x coarser
 * (~46 km/cell vs. ~21 km/cell at 10K cells) — `applyStraits()`'s carve radius scales with
 * `grid.spacing`, so reusing `JAPAN_STRAITS` here forced ~90+ km-wide corridors across the Seto
 * Inland Sea, swallowing the real Sanyo coastal plain (Osaka–Kobe–Okayama–Hiroshima) well beyond
 * what any strait actually needed. At this scale the western-Japan landmasses occasionally fusing
 * across a strait is the smaller visual defect; use `JAPAN_REGION` when precise strait separation
 * (Honshu/Shikoku/Kyushu as distinct landmasses) matters.
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
  previewPng: "./heightmaps/east-asia.png",
  attribution:
    "Natural Earth 10m admin-0 land polygons (public domain). Japan is the JPN feature; Korea/China follow Natural Earth."
};

/**
 * Japan home waters: Yellow Sea (118.5°E) on the west, Hokkaido at the
 * upper-right. Padded ~1° past Cape Soya and Cape Sata so a coastal sea
 * lane can pass those capes. The graph is fitted to this bbox's true shape;
 * leftover browser window is off-map, not extra ocean.
 */
export const JAPAN_REGION: EarthRegion = {
  id: "japan",
  name: "Japan",
  west: 118.5,
  east: 146.4,
  south: 29.9,
  north: 46.6,
  projection: "equirectangular",
  climateAnchor: {
    mapSize: 7.75,
    latitude: 38.25,
    longitude: 10.12
  },
  raster: { path: "./heightmaps/earth/japan.bin" },
  topology: { keepStraits: JAPAN_STRAITS },
  attribution:
    "Natural Earth 10m admin-0 land (public domain). In-frame islands and neighboring land are kept; the canvas is not stretched to the window."
};

/**
 * British Isles: western Ireland at the lower-left, Shetland at the upper-right.
 * Padded past Land's End, Cape Wrath / Unst, and Dover so coastal sea lanes
 * can pass those capes and the Channel. In-frame neighbors (Calais, etc.)
 * stay on the land mask. The graph is fitted to this bbox's true shape.
 */
export const BRITAIN_REGION: EarthRegion = {
  id: "britain",
  name: "Britain",
  west: -11.5,
  east: 3.0,
  south: 49.0,
  north: 61.7,
  projection: "equirectangular",
  climateAnchor: {
    mapSize: 4.0278,
    latitude: 55.35,
    longitude: 51.23
  },
  raster: { path: "./heightmaps/earth/britain.bin" },
  topology: { keepStraits: BRITAIN_STRAITS },
  previewPng: "./heightmaps/britain.png",
  attribution:
    "Natural Earth 10m admin-0 land (public domain). British Isles and in-frame neighbors are kept; the canvas is not stretched to the window."
};

/**
 * Mediterranean basin for the Age of Exploration: Gibraltar (with an
 * Atlantic approach) at the west, the Levant and Cyprus at the east.
 * Venice sits near the northern edge; the Gulf of Sidra and the Nile
 * Delta keep a strip of sea to the south. In-frame islands and
 * neighbors stay on the land mask. The graph is fitted to this bbox.
 */
export const MEDITERRANEAN_SEA_REGION: EarthRegion = {
  id: "mediterranean-sea",
  name: "Mediterranean Sea",
  west: -7,
  east: 36.8,
  south: 29.8,
  north: 46.2,
  projection: "equirectangular",
  climateAnchor: {
    mapSize: 12.1667,
    latitude: 38,
    longitude: 45.29
  },
  raster: { path: "./heightmaps/earth/mediterranean-sea.bin" },
  topology: { keepStraits: MEDITERRANEAN_STRAITS },
  previewPng: "./heightmaps/mediterranean-sea.png",
  attribution:
    "Natural Earth 10m admin-0 land (public domain). In-frame Mediterranean islands and neighboring shores are kept; the canvas is not stretched to the window."
};

/**
 * Industrial Revolution core of continental Europe: Channel approaches
 * and the Low Countries in the north-west, the Elbe / Saxony in the
 * east, Lyon at the southern edge. SE England may appear as an in-frame
 * neighbor; Dover stays open. The graph is fitted to this bbox's true shape.
 */
export const EUROPE_CENTRAL_REGION: EarthRegion = {
  id: "europe-central",
  name: "Europe Central",
  west: -1.8,
  east: 14.8,
  south: 45.5,
  north: 54.3,
  projection: "equirectangular",
  climateAnchor: {
    mapSize: 4.6111,
    latitude: 49.9,
    longitude: 48.11
  },
  raster: { path: "./heightmaps/earth/europe-central.bin" },
  topology: { keepStraits: EUROPE_CENTRAL_STRAITS },
  previewPng: "./heightmaps/europe-central.png",
  attribution:
    "Natural Earth 10m admin-0 land (public domain). In-frame industrial-core land and Channel neighbors are kept; the canvas is not stretched to the window."
};

/**
 * North Atlantic basin, matching the original Heightmapper crop's intent:
 * North America and Europe as complete, recognizable continents, with
 * Greenland, the Maghreb, and northern South America as full shoulders
 * rather than mid-continent slices. Legacy `atlantics → [42, 23, 65]`
 * reconstructs to about 107°W–44°E, 10°S–66°N; this box is that window
 * snapped to geographic landmarks. The graph is fitted to its true shape.
 */
export const ATLANTICS_REGION: EarthRegion = {
  id: "atlantics",
  name: "Atlantics",
  west: -108,
  east: 44,
  south: -8,
  north: 68,
  projection: "equirectangular",
  climateAnchor: {
    mapSize: 42.2222,
    latitude: 30,
    longitude: 65.38
  },
  raster: { path: "./heightmaps/earth/atlantics.bin" },
  topology: { keepStraits: ATLANTICS_STRAITS },
  previewPng: "./heightmaps/atlantics.png",
  attribution:
    "Natural Earth 10m admin-0 land (public domain). North America and Europe stay complete; neighboring land is not sliced into mystery stubs."
};

/**
 * Caribbean / Gulf / Central America: Los Angeles at the upper-left,
 * Belém at the lower-right. Mexico, the Caribbean islands, and northern
 * South America stay in-frame. The graph is fitted to this bbox's true shape.
 */
export const CARIBBEAN_REGION: EarthRegion = {
  id: "caribbean",
  name: "Caribbean",
  west: -119.3,
  east: -47.5,
  south: -2.4,
  north: 34.9,
  projection: "equirectangular",
  climateAnchor: {
    mapSize: 19.9444,
    latitude: 16.25,
    longitude: 78.94
  },
  raster: { path: "./heightmaps/earth/caribbean.bin" },
  topology: { keepStraits: CARIBBEAN_STRAITS },
  previewPng: "./heightmaps/caribbean.png",
  attribution:
    "Natural Earth 10m admin-0 land (public domain). Los Angeles to Belém; in-frame islands and neighboring shores are kept."
};

/**
 * Europe as on the EU membership map: Ireland to Georgia, Cyprus to
 * Finland. All EU members, candidates, potential candidates, and
 * applicants stay in-frame (Portugal, Ireland, Finland, Cyprus,
 * Ukraine, Turkey, Georgia). Iceland is left off. The graph is fitted
 * to this bbox's true shape.
 */
export const EUROPE_REGION: EarthRegion = {
  id: "europe",
  name: "Europe",
  west: -11.5,
  east: 47.5,
  south: 34,
  north: 71.5,
  projection: "equirectangular",
  climateAnchor: {
    mapSize: 16.3889,
    latitude: 52.75,
    longitude: 44.02
  },
  raster: { path: "./heightmaps/earth/europe.bin" },
  topology: { keepStraits: EUROPE_STRAITS },
  previewPng: "./heightmaps/europe.png",
  attribution:
    "Natural Earth 10m admin-0 land (public domain). EU members and candidates from Ireland to Georgia stay complete; Iceland is off-map."
};

/**
 * Indian Ocean theatre: Dakar (Cap-Vert) at the west edge, mainland
 * Australia at the lower-right. Padded ~1.2° west of Pointe des Almadies
 * and ~1.2° south of Wilsons Promontory so a coastal sea lane can pass
 * Dakar and turn from Australia's south coast to the east coast (Bass
 * Strait north channel). Tasmania stays off the south edge. The graph
 * is fitted to this bbox's true shape.
 */
export const INDIAN_OCEAN_REGION: EarthRegion = {
  id: "indian-ocean",
  name: "Indian Ocean",
  west: -18.7,
  east: 155.3,
  south: -40.3,
  north: 39.7,
  projection: "equirectangular",
  climateAnchor: {
    mapSize: 48.3333,
    latitude: -0.3,
    longitude: 13.28
  },
  raster: { path: "./heightmaps/earth/indian-ocean.bin" },
  topology: { keepStraits: INDIAN_OCEAN_STRAITS },
  previewPng: "./heightmaps/indian-ocean.png",
  attribution: "Natural Earth 10m admin-0 land (public domain). Dakar to mainland Australia; Tasmania is off-map."
};

/**
 * Arabia theatre: Croatia at the upper-left, Sri Lanka at the lower-right.
 * Padded ~1.2° west of Istria so a Dalmatian coastal lane can pass, and
 * ~1.2° south and east of Dondra Head / Sangamankanda so a coastal lane
 * can pass Sri Lanka. In-frame neighbors stay on the land mask. The
 * graph is fitted to this bbox's true shape.
 */
export const ARABIA_REGION: EarthRegion = {
  id: "arabia",
  name: "Arabia",
  west: 12.3,
  east: 83.1,
  south: 4.7,
  north: 47.0,
  projection: "equirectangular",
  climateAnchor: {
    mapSize: 19.6667,
    latitude: 25.85,
    longitude: 33.51
  },
  raster: { path: "./heightmaps/earth/arabia.bin" },
  topology: { keepStraits: ARABIA_STRAITS },
  previewPng: "./heightmaps/arabia.png",
  attribution:
    "Natural Earth 10m admin-0 land (public domain). Croatia to Sri Lanka; south and east of Sri Lanka keep a coastal-sea margin."
};

/**
 * Roman Empire at its AD 117 height (Britannica ancient-Rome map):
 * Atlantic approaches west of Iberia and Britain, the Caspian in the
 * east, Thebes and the Red Sea in the south, Scotland in the north.
 * Ireland may appear as an in-frame neighbor. The graph is fitted to
 * this bbox's true shape; leftover window is off-map.
 */
export const ANCIENT_ROME_REGION: EarthRegion = {
  id: "ancient-rome",
  name: "Ancient Rome",
  west: -11.5,
  east: 56,
  south: 21.5,
  north: 59.5,
  projection: "equirectangular",
  climateAnchor: {
    mapSize: 18.75,
    latitude: 40.5,
    longitude: 42.39
  },
  raster: { path: "./heightmaps/earth/ancient-rome.bin" },
  topology: { keepStraits: ANCIENT_ROME_STRAITS },
  attribution:
    "Natural Earth 10m admin-0 land (public domain). Roman Empire AD 117 theatre from Britain to the Caspian; in-frame neighbors are kept."
};

export const earthRegions: Record<string, EarthRegion> = {
  "east-asia": EAST_ASIA_REGION,
  japan: JAPAN_REGION,
  britain: BRITAIN_REGION,
  "mediterranean-sea": MEDITERRANEAN_SEA_REGION,
  "europe-central": EUROPE_CENTRAL_REGION,
  atlantics: ATLANTICS_REGION,
  caribbean: CARIBBEAN_REGION,
  europe: EUROPE_REGION,
  "indian-ocean": INDIAN_OCEAN_REGION,
  arabia: ARABIA_REGION,
  "ancient-rome": ANCIENT_ROME_REGION
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

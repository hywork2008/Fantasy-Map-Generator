/** Earth-equivalent equatorial circumference used to calibrate generated map distances. */
export const EARTH_EQUATORIAL_CIRCUMFERENCE_KM = 40_075;

const EARTH_RADIUS_KM = EARTH_EQUATORIAL_CIRCUMFERENCE_KM / (2 * Math.PI);

type MapCoordinates = {
  latT?: number;
  latN?: number;
  lonT?: number;
  lonW?: number;
};

export type EarthMappedWorld = {
  graphWidth: number;
  graphHeight: number;
  mapCoordinates: MapCoordinates;
  distanceScale: number;
};

/**
 * A 12.9% equatorial-width slice is about 5,170 km wide at the equator.
 * This is the standard generated-map extent; larger extents remain available as
 * explicit World Configurator choices.
 */
export const EARTH_DEFAULT_MAP_SIZE = 12.9;

/** Earth-like baseline temperatures for the World Configurator, in degrees Celsius. */
export const EARTH_TEMPERATURE_PRESET = {
  equator: 27,
  northPole: -18,
  southPole: -18
} as const;

/**
 * Latitude of the Arctic/Antarctic Circle, in degrees — the conventional boundary between
 * the temperate and cold (polar) climate zones. Shared by `getGeozone()`
 * (`src/services/cellInfoService.ts`, geozone classification for the cell info panel) and
 * `defineMapSize()` (`src/main.ts`, bounds the World Configurator's random `latitude` draw
 * so a freshly generated map's pole-ward edge never drifts far past this line).
 */
export const ARCTIC_CIRCLE_LATITUDE_DEG = 66.5;

/**
 * Earth's axial tilt (obliquity), in degrees. Default value for the World Configurator's
 * `axialTilt` option, which drives the seasonal temperature swing (see
 * `src/utils/seasonUtils.ts`'s `getSeasonalTemperatureOffset`). 0° means no seasons at all;
 * larger values widen the seasonal swing at a given latitude.
 */
export const EARTH_AXIAL_TILT_DEG = 23.5;

/**
 * Converts an Earth-relative map extent to kilometres per map pixel.
 *
 * `mapSize` represents the equatorial-width share, so the map's full width is
 * calibrated against the Earth's equatorial circumference.
 */
export function getEarthDistanceScale(mapSize: number, graphWidth: number): number {
  if (!Number.isFinite(mapSize) || !Number.isFinite(graphWidth) || graphWidth <= 0) return 0;
  return (EARTH_EQUATORIAL_CIRCUMFERENCE_KM * mapSize) / (100 * graphWidth);
}

/** Returns the map's north-to-south extent in geographic degrees. */
export function getEarthMapLatitudeSpan(mapSize: number, graphWidth: number, graphHeight: number): number {
  if (
    !Number.isFinite(mapSize) ||
    !Number.isFinite(graphWidth) ||
    !Number.isFinite(graphHeight) ||
    graphWidth <= 0 ||
    graphHeight <= 0
  ) {
    return 0;
  }

  const longitudeSpan = Math.min((mapSize / 100) * 360, 360);
  return mapSize >= 100 ? 180 : Math.min(longitudeSpan / (graphWidth / graphHeight), 180);
}

/**
 * Returns the maximum absolute center `latitude` for a map of the given latitude span such
 * that a random draw never places the map's pole-ward edge (`|center| + span / 2`) past the
 * Arctic/Antarctic Circle — the temperate/cold climate transition (`ARCTIC_CIRCLE_LATITUDE_DEG`).
 * At this bound the edge exactly reaches that line; drawing any `|center|` up to this value
 * keeps the map on the warm side. `maxCenterLatitude` (typically `90 - span / 2`, the limit
 * that keeps the map within ±90°) is applied as an outer clamp for oversized spans where the
 * Arctic bound alone would place the center out of range.
 *
 * Used by `defineMapSize()` (`src/main.ts`) to bound the World Configurator's automatic
 * `latitude` draw. Does not affect manually setting `latitude` after unlocking it — that can
 * still place the map deep in an uninhabitably cold band.
 */
export function getTemperateLatitudeBound(latitudeSpan: number, maxCenterLatitude: number): number {
  if (!Number.isFinite(latitudeSpan) || !Number.isFinite(maxCenterLatitude)) return 0;
  const edgeBound = Math.max(0, ARCTIC_CIRCLE_LATITUDE_DEG - latitudeSpan / 2);
  return Math.min(edgeBound, maxCenterLatitude);
}

/**
 * Converts a pre-"geographic-latitude-v1" `latitude` value (a legacy 0–100 north/south
 * shift fraction) to the current geographic center-latitude representation, in degrees.
 *
 * The legacy formula placed the map's northern edge at
 * `90 - (180 - legacyLatT) * (legacyLatitude / 100)`, where `legacyLatT` is the map's
 * legacy latitude span (`legacyMapSize / 100 * 180` — the pre-Earth-calibration meaning of
 * `mapSize`, a share of a fixed 180° pole-to-pole extent). This reconstructs that edge from
 * the map's legacy size and re-centers it, rather than assuming an infinitesimally small
 * map (`legacyLatT = 0`), which is only exact at `legacyLatitude === 50` or for legacy map
 * sizes near 0. When `legacyMapSize` isn't available, it degrades to that same `latT = 0`
 * approximation.
 */
export function convertLegacyLatitudeToGeographic(legacyLatitude: number, legacyMapSize?: number): number {
  const legacyLatT =
    typeof legacyMapSize === "number" && Number.isFinite(legacyMapSize)
      ? (Math.min(Math.max(legacyMapSize, 0), 100) / 100) * 180
      : 0;
  const legacyLatN = 90 - (180 - legacyLatT) * (legacyLatitude / 100);
  const centerLatitude = legacyLatN - legacyLatT / 2;
  return Math.min(Math.max(centerLatitude, -90), 90);
}

/** Returns the latitude and longitude represented by a map-space point. */
export function getEarthCoordinatesAtMapPoint(
  world: Pick<EarthMappedWorld, "graphWidth" | "graphHeight" | "mapCoordinates">,
  [x, y]: readonly [number, number]
): { latitude: number; longitude: number } | null {
  const { graphWidth, graphHeight, mapCoordinates } = world;
  const { latT, latN, lonT, lonW } = mapCoordinates;
  if (
    !Number.isFinite(graphWidth) ||
    !Number.isFinite(graphHeight) ||
    graphWidth <= 0 ||
    graphHeight <= 0 ||
    typeof latT !== "number" ||
    typeof latN !== "number" ||
    typeof lonT !== "number" ||
    typeof lonW !== "number" ||
    !Number.isFinite(latT) ||
    !Number.isFinite(latN) ||
    !Number.isFinite(lonT) ||
    !Number.isFinite(lonW)
  ) {
    return null;
  }

  return {
    latitude: latN - (y / graphHeight) * latT,
    longitude: lonW + (x / graphWidth) * lonT
  };
}

/** Great-circle distance between two map-space points, in kilometres. */
export function getEarthDistanceBetweenMapPoints(
  world: Pick<EarthMappedWorld, "graphWidth" | "graphHeight" | "mapCoordinates">,
  start: readonly [number, number],
  end: readonly [number, number]
): number | null {
  const startCoordinates = getEarthCoordinatesAtMapPoint(world, start);
  const endCoordinates = getEarthCoordinatesAtMapPoint(world, end);
  if (!startCoordinates || !endCoordinates) return null;

  const latitudeDelta = toRadians(endCoordinates.latitude - startCoordinates.latitude);
  const longitudeDelta = toRadians(normalizeLongitudeDelta(endCoordinates.longitude - startCoordinates.longitude));
  const startLatitude = toRadians(startCoordinates.latitude);
  const endLatitude = toRadians(endCoordinates.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

/** Great-circle length of a polyline expressed in map-space points, in kilometres. */
export function getEarthPathDistance(
  world: Pick<EarthMappedWorld, "graphWidth" | "graphHeight" | "mapCoordinates">,
  points: readonly (readonly [number, number])[]
): number | null {
  if (points.length < 2) return 0;

  let distance = 0;
  for (let index = 1; index < points.length; index++) {
    const segmentDistance = getEarthDistanceBetweenMapPoints(world, points[index - 1], points[index]);
    if (segmentDistance === null) return null;
    distance += segmentDistance;
  }
  return distance;
}

function normalizeLongitudeDelta(longitudeDelta: number): number {
  return ((longitudeDelta + 540) % 360) - 180;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

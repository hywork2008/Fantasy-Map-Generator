import { earthRegionView } from "../data/earthConfig";
import type { EarthRegion } from "../data/earthRegions";

export const EARTH_RASTER_MAGIC = 0x45474d46; // "FMGE" little-endian
export const EARTH_RASTER_VERSION = 1;
export const EARTH_RASTER_NODATA = -32768;

export interface EarthRaster {
  width: number;
  height: number;
  west: number;
  east: number;
  south: number;
  north: number;
  /** Meters. EARTH_RASTER_NODATA where missing. */
  elevation: Int16Array;
  land: Uint8Array;
}

const HEADER_BYTES = 28;

export function encodeEarthRaster(raster: EarthRaster): Uint8Array {
  const { width, height } = raster;
  const elevBytes = width * height * 2;
  const landBytes = Math.ceil((width * height) / 8);
  const out = new Uint8Array(HEADER_BYTES + elevBytes + landBytes);
  const view = new DataView(out.buffer);
  view.setUint32(0, EARTH_RASTER_MAGIC, true);
  view.setUint16(4, EARTH_RASTER_VERSION, true);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  view.setFloat32(10, raster.west, true);
  view.setFloat32(14, raster.east, true);
  view.setFloat32(18, raster.south, true);
  view.setFloat32(22, raster.north, true);
  view.setUint16(26, 0, true);
  out.set(new Uint8Array(raster.elevation.buffer, raster.elevation.byteOffset, elevBytes), HEADER_BYTES);
  for (let i = 0; i < width * height; i++) {
    if (raster.land[i]) out[HEADER_BYTES + elevBytes + (i >> 3)] |= 1 << (i & 7);
  }
  return out;
}

export function decodeEarthRaster(bytes: Uint8Array): EarthRaster {
  if (bytes.byteLength < HEADER_BYTES) throw new Error("Earth raster: truncated header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== EARTH_RASTER_MAGIC) throw new Error(`Earth raster: bad magic ${magic.toString(16)}`);
  const version = view.getUint16(4, true);
  if (version !== EARTH_RASTER_VERSION) throw new Error(`Earth raster: unsupported version ${version}`);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const west = view.getFloat32(10, true);
  const east = view.getFloat32(14, true);
  const south = view.getFloat32(18, true);
  const north = view.getFloat32(22, true);
  const elevBytes = width * height * 2;
  const landBytes = Math.ceil((width * height) / 8);
  if (bytes.byteLength < HEADER_BYTES + elevBytes + landBytes) {
    throw new Error("Earth raster: truncated payload");
  }
  const elevation = new Int16Array(width * height);
  elevation.set(new Int16Array(bytes.buffer, bytes.byteOffset + HEADER_BYTES, width * height));
  const land = new Uint8Array(width * height);
  const packed = bytes.subarray(HEADER_BYTES + elevBytes);
  for (let i = 0; i < width * height; i++) {
    land[i] = (packed[i >> 3] >> (i & 7)) & 1;
  }
  return { width, height, west, east, south, north, elevation, land };
}

export function lonLatToRaster(raster: EarthRaster, lon: number, lat: number): { x: number; y: number } {
  const x = ((lon - raster.west) / (raster.east - raster.west)) * raster.width;
  const y = ((raster.north - lat) / (raster.north - raster.south)) * raster.height;
  return { x, y };
}

export function sampleLand(raster: EarthRaster, lon: number, lat: number): boolean {
  const { x, y } = lonLatToRaster(raster, lon, lat);
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= raster.width || iy >= raster.height) return false;
  return raster.land[iy * raster.width + ix] === 1;
}

export function sampleElevation(raster: EarthRaster, lon: number, lat: number): number | null {
  const { x, y } = lonLatToRaster(raster, lon, lat);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= raster.width - 1 || y0 >= raster.height - 1) {
    if (x0 < 0 || y0 < 0 || x0 >= raster.width || y0 >= raster.height) return null;
    const v = raster.elevation[y0 * raster.width + x0];
    return v === EARTH_RASTER_NODATA ? null : v;
  }
  const fx = x - x0;
  const fy = y - y0;
  const i00 = y0 * raster.width + x0;
  const v00 = raster.elevation[i00];
  const v10 = raster.elevation[i00 + 1];
  const v01 = raster.elevation[i00 + raster.width];
  const v11 = raster.elevation[i00 + raster.width + 1];
  if (
    v00 === EARTH_RASTER_NODATA ||
    v10 === EARTH_RASTER_NODATA ||
    v01 === EARTH_RASTER_NODATA ||
    v11 === EARTH_RASTER_NODATA
  ) {
    return v00 === EARTH_RASTER_NODATA ? null : v00;
  }
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}

export function mapPointToLonLat(
  region: EarthRegion,
  graphWidth: number,
  graphHeight: number,
  x: number,
  y: number
): { lon: number; lat: number } {
  const view = earthRegionView(region, graphWidth, graphHeight);
  return {
    lon: view.west + (x / graphWidth) * (view.east - view.west),
    lat: view.north - (y / graphHeight) * (view.north - view.south)
  };
}

export function lonLatToMapPoint(
  region: EarthRegion,
  graphWidth: number,
  graphHeight: number,
  lon: number,
  lat: number
): { x: number; y: number } {
  const view = earthRegionView(region, graphWidth, graphHeight);
  return {
    x: ((lon - view.west) / (view.east - view.west)) * graphWidth,
    y: ((view.north - lat) / (view.north - view.south)) * graphHeight
  };
}

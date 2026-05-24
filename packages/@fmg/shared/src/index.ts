import type { FmgGlobalContext } from "@fmg/types";
import type { Grid, PackedGraph } from "@fmg/types";
import type { Selection } from "d3";
import { createTypedArray, getTypedArray, last, TYPED_ARRAY_MAX_VALUES, unique } from "./arrayUtils";
import { abbreviate, getAdjective, isVowel, list, nth, trimVowels } from "./languageUtils";
import { lerp, lim, minmax, normalize, rn } from "./numberUtils";
import "./polyfills";
import { C_12, getColors, getMixedColor, getRandomColor, toHEX } from "./colorUtils";
import {
  clipPoly,
  debounce,
  generateDate,
  getBase64,
  getCoordinates,
  getLatitude,
  getLongitude,
  getSegmentId,
  initializePrompt,
  isCtrlClick,
  link,
  openURL,
  parseError,
  throttle,
  wiki
} from "./commonUtils";
import { drawCellsValue, drawPath, drawPoint, drawPolygons, drawRouteConnections } from "./debugUtils";
import { distanceSquared, rollups } from "./functionUtils";
import {
  calculateVoronoi,
  drawHeights,
  findAllCellsInRadius,
  findAllInQuadtree,
  findClosestCell,
  findGridAll,
  findGridCell,
  generateGrid,
  getGridPolygon,
  getPackPolygon,
  isLand,
  isWater,
  poissonDiscSampler,
  shouldRegenerateGrid
} from "./graphUtils";
import { ensureEl, getComposedPath, getNextId } from "./nodeUtils";
import { connectVertices, findPath, getIsolines, getPolesOfInaccessibility, getVertexPath } from "./pathUtils";
import { biased, each, gauss, generateSeed, getNumberInRange, P, Pint, ra, rand, rw } from "./probabilityUtils";
import { capitalize, isValidJSON, parseTransform, round, safeParseJSON, sanitizeId, splitInTwo } from "./stringUtils";
import { convertTemperature, getIntegerFromSI, si } from "./unitUtils";

type LegacyWindowBridge = Window & {
  temperatureScale?: { value?: string };
  pack: PackedGraph;
  packedGraph: PackedGraph;
  grid: Grid;
  graphWidth: number;
  graphHeight: number;
  seed: string;
  terrs: Selection<SVGGElement, unknown, null, undefined>;
};

const legacyWindow = window as LegacyWindowBridge;
const TEMPERATURE_SCALES = ["°C", "°F", "K", "°R", "°De", "°N", "°Ré", "°Rø"] as const;
type TemperatureScale = (typeof TEMPERATURE_SCALES)[number];

const normalizeTemperatureScale = (scale?: string): TemperatureScale => {
  if (scale && (TEMPERATURE_SCALES as readonly string[]).includes(scale)) return scale as TemperatureScale;
  const fallback = legacyWindow.temperatureScale?.value;
  if (fallback && (TEMPERATURE_SCALES as readonly string[]).includes(fallback)) return fallback as TemperatureScale;
  return "°C";
};

// Initialize window.fmg namespace
const fmgGlobal: FmgGlobalContext = {
  // Number utils
  rn,
  lim,
  minmax,
  normalize,
  lerp,

  // Language utils
  vowel: isVowel,
  trimVowels,
  getAdjective,
  nth,
  abbreviate,
  list,

  // Array utils
  last,
  unique,
  getTypedArray,
  createTypedArray,
  INT8_MAX: TYPED_ARRAY_MAX_VALUES.INT8_MAX,
  UINT8_MAX: TYPED_ARRAY_MAX_VALUES.UINT8_MAX,
  UINT16_MAX: TYPED_ARRAY_MAX_VALUES.UINT16_MAX,
  UINT32_MAX: TYPED_ARRAY_MAX_VALUES.UINT32_MAX,

  // Probability utils
  rand,
  P,
  each,
  gauss,
  Pint,
  ra,
  rw,
  biased,
  getNumberInRange,
  generateSeed,

  // Unit utils
  convertTemperature: (temp: number, scale?: string) => convertTemperature(temp, normalizeTemperatureScale(scale)),
  si,
  getInteger: getIntegerFromSI,

  // Color utils
  toHEX,
  getColors,
  getRandomColor,
  getMixedColor,
  C_12,

  // DOM utils
  ensureEl,
  getComposedPath,
  getNextId,

  // Function utils
  rollups,
  dist2: distanceSquared,

  // Path utils
  getIsolines,
  getPolesOfInaccessibility,
  connectVertices,
  findPath: (start, isExit, getCost) => findPath(start, isExit, getCost, legacyWindow.pack),
  getVertexPath: (cellsArray) => getVertexPath(cellsArray, legacyWindow.pack),

  // String utils
  round,
  capitalize,
  splitInTwo,
  parseTransform,
  sanitizeId,

  // Graph utils
  shouldRegenerateGrid: (grid: Grid, expectedSeed: number) =>
    shouldRegenerateGrid(grid, expectedSeed, legacyWindow.graphWidth, legacyWindow.graphHeight),
  generateGrid: () => generateGrid(legacyWindow.seed, legacyWindow.graphWidth, legacyWindow.graphHeight),
  findGridAll: (x: number, y: number, radius: number) => findGridAll(x, y, radius, legacyWindow.grid),
  findGridCell: (x: number, y: number) => findGridCell(x, y, legacyWindow.grid),
  findCell: (x: number, y: number, radius?: number) => findClosestCell(x, y, radius, legacyWindow.pack),
  findAll: (x: number, y: number, radius: number) => findAllCellsInRadius(x, y, radius, legacyWindow.pack),
  getPackPolygon: (cellIndex: number) => getPackPolygon(cellIndex, legacyWindow.pack),
  getGridPolygon: (cellIndex: number) => getGridPolygon(cellIndex, legacyWindow.grid),
  calculateVoronoi,
  poissonDiscSampler,
  FlatQueue: (window as Window & { FlatQueue?: FmgGlobalContext["FlatQueue"] }).FlatQueue
};

// Register to window.fmg namespace and merge into any existing object
const fmg = window.fmg || (window.fmg = {} as FmgGlobalContext);
Object.assign(fmg, fmgGlobal);

const getNormalizedMapCoordinates = (): {
  lonW: number;
  lonT: number;
  latN: number;
  latT: number;
} => ({
  lonW: Number.isFinite(mapCoordinates.lonW) ? mapCoordinates.lonW! : 0,
  lonT: Number.isFinite(mapCoordinates.lonT) ? mapCoordinates.lonT! : 360,
  latN: Number.isFinite(mapCoordinates.latN) ? mapCoordinates.latN! : 90,
  latT: Number.isFinite(mapCoordinates.latT) ? mapCoordinates.latT! : 180
});

declare global {
  interface JSON {
    isValid: (str: string) => boolean;
    safeParse: (str: string) => unknown;
  }

  interface Node {
    on: (name: string, fn: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => Node;
    off: (name: string, fn: EventListenerOrEventListenerObject) => Node;
  }
}

// Additional grid-related functions registered on window.fmg only
Object.assign(fmg as FmgGlobalContext & Record<string, unknown>, {
  shouldRegenerateGrid: (grid: Grid, expectedSeed: number) =>
    shouldRegenerateGrid(grid, expectedSeed, legacyWindow.graphWidth, legacyWindow.graphHeight),
  generateGrid: () => generateGrid(legacyWindow.seed, legacyWindow.graphWidth, legacyWindow.graphHeight),
  findGridAll: (x: number, y: number, radius: number) => findGridAll(x, y, radius, legacyWindow.grid),
  findGridCell: (x: number, y: number) => findGridCell(x, y, legacyWindow.grid),
  findCell: (x: number, y: number, radius?: number) => findClosestCell(x, y, radius, legacyWindow.pack),
  findAll: (x: number, y: number, radius: number) => findAllCellsInRadius(x, y, radius, legacyWindow.pack),
  getPackPolygon: (cellIndex: number) => getPackPolygon(cellIndex, legacyWindow.pack),
  getGridPolygon: (cellIndex: number) => getGridPolygon(cellIndex, legacyWindow.grid),
  calculateVoronoi,
  poissonDiscSampler,
  findAllInQuadtree,
  drawHeights,
  isLand: (i: number) => isLand(i, legacyWindow.pack),
  isWater: (i: number) => isWater(i, legacyWindow.pack),
  clipPoly: (points: [number, number][], secure?: number) => clipPoly(points, graphWidth, graphHeight, secure),
  getSegmentId,
  debounce,
  throttle,
  parseError,
  getBase64,
  openURL,
  wiki,
  link,
  isCtrlClick,
  generateDate,
  getLongitude: (x: number, decimals?: number) => getLongitude(x, getNormalizedMapCoordinates(), graphWidth, decimals),
  getLatitude: (y: number, decimals?: number) => getLatitude(y, getNormalizedMapCoordinates(), graphHeight, decimals),
  getCoordinates: (x: number, y: number, decimals?: number) =>
    getCoordinates(x, y, getNormalizedMapCoordinates(), graphWidth, graphHeight, decimals),
  drawCellsValue: (data: Array<string | number>) => drawCellsValue(data, legacyWindow.pack),
  drawPolygons: (data: number[]) => drawPolygons(data, legacyWindow.terrs, legacyWindow.grid),
  drawRouteConnections: () => drawRouteConnections(legacyWindow.packedGraph),
  drawPoint,
  drawPath
});

// Polyfill for JSON and Node extensions
JSON.isValid = isValidJSON;
JSON.safeParse = safeParseJSON;

Node.prototype.on = function (name, fn, options) {
  this.addEventListener(name, fn, options);
  return this;
};
Node.prototype.off = function (name, fn) {
  this.removeEventListener(name, fn);
  return this;
};

// Initialize prompt when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePrompt);
} else {
  initializePrompt();
}

export {
  abbreviate,
  biased,
  C_12,
  calculateVoronoi,
  capitalize,
  clipPoly,
  connectVertices,
  convertTemperature,
  createTypedArray,
  debounce,
  distanceSquared,
  drawCellsValue,
  drawHeights,
  drawPath,
  drawPoint,
  drawPolygons,
  drawRouteConnections,
  each,
  ensureEl,
  findAllCellsInRadius,
  findAllInQuadtree,
  findClosestCell,
  findGridAll,
  findGridCell,
  findPath,
  gauss,
  generateDate,
  generateGrid,
  generateSeed,
  getAdjective,
  getBase64,
  getColors,
  getComposedPath,
  getCoordinates,
  getGridPolygon,
  getIntegerFromSI,
  getIsolines,
  getLatitude,
  getLongitude,
  getMixedColor,
  getNextId,
  getNumberInRange,
  getPackPolygon,
  getPolesOfInaccessibility,
  getRandomColor,
  getSegmentId,
  getTypedArray,
  getVertexPath,
  initializePrompt,
  isCtrlClick,
  isLand,
  isValidJSON,
  isVowel,
  isWater,
  last,
  lerp,
  lim,
  link,
  list,
  minmax,
  normalize,
  nth,
  openURL,
  P,
  Pint,
  parseError,
  parseTransform,
  poissonDiscSampler,
  ra,
  rand,
  rn,
  rollups,
  round,
  rw,
  safeParseJSON,
  sanitizeId,
  shouldRegenerateGrid,
  si,
  splitInTwo,
  TYPED_ARRAY_MAX_VALUES,
  throttle,
  toHEX,
  trimVowels,
  unique,
  wiki
};

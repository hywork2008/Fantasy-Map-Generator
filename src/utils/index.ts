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
  getCoordinates as getCoordinatesCore,
  getLatitude as getLatitudeCore,
  getLongitude as getLongitudeCore,
  getSegmentId,
  initializePrompt,
  isCtrlClick,
  link,
  openURL,
  parseError,
  showPrompt,
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
  type Grid,
  generateGrid,
  getGridPolygon as getGridPolygonCore,
  getPackPolygon,
  isLand as isLandCore,
  isWater,
  poissonDiscSampler,
  shouldRegenerateGrid
} from "./graphUtils";
import { ensureEl, getComposedPath, getNextId } from "./nodeUtils";
import {
  connectVertices,
  findPath,
  getGappedFillPaths,
  getIsolines,
  getPolesOfInaccessibility,
  getVertexPath
} from "./pathUtils";
import { biased, each, gauss, generateSeed, getNumberInRange, P, Pint, ra, rand, rw } from "./probabilityUtils";
import { capitalize, isValidJSON, parseTransform, round, safeParseJSON, sanitizeId, splitInTwo } from "./stringUtils";
import { applySorting, applySortingByHeader, sortLines } from "./uiHelpers";
import { convertTemperature, getIntegerFromSI, si } from "./unitUtils";

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

export function initUtils(): void {
  // Initialize prompt when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializePrompt);
  } else {
    initializePrompt();
  }
}

function findCell(x: number, y: number, radius?: number): number {
  const pack = window.pack;
  if (!pack?.cells?.p) return 0;
  return findClosestCell(x, y, radius, pack) ?? 0;
}

declare global {
  interface JSON {
    isValid: (str: string) => boolean;
    safeParse: (str: string) => unknown;
  }

  interface Node {
    on: (name: string, fn: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => Node;
    off: (name: string, fn: EventListenerOrEventListenerObject) => Node;

    temperatureScale?: { value?: string };
    pack?: import("../types/PackedGraph").PackedGraph;
    packedGraph?: import("../types/PackedGraph").PackedGraph;
    grid?: Grid;
    terrs?: import("d3").Selection<Element, unknown, null, undefined>;
  }

  var graphWidth: number;
  var graphHeight: number;
  var seed: string;
}

// Window-aware wrappers for functions whose core signature requires map globals.
// These mirror the simplified types in declare global and replace the old window.X assignments.
export const getLatitude = (y: number, decimals?: number): number =>
  getLatitudeCore(y, window.mapCoordinates, window.graphHeight, decimals);

export const getLongitude = (x: number, decimals?: number): number =>
  getLongitudeCore(x, window.mapCoordinates, window.graphWidth, decimals);

export const getCoordinates = (x: number, y: number, decimals?: number): [number, number] =>
  getCoordinatesCore(x, y, window.mapCoordinates, window.graphWidth, window.graphHeight, decimals);

export const isLand = (i: number): boolean => isLandCore(i, window.pack);

export const getGridPolygon = (i: number): [number, number][] => getGridPolygonCore(i, window.grid);

export {
  abbreviate,
  applySorting,
  applySortingByHeader,
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
  findCell,
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
  getGappedFillPaths,
  getIntegerFromSI,
  getIsolines,
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
  showPrompt,
  si,
  sortLines,
  splitInTwo,
  TYPED_ARRAY_MAX_VALUES,
  throttle,
  toHEX,
  trimVowels,
  unique,
  wiki
};

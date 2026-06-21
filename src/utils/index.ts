import { createTypedArray, getTypedArray, last, TYPED_ARRAY_MAX_VALUES, unique } from "./arrayUtils";
import { abbreviate, getAdjective, isVowel, list, nth, trimVowels } from "./languageUtils";
import { lerp, lim, minmax, normalize, rn } from "./numberUtils";
import "./polyfills";
import { worldContext } from "../context/worldContext";
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
  getGridPolygon,
  getPackPolygon,
  isLand,
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
import { convertTemperature, formatPrice, getIntegerFromSI, si } from "./unitUtils";

JSON.isValid = isValidJSON;
JSON.safeParse = safeParseJSON;

export function initUtils(): void {
  // Initialize prompt when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializePrompt);
  } else {
    initializePrompt();
  }
}

function findCell(x: number, y: number, radius?: number): number {
  const { pack } = worldContext;
  if (!pack?.cells?.p) return 0;
  return findClosestCell(x, y, radius, pack) ?? 0;
}

function findAll(x: number, y: number, radius: number): number[] {
  return findAllCellsInRadius(x, y, radius, worldContext.pack);
}

declare global {
  interface JSON {
    isValid: (str: string) => boolean;
    safeParse: (str: string) => unknown;
  }

  interface Node {
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
  findAll,
  findAllCellsInRadius,
  findAllInQuadtree,
  findCell,
  findClosestCell,
  findGridAll,
  findGridCell,
  findPath,
  formatPrice,
  gauss,
  generateDate,
  generateGrid,
  generateSeed,
  getAdjective,
  getBase64,
  getColors,
  getComposedPath,
  getCoordinates,
  getGappedFillPaths,
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

import type { Grid } from "../types/Grid";
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
  findAll,
  findAllCellsInRadius,
  findAllInQuadtree,
  findCell,
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
import { getComposedPath, getElementById, getElementBySelector, getElementsBySelector, getNextId } from "./nodeUtils";
import {
  connectVertices,
  findPath,
  getGappedFillPaths,
  getIsolines,
  getPolesOfInaccessibility,
  getVertexPath
} from "./pathUtils";
import { getPortAnchorPosition, PORT_ANCHOR_WATER_OFFSET } from "./portAccess";
import { biased, each, gauss, generateSeed, getNumberInRange, P, Pint, ra, rand, rw } from "./probabilityUtils";
import { capitalize, isValidJSON, parseTransform, round, safeParseJSON, sanitizeId, splitInTwo } from "./stringUtils";

import {
  convertTemperature,
  formatAnnualPrecipitation,
  formatCoinage,
  formatPrice,
  getIntegerFromSI,
  precipitationProxyToMillimeters,
  si,
  toCoinage
} from "./unitUtils";
import { createObjectURL, revokeObjectURL } from "./urlUtils";

JSON.isValid = isValidJSON;
JSON.safeParse = safeParseJSON;

export function initUtils(): void {
  // No-op (retained for initialization-order documentation; nothing left to initialize here)
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
  biased,
  C_12,
  calculateVoronoi,
  capitalize,
  clipPoly,
  connectVertices,
  convertTemperature,
  createObjectURL,
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
  findAll,
  findAllCellsInRadius,
  findAllInQuadtree,
  findCell,
  findClosestCell,
  findGridAll,
  findGridCell,
  findPath,
  formatAnnualPrecipitation,
  formatCoinage,
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
  getElementById,
  getElementBySelector,
  getElementsBySelector,
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
  getPortAnchorPosition,
  getRandomColor,
  getSegmentId,
  getTypedArray,
  getVertexPath,
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
  PORT_ANCHOR_WATER_OFFSET,
  parseError,
  parseTransform,
  poissonDiscSampler,
  precipitationProxyToMillimeters,
  ra,
  rand,
  revokeObjectURL,
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
  toCoinage,
  toHEX,
  trimVowels,
  unique,
  wiki
};

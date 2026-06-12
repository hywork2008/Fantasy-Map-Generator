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
import { convertTemperature, getIntegerFromSI, si } from "./unitUtils";

window.rn = rn;
window.lim = lim;
window.minmax = minmax;
window.normalize = normalize;
window.lerp = lerp as typeof window.lerp;

window.vowel = isVowel;
window.trimVowels = trimVowels;
window.getAdjective = getAdjective;
window.nth = nth;
window.abbreviate = abbreviate;
window.list = list;

window.last = last;
window.unique = unique;
window.getTypedArray = getTypedArray;
window.createTypedArray = createTypedArray;
window.INT8_MAX = TYPED_ARRAY_MAX_VALUES.INT8_MAX;
window.UINT8_MAX = TYPED_ARRAY_MAX_VALUES.UINT8_MAX;
window.UINT16_MAX = TYPED_ARRAY_MAX_VALUES.UINT16_MAX;
window.UINT32_MAX = TYPED_ARRAY_MAX_VALUES.UINT32_MAX;

window.rand = rand;
window.P = P;
window.each = each;
window.gauss = gauss;
window.Pint = Pint;
window.ra = ra;
window.rw = rw;
window.biased = biased;
window.getNumberInRange = getNumberInRange;
window.generateSeed = generateSeed;

window.convertTemperature = (temp: number, scale: string = window.temperatureScale?.value || "°C") =>
  convertTemperature(temp, scale as "°C" | "°F");
window.si = si;
window.getInteger = getIntegerFromSI;
window.toHEX = toHEX;
window.getColors = getColors;
window.getRandomColor = getRandomColor;
window.getMixedColor = getMixedColor;
window.C_12 = C_12;

window.ensureEl = ensureEl;
window.getComposedPath = getComposedPath;
window.getNextId = getNextId;

window.rollups = rollups;
window.dist2 = distanceSquared;

window.getIsolines = getIsolines;
window.getPolesOfInaccessibility = getPolesOfInaccessibility;
window.connectVertices = connectVertices;
window.findPath = (start, end, getCost) => findPath(start, end, getCost, window.pack!);
window.getVertexPath = cellsArray => getVertexPath(cellsArray, window.pack!);

window.round = round;
window.capitalize = capitalize;
window.splitInTwo = splitInTwo;
window.parseTransform = parseTransform;
window.sanitizeId = sanitizeId;

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
    terrs?: import("d3").Selection<any, any, any, any>;
  }

  var graphWidth: number;
  var graphHeight: number;
  var seed: string;
}

window.shouldRegenerateGrid = (grid: Grid | null | undefined, expectedSeed: number) =>
  shouldRegenerateGrid(grid, expectedSeed, window.graphWidth, window.graphHeight);
window.generateGrid = () => generateGrid(window.seed, window.graphWidth, window.graphHeight);
window.findGridAll = (x: number, y: number, radius: number) => findGridAll(x, y, radius, window.grid!);
window.findGridCell = (x: number, y: number) => findGridCell(x, y, window.grid!);
window.findCell = (x: number, y: number, radius?: number) => {
  const pack = window.pack;
  if (!pack?.cells?.p) return 0;
  return findClosestCell(x, y, radius, pack) ?? 0;
};
window.findAll = (x: number, y: number, radius: number) => findAllCellsInRadius(x, y, radius, window.pack!);
window.getPackPolygon = (cellIndex: number) => getPackPolygon(cellIndex, window.pack!);
window.getGridPolygon = (cellIndex: number) => getGridPolygon(cellIndex, window.grid!);
window.calculateVoronoi = calculateVoronoi;
window.poissonDiscSampler = poissonDiscSampler;
window.findAllInQuadtree = findAllInQuadtree;
window.drawHeights = drawHeights;
window.isLand = (i: number) => isLand(i, window.pack!);
window.isWater = (i: number) => isWater(i, window.pack!);

window.clipPoly = (points: [number, number][], secure?: number) => clipPoly(points, graphWidth, graphHeight, secure);
window.getSegmentId = getSegmentId;
window.debounce = debounce;
window.throttle = throttle;
window.parseError = parseError;
window.getBase64 = getBase64;
window.openURL = openURL;
window.wiki = wiki;
window.link = link;
window.isCtrlClick = isCtrlClick;
window.generateDate = generateDate;
window.getLongitude = (x: number, decimals?: number) => getLongitude(x, mapCoordinates, graphWidth, decimals);
window.getLatitude = (y: number, decimals?: number) => getLatitude(y, mapCoordinates, graphHeight, decimals);
window.getCoordinates = (x: number, y: number, decimals?: number) =>
  getCoordinates(x, y, mapCoordinates, graphWidth, graphHeight, decimals);

// Initialize prompt when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePrompt);
} else {
  initializePrompt();
}

window.drawCellsValue = (data: unknown[]) => drawCellsValue(data, window.pack!);
window.drawPolygons = (data: number[]) =>
  drawPolygons(
    data,
    window.terrs as unknown as import("d3").Selection<import("d3").BaseType, unknown, HTMLElement, unknown>,
    window.grid!
  );
window.drawRouteConnections = () =>
  drawRouteConnections((window as unknown as { packedGraph: import("../types/PackedGraph").PackedGraph }).packedGraph);
window.drawPoint = drawPoint;
window.drawPath = drawPath;

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

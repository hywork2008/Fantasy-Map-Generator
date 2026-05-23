/**
 * FMG Global Context Type Definition
 * All shared utilities and functions are organized under window.fmg namespace
 */

import type { Cells, Grid, Point, Vertices } from "./Grid";
import type { PackedGraph } from "./PackedGraph";

type Isoline = {
  polygons?: [number, number][][];
  fill?: string;
  halo?: string;
  waterGap?: string;
};

type RollupResult<R> = Array<[unknown, R | RollupResult<R>]>;

export interface FmgGlobalContext {
  // ==================== Number Utils ====================
  rn: (min: number, max: number) => number;
  lim: (value: number, min: number, max: number) => number;
  minmax: (value: number, min: number, max: number) => number;
  normalize: (val: number, min: number, max: number) => number;
  lerp: (start: number, end: number, t: number) => number;

  // ==================== Language Utils ====================
  vowel: (char: string) => boolean;
  trimVowels: (str: string) => string;
  getAdjective: (name: string) => string;
  nth: (n: number) => string;
  abbreviate: (str: string) => string;
  list: (arr: string[], joiner?: string, finisher?: string) => string;

  // ==================== Array Utils ====================
  last: <T>(arr: T[]) => T;
  unique: <T>(arr: T[]) => T[];
  getTypedArray: (maxValue: number) => typeof Uint8Array | typeof Uint16Array | typeof Uint32Array;
  createTypedArray: (options: { maxValue: number; length: number; from?: ArrayLike<number> }) => 
    Uint8Array | Uint16Array | Uint32Array;
  INT8_MAX: number;
  UINT8_MAX: number;
  UINT16_MAX: number;
  UINT32_MAX: number;

  // ==================== Probability Utils ====================
  rand: (min?: number, max?: number) => number;
  P: (probability: number) => boolean;
  each: (n: number) => (i: number) => boolean;
  gauss: (mean?: number, stdDev?: number) => number;
  Pint: (float: number) => number;
  ra: <T>(arr: T[]) => T;
  rw: (object: { [key: string]: number }) => string;
  biased: (min: number, max: number, ex: number) => number;
  getNumberInRange: (r: string) => number;
  generateSeed: () => string;

  // ==================== Unit Utils ====================
  convertTemperature: (temp: number, scale?: string) => string;
  si: (value: number) => string;
  getInteger: (str: string) => number;

  // ==================== Color Utils ====================
  toHEX: (rgba: string) => string;
  getColors: (count: number) => string[];
  getRandomColor: () => string;
  getMixedColor: (colorToMix: string, mix?: number, bright?: number) => string;
  C_12: string[];

  // ==================== DOM Utils ====================
  ensureEl: <T extends HTMLElement | null = HTMLElement | null>(id: string) => T;
  getComposedPath: (event: Node | Window | ShadowRoot | Document) => Array<Node | Window>;
  getNextId: (prefix: string) => string;

  // ==================== Function Utils ====================
  rollups: <T, R>(
    values: T[],
    reduce: (values: T[]) => R,
    ...keys: ((value: T, index: number, array: T[]) => unknown)[]
  ) => RollupResult<R>;
  dist2: ([x1, y1]: [number, number], [x2, y2]: [number, number]) => number;

  // ==================== Path Utils ====================
  getIsolines: (
    graph: Pick<PackedGraph, "cells" | "vertices" | "features">,
    getType: (cellId: number) => string | number,
    options?: {
      polygons?: boolean;
      fill?: boolean;
      halo?: boolean;
      waterGap?: boolean;
    }
  ) => Record<string | number, Isoline>;
  getPolesOfInaccessibility: (
    graph: Pick<PackedGraph, "cells" | "vertices" | "features">,
    getType: (cellId: number) => string | number
  ) => Record<string | number, [number, number]>;
  connectVertices: (options: {
    vertices: Vertices;
    startingVertex: number;
    ofSameType: (cellId: number) => boolean;
    addToChecked?: (cellId: number) => void;
    closeRing?: boolean;
  }) => number[];
  findPath: (
    start: number,
    isExit: (id: number) => boolean,
    getCost: (current: number, next: number) => number,
    packedGraph?: Pick<PackedGraph, "cells">
  ) => number[] | null;
  getVertexPath: (cellsArray: number[], packedGraph?: Pick<PackedGraph, "cells" | "vertices" | "features">) => string;

  // ==================== String Utils ====================
  round: (inputString?: string, decimals?: number) => string;
  capitalize: (str: string) => string;
  splitInTwo: (str: string) => string[];
  parseTransform: (str: string) => [number, number, number, number, number, number];
  sanitizeId: (str: string) => string;

  // ==================== Graph Utils ====================
  shouldRegenerateGrid: (grid: Grid, expectedSeed: number) => boolean;
  generateGrid: () => Grid;
  findGridAll: (x: number, y: number, radius: number) => number[];
  findGridCell: (x: number, y: number) => number;
  findCell: (x: number, y: number, radius?: number) => number | undefined;
  findAll: (x: number, y: number, radius: number) => number[];
  getPackPolygon: (cellIndex: number) => number[][];
  getGridPolygon: (cellIndex: number) => number[][];
  calculateVoronoi: (points: Point[], boundary: Point[]) => { cells: Cells; vertices: Vertices };
  poissonDiscSampler: (x0: number, y0: number, x1: number, y1: number, r: number, k?: number) => Generator<[number, number], void, unknown>;
}

declare global {
  interface Window {
    fmg?: FmgGlobalContext;
  }
}

export {};

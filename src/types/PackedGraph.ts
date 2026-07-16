import type { Quadtree } from "d3";

import type {
  Burg,
  Culture,
  FrontierFort,
  IceElement,
  Marker,
  Monster,
  PackedGraphFeature,
  Province,
  Religion,
  River,
  Route,
  State,
  Zone
} from "./models";

export type TypedArray = Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Float32Array | Float64Array;

export interface PackedGraphCells {
  i: TypedArray; // cell indices
  c: number[][]; // neighboring cells
  v: number[][]; // neighboring vertices
  p: [number, number][]; // cell polygon points
  b: TypedArray; // cell is on border
  h: TypedArray; // cell heights
  q: Quadtree<[number, number, number]>; // cell quadtree index
  /** Terrain type */
  t: TypedArray; // cell terrain types
  r: TypedArray; // river id passing through cell
  f: TypedArray; // feature id occupying cell
  fl: TypedArray; // flux presence in cell
  s: TypedArray; // cell suitability
  pop: TypedArray; // cell population
  conf: TypedArray; // cell water confidence
  haven: TypedArray; // cell is a haven
  g: TypedArray; // cell ground type
  culture: TypedArray; // cell culture id
  biome: TypedArray; // cell biome id
  harbor: TypedArray; // cell harbour presence
  /** Water cell enclosure score, 0 (open ocean) - 100 (fully landlocked); 0 for land cells. Debug-only. */
  enclosure: TypedArray;
  burg: TypedArray; // cell burg id
  religion: TypedArray; // cell religion id
  state: TypedArray; // cell state id
  area: TypedArray; // cell area
  province: TypedArray; // cell province id
  routes: Record<number, Record<number, number>>;
  danger: TypedArray; // cell threat/danger level
  capacity: TypedArray; // cell population carrying capacity
  children: TypedArray; // cell children pop
  maleAdults: TypedArray; // cell male adults pop
  femaleAdults: TypedArray; // cell female adults pop
  elders: TypedArray; // cell elders pop
}

export interface PackedGraphVertices {
  i: TypedArray; // vertex indices
  c: [number, number, number][]; // neighboring cells
  v: number[][]; // neighboring vertices
  x: TypedArray; // x coordinates
  y: TypedArray; // y coordinates
  p: [number, number][]; // vertex points
}

export interface PackedGraph {
  cells: PackedGraphCells;
  vertices: PackedGraphVertices;
  rivers: River[];
  features: PackedGraphFeature[];
  burgs: Burg[];
  states: State[];
  cultures: Culture[];
  routes: Route[];
  religions: Religion[];
  zones: Zone[];
  markers: Marker[];
  frontierForts: FrontierFort[];
  ice: IceElement[];
  provinces: Province[];
  monsters: Monster[];
}

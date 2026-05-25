import type { Quadtree } from "d3";
import type { Burg } from "@fmg/burgs";
import type { Culture } from "@fmg/core/modules/cultures-generator";
import type { PackedGraphFeature } from "@fmg/core/modules/features";
import type { Religion } from "@fmg/core/modules/religions-generator";
import type { Province } from "@fmg/states";
import type { River } from "@fmg/rivers";
import type { Route } from "@fmg/core/modules/routes-generator";
import type { State } from "@fmg/states";
import type { Zone } from "@fmg/core/modules/zones-generator";

type ReligionData = Religion & {
  origin?: number;
};

type MarkerData = {
  i: number;
  type: string;
  icon: string;
  x?: number;
  y?: number;
  cell: number;
  lock?: boolean;
  pinned?: boolean;
  size?: number;
  fill?: string;
  stroke?: string;
};

type IceData = {
  i: number;
  points: [number, number][] | string;
  type: "glacier" | "iceberg";
  cellId?: number;
  size?: number;
  offset?: [number, number];
};

export type TypedArray = Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Float32Array | Float64Array;

export interface PackedGraph {
  cells: {
    i: number[]; // cell indices
    c: number[][]; // neighboring cells
    v: number[][]; // neighboring vertices
    p: [number, number][]; // cell polygon points
    b: boolean[]; // cell is on border
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
    g: number[]; // cell ground type
    culture: TypedArray; // cell culture id
    biome: TypedArray; // cell biome id
    harbor: TypedArray; // cell harbour presence
    burg: TypedArray; // cell burg id
    religion: TypedArray; // cell religion id
    state: TypedArray; // cell state id
    area: TypedArray; // cell area
    province: TypedArray; // cell province id
    routes: Record<number, Record<number, number>>;
  };
  vertices: {
    i: number[]; // vertex indices
    c: [number, number, number][]; // neighboring cells
    v: number[][]; // neighboring vertices
    x: number[]; // x coordinates
    y: number[]; // y coordinates
    p: [number, number][]; // vertex points
  };
  rivers: River[];
  features: PackedGraphFeature[];
  burgs: Burg[];
  states: State[];
  cultures: Culture[];
  routes: Route[];
  religions: ReligionData[];
  zones: Zone[];
  markers: MarkerData[];
  ice: IceData[];
  provinces: Province[];
}

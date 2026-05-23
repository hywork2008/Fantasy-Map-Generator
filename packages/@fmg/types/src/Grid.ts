/**
 * Grid - Voronoi diagram spatial structure
 * Used for spatial indexing and geometric calculations
 */

import type { PackedGraph } from "./PackedGraph";
import type { Quadtree } from "d3";
import type { GridFeature } from "@fmg/core/modules/features";

/**
 * A point in 2D space - represented as a tuple [x, y]
 */
export type Point = [number, number];

/**
 * Voronoi cells structure
 * Note: This is the raw Voronoi structure, different from PackedGraph.cells
 */
export interface Cells {
  i: Uint32Array; // cell indices
  c: number[][]; // adjacent cell indices
  v: number[][]; // vertex indices
  b: Uint8Array | number[]; // border flag
  // Generated/optional properties added during generation pipeline
  h?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // heights (added by heightmap generator)
  t?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // terrain type (added by terrain generator)
  temp?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // temporary data for algorithm intermediate values
  r?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // rivers
  fl?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // flux
  s?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // state (political)
  conf?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // conflict/control markers
  culture?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // culture assignment
  biome?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // biome type
  pop?: Uint16Array | Uint32Array; // population
  haven?: Uint8Array | Uint16Array; // harbor quality
  religion?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // religion
  province?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // province
  g?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // group/temp assignment
  harbor?: Int8Array | Uint8Array | Int16Array | Uint16Array; // harbor flag
  burg?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // burg ID
  f?: Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array; // feature id
  q?: Quadtree<[number, number, number]>; // quadtree for spatial queries
  routes?: Record<number, Record<number, number>>; // trade route data
  prec?: number[] | Uint8Array | Uint16Array | Uint32Array; // predecessor chain used by route tracing tools
}

/**
 * Voronoi vertices structure
 * Note: This is the raw Voronoi structure, different from PackedGraph.vertices
 */
export interface Vertices {
  p: [number, number][]; // vertex positions [x, y]
  v: number[][]; // adjacent vertex indices
  c: number[][]; // adjacent cells (3 per vertex in Voronoi diagram)
  // Optional properties added later in processing pipeline
  i?: number[]; // vertex indices (optional)
  x?: number[]; // x coordinates (optional, computed from p when needed)
  y?: number[]; // y coordinates (optional, computed from p when needed)
}

/**
 * Voronoi grid - pure spatial structure
 * Contains cells and vertices generated from Delaunay triangulation
 */
export interface Grid {
  // Spatial parameters
  spacing: number; // Distance between grid points
  cellsX: number; // Number of cells in X direction
  cellsY: number; // Number of cells in Y direction
  cellsDesired: number; // Target number of Voronoi cells

  // Voronoi structure (raw Voronoi diagram)
  cells: Cells;
  vertices: Vertices;
  features?: Array<PackedGraph["features"][number] | GridFeature | number>;

  // Grid points
  points: Point[]; // Jittered grid points used to generate Voronoi
  boundary?: Point[]; // Boundary points for diagram edge calculation

  // Metadata
  seed?: string | number; // Random seed used for generation
}

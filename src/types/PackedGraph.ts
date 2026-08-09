import type { Quadtree } from "d3";

import type {
  Burg,
  Culture,
  Dungeon,
  FrontierFort,
  IceElement,
  Marker,
  Monster,
  PackedGraphFeature,
  Province,
  Race,
  Religion,
  River,
  Route,
  State,
  Zone
} from "./models";
import type { SettlementFoundationPlan } from "./settlementFoundation";

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
  /**
   * Cell biome code (catalog-local index). Read meaning via BiomesData.keys /
   * definitions — never compare codes by numeric range.
   */
  biomeCode: TypedArray;
  /**
   * Coastal habitat attribute (land coast cells). Catalog-local code; see
   * `CoastalHabitatKey` / coastalHabitatCatalog. Does not replace biome.
   */
  coastalHabitat: TypedArray;
  /**
   * Nearshore habitat attribute (shallow water cells). Catalog-local code; see
   * `NearshoreHabitatKey` / coastalHabitatCatalog.
   */
  nearshoreHabitat: TypedArray;
  /**
   * Optional attribute layers (Phase 4). Climate biome stays separate.
   * `forestCover` is the cell's potential forest capacity (0..1); the live
   * amount of standing timber is exposed as simulation-owned `forestStock`.
   * Other columns use catalog-local codes from biomeAttributes types.
   */
  forestCover?: Float32Array;
  /**
   * Live standing forest stock, 0..forestCover. The array is owned by
   * SimulationContext and exposed here only as a compatibility adapter.
   */
  forestStock?: Float32Array;
  forestCondition?: TypedArray;
  canopy?: TypedArray;
  landCover?: TypedArray;
  specialFeature?: TypedArray;
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
  /**
   * Wild land class for unclaimed land (Phase 3 oikoumene).
   * 0 none (ocean/governed), 1 claimable_frontier, 2 wild_margin, 3 monster_domain.
   * See `src/generators/wildLandTags.ts`.
   */
  wildLand?: TypedArray;
  capacity: TypedArray; // cell population carrying capacity
  /** Food-derived rural capacity; lower than `capacity` where subsistence is sparse. */
  subsistenceCapacity?: Float32Array;
  /** Dominant livelihood code from `subsistenceCapacity.ts`; 0 means no stable local subsistence. */
  livelihood?: Uint8Array;
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
  /**
   * Species / folk table. Culture.race and Character.race index into this array.
   * Absent only on legacy maps until load migration seeds the default catalog.
   */
  races?: Race[];
  routes: Route[];
  religions: Religion[];
  zones: Zone[];
  markers: Marker[];
  frontierForts: FrontierFort[];
  ice: IceElement[];
  provinces: Province[];
  monsters: Monster[];
  /**
   * High Fantasy dungeon sites (fixed boss + treasure). Absent/empty on
   * non-fantasy maps. Spec: docs/plan/high-fantasy-dungeons.md
   */
  dungeons?: Dungeon[];
  /**
   * Pre-polity human geography. Absent on legacy and `standard` maps, where
   * the historical all-suitable-cell placement remains the compatibility
   * adapter.
   */
  settlementFoundation?: SettlementFoundationPlan;
}

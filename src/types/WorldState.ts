import type { PackedGraph } from "../types/PackedGraph";
import type { BiomeCode, BiomeDefinition, BiomeKey, BiomeTag } from "./biome";
import type { BiomeRegionProfile } from "./biomeRegion";
import type { Grid } from "./Grid";
import type { BurgGroup, MilitaryUnit, NameBase, SeaRouteGenerationMode } from "./models";

export interface WorldNote {
  id: string;
  name: string;
  legend: string;
}

/** Controls whether Advance Time may autonomously initiate or advance interstate conflict. */
export type ConflictAutonomy = "autonomous" | "playerDirected";

/**
 * Controls how much habitable land is populated at map generation. The Phase 0
 * default deliberately preserves the pre-frontier world distribution.
 */
export type InitialSettlementPattern = "frontier" | "scattered" | "standard" | "dense";

/**
 * Runtime biome table. Semantic identity is `keys` / `definitionsByKey`;
 * parallel arrays are derived views for dense indexing (code = array index).
 * Do not treat bare numeric codes as stable ids outside a catalog snapshot.
 */
export interface BiomesData {
  /** Catalog schema version for snapshots */
  version?: number;
  /** BiomeKey per code index — source of semantic identity */
  keys: BiomeKey[];
  /** Tags per code index */
  tags: BiomeTag[][];
  definitionsByKey?: Readonly<Record<string, BiomeDefinition>>;
  codesByKey?: Readonly<Record<string, BiomeCode>>;
  i: number[];
  name: string[];
  color: string[];
  biomesMatrix: Uint8Array[];
  habitability: number[];
  iconsDensity: number[];
  icons: string[][];
  cost: number[];
  /** Runtime statistics populated by the Biomes Editor */
  cells?: number[];
  area?: number[];
  rural?: number[];
  urban?: number[];
}

export interface WorldOptions {
  pinNotes: boolean;
  winds: [number, number, number, number, number, number];
  temperatureEquator: number;
  temperatureNorthPole: number;
  temperatureSouthPole: number;
  stateLabelsMode: "auto" | "short" | "full";
  showBurgPreview: boolean;
  burgs: { groups: BurgGroup[] };
  /** Set by military generator on first use; undefined before first map generation */
  military?: MilitaryUnit[];
  /**
   * Generation starting calendar year (Options → Generation).
   * Live in-session date is `simulationContext.currentYear` only — not mirrored here.
   */
  year?: number;
  /**
   * Legacy calendar month seed for map load / initSimulationClock only.
   * Live month is `simulationContext.currentMonth`.
   */
  month?: number;
  /**
   * Legacy calendar day seed for map load / initSimulationClock only.
   * Live day is `simulationContext.currentDay`.
   */
  day?: number;
  /** In-world era name; set during map generation (also seeded into SimulationContext) */
  era?: string;
  /** Abbreviated era name; derived from era */
  eraShort?: string;
  /** Whether gunpowder-era military units and goods are available. Undefined preserves legacy maps' enabled behavior. */
  gunpowderEraEnabled?: boolean;
  /**
   * Persisted generation distribution policy. Archives created before frontier
   * expansion normalize this to "standard" during archive migration.
   */
  initialSettlementPattern: InitialSettlementPattern;
  /**
   * Biome regional profile: adjusts auto-assignment rates and continuous masks
   * (great forests, heath mosaics, mediterranean scrub, etc.). Default global.
   */
  biomeRegionProfile?: BiomeRegionProfile;
  /**
   * Sea-route topology selected for this map. Persisted so loading a saved map
   * does not replace a user-selected legacy network with the augmented one.
   */
  seaRouteGenerationMode?: SeaRouteGenerationMode;
  /**
   * Map-level interstate-conflict policy. Undefined is interpreted as "autonomous" for old maps.
   * This lives with the saved world rather than in UI preferences so reloading a map preserves its simulation rules.
   */
  conflictAutonomy?: ConflictAutonomy;
}

/** Top-level world state. All generators and renderers operate on this object. */
export interface WorldState {
  pack: PackedGraph;
  grid: Grid;
  seed: string;
  options: WorldOptions;
  nameBases: NameBase[];
  biomesData: BiomesData;
  notes: WorldNote[];
}

import type { NameBase } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import type { BiomesData, MapStyle, WorldNote, WorldOptions } from "../types/WorldState";
import type { Grid } from "../utils/graphUtils";

export type MapCoordinates = {
  latT?: number;
  latN?: number;
  latS?: number;
  lonT?: number;
  lonW?: number;
  lonE?: number;
};

export type MapHistoryEntry = { seed: string; width: number; height: number; template: string; created: number };

export interface WorldContext {
  pack: PackedGraph;
  grid: Grid;
  seed: string;
  mapId: number;
  mapHistory: MapHistoryEntry[];
  notes: WorldNote[];
  options: WorldOptions;
  biomesData: BiomesData;
  nameBases: NameBase[];
  style: MapStyle & { burgLabels: object; burgIcons: object; anchors: object };
  /** Logical map coordinate space width — equivalent to options.mapWidth, constant per map */
  graphWidth: number;
  /** Logical map coordinate space height — equivalent to options.mapHeight, constant per map */
  graphHeight: number;
  mapCoordinates: MapCoordinates;
  /** Urbanization rate read from the UI input at map load */
  urbanization: number;
  /** Urban density read from the UI input at map load */
  urbanDensity: number;
  /** Population per cell read from the UI input at map load */
  populationRate: number;
  /** Distance scale factor read from the UI input at map load */
  distanceScale: number;
}

/**
 * Single mutable container for all world-level data.
 * Populated by src/main.ts before any renderer or controller runs.
 * TypeScript source code should import from here rather than reading window.pack etc.
 * Legacy generators in src/modules/ still use the bare globals for now.
 */
export const worldContext: WorldContext = {
  pack: {} as PackedGraph,
  grid: {} as Grid,
  seed: "",
  mapId: 0,
  mapHistory: [],
  notes: [],
  options: {} as WorldOptions,
  biomesData: {} as BiomesData,
  nameBases: [],
  style: { burgLabels: {}, burgIcons: {}, anchors: {} } as WorldContext["style"],
  graphWidth: 0,
  graphHeight: 0,
  mapCoordinates: {},
  urbanization: 1,
  urbanDensity: 10,
  populationRate: 1,
  distanceScale: 1
};

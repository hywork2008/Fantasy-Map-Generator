import type { Selection } from "d3";
import type { NameBase } from "../modules/names-generator";
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
  graphWidth: number;
  graphHeight: number;
  svgWidth: number;
  svgHeight: number;
  mapCoordinates: MapCoordinates;
  /** Urbanization rate read from the UI input at map load */
  urbanization: number;
  /** Population per cell read from the UI input at map load */
  populationRate: number;
  /** Distance scale factor read from the UI input at map load */
  distanceScale: number;
  /** Shared d3 line generator (curveBasis) used by controllers and editors */
  lineGen: (points: [number, number][]) => string;
  /** COA (coat-of-arms) renderer module, set when emblem module loads */
  COArenderer: { trigger(id: string, coa: unknown): unknown; shieldPaths: Record<string, string> } | null;
  /** Zoom scale level (1 = no zoom) */
  scale: number;
  /** Current editor customization mode (0 = default, 1 = heightmap edit, etc.) */
  customization: number;
  /** Lazy d3.Selection for fogging layer — available after SVG init */
  fogging: Selection<SVGGElement, unknown, null, undefined> | null;
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
  svgWidth: 0,
  svgHeight: 0,
  mapCoordinates: {},
  urbanization: 1,
  populationRate: 1,
  distanceScale: 1,
  lineGen: () => "",
  COArenderer: null,
  scale: 1,
  customization: 0,
  fogging: null
};

import type { Grid } from "../utils/graphUtils";
import type { BurgGroup, MilitaryUnit, NameBase } from "./models";
import type { PackedGraph } from "./PackedGraph";

export interface WorldNote {
  id: string;
  name: string;
  legend: string;
}

export interface MapStyle {
  burgLabels: Record<string, Record<string, string>>;
  burgIcons: Record<string, Record<string, string>>;
  anchors: Record<string, Record<string, string>>;
  [key: string]: unknown;
}

export interface BiomesData {
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
  /** In-world calendar year; set during map generation */
  year?: number;
  /** In-world era name; set during map generation */
  era?: string;
  /** Abbreviated era name; derived from era */
  eraShort?: string;
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
  style: MapStyle;
}

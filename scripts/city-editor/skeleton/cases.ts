// Standalone cases shared by the S0 baseline and the S1 skeleton lab, so both
// measure the same towns. Skeleton-first v1 scope: single wall, coast, ≤2 rivers,
// no castle / moat / double wall.
import { makeRng } from "../../../src/city-editor/generators/prng";
import { randomSiteConfig } from "../../../src/city-editor/generators/site/siteConfig";
import type { GenerationSettings } from "../../../src/city-editor/types/generation";

type Size = "micro" | "tiny" | "small";
type Grid = "hex" | "voronoi" | "evolution";
export interface Case {
  name: string;
  size: Size;
  grid: Grid;
  apply: (settings: GenerationSettings, seed: string) => void;
}

export const MESH_SEED = "ce-s0-20261014-mesh";
export const SEED_PREFIX = "ce-s0-20261014";

const noRiver: Case["apply"] = s => {
  s.config.rivers = [];
};
const twoRivers: Case["apply"] = s => {
  s.config.rivers = ["meander", "meander"];
};
const bay: Case["apply"] = s => {
  s.config.coast = "bay";
  s.config.rivers = ["toCoast"];
  s.config.features.port = true;
};
const cape: Case["apply"] = s => {
  s.config.coast = "cape";
  s.config.rivers = ["toCoast", "meander"];
  s.config.features.port = true;
};
const random: Case["apply"] = (s, seed) => {
  s.config = randomSiteConfig(makeRng(`${seed}:site`));
  // Skeleton-first v1 excludes castles (§6); keep the baseline to the same scope.
  s.config.features.citadel = false;
};

export const CASES: Case[] = [
  { name: "small-voronoi-default", size: "small", grid: "voronoi", apply: () => {} },
  { name: "small-voronoi-no-river", size: "small", grid: "voronoi", apply: noRiver },
  { name: "small-voronoi-two-rivers", size: "small", grid: "voronoi", apply: twoRivers },
  { name: "small-voronoi-bay", size: "small", grid: "voronoi", apply: bay },
  { name: "small-voronoi-cape", size: "small", grid: "voronoi", apply: cape },
  { name: "small-voronoi-random", size: "small", grid: "voronoi", apply: random },
  { name: "tiny-evolution-default", size: "tiny", grid: "evolution", apply: () => {} },
  { name: "tiny-evolution-no-river", size: "tiny", grid: "evolution", apply: noRiver },
  { name: "tiny-evolution-two-rivers", size: "tiny", grid: "evolution", apply: twoRivers },
  { name: "tiny-evolution-bay", size: "tiny", grid: "evolution", apply: bay },
  { name: "tiny-evolution-cape", size: "tiny", grid: "evolution", apply: cape },
  { name: "tiny-evolution-random", size: "tiny", grid: "evolution", apply: random }
];


import type { BiomeKind, RegionTheme } from "../../core/types";

export interface ForestCanopyColors {
  deciduous: string;
  coniferous: string;
  tropical: string;
  shadow: string;
  highlight: string;
  stroke: string;
}

export interface ThemeColors {
  background: string;
  ocean: string;
  oceanShallow: string;
  coastlineStroke: string;
  riverFill: string;
  riverStroke: string;
  roadStroke: string;
  highwayStroke: string;
  bridgeDeck: string;
  bridgeRail: string;
  borderStroke: string;
  textPrimary: string;
  textSecondary: string;
  textWater: string;
  mountainFill: string;
  mountainHighlight: string;
  mountainStroke: string;
  hillFill: string;
  treeFill: string;
  treeStroke: string;
  settlementFill: string;
  settlementStroke: string;
  landmarkFill: string;
  contourStroke: string;
  contourIndexStroke: string;
  forestCanopy: ForestCanopyColors;
  biomes: Record<BiomeKind, string>;
}

export const THEMES: Record<RegionTheme, ThemeColors> = {
  schley: {
    background: "#d5cfbf",
    ocean: "#456d7f",
    oceanShallow: "#527f8b",
    coastlineStroke: "#2b4652",
    riverFill: "#456d7f",
    riverStroke: "#233943",
    roadStroke: "#8a5836",
    highwayStroke: "#5d351b",
    bridgeDeck: "#dcd4c7",
    bridgeRail: "#4a3525",
    borderStroke: "#3a2818",
    textPrimary: "#2b1a0d",
    textSecondary: "#4a3b30",
    textWater: "#e6f0f5",
    mountainFill: "#8a7d6e",
    mountainHighlight: "#e5ded4",
    mountainStroke: "#3d3228",
    hillFill: "#b4a68c",
    treeFill: "#3a633f",
    treeStroke: "#1f3822",
    settlementFill: "#b3382c",
    settlementStroke: "#301511",
    landmarkFill: "#6d3278",
    contourStroke: "#8c7255",
    contourIndexStroke: "#5a4430",
    forestCanopy: {
      deciduous: "#3b6832",
      coniferous: "#264f3a",
      tropical: "#2e6f36",
      shadow: "#162e14",
      highlight: "#5f9450",
      stroke: "#1a3617"
    },
    biomes: {
      ocean: "#456d7f",
      grassland: "#d2dab2",
      deciduous_forest: "#c2d4ac",
      coniferous_forest: "#b5c4a7",
      tropical_forest: "#b9cca0",
      savanna: "#ded8aa",
      woodland_scrub: "#cfd5a4",
      hills: "#cfcaa8",
      mountains: "#b5a897",
      snow_mountains: "#d8e5e8",
      glacier: "#d8e5e8",
      swamp: "#b4c5a5",
      marsh: "#adbe9e",
      desert: "#e8ddba",
      tundra: "#c9beaa",
      badlands: "#ded8aa"
    }
  },

  perilous: {
    background: "#fdfbf7",
    ocean: "#eef2f5",
    oceanShallow: "#eef2f5",
    coastlineStroke: "#1a1a1a",
    riverFill: "#eef2f5",
    riverStroke: "#1a1a1a",
    roadStroke: "#444444",
    highwayStroke: "#111111",
    bridgeDeck: "#ffffff",
    bridgeRail: "#000000",
    borderStroke: "#111111",
    textPrimary: "#111111",
    textSecondary: "#333333",
    textWater: "#555555",
    mountainFill: "#ffffff",
    mountainHighlight: "#ffffff",
    mountainStroke: "#111111",
    hillFill: "#ffffff",
    treeFill: "#ffffff",
    treeStroke: "#111111",
    settlementFill: "#111111",
    settlementStroke: "#111111",
    landmarkFill: "#333333",
    contourStroke: "#888888",
    contourIndexStroke: "#333333",
    forestCanopy: {
      deciduous: "#c6d3be",
      coniferous: "#b3c4ac",
      tropical: "#bdd0b6",
      shadow: "#748a6d",
      highlight: "#dbe8d3",
      stroke: "#4a5944"
    },
    biomes: {
      ocean: "#eef2f5",
      grassland: "#fdfbf7",
      deciduous_forest: "#e8ede4",
      coniferous_forest: "#e2e8dd",
      tropical_forest: "#dce3d5",
      savanna: "#faf8f2",
      woodland_scrub: "#f2f2ea",
      hills: "#f5f3ec",
      mountains: "#ebe7df",
      snow_mountains: "#f7f7f7",
      glacier: "#ffffff",
      swamp: "#e6e8e2",
      marsh: "#e6e8e2",
      desert: "#fcf8ea",
      tundra: "#f0f2f0",
      badlands: "#eeebe6"
    }
  },

  parchment: {
    background: "#e8d8b8",
    ocean: "#d2c09c",
    oceanShallow: "#d8c7a6",
    coastlineStroke: "#523f29",
    riverFill: "#cfbd99",
    riverStroke: "#5c4832",
    roadStroke: "#6e4a2e",
    highwayStroke: "#4d301b",
    bridgeDeck: "#ded0b3",
    bridgeRail: "#422e1b",
    borderStroke: "#3b2614",
    textPrimary: "#2d1b0d",
    textSecondary: "#453223",
    textWater: "#423b32",
    mountainFill: "#a89478",
    mountainHighlight: "#ded0b6",
    mountainStroke: "#3d2a1a",
    hillFill: "#c4b397",
    treeFill: "#736b48",
    treeStroke: "#38311a",
    settlementFill: "#8a3324",
    settlementStroke: "#2b140f",
    landmarkFill: "#59365c",
    contourStroke: "#9c8160",
    contourIndexStroke: "#624930",
    forestCanopy: {
      deciduous: "#686e42",
      coniferous: "#515c3c",
      tropical: "#596c3d",
      shadow: "#363a1e",
      highlight: "#8b945c",
      stroke: "#33381a"
    },
    biomes: {
      ocean: "#d2c09c",
      grassland: "#ded2ad",
      deciduous_forest: "#beb88d",
      coniferous_forest: "#b3ae83",
      tropical_forest: "#9f996d",
      savanna: "#d8cca0",
      woodland_scrub: "#cbc796",
      hills: "#cfbf9e",
      mountains: "#bcae90",
      snow_mountains: "#d6cfbc",
      glacier: "#ddd5c5",
      swamp: "#a8a17d",
      marsh: "#b4ad89",
      desert: "#dfcca3",
      tundra: "#cdc5af",
      badlands: "#bda88a"
    }
  },

  monochrome: {
    background: "#ffffff",
    ocean: "#f2f2f2",
    oceanShallow: "#f2f2f2",
    coastlineStroke: "#000000",
    riverFill: "#f2f2f2",
    riverStroke: "#000000",
    roadStroke: "#333333",
    highwayStroke: "#000000",
    bridgeDeck: "#ffffff",
    bridgeRail: "#000000",
    borderStroke: "#000000",
    textPrimary: "#000000",
    textSecondary: "#333333",
    textWater: "#444444",
    mountainFill: "#ffffff",
    mountainHighlight: "#ffffff",
    mountainStroke: "#000000",
    hillFill: "#ffffff",
    treeFill: "#ffffff",
    treeStroke: "#000000",
    settlementFill: "#000000",
    settlementStroke: "#000000",
    landmarkFill: "#000000",
    contourStroke: "#888888",
    contourIndexStroke: "#333333",
    forestCanopy: {
      deciduous: "#cccccc",
      coniferous: "#bbbbbb",
      tropical: "#c4c4c4",
      shadow: "#666666",
      highlight: "#e5e5e5",
      stroke: "#555555"
    },
    biomes: {
      ocean: "#f4f4f4",
      grassland: "#ffffff",
      deciduous_forest: "#f8f8f8",
      coniferous_forest: "#f5f5f5",
      tropical_forest: "#f0f0f0",
      savanna: "#fafafa",
      woodland_scrub: "#f4f4f4",
      hills: "#fafafa",
      mountains: "#eeeeee",
      snow_mountains: "#ffffff",
      glacier: "#ffffff",
      swamp: "#f4f4f4",
      marsh: "#f4f4f4",
      desert: "#fdfdfd",
      tundra: "#f7f7f7",
      badlands: "#ebebeb"
    }
  }
};

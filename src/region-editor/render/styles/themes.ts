import type { BiomeKind, IllustratedPalette, RegionDecoration, RegionTheme } from "../../core/types";

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
      badlands: "#ded8aa",
      volcanic_rock: "#6e6259",
      volcanic_soil: "#8a7563"
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
      badlands: "#eeebe6",
      volcanic_rock: "#d6d1cb",
      volcanic_soil: "#e2ddd6"
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
      badlands: "#bda88a",
      volcanic_rock: "#5e5249",
      volcanic_soil: "#7a6553"
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
      badlands: "#ebebeb",
      volcanic_rock: "#cfcfcf",
      volcanic_soil: "#dddddd"
    }
  },

  /** 斜め上から見た山・森を描く絵地図（Schley の Sword Coast / Watabou Perilous Shores 風） */
  illustrated: {
    background: "#e7d6ad",
    ocean: "#9fb3b0",
    oceanShallow: "#b6c5bd",
    coastlineStroke: "#4b3f2e",
    riverFill: "#8ea6a6",
    riverStroke: "#3e4a46",
    roadStroke: "#8a6440",
    highwayStroke: "#5b3c20",
    bridgeDeck: "#e4d6b6",
    bridgeRail: "#4a3525",
    borderStroke: "#3a2a1a",
    textPrimary: "#2e2014",
    textSecondary: "#4c3b2a",
    textWater: "#f1ede2",
    mountainFill: "#8b8794",
    mountainHighlight: "#dcd6cc",
    mountainStroke: "#3a3230",
    hillFill: "#d4c193",
    treeFill: "#6b7440",
    treeStroke: "#2f3418",
    settlementFill: "#8a3324",
    settlementStroke: "#2b140f",
    landmarkFill: "#59365c",
    contourStroke: "#a8916a",
    contourIndexStroke: "#6e5838",
    forestCanopy: {
      deciduous: "#6f7a3f",
      coniferous: "#4f5f37",
      tropical: "#5f7a38",
      shadow: "#2c3317",
      highlight: "#a3ad68",
      stroke: "#262b12"
    },
    biomes: {
      ocean: "#9fb3b0",
      grassland: "#e2d1a2",
      deciduous_forest: "#c9c08c",
      coniferous_forest: "#bdb88a",
      tropical_forest: "#b9b67e",
      savanna: "#e6d29c",
      woodland_scrub: "#d6cb96",
      hills: "#ddc999",
      mountains: "#d2c5a6",
      snow_mountains: "#e2dfd6",
      glacier: "#eceae4",
      swamp: "#b5b483",
      marsh: "#bdbb8c",
      desert: "#ecdcae",
      tundra: "#d8cfb6",
      badlands: "#d6b98c",
      volcanic_rock: "#6a5d55",
      volcanic_soil: "#8a7563"
    }
  }
};

type ThemeOverride = Partial<Omit<ThemeColors, "forestCanopy" | "biomes">> & {
  forestCanopy?: Partial<ForestCanopyColors>;
  biomes?: Partial<Record<BiomeKind, string>>;
};

/**
 * Illustrated テーマの配色プリセット。sepia は THEMES.illustrated そのもの、他は差分だけを持つ。
 * 要素ごとの色相スライダーは組み合わせ次第で破綻しやすいので、調和を確認済みのプリセットに絞る。
 */
export const ILLUSTRATED_PALETTES: Record<IllustratedPalette, { label: string; override: ThemeOverride }> = {
  sepia: { label: "セピア（古地図）", override: {} },
  natural: {
    label: "ナチュラル（自然色）",
    override: {
      background: "#e9e2c8",
      ocean: "#7fa8c4",
      oceanShallow: "#a3c3d4",
      coastlineStroke: "#3d4f5c",
      riverFill: "#6f9cbd",
      riverStroke: "#34506a",
      textWater: "#f2f6f8",
      mountainFill: "#8d8a86",
      mountainHighlight: "#e2ddd2",
      mountainStroke: "#3b3632",
      hillFill: "#c9cc98",
      treeFill: "#4f7a3a",
      treeStroke: "#22381a",
      contourStroke: "#a49a74",
      forestCanopy: {
        deciduous: "#5a8a3c",
        coniferous: "#3f6b45",
        tropical: "#4f9142",
        shadow: "#1f3a1c",
        highlight: "#9cc46e",
        stroke: "#1a3015"
      },
      biomes: {
        ocean: "#7fa8c4",
        grassland: "#d6dca8",
        deciduous_forest: "#c0d29a",
        coniferous_forest: "#b2c49a",
        tropical_forest: "#b2cf8e",
        savanna: "#e3d9a0",
        woodland_scrub: "#cfd59f",
        hills: "#d3d3a2",
        mountains: "#cfc8b2",
        snow_mountains: "#e6e8e6",
        glacier: "#eef2f4",
        swamp: "#a9bb8c",
        marsh: "#b4c495",
        desert: "#eadcae",
        tundra: "#d4d4bf",
        badlands: "#d7b98e"
      }
    }
  },
  lush: {
    label: "ビビッド（鮮やか）",
    override: {
      background: "#eef0cf",
      ocean: "#4f93c6",
      oceanShallow: "#7fb5da",
      coastlineStroke: "#24425e",
      riverFill: "#4a8fc4",
      riverStroke: "#1f4566",
      textWater: "#ffffff",
      mountainFill: "#8f8aa0",
      mountainHighlight: "#ebe6dc",
      mountainStroke: "#332f3d",
      hillFill: "#b8d07c",
      treeFill: "#3f8a35",
      treeStroke: "#173b14",
      contourStroke: "#9ba872",
      forestCanopy: {
        deciduous: "#4c9a34",
        coniferous: "#2f7444",
        tropical: "#3fa83a",
        shadow: "#163a16",
        highlight: "#a6d968",
        stroke: "#123012"
      },
      biomes: {
        ocean: "#4f93c6",
        grassland: "#cfe39a",
        deciduous_forest: "#b4d88a",
        coniferous_forest: "#a6c98e",
        tropical_forest: "#a2d77a",
        savanna: "#e6dc8e",
        woodland_scrub: "#c8dc8c",
        hills: "#cfdc96",
        mountains: "#cdc6b4",
        snow_mountains: "#eef0f2",
        glacier: "#f4f8fa",
        swamp: "#94b87c",
        marsh: "#a8c888",
        desert: "#f0dea0",
        tundra: "#d2dac2",
        badlands: "#e0b07c"
      }
    }
  },
  nordic: {
    label: "ノルディック（寒冷・くすみ）",
    override: {
      background: "#e4e3d8",
      ocean: "#6e8c98",
      oceanShallow: "#93aab2",
      coastlineStroke: "#2f3e45",
      riverFill: "#6a8996",
      riverStroke: "#2d3f47",
      textWater: "#eef3f4",
      mountainFill: "#7e8590",
      mountainHighlight: "#e4e6e6",
      mountainStroke: "#2f3338",
      hillFill: "#c3c6aa",
      treeFill: "#3e5f4a",
      treeStroke: "#1b2b21",
      contourStroke: "#9a9c8a",
      forestCanopy: {
        deciduous: "#58704a",
        coniferous: "#33584a",
        tropical: "#4b6e47",
        shadow: "#18281f",
        highlight: "#8fa886",
        stroke: "#14231b"
      },
      biomes: {
        ocean: "#6e8c98",
        grassland: "#d3d4b8",
        deciduous_forest: "#bcc5a6",
        coniferous_forest: "#aebba4",
        tropical_forest: "#b4c29c",
        savanna: "#dcd6b2",
        woodland_scrub: "#c9cdb0",
        hills: "#cfcfb6",
        mountains: "#c4c3b8",
        snow_mountains: "#eceeee",
        glacier: "#f2f5f6",
        swamp: "#a4ae94",
        marsh: "#b0b89e",
        desert: "#e2dabb",
        tundra: "#d2d3c6",
        badlands: "#cbb79c"
      }
    }
  }
};

/** 文書の装飾設定から実際に使う配色を決める（Illustrated は配色プリセットを重ねる） */
export function resolveThemeColors(decoration: Pick<RegionDecoration, "theme" | "illustratedPalette">): ThemeColors {
  const base = THEMES[decoration.theme] ?? THEMES.schley;
  if (decoration.theme !== "illustrated") return base;
  const { override } = ILLUSTRATED_PALETTES[decoration.illustratedPalette ?? "sepia"] ?? ILLUSTRATED_PALETTES.sepia;
  return {
    ...base,
    ...override,
    forestCanopy: { ...base.forestCanopy, ...override.forestCanopy },
    biomes: { ...base.biomes, ...override.biomes }
  };
}

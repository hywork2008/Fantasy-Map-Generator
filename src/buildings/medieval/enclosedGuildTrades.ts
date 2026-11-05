import type { ModelKit } from "./modelKit";

/** Role is independent of the shared architecture and of model quality. */
export const ENCLOSED_GUILD_TRADES = [
  { id: "textiles", name: "Enclosed cloth guild hall" },
  { id: "leather", name: "Enclosed leatherworkers' guild hall" },
  { id: "baking", name: "Enclosed bakers' guild hall" },
  { id: "brewing", name: "Enclosed brewers' guild hall" },
  { id: "victualling", name: "Enclosed victuallers' guild hall" },
  { id: "woodworking", name: "Enclosed woodworkers' guild hall" },
  { id: "metallurgy", name: "Enclosed metalworkers' guild hall" },
  { id: "glassware-pottery", name: "Enclosed glass and pottery guild hall" },
  { id: "masonry", name: "Enclosed masons' guild hall" },
  { id: "book-trades", name: "Enclosed scribes' and bookbinders' guild hall" }
] as const;
export type EnclosedGuildRole = (typeof ENCLOSED_GUILD_TRADES)[number]["id"];
type AddedRole = Exclude<EnclosedGuildRole, "textiles" | "leather">;

/** Finished samples on an inspection table, never operating industrial equipment. */
export function addGuildInspectionSamples(k: ModelKit, role: AddedRole, z: number, high: boolean) {
  const top = 1.01;
  switch (role) {
    case "baking":
      for (const x of [-3.65, -3, -2.35]) {
        k.sphere("guild-sample-loaf", [x, top + 0.12, z], [0.26, 0.12, 0.17], "straw");
        if (high)
          for (const dx of [-0.09, 0.09])
            k.beam(
              "guild-detail-bread-score",
              [x + dx - 0.03, top + 0.215, z - 0.07],
              [x + dx + 0.03, top + 0.215, z + 0.07],
              0.012,
              "earth"
            );
      }
      break;
    case "brewing":
      for (const x of [-3.65, -3, -2.35]) {
        k.vessel("guild-sample-ale-measure", [x, top, z], 0.15, 0.3, "wood");
        k.beam("measure-handle-upper", [x + 0.14, top + 0.25, z], [x + 0.25, top + 0.25, z], 0.035);
        k.beam("measure-handle-outer", [x + 0.25, top + 0.25, z], [x + 0.25, top + 0.08, z], 0.035);
        k.beam("measure-handle-lower", [x + 0.25, top + 0.08, z], [x + 0.14, top + 0.08, z], 0.035);
        if (high) k.ring("guild-detail-measure-hoop", [x, top + 0.07, z], 0.153, 0.012, "iron");
      }
      break;
    case "victualling":
      k.box("guild-sample-meat-cut", [-3.65, top + 0.1, z], [0.45, 0.2, 0.3], "leather");
      k.sphere("guild-sample-fish", [-3, top + 0.09, z], [0.27, 0.09, 0.12], "water");
      k.box("fish-tail", [-3.29, top + 0.08, z], [0.12, 0.1, 0.22], "water");
      for (const x of [-2.45, -2.25]) k.cylinder("guild-sample-candle", [x, top + 0.15, z], 0.06, 0.3, "white");
      if (high) {
        k.beam("guild-detail-meat-fat", [-3.82, top + 0.202, z], [-3.48, top + 0.202, z + 0.04], 0.025, "white");
        k.sphere("guild-detail-fish-eye", [-2.81, top + 0.12, z + 0.07], [0.018, 0.018, 0.012], "dark");
      }
      break;
    case "woodworking":
      for (const [i, x] of [-3.65, -3, -2.35].entries()) {
        k.box("guild-sample-board", [x, top + 0.05, z], [0.48, 0.1, 0.65], i % 2 ? "oak" : "wood");
        if (high)
          for (const dx of [-0.13, 0, 0.13])
            k.beam(
              "guild-detail-board-grain",
              [x + dx, top + 0.103, z - 0.27],
              [x + dx + 0.03, top + 0.103, z + 0.27],
              0.009,
              "dark"
            );
      }
      break;
    case "metallurgy":
      for (const [i, x] of [-3.65, -3, -2.35].entries()) {
        k.box("guild-sample-ironwork", [x, top + 0.04, z], [0.4, 0.08, 0.18], "iron");
        k.ring("inspected-iron-ring", [x, top + 0.09, z + 0.18], 0.11, 0.025, "iron");
        if (high)
          k.sphere(
            "guild-detail-iron-rivet",
            [x + 0.1, top + 0.09, z],
            [0.025, 0.015, 0.025],
            i % 2 ? "iron" : "stone"
          );
      }
      break;
    case "glassware-pottery":
      k.vessel("guild-sample-pottery", [-3.65, top, z], 0.19, 0.32, "earth");
      k.cylinder("goblet-foot", [-3, top + 0.02, z], 0.13, 0.04, "water");
      k.cylinder("goblet-stem", [-3, top + 0.12, z], 0.025, 0.2, "water");
      k.vessel("guild-sample-glass", [-3, top + 0.2, z], 0.13, 0.2, "water");
      k.box("guild-sample-glazing", [-2.35, top + 0.025, z], [0.44, 0.05, 0.44], "water");
      if (high) k.ring("guild-detail-pot-rim", [-3.65, top + 0.3, z], 0.19, 0.016, "earth");
      break;
    case "masonry":
      for (const x of [-3.65, -3, -2.35]) {
        k.box("guild-sample-dressed-stone", [x, top + 0.16, z], [0.48, 0.32, 0.55], "stone");
        if (high)
          for (let j = 0; j < 4; j++)
            k.beam(
              "guild-detail-chisel-mark",
              [x - 0.17 + j * 0.1, top + 0.323, z - 0.2],
              [x - 0.14 + j * 0.1, top + 0.323, z + 0.2],
              0.009,
              "earth"
            );
      }
      break;
    case "book-trades":
      k.box("book-binding-cover", [-3.5, top + 0.025, z], [0.76, 0.05, 0.52], "leather");
      for (const side of [-1, 1]) {
        k.box("guild-sample-manuscript", [-3.5 + side * 0.18, top + 0.06, z], [0.34, 0.03, 0.46], "white");
        if (high)
          for (let j = 0; j < 6; j++)
            k.beam(
              "guild-detail-handwritten-line",
              [-3.5 + side * 0.18 - 0.13, top + 0.077, z - 0.16 + j * 0.06],
              [-3.5 + side * 0.18 + 0.13, top + 0.077, z - 0.16 + j * 0.06],
              0.006,
              "dark"
            );
      }
      k.cylinder("guild-sample-inkpot", [-2.55, top + 0.07, z - 0.15], 0.075, 0.14, "dark");
      k.beam("scribes-quill", [-2.8, top + 0.01, z + 0.2], [-2.35, top + 0.01, z + 0.1], 0.025, "white");
      break;
  }
}

/** Emblems fit the same plaque, without covering the entrance or changing the envelope. */
export function addGuildEmblem(k: ModelKit, role: AddedRole) {
  const x = -1.4,
    y = 2.95,
    z = 4.21;
  switch (role) {
    case "baking":
      k.box("guild-symbol-loaf", [x, y, z], [0.65, 0.28, 0.055], "straw");
      for (const dx of [-0.16, 0, 0.16])
        k.beam(
          "loaf-sign-score",
          [x + dx - 0.04, y - 0.07, z + 0.04],
          [x + dx + 0.04, y + 0.07, z + 0.04],
          0.02,
          "earth"
        );
      break;
    case "brewing":
      k.box("guild-symbol-tankard", [x - 0.05, y, z], [0.42, 0.36, 0.055], "wood");
      k.box("tankard-sign-handle", [x + 0.25, y, z], [0.12, 0.25, 0.055], "straw");
      break;
    case "victualling":
      k.box("guild-symbol-cleaver", [x + 0.07, y + 0.03, z], [0.5, 0.2, 0.055], "iron");
      k.box("cleaver-sign-handle", [x - 0.3, y - 0.04, z], [0.24, 0.08, 0.055], "wood");
      break;
    case "woodworking":
      k.box("guild-symbol-square", [x - 0.16, y, z], [0.09, 0.4, 0.055], "straw");
      k.box("square-sign-base", [x + 0.05, y - 0.15, z], [0.5, 0.09, 0.055], "straw");
      break;
    case "metallurgy":
      k.box("guild-symbol-anvil", [x, y + 0.1, z], [0.65, 0.12, 0.055], "iron");
      k.box("anvil-sign-waist", [x, y - 0.04, z], [0.24, 0.2, 0.055], "iron");
      k.box("anvil-sign-base", [x, y - 0.17, z], [0.5, 0.08, 0.055], "iron");
      break;
    case "glassware-pottery":
      k.box("guild-symbol-vessel", [x - 0.18, y - 0.03, z], [0.3, 0.3, 0.055], "earth");
      k.box("vessel-sign-neck", [x - 0.18, y + 0.15, z], [0.15, 0.1, 0.055], "earth");
      k.box("glazing-sign", [x + 0.24, y, z], [0.26, 0.34, 0.055], "water");
      break;
    case "masonry":
      k.box("guild-symbol-stone", [x, y, z], [0.65, 0.36, 0.055], "stone");
      k.box("stone-sign-joint", [x, y, z + 0.035], [0.035, 0.36, 0.02], "earth");
      break;
    case "book-trades":
      for (const side of [-1, 1]) k.box("guild-symbol-book", [x + side * 0.18, y, z], [0.33, 0.36, 0.055], "white");
      k.box("book-sign-spine", [x, y, z + 0.04], [0.04, 0.4, 0.025], "leather");
      break;
  }
}

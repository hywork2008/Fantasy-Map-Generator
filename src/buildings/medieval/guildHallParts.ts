import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import type { ModelPartFactory } from "../modelParts";
import { createHighCivicHallBody } from "./civicHallDetails";
import { assembleCivicHallParts, civicHallPartFactories } from "./civicHallParts";
import { GUILD_HALL_PROFILE } from "./civicHallProfile";
import { createGlassGuildDressing } from "./glassGuildDressing";
import { HouseDetailKit } from "./houseDetailKit";
import { createPrintingGuildDressing, fittedPrintingPress } from "./printingEquipment";
import { addCraftBench } from "./workshopDetailKit";

export type GuildCraft = "leather" | "woodworking" | "masonry" | "metallurgy" | "glassworking" | "printing";

function tradeDressing(craft: GuildCraft) {
  if (craft === "glassworking") return createGlassGuildDressing();
  if (craft === "printing") return createPrintingGuildDressing();
  const k = new HouseDetailKit(`${craft}-guild-trade-dressing`),
    front = GUILD_HALL_PROFILE.depth / 2;
  k.box("guild-trade-plaque", [0, 6.12, front + 0.14], [1.4, 0.65, 0.12], "wood");
  const z = front + 0.215;
  if (craft === "leather") {
    k.box("hide-emblem-body", [0, 6.12, z], [0.55, 0.4, 0.03], "leather");
    for (const side of [-1, 1])
      for (const y of [5.95, 6.29]) k.sphere("hide-emblem-limb", [side * 0.3, y, z], [0.13, 0.07, 0.018], "leather");
  } else if (craft === "woodworking") {
    k.beam("square-emblem-upright", [-0.4, 5.9, z], [-0.4, 6.34, z], 0.06, "wood");
    k.beam("square-emblem-arm", [-0.4, 5.9, z], [0.05, 5.9, z], 0.06, "wood");
    k.beam("axe-emblem-haft", [-0.05, 5.9, z], [0.4, 6.32, z], 0.04, "oak");
    k.box("axe-emblem-blade", [0.34, 6.28, z], [0.24, 0.15, 0.035], "iron");
  } else if (craft === "masonry") {
    for (const side of [-1, 1]) k.beam("masons-compass-emblem", [0, 6.36, z], [side * 0.4, 5.9, z], 0.04, "iron");
    k.beam("masons-square-emblem", [-0.32, 6.06, z], [0.32, 6.06, z], 0.05, "wood");
    k.sphere("compass-pivot", [0, 6.34, z], [0.055, 0.055, 0.025], "iron");
  } else {
    k.box("anvil-emblem-face", [0, 6.28, z], [0.85, 0.1, 0.04], "iron");
    k.box("anvil-emblem-waist", [0, 6.1, z], [0.23, 0.3, 0.04], "iron");
    k.box("anvil-emblem-foot", [0, 5.93, z], [0.6, 0.1, 0.04], "iron");
  }
  for (const x of [-3, 3]) {
    addCraftBench(k, x, -0.65, 2.5, 1.1, 0.95);
    if (craft === "leather") {
      for (let i = 0; i < 4; i++)
        k.box("inspected-leather-stack", [x, 0.99 + i * 0.06, -0.65], [1.4, 0.06, 0.8], "leather");
      k.beam("leather-measuring-rule", [x - 1, 1.213, -0.3], [x + 1, 1.213, -0.3], 0.025, "wood");
    } else if (craft === "woodworking") {
      for (let i = 0; i < 5; i++)
        k.box("guild-timber-sample", [x - 0.9 + i * 0.45, 1.015, -0.65], [0.4, 0.13, 0.8], i % 2 ? "wood" : "oak");
      for (let i = 0; i < 5; i++)
        k.beam("timber-grain", [x - 0.9 + i * 0.45, 1.083, -0.98], [x - 0.85 + i * 0.45, 1.083, -0.32], 0.006, "dark");
    } else if (craft === "masonry") {
      for (let i = 0; i < 3; i++) {
        k.box("dressed-stone-sample", [x - 0.75 + i * 0.75, 1.18, -0.65], [0.62, 0.46, 0.75], "stone");
        for (let j = 0; j < 5; j++)
          k.beam(
            "sample-chisel-stroke",
            [x - 0.96 + i * 0.75 + j * 0.09, 1.412, -0.93],
            [x - 0.96 + i * 0.75 + j * 0.09, 1.412, -0.4],
            0.006,
            "earth"
          );
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const xx = x - 0.9 + i * 0.45;
        k.beam("ironwork-bar-sample", [xx, 0.98, -1], [xx, 0.98, -0.35], 0.05, "iron", true);
        k.ring("ironwork-ring-sample", [xx, 0.99, -0.25], 0.085, 0.015, "iron");
      }
    }
  }
  return compactModel(k.finish());
}

export function guildHallPartFactories(craft: GuildCraft): ModelPartFactory[] {
  const stair = civicHallPartFactories("cloth")[1];
  return [
    {
      id: `${craft}:architecture`,
      role: "architecture",
      quality: "high",
      author: DEFAULT_AUTHOR,
      create: () => createHighCivicHallBody("cloth", false)
    },
    { ...stair, id: `${craft}:exterior-stair` },
    {
      id: `${craft}:trade-dressing`,
      role: "trade-dressing",
      quality: "high",
      author: DEFAULT_AUTHOR,
      create: () => tradeDressing(craft)
    },
    ...(craft === "printing"
      ? [
          {
            id: "printing:printing-press",
            role: "printing-press",
            quality: "high" as const,
            author: DEFAULT_AUTHOR,
            create: () => fittedPrintingPress(-3, -0.35)
          }
        ]
      : [])
  ];
}
export const createHighGuildHall = (craft: GuildCraft) =>
  assembleCivicHallParts(`${craft}-guild-hall-high`, guildHallPartFactories(craft));

import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import { ENCLOSED_GUILD_TRADES } from "./enclosedGuildTrades";
import { assembleMarketGuildHall, marketGuildHallParts } from "./marketGuildHall";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = ENCLOSED_GUILD_TRADES.map(({ id: role, name }) => {
  const id = `trade-hall.guild-market-arcade.${role}`,
    family = `medieval.${id}`;
  return {
    id,
    task: 49,
    name: name.replace("Enclosed ", "Market-side "),
    author: DEFAULT_AUTHOR,
    cePlacementStatus: "preview-only",
    size: [17.2, 8.9, 9.2],
    note: "T1b guild-market-arcade v2: open inspection floor, east exterior stair and 36 assembly seats. Ground entrance is in the east outer bay. No workshop or dwelling capacity. Both qualities share body and ports; CE placement is not enabled.",
    create: () => assembleMarketGuildHall(role, "low"),
    variants: (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, DEFAULT_AUTHOR),
      family,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      author: DEFAULT_AUTHOR,
      create: () => assembleMarketGuildHall(role, quality)
    })),
    parts: selected => marketGuildHallParts(role, selected?.includes("@high#") ? "high" : "low"),
    assembleParts: parts => assembleMarketGuildHall(role, parts[0]?.quality === "high" ? "high" : "low", parts)
  };
});

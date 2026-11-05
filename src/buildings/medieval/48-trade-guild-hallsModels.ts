import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import { assembleEnclosedGuildHall, enclosedGuildHallParts } from "./enclosedGuildHall";
import { ENCLOSED_GUILD_TRADES } from "./enclosedGuildTrades";
import type { MedievalModel } from "./modelKit";

/** New families: existing arcade halls and all saved variant identities remain untouched. */
export const models: MedievalModel[] = ENCLOSED_GUILD_TRADES.map(({ id: role, name }) => {
  const id = `trade-hall.guild-enclosed.${role}`,
    family = `medieval.${id}`;
  return {
    id,
    task: 48,
    name,
    author: DEFAULT_AUTHOR,
    size: [12.8, 9, 9.2],
    note: "T1b guild-enclosed v1: closed ground floor, internal return stair, 24 assembly seats. No dwelling or manufacturing workshop capacity. Shared main-body origin, ports and floor budgets across Low and High; available through explicit CE site reservations; automatic generation remains separate.",
    create: () => assembleEnclosedGuildHall(role, "low"),
    variants: (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, DEFAULT_AUTHOR),
      family,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      author: DEFAULT_AUTHOR,
      create: () => assembleEnclosedGuildHall(role, quality)
    })),
    parts: selected => enclosedGuildHallParts(role, selected?.includes("@high#") ? "high" : "low"),
    assembleParts: parts => assembleEnclosedGuildHall(role, parts[0]?.quality === "high" ? "high" : "low", parts)
  };
});

import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import { assembleDedicatedCooper, dedicatedCooperParts } from "./dedicatedCooper";
import type { MedievalModel } from "./modelKit";

const id = "trade-workshop.dedicated-cooperage",
  family = `medieval.${id}`;
export const models: MedievalModel[] = [
  {
    id,
    task: 54,
    author: DEFAULT_AUTHOR,
    name: "Dedicated cooperage and cask handling yard",
    size: [16, 13, 4.6],
    note: "T3-2d-1 shared full-size shaping, jointing, assembly, heading, hoops, outdoor heat-bending and allocated ready-seasoned stock. Planned one workshop, 2.5 labor and three workplaces, no dwelling. Empty upright casks only; loaded casks, carts, fire behavior, waste/water, process motion, supply and throughput remain unverified. Long-term seasoning is external. Explicit CE spatial reservation; automatic generation remains separate.",
    create: () => assembleDedicatedCooper("low"),
    variants: (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, DEFAULT_AUTHOR),
      family,
      author: DEFAULT_AUTHOR,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      create: () => assembleDedicatedCooper(quality)
    })),
    parts: selected => dedicatedCooperParts(selected?.includes("@high#") ? "high" : "low"),
    assembleParts: parts => assembleDedicatedCooper(parts[0]?.quality === "high" ? "high" : "low", parts)
  }
];

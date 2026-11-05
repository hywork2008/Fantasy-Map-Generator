import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import { assembleDetachedBakehouse, detachedBakehouseParts } from "./detachedBakehouse";
import type { MedievalModel } from "./modelKit";

const id = "trade-workshop.dedicated-bakehouse",
  family = `medieval.${id}`;
export const models: MedievalModel[] = [
  {
    id,
    task: 52,
    author: DEFAULT_AUTHOR,
    name: "Detached bread workshop and operating yard",
    size: [14.5, 10.5, 5],
    note: "T3-2a bread-only form v1. Shared kneading, oven, cooling, flour and fuel storage, three static workplaces and hand-carried delivery paths in both qualities. One planned workshop, no dwelling. Operating pad is included; throughput, supply and confectionery coverage are not verified. Available through explicit CE site reservations; automatic generation remains separate.",
    create: () => assembleDetachedBakehouse("low"),
    variants: (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, DEFAULT_AUTHOR),
      family,
      author: DEFAULT_AUTHOR,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      create: () => assembleDetachedBakehouse(quality)
    })),
    parts: selected => detachedBakehouseParts(selected?.includes("@high#") ? "high" : "low"),
    assembleParts: parts => assembleDetachedBakehouse(parts[0]?.quality === "high" ? "high" : "low", parts)
  }
];

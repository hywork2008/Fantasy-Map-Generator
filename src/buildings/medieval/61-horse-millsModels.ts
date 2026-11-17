import { variantId } from "../modelVariants";
import { HORSE_MILL_AUTHOR as AUTHOR, assembleHorseMill, horseMillParts } from "./horseMill";
import type { MedievalModel } from "./modelKit";

const id = "trade-workshop.dedicated-horse-mill",
  family = `medieval.${id}`;
export const models: MedievalModel[] = [
  {
    id,
    task: 61,
    author: AUTHOR,
    name: "Horse-powered grain mill",
    size: [12.8, 12.2, 6.4],
    note: "Schematic medieval horse mill (animal-powered gristmill) for towns without wind or water milling: a timber-framed mill house with an upright shaft, crown wheel and horse sweep over a trodden walk, a layshaft driving one pair of stones on a hurst frame outside the walk, grain and flour sacks, a weigh beam and a manger. No sails, no water wheel. Dimensions are illustrative, not a reconstruction of a particular mill; throughput is unverified.",
    create: () => assembleHorseMill("low"),
    variants: (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, AUTHOR),
      family,
      author: AUTHOR,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      create: () => assembleHorseMill(quality)
    })),
    parts: selected => horseMillParts(selected?.includes("@high#") ? "high" : "low"),
    assembleParts: parts => assembleHorseMill(parts[0]?.quality === "high" ? "high" : "low", parts)
  }
];

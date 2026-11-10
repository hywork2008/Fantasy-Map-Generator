import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import { assembleDedicatedTannery, dedicatedTanneryParts } from "./dedicatedTannery";
import type { MedievalModel } from "./modelKit";

const id = "trade-workshop.dedicated-wet-tannery",
  family = `medieval.${id}`;
export const models: MedievalModel[] = [
  {
    id,
    task: 55,
    author: DEFAULT_AUTHOR,
    name: "Dedicated wet tannery and separated water terminals",
    size: [18, 16, 4.6],
    note: "T3-2e-1 spatial study: 288 square meters, one planned workshop, three spatial workplaces, no dwelling. Manual filling and emptying, separate intake and effluent terminals, raw/dry stock, prepared materials and solid waste. Explicit CE spatial placement; water supply and production are unverified. Water supply, hydraulics, disposal, process motion, occupational split and production capacity remain unverified.",
    create: () => assembleDedicatedTannery("low"),
    variants: (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, DEFAULT_AUTHOR),
      family,
      author: DEFAULT_AUTHOR,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      create: () => assembleDedicatedTannery(quality)
    })),
    parts: selected => dedicatedTanneryParts(selected?.includes("@high#") ? "high" : "low"),
    assembleParts: parts => assembleDedicatedTannery(parts[0]?.quality === "high" ? "high" : "low", parts)
  }
];

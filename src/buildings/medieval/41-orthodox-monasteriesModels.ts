import { createMonastery, monasteryPreviewPlan } from "../monasteries/friary";
import { MONASTERY_VARIANTS } from "../siteVariants";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "orthodox-monastery",
    name: "Eastern European Orthodox monastery",
    task: 41,
    size: [105, 95, 22],
    note: "CE-fitted eastern European monastery: cross-in-square church with a drum, bulbous dome and Orthodox cross, stone bell tower, residential ranges, enclosed court, trees and well. The roof form is regional, not universal to all Orthodox foundations. BV and CE share the same assembly.",
    variants: MONASTERY_VARIANTS.filter(variant => variant.family === "monastery.orthodoxMonastery").map(variant => ({
      ...variant,
      label: "CE-fitted Orthodox monastery"
    })),
    create: () => createMonastery(monasteryPreviewPlan("orthodoxMonastery"))
  }
];

import { assembleMonasteryParts, createFriary, monasteryPartFactories } from "../monasteries/friary";
import { FRIARY_VARIANTS } from "../siteVariants";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "mendicant-friary",
    name: "Urban mendicant friary",
    task: 33,
    size: [85, 75, 15],
    note: "A CE-fitted urban friary: preaching nave and choir with apse, open bellcote, three domestic ranges, roofed cloister, garth and precinct entrance. High adds hollow masonry shells, pointed lancet openings and portal surrounds, stepped buttresses, intersecting pitched roofs, a pointed cloister arcade, roof courses and wall coping. Vegetation and the shared well keep their independent Low budgets. Illustrative exterior; not a measured historical reconstruction or a furnished interior.",
    create: () => createFriary(),
    variants: FRIARY_VARIANTS.filter(variant => variant.level !== "default").map(variant => ({
      ...variant,
      label: variant.level === "high" ? "High" : "Low"
    })),
    parts: variantId =>
      monasteryPartFactories(undefined, 0, 0, {
        architectureQuality:
          FRIARY_VARIANTS.find(variant => variant.id === variantId)?.level === "high" ? "high" : "low"
      }),
    assembleParts: parts => assembleMonasteryParts("mendicant-friary", parts)
  }
];

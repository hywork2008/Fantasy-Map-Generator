import type { BakeryKind } from "./bakeryComponents";
import { createHighBakery } from "./bakeryDetails";
import {
  assembleBakeryParts,
  BAKERY_PRESETS,
  type BakeryPreset,
  bakeryPartFactories,
  createLowBakery
} from "./bakeryParts";
import type { MedievalModel } from "./modelKit";
import { registerHighVariants } from "./qualityVariants";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "bread-bakehouse",
    name: "Detached bread bakehouse",
    task: 10,
    size: [10, 10, 6],
    note: "Detached stone bakehouse with a domed masonry oven, chimney, long bread peel, cooling table and fuel pile, separating the fire from a dwelling.",
    create: () => createLowBakery("bread-bakehouse")
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "town-bakery",
    name: "Bakery and bread shop",
    task: 10,
    size: [12, 11, 8],
    note: "Two-storey bakery dwelling with street display, shuttered upper windows, a side oven and bread cooling on wooden boards.",
    create: () => createLowBakery("town-bakery")
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "communal-bread-oven",
    name: "Communal bread oven shelter",
    task: 10,
    size: [7, 8, 5],
    note: "Shared village oven under an open timber shelter, with baking landing, fuel, chimney and a long-handled peel. Illustrative regional form.",
    create: () => createLowBakery("communal-bread-oven")
  }
];

registerHighVariants(models, {
  "bread-bakehouse": () => createHighBakery("bread-bakehouse"),
  "town-bakery": () => createHighBakery("town-bakery"),
  "communal-bread-oven": () => createHighBakery("communal-bread-oven")
});

for (const model of models) {
  model.partPresets = BAKERY_PRESETS;
  model.parts = (variantId, preset = "standard") =>
    bakeryPartFactories(
      model.id as BakeryKind,
      model.variants?.find(variant => variant.id === variantId)?.level === "high" ? "high" : "low",
      preset as BakeryPreset
    );
  model.assembleParts = parts => assembleBakeryParts(model.id, parts);
}

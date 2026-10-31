import { createHighShopHouse } from "./dwellingDetails";
import type { MedievalModel } from "./modelKit";
import { registerHighVariants } from "./qualityVariants";
import type { ShopHouseKind } from "./shopHouseComponents";
import {
  assembleShopHouseParts,
  createLowShopHouse,
  SHOP_HOUSE_PRESETS,
  type ShopHousePreset,
  shopHousePartFactories
} from "./shopHouseParts";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "merchant-shop-house",
    name: "Merchant shop and dwelling",
    task: 8,
    size: [9, 10, 9],
    note: "Street-facing shop under an upstairs dwelling. Hinged display shutter, counter, fabric awning, goods shelves and stock crates distinguish the commercial ground floor.",
    create: () => createLowShopHouse("merchant-shop-house")
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "artisan-shop-house",
    name: "Street workshop and lodging",
    task: 8,
    size: [9, 9, 8],
    note: "Artisan dwelling with a broad work window, folding timber shutter, outside workbench, tool pegs and a small tiled working canopy.",
    create: () => createLowShopHouse("artisan-shop-house")
  }
];

registerHighVariants(models, {
  "merchant-shop-house": () => createHighShopHouse("merchant-shop-house"),
  "artisan-shop-house": () => createHighShopHouse("artisan-shop-house")
});

for (const model of models) {
  model.partPresets = SHOP_HOUSE_PRESETS;
  model.parts = (variantId, preset = "standard") =>
    shopHousePartFactories(
      model.id as ShopHouseKind,
      model.variants?.find(variant => variant.id === variantId)?.level === "high" ? "high" : "low",
      preset as ShopHousePreset
    );
  model.assembleParts = parts => assembleShopHouseParts(model.id, parts);
}

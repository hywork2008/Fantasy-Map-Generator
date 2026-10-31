import type { BreweryKind } from "./breweryComponents";
import { createHighBrewery } from "./breweryDetails";
import {
  assembleBreweryParts,
  BREWERY_PRESETS,
  type BreweryPreset,
  breweryPartFactories,
  createLowBrewery
} from "./breweryParts";
import type { MedievalModel } from "./modelKit";
import { registerHighVariants } from "./qualityVariants";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "town-brewery",
    name: "Town brewery and copper yard",
    task: 15,
    size: [15, 12, 8],
    note: "Masonry brewery, open copper shelter, firebox, chimney, mash tun, cooling tray, paddle and casks. Gravity and hand work replace modern brewing machinery.",
    create: () => createLowBrewery("town-brewery")
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "ale-brewhouse",
    name: "Small ale brewhouse",
    task: 15,
    size: [14, 12, 6],
    note: "Small brewing house for an inn or communal use, with heated copper, staved mash tun and casks. Regional use of rural brewing varied.",
    create: () => createLowBrewery("ale-brewhouse")
  }
];

registerHighVariants(models, {
  "town-brewery": () => createHighBrewery("town-brewery"),
  "ale-brewhouse": () => createHighBrewery("ale-brewhouse")
});

for (const model of models) {
  model.partPresets = BREWERY_PRESETS;
  model.parts = (variantId, preset = "standard") =>
    breweryPartFactories(
      model.id as BreweryKind,
      model.variants?.find(variant => variant.id === variantId)?.level === "high" ? "high" : "low",
      preset as BreweryPreset
    );
  model.assembleParts = parts => assembleBreweryParts(model.id, parts);
}

import type { InnKind } from "./innComponents";
import { createHighInn } from "./innDetails";
import { assembleInnParts, createLowInn, INN_PRESETS, type InnPreset, innPartFactories } from "./innParts";
import type { MedievalModel } from "./modelKit";
import { registerHighVariants } from "./qualityVariants";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "roadside-inn",
    name: "Roadside inn with stable court",
    task: 12,
    size: [19, 14, 9],
    note: "Two-storey lodging hall, stone-paved court, detached horse shelter, benches, barrel and hanging inn sign. Imagined roadside establishment.",
    create: () => createLowInn("roadside-inn")
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "courtyard-hostelry",
    name: "Courtyard hostelry",
    task: 12,
    size: [19, 15, 9],
    note: "Larger U-shaped lodging and stable ensemble around an open court, with a street entrance, service wing and outdoor tables.",
    create: () => createLowInn("courtyard-hostelry")
  }
];

registerHighVariants(models, {
  "roadside-inn": () => createHighInn("roadside-inn"),
  "courtyard-hostelry": () => createHighInn("courtyard-hostelry")
});

for (const model of models) {
  model.partPresets = INN_PRESETS;
  model.parts = (variantId, preset = "standard") =>
    innPartFactories(
      model.id as InnKind,
      model.variants?.find(variant => variant.id === variantId)?.level === "high" ? "high" : "low",
      preset as InnPreset
    );
  model.assembleParts = parts => assembleInnParts(model.id, parts);
}

import { DEFAULT_AUTHOR } from "../authors";
import { CEMETERY_PROP_KINDS, type CemeteryPropKind, createCemeteryProp } from "../landscape/cemeteryProps";
import { CEMETERY_VARIANTS } from "../siteVariants";
import { CEMETERY_HIGH_DETAILS } from "./cemeteryHighDetails";
import { assembleCivicHallParts } from "./civicHallParts";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = CEMETERY_PROP_KINDS.map(kind => ({
  author: "Codex GPT-6.1 Sol",
  id: kind.replaceAll("_", "-"),
  name: kind.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase()),
  task: 44,
  size: [11, 11, 8],
  note: "Schematic funerary architecture or precinct furnishing shared with CE. Illustrative meter dimensions; no specific historical monument is reconstructed.",
  create: () => createCemeteryProp(kind)
}));

for (const model of models) {
  const kind = model.id.replaceAll("-", "_") as CemeteryPropKind;
  const detail = CEMETERY_HIGH_DETAILS[kind];
  if (!detail) continue;
  const family = `cemetery.${kind}`;
  model.note = detail.note;
  model.variants = CEMETERY_VARIANTS.filter(v => v.family === family && v.level !== "default").map(v => ({
    ...v,
    label: v.level === "high" ? "High" : "Low"
  }));
  model.parts = variantId =>
    model.variants?.find(v => v.id === variantId)?.level === "high"
      ? detail.parts()
      : [
          {
            id: `${model.id}:legacy`,
            role: "legacy-assembly",
            quality: "low",
            author: DEFAULT_AUTHOR,
            create: () => model.create()
          }
        ];
  model.assembleParts = parts => assembleCivicHallParts(model.id, parts);
}

import { DEFAULT_AUTHOR } from "../authors";
import { CEMETERY_PROP_KINDS, createCemeteryProp } from "../landscape/cemeteryProps";
import { CEMETERY_VARIANTS } from "../siteVariants";
import { assembleCivicHallParts } from "./civicHallParts";
import type { MedievalModel } from "./modelKit";
import { boneRackPartFactories, ossuaryPartFactories } from "./ossuaryParts";

export const models: MedievalModel[] = CEMETERY_PROP_KINDS.map(kind => ({
  author: "Codex GPT-6.1 Sol",
  id: kind.replaceAll("_", "-"),
  name: kind.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase()),
  task: 44,
  size: [11, 11, 8],
  note: "Schematic funerary architecture or precinct furnishing shared with CE. Illustrative meter dimensions; no specific historical monument is reconstructed.",
  create: () => createCemeteryProp(kind)
}));

for (const model of models.filter(m => ["ossuary-charnel-house", "skull-shelf"].includes(m.id))) {
  const family = `cemetery.${model.id.replaceAll("-", "_")}`;
  model.note =
    model.id === "skull-shelf"
      ? "Reusable wooden rack for stored skeletal remains. High adds pegged shelves, braced posts, pierced skull sockets and supported long bones. Illustrative dimensions; no specific historical monument is reconstructed."
      : "Small stone charnel house for stored skeletal remains. High adds ventilating grilles, an open arched door, tiled roof and shared ossuary racks. Illustrative dimensions; no specific historical monument is reconstructed.";
  model.variants = CEMETERY_VARIANTS.filter(v => v.family === family && v.level !== "default").map(v => ({
    ...v,
    label: v.level === "high" ? "High" : "Low"
  }));
  model.parts = variantId =>
    model.variants?.find(v => v.id === variantId)?.level === "high"
      ? model.id === "skull-shelf"
        ? boneRackPartFactories()
        : ossuaryPartFactories()
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

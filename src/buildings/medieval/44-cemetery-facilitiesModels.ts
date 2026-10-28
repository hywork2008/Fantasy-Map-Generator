import { CEMETERY_PROP_KINDS, createCemeteryProp } from "../landscape/cemeteryProps";
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

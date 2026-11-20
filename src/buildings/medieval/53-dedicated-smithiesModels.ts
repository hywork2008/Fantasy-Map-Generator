import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import { assembleDedicatedSmithy, dedicatedSmithyParts } from "./dedicatedSmithy";
import { type DedicatedSmithyForm, dedicatedSmithyProfile } from "./dedicatedSmithyProfile";
import type { MedievalModel } from "./modelKit";
import { createOpusSmithy, OPUS_SMITHY } from "./opusSmithy";

const OPUS = "Claude Opus 5.5" as const;

const SMITHY_NOTE =
  "Opus: a thirteenth-century smithy after the one excavated at Newington, Oxfordshire (docs/plan/ce-outskirts-workshop-sizes.md S2): an 8 x 5 m building of daubed timber walls on rubble footings under stone slates, open-fronted onto its yard as the Cromarty smithy is thought to have been, a louvre on the ridge for the smoke. Inside, two raised stone hearths at right angles, one on the back wall and one on the gable, each with its bellows; the anvil on a stone base between them and the water trough in the corner; a bench with the tools hung over it and bar iron stood against the gable. A boarded fuel store against the east gable holds charcoal and wood. The yard keeps the slag heap, a water butt and the grindstone. Low keeps every wall, opening and fitting; High adds the studs and braces, embers, hammerscale and small tools. The earlier Codex study remains selectable.";
const CODEX_NOTE =
  "T3-2c-1 shared equipment and three planned workplaces; one workshop, no dwelling. General forging and farriery are separate forms, never six of each from the same calibrated pool. Hand-carried inputs only; production and supply remain unverified. Farrier travel and stationary working are separate states; CE requires straight outward front and rear connections and full-body exterior aprons. Hoof/restraint motion and public-road animal maneuvers remain unverified. Explicit CE spatial reservation only.";

export const models: MedievalModel[] = (["smithy", "farrier"] as DedicatedSmithyForm[]).map(form => {
  const p = dedicatedSmithyProfile(form),
    id = `trade-workshop.${p.formId}`,
    family = `medieval.${id}`,
    codex = (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, DEFAULT_AUTHOR),
      family,
      author: DEFAULT_AUTHOR,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      create: () => assembleDedicatedSmithy(form, quality)
    }));
  if (form === "smithy")
    return {
      id,
      task: 53,
      author: OPUS,
      name: "Dedicated forge and working yard",
      size: [OPUS_SMITHY.width, OPUS_SMITHY.depth, 5.4],
      placementEnvelope: [OPUS_SMITHY.width, OPUS_SMITHY.depth],
      note: SMITHY_NOTE,
      create: () => createOpusSmithy("low"),
      variants: [
        ...codex,
        ...(["low", "high"] as const).map(level => ({
          id: variantId(family, level, OPUS),
          family,
          author: OPUS,
          level,
          label: level === "low" ? "Low" : "High",
          create: () => createOpusSmithy(level)
        }))
      ]
    };
  return {
    id,
    task: 53,
    author: DEFAULT_AUTHOR,
    name: "Farrier forge with through-access shoeing stock",
    size: [p.envelope.max[0] - p.envelope.min[0], p.envelope.max[2] - p.envelope.min[2], p.envelope.max[1]],
    note: CODEX_NOTE,
    create: () => assembleDedicatedSmithy(form, "low"),
    variants: codex,
    parts: selected => dedicatedSmithyParts(form, selected?.includes("@high#") ? "high" : "low"),
    assembleParts: parts => assembleDedicatedSmithy(form, parts[0]?.quality === "high" ? "high" : "low", parts)
  };
});

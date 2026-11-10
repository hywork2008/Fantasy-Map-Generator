import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import { assembleDedicatedSmithy, dedicatedSmithyParts } from "./dedicatedSmithy";
import { type DedicatedSmithyForm, dedicatedSmithyProfile } from "./dedicatedSmithyProfile";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = (["smithy", "farrier"] as DedicatedSmithyForm[]).map(form => {
  const p = dedicatedSmithyProfile(form),
    id = `trade-workshop.${p.formId}`,
    family = `medieval.${id}`;
  return {
    id,
    task: 53,
    author: DEFAULT_AUTHOR,
    name: form === "smithy" ? "Dedicated forge and working yard" : "Farrier forge with through-access shoeing stock",
    size: [p.envelope.max[0] - p.envelope.min[0], p.envelope.max[2] - p.envelope.min[2], p.envelope.max[1]],
    note: "T3-2c-1 shared equipment and three planned workplaces; one workshop, no dwelling. General forging and farriery are separate forms, never six of each from the same calibrated pool. Hand-carried inputs only; production and supply remain unverified. Farrier travel and stationary working are separate states; CE requires straight outward front and rear connections and full-body exterior aprons. Hoof/restraint motion and public-road animal maneuvers remain unverified. Explicit CE spatial reservation only.",
    create: () => assembleDedicatedSmithy(form, "low"),
    variants: (["low", "high"] as const).map(quality => ({
      id: variantId(family, quality, DEFAULT_AUTHOR),
      family,
      author: DEFAULT_AUTHOR,
      level: quality,
      label: quality === "low" ? "Low" : "High",
      create: () => assembleDedicatedSmithy(form, quality)
    })),
    parts: selected => dedicatedSmithyParts(form, selected?.includes("@high#") ? "high" : "low"),
    assembleParts: parts => assembleDedicatedSmithy(form, parts[0]?.quality === "high" ? "high" : "low", parts)
  };
});

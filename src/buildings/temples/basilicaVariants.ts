import { type ModelVariant, variantId } from "../modelVariants";
import { BASILICA_QUALITIES, createBasilicaTemple } from "./basilicaTemple";

export const BASILICA_VARIANTS: readonly ModelVariant[] = BASILICA_QUALITIES.map(level => ({
  id: variantId("temple.basilica", level, "Claude Opus 5.5"),
  family: "temple.basilica",
  level,
  author: "Claude Opus 5.5",
  create: () => createBasilicaTemple(level)
}));

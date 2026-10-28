import { type ModelVariant, variantId } from "../modelVariants";
import { createBarge } from "./barge";
import { createCaravel } from "./caravel";
import { createGalleon } from "./galleon";
import { createOpusGalleon } from "./opusGalleon";
import { createSloop } from "./sloop";

const codex = (family: string, create: ModelVariant["create"]): ModelVariant => ({
  id: variantId(family, "default", "Codex GPT-6.1 Sol"),
  family,
  level: "default",
  author: "Codex GPT-6.1 Sol",
  create
});

/** Harbour ships CE places. The Opus galleon's high tier competes with Codex's single model. */
export const SHIP_VARIANTS: readonly ModelVariant[] = [
  codex("ship.sloop", createSloop),
  codex("ship.caravel", createCaravel),
  codex("ship.barge", createBarge),
  codex("ship.galleon", createGalleon),
  {
    id: variantId("ship.galleon", "default", "Claude Opus 5.5"),
    family: "ship.galleon",
    level: "default",
    author: "Claude Opus 5.5",
    create: () => createOpusGalleon("high")
  },
  {
    id: variantId("ship.galleon", "low", "Claude Opus 5.5"),
    family: "ship.galleon",
    level: "low",
    author: "Claude Opus 5.5",
    create: () => createOpusGalleon("low")
  }
];

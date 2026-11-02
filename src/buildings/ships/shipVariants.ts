import { type ModelVariant, variantId } from "../modelVariants";
import { createBarge } from "./barge";
import { createCaravel } from "./caravel";
import { createCarrack } from "./carrack";
import { createGalleon } from "./galleon";
import type { GalleonState } from "./galleonArmament";
import { createMerchantShipHigh } from "./merchantShipHigh";
import { createOpusGalleon } from "./opusGalleon";
import { createSloop } from "./sloop";
import { createSloopHigh } from "./sloopHigh";

type ShipVariant = ModelVariant<[state?: GalleonState]>;

const codex = (family: string, create: ShipVariant["create"]): ShipVariant => ({
  id: variantId(family, "default", "Codex GPT-6.1 Sol"),
  family,
  level: "default",
  author: "Codex GPT-6.1 Sol",
  create
});

/** Ship quality families; existing CE default identities remain unchanged. */
export const SHIP_VARIANTS: readonly ShipVariant[] = [
  codex("ship.sloop", createSloop),
  { ...codex("ship.sloop", createSloop), id: variantId("ship.sloop", "low", "Codex GPT-6.1 Sol"), level: "low" },
  { ...codex("ship.sloop", createSloopHigh), id: variantId("ship.sloop", "high", "Codex GPT-6.1 Sol"), level: "high" },
  codex("ship.caravel", createCaravel),
  codex("ship.carrack", createCarrack),
  ...(["caravel", "carrack"] as const).flatMap(kind =>
    (["low", "high"] as const).map(level => ({
      id: variantId(`ship.${kind}`, level, "Codex GPT-6.1 Sol"),
      family: `ship.${kind}`,
      level,
      author: "Codex GPT-6.1 Sol" as const,
      create: (state?: GalleonState) =>
        level === "high"
          ? createMerchantShipHigh(kind, state)
          : kind === "caravel"
            ? createCaravel(state)
            : createCarrack(state)
    }))
  ),
  codex("ship.barge", createBarge),
  codex("ship.galleon", createGalleon),
  { ...codex("ship.galleon", createGalleon), id: variantId("ship.galleon", "low", "Codex GPT-6.1 Sol"), level: "low" },
  {
    ...codex("ship.galleon", state => createMerchantShipHigh("galleon", state)),
    id: variantId("ship.galleon", "high", "Codex GPT-6.1 Sol"),
    level: "high"
  },
  {
    id: variantId("ship.galleon", "high", "Claude Opus 5.5"),
    family: "ship.galleon",
    level: "high",
    author: "Claude Opus 5.5",
    create: state => createOpusGalleon("high", state)
  },
  {
    id: variantId("ship.galleon", "default", "Claude Opus 5.5"),
    family: "ship.galleon",
    level: "default",
    author: "Claude Opus 5.5",
    create: state => createOpusGalleon("high", state)
  },
  {
    id: variantId("ship.galleon", "low", "Claude Opus 5.5"),
    family: "ship.galleon",
    level: "low",
    author: "Claude Opus 5.5",
    create: state => createOpusGalleon("low", state)
  }
];

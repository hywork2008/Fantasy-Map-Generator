import { DEFAULT_AUTHOR } from "./authors";
import { createModularBridge, type ModularBridgeSpec } from "./bridges/modularBridge";
import { createCitadelRavelin, createCourtyardLodging, createGarrisonBuilding } from "./facilities/siteFacilities";
import { tiers } from "./houses/houseVariants";
import { CEMETERY_PROP_KINDS, createCemeteryProp } from "./landscape/cemeteryProps";
import { type ModelVariant, variantId } from "./modelVariants";
import { createFriary } from "./monasteries/friary";
import { PLACEABLE_OBJECTS } from "./placeableObjects";
import {
  CONTAINER_KINDS,
  CONTAINER_STATES,
  createMedievalContainerModel,
  MEDIEVAL_CONTAINERS
} from "./props/medievalContainers";
import { createEarlyFieldCannonModel, EARLY_FIELD_CANNON } from "./siege/earlyFieldCannon";
import { createMedievalWellModel, MEDIEVAL_WELL } from "./wells/medievalWell";
import { createPublicWaterBasinModel } from "./wells/publicWaterBasin";
import { PUBLIC_WATER_BASINS, WATER_BASIN_KINDS } from "./wells/publicWaterBasinSpec";
import { createMedievalLumberYardModel, MEDIEVAL_LUMBER_YARD } from "./yards/medievalLumberYard";

function single<Args extends unknown[] = []>(
  family: string,
  author: ModelVariant["author"],
  create: ModelVariant<Args>["create"]
): ModelVariant<Args> {
  return { id: variantId(family, "default", author), family, level: "default", author, create };
}

/** Objects the editor places by hand; CE draws them at their BV meter scale. */
export const OBJECT_VARIANTS = PLACEABLE_OBJECTS.map(object =>
  single(`object.${object.id}`, object.author, object.create)
);

export const WELL_VARIANTS = [
  single("well.medieval", MEDIEVAL_WELL.author, createMedievalWellModel),
  ...WATER_BASIN_KINDS.map(kind =>
    single(`well.${kind}`, PUBLIC_WATER_BASINS[kind].author, () => createPublicWaterBasinModel(kind))
  )
];

export const YARD_VARIANTS = [
  single("yard.lumber", MEDIEVAL_LUMBER_YARD.author, createMedievalLumberYardModel),
  single("siege.early-field-cannon", EARLY_FIELD_CANNON.author, createEarlyFieldCannonModel)
];

export const CONTAINER_VARIANTS = CONTAINER_KINDS.flatMap(kind =>
  CONTAINER_STATES.map(state =>
    single(`container.${kind}-${state}`, MEDIEVAL_CONTAINERS[kind].author, () =>
      createMedievalContainerModel(kind, state)
    )
  )
);

/** Cemetery and friary models record no author; every unattributed BV model was made with Codex. */
export const CEMETERY_VARIANTS = CEMETERY_PROP_KINDS.map(kind =>
  single(`cemetery.${kind}`, DEFAULT_AUTHOR, () => createCemeteryProp(kind))
);

export const FRIARY_VARIANTS = [
  {
    ...single<Parameters<typeof createFriary>>("monastery.friary", DEFAULT_AUTHOR, (...args) => createFriary(...args)),
    // The cloister garth plants the full lime model.
    basedOn: [variantId("tree.garden-parkland", "ultra", "Codex GPT-6.1 Sol")]
  }
];

/** Citadel and inn buildings sized from saved CE plans; quality tiers follow the house tiers. */
export const GARRISON_VARIANTS = tiers("facility.garrison", DEFAULT_AUTHOR, createGarrisonBuilding);
export const LODGING_VARIANTS = tiers("facility.courtyard-lodging", DEFAULT_AUTHOR, createCourtyardLodging);
export const RAVELIN_VARIANTS = tiers("facility.citadel-ravelin", DEFAULT_AUTHOR, createCitadelRavelin);

/** River bridges built to each crossing's span, deck heights and movable opening. */
export const BRIDGE_VARIANTS: ModelVariant<[ModularBridgeSpec]>[] = (["high", "low"] as const).map(level => ({
  id: variantId("bridge.modular", level, DEFAULT_AUTHOR),
  family: "bridge.modular",
  level,
  author: DEFAULT_AUTHOR,
  create: spec => createModularBridge(spec, level)
}));

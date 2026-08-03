import {
  SHIP_CLASS_DEFINITIONS,
  SHIPBUILDING_MATERIAL_IDS,
  type ShipbuildingMaterials,
  type ShipClassDefinition
} from "../../hostTypes";

/**
 * Age-of-Sail ship class tech tree. Deliberately cannon-free: this world's baseline
 * combat doctrine is melee/bow (see docs/plan/shipbuilding.md), so tiers are built
 * around hull size, cargo/troop capacity, and seaworthiness rather than armament.
 * Gunpowder-driven ships of the line are an explicit future option, gated behind a
 * separate rule, not part of this default tree.
 */
export interface ShipClass extends ShipClassDefinition {}

export const SHIP_CLASSES: readonly ShipClass[] = SHIP_CLASS_DEFINITIONS;

/**
 * The Economy Ships recipe for one Sloop-sized hull, normalized to ten construction
 * points. Larger ship classes consume proportionally to their build-point requirement.
 */
export const MATERIALS_PER_TEN_BUILD_POINTS: ShipbuildingMaterials = {
  Wood: 2,
  Sails: 2,
  Ropes: 2,
  Tar: 1
};

/**
 * Baseline construction throughput of one shipyard. Keep this beside the material
 * recipe so strategic-procurement forecasts cannot drift from queue progress.
 */
export const SHIPYARD_BUILD_POINTS_PER_YEAR = 2;

export function getMaterialsForWork(_shipClass: ShipClass, workPoints: number): ShipbuildingMaterials {
  const ratio = Math.max(0, workPoints) / SHIP_CLASSES[0].buildPointsRequired;
  const materials = {} as Record<(typeof SHIPBUILDING_MATERIAL_IDS)[number], number>;
  for (const material of SHIPBUILDING_MATERIAL_IDS) {
    materials[material] = MATERIALS_PER_TEN_BUILD_POINTS[material] * ratio;
  }
  return materials;
}

/**
 * Material demand forecast for one continuously supplied shipyard over one year.
 * The current recipe scales solely with construction work, but retaining the ship
 * class parameter makes this the single call site to update if later tiers acquire
 * distinct material recipes.
 */
export function getAnnualShipbuildingMaterialDemand(shipClass: ShipClass): ShipbuildingMaterials {
  return getMaterialsForWork(shipClass, SHIPYARD_BUILD_POINTS_PER_YEAR);
}

/**
 * The highest ship class whose tech-point and (optional) technology-graph tier requirements
 * are met. `maxTechTier` comes from the host technology graph
 * (docs/plan/technology-development-roadmap.md Phase 3): 0 = sloop only, 1 = caravel,
 * 2 = galleon. Omit or pass a high value to keep legacy tech-points-only behaviour in tests.
 */
export function getHighestUnlockedShipClass(
  techPoints: number,
  maxTechTier: number = Number.POSITIVE_INFINITY
): ShipClass {
  let unlocked = SHIP_CLASSES[0];
  for (const shipClass of SHIP_CLASSES) {
    if (techPoints >= shipClass.techPointsRequired && shipClass.tier <= maxTechTier) {
      unlocked = shipClass;
    }
  }
  return unlocked;
}

export function getShipClass(id: string): ShipClass | undefined {
  return SHIP_CLASSES.find(c => c.id === id);
}

export type ShipSizeTier = "small" | "medium" | "large";

/** Maps the tech-tree tier onto the small/medium/large port-berth categories used by `portCapacity.ts`. */
export function getShipSizeTier(shipClass: ShipClass): ShipSizeTier {
  if (shipClass.tier <= 0) return "small";
  if (shipClass.tier === 1) return "medium";
  return "large";
}

/**
 * Age-of-Sail ship class tech tree. Deliberately cannon-free: this world's baseline
 * combat doctrine is melee/bow (see docs/plan/shipbuilding.md), so tiers are built
 * around hull size, cargo/troop capacity, and seaworthiness rather than armament.
 * Gunpowder-driven ships of the line are an explicit future option, gated behind a
 * separate rule, not part of this default tree.
 */
export interface ShipClass {
  id: string;
  name: string;
  /** 0-indexed; higher tiers are larger/more advanced hulls. */
  tier: number;
  /** Cumulative state tech points required to unlock this tier. */
  techPointsRequired: number;
  /** Construction effort (build-points) required to complete one hull of this class. */
  buildPointsRequired: number;
}

export const SHIP_CLASSES: readonly ShipClass[] = [
  { id: "sloop", name: "Sloop", tier: 0, techPointsRequired: 0, buildPointsRequired: 10 },
  { id: "caravel", name: "Caravel", tier: 1, techPointsRequired: 50, buildPointsRequired: 25 },
  { id: "galleon", name: "Galleon", tier: 2, techPointsRequired: 150, buildPointsRequired: 60 }
];

/** The highest ship class whose tech requirement has been met by the given tech points. */
export function getHighestUnlockedShipClass(techPoints: number): ShipClass {
  let unlocked = SHIP_CLASSES[0];
  for (const shipClass of SHIP_CLASSES) {
    if (techPoints >= shipClass.techPointsRequired) unlocked = shipClass;
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

/** Shared ship-class catalogue used by Shipbuilding and Economy's tradable ship Goods. */
export interface ShipClassDefinition {
  id: string;
  name: string;
  tier: number;
  techPointsRequired: number;
  buildPointsRequired: number;
  /** Abstract cargo-hold capacity used by Economy trade shipments. */
  cargoCapacitySlots: number;
  /** Number of naval personnel that one completed state hull can sustain. */
  navalCrewCapacity: number;
  /**
   * "warship" classes are state navy only: never chosen as a merchant hull, a cargo carrier or a
   * shipyard's next tier. Unset means a merchant-capable class.
   */
  role?: "warship";
}

export const SHIP_CLASS_DEFINITIONS: readonly ShipClassDefinition[] = [
  {
    id: "sloop",
    name: "Sloop",
    tier: 0,
    techPointsRequired: 0,
    buildPointsRequired: 10,
    cargoCapacitySlots: 100,
    navalCrewCapacity: 100
  },
  {
    id: "caravel",
    name: "Caravel",
    tier: 1,
    techPointsRequired: 50,
    buildPointsRequired: 25,
    cargoCapacitySlots: 300,
    navalCrewCapacity: 300
  },
  {
    id: "galleon",
    name: "Galleon",
    tier: 2,
    techPointsRequired: 150,
    buildPointsRequired: 60,
    cargoCapacitySlots: 800,
    navalCrewCapacity: 800
  },
  {
    id: "steamship",
    name: "Steamship",
    tier: 3,
    techPointsRequired: 200,
    buildPointsRequired: 80,
    cargoCapacitySlots: 1100,
    navalCrewCapacity: 700
  },
  {
    // Oared warship of antiquity (trireme / liburnian): independent of the wind, many rowers,
    // little hold and short range (docs/plan/classical-antiquity-historical-period.md §6.6).
    id: "galley",
    name: "Galley",
    tier: 1,
    techPointsRequired: 0,
    buildPointsRequired: 20,
    cargoCapacitySlots: 30,
    navalCrewCapacity: 200,
    role: "warship"
  }
];

/** Classes merchants and cargo allocation may use (warships excluded). */
export const MERCHANT_SHIP_CLASS_DEFINITIONS: readonly ShipClassDefinition[] = SHIP_CLASS_DEFINITIONS.filter(
  shipClass => shipClass.role !== "warship"
);

export const SHIP_VALUE_PER_BUILD_POINT = 8;

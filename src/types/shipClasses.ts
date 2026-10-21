import { getCarrierCargoSlots } from "./cargoSlot";

/** Shared ship-class catalogue used by Shipbuilding and Economy's tradable ship Goods. */
export interface ShipClassDefinition {
  id: string;
  name: string;
  tier: number;
  techPointsRequired: number;
  buildPointsRequired: number;
  /** Cargo and its packing a hull can load, crew, stores, water and ballast apart. */
  deadweightKg: number;
  /** Hold room left for cargo. */
  holdLiters: number;
  /** Cargo slots (150 kg or 250 L each) the hold takes, from `deadweightKg` and `holdLiters`. */
  cargoCapacitySlots: number;
  /** Number of naval personnel that one completed state hull can sustain. */
  navalCrewCapacity: number;
  /**
   * "warship" classes are state navy only: never chosen as a merchant hull, a cargo carrier or a
   * shipyard's next tier. Unset means a merchant-capable class.
   */
  role?: "warship";
}

/**
 * Hold room per tonne of deadweight. Ships were measured by the tuns of wine they stowed, and a
 * tun of some 1 t took about 1.4 m³ of hold with the gaps around the casks (docs/plan/goods-
 * physical-units.md §5.4.3).
 */
const HOLD_LITERS_PER_DEADWEIGHT_TONNE = 1400;

/**
 * Defaults sit at the small end of each class (§5.4.3): colonial merchant sloops carried 25-70 t,
 * late caravels 100-150 t, Atlantic galleons 500-1,000 t. The Steamship stands between the 1850s
 * collier John Bowes (about 540 t) and the 1,368 t of the 1870s, after her engine and bunkers.
 */
const SHIP_CLASS_SPECS: readonly Omit<ShipClassDefinition, "holdLiters" | "cargoCapacitySlots">[] = [
  {
    id: "sloop",
    name: "Sloop",
    tier: 0,
    techPointsRequired: 0,
    buildPointsRequired: 10,
    deadweightKg: 50_000,
    navalCrewCapacity: 100
  },
  {
    id: "caravel",
    name: "Caravel",
    tier: 1,
    techPointsRequired: 50,
    buildPointsRequired: 25,
    deadweightKg: 100_000,
    navalCrewCapacity: 300
  },
  {
    id: "galleon",
    name: "Galleon",
    tier: 2,
    techPointsRequired: 150,
    buildPointsRequired: 60,
    deadweightKg: 500_000,
    navalCrewCapacity: 800
  },
  {
    id: "steamship",
    name: "Steamship",
    tier: 3,
    techPointsRequired: 200,
    buildPointsRequired: 80,
    deadweightKg: 1_000_000,
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
    deadweightKg: 5_400,
    navalCrewCapacity: 200,
    role: "warship"
  }
];

export const SHIP_CLASS_DEFINITIONS: readonly ShipClassDefinition[] = SHIP_CLASS_SPECS.map(spec => {
  const holdLiters = Math.round((spec.deadweightKg / 1000) * HOLD_LITERS_PER_DEADWEIGHT_TONNE);
  return { ...spec, holdLiters, cargoCapacitySlots: getCarrierCargoSlots(spec.deadweightKg, holdLiters) };
});

/** Classes merchants and cargo allocation may use (warships excluded). */
export const MERCHANT_SHIP_CLASS_DEFINITIONS: readonly ShipClassDefinition[] = SHIP_CLASS_DEFINITIONS.filter(
  shipClass => shipClass.role !== "warship"
);

export const SHIP_VALUE_PER_BUILD_POINT = 8;

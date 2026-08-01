/** Shared ship-class catalogue used by Shipbuilding and Economy's tradable ship Goods. */
export interface ShipClassDefinition {
  id: string;
  name: string;
  tier: number;
  techPointsRequired: number;
  buildPointsRequired: number;
  /** Abstract cargo-hold capacity used by Economy trade shipments. */
  cargoCapacitySlots: number;
}

export const SHIP_CLASS_DEFINITIONS: readonly ShipClassDefinition[] = [
  { id: "sloop", name: "Sloop", tier: 0, techPointsRequired: 0, buildPointsRequired: 10, cargoCapacitySlots: 100 },
  { id: "caravel", name: "Caravel", tier: 1, techPointsRequired: 50, buildPointsRequired: 25, cargoCapacitySlots: 300 },
  { id: "galleon", name: "Galleon", tier: 2, techPointsRequired: 150, buildPointsRequired: 60, cargoCapacitySlots: 800 }
];

export const SHIP_VALUE_PER_BUILD_POINT = 8;

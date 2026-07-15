/** Shared ship-class catalogue used by Shipbuilding and Economy's tradable ship Goods. */
export interface ShipClassDefinition {
  id: string;
  name: string;
  tier: number;
  techPointsRequired: number;
  buildPointsRequired: number;
}

export const SHIP_CLASS_DEFINITIONS: readonly ShipClassDefinition[] = [
  { id: "sloop", name: "Sloop", tier: 0, techPointsRequired: 0, buildPointsRequired: 10 },
  { id: "caravel", name: "Caravel", tier: 1, techPointsRequired: 50, buildPointsRequired: 25 },
  { id: "galleon", name: "Galleon", tier: 2, techPointsRequired: 150, buildPointsRequired: 60 }
];

export const SHIP_VALUE_PER_BUILD_POINT = 8;

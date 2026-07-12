export interface Market {
  i: number;
  centerBurgId: number;
  color: string;
  name?: string;
  managerCharacterId?: number;
  goods: Record<number, { stock: number; price: number }>;
  foodLedger?: FoodLedger;
}

export interface FoodLedger {
  foodProduced: number;
  ruralNeed: number;
  urbanNeed: number;
  exportable: number;
  importNeed: number;
  targetStock: number;
}

export interface Deal {
  i: number;
  seller: number;
  sellerType: "burg" | "market";
  buyer: number;
  buyerType: "burg" | "market";
  good: number;
  units: number;
  price: number;
  tax: number;
  distance?: number;
  durationDays?: number;
  maintenanceCost?: number;
  accountingPeriodDays?: 7 | 30;
  spawned?: boolean;
}

export type TradeRouteSegment = {
  type: "land" | "water";
  points: [number, number][];
};

export interface Caravan {
  i: number;
  seller: number;
  sellerType: "burg" | "market";
  buyer: number;
  buyerType: "burg" | "market";
  payload: { goodId: number; dealId: number; units: number; value: number }[];
  units: number; // total units
  value: number; // total payload value
  merchantOrganizationId?: number;
  /** Land draft-animal type id (see DRAFT_ANIMAL_TYPES in caravanMovement.ts); "horse" for every caravan today. */
  draftAnimalId: string;
  routeSegments: TradeRouteSegment[];
  totalDistance: number;
  currentDistance: number;
  state: "transit" | "arrived" | "lost";
}

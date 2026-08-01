export interface Market {
  i: number;
  centerBurgId: number;
  color: string;
  name?: string;
  managerCharacterId?: number;
  /** Two merchants competing with the market manager across this market's burgs. */
  rivalCharacterIds?: number[];
  goods: Record<
    number,
    {
      stock: number;
      price: number;
      /**
       * Manufactured goods only: this cycle's average local ingredient cost (the same figure
       * `initializeMarketPrices()` used to price the good), persisted so guild-margin accounting
       * (guildTreasury.ts) can credit a domain guild for its actual value-added rather than gross
       * sale revenue. Undefined for raw/gathered goods, which have no recipe cost to subtract.
       */
      costBasis?: number;
    }
  >;
  foodLedger?: FoodLedger;
  /** Working capital of the market manager's merchant company; separate from Burg/State treasury. */
  marketTreasury?: MarketTreasury;
  /**
   * Decaying gauge of recent caravan cargo (units) delivered here, updated in `Caravans.tick()`.
   * Drives the `"trade"` LaborMarket occupation's demand (docs/plan/urban-employment-demand.md §3.3/§5.1-6).
   */
  caravanArrivalVolume?: number;
  /**
   * 0..1 saturating EWMA of annual Tools (iron farm implements) investment coverage across this
   * market's cultivated land. Feeds cellAgriculturalModifier in agriculturalLandUse.ts. Undefined
   * (pre-Phase-1 saves, or a market with no cultivated land yet) is treated as 0.
   * See docs/plan/rural-agtech-investment.md §3.2-3.3.
   */
  agTechStock?: number;
}

export interface MarketTreasury {
  /** Liquid purchasing power used to pay rural Grain producers. */
  balance: number;
  /** Aggregate unpaid farmgate debt owed to rural Grain producers when balance was insufficient. */
  ruralGrainPayable: number;
}

export interface FoodLedger {
  foodProduced: number;
  ruralNeed: number;
  urbanNeed: number;
  exportable: number;
  importNeed: number;
  targetStock: number;
  /** Food that reached this market after route spoilage and security losses. */
  satisfiedImport: number;
  /** Additional urban carrying capacity in population points supported by those imports. */
  importCapacityBonus: number;
  /** Staple food (Grain) stock 0-3 months old. Newest bucket; production/imports land here. */
  foodStockAge0: number;
  /** Staple food stock 3-6 months old. */
  foodStockAge1: number;
  /** Staple food stock 6-9 months old. Oldest bucket; consumed/overflowed first. */
  foodStockAge2: number;
  /** Weighted-average farmgate unit cost of foodStockAge0. */
  foodStockAge0UnitCost: number;
  /** Weighted-average farmgate unit cost of foodStockAge1. */
  foodStockAge1UnitCost: number;
  /** Weighted-average farmgate unit cost of foodStockAge2. */
  foodStockAge2UnitCost: number;
  /** Cumulative staple food aged/capped out of the ledger with no export sink yet (v1: recorded only, not consumed). */
  storageOverflow: number;
  /** Consecutive quarters the rural population's food need went unmet by >=5%. Reset below 5%. */
  ruralFoodStressQuarters: number;
  /** Consecutive quarters the urban population's food need went unmet by >=5%. Reset below 5%. */
  urbanFoodStressQuarters: number;
  /** Consecutive quarters the rural population's food need went unmet by >=10%. Reset below 10%. */
  ruralSevereDeficitQuarters: number;
  /** Consecutive quarters the urban population's food need went unmet by >=10%. Reset below 10%. */
  urbanSevereDeficitQuarters: number;
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
  /** Quantity that has not yet been placed on a shipment. Missing on legacy deals means `units`. */
  remainingUnits?: number;
  spawned?: boolean;
  /** Purpose metadata is only set for state-funded strategic procurement. */
  purpose?: "strategicProcurement";
  payerStateId?: number;
  strategicProcurementOrderId?: number;
}

export type TransportAllocation = {
  mode: "land" | "water";
  transportId: string;
  transportName: string;
  unitCount: number;
  capacitySlots: number;
  usedSlots: number;
  draftAnimalId?: string;
  requiredDraftAnimals?: number;
};

export type TransportAssetState = "available" | "reserved" | "inTransit" | "maintenance";

/** Aggregate land vehicles owned by one market's merchant company. */
export type MerchantLandAssetBalance = {
  assetId: "pack-train" | "cart" | "wagon";
  available: number;
  reserved: number;
  inTransit: number;
  maintenance: number;
  /** Days remaining until the currently-maintained group returns to service. */
  recoveryDays: number;
};

/** Durable transport assets owned by a market, separate from saleable Market.goods. */
export type MerchantTransportLedger = {
  marketId: number;
  /** Derived display reference only; marketId remains the ownership key. */
  organizationId?: number;
  landAssets: MerchantLandAssetBalance[];
  lastReconciledTick: number;
};

export type TransportReservation = {
  id: number;
  dispatcherMarketId: number;
  caravanId: number;
  allocations: TransportAllocation[];
  state: "reserved" | "inTransit" | "released" | "lost" | "cancelled";
};

/**
 * Route polyline vertex. Cell id (pack.cells index) is required for grade-aware land travel;
 * `[x, y]` alone falls back to planar-only duration (legacy / speculative rows).
 */
export type TradeRoutePoint = [number, number] | [number, number, number];

export type TradeRouteSegment = {
  type: "land" | "water";
  points: TradeRoutePoint[];
};

export interface Caravan {
  i: number;
  seller: number;
  sellerType: "burg" | "market";
  buyer: number;
  buyerType: "burg" | "market";
  payload: {
    goodId: number;
    dealId: number;
    units: number;
    value: number;
    /** Cargo profile snapshotted at loading time so later catalogue edits do not rewrite a manifest. */
    cargoSlotsPerUnit?: number;
    strategicProcurementOrderId?: number;
  }[];
  units: number; // total units
  value: number; // total payload value
  merchantOrganizationId?: number;
  /** Land draft-animal type id (see DRAFT_ANIMAL_TYPES in caravanMovement.ts); "horse" for every caravan today. */
  draftAnimalId: string;
  /** Per-mode convoy / vessel capacity selected when this shipment was loaded. */
  transportAllocations?: TransportAllocation[];
  /** Present only when this caravan has reserved a market-owned land transport asset. */
  transportReservationId?: number;
  /** Market that dispatched the reserved land transport asset. */
  transportDispatcherMarketId?: number;
  routeSegments: TradeRouteSegment[];
  totalDistance: number;
  currentDistance: number;
  /**
   * Spawn-time baked planar legs for advanceCaravan (Phase 2).
   * `endKm` is cumulative planar km; `speedKmPerDay` is fixed until arrival.
   * Missing on legacy caravans → recompute from segments each tick (fallback).
   */
  travelLegs?: { endKm: number; speedKmPerDay: number }[];
  state: "transit" | "arrived" | "lost";
}

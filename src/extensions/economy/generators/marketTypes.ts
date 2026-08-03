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
  /** Merchant export-warehouse security from 0 (unsafe) to 100 (secure). Seeded at 50; no effects yet. */
  warehouseSecurity?: number;
  /** Merchant export-warehouse sanitation from 0 (unsanitary) to 100 (sanitary). Seeded at 50; no effects yet. */
  warehouseSanitation?: number;
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
  /**
   * Merchant company working capital for inter-market trade (export warehouse booking).
   * Soft ledger: not full B2B settlement between markets.
   */
  tradeWorkingCapital?: number;
  /** Capital currently locked in export staging lots and in-transit cargo. */
  tradeCapitalLocked?: number;
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
  /** Links a market↔market deal to its export-warehouse lot (Phase C). */
  stagingLotId?: number;
  /** Purpose metadata is only set for state-funded strategic procurement. */
  purpose?: "strategicProcurement";
  payerStateId?: number;
  strategicProcurementOrderId?: number;
}

/**
 * Merchant export warehouse lot: goods already removed from retail stock and waiting to load
 * onto a caravan bound for `destinationMarketId`. Survives production-cycle deal wipes.
 * @see docs/plan/merchant-logistics-warehouses.md Phase C
 */
export type ExportStagingLot = {
  id: number;
  /** Origin market (warehouse location). */
  marketId: number;
  destinationMarketId: number;
  goodId: number;
  units: number;
  /** Landed unit cost snapshot at booking (price used on the accounting deal). */
  unitCost: number;
  /** Working capital locked against this lot (Phase D). */
  lockedCapital?: number;
  /** Optional link back to the Deal created when this lot was booked. */
  dealId?: number;
  /** Route metadata copied from the booking deal for packing / UI. */
  distance?: number;
  durationDays?: number;
  maintenanceCost?: number;
  taxPerUnit?: number;
};

export type TransportAllocation = {
  mode: "land" | "water" | "river";
  transportId: string;
  transportName: string;
  unitCount: number;
  capacitySlots: number;
  usedSlots: number;
  draftAnimalId?: string;
  requiredDraftAnimals?: number;
  /** Concrete Shipbuilding hulls used for a physical water allocation. */
  shipHullIds?: number[];
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

/** Aggregate shallow-draft vessels. Unlike sea hulls, river barges are Economy-owned assets. */
export type MerchantRiverAssetBalance = {
  assetId: "river-barge";
  available: number;
  reserved: number;
  inTransit: number;
  maintenance: number;
  recoveryDays: number;
};

/** Economy's durable reference to one Shipbuilding-owned merchant hull. */
export type MerchantWaterAssetReference = {
  shipHullId: number;
  shipClassId: string;
  homeBurgId: number;
  state: TransportAssetState;
  reservationId?: number;
};

/** Durable transport assets owned by a market, separate from saleable Market.goods. */
export type MerchantTransportLedger = {
  marketId: number;
  /** Derived display reference only; marketId remains the ownership key. */
  organizationId?: number;
  landAssets: MerchantLandAssetBalance[];
  riverAssets: MerchantRiverAssetBalance[];
  /** References only; Shipbuilding's ShipHull remains the source of truth. */
  waterAssets: MerchantWaterAssetReference[];
  lastReconciledTick: number;
};

export type TransportReservation = {
  id: number;
  dispatcherMarketId: number;
  caravanId: number;
  allocations: TransportAllocation[];
  state: "reserved" | "inTransit" | "released" | "lost" | "cancelled";
};

/** A durable-asset order. Its output is credited to MerchantTransportLedger, never Market.goods. */
export type TransportAssetOrderStatus = "queued" | "waitingMaterials" | "building" | "completed" | "cancelled";
export type TransportAssetOrder = {
  id: number;
  marketId: number;
  requestedBy: "simulation" | "player";
  blueprintId: "pack-train" | "cart" | "wagon" | "river-barge";
  quantity: number;
  completedQuantity: number;
  /** Player orders may not reserve materials whose total current price exceeds this amount. */
  budgetLimit?: number;
  fundedAmount: number;
  /** Materials removed from market stock but not yet consumed by a completed asset. */
  reservedMaterials: Record<number, number>;
  workPoints: number;
  status: TransportAssetOrderStatus;
  blockedReason?: "insufficientTreasury" | "budgetLimit" | "missingMaterials" | "missingCraftWorkers";
};

/**
 * Route polyline vertex. Cell id (pack.cells index) is required for grade-aware land travel;
 * `[x, y]` alone falls back to planar-only duration (legacy / speculative rows).
 */
export type TradeRoutePoint = [number, number] | [number, number, number];

export type TradeRouteSegment = {
  /** `water` is retained only for caravans saved before sea and river legs were separated. */
  type: "land" | "water" | "sea" | "river";
  points: TradeRoutePoint[];
};

/** Port / yard accumulation before a commercial shipment sails. */
export type CaravanLoadingState = {
  /** Days already spent waiting for a fuller hold (advanced in Caravans.tick). */
  waitedDays: number;
  /** Sail once waitedDays reaches this, if utilization clears the min floor. */
  maxWaitDays: number;
  /** Preferred fill ratio before early departure (e.g. 0.55). */
  targetUtilization: number;
  /** Hard floor; below this after maxWait the shipment is cancelled rather than sailing nearly empty. */
  minSailUtilization: number;
  /** Capacity the shipment is accumulating toward (usually one vehicle / hull bottleneck). */
  plannedCapacitySlots: number;
  /** Calendar sail days of month (e.g. 1, 10, 20) used for scheduled departures. */
  sailScheduleDays?: number[];
  /** Next calendar sail day (1–31) from the current simulation day. */
  nextSailDay?: number;
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
    /** Present when this payload was taken from an export warehouse lot. */
    stagingLotId?: number;
    /** Working capital still locked against this cargo until arrival / cancel / loss. */
    lockedCapital?: number;
    /**
     * Staple food (Food Ledger) riding free capacity on a commercial caravan.
     * Settled via foodCoLoad helpers, not ordinary retail stock transfer.
     */
    isFoodCoLoad?: boolean;
    /** Farmgate / draw unit cost for food co-load settlement. */
    unitCost?: number;
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
  /**
   * `loading` = accumulating cargo at origin (not drawn on the map).
   * `transit` = moving. `arrived` / `lost` are terminal and removed after tick settlement.
   */
  state: "loading" | "transit" | "arrived" | "lost";
  /** Present while state === "loading". */
  loading?: CaravanLoadingState;
  /**
   * Why this shipment left (or was cancelled). Set when leaving loading / cancel-thin.
   * Values: depart-full | depart-schedule | depart-overdue | cancelled-thin
   */
  departReason?: "depart-full" | "depart-schedule" | "depart-overdue" | "cancelled-thin" | "waiting";
}

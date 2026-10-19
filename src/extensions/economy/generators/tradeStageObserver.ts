/**
 * Read-only tap on the global trade matching (docs/plan/approach-commerce-quarters.md §4.4): how
 * many exporter → importer pairs reach each gate, and the distance of the deals that are struck.
 * Headless observation installs it; with no observer the trade pass does no extra work.
 */
export type TradeStage =
  /** A surplus market and a short market, each with at least one trade lot to spare or need. */
  | "pair"
  | "noRoute"
  /** Cargo rules for the route (value density over distance, spoilage, heat). */
  | "shipmentRule"
  /** Beyond every merchant house's reach for that duration. */
  | "orgReach"
  /** No house has agents in both markets. */
  | "noHouse"
  | "unprofitable"
  | "candidate"
  | "speculative"
  | "routeNotViable"
  | "belowFlowBudget"
  | "quoteUnprofitable"
  | "noCapital"
  /** The importer cannot pay for more cargo (paid cargo only, long-distance-merchant-reach-capital.md §5.1). */
  | "noBuyerCash"
  | "deal";

export interface TradeStageEvent {
  readonly stage: TradeStage;
  readonly goodId: number;
  readonly exporterId: number;
  readonly importerId: number;
  readonly durationDays?: number;
  readonly distanceKm?: number;
  readonly units?: number;
  readonly value?: number;
  /** `orgReach`: the gate that kept every house out (docs/plan/long-distance-merchant-reach-capital.md R0). */
  readonly reason?: MarketReachRefusal;
  /** `noCapital`: what the booking needed and what the exporter's house could deploy. */
  readonly capitalNeeded?: number;
  readonly capitalAvailable?: number;
  /** `noCapital`: the house's cash before the coin-shortage factor. */
  readonly capitalCash?: number;
}

/**
 * Why no merchant house may trade a pair: beyond its days, outside its home ground, a market with
 * no centre town, a village too small for a great house, or two towns a local house leaves alone.
 */
export type MarketReachRefusal = "tooFar" | "outsideHomeGround" | "noCenter" | "smallVillage" | "localScale";

export type TradeStageObserver = (event: TradeStageEvent) => void;

let observer: TradeStageObserver | null = null;

export function setTradeStageObserver(next: TradeStageObserver | null): void {
  observer = next;
}

/** Callers use `getTradeStageObserver()?.(event)` so the event is only built when observed. */
export function getTradeStageObserver(): TradeStageObserver | null {
  return observer;
}

/**
 * Why an export-warehouse lot did or did not go onto a caravan in one loading pass
 * (docs/plan/long-distance-merchant-reach-capital.md R0, §5.3).
 */
export type LotDispatchOutcome =
  /** Some of the lot was placed on a caravan. */
  | "loaded"
  /** Origin or destination market (or its centre town) is gone. */
  | "noEndpoint"
  /** The two markets are no longer in one state (state-bounded territories). */
  | "notDomestic"
  /** The caravan planner finds no path between the two centres. */
  | "noRoute"
  /** Cargo rules refuse the good on the caravan's own route (it may differ from the trade's route). */
  | "shipmentRule"
  /** No market can dispatch transport for the route. */
  | "noDispatcher"
  /** The dispatcher has no free cart, barge or hull for the route. */
  | "noTransport"
  /** Transport exists but the manifest takes none of the lot (cargo too large, or packing found no room). */
  | "notPacked";

export interface LotDispatchEvent {
  readonly lotId: number;
  readonly exporterId: number;
  readonly importerId: number;
  readonly goodId: number;
  readonly outcome: LotDispatchOutcome;
  /** Units left in the lot after the pass. */
  readonly units: number;
  readonly lockedCapital: number;
  readonly durationDays?: number;
}

export type LotDispatchObserver = (event: LotDispatchEvent) => void;

let lotDispatchObserver: LotDispatchObserver | null = null;

export function setLotDispatchObserver(next: LotDispatchObserver | null): void {
  lotDispatchObserver = next;
}

export function getLotDispatchObserver(): LotDispatchObserver | null {
  return lotDispatchObserver;
}

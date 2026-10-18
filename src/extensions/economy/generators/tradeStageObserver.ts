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
}

export type TradeStageObserver = (event: TradeStageEvent) => void;

let observer: TradeStageObserver | null = null;

export function setTradeStageObserver(next: TradeStageObserver | null): void {
  observer = next;
}

/** Callers use `getTradeStageObserver()?.(event)` so the event is only built when observed. */
export function getTradeStageObserver(): TradeStageObserver | null {
  return observer;
}

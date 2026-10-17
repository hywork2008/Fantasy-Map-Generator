/** Per-approach traffic (docs/plan/approach-traffic-observatory.md §4.3). */

export type ApproachMode = "land" | "river" | "sea" | "open";

export interface ApproachFlow {
  departures: number;
  cargoSlots: number;
  value: number;
}

export interface ApproachTraffic {
  /** Same key as the City Editor road entry (`src/services/approachId.ts`). */
  approachId: string;
  burgId: number;
  routeId: number | null;
  mode: ApproachMode;
  /** Decayed totals, same 0.7 yearly retention as TradeCorridor. */
  inbound: ApproachFlow;
  outbound: ApproachFlow;
  /** Journeys that pass the burg on the way elsewhere (inns and stables, not the market). */
  through: { departures: number; cargoSlots: number };
  /** Cargo slots per good id, busiest 8. */
  goodsSlots: Record<string, number>;
  /** Cargo slots per partner burg id, busiest 8. */
  partners: Record<string, number>;
}

/** One journey, described by its path. */
export interface ApproachJourney {
  originBurgId: number;
  destinationBurgId: number;
  cargoSlots: number;
  value: number;
  goods: { id: number; slots: number }[];
}

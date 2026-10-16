import type { SiteTradePartner } from "../../../services/burgSiteEconomy";

export interface TradeCorridor {
  /** Smaller burg id first. The pair is undirected. */
  burgA: number;
  burgB: number;
  /** Departure count, decayed yearly by `CORRIDOR_ANNUAL_RETENTION`. */
  departures: number;
  /** Cargo slots, decayed the same way. */
  cargoSlots: number;
  value: number;
  /** Cargo-slot split. The three numbers add up to `cargoSlots`. */
  byMode: { land: number; river: number; sea: number };
  /** EWMA of the journey actually planned, in days. */
  meanTravelDays: number;
  /** Latest journey timed as if every land leg were a paved road. */
  idealTravelDays: number;
  /** 0..1, from escort postings on this pair. */
  threat: number;
  /** Land route ids, busiest first. */
  routeIds: number[];
  /** How often those routes used a ferry instead of a bridge. */
  ferryCrossings: number;
  /** Departures per land route. Kept so the order survives a reload. */
  routeHits: Record<string, number>;
  /** Cargo slots per good id. */
  goodsSlots: Record<string, number>;
}

export interface CorridorMovement {
  originBurgId: number;
  destinationBurgId: number;
  cargoSlots: number;
  value: number;
  /** Shares of path length. They should add up to 1. */
  modeShare: { land: number; river: number; sea: number };
  observedDays: number;
  idealDays: number;
  routeIds: number[];
  ferryCrossings: number;
  /** 0..1. Omitted when this journey has no escort posting. */
  threat?: number;
  goods?: { id: number; slots: number }[];
}

export interface TradeCorridorNeed {
  burgA: number;
  burgB: number;
  nameA: string;
  nameB: string;
  cargoSlots: number;
  /** 0..1 rank of cargo among corridors that carry any. */
  demand: number;
  /** meanTravelDays / idealTravelDays. 1 when the ideal is unknown. */
  delay: number;
  threat: number;
  /** ferryCrossings / departures. */
  ferryShare: number;
  harborShort: boolean;
  mode: SiteTradePartner["mode"];
}

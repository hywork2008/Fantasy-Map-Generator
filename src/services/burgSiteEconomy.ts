/**
 * FMG → City Editor economy profile (docs/plan/fmg-economy-to-city-editor.md §5.1).
 * Host builds it; City Editor keeps a type copy in core/gen/site/burgSiteEconomy.ts.
 * Optional on the descriptor, so a missing profile leaves city generation unchanged.
 */

export const GUILD_DOMAINS = [
  "metallurgy",
  "woodworking",
  "masonry",
  "textiles",
  "leather",
  "glassware",
  "instruments",
  "printing"
] as const;

export type GuildDomain = (typeof GUILD_DOMAINS)[number];

export interface SiteGuild {
  domain: GuildDomain;
  /** chapter = formal hall. informal = practitioners only, no hall. */
  status: "chapter" | "informal";
  /**
   * Real people (population points × populationRate).
   * Zero is intentional: the hall and its yards are still built, and no craftsman street is allocated.
   */
  practitioners: number;
  /** Hall standing 0..1 from technique stock and guild treasury. */
  prestige: number;
  foundedYear: number | null;
}

export interface BurgSiteEconomy {
  version: 1;
  /** Simulation year. City Editor shows this as the profile's date. */
  year: number;
  commerce: {
    /** 0..1 stand-in from caravan arrivals. Pair volume lives on tradePartners. */
    rank: number;
    marketCenter: boolean;
    merchantHouse: "major" | "minor" | null;
    mint: boolean;
    /** World rank of Market.caravanArrivalVolume. 0 when this burg is not a market center. */
    caravanArrivalRank: number;
  };
  guilds: SiteGuild[];
  /** Lot→m² yards, already capped to the town disc. */
  storage: SiteStorageYard[];
  /** Inns, shipyards and other non-guild works. Empty until that slice lands. */
  facilities: unknown[];
  /** Up to eight partners from the corridor ledger, busiest first. */
  tradePartners: SiteTradePartner[];
}

export const STORAGE_FORMS = [
  "livestockPen",
  "timberYard",
  "stoneYard",
  "fuelStack",
  "granary",
  "cellar",
  "warehouse"
] as const;

export type StorageForm = (typeof STORAGE_FORMS)[number];

export interface SiteStorageYard {
  form: StorageForm;
  /** Ground area in square metres, after the town-disc cap. */
  areaM2: number;
  /** Largest goods in this yard, for labels. */
  mainGoods: string[];
  /** Compass bearing of the partner that sends these goods. 0 is north. */
  inflowAzimuthDeg: number | null;
  /** Timber rafts and stone barges sit on the bank. */
  waterborne: boolean;
}

export interface SiteTradePartner {
  burgId: number;
  name: string;
  /** Decayed cargo slots on the pair. Partners of one burg compare on this number. */
  annualSlots: number;
  mode: "land" | "river" | "sea";
  /** Busiest land route on the pair. Null when the pair has no land route. */
  routeId: number | null;
  mainGoods: string[];
}

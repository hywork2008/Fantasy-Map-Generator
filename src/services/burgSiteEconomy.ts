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
    /** 0..1 stand-in from caravan arrivals until the corridor ledger exists. */
    rank: number;
    marketCenter: boolean;
    merchantHouse: "major" | "minor" | null;
    mint: boolean;
    /** World rank of Market.caravanArrivalVolume. 0 when this burg is not a market center. */
    caravanArrivalRank: number;
  };
  guilds: SiteGuild[];
  /** Storage yards are filled once lot→m² coefficients are calibrated. */
  storage: unknown[];
  /** Inns, shipyards and other non-guild works. Empty until that slice lands. */
  facilities: unknown[];
  tradePartners: unknown[];
}

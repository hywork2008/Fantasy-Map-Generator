import type { GUILD_DOMAINS, STORAGE_FORMS } from "../../data/siteEconomy";

export interface BurgSiteEconomy {
  version: 1;
  year: number;
  commerce: {
    rank: number;
    marketCenter: boolean;
    merchantHouse: "major" | "minor" | null;
    mint: boolean;
    caravanArrivalRank: number;
  };
  guilds: SiteGuild[];
  storage: SiteStorageYard[];
  /** Wayside inns (`inn`) and caravanserais. Other lodging classes are not listed. */
  facilities: SiteLodging[];
  tradePartners: SiteTradePartner[];
  /**
   * Grain mills. Wind is 0 or 1. Water is a count of river sites.
   * Absent: windmill and watermill counts stay on the population bands.
   */
  mills?: { wind: number; water: number };
}

export interface SiteStorageYard {
  form: StorageForm;
  areaM2: number;
  mainGoods: string[];
  inflowAzimuthDeg: number | null;
  /** Forest or quarry bearing. 0 is north, clockwise. Land timber and stone only. */
  supplyAzimuthDeg?: number;
  /** Public-works granary. Stock yards omit this. */
  origin?: "publicWorks";
  waterborne: boolean;
}

export type StorageForm = (typeof STORAGE_FORMS)[number];

export interface SiteGuild {
  domain: GuildDomain;
  status: "chapter" | "informal";
  /** Real people. Zero still produces a hall and yards; it does not produce a craftsman street. */
  practitioners: number;
  prestige: number;
  foundedYear: number | null;
}

export type GuildDomain = (typeof GUILD_DOMAINS)[number];

/** Gate lodging. Courtyard area follows `stableSpaces`. */
export interface SiteLodging {
  kind: "inn" | "caravanserai";
  count: number;
  /** Condition 0..1. */
  scale: number;
  stableSpaces: number;
}

export interface SiteTradePartner {
  burgId: number;
  name: string;
  annualSlots: number;
  mode: "land" | "river" | "sea";
  routeId: number | null;
  mainGoods: string[];
}

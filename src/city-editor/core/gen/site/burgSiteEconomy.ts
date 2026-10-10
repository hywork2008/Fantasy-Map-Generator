/**
 * Type copy of src/services/burgSiteEconomy.ts.
 * The city page does not import the world-map module graph. Keep the two in sync.
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
  status: "chapter" | "informal";
  /** Real people. Zero still produces a hall and yards; it does not produce a craftsman street. */
  practitioners: number;
  prestige: number;
  foundedYear: number | null;
}

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
  storage: unknown[];
  facilities: unknown[];
  tradePartners: SiteTradePartner[];
}

export interface SiteTradePartner {
  burgId: number;
  name: string;
  annualSlots: number;
  mode: "land" | "river" | "sea";
  routeId: number | null;
  mainGoods: string[];
}

const DOMAINS = new Set<string>(GUILD_DOMAINS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clamp01(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, n));
}

function guildFrom(raw: unknown): SiteGuild | null {
  if (!isRecord(raw) || typeof raw.domain !== "string" || !DOMAINS.has(raw.domain)) return null;
  if (raw.status !== "chapter" && raw.status !== "informal") return null;
  const people = typeof raw.practitioners === "number" && Number.isFinite(raw.practitioners) ? raw.practitioners : 0;
  const founded =
    typeof raw.foundedYear === "number" && Number.isFinite(raw.foundedYear) ? Math.round(raw.foundedYear) : null;
  return {
    domain: raw.domain as SiteGuild["domain"],
    status: raw.status,
    practitioners: Math.max(0, Math.round(people)),
    prestige: clamp01(raw.prestige),
    foundedYear: founded
  };
}

/** Drop a malformed profile. A chapter with zero practitioners is valid and kept. */
export function sanitizeBurgSiteEconomy(raw: unknown): BurgSiteEconomy | null {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.guilds)) return null;
  const year = typeof raw.year === "number" && Number.isFinite(raw.year) ? Math.round(raw.year) : 0;
  const commerce = isRecord(raw.commerce) ? raw.commerce : {};
  const house = commerce.merchantHouse;
  return {
    version: 1,
    year,
    commerce: {
      rank: clamp01(commerce.rank),
      marketCenter: commerce.marketCenter === true,
      merchantHouse: house === "major" || house === "minor" ? house : null,
      mint: commerce.mint === true,
      caravanArrivalRank: clamp01(commerce.caravanArrivalRank)
    },
    guilds: raw.guilds.flatMap(entry => {
      const guild = guildFrom(entry);
      return guild ? [guild] : [];
    }),
    storage: [],
    facilities: [],
    tradePartners: partnersFrom(raw.tradePartners)
  };
}

function partnersFrom(raw: unknown): SiteTradePartner[] {
  if (!Array.isArray(raw)) return [];
  const partners: SiteTradePartner[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || !Number.isInteger(entry.burgId) || (entry.burgId as number) <= 0) continue;
    if (typeof entry.name !== "string") continue;
    const slots = typeof entry.annualSlots === "number" && Number.isFinite(entry.annualSlots) ? entry.annualSlots : 0;
    const mode = entry.mode === "river" || entry.mode === "sea" ? entry.mode : entry.mode === "land" ? "land" : null;
    if (!mode) continue;
    const routeId = Number.isInteger(entry.routeId) ? (entry.routeId as number) : null;
    const mainGoods = Array.isArray(entry.mainGoods)
      ? entry.mainGoods.filter((good): good is string => typeof good === "string")
      : [];
    partners.push({
      burgId: entry.burgId as number,
      name: entry.name,
      annualSlots: Math.max(0, slots),
      mode,
      routeId,
      mainGoods
    });
  }
  return partners;
}

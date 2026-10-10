import type { BurgSiteEconomy, GuildDomain, SiteGuild, SiteLodging } from "../../../services/burgSiteEconomy";
import { GUILD_DOMAINS } from "../../../services/burgSiteEconomy";
import {
  getGoods,
  getGuildChapters,
  getGuildKnowledgeStocks,
  getInnFacilities,
  getMarkets,
  getMerchantOrganizations,
  getMintLedgers,
  getSimulationYear,
  getTradeCorridors,
  getWorldContext,
  isEconomyContextReady
} from "../economyContext";
import type { GuildChapter } from "./guildChapterTypes";
import { collectGuildPractitioners } from "./guildKnowledge";
import type { CraftKnowledgeDomain, GuildKnowledgeStock } from "./guildKnowledgeTypes";
import { millCountsForBurg } from "./millCapacity";
import { storageYardsForBurg } from "./siteEconomyFootprint";
import { tradePartnersForBurg } from "./tradeCorridorLedger";

/**
 * Burg profile handed to City Editor (docs/plan/fmg-economy-to-city-editor.md §5).
 * A formal guild chapter is included even when it has no craftsmen. That headcount
 * is kept at zero on purpose, so the city draws the hall and yards without a craftsman population.
 */

const DOMAIN_SET = new Set<string>(GUILD_DOMAINS);

export interface GuildProjectionInput {
  burgId: number;
  /** People per population point. A missing rate is treated as 1 so a test double does not erase workers. */
  populationRate: number;
  chapters: readonly Pick<GuildChapter, "domain" | "foundedYear" | "suitability">[];
  /** Live practitioner headcount in population points, already summed per domain. */
  practitioners: readonly { domain: CraftKnowledgeDomain; workers: number }[];
  /** Every burg's technique stocks, used only to rank this burg's prestige. */
  stocks: readonly Pick<GuildKnowledgeStock, "burgId" | "domain" | "stock" | "treasury">[];
}

function isDomain(domain: string): domain is GuildDomain {
  return DOMAIN_SET.has(domain);
}

function peopleOf(points: number, populationRate: number): number {
  if (points <= 0) return 0;
  const people = Math.round(points * populationRate);
  return people > 0 ? people : 1;
}

function stockScore(stock: number, treasury: number): number {
  return Math.max(0, stock) * 1000 + Math.min(1000, Math.max(0, treasury));
}

function percentile(score: number, scores: readonly number[]): number {
  if (score <= 0 || scores.length === 0) return 0;
  const atMost = scores.filter(other => other <= score).length;
  return Math.round((atMost / scores.length) * 10000) / 10000;
}

/** Chapters with no practitioners stay in the list. Informal guilds need at least one craftsman. */
export function projectBurgGuilds(input: GuildProjectionInput): SiteGuild[] {
  const rate = Math.max(0, input.populationRate) || 1;
  const workers = new Map<GuildDomain, number>();
  for (const entry of input.practitioners) {
    if (!isDomain(entry.domain) || entry.workers <= 0) continue;
    workers.set(entry.domain, (workers.get(entry.domain) ?? 0) + entry.workers);
  }
  const chapterByDomain = new Map<GuildDomain, GuildProjectionInput["chapters"][number]>();
  for (const chapter of input.chapters) {
    if (!isDomain(chapter.domain)) continue;
    const previous = chapterByDomain.get(chapter.domain);
    if (!previous || chapter.suitability > previous.suitability) chapterByDomain.set(chapter.domain, chapter);
  }
  const scores = input.stocks
    .filter(stock => stock.burgId > 0 && isDomain(stock.domain))
    .map(stock => stockScore(stock.stock, stock.treasury))
    .filter(score => score > 0);
  const ownStock = (domain: GuildDomain) =>
    input.stocks.find(stock => stock.burgId === input.burgId && stock.domain === domain);

  const domains = new Set<GuildDomain>([...chapterByDomain.keys(), ...workers.keys()]);
  const guilds: SiteGuild[] = [];
  for (const domain of GUILD_DOMAINS) {
    if (!domains.has(domain)) continue;
    const chapter = chapterByDomain.get(domain);
    const points = workers.get(domain) ?? 0;
    if (!chapter && points <= 0) continue;
    const stock = ownStock(domain);
    guilds.push({
      domain,
      status: chapter ? "chapter" : "informal",
      practitioners: peopleOf(points, rate),
      prestige: stock ? percentile(stockScore(stock.stock, stock.treasury), scores) : 0,
      foundedYear: chapter?.foundedYear ?? null
    });
  }
  return guilds;
}

type LodgingSource = {
  burgId: number;
  innClass: string;
  buildingCount: number;
  stableSpaces: number;
  condition: number;
};

/** Wayside inns and caravanserais only. One record is one class, already summed across its buildings. */
export function projectLodging(facilities: readonly LodgingSource[], burgId: number): SiteLodging[] {
  const lodging: SiteLodging[] = [];
  for (const facility of facilities) {
    if (facility.burgId !== burgId || facility.buildingCount < 1) continue;
    const kind = facility.innClass === "wayside" ? "inn" : facility.innClass === "caravanserai" ? "caravanserai" : null;
    if (!kind) continue;
    const stables = Number.isFinite(facility.stableSpaces) ? Math.max(0, Math.round(facility.stableSpaces)) : 0;
    const scale = Number.isFinite(facility.condition) ? Math.min(1, Math.max(0, facility.condition)) : 0;
    lodging.push({ kind, count: Math.round(facility.buildingCount), scale, stableSpaces: stables });
  }
  return lodging;
}

function arrivalRank(burgId: number): { marketCenter: boolean; rank: number } {
  const markets = getMarkets();
  const volumes = markets.map(market => market.caravanArrivalVolume ?? 0);
  const mine = markets.find(market => market.centerBurgId === burgId);
  if (!mine) return { marketCenter: false, rank: 0 };
  return {
    marketCenter: true,
    rank: percentile(
      mine.caravanArrivalVolume ?? 0,
      volumes.filter(volume => volume > 0)
    )
  };
}

/** Null when Economy is not initialised. An empty guild list is still a profile. */
export function buildBurgSiteEconomy(burgId: number): BurgSiteEconomy | null {
  if (!Number.isInteger(burgId) || burgId <= 0 || !isEconomyContextReady()) return null;
  const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;
  const practitioners = [...collectGuildPractitioners().values()].filter(entry => entry.burgId === burgId);
  const guilds = projectBurgGuilds({
    burgId,
    populationRate,
    chapters: getGuildChapters().filter(chapter => chapter.burgId === burgId),
    practitioners,
    stocks: getGuildKnowledgeStocks()
  });
  const arrival = arrivalRank(burgId);
  const tradePartners = tradePartnersForBurg(burgId, getTradeCorridors(), {
    name: burgName,
    goodName
  });
  const organization = getMerchantOrganizations().find(entry => entry.homeBurgId === burgId);
  const mintMarkets = new Set(
    getMintLedgers().flatMap(ledger => (ledger.mintMarketId == null ? [] : [ledger.mintMarketId]))
  );
  const mint = getMarkets().some(market => market.centerBurgId === burgId && mintMarkets.has(market.i));
  return {
    version: 1,
    year: getSimulationYear(),
    commerce: {
      rank: arrival.rank,
      marketCenter: arrival.marketCenter,
      merchantHouse: organization ? (organization.scale === "major" ? "major" : "minor") : null,
      mint,
      caravanArrivalRank: arrival.rank
    },
    guilds,
    storage: storageYardsForBurg(burgId, arrival.marketCenter, tradePartners),
    facilities: projectLodging(getInnFacilities(), burgId),
    tradePartners,
    mills: millCountsForBurg(burgId)
  };
}

function burgName(burgId: number): string {
  return getWorldContext().pack.burgs?.find(burg => burg?.i === burgId)?.name ?? "";
}

function goodName(goodId: number): string {
  return getGoods().find(good => good.i === goodId)?.name ?? "";
}

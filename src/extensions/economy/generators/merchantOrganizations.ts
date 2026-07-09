import type { Character } from "../../characters/characterTypes";
import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import type { Market } from "./marketTypes";

export type MerchantOrganizationScale = "local" | "regional" | "major";

export interface MerchantOrganization {
  i: number;
  name: string;
  scale: MerchantOrganizationScale;
  homeBurgId: number;
  homeMarketId: number;
  homeStateId: number;
  memberCharacterIds: number[];
  parentOrganizationId?: number;
  childOrganizationIds?: number[];
  tradeRangeKm: number;
  urbanPreference: number;
  ruralFocus: number;
}

export const MAX_MERCHANT_TRADE_RANGE_KM = 400;

const LOCAL_TRADE_RANGE_KM = 120;
const REGIONAL_TRADE_RANGE_KM = 260;
const URBAN_POPULATION_THRESHOLD = 30;
const SMALL_RURAL_POPULATION_THRESHOLD = 10;

interface LedgerProfile {
  ledger: MerchantOrganizationLedger;
  burg: Burg;
  market: Market;
  dominantCharacterId: number;
  revenue: number;
  score: number;
}

interface MerchantOrganizationLedger {
  burgId: number;
  marketId: number;
  merchants: {
    characterId: number;
    revenue: number;
    share: number;
    organizationId?: number;
  }[];
}

export function syncMerchantOrganizations(
  ledgers: MerchantOrganizationLedger[] = getWorldContext().pack.burgMarketLedgers ?? [],
  markets: Market[] = getWorldContext().pack.markets ?? []
): void {
  const { pack } = getWorldContext();
  const marketsById = new Map<number, Market>();
  for (const market of markets) marketsById.set(market.i, market);

  const profiles = ledgers.flatMap(ledger => {
    const burg = pack.burgs[ledger.burgId] as Burg | undefined;
    const market = marketsById.get(ledger.marketId);
    const dominant = getDominantMerchantEntry(ledger);
    if (!burg || !market || !dominant) return [];

    const revenue = ledger.merchants.reduce((sum, merchant) => sum + merchant.revenue, 0);
    const population = burg.population ?? 0;
    const isMarketCenter = market.centerBurgId === burg.i;
    return [
      {
        ledger,
        burg,
        market,
        dominantCharacterId: dominant.characterId,
        revenue,
        score: revenue + population * 10 + (isMarketCenter ? 250 : 0)
      }
    ];
  });

  const rankedProfiles = [...profiles].sort((a, b) => b.score - a.score);
  const rankByBurgId = new Map<number, number>();
  for (const [index, profile] of rankedProfiles.entries()) {
    rankByBurgId.set(profile.ledger.burgId, index);
  }

  const organizations: MerchantOrganization[] = [];
  for (const profile of profiles) {
    const rank = rankByBurgId.get(profile.ledger.burgId) ?? profiles.length;
    const scale = getOrganizationScale(profile, rank, profiles.length);
    const organization: MerchantOrganization = {
      i: organizations.length + 1,
      name: getOrganizationName(profile.dominantCharacterId, profile.burg, scale),
      scale,
      homeBurgId: profile.ledger.burgId,
      homeMarketId: profile.ledger.marketId,
      homeStateId: profile.burg.state ?? 0,
      memberCharacterIds: profile.ledger.merchants.map(merchant => merchant.characterId),
      tradeRangeKm: getTradeRangeKm(scale),
      urbanPreference: getUrbanPreference(scale),
      ruralFocus: getRuralFocus(scale)
    };

    organizations.push(organization);
    for (const merchant of profile.ledger.merchants) merchant.organizationId = organization.i;
  }

  assignParentOrganizations(organizations);
  pack.merchantOrganizations = organizations;
}

export function clearMerchantOrganizations(): void {
  getWorldContext().pack.merchantOrganizations = [];
}

export function isMarketTradePermitted(source: Market, target: Market, distanceMapUnits: number): boolean {
  const world = getWorldContext();
  const distanceKm = toKm(distanceMapUnits);
  if (distanceKm > MAX_MERCHANT_TRADE_RANGE_KM) return false;

  const organizations = world.pack.merchantOrganizations ?? [];
  if (!organizations.length) return true;

  return organizations.some(organization => canOrganizationServeTrade(organization, source, target, distanceKm));
}

function canOrganizationServeTrade(
  organization: MerchantOrganization,
  source: Market,
  target: Market,
  distanceKm: number
): boolean {
  if (distanceKm > organization.tradeRangeKm) return false;
  if (!isInHomeGround(organization, source, target)) return false;

  const sourceBurg = getMarketCenter(source);
  const targetBurg = getMarketCenter(target);
  if (!sourceBurg || !targetBurg) return false;

  const sourcePopulation = sourceBurg.population ?? 0;
  const targetPopulation = targetBurg.population ?? 0;
  const hasHomeEndpoint = source.i === organization.homeMarketId || target.i === organization.homeMarketId;

  if (organization.scale === "local") {
    const bothUrban = sourcePopulation >= URBAN_POPULATION_THRESHOLD && targetPopulation >= URBAN_POPULATION_THRESHOLD;
    return !bothUrban || hasHomeEndpoint;
  }

  if (organization.scale === "major") {
    const hasTinyRuralEndpoint =
      sourcePopulation < SMALL_RURAL_POPULATION_THRESHOLD || targetPopulation < SMALL_RURAL_POPULATION_THRESHOLD;
    return !hasTinyRuralEndpoint || distanceKm <= LOCAL_TRADE_RANGE_KM;
  }

  return true;
}

function isInHomeGround(organization: MerchantOrganization, source: Market, target: Market): boolean {
  if (source.i === organization.homeMarketId || target.i === organization.homeMarketId) return true;

  const sourceBurg = getMarketCenter(source);
  const targetBurg = getMarketCenter(target);
  if (!sourceBurg || !targetBurg) return false;

  if (
    organization.homeStateId &&
    (sourceBurg.state === organization.homeStateId || targetBurg.state === organization.homeStateId)
  ) {
    return true;
  }

  const homeBurg = getWorldContext().pack.burgs[organization.homeBurgId] as Burg | undefined;
  if (!homeBurg) return false;

  return (
    toKm(getStraightLineApproximation(homeBurg, sourceBurg)) <= organization.tradeRangeKm ||
    toKm(getStraightLineApproximation(homeBurg, targetBurg)) <= organization.tradeRangeKm
  );
}

function assignParentOrganizations(organizations: MerchantOrganization[]): void {
  const majorByMarketId = new Map<number, MerchantOrganization>();
  for (const organization of organizations) {
    if (organization.scale === "major") majorByMarketId.set(organization.homeMarketId, organization);
  }

  for (const organization of organizations) {
    if (organization.scale === "major") continue;
    const parent = majorByMarketId.get(organization.homeMarketId);
    if (!parent || parent.i === organization.i) continue;

    organization.parentOrganizationId = parent.i;
    parent.childOrganizationIds ??= [];
    parent.childOrganizationIds.push(organization.i);
  }
}

function getOrganizationScale(profile: LedgerProfile, rank: number, count: number): MerchantOrganizationScale {
  const population = profile.burg.population ?? 0;
  const majorRankCutoff = Math.max(1, Math.ceil(count * 0.15));
  const regionalRankCutoff = Math.max(majorRankCutoff + 1, Math.ceil(count * 0.45));

  if (rank < majorRankCutoff || profile.score >= 750 || population >= 80) return "major";
  if (rank < regionalRankCutoff || profile.score >= 250 || population >= 20) return "regional";
  return "local";
}

function getTradeRangeKm(scale: MerchantOrganizationScale): number {
  if (scale === "major") return MAX_MERCHANT_TRADE_RANGE_KM;
  if (scale === "regional") return REGIONAL_TRADE_RANGE_KM;
  return LOCAL_TRADE_RANGE_KM;
}

function getUrbanPreference(scale: MerchantOrganizationScale): number {
  if (scale === "major") return 0.8;
  if (scale === "regional") return 0.5;
  return 0.2;
}

function getRuralFocus(scale: MerchantOrganizationScale): number {
  if (scale === "major") return 0.1;
  if (scale === "regional") return 0.35;
  return 0.7;
}

function getOrganizationName(characterId: number, burg: Burg, scale: MerchantOrganizationScale): string {
  const character = getCharacter(characterId);
  const baseName = character?.name ?? burg.name ?? `Burg ${burg.i}`;
  if (scale === "major") return `${baseName} Company`;
  if (scale === "regional") return `${baseName} House`;
  return `${baseName} Traders`;
}

function getDominantMerchantEntry(
  ledger: MerchantOrganizationLedger
): { characterId: number; revenue: number; share: number } | undefined {
  if (!ledger.merchants.length) return undefined;
  return [...ledger.merchants].sort((a, b) => b.share - a.share || b.revenue - a.revenue)[0];
}

function getCharacter(characterId: number): Character | undefined {
  return getWorldContext().pack.characters?.find(character => character.i === characterId && !character.dead);
}

function getMarketCenter(market: Market): Burg | undefined {
  return getWorldContext().pack.burgs[market.centerBurgId] as Burg | undefined;
}

function getStraightLineApproximation(source: { x: number; y: number }, target: { x: number; y: number }): number {
  const dx = Math.abs(source.x - target.x);
  const dy = Math.abs(source.y - target.y);
  return dx > dy ? dx + 0.414 * dy : dy + 0.414 * dx;
}

function toKm(distanceMapUnits: number): number {
  return rn(distanceMapUnits * (getWorldContext().distanceScale || 1), 2);
}

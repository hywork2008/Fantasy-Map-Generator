import type { Character, CharacterRole } from "../../characters/characterTypes";
import { createPerson } from "../../characters/personFactory";
import type { Burg } from "../../hostTypes";
import { minmax, rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import type { Deal, Market } from "./marketTypes";
import { syncMerchantOrganizations } from "./merchantOrganizations";

export interface BurgMarketLedger {
  burgId: number;
  marketId: number;
  merchants: BurgMarketMerchantEntry[];
  lastUpdatedTick?: number;
  vacantSinceTick?: number;
  warIntensity?: number;
  warDurationTicks?: number;
}

export interface BurgMarketMerchantEntry {
  characterId: number;
  revenue: number;
  share: number;
  influence?: number;
  organizationId?: number;
}

export const BURG_MARKET_MERCHANT_ROLE_SOURCE = "economy";
export const BURG_MARKET_MERCHANT_ROLE_KIND = "burgMarketMerchant";
export const BURG_MARKET_MERCHANT_ROLE_LABEL = "Market Merchant";

export function isBurgMarketMerchantRole(role: CharacterRole): boolean {
  return (
    role.source === BURG_MARKET_MERCHANT_ROLE_SOURCE &&
    role.kind === BURG_MARKET_MERCHANT_ROLE_KIND &&
    role.entityType === "burg"
  );
}

function createBurgMarketMerchantRole(burgId: number): CharacterRole {
  return {
    source: BURG_MARKET_MERCHANT_ROLE_SOURCE,
    kind: BURG_MARKET_MERCHANT_ROLE_KIND,
    entityType: "burg",
    entityId: burgId,
    label: BURG_MARKET_MERCHANT_ROLE_LABEL
  };
}

function getNextCharacterId(characters: Character[]): number {
  return Math.max(0, ...characters.map(c => c.i), -1) + 1;
}

function getCharacter(characterId: number | undefined): Character | undefined {
  if (characterId === undefined) return undefined;
  return getWorldContext().pack.characters?.find(c => c.i === characterId && !c.dead);
}

function resolveBurgCulture(burg: Burg): number {
  const { pack } = getWorldContext();
  const cellCulture = burg.cell !== undefined ? pack.cells?.culture?.[burg.cell] : undefined;
  const stateCulture = burg.state !== undefined ? pack.states?.[burg.state]?.culture : undefined;
  return burg.culture ?? cellCulture ?? stateCulture ?? 0;
}

function ensureMerchantRole(character: Character, burgId: number): void {
  character.roles ??= [];
  if (!character.roles.some(role => isBurgMarketMerchantRole(role) && role.entityId === burgId)) {
    character.roles.push(createBurgMarketMerchantRole(burgId));
  }
}

function createMerchant(burg: Burg): Character {
  const { pack } = getWorldContext();
  pack.characters ??= [];

  const character = createPerson(getNextCharacterId(pack.characters), resolveBurgCulture(burg), {
    primarySkill: "stewardship",
    homeStateId: burg.state ?? 0
  });

  character.location = burg.i;
  character.birthStateId = burg.state;
  character.nationalityStateId = burg.state;
  character.roles = [createBurgMarketMerchantRole(burg.i ?? 0)];
  pack.characters.push(character);
  return character;
}

function getDesiredMerchantCount(burg: Burg): number {
  const population = burg.population ?? 0;
  const populationBonus = population >= 50 ? 2 : population >= 20 ? 1 : 0;
  const urbanBonus = (burg.capital ? 1 : 0) + (burg.port ? 1 : 0) + (burg.plaza ? 1 : 0);
  return Math.round(minmax(2 + populationBonus + urbanBonus, 2, 5));
}

function getBurgGrossRevenue(burg: Burg, deals: Deal[]): number {
  if (!burg.i) return 0;

  const dealRevenue = deals.reduce((sum, deal) => {
    if (deal.sellerType !== "burg" || deal.seller !== burg.i || deal.buyerType !== "market") return sum;
    return sum + deal.units * deal.price;
  }, 0);

  if (dealRevenue > 0) return dealRevenue;
  if ((burg.product ?? 0) > 0) return burg.product ?? 0;
  if ((burg.treasury ?? 0) > 0) return burg.treasury ?? 0;
  return Math.max(1, (burg.population ?? 0) * 10);
}

function getMerchantWeight(character: Character, isMarketManager: boolean): number {
  const skills = character.skills;
  const personality = character.personality;
  const base =
    skills.stewardship * 1.4 +
    skills.intrigue * 0.9 +
    skills.diplomacy * 0.4 +
    personality.sociability * 0.7 +
    personality.greed * 0.6 +
    personality.guile * 0.5 +
    character.prestige * 0.3 +
    character.appearance * 0.1;

  return Math.max(1, base * (isMarketManager ? 1.25 : 1));
}

function recalculateShares(ledger: BurgMarketLedger): void {
  const totalRevenue = ledger.merchants.reduce((sum, merchant) => sum + merchant.revenue, 0);
  for (const merchant of ledger.merchants) {
    merchant.share = totalRevenue > 0 ? rn((merchant.revenue / totalRevenue) * 100, 2) : 0;
  }
}

function assignRevenue(ledger: BurgMarketLedger, burg: Burg, market: Market | undefined): void {
  const totalRevenue = getBurgGrossRevenue(burg, getWorldContext().pack.deals ?? []);
  const managerCharacterId = market && market.centerBurgId === burg.i ? market.managerCharacterId : undefined;
  const weighted = ledger.merchants.map(merchant => {
    const character = getCharacter(merchant.characterId);
    return {
      merchant,
      weight: character ? getMerchantWeight(character, merchant.characterId === managerCharacterId) : 1
    };
  });
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0) || 1;

  for (const entry of weighted) {
    entry.merchant.revenue = rn((totalRevenue * entry.weight) / totalWeight, 2);
  }

  recalculateShares(ledger);
}

function ensureLedgerMerchants(ledger: BurgMarketLedger, burg: Burg, market: Market | undefined): void {
  const desiredCount = getDesiredMerchantCount(burg);
  const retained: BurgMarketMerchantEntry[] = [];
  const seen = new Set<number>();

  const addCharacter = (character: Character | undefined, revenue = 0, share = 0) => {
    if (!character || seen.has(character.i)) return;
    ensureMerchantRole(character, ledger.burgId);
    retained.push({ characterId: character.i, revenue, share });
    seen.add(character.i);
  };

  if (market && market.centerBurgId === burg.i) {
    addCharacter(getCharacter(market.managerCharacterId));
  }

  for (const entry of ledger.merchants) {
    addCharacter(getCharacter(entry.characterId), entry.revenue, entry.share);
  }

  while (retained.length < desiredCount) {
    addCharacter(createMerchant(burg));
  }

  ledger.merchants = retained.slice(0, desiredCount);
}

export function getBurgMarketLedger(burgId: number | undefined): BurgMarketLedger | undefined {
  if (!burgId) return undefined;
  return getWorldContext().pack.burgMarketLedgers?.find(ledger => ledger.burgId === burgId);
}

export function getDominantMerchant(ledger: BurgMarketLedger | undefined): BurgMarketMerchantEntry | undefined {
  if (!ledger?.merchants.length) return undefined;
  return [...ledger.merchants].sort((a, b) => b.share - a.share || b.revenue - a.revenue)[0];
}

export function getMerchantName(characterId: number | undefined): string {
  return getCharacter(characterId)?.name ?? "Unassigned";
}

export function syncBurgMarketLedgers(markets: Market[] = getWorldContext().pack.markets ?? []): void {
  const { pack } = getWorldContext();
  pack.characters ??= [];
  pack.burgMarketLedgers ??= [];

  const marketsById = new Map<number, Market>();
  for (const market of markets) if (market) marketsById.set(market.i, market);

  const ledgersByBurg = new Map<number, BurgMarketLedger>();
  for (const ledger of pack.burgMarketLedgers) ledgersByBurg.set(ledger.burgId, ledger);

  const nextLedgers: BurgMarketLedger[] = [];

  for (const burg of pack.burgs as Burg[]) {
    if (!burg.i || burg.removed || !burg.market) continue;
    const market = marketsById.get(burg.market);
    if (!market) continue;

    const ledger = ledgersByBurg.get(burg.i) ?? {
      burgId: burg.i,
      marketId: burg.market,
      merchants: []
    };
    ledger.marketId = burg.market;
    ensureLedgerMerchants(ledger, burg, market);
    assignRevenue(ledger, burg, market);
    nextLedgers.push(ledger);
  }

  pack.burgMarketLedgers = nextLedgers;
  syncMerchantOrganizations(nextLedgers, markets);
  pruneStaleMerchantRoles(nextLedgers);
}

function pruneStaleMerchantRoles(ledgers: BurgMarketLedger[]): void {
  const { pack } = getWorldContext();
  const activeRoles = new Set<string>();
  for (const ledger of ledgers) {
    for (const merchant of ledger.merchants) activeRoles.add(`${ledger.burgId}:${merchant.characterId}`);
  }

  pack.characters = pack.characters.filter(character => {
    if (!character.roles?.some(isBurgMarketMerchantRole)) return true;

    character.roles = character.roles.filter(role => {
      if (!isBurgMarketMerchantRole(role)) return true;
      return activeRoles.has(`${role.entityId}:${character.i}`);
    });
    if (character.roles.length === 0) delete character.roles;

    return character.titles.length > 0 || Boolean(character.roles?.length);
  });
}

export function clearBurgMarketLedgers(): void {
  const { pack } = getWorldContext();
  pack.burgMarketLedgers = [];
  pack.merchantOrganizations = [];

  if (!pack.characters?.length) return;

  pack.characters = pack.characters.filter(character => {
    if (!character.roles?.some(isBurgMarketMerchantRole)) return true;

    character.roles = character.roles.filter(role => !isBurgMarketMerchantRole(role));
    if (character.roles.length === 0) delete character.roles;

    return character.titles.length > 0 || Boolean(character.roles?.length);
  });
}

export function updateBurgWarState(burgId: number, intensity: number): void {
  const { pack } = getWorldContext();
  if (!pack.burgMarketLedgers) return;

  const ledger = pack.burgMarketLedgers.find(l => l.burgId === burgId);
  if (!ledger) return; // Only track for burgs with ledgers

  const currentIntensity = ledger.warIntensity || 0;
  ledger.warIntensity = Math.min(2.5, Math.max(0, intensity));

  if (ledger.warIntensity === 0) {
    ledger.warDurationTicks = 0;
  } else if (currentIntensity > 0 && ledger.warIntensity > 0) {
    // If it was already at war, we might want to manually advance duration if called periodically.
    // For now, this just allows external callers to manage the duration too.
    ledger.warDurationTicks = (ledger.warDurationTicks || 0) + 1;
  } else {
    // Just started war
    ledger.warDurationTicks = 0;
  }
}

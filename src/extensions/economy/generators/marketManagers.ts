import { applyCharacterBackstory, seedRelationsWithPeers } from "../../characters/backstoryProfile";
import type { Character, CharacterRole } from "../../characters/characterTypes";
import { finalizeCharacterSocietyForPeer } from "../../characters/finalizeCharacterSociety";
import { createPerson, resolveRaceIdForCulture } from "../../characters/personFactory";
import { isEnemyDedicatedRaceKey } from "../../characters/raceSkillBias";
import { simulationContext } from "../../hostCore";
import type { Burg } from "../../hostTypes";
import { getMarkets, getWorldContext } from "../economyContext";
import { rollBalancedEconomyGender } from "./economyCharacterGender";
import type { Market } from "./marketTypes";
import { resolveBurgCulture } from "./resolveBurgCulture";

export const MARKET_MANAGER_ROLE_SOURCE = "economy";
export const MARKET_MANAGER_ROLE_KIND = "marketManager";
export const MARKET_MANAGER_ROLE_LABEL = "Market Manager";
export const MARKET_RIVAL_MERCHANT_ROLE_KIND = "marketRivalMerchant";
export const MARKET_RIVAL_MERCHANT_ROLE_LABEL = "Market Rival Merchant";

const MARKET_RIVALS_PER_MARKET = 2;

export function isMarketManagerRole(role: CharacterRole): boolean {
  return (
    role.source === MARKET_MANAGER_ROLE_SOURCE && role.kind === MARKET_MANAGER_ROLE_KIND && role.entityType === "market"
  );
}

function createMarketManagerRole(marketId: number): CharacterRole {
  return {
    source: MARKET_MANAGER_ROLE_SOURCE,
    kind: MARKET_MANAGER_ROLE_KIND,
    entityType: "market",
    entityId: marketId,
    label: MARKET_MANAGER_ROLE_LABEL
  };
}

function createMarketRivalRole(marketId: number): CharacterRole {
  return {
    source: MARKET_MANAGER_ROLE_SOURCE,
    kind: MARKET_RIVAL_MERCHANT_ROLE_KIND,
    entityType: "market",
    entityId: marketId,
    label: MARKET_RIVAL_MERCHANT_ROLE_LABEL
  };
}

function getNextCharacterId(characters: Character[]): number {
  return Math.max(0, ...characters.map(c => c.i), -1) + 1;
}

function getMarketManager(characterId: number | undefined): Character | undefined {
  if (characterId === undefined) return undefined;
  return getWorldContext().pack.characters?.find(c => c.i === characterId && !c.dead);
}

function ensureRole(character: Character, marketId: number): void {
  character.roles ??= [];
  if (!character.roles.some(role => isMarketManagerRole(role) && role.entityId === marketId)) {
    character.roles.push(createMarketManagerRole(marketId));
  }
}

export function isMarketRivalMerchantRole(role: CharacterRole): boolean {
  return (
    role.source === MARKET_MANAGER_ROLE_SOURCE &&
    role.kind === MARKET_RIVAL_MERCHANT_ROLE_KIND &&
    role.entityType === "market"
  );
}

function ensureRivalRole(character: Character, marketId: number): void {
  character.roles ??= [];
  if (!character.roles.some(role => isMarketRivalMerchantRole(role) && role.entityId === marketId)) {
    character.roles.push(createMarketRivalRole(marketId));
  }
}

function resolveManagerCulture(centerBurg: Burg | undefined): number {
  return resolveBurgCulture(centerBurg);
}

/** Goblins are enemy-dedicated — no peaceful market managers. */
function cultureAllowsMerchantCharacters(cultureId: number): boolean {
  const { pack } = getWorldContext();
  const raceId = resolveRaceIdForCulture(cultureId);
  const race = pack.races?.[raceId];
  return !isEnemyDedicatedRaceKey(race?.key);
}

function createMarketManager(market: Market): Character | null {
  const { pack } = getWorldContext();
  const centerBurg = pack.burgs[market.centerBurgId] as Burg | undefined;
  pack.characters ??= [];
  const characters = pack.characters;
  const cultureId = resolveManagerCulture(centerBurg);
  if (!cultureAllowsMerchantCharacters(cultureId)) return null;
  const character = createPerson(getNextCharacterId(characters), cultureId, {
    primarySkill: "stewardship",
    roleClass: "merchant",
    homeStateId: centerBurg?.state ?? 0,
    genderOverride: rollBalancedEconomyGender(characters)
  });

  character.location = centerBurg?.i;
  character.birthStateId = centerBurg?.state;
  character.nationalityStateId = centerBurg?.state;
  character.roles = [createMarketManagerRole(market.i)];
  applyCharacterBackstory(character, {
    roleClass: "merchant",
    homeBurgId: centerBurg?.i,
    birthBurgId: centerBurg?.i,
    capitalBurgId: centerBurg?.state !== undefined ? pack.states?.[centerBurg.state]?.capital : undefined
  });

  characters.push(character);
  seedRelationsWithPeers(character, characters);
  finalizeCharacterSocietyForPeer(character, characters, {
    stateNames: {},
    currentYear: simulationContext.currentYear
  });
  market.managerCharacterId = character.i;
  return character;
}

function createMarketRival(market: Market): Character | null {
  const { pack } = getWorldContext();
  const centerBurg = pack.burgs[market.centerBurgId] as Burg | undefined;
  pack.characters ??= [];
  const characters = pack.characters;
  const cultureId = resolveManagerCulture(centerBurg);
  if (!cultureAllowsMerchantCharacters(cultureId)) return null;
  const character = createPerson(getNextCharacterId(characters), cultureId, {
    primarySkill: "stewardship",
    roleClass: "merchant",
    homeStateId: centerBurg?.state ?? 0,
    genderOverride: rollBalancedEconomyGender(characters)
  });

  character.location = centerBurg?.i;
  character.birthStateId = centerBurg?.state;
  character.nationalityStateId = centerBurg?.state;
  character.roles = [createMarketRivalRole(market.i)];
  applyCharacterBackstory(character, {
    roleClass: "merchant",
    homeBurgId: centerBurg?.i,
    birthBurgId: centerBurg?.i,
    capitalBurgId: centerBurg?.state !== undefined ? pack.states?.[centerBurg.state]?.capital : undefined
  });
  characters.push(character);
  seedRelationsWithPeers(character, characters);
  finalizeCharacterSocietyForPeer(character, characters, {
    stateNames: {},
    currentYear: simulationContext.currentYear
  });
  return character;
}

export function syncMarketManagers(markets: Market[] = getMarkets()): void {
  const { pack } = getWorldContext();
  pack.characters ??= [];

  for (const market of markets) {
    if (!market) continue;
    const manager = getMarketManager(market.managerCharacterId);
    if (manager) {
      ensureRole(manager, market.i);
      continue;
    }

    createMarketManager(market);
  }

  syncMarketRivals(markets);
}

/**
 * Maintains the two-person competitor pool shared by every burg in a market.
 * Ledgers only reference these characters; they never create burg-local merchants.
 */
export function syncMarketRivals(markets: Market[] = getMarkets()): void {
  const { pack } = getWorldContext();
  pack.characters ??= [];

  for (const market of markets) {
    if (!market) continue;

    const rivals: Character[] = [];
    for (const characterId of market.rivalCharacterIds ?? []) {
      const rival = getMarketManager(characterId);
      if (!rival || rivals.some(candidate => candidate.i === rival.i)) continue;
      ensureRivalRole(rival, market.i);
      rivals.push(rival);
      if (rivals.length === MARKET_RIVALS_PER_MARKET) break;
    }

    while (rivals.length < MARKET_RIVALS_PER_MARKET) {
      const rival = createMarketRival(market);
      if (!rival) break; // enemy-dedicated culture: no peaceful merchant rivals
      rivals.push(rival);
    }

    market.rivalCharacterIds = rivals.map(rival => rival.i);
  }
}

export function getMarketManagerName(market: Market): string {
  const manager = getMarketManager(market.managerCharacterId);
  return manager?.name ?? "Unassigned";
}

export function clearMarketManagers(): void {
  const { pack } = getWorldContext();

  for (const market of getMarkets()) {
    if (!market) continue;
    delete market.managerCharacterId;
    delete market.rivalCharacterIds;
  }

  if (!pack.characters?.length) return;

  pack.characters = pack.characters.filter(character => {
    if (!character.roles?.some(role => role.source === MARKET_MANAGER_ROLE_SOURCE)) return true;

    character.roles = character.roles.filter(role => role.source !== MARKET_MANAGER_ROLE_SOURCE);
    if (character.roles.length === 0) delete character.roles;

    return character.titles.length > 0 || Boolean(character.roles?.length);
  });
}

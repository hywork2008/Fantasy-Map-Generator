import type { Character, CharacterRole, CharacterSkills } from "../../characters/characterTypes";
import { createPerson } from "../../characters/personFactory";
import type { Burg } from "../../hostTypes";
import { rand, rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { rollBalancedEconomyGender } from "./economyCharacterGender";
import type { Market } from "./marketTypes";

export type MerchantOrganizationScale = "local" | "regional" | "major";

export interface MerchantOrganization {
  i: number;
  name: string;
  scale: MerchantOrganizationScale;
  homeBurgId: number;
  homeMarketId: number;
  homeStateId: number;
  chairpersonCharacterId: number;
  secretaryCharacterId?: number;
  bodyguardCharacterId?: number;
  executiveCharacterIds?: number[];
  memberCharacterIds: number[];
  parentOrganizationId?: number;
  childOrganizationIds?: number[];
  tradeRangeKm: number;
  urbanPreference: number;
  ruralFocus: number;
}

const LOCAL_TRADE_RANGE_KM = 120;
const REGIONAL_TRADE_RANGE_KM = 260;
const MAJOR_HOME_GROUND_RADIUS_KM = 400;
const URBAN_POPULATION_THRESHOLD = 30;
const SMALL_RURAL_POPULATION_THRESHOLD = 10;

const ORGANIZATION_MAX_TRADE_DAYS: Record<MerchantOrganizationScale, number> = {
  local: 12,
  regional: 25,
  major: 50
};

export const MERCHANT_ORGANIZATION_ROLE_SOURCE = "economy";
export const MERCHANT_ORGANIZATION_HEAD_ROLE_KIND = "merchantOrganizationHead";
export const MERCHANT_ORGANIZATION_SECRETARY_ROLE_KIND = "merchantOrganizationSecretary";
export const MERCHANT_ORGANIZATION_BODYGUARD_ROLE_KIND = "merchantOrganizationBodyguard";
export const MERCHANT_ORGANIZATION_EXECUTIVE_ROLE_KIND = "merchantOrganizationExecutive";
const MERCHANT_ORGANIZATION_AGENT_ROLE_KIND = "merchantOrganizationAgent";

const MERCHANT_ORGANIZATION_ROLE_KINDS = new Set([
  MERCHANT_ORGANIZATION_HEAD_ROLE_KIND,
  MERCHANT_ORGANIZATION_SECRETARY_ROLE_KIND,
  MERCHANT_ORGANIZATION_BODYGUARD_ROLE_KIND,
  MERCHANT_ORGANIZATION_EXECUTIVE_ROLE_KIND,
  MERCHANT_ORGANIZATION_AGENT_ROLE_KIND
]);

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
      chairpersonCharacterId: profile.dominantCharacterId,
      memberCharacterIds: profile.ledger.merchants.map(merchant => merchant.characterId),
      tradeRangeKm: getTradeRangeKm(scale),
      urbanPreference: getUrbanPreference(scale),
      ruralFocus: getRuralFocus(scale)
    };

    organizations.push(organization);
    for (const merchant of profile.ledger.merchants) merchant.organizationId = organization.i;
  }

  assignParentOrganizations(organizations);
  syncMerchantOrganizationCharacters(organizations, profiles);
  pack.merchantOrganizations = organizations;
}

export function clearMerchantOrganizations(): void {
  const { pack } = getWorldContext();
  pack.merchantOrganizations = [];
  clearMerchantOrganizationRoles();
}

/**
 * Merchant organizations limit trade by travelling time, not a map-wide kilometre cap. The
 * remaining kilometre ranges describe each organization's home-ground reach only.
 */
export function isMarketTradePermitted(source: Market, target: Market, durationDays: number): boolean {
  const world = getWorldContext();
  const organizations = world.pack.merchantOrganizations ?? [];
  if (!organizations.length) return true;

  return organizations.some(organization => canOrganizationServeTrade(organization, source, target, durationDays));
}

export function getOrganizationMaxTradeDays(scale: MerchantOrganizationScale): number {
  return ORGANIZATION_MAX_TRADE_DAYS[scale];
}

function canOrganizationServeTrade(
  organization: MerchantOrganization,
  source: Market,
  target: Market,
  durationDays: number
): boolean {
  if (durationDays > getOrganizationMaxTradeDays(organization.scale)) return false;
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
    return !hasTinyRuralEndpoint || durationDays <= getOrganizationMaxTradeDays("local");
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

function syncMerchantOrganizationCharacters(organizations: MerchantOrganization[], profiles: LedgerProfile[]): void {
  const { pack } = getWorldContext();
  pack.characters ??= [];

  const profilesByMarketId = new Map<number, LedgerProfile[]>();
  for (const profile of profiles) {
    const marketProfiles = profilesByMarketId.get(profile.market.i) ?? [];
    marketProfiles.push(profile);
    profilesByMarketId.set(profile.market.i, marketProfiles);
  }

  const activeRoleKeys = new Set<string>();

  for (const organization of organizations) {
    if (organization.scale !== "major") continue;

    const chairperson = getCharacter(organization.chairpersonCharacterId);
    if (chairperson) {
      ensureOrganizationRole(chairperson, organization, MERCHANT_ORGANIZATION_HEAD_ROLE_KIND, "Merchant Company Head");
      activeRoleKeys.add(getRoleKey(chairperson.i, MERCHANT_ORGANIZATION_HEAD_ROLE_KIND, organization.i));
    }

    const secretary = ensureOrganizationStaff(
      organization,
      MERCHANT_ORGANIZATION_SECRETARY_ROLE_KIND,
      "Merchant Company Secretary",
      "stewardship",
      organization.homeBurgId,
      activeRoleKeys
    );
    organization.secretaryCharacterId = secretary.i;

    const bodyguard = ensureOrganizationStaff(
      organization,
      MERCHANT_ORGANIZATION_BODYGUARD_ROLE_KIND,
      "Merchant Company Bodyguard",
      "prowess",
      organization.homeBurgId,
      activeRoleKeys
    );
    organization.bodyguardCharacterId = bodyguard.i;

    const servedBurgIds = (profilesByMarketId.get(organization.homeMarketId) ?? [])
      .map(profile => profile.burg.i)
      .filter((burgId): burgId is number => burgId !== undefined && burgId > 0);
    const branchCount = getBranchStaffCount(servedBurgIds.length);

    organization.executiveCharacterIds = syncBranchStaff(
      organization,
      MERCHANT_ORGANIZATION_EXECUTIVE_ROLE_KIND,
      "Merchant Company Executive",
      "stewardship",
      servedBurgIds,
      branchCount,
      activeRoleKeys
    );

    organization.memberCharacterIds = uniqueCharacterIds([
      ...organization.memberCharacterIds,
      organization.chairpersonCharacterId,
      organization.secretaryCharacterId,
      organization.bodyguardCharacterId,
      ...organization.executiveCharacterIds
    ]);
  }

  pruneInactiveOrganizationRoles(activeRoleKeys);
}

function syncBranchStaff(
  organization: MerchantOrganization,
  roleKind: string,
  label: string,
  primarySkill: keyof CharacterSkills,
  servedBurgIds: number[],
  count: number,
  activeRoleKeys: Set<string>
): number[] {
  const ids: number[] = [];
  const fallbackBurgId = organization.homeBurgId;
  const step = Math.max(1, Math.ceil(Math.max(1, servedBurgIds.length) / count));

  for (let index = 0; index < count; index++) {
    const burgId = servedBurgIds[index * step] ?? fallbackBurgId;
    const character = ensureOrganizationStaff(
      organization,
      roleKind,
      label,
      primarySkill,
      burgId,
      activeRoleKeys,
      index
    );
    ids.push(character.i);
  }

  return ids;
}

function ensureOrganizationStaff(
  organization: MerchantOrganization,
  roleKind: string,
  label: string,
  primarySkill: keyof CharacterSkills,
  burgId: number,
  activeRoleKeys: Set<string>,
  ordinal = 0
): Character {
  const existing = getOrganizationRoleHolders(organization.i, roleKind)[ordinal];
  const character = existing ?? createOrganizationStaff(organization, roleKind, label, primarySkill, burgId);
  const created = !existing;

  character.location = burgId;
  const burg = getBurg(burgId);
  character.birthStateId ??= burg?.state ?? organization.homeStateId;
  character.nationalityStateId = burg?.state ?? organization.homeStateId;
  character.state = burg?.state ?? organization.homeStateId;
  if (roleKind === MERCHANT_ORGANIZATION_BODYGUARD_ROLE_KIND) {
    if (created) applyBodyguardProwess(character);
    else if (character.skills.prowess < 60) setProwess(character, 60);
  }
  ensureOrganizationRole(character, organization, roleKind, label, burgId);
  activeRoleKeys.add(getRoleKey(character.i, roleKind, organization.i));

  return character;
}

function createOrganizationStaff(
  organization: MerchantOrganization,
  roleKind: string,
  label: string,
  primarySkill: keyof CharacterSkills,
  burgId: number
): Character {
  const { pack } = getWorldContext();
  pack.characters ??= [];
  const burg = getBurg(burgId);
  const character = createPerson(getNextCharacterId(pack.characters), resolveBurgCulture(burg), {
    primarySkill,
    homeStateId: burg?.state ?? organization.homeStateId,
    genderOverride: rollBalancedEconomyGender(pack.characters)
  });

  character.location = burg?.i ?? organization.homeBurgId;
  character.birthStateId = burg?.state ?? organization.homeStateId;
  character.nationalityStateId = burg?.state ?? organization.homeStateId;
  character.roles = [createOrganizationRole(organization, roleKind, label, burg?.i ?? organization.homeBurgId)];
  pack.characters.push(character);

  return character;
}

function ensureOrganizationRole(
  character: Character,
  organization: MerchantOrganization,
  roleKind: string,
  label: string,
  burgId = organization.homeBurgId
): void {
  character.roles ??= [];
  character.roles = character.roles.filter(
    role => !(isMerchantOrganizationRole(role) && role.kind === roleKind && role.organizationId === organization.i)
  );
  character.roles.unshift(createOrganizationRole(organization, roleKind, label, burgId));
}

function createOrganizationRole(
  organization: MerchantOrganization,
  roleKind: string,
  label: string,
  burgId = organization.homeBurgId
): CharacterRole {
  return {
    source: MERCHANT_ORGANIZATION_ROLE_SOURCE,
    kind: roleKind,
    entityType: "burg",
    entityId: burgId,
    label,
    organizationId: organization.i
  };
}

function isMerchantOrganizationRole(role: CharacterRole): boolean {
  return (
    role.source === MERCHANT_ORGANIZATION_ROLE_SOURCE &&
    MERCHANT_ORGANIZATION_ROLE_KINDS.has(role.kind) &&
    role.organizationId !== undefined
  );
}

function getOrganizationRoleHolders(organizationId: number, roleKind: string): Character[] {
  const characters = getWorldContext().pack.characters ?? [];
  return characters.filter(
    character =>
      !character.dead &&
      character.roles?.some(
        role => isMerchantOrganizationRole(role) && role.organizationId === organizationId && role.kind === roleKind
      )
  );
}

function pruneInactiveOrganizationRoles(activeRoleKeys: Set<string>): void {
  const { pack } = getWorldContext();
  if (!pack.characters?.length) return;

  pack.characters = pack.characters.filter(character => {
    if (!character.roles?.some(isMerchantOrganizationRole)) return true;

    character.roles = character.roles.filter(role => {
      if (!isMerchantOrganizationRole(role)) return true;
      return activeRoleKeys.has(getRoleKey(character.i, role.kind, role.organizationId));
    });
    if (character.roles.length === 0) delete character.roles;

    return character.titles.length > 0 || Boolean(character.roles?.length);
  });
}

function clearMerchantOrganizationRoles(): void {
  const { pack } = getWorldContext();
  if (!pack.characters?.length) return;

  pack.characters = pack.characters.filter(character => {
    if (!character.roles?.some(isMerchantOrganizationRole)) return true;

    character.roles = character.roles.filter(role => !isMerchantOrganizationRole(role));
    if (character.roles.length === 0) delete character.roles;

    return character.titles.length > 0 || Boolean(character.roles?.length);
  });
}

function getRoleKey(characterId: number, roleKind: string, organizationId: number | undefined): string {
  return `${characterId}:${roleKind}:${organizationId ?? 0}`;
}

function getBranchStaffCount(servedBurgCount: number): number {
  return Math.max(1, Math.ceil(Math.max(1, servedBurgCount) / rand(3, 6)));
}

function applyBodyguardProwess(character: Character): void {
  setProwess(character, Math.floor(60 + Math.random() ** 2.4 * 41));
}

function setProwess(character: Character, value: number): void {
  character.skills.prowess = value;
  if (character.abilityProfile?.presetId === "ck3e") {
    character.abilityProfile.values.prowess = character.skills.prowess;
  }
}

function uniqueCharacterIds(ids: (number | undefined)[]): number[] {
  return [...new Set(ids.filter((id): id is number => id !== undefined))];
}

function getNextCharacterId(characters: Character[]): number {
  return Math.max(0, ...characters.map(c => c.i), -1) + 1;
}

function getBurg(burgId: number): Burg | undefined {
  return getWorldContext().pack.burgs[burgId] as Burg | undefined;
}

function resolveBurgCulture(burg: Burg | undefined): number {
  const { pack } = getWorldContext();
  const cellCulture = burg?.cell !== undefined ? pack.cells?.culture?.[burg.cell] : undefined;
  const stateCulture = burg?.state !== undefined ? pack.states?.[burg.state]?.culture : undefined;
  return burg?.culture ?? cellCulture ?? stateCulture ?? 0;
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
  if (scale === "major") return MAJOR_HOME_GROUND_RADIUS_KM;
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

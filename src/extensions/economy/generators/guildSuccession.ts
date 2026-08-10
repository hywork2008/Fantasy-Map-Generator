import {
  applyCharacterBackstory,
  getSolidarity,
  seedRelationsWithPeers,
  setSolidarity
} from "../../characters/backstoryProfile";
import type { Character, CharacterRole } from "../../characters/characterTypes";
import { finalizeCharacterSocietyForPeer } from "../../characters/finalizeCharacterSociety";
import { createPerson, resolveRaceIdForCulture } from "../../characters/personFactory";
import { rollApprenticeAge } from "../../characters/raceAge";
import { isEnemyDedicatedRaceKey } from "../../characters/raceSkillBias";
import type { Burg } from "../../hostTypes";
import { P, rand } from "../../hostUtils";
import {
  getGuildKnowledgeStocks,
  getGuildSuccessionLastSettledYear,
  getSimulationYear,
  getWorldContext,
  setGuildKnowledgeStocks,
  setGuildSuccessionLastSettledYear
} from "../economyContext";
import { rollBalancedEconomyGender } from "./economyCharacterGender";
import { applyMasterlessGuildPenalty } from "./guildKnowledge";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";
import { settleGuildMasterEstate } from "./guildMasterAssets";
import {
  advanceBlacksmithingTechniqueLeads,
  discardIndividualSkills,
  ensureBlacksmithingSkill,
  getIndividualSkill,
  growApprenticeBlacksmithing,
  growMasterBlacksmithing,
  settleBlacksmithingSuccession,
  settleBlacksmithingTechniques
} from "./individualSkillMastery";
import type { CharacterDomainSkill } from "./individualSkillTypes";
import { resolveBurgCulture } from "./resolveBurgCulture";

/**
 * Master/apprentice succession for GuildKnowledgeStock (docs/plan/knowledge-guild-system.md §5,
 * §9 Phase 6). Only "metallurgy" is wired up — same single-domain vertical-slice scoping as
 * Phase 1. Lives in Economy, not Characters: it directly imports Characters' createPerson/types,
 * mirroring marketManagers.ts/merchantOrganizations.ts, which already do exactly this. Character
 * generation here is not gated on the Characters extension's own enabled toggle, matching those
 * existing modules.
 *
 * Represented entirely through Character.roles[] (no new fields on Character itself): a
 * "guildMaster" role tags the current master for a (burg, domain); a "guildApprentice" role tags
 * an apprentice, with `organizationId` repurposed to hold the master's character id (the field's
 * doc calls it a generic "subsystem-specific pointer"). An ended role (death, promotion) gets
 * `endYear` set instead of being deleted, so a burg's guild history stays inspectable.
 */

const ROLE_SOURCE = "economy";
const MASTER_ROLE_KIND = "guildMaster";
const APPRENTICE_ROLE_KIND = "guildApprentice";
const SUCCESSION_DOMAINS: readonly CraftKnowledgeDomain[] = ["metallurgy"];

/** Skill level at which a master is established enough to start training an apprentice. */
const MASTER_APPRENTICE_ELIGIBLE_SKILL = 40;
const MAX_APPRENTICES_PER_MASTER = 2;

function isMasterRole(role: CharacterRole, burgId: number, domain: CraftKnowledgeDomain): boolean {
  return (
    role.source === ROLE_SOURCE &&
    role.kind === MASTER_ROLE_KIND &&
    role.entityType === "burg" &&
    role.entityId === burgId &&
    role.domain === domain
  );
}

function isApprenticeRole(role: CharacterRole, burgId: number, domain: CraftKnowledgeDomain): boolean {
  return (
    role.source === ROLE_SOURCE &&
    role.kind === APPRENTICE_ROLE_KIND &&
    role.entityType === "burg" &&
    role.entityId === burgId &&
    role.domain === domain
  );
}

function createMasterRole(burgId: number, domain: CraftKnowledgeDomain): CharacterRole {
  return {
    source: ROLE_SOURCE,
    kind: MASTER_ROLE_KIND,
    entityType: "burg",
    entityId: burgId,
    domain,
    label: "Guild Master"
  };
}

function createApprenticeRole(burgId: number, domain: CraftKnowledgeDomain, masterId: number): CharacterRole {
  return {
    source: ROLE_SOURCE,
    kind: APPRENTICE_ROLE_KIND,
    entityType: "burg",
    entityId: burgId,
    domain,
    organizationId: masterId,
    label: "Guild Apprentice"
  };
}

function getNextCharacterId(characters: Character[]): number {
  return Math.max(0, ...characters.map(c => c.i), -1) + 1;
}

/** Enemy-dedicated races (goblins) have no peaceful craft guild masters. */
function cultureAllowsGuildCharacters(cultureId: number): boolean {
  const { pack } = getWorldContext();
  const raceId = resolveRaceIdForCulture(cultureId);
  return !isEnemyDedicatedRaceKey(pack.races?.[raceId]?.key);
}

function findMasterRoleHolder(
  characters: Character[],
  burgId: number,
  domain: CraftKnowledgeDomain
): Character | undefined {
  return characters.find(c => c.roles?.some(role => isMasterRole(role, burgId, domain) && role.endYear === undefined));
}

/** Finds the living master eligible for pay, product supervision, and ordinary guild work. */
export function findMaster(
  characters: Character[],
  burgId: number,
  domain: CraftKnowledgeDomain
): Character | undefined {
  const holder = findMasterRoleHolder(characters, burgId, domain);
  return holder?.dead ? undefined : holder;
}

export function findApprentices(
  characters: Character[],
  masterId: number,
  burgId: number,
  domain: CraftKnowledgeDomain
): Character[] {
  return characters.filter(c =>
    c.roles?.some(
      role => isApprenticeRole(role, burgId, domain) && role.organizationId === masterId && role.endYear === undefined
    )
  );
}

function createMaster(characters: Character[], burgId: number, domain: CraftKnowledgeDomain): Character | null {
  const { pack } = getWorldContext();
  const burg = pack.burgs[burgId] as Burg | undefined;
  const cultureId = resolveBurgCulture(burg);
  if (!cultureAllowsGuildCharacters(cultureId)) return null;
  const character = createPerson(getNextCharacterId(characters), cultureId, {
    // Engineering is retained as a broad technical trait and seeds the initial
    // blacksmithing record below; it is no longer the practical craft skill.
    primarySkill: "engineering",
    roleClass: "ordinary",
    homeStateId: burg?.state ?? 0,
    genderOverride: rollBalancedEconomyGender(characters)
  });

  character.location = burg?.i;
  character.birthStateId = burg?.state;
  character.nationalityStateId = burg?.state;
  character.roles = [createMasterRole(burgId, domain)];
  applyCharacterBackstory(character, {
    roleClass: "ordinary",
    homeBurgId: burg?.i,
    birthBurgId: burg?.i,
    capitalBurgId: burg?.state !== undefined ? pack.states?.[burg.state]?.capital : undefined
  });

  characters.push(character);
  seedRelationsWithPeers(character, characters);
  finalizeCharacterSocietyForPeer(character, characters, {
    stateNames: {},
    currentYear: getSimulationYear()
  });
  if (domain === "metallurgy") ensureBlacksmithingSkill(character, "master");
  return character;
}

/**
 * Master–apprentice pairs live and work together daily. After general peer seeding, nudge any
 * still-missing edge toward a mild positive bias so "good bond → pocket money" can fire without
 * forcing every pair to be bonded. Existing edges (including cool/hostile ones) are left alone.
 */
function ensureMasterApprenticeContactBond(master: Character, apprentice: Character): void {
  if (master.dead || apprentice.dead || master.i === apprentice.i) return;

  // Only fill sparse missing edges — do not overwrite a sour relationship that peer seeding set.
  if (getSolidarity(master, apprentice.i) === 0) {
    // Bias positive but leave room below the collegial (20) pocket-money threshold.
    setSolidarity(master, apprentice.i, rand(8, 48));
  }
  if (getSolidarity(apprentice, master.i) === 0) {
    setSolidarity(apprentice, master.i, rand(8, 48));
  }
}

function createApprentice(
  characters: Character[],
  burgId: number,
  domain: CraftKnowledgeDomain,
  masterId: number
): Character {
  const { pack } = getWorldContext();
  const burg = pack.burgs[burgId] as Burg | undefined;
  const cultureId = resolveBurgCulture(burg);
  const character = createPerson(getNextCharacterId(characters), cultureId, {
    primarySkill: "engineering",
    roleClass: "ordinary",
    ageOverride: rollApprenticeAge(resolveRaceIdForCulture(cultureId)),
    homeStateId: burg?.state ?? 0,
    genderOverride: rollBalancedEconomyGender(characters)
  });

  character.location = burg?.i;
  character.birthStateId = burg?.state;
  character.nationalityStateId = burg?.state;
  character.roles = [createApprenticeRole(burgId, domain, masterId)];
  applyCharacterBackstory(character, {
    roleClass: "ordinary",
    homeBurgId: burg?.i,
    birthBurgId: burg?.i,
    capitalBurgId: burg?.state !== undefined ? pack.states?.[burg.state]?.capital : undefined
  });

  characters.push(character);
  seedRelationsWithPeers(character, characters);
  const master = characters.find(c => c.i === masterId);
  if (master) ensureMasterApprenticeContactBond(master, character);
  finalizeCharacterSocietyForPeer(character, characters, {
    stateNames: {},
    currentYear: getSimulationYear()
  });
  if (domain === "metallurgy") ensureBlacksmithingSkill(character, "apprentice");
  return character;
}

/** Ends the successor's apprentice role and promotes them to master; transfers any remaining apprentices to them. */
function promoteApprentice(
  successor: Character,
  otherApprentices: Character[],
  burgId: number,
  domain: CraftKnowledgeDomain,
  year: number
): void {
  const apprenticeRole = successor.roles?.find(
    role => isApprenticeRole(role, burgId, domain) && role.endYear === undefined
  );
  if (apprenticeRole) apprenticeRole.endYear = year;

  successor.roles ??= [];
  successor.roles.push(createMasterRole(burgId, domain));

  for (const other of otherApprentices) {
    if (other.i === successor.i) continue;
    const role = other.roles?.find(
      candidate => isApprenticeRole(candidate, burgId, domain) && candidate.endYear === undefined
    );
    if (role) role.organizationId = successor.i;
  }
}

/** Ends a dead master's role and promotes an apprentice when one survives. */
function handleMasterDeath(
  characters: Character[],
  master: Character,
  burgId: number,
  domain: CraftKnowledgeDomain,
  year: number
): void {
  const masterRole = master.roles?.find(role => isMasterRole(role, burgId, domain) && role.endYear === undefined);
  if (masterRole) masterRole.endYear = year;

  const apprentices = findApprentices(characters, master.i, burgId, domain);
  const successor = apprentices.find(apprentice => !apprentice.dead);
  const guild = getGuildKnowledgeStocks().find(entry => entry.burgId === burgId && entry.domain === domain);

  // The guild treasury stays institutional capital. Only the dead person's private wealth follows
  // the trained successor, or partially reverts to the guild when there is none.
  const estateSettlement = settleGuildMasterEstate(master, successor, guild);
  if (estateSettlement.revertedToGuild > 0) setGuildKnowledgeStocks(getGuildKnowledgeStocks());

  if (successor) {
    if (domain === "metallurgy") {
      const masterSkill = ensureBlacksmithingSkill(master, "master");
      const successorSkill = ensureBlacksmithingSkill(successor, "apprentice");
      settleBlacksmithingSuccession(masterSkill, successorSkill);
    }
    promoteApprentice(successor, apprentices, burgId, domain, year);
  } else {
    applyMasterlessGuildPenalty(burgId, domain);
  }
  if (domain === "metallurgy") discardIndividualSkills(master.i);
}

function growApprentices(
  characters: Character[],
  master: Character,
  burgId: number,
  domain: CraftKnowledgeDomain,
  chance: (probability: number) => boolean
): void {
  if (domain !== "metallurgy" || master.dead) return;

  const apprentices = findApprentices(characters, master.i, burgId, domain);
  const stock = getGuildKnowledgeStocks().find(entry => entry.burgId === burgId && entry.domain === domain)?.stock ?? 0;
  const masterSkill = ensureBlacksmithingSkill(master, "master");
  growMasterBlacksmithing(masterSkill, stock);

  const apprenticeSkills: CharacterDomainSkill[] = [];

  for (const apprentice of apprentices) {
    if (apprentice.dead) {
      discardIndividualSkills(apprentice.i);
      continue;
    }
    const apprenticeSkill = ensureBlacksmithingSkill(apprentice, "apprentice");
    growApprenticeBlacksmithing(apprenticeSkill, masterSkill, stock);
    apprenticeSkills.push(apprenticeSkill);
  }

  settleBlacksmithingTechniques(masterSkill, apprenticeSkills, stock, chance);

  const collaborators = characters.flatMap(character => {
    if (character.dead || character.i === master.i || character.location !== burgId) return [];
    const skill = getIndividualSkill(character.i);
    return skill?.domain === "blacksmithing" ? [skill] : [];
  });
  advanceBlacksmithingTechniqueLeads(masterSkill, collaborators, stock);
}

function maybeSpawnApprentice(
  characters: Character[],
  master: Character,
  burgId: number,
  domain: CraftKnowledgeDomain
): void {
  if (domain !== "metallurgy" || master.dead) return;
  if (ensureBlacksmithingSkill(master, "master").proficiency < MASTER_APPRENTICE_ELIGIBLE_SKILL) return;

  const apprenticeCount = findApprentices(characters, master.i, burgId, domain).length;
  if (apprenticeCount >= MAX_APPRENTICES_PER_MASTER) return;

  createApprentice(characters, burgId, domain, master.i);
}

/** Returns true when this call established a brand-new master (not a reused/succeeded one). */
function processGuildSuccession(
  characters: Character[],
  burgId: number,
  domain: CraftKnowledgeDomain,
  year: number,
  chance: (probability: number) => boolean
): boolean {
  let master = findMasterRoleHolder(characters, burgId, domain);

  if (master?.dead) {
    handleMasterDeath(characters, master, burgId, domain, year);
    master = findMaster(characters, burgId, domain);
  }

  let createdNewMaster = false;
  if (!master) {
    master = createMaster(characters, burgId, domain) ?? undefined;
    createdNewMaster = Boolean(master);
  }
  // Enemy-dedicated burgs (goblin etc.) never run peaceful craft guilds.
  if (!master) return false;

  growApprentices(characters, master, burgId, domain, chance);
  maybeSpawnApprentice(characters, master, burgId, domain);
  return createdNewMaster;
}

/** A domain guild that got its first-ever Guild Master this settleAnnual() pass. */
export interface NewGuildMaster {
  readonly burgId: number;
  readonly domain: CraftKnowledgeDomain;
}

export class GuildSuccessionModule {
  /**
   * Runs at most once per simulation year. No ordering dependency beyond GuildKnowledge having
   * settled this year's stock first, so this year's growth/eligibility checks read fresh values
   * (docs/plan/knowledge-guild-system.md §9 Phase 6).
   *
   * Returns every (burgId, domain) that got a brand-new master this pass, so a caller above both
   * this module and guildTreasury.ts in the dependency graph (economy/index.tsx) can fire that
   * guild's one-time working-capital/starter-material seed (GuildTreasury.seedNewGuildWorkingCapital())
   * without this module importing guildTreasury.ts directly — guildTreasury.ts transitively depends
   * on markets-generator.ts → marketManagers.ts → characterStipends.ts, which already imports this
   * module (findMaster/findApprentices), so a direct import here would close an import cycle.
   */
  settleAnnual(chance: (probability: number) => boolean = P): NewGuildMaster[] {
    const year = getSimulationYear();
    if (getGuildSuccessionLastSettledYear() === year) return [];
    setGuildSuccessionLastSettledYear(year);

    const { pack } = getWorldContext();
    pack.characters ??= [];
    const characters = pack.characters;

    const newMasters: NewGuildMaster[] = [];

    for (const domain of SUCCESSION_DOMAINS) {
      const burgIds = getGuildKnowledgeStocks()
        .filter(entry => entry.domain === domain && entry.stock > 0)
        .map(entry => entry.burgId);

      for (const burgId of burgIds) {
        const createdNewMaster = processGuildSuccession(characters, burgId, domain, year, chance);
        if (createdNewMaster) newMasters.push({ burgId, domain });
      }
    }

    return newMasters;
  }
}

export const GuildSuccession = new GuildSuccessionModule();

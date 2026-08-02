import { applyCharacterBackstory, seedRelationsWithPeers } from "../../characters/backstoryProfile";
import type { Character, CharacterRole } from "../../characters/characterTypes";
import { finalizeCharacterSocietyForPeer } from "../../characters/finalizeCharacterSociety";
import { createPerson } from "../../characters/personFactory";
import type { Burg } from "../../hostTypes";
import { P, rand } from "../../hostUtils";
import {
  getGuildKnowledgeStocks,
  getGuildSuccessionLastSettledYear,
  getSimulationYear,
  getWorldContext,
  setGuildSuccessionLastSettledYear
} from "../economyContext";
import { rollBalancedEconomyGender } from "./economyCharacterGender";
import { applyMasterlessGuildPenalty } from "./guildKnowledge";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";
import {
  discardIndividualSkills,
  ensureBlacksmithingSkill,
  growApprenticeBlacksmithing,
  growMasterBlacksmithing,
  inheritBlacksmithingTechniques,
  settleBlacksmithingTechniques
} from "./individualSkillMastery";
import type { CharacterDomainSkill } from "./individualSkillTypes";

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
const APPRENTICE_MIN_AGE = 12;
const APPRENTICE_MAX_AGE = 17;

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

function resolveBurgCulture(burg: Burg | undefined): number {
  const { pack } = getWorldContext();
  const cellCulture = burg?.cell !== undefined ? pack.cells?.culture?.[burg.cell] : undefined;
  const stateCulture = burg?.state !== undefined ? pack.states?.[burg.state]?.culture : undefined;
  return burg?.culture ?? cellCulture ?? stateCulture ?? 0;
}

export function findMaster(
  characters: Character[],
  burgId: number,
  domain: CraftKnowledgeDomain
): Character | undefined {
  return characters.find(c => c.roles?.some(role => isMasterRole(role, burgId, domain) && role.endYear === undefined));
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

function createMaster(characters: Character[], burgId: number, domain: CraftKnowledgeDomain): Character {
  const { pack } = getWorldContext();
  const burg = pack.burgs[burgId] as Burg | undefined;
  const character = createPerson(getNextCharacterId(characters), resolveBurgCulture(burg), {
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

function createApprentice(
  characters: Character[],
  burgId: number,
  domain: CraftKnowledgeDomain,
  masterId: number
): Character {
  const { pack } = getWorldContext();
  const burg = pack.burgs[burgId] as Burg | undefined;
  const character = createPerson(getNextCharacterId(characters), resolveBurgCulture(burg), {
    primarySkill: "engineering",
    roleClass: "ordinary",
    ageOverride: rand(APPRENTICE_MIN_AGE, APPRENTICE_MAX_AGE),
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

/** Ends a dead master's role and either promotes an apprentice or penalizes the guild's stock ("lost secrets"). */
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

  if (successor) {
    if (domain === "metallurgy") {
      const masterSkill = ensureBlacksmithingSkill(master, "master");
      const successorSkill = ensureBlacksmithingSkill(successor, "apprentice");
      inheritBlacksmithingTechniques(masterSkill, successorSkill);
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

function processGuildSuccession(
  characters: Character[],
  burgId: number,
  domain: CraftKnowledgeDomain,
  year: number,
  chance: (probability: number) => boolean
): void {
  let master = findMaster(characters, burgId, domain);

  if (master?.dead) {
    handleMasterDeath(characters, master, burgId, domain, year);
    master = findMaster(characters, burgId, domain);
  }

  if (!master) master = createMaster(characters, burgId, domain);

  growApprentices(characters, master, burgId, domain, chance);
  maybeSpawnApprentice(characters, master, burgId, domain);
}

export class GuildSuccessionModule {
  /**
   * Runs at most once per simulation year. No ordering dependency beyond GuildKnowledge having
   * settled this year's stock first, so this year's growth/eligibility checks read fresh values
   * (docs/plan/knowledge-guild-system.md §9 Phase 6).
   */
  settleAnnual(chance: (probability: number) => boolean = P): boolean {
    const year = getSimulationYear();
    if (getGuildSuccessionLastSettledYear() === year) return false;
    setGuildSuccessionLastSettledYear(year);

    const { pack } = getWorldContext();
    pack.characters ??= [];
    const characters = pack.characters;

    for (const domain of SUCCESSION_DOMAINS) {
      const burgIds = getGuildKnowledgeStocks()
        .filter(entry => entry.domain === domain && entry.stock > 0)
        .map(entry => entry.burgId);

      for (const burgId of burgIds) {
        processGuildSuccession(characters, burgId, domain, year, chance);
      }
    }

    return true;
  }
}

export const GuildSuccession = new GuildSuccessionModule();

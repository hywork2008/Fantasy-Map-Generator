import type { Character } from "../../characters/characterTypes";
import type { MilitaryRegiment } from "../../hostTypes";
import {
  getIndividualSkills,
  getMartialDisciplineStocks,
  getMartialIndividualMasteryLastSettledYear,
  getSimulationYear,
  getWorldContext,
  isEconomyContextReady,
  setIndividualSkills,
  setMartialIndividualMasteryLastSettledYear
} from "../economyContext";
import { discardIndividualSkill, getIndividualSkill } from "./individualSkillMastery";
import type { AptitudeTier, CharacterDomainSkill } from "./individualSkillTypes";

export const MARTIAL_INDIVIDUAL_DOMAINS = ["swordsmanship", "archery"] as const;
type MartialIndividualDomain = (typeof MARTIAL_INDIVIDUAL_DOMAINS)[number];

const COMMANDER_TITLES = ["Commander", "Admiral", "Marshal"] as const;
const COMMANDER_BASE_PRACTICE_GAIN = 2.5;
const COMMANDER_SKILL_BONUS_MAX = 0.12;

function clampProficiency(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function aptitudeFromMartial(character: Character): AptitudeTier {
  const baseline = Math.max(
    1,
    Math.min(100, Math.round(character.skills.martial * 0.65 + character.skills.prowess * 0.35))
  );
  const skillAdjustment = Math.round((baseline - 50) * 0.12);
  const seed = ((character.i * 37 + baseline * 17) % 100) + 1;
  if (seed <= Math.max(1, 10 - skillAdjustment)) return "poor";
  if (seed <= Math.max(2, 65 - skillAdjustment)) return "ordinary";
  if (seed <= Math.max(3, 90 - skillAdjustment)) return "promising";
  if (seed <= Math.max(4, 99 - skillAdjustment)) return "gifted";
  return "exceptional";
}

function initialProficiency(character: Character): number {
  return clampProficiency(
    Math.max(20, Math.min(90, character.skills.martial * 0.65 + character.skills.prowess * 0.35))
  );
}

function ensureMartialSkill(character: Character, domain: MartialIndividualDomain): CharacterDomainSkill {
  const existing = getIndividualSkill(character.i, domain);
  if (existing) return existing;

  const skill: CharacterDomainSkill = {
    characterId: character.i,
    domain,
    proficiency: initialProficiency(character),
    aptitude: aptitudeFromMartial(character),
    techniques: []
  };
  setIndividualSkills([...getIndividualSkills(), skill]);
  return skill;
}

function classifyUnitType(unitType: string | undefined): MartialIndividualDomain | null {
  if (unitType === "melee") return "swordsmanship";
  if (unitType === "ranged") return "archery";
  return null;
}

function activeCommander(characters: Character[], regiment: MilitaryRegiment): Character | undefined {
  if (regiment.commanderId === undefined) return undefined;
  const character = characters.find(candidate => candidate.i === regiment.commanderId);
  if (!character || character.dead) return undefined;
  return character.titles.some(
    title =>
      title.entityType === "state" &&
      title.entityId === regiment.state &&
      (COMMANDER_TITLES as readonly string[]).includes(title.title)
  )
    ? character
    : undefined;
}

function disciplineStock(stateId: number, domain: MartialIndividualDomain): number {
  return getMartialDisciplineStocks().find(stock => stock.stateId === stateId && stock.domain === domain)?.stock ?? 0;
}

function growCommanderSkill(skill: CharacterDomainSkill, stock: number, commandedTroops: number): void {
  if (!(stock > 0) || commandedTroops <= 0 || skill.proficiency >= 100) return;
  const practiceCoverage = Math.min(1, 0.35 + commandedTroops / 500);
  const trainingQuality = 0.4 + Math.min(1, stock) * 0.6;
  const aptitudeMultiplier: Readonly<Record<AptitudeTier, number>> = {
    poor: 0.8,
    ordinary: 1,
    promising: 1.12,
    gifted: 1.25,
    exceptional: 1.4
  };
  const diminishingReturns =
    skill.proficiency >= 90
      ? Math.max(0.05, 1 - skill.proficiency / 120) * 0.4
      : Math.max(0.05, 1 - skill.proficiency / 120);
  skill.proficiency = clampProficiency(
    skill.proficiency +
      COMMANDER_BASE_PRACTICE_GAIN *
        practiceCoverage *
        trainingQuality *
        aptitudeMultiplier[skill.aptitude] *
        diminishingReturns
  );
  skill.lastPracticedYear = getSimulationYear();
}

/** Weighted individual-practice multiplier for a commander's own regiment. */
export function getCommanderMartialSkillMultiplier(commander: Character, regiment: MilitaryRegiment): number {
  if (!isEconomyContextReady()) return 1;

  const unitTypeByName = new Map((getWorldContext().options.military || []).map(unit => [unit.name, unit.type]));
  let total = 0;
  let bonus = 0;
  for (const [unitName, count] of Object.entries(regiment.u || {})) {
    if (count <= 0) continue;
    total += count;
    const domain = classifyUnitType(unitTypeByName.get(unitName));
    if (!domain) continue;
    const skill = getIndividualSkill(commander.i, domain);
    if (skill) bonus += count * COMMANDER_SKILL_BONUS_MAX * (skill.proficiency / 100);
  }
  return total > 0 ? 1 + bonus / total : 1;
}

export class MartialIndividualMasteryModule {
  /** Creates and advances skills only for living officers who actively command a regiment. */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getMartialIndividualMasteryLastSettledYear() === year) return false;
    setMartialIndividualMasteryLastSettledYear(year);

    const { pack, options } = getWorldContext();
    const characters = pack.characters ?? [];
    const unitTypeByName = new Map((options.military || []).map(unit => [unit.name, unit.type]));
    const commandedDomains = new Map<number, Map<MartialIndividualDomain, { stateId: number; troops: number }>>();

    for (const state of pack.states) {
      if (!state.i || state.removed) continue;
      for (const regiment of state.military || []) {
        const commander = activeCommander(characters, regiment);
        if (!commander) continue;
        for (const [unitName, count] of Object.entries(regiment.u || {})) {
          if (count <= 0) continue;
          const domain = classifyUnitType(unitTypeByName.get(unitName));
          if (!domain) continue;
          const byDomain =
            commandedDomains.get(commander.i) ??
            new Map<MartialIndividualDomain, { stateId: number; troops: number }>();
          const previous = byDomain.get(domain);
          byDomain.set(domain, { stateId: state.i, troops: (previous?.troops ?? 0) + count });
          commandedDomains.set(commander.i, byDomain);
        }
      }
    }

    for (const character of characters) {
      if (!character.dead) continue;
      for (const domain of MARTIAL_INDIVIDUAL_DOMAINS) discardIndividualSkill(character.i, domain);
    }

    for (const [characterId, domains] of commandedDomains) {
      const character = characters.find(candidate => candidate.i === characterId);
      if (!character) continue;
      for (const [domain, command] of domains) {
        const skill = ensureMartialSkill(character, domain);
        growCommanderSkill(skill, disciplineStock(command.stateId, domain), command.troops);
      }
    }
    return true;
  }
}

export const MartialIndividualMastery = new MartialIndividualMasteryModule();

import type { Character } from "../../characters/characterTypes";
import { getIndividualSkills, getSimulationYear, setIndividualSkills } from "../economyContext";
import type { AptitudeTier, BlacksmithingTechnique, CharacterDomainSkill } from "./individualSkillTypes";

export const BLACKSMITHING_DOMAIN = "blacksmithing" as const;

const APTITUDE_GROWTH_MULTIPLIER: Readonly<Record<AptitudeTier, number>> = {
  poor: 0.8,
  ordinary: 1,
  promising: 1.12,
  gifted: 1.25,
  exceptional: 1.4
};

const APPRENTICE_BASE_PRACTICE_GAIN = 5;
const MASTER_BASE_PRACTICE_GAIN = 1.5;

function clampProficiency(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function roundChance(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function diminishingReturns(proficiency: number): number {
  const base = Math.max(0.05, 1 - proficiency / 120);
  return proficiency >= 90 ? base * 0.4 : base;
}

/** Deterministic tier seed that preserves the intended population distribution. */
export function aptitudeFromEngineering(character: Pick<Character, "i" | "skills">): AptitudeTier {
  const engineering = Math.max(1, Math.min(100, character.skills.engineering));
  const skillAdjustment = Math.round((engineering - 50) * 0.12);
  const seed = ((character.i * 37 + engineering * 17) % 100) + 1;
  if (seed <= Math.max(1, 10 - skillAdjustment)) return "poor";
  if (seed <= Math.max(2, 65 - skillAdjustment)) return "ordinary";
  if (seed <= Math.max(3, 90 - skillAdjustment)) return "promising";
  if (seed <= Math.max(4, 99 - skillAdjustment)) return "gifted";
  return "exceptional";
}

function initialProficiency(character: Pick<Character, "skills">, role: "master" | "apprentice"): number {
  const engineering = character.skills.engineering;
  return role === "master"
    ? clampProficiency(Math.max(40, Math.min(90, engineering)))
    : clampProficiency(Math.max(8, Math.min(30, engineering * 0.35)));
}

export function getIndividualSkill(
  characterId: number,
  domain = BLACKSMITHING_DOMAIN
): CharacterDomainSkill | undefined {
  return getIndividualSkills().find(skill => skill.characterId === characterId && skill.domain === domain);
}

/** Materializes a legacy guild character's practical skill only when the role needs it. */
export function ensureBlacksmithingSkill(
  character: Pick<Character, "i" | "skills">,
  role: "master" | "apprentice"
): CharacterDomainSkill {
  const existing = getIndividualSkill(character.i);
  if (existing) return existing;

  const skill: CharacterDomainSkill = {
    characterId: character.i,
    domain: BLACKSMITHING_DOMAIN,
    proficiency: initialProficiency(character, role),
    aptitude: aptitudeFromEngineering(character),
    techniques: []
  };
  setIndividualSkills([...getIndividualSkills(), skill]);
  return skill;
}

export function discardIndividualSkills(characterId: number): void {
  const skills = getIndividualSkills();
  const retained = skills.filter(skill => skill.characterId !== characterId);
  if (retained.length !== skills.length) setIndividualSkills(retained);
}

function grow(skill: CharacterDomainSkill, baseGain: number, coverage: number, trainingQuality: number): void {
  if (!(coverage > 0) || skill.proficiency >= 100) return;
  const gain =
    baseGain *
    Math.min(1, coverage) *
    Math.min(1, trainingQuality) *
    APTITUDE_GROWTH_MULTIPLIER[skill.aptitude] *
    diminishingReturns(skill.proficiency);
  skill.proficiency = clampProficiency(skill.proficiency + gain);
  skill.lastPracticedYear = getSimulationYear();
}

/** A master continues to refine their own craft, but much slower than an apprentice learns. */
export function growMasterBlacksmithing(skill: CharacterDomainSkill, guildStock: number): void {
  grow(skill, MASTER_BASE_PRACTICE_GAIN, guildStock, 0.45 + Math.min(1, guildStock) * 0.55);
}

/**
 * Annual hands-on training. Guild stock supplies the institutional part of the
 * education; the master's actual proficiency supplies the personal instruction.
 */
export function growApprenticeBlacksmithing(
  apprentice: CharacterDomainSkill,
  master: CharacterDomainSkill,
  guildStock: number
): void {
  const trainingQuality = 0.4 + Math.min(1, master.proficiency / 100) * 0.35 + Math.min(1, guildStock) * 0.25;
  grow(apprentice, APPRENTICE_BASE_PRACTICE_GAIN, guildStock, trainingQuality);
}

function hasTechnique(skill: CharacterDomainSkill, technique: BlacksmithingTechnique): boolean {
  return skill.techniques.includes(technique);
}

function learn(skill: CharacterDomainSkill, technique: BlacksmithingTechnique): boolean {
  if (hasTechnique(skill, technique)) return false;
  skill.techniques.push(technique);
  return true;
}

/**
 * Performs threshold-and-access based metallurgy technique acquisition. The
 * caller supplies the deterministic simulation RNG so this is never a lone,
 * unconstrained lottery (docs/plan/individual-skill-mastery-system.md §5.2).
 */
export function settleBlacksmithingTechniques(
  master: CharacterDomainSkill,
  apprentices: readonly CharacterDomainSkill[],
  guildStock: number,
  chance: (probability: number) => boolean
): boolean {
  let changed = false;
  const stock = Math.min(1, Math.max(0, guildStock));

  if (master.proficiency >= 80 && stock >= 0.5 && !hasTechnique(master, "heatTreatment")) {
    changed ||= chance(roundChance(0.12 * APTITUDE_GROWTH_MULTIPLIER[master.aptitude] * stock));
    if (changed) learn(master, "heatTreatment");
  }

  if (
    master.proficiency >= 95 &&
    master.aptitude === "exceptional" &&
    stock >= 0.8 &&
    hasTechnique(master, "heatTreatment") &&
    !hasTechnique(master, "patternWelding") &&
    chance(0.04 * stock)
  ) {
    changed = learn(master, "patternWelding") || changed;
  }

  for (const apprentice of apprentices) {
    if (apprentice.proficiency < 80) continue;
    for (const technique of master.techniques) {
      if (hasTechnique(apprentice, technique)) continue;
      const inherited = chance(roundChance(0.35 * APTITUDE_GROWTH_MULTIPLIER[apprentice.aptitude] * stock));
      if (inherited) changed = learn(apprentice, technique) || changed;
    }
  }

  return changed;
}

/** A living successor keeps a master's personal techniques only through direct apprenticeship. */
export function inheritBlacksmithingTechniques(
  predecessor: CharacterDomainSkill,
  successor: CharacterDomainSkill
): boolean {
  let changed = false;
  for (const technique of predecessor.techniques) changed = learn(successor, technique) || changed;
  return changed;
}

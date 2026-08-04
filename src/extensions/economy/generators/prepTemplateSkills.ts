/**
 * Domain skill floors for adventurer prep templates (EQ-5).
 * Raises individualSkills proficiency to the template floor without lowering higher values.
 * Does not touch base Character.skills.
 */
import type { PrepTemplateId } from "../../characters/adventurerTemplates";
import { getPrepTemplate } from "../../characters/adventurerTemplates";
import type { Character } from "../../characters/characterTypes";
import { getSimulationYear } from "../economyContext";
import { getIndividualSkill } from "./individualSkillMastery";
import { ensureMartialDomainSkill, type MartialIndividualDomain } from "./martialIndividualMastery";

function clampProficiency(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

/**
 * Ensure domain rows exist and raise proficiency to at least the template floors.
 * @returns true if any skill was created or proficiency raised
 */
export function applyPrepTemplateSkills(character: Character, templateId: PrepTemplateId): boolean {
  if (character.dead) return false;
  const def = getPrepTemplate(templateId);
  const seeds = def?.domainSeeds;
  if (!seeds) return false;

  let changed = false;
  const year = getSimulationYear();

  const applyFloor = (domain: MartialIndividualDomain, floor: number | undefined): void => {
    if (floor === undefined || !(floor > 0)) return;
    const existed = getIndividualSkill(character.i, domain);
    const skill = ensureMartialDomainSkill(character, domain);
    if (!existed) changed = true;
    const target = clampProficiency(floor);
    if (skill.proficiency + 1e-9 < target) {
      skill.proficiency = target;
      skill.lastPracticedYear = year;
      changed = true;
    }
  };

  applyFloor("swordsmanship", seeds.swordsmanship);
  applyFloor("archery", seeds.archery);
  return changed;
}

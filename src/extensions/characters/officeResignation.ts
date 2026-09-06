import { getRaceById, isCarnivorousBeastfolkAnimal } from "../../data/races";
import type { Race } from "../../types/models";
import { resolveCharacterRaceId } from "./appearance";
import type { Character, CharacterSkills } from "./characterTypes";

/** Long-lived elven folk: unmatched office pressure often reads as ennui, not crushing stress. */
const ELVEN_RACE_KEYS = new Set(["elf", "dark_elf"]);

const MARTIAL_TITLE_RE = /Marshal|Minister of War|General/i;

/** Marshal Boldness must differ from the state's war posture by this much to override race flavor. */
export const MARTIAL_WAR_MISMATCH = 25;

export const OFFICE_RESIGNATION_STRESS = "Resigned (Stress)";
export const OFFICE_RESIGNATION_BOREDOM = "Resigned (Boredom)";

export interface OfficeResignationContext {
  races?: readonly Race[];
  title?: string;
  primarySkill?: keyof CharacterSkills;
  /** 0–100: how war-forward the state is (ruler policy and active wars). */
  stateWarlike?: number;
}

export function isMartialOffice(title?: string, primarySkill?: string): boolean {
  if (primarySkill === "martial") return true;
  return Boolean(title && MARTIAL_TITLE_RE.test(title));
}

/** Combine ruler Boldness (policy) with current enemy/rival pressure (0–100). */
export function combineStateWarlike(policyBoldness: number | undefined, threat: number): number {
  const policy = Number.isFinite(policyBoldness) ? (policyBoldness as number) : 50;
  const warReality = Math.min(100, Math.max(0, threat * 10));
  return Math.max(policy, warReality);
}

export function martialWarGap(boldness: number, stateWarlike: number): number {
  return boldness - stateWarlike;
}

/**
 * Elves and carnivorous Beastfolk leave most offices from restlessness rather than
 * internalized stress. Martial mismatch can override this — see officeResignationReason.
 */
export function officeLeavesFromEnnui(
  character: Pick<Character, "race" | "culture" | "raceAppearance">,
  races: readonly Race[] | undefined
): boolean {
  const race = getRaceById(races, resolveCharacterRaceId(character));
  const key = race?.key;
  if (key && ELVEN_RACE_KEYS.has(key)) return true;
  if (key === "beastfolk" && character.raceAppearance?.kind === "beastfolk") {
    return isCarnivorousBeastfolkAnimal(character.raceAppearance.animal);
  }
  return false;
}

export function shouldResignFromMartialEnnui(
  character: Pick<Character, "personality">,
  context: Pick<OfficeResignationContext, "title" | "primarySkill" | "stateWarlike">
): boolean {
  if (!isMartialOffice(context.title, context.primarySkill)) return false;
  if (context.stateWarlike === undefined) return false;
  return martialWarGap(character.personality.boldness, context.stateWarlike) >= MARTIAL_WAR_MISMATCH;
}

/**
 * Label for an office exit. Martial officers follow the gap between their Boldness
 * and the state's war posture: a hawk in a peaceful court is bored, a dove in a
 * warlike court is stressed (even if elf). Otherwise race flavor applies.
 */
export function officeResignationReason(
  character: Pick<Character, "race" | "culture" | "raceAppearance" | "personality">,
  context: OfficeResignationContext = {}
): string {
  if (isMartialOffice(context.title, context.primarySkill) && context.stateWarlike !== undefined) {
    const gap = martialWarGap(character.personality.boldness, context.stateWarlike);
    if (gap >= MARTIAL_WAR_MISMATCH) return OFFICE_RESIGNATION_BOREDOM;
    if (gap <= -MARTIAL_WAR_MISMATCH) return OFFICE_RESIGNATION_STRESS;
  }
  return officeLeavesFromEnnui(character, context.races) ? OFFICE_RESIGNATION_BOREDOM : OFFICE_RESIGNATION_STRESS;
}

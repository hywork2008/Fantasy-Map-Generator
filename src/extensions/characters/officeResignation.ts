import type { Race } from "../../types/models";
import { activeGoalIntensity, getWarPreference } from "./characterMotivation";
import type { Character, CharacterSkills } from "./characterTypes";

const MARTIAL_TITLE_RE = /Marshal|Minister of War|General/i;
export const MARTIAL_WAR_MISMATCH = 25;
export const OFFICE_RESIGNATION_STRESS = "Resigned (Stress)";
export const OFFICE_RESIGNATION_BOREDOM = "Resigned (Boredom)";

export type OfficeExitCause =
  | "stress"
  | "boredom"
  | "conscience"
  | "policy_conflict"
  | "mission_complete"
  | "family"
  | "health"
  | "return_home"
  | "recognition"
  | "danger"
  | "loyalty_conflict";

export const OFFICE_EXIT_REASONS: Record<OfficeExitCause, string> = {
  stress: OFFICE_RESIGNATION_STRESS,
  boredom: OFFICE_RESIGNATION_BOREDOM,
  conscience: "Resigned (Conscience)",
  policy_conflict: "Resigned (Policy conflict)",
  mission_complete: "Resigned (Mission complete)",
  family: "Resigned (Family)",
  health: "Resigned (Health)",
  return_home: "Resigned (Return home)",
  recognition: "Resigned (Lack of recognition)",
  danger: "Resigned (Danger)",
  loyalty_conflict: "Resigned (Conflicting loyalties)"
};

export interface OfficeResignationContext {
  /** Retained for callers; species no longer overrides the actual cause. */
  races?: readonly Race[];
  title?: string;
  primarySkill?: keyof CharacterSkills;
  stateWarlike?: number;
  /** Policy appetite for aggression, separate from defensive pressure. */
  policyWarPreference?: number;
  cause?: OfficeExitCause;
  stateId?: number;
  characters?: readonly Character[];
}

export function isMartialOffice(title?: string, primarySkill?: string): boolean {
  return primarySkill === "martial" || Boolean(title && MARTIAL_TITLE_RE.test(title));
}

/** Combine war appetite with actual pressure for the office workload only. */
export function combineStateWarlike(warPreference: number | undefined, threat: number): number {
  const policy = Number.isFinite(warPreference) ? (warPreference as number) : 50;
  return Math.max(0, Math.min(100, Math.max(policy, threat * 10)));
}

export function martialWarGap(warPreference: number, stateWarlike: number): number {
  return warPreference - stateWarlike;
}

export function shouldResignFromMartialEnnui(
  character: Pick<Character, "personality" | "backstory">,
  context: OfficeResignationContext
): boolean {
  if (!isMartialOffice(context.title, context.primarySkill) || context.stateWarlike === undefined) return false;
  return (
    getWarPreference(character) >= 60 &&
    martialWarGap(getWarPreference(character), context.stateWarlike) >= MARTIAL_WAR_MISMATCH
  );
}

/** Additional voluntary exits with observable evidence; missing data means no such trigger. */
export function personalOfficeExitCause(
  character: Character,
  context: OfficeResignationContext
): OfficeExitCause | undefined {
  if (character.health !== undefined && character.health <= 25) return "health";
  if (
    character.backstory?.goals?.some(
      g =>
        g.kind === "complete_service" &&
        g.status === "completed" &&
        g.target?.type === "state" &&
        g.target.id === (context.stateId ?? character.state)
    )
  )
    return "mission_complete";
  if (
    activeGoalIntensity(character, "return_home") >= 70 &&
    character.backstory?.origin.homeBurgId &&
    character.location !== character.backstory.origin.homeBurgId
  )
    return "return_home";
  if (activeGoalIntensity(character, "reunite_family") >= 70) {
    const goal = character.backstory?.goals?.find(g => g.kind === "reunite_family" && g.status === "active");
    if (goal?.target?.type === "character") {
      const familyIds = [
        character.family.fatherId,
        character.family.motherId,
        ...(character.family.spouseIds ?? []),
        ...(character.family.childIds ?? [])
      ];
      const relative = context.characters?.find(c => c.i === goal.target!.id && !c.dead);
      if (
        familyIds.includes(goal.target.id) &&
        relative?.location !== undefined &&
        relative.location !== character.location
      )
        return "family";
    }
  }
  if (
    isMartialOffice(context.title, context.primarySkill) &&
    (context.policyWarPreference ?? 0) >= 70 &&
    getWarPreference(character) <= 15
  )
    return "policy_conflict";
  return undefined;
}

/** Record the reason that actually triggered the exit, independent of species. */
export function officeResignationReason(
  _character: Pick<Character, "personality">,
  context: OfficeResignationContext = {}
): string {
  return OFFICE_EXIT_REASONS[context.cause ?? "stress"];
}

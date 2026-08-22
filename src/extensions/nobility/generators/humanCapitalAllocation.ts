import { getCultureKnowledgeValue } from "../../../utils/cultureKnowledgeValue";
import type { Character, CharacterRole, TitleHolding } from "../../characters/characterTypes";
import type { State } from "../../hostTypes";
import {
  getCurrentYear,
  getRulerId,
  getTalentAllocationLastSettledYear,
  getWorldContext,
  setTalentAllocationLastSettledYear
} from "../nobilityContext";
import { getRegimentCommander, regimentQualifiesForDedicatedOfficer } from "./officerAssignment";

/** A practical floor: a policy that is merely average must not homogenize the roster. */
export const TALENT_ALLOCATION_POLICY_MIN = 0.65;
export const MARTIAL_REDEPLOYMENT_MIN = 85;
export const CRAFT_ENGINEERING_MISMATCH_MAX = 40;
export const GUILD_MASTER_ENGINEERING_MISMATCH_MAX = 42;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function active(role: CharacterRole): boolean {
  return role.endYear === undefined;
}

function isCraftCommitted(character: Character): boolean {
  const backstory = character.backstory;
  const commitment = backstory?.commitment;
  const commitments = [commitment?.primary, commitment?.secondary];
  if (commitment && commitment.intensity >= 60 && commitments.some(entry => entry?.kind === "craft")) return true;

  return Boolean(
    backstory?.tastes?.some(
      taste => taste.polarity === "like" && taste.intensity >= 60 && (taste.id === "craft" || taste.id === "machinery")
    )
  );
}

function activeGuildRole(character: Character, kind: "guildMaster" | "guildApprentice"): CharacterRole | undefined {
  return character.roles?.find(role => role.source === "economy" && role.kind === kind && active(role));
}

function hasActivePoliticalOffice(character: Character): boolean {
  return character.titles.some(title => title.endYear === undefined);
}

/**
 * The higher of a ruler's administrative/merit orientation and the polity's cultural norm.
 * This intentionally lets a learned culture sustain the practice across a mediocre reign,
 * while a highly capable, humane ruler can institute it in an otherwise ordinary culture.
 */
export function getTalentAllocationPolicy(state: Pick<State, "culture">, ruler?: Character): number {
  const culture = getWorldContext().pack.cultures?.[state.culture ?? 0];
  const culturalMerit = culture ? getCultureKnowledgeValue(culture) : 0;
  if (!ruler || ruler.dead) return culturalMerit;

  const p = ruler.personality;
  const rulerMerit =
    clamp01(ruler.skills.stewardship / 100) * 0.55 +
    clamp01(p.rationality / 100) * 0.25 +
    clamp01(p.compassion / 100) * 0.2;
  return Math.max(culturalMerit, rulerMerit);
}

function policyCanAct(state: State, characters: readonly Character[]): boolean {
  const rulerId = getRulerId(state);
  const ruler = rulerId === undefined ? undefined : characters.find(character => character.i === rulerId);
  return getTalentAllocationPolicy(state, ruler) >= TALENT_ALLOCATION_POLICY_MIN;
}

function endRole(role: CharacterRole, reason: string): void {
  role.endYear = getCurrentYear();
  role.reason = reason;
}

/** Resident occupations are mutually exclusive with a full guild-master appointment. */
function leaveResidentEmployment(character: Character, reason: string): void {
  for (const role of character.roles ?? []) {
    if (role.source === "characters" && role.entityType === "burg" && active(role)) endRole(role, reason);
  }
}

function appointCommander(character: Character, stateId: number, isNaval: boolean): void {
  const title: TitleHolding = {
    title: isNaval ? "Admiral" : "Commander",
    landed: false,
    entityType: "state",
    entityId: stateId,
    startYear: getCurrentYear()
  };
  character.titles.push(title);
}

/**
 * Moves one clearly misplaced guild apprentice into a real vacant command. It does not touch a
 * craft-minded person: low aptitude plus an explicit craft commitment is a valid life choice.
 */
function redeployMartialApprentice(state: State, characters: Character[]): boolean {
  const vacantRegiment = state.military?.find(
    regiment => regimentQualifiesForDedicatedOfficer(regiment) && !getRegimentCommander(characters, regiment)
  );
  if (!vacantRegiment) return false;

  const candidate = characters
    .filter(character => {
      const role = activeGuildRole(character, "guildApprentice");
      if (!role || character.dead || hasActivePoliticalOffice(character) || isCraftCommitted(character)) return false;
      const burg = getWorldContext().pack.burgs?.[role.entityId];
      return (
        burg?.state === state.i &&
        character.skills.martial >= MARTIAL_REDEPLOYMENT_MIN &&
        character.skills.engineering <= CRAFT_ENGINEERING_MISMATCH_MAX &&
        character.skills.martial - character.skills.engineering >= 30
      );
    })
    .toSorted((a, b) => b.skills.martial - a.skills.martial || a.i - b.i)[0];
  if (!candidate) return false;

  endRole(activeGuildRole(candidate, "guildApprentice")!, "Reassigned to military command by merit policy");
  appointCommander(candidate, state.i, Boolean(vacantRegiment.n));
  vacantRegiment.commanderId = candidate.i;
  return true;
}

/**
 * Replaces a non-committed, clearly weak guild master only when a substantially better local
 * civilian candidate already exists. No one is invented and an established apprenticeship is
 * not broken merely because its master has a low broad Engineering score.
 */
function replaceMismatchedGuildMaster(state: State, characters: Character[]): boolean {
  const masters = characters
    .map(character => ({ character, role: activeGuildRole(character, "guildMaster") }))
    .filter(
      (entry): entry is { character: Character; role: CharacterRole } =>
        entry.role !== undefined &&
        !entry.character.dead &&
        !isCraftCommitted(entry.character) &&
        entry.character.skills.engineering <= GUILD_MASTER_ENGINEERING_MISMATCH_MAX &&
        getWorldContext().pack.burgs?.[entry.role.entityId]?.state === state.i
    )
    .toSorted(
      (a, b) => a.character.skills.engineering - b.character.skills.engineering || a.character.i - b.character.i
    );

  for (const { character: master, role: masterRole } of masters) {
    const replacement = characters
      .filter(candidate => {
        if (candidate.dead || candidate.i === master.i || candidate.age < 18 || hasActivePoliticalOffice(candidate))
          return false;
        if (activeGuildRole(candidate, "guildMaster") || activeGuildRole(candidate, "guildApprentice")) return false;
        return (
          candidate.location === masterRole.entityId &&
          candidate.skills.engineering >= Math.max(65, master.skills.engineering + 25)
        );
      })
      .toSorted((a, b) => b.skills.engineering - a.skills.engineering || a.i - b.i)[0];
    if (!replacement) continue;

    endRole(masterRole, "Reassigned by merit policy");
    leaveResidentEmployment(replacement, "Reassigned to guild master by merit policy");
    replacement.roles ??= [];
    replacement.roles.push({ ...masterRole, startYear: getCurrentYear(), endYear: undefined, reason: undefined });
    for (const apprentice of characters) {
      const role = activeGuildRole(apprentice, "guildApprentice");
      if (
        role?.entityId === masterRole.entityId &&
        role.domain === masterRole.domain &&
        role.organizationId === master.i
      ) {
        role.organizationId = replacement.i;
      }
    }
    return true;
  }
  return false;
}

export class HumanCapitalAllocationModule {
  /** At most one correction per state/year, making reform institutional rather than omniscient. */
  settleAnnual(): number {
    const year = getCurrentYear();
    if (getTalentAllocationLastSettledYear() === year) return 0;
    setTalentAllocationLastSettledYear(year);

    const { pack } = getWorldContext();
    const characters = pack.characters;
    if (!characters?.length) return 0;

    let corrections = 0;
    for (const state of pack.states ?? []) {
      if (!state.i || state.removed || !policyCanAct(state, characters)) continue;
      if (redeployMartialApprentice(state, characters) || replaceMismatchedGuildMaster(state, characters))
        corrections += 1;
    }
    return corrections;
  }
}

export const HumanCapitalAllocation = new HumanCapitalAllocationModule();

/**
 * Initial public prestige: reconstructed social brand at generation.
 * Spec: docs/plan/characters/prestige.md
 */
import { gauss, rand } from "../hostUtils";
import type { Character, CharacterRoleClass, CharacterSkills, SocialStratum } from "./characterTypes";
import { careerStartAge, resolveRaceAgeProfile, scaleRaceDurationToHuman } from "./raceAge";

/** Public-deed cap after a long, highly visible career. */
export const PRESTIGE_RECORD_CAP = 55;
/** Human-year scale of the saturating record curve. */
export const PRESTIGE_RECORD_TAU = 28;
export const PRESTIGE_SKILL_BASE = 0.65;
export const PRESTIGE_SKILL_SPAN = 0.35;

/** Family-name known-ness only — not a finished lifetime of fame. */
export const INHERITED_NAME_BAND: Record<SocialStratum, readonly [number, number]> = {
  royal: [22, 38],
  high_noble: [12, 26],
  minor_noble: [8, 18],
  gentry: [5, 14],
  merchant_born: [4, 16],
  clergy_orphan: [3, 12],
  commoner: [1, 8],
  foreigner: [2, 14],
  unknown: [1, 10],
  freedman: [1, 5],
  slave_born: [1, 5]
};

const SPY_TITLE_RE = /spymaster|spy\b|intelligence|secretar.*state|whisper/i;
const COURT_MARTIAL_TITLE_RE = /^(Marshal|General|Minister of War)$/i;
const FIELD_COMMAND_TITLE_RE = /^(Commander|Admiral)$/i;
const MARTIAL_COMMAND_TITLE_RE = /^(Commander|Admiral|Marshal|General|Warlord)$/i;
const DIPLOMATIC_TITLE_RE = /Chancellor|Foreign Affairs|Diplomat|Envoy/i;
const STEWARD_TITLE_RE = /^(Steward|Prime Minister|Minister of Finance|Treasurer)$/i;
const FINANCE_TITLE_RE = /Finance|Treasury/i;
const FAITH_TITLE_RE = /Chaplain|Priest|Priestess|Bishop|Cleric|Imam|Dean|Vicar|Patriarch|Pontiff/i;

export interface PublicOfficeContribution {
  visibility: number;
  bump: number;
  skillKey?: keyof CharacterSkills;
}

export interface InitialPrestigeBreakdown {
  inherited: number;
  officeBump: number;
  record: number;
  visibility: number;
  careerYears: number;
  total: number;
}

function clampPrestige(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function isSpyTitle(title: string): boolean {
  return SPY_TITLE_RE.test(title);
}

function hasLandedStateTitle(character: Character): boolean {
  return character.titles.some(t => t.landed && t.entityType === "state");
}

function hasProvinceLordTitle(character: Character): boolean {
  return character.titles.some(t => t.landed && t.entityType === "province");
}

function consider(
  current: PublicOfficeContribution,
  visibility: number,
  bump: number,
  skillKey: keyof CharacterSkills | undefined
): void {
  if (visibility > current.visibility) {
    current.visibility = visibility;
    current.bump = bump;
    current.skillKey = skillKey;
  }
}

/**
 * Public visibility of the office, not court influence.
 * Spymaster / intelligence titles contribute nothing: job success is visible to the
 * ruler and immediate subordinates, not to the populace.
 */
export function publicOfficeContribution(
  character: Character,
  roleClass: CharacterRoleClass
): PublicOfficeContribution {
  if (roleClass === "ruler" || hasLandedStateTitle(character)) {
    return { visibility: 1, bump: rand(28, 38), skillKey: "diplomacy" };
  }

  const current: PublicOfficeContribution = { visibility: 0, bump: 0 };

  if (roleClass === "province_lord" || hasProvinceLordTitle(character)) {
    consider(current, 0.7, rand(12, 20), "stewardship");
  }
  if (roleClass === "merchant") {
    consider(current, 0.45, 0, "stewardship");
  }
  if (roleClass === "religious") {
    consider(current, 0.6, rand(7, 13), "learning");
  }

  for (const holding of character.titles) {
    const title = holding.title;
    if (isSpyTitle(title)) continue;
    if (COURT_MARTIAL_TITLE_RE.test(title)) consider(current, 0.9, rand(10, 16), "martial");
    else if (FIELD_COMMAND_TITLE_RE.test(title) || MARTIAL_COMMAND_TITLE_RE.test(title)) {
      consider(current, 0.8, rand(5, 12), "martial");
    } else if (DIPLOMATIC_TITLE_RE.test(title)) consider(current, 0.7, rand(8, 14), "diplomacy");
    else if (STEWARD_TITLE_RE.test(title) || FINANCE_TITLE_RE.test(title)) {
      consider(current, 0.5, rand(6, 11), "stewardship");
    } else if (FAITH_TITLE_RE.test(title)) consider(current, 0.6, rand(7, 13), "learning");
  }

  if (current.visibility === 0 && roleClass === "commander") {
    consider(current, 0.85, rand(8, 14), "martial");
  }
  if (current.visibility === 0 && roleClass === "central_officer") {
    if (character.titles.some(t => isSpyTitle(t.title))) {
      return { visibility: 0, bump: 0 };
    }
    consider(current, 0.35, rand(3, 8), "stewardship");
  }
  if (current.visibility === 0 && roleClass === "ordinary") {
    return { visibility: 0.15, bump: 0 };
  }

  return current;
}

/** Adult career length in human-equivalent years (0 before race career start). */
export function humanCareerYears(character: Pick<Character, "age" | "race">): number {
  const start = careerStartAge(character.race);
  const raceYears = Math.max(0, character.age - start);
  return scaleRaceDurationToHuman(raceYears, resolveRaceAgeProfile(character.race));
}

export function publicRecordPrestige(careerYears: number, visibility: number, skillValue: number | undefined): number {
  if (visibility <= 0 || careerYears <= 0) return 0;
  const skillFactor =
    skillValue === undefined
      ? PRESTIGE_SKILL_BASE
      : PRESTIGE_SKILL_BASE + PRESTIGE_SKILL_SPAN * Math.max(0, Math.min(1, skillValue / 100));
  const establishment = 1 - Math.exp((-careerYears * visibility) / PRESTIGE_RECORD_TAU);
  return PRESTIGE_RECORD_CAP * establishment * skillFactor;
}

export function inheritedNamePrestige(stratum: SocialStratum): number {
  const band = INHERITED_NAME_BAND[stratum] ?? INHERITED_NAME_BAND.commoner;
  return rand(band[0], band[1]);
}

export function breakdownInitialPrestige(
  character: Character,
  roleClass: CharacterRoleClass,
  stratum: SocialStratum,
  inherited = inheritedNamePrestige(stratum)
): InitialPrestigeBreakdown {
  const office = publicOfficeContribution(character, roleClass);
  const careerYears = humanCareerYears(character);
  const skillValue = office.skillKey ? character.skills[office.skillKey] : undefined;
  const record = publicRecordPrestige(careerYears, office.visibility, skillValue);
  const total = clampPrestige(inherited + office.bump + record);
  return {
    inherited,
    officeBump: office.bump,
    record,
    visibility: office.visibility,
    careerYears,
    total
  };
}

export function rollInitialPrestige(
  character: Character,
  roleClass: CharacterRoleClass,
  stratum: SocialStratum
): number {
  const parts = breakdownInitialPrestige(character, roleClass, stratum);
  const noise = gauss(0, 3, -6, 6, 0);
  return clampPrestige(parts.inherited + parts.officeBump + parts.record + noise);
}

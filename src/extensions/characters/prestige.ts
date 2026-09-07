/**
 * Initial public prestige and observer-relative standing.
 * Spec: docs/plan/characters/prestige.md
 */
import { gauss, rand } from "../hostUtils";
import { getWorldContext, hasCharactersContext } from "./charactersContext";
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

export type PrestigeAudience = "public" | "court" | "military" | "international";

export type OfficeKind =
  | "ruler"
  | "marshal"
  | "field_commander"
  | "commander"
  | "chancellor"
  | "steward"
  | "chaplain"
  | "province_lord"
  | "merchant"
  | "spymaster"
  | "central_officer"
  | "ordinary";

export type ReputationLabel = "home" | "hero" | "infamous" | "unknown" | "noted";

/** How widely the office is known in each audience. Spymaster deeds stay off the public/international axes. */
export const SPHERE_VISIBILITY: Record<OfficeKind, Record<PrestigeAudience, number>> = {
  ruler: { public: 1, court: 1, military: 0.5, international: 1 },
  marshal: { public: 0.9, court: 0.8, military: 1, international: 0.85 },
  field_commander: { public: 0.8, court: 0.2, military: 0.9, international: 0.4 },
  commander: { public: 0.85, court: 0.4, military: 0.85, international: 0.5 },
  chancellor: { public: 0.7, court: 0.9, military: 0.1, international: 0.55 },
  steward: { public: 0.5, court: 0.7, military: 0.1, international: 0.15 },
  chaplain: { public: 0.6, court: 0.5, military: 0.1, international: 0.2 },
  province_lord: { public: 0.7, court: 0.55, military: 0.55, international: 0.35 },
  merchant: { public: 0.45, court: 0.15, military: 0.05, international: 0.25 },
  spymaster: { public: 0, court: 0.35, military: 0, international: 0 },
  central_officer: { public: 0.35, court: 0.6, military: 0.1, international: 0.2 },
  ordinary: { public: 0.15, court: 0.05, military: 0.05, international: 0.05 }
};

const PUBLIC_OFFICE_BUMP: Record<OfficeKind, readonly [number, number]> = {
  ruler: [28, 38],
  marshal: [10, 16],
  field_commander: [5, 12],
  commander: [8, 14],
  chancellor: [8, 14],
  steward: [6, 11],
  chaplain: [7, 13],
  province_lord: [12, 20],
  merchant: [0, 0],
  spymaster: [0, 0],
  central_officer: [3, 8],
  ordinary: [0, 0]
};

const PUBLIC_SKILL: Record<OfficeKind, keyof CharacterSkills | undefined> = {
  ruler: "diplomacy",
  marshal: "martial",
  field_commander: "martial",
  commander: "martial",
  chancellor: "diplomacy",
  steward: "stewardship",
  chaplain: "learning",
  province_lord: "stewardship",
  merchant: "stewardship",
  spymaster: undefined,
  central_officer: "stewardship",
  ordinary: undefined
};

/** Army-facing office bump. Family name matters less in camp than at court. */
const MILITARY_OFFICE_BUMP: Record<OfficeKind, number> = {
  ruler: 8,
  marshal: 18,
  field_commander: 14,
  commander: 12,
  chancellor: 2,
  steward: 2,
  chaplain: 2,
  province_lord: 10,
  merchant: 1,
  spymaster: 0,
  central_officer: 2,
  ordinary: 1
};

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

function bandMid(band: readonly [number, number]): number {
  return (band[0] + band[1]) / 2;
}

function clampKnownness(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampSignedHonor(value: number): number {
  return Math.max(-100, Math.min(100, Math.round(value)));
}

function takeKind(current: { kind: OfficeKind | undefined; vis: number }, kind: OfficeKind): void {
  const vis = SPHERE_VISIBILITY[kind].public;
  if (vis > current.vis) {
    current.vis = vis;
    current.kind = kind;
  }
}

/**
 * Dominant public office. Crown outranks a spy portfolio; a Marshal outranks a
 * hidden intelligence title. Spy-only offices stay `spymaster`.
 */
export function resolveOfficeKind(character: Character, roleClass?: CharacterRoleClass): OfficeKind {
  if (roleClass === "ruler" || hasLandedStateTitle(character)) return "ruler";
  if (roleClass === "province_lord" || hasProvinceLordTitle(character)) return "province_lord";
  if (roleClass === "merchant") return "merchant";
  if (roleClass === "religious") return "chaplain";

  const current: { kind: OfficeKind | undefined; vis: number } = { kind: undefined, vis: 0 };
  for (const holding of character.titles) {
    const title = holding.title;
    if (isSpyTitle(title)) continue;
    if (COURT_MARTIAL_TITLE_RE.test(title)) takeKind(current, "marshal");
    else if (FIELD_COMMAND_TITLE_RE.test(title)) takeKind(current, "field_commander");
    else if (MARTIAL_COMMAND_TITLE_RE.test(title)) takeKind(current, "commander");
    else if (DIPLOMATIC_TITLE_RE.test(title)) takeKind(current, "chancellor");
    else if (STEWARD_TITLE_RE.test(title) || FINANCE_TITLE_RE.test(title)) takeKind(current, "steward");
    else if (FAITH_TITLE_RE.test(title)) takeKind(current, "chaplain");
  }
  if (current.kind) return current.kind;
  if (roleClass === "commander") return "commander";
  const spyOnly = character.titles.some(t => isSpyTitle(t.title));
  if (spyOnly) return "spymaster";
  if (roleClass === "central_officer" || character.titles.some(t => t.entityType === "state" && !t.landed)) {
    return "central_officer";
  }
  return "ordinary";
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
  const kind = resolveOfficeKind(character, roleClass);
  const bump = PUBLIC_OFFICE_BUMP[kind];
  return {
    visibility: SPHERE_VISIBILITY[kind].public,
    bump: rand(bump[0], bump[1]),
    skillKey: PUBLIC_SKILL[kind]
  };
}

export function officeSphereVisibility(
  character: Character,
  audience: PrestigeAudience,
  roleClass?: CharacterRoleClass
): number {
  return SPHERE_VISIBILITY[resolveOfficeKind(character, roleClass)][audience];
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

function originStratum(character: Character): SocialStratum {
  return character.backstory?.origin.socialStratum ?? "commoner";
}

function inheritedMid(stratum: SocialStratum): number {
  return bandMid(INHERITED_NAME_BAND[stratum] ?? INHERITED_NAME_BAND.commoner);
}

function internationalNameLeak(stratum: SocialStratum): number {
  if (stratum === "royal" || stratum === "high_noble") return 0.85;
  if (stratum === "minor_noble" || stratum === "gentry") return 0.5;
  return 0.25;
}

export function diplomacyValence(relation: string | undefined): number {
  if (!relation) return 0.2;
  if (relation === "Ally" || relation === "Friendly" || relation === "Vassal" || relation === "Suzerain") return 1;
  if (relation === "Enemy" || relation === "Rival") return -1;
  if (relation === "Suspicion") return -0.4;
  return 0.2;
}

export function lookupDiplomacyRelation(observerStateId: number, subjectStateId: number): string | undefined {
  if (!hasCharactersContext()) return undefined;
  try {
    const relation = getWorldContext().pack.states?.[observerStateId]?.diplomacy?.[subjectStateId];
    return typeof relation === "string" ? relation : undefined;
  } catch {
    return undefined;
  }
}

function sphereRecord(
  character: Character,
  kind: OfficeKind,
  audience: PrestigeAudience,
  skillKey: keyof CharacterSkills | undefined
): number {
  const vis = SPHERE_VISIBILITY[kind][audience];
  const skill = skillKey ? character.skills[skillKey] : undefined;
  return publicRecordPrestige(humanCareerYears(character), vis, skill);
}

/**
 * Professional esteem inside the army. Not public prestige and not pairwise solidarity.
 * A mud marshal can outrank a parade marshal here.
 */
export function militaryStanding(character: Character, roleClass?: CharacterRoleClass): number {
  const kind = resolveOfficeKind(character, roleClass);
  if (kind === "spymaster") return clampKnownness(inheritedMid(originStratum(character)) * 0.35);
  const inherited = inheritedMid(originStratum(character)) * 0.35;
  const office = MILITARY_OFFICE_BUMP[kind];
  const record = sphereRecord(character, kind, "military", "martial");
  return clampPrestige(inherited + office + record);
}

/** Unsigned 0–100: how widely foreign courts have heard of this person. Spy offices are 0. */
export function internationalKnownness(character: Character, roleClass?: CharacterRoleClass): number {
  const kind = resolveOfficeKind(character, roleClass);
  if (kind === "spymaster") return 0;
  const stratum = originStratum(character);
  const inherited = inheritedMid(stratum) * internationalNameLeak(stratum);
  const publicVis = SPHERE_VISIBILITY[kind].public;
  const intlVis = SPHERE_VISIBILITY[kind].international;
  const office = publicVis > 0 ? bandMid(PUBLIC_OFFICE_BUMP[kind]) * (intlVis / publicVis) : 0;
  const record = sphereRecord(character, kind, "international", PUBLIC_SKILL[kind]);
  return clampKnownness(inherited + office + record);
}

/** Court *knownness* only. Court *evaluation* is pairwise solidarity, not a prestige field. */
export function courtKnownness(character: Character, roleClass?: CharacterRoleClass): number {
  const kind = resolveOfficeKind(character, roleClass);
  const vis = SPHERE_VISIBILITY[kind].court;
  const inherited = inheritedMid(originStratum(character)) * 0.5;
  // Spy public bump is 0; courtiers still know the office exists.
  const office = (kind === "spymaster" ? 12 : bandMid(PUBLIC_OFFICE_BUMP[kind])) * vis;
  return clampKnownness(inherited + office);
}

export interface ObserverReputation {
  /** 0–100 name recognition in the observer's courts. */
  knownness: number;
  /** -1 enemy … +1 ally. Neutral is a small positive. */
  valence: number;
  /** -100..100 hero vs infamy. Home uses public prestige as positive honor. */
  honor: number;
  /** 0–100 fear. Meaningful when valence is negative. */
  dread: number;
  label: ReputationLabel;
}

function martialThreat(character: Character, kind: OfficeKind): number {
  const martial = Math.max(0, Math.min(1, character.skills.martial / 100));
  const vis = SPHERE_VISIBILITY[kind].military;
  return Math.max(0, Math.min(1, martial * 0.6 + vis * 0.4));
}

function reputationLabel(knownness: number, honor: number, home: boolean): ReputationLabel {
  if (home) return "home";
  if (knownness < 12) return "unknown";
  if (honor >= 25) return "hero";
  if (honor <= -25) return "infamous";
  return "noted";
}

export function reputationAmong(
  character: Character,
  observerStateId: number,
  options: { relation?: string; roleClass?: CharacterRoleClass } = {}
): ObserverReputation {
  const kind = resolveOfficeKind(character, options.roleClass);
  if (observerStateId === character.state) {
    const prestige = character.prestige ?? 0;
    return {
      knownness: prestige,
      valence: 1,
      honor: prestige,
      dread: 0,
      label: "home"
    };
  }

  const relation = options.relation ?? lookupDiplomacyRelation(observerStateId, character.state);
  const valence = diplomacyValence(relation);
  const knownness = internationalKnownness(character, options.roleClass);
  const honor = clampSignedHonor(knownness * valence);
  const dread = valence < 0 ? clampKnownness(knownness * martialThreat(character, kind)) : 0;
  return {
    knownness,
    valence,
    honor,
    dread,
    label: reputationLabel(knownness, honor, false)
  };
}

/**
 * House-match trophy as seen by `observerStateId`.
 * Allies and neutrals treat fame as a prize; enemies treat the same legend as infamy.
 */
export function marriageTrophyValue(
  character: Character,
  observerStateId: number,
  options: { relation?: string; fallback?: number; roleClass?: CharacterRoleClass } = {}
): number {
  if (observerStateId === character.state) return character.prestige ?? options.fallback ?? 40;
  const rep = reputationAmong(character, observerStateId, options);
  if (rep.valence < 0) return rep.honor;
  return rep.knownness;
}

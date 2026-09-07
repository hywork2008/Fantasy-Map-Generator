/**
 * Reconstruct personal war service for seasoned military characters from Relations-history
 * campaigns. Campaign.end is not a victory. Conduct is how they fought, not the state's score.
 * Spec: docs/plan/characters/military-war-record.md
 */

import type { Campaign, State } from "../../types/models";
import { isMilitaryCareerCharacter } from "./advanceAge";
import type {
  Character,
  CharacterMilitaryRecord,
  CharacterWarService,
  MilitaryEpithetId,
  WarConductKind
} from "./characterTypes";
import { humanCareerYears } from "./prestige";
import { careerStartAge } from "./raceAge";
import { emptySpecializations } from "./specializations";

/** Human-equivalent career years before we backfill a war ledger (about age 45). */
export const SEASONED_CAREER_YEARS = 25;

const MARTIAL_COURT_TITLE_RE = /^(Marshal|General|Warlord|Minister of War)$/i;
const FIELD_TITLE_RE = /^(Commander|Admiral)$/i;

export const PRESTIGE_DELTA_FOR_CONDUCT: Record<WarConductKind, number> = {
  rear_idle: -2,
  front_assault: 5,
  rearguard_rescue: 8,
  defensive_hold: 6,
  costly_push: 2,
  cautious_avoid: 0
};

const CONDUCT_DOMAIN: Record<WarConductKind, string> = {
  rear_idle: "martial.command",
  front_assault: "martial.tactics",
  rearguard_rescue: "martial.leadership",
  defensive_hold: "martial.leadership",
  costly_push: "martial.tactics",
  cautious_avoid: "martial.strategy"
};

export function prestigeDeltaForConduct(conduct: WarConductKind): number {
  return PRESTIGE_DELTA_FOR_CONDUCT[conduct];
}

export function isWarRecordEligible(character: Pick<Character, "titles" | "roles">): boolean {
  if (isMilitaryCareerCharacter(character)) return true;
  return character.titles.some(t => t.landed && t.entityType === "province");
}

function officeTenureStartYear(character: Character, currentYear: number): number {
  const starts = character.titles
    .map(t => t.startYear)
    .filter((year): year is number => typeof year === "number" && Number.isFinite(year));
  if (starts.length) return Math.min(...starts);
  const careerYears = Math.max(0, character.age - careerStartAge(character.race));
  return currentYear - careerYears;
}

function campaignOverlapsTenure(campaign: Campaign, tenureStart: number, currentYear: number): boolean {
  const warStart = campaign.start;
  const warEnd = campaign.end ?? currentYear;
  return warEnd >= tenureStart && warStart <= currentYear;
}

export function warsInvolvingState(state: Pick<State, "i" | "campaigns">): Campaign[] {
  const seen = new Set<string>();
  const out: Campaign[] = [];
  for (const campaign of state.campaigns ?? []) {
    if (campaign.attacker !== state.i && campaign.defender !== state.i) continue;
    const key = `${campaign.attacker}:${campaign.defender}:${campaign.start}:${campaign.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(campaign);
  }
  return out;
}

function serviceChance(character: Character): number {
  if (character.titles.some(t => MARTIAL_COURT_TITLE_RE.test(t.title))) return 0.88;
  if (character.titles.some(t => FIELD_TITLE_RE.test(t.title))) return 0.55;
  if (character.titles.some(t => t.landed && t.entityType === "province")) return 0.4;
  if (isMilitaryCareerCharacter(character)) return 0.5;
  return 0;
}

function unitFromSeed(seed: number): number {
  const x = Math.sin(seed + 0.1) * 10000;
  return x - Math.floor(x);
}

export function chooseWarConduct(character: Character, isDefender: boolean, roll01: number): WarConductKind {
  const p = character.personality;
  const martial = character.skills.martial;
  const prowess = character.skills.prowess;
  const weights: Array<{ kind: WarConductKind; w: number }> = [
    { kind: "rear_idle", w: 8 },
    { kind: "front_assault", w: 10 },
    { kind: "rearguard_rescue", w: 4 },
    { kind: "defensive_hold", w: 6 },
    { kind: "costly_push", w: 3 },
    { kind: "cautious_avoid", w: 4 }
  ];
  const add = (kind: WarConductKind, delta: number) => {
    const row = weights.find(entry => entry.kind === kind);
    if (row) row.w = Math.max(0, row.w + delta);
  };

  if (p.boldness >= 65) {
    add("front_assault", 18);
    add("rear_idle", -4);
  }
  if (p.boldness <= 35) {
    add("rear_idle", 16);
    add("cautious_avoid", 8);
    add("front_assault", -6);
  }
  if (p.energy <= 35) {
    add("rear_idle", 14);
    add("cautious_avoid", 6);
  }
  if (p.energy >= 70) {
    add("front_assault", 8);
    add("defensive_hold", 4);
  }
  if (p.honor >= 65 || p.compassion >= 65) {
    add("rearguard_rescue", 14);
    add("defensive_hold", 10);
    add("rear_idle", -6);
  }
  if (p.honor <= 35 && p.guile >= 60) {
    add("rear_idle", 10);
    add("cautious_avoid", 6);
  }
  if (p.compassion <= 30 && (p.vengefulness >= 65 || p.greed >= 65)) {
    add("costly_push", 12);
    add("rearguard_rescue", -4);
  }
  if (martial >= 70 || prowess >= 70) {
    add("front_assault", 10);
    add("defensive_hold", 6);
    add("rearguard_rescue", 4);
  }
  if (isDefender) {
    add("defensive_hold", 12);
    add("rearguard_rescue", 10);
    add("front_assault", -4);
  } else {
    add("front_assault", 8);
    add("rearguard_rescue", -2);
    add("defensive_hold", -4);
  }

  const total = weights.reduce((sum, row) => sum + row.w, 0);
  let cursor = Math.max(0, Math.min(0.9999, roll01)) * total;
  for (const row of weights) {
    cursor -= row.w;
    if (cursor <= 0) return row.kind;
  }
  return weights[weights.length - 1]!.kind;
}

export function epithetFromServices(services: readonly CharacterWarService[]): MilitaryEpithetId | undefined {
  const served = services.filter(s => s.conduct !== "cautious_avoid");
  const rescue = served.filter(s => s.conduct === "rearguard_rescue").length;
  const hold = served.filter(s => s.conduct === "defensive_hold").length;
  const front = served.filter(s => s.conduct === "front_assault").length;
  const idle = served.filter(s => s.conduct === "rear_idle").length;
  if (rescue >= 2 || (rescue >= 1 && hold >= 1)) return "guardian";
  if (rescue === 1) return "last_guard";
  if (hold >= 2 && rescue === 0) return "wall";
  if (front >= 2 && idle === 0) return "vanguard";
  if (idle >= 2 && front === 0 && rescue === 0 && served.length >= 2) return "idle_banner";
  return undefined;
}

export function reconstructMilitaryWarRecord(
  character: Character,
  wars: readonly Campaign[],
  currentYear: number
): CharacterMilitaryRecord | undefined {
  if (character.dead || !isWarRecordEligible(character)) return undefined;
  if (humanCareerYears(character) < SEASONED_CAREER_YEARS) return undefined;

  const tenureStart = officeTenureStartYear(character, currentYear);
  const chance = serviceChance(character);
  const services: CharacterWarService[] = [];

  wars.forEach((campaign, index) => {
    if (campaign.attacker !== character.state && campaign.defender !== character.state) return;
    if (!campaignOverlapsTenure(campaign, tenureStart, currentYear)) return;
    const serveRoll = unitFromSeed(character.i * 10007 + Math.round(campaign.start) * 17 + index);
    if (serveRoll > chance) return;
    const isDefender = campaign.defender === character.state;
    const conduct = chooseWarConduct(
      character,
      isDefender,
      unitFromSeed(character.i * 4243 + Math.round(campaign.start) * 31 + index + 3)
    );
    if (conduct === "cautious_avoid") return;
    services.push({
      campaignName: campaign.name,
      year: Math.round(campaign.start),
      opponentStateId: isDefender ? campaign.attacker : campaign.defender,
      side: isDefender ? "defender" : "attacker",
      conduct
    });
  });

  if (!services.length) return undefined;
  return {
    wars: services.length,
    services,
    epithetId: epithetFromServices(services)
  };
}

function appendBattleExperience(character: Character, services: readonly CharacterWarService[]): void {
  if (!character.specializations) character.specializations = emptySpecializations();
  const profile = character.specializations;
  profile.experienceYears.battle = (profile.experienceYears.battle ?? 0) + services.length;
  for (const service of services) {
    profile.experience.push({
      id: `war-${character.i}-${service.year}-${service.opponentStateId}`,
      domainId: CONDUCT_DOMAIN[service.conduct],
      year: service.year,
      coverage: 0.15,
      mode: "battle",
      role: service.side,
      outcome: service.conduct,
      source: "simulation",
      targets: [{ kind: "region", id: String(service.opponentStateId) }]
    });
  }
}

export function applyMilitaryWarRecord(
  character: Character,
  wars: readonly Campaign[],
  currentYear: number
): CharacterMilitaryRecord | undefined {
  if (character.militaryRecord) return character.militaryRecord;
  const record = reconstructMilitaryWarRecord(character, wars, currentYear);
  if (!record) return undefined;
  character.militaryRecord = record;
  const delta = record.services.reduce((sum, service) => sum + prestigeDeltaForConduct(service.conduct), 0);
  character.prestige = Math.max(1, Math.min(100, (character.prestige ?? 1) + delta));
  appendBattleExperience(character, record.services);
  return record;
}

export function seedMilitaryWarRecords(
  characters: readonly Character[],
  states: readonly State[],
  currentYear: number
): void {
  const warsByState = new Map<number, Campaign[]>();
  for (const state of states) {
    if (!state.i || state.removed) continue;
    warsByState.set(state.i, warsInvolvingState(state));
  }
  for (const character of characters) {
    if (character.dead) continue;
    const wars = warsByState.get(character.state) ?? [];
    if (!wars.length) continue;
    applyMilitaryWarRecord(character, wars, currentYear);
  }
}

export function seedMilitaryWarRecordForPeer(
  character: Character,
  states: readonly State[],
  currentYear: number
): void {
  const state = states.find(s => s.i === character.state);
  if (!state) return;
  applyMilitaryWarRecord(character, warsInvolvingState(state), currentYear);
}

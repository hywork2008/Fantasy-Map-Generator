/**
 * Arcane working tables (potency, recovery, hunt contribution).
 * Host-safe: wilderness hunts and the Characters extension share this file.
 * Spec: docs/plan/characters/arcane.md
 */
export const ARCANE_WAR_WORKING_MIN = 20;
export const ARCANE_HIGH_WAR_MIN = 70;
/** 9th-level Meteor Swarm analog. */
export const ARCANE_METEOR_MIN = 90;
/** Beyond 9th — cell-scale calamity. Not a daily skirmish. */
export const ARCANE_CALAMITY_MIN = 95;
/** Daily skirmish may spend up to this score (70–89 high war, not meteor). */
export const ARCANE_DAILY_MAX = 89;
/** Same-cell daily fights cap headcount so Fast-Forward does not delete a map. */
export const ARCANE_BATTLE_CASUALTY_CAP = 120;

export type ArcaneBandId = "none" | "folk" | "adept" | "war" | "highWar" | "meteor" | "calamity";

export type ArcaneWorkingKind = "daily" | "campaign" | "hunt";

/** Structural caster fields so host hunt code need not import the Characters extension. */
export interface ArcaneCasterRecord {
  dead?: boolean;
  state?: number;
  race?: number;
  arcane?: number;
  /** Fractional calendar year when the next working may be spent. Integer values from older saves still work. */
  arcaneReadyYear?: number;
  /** Calamity (95+) workings spent this lifetime. Lower bands have no lifetime cap. */
  arcaneWorkingsSpent?: number;
  /** Calendar year of the last 90+ working. One 90+ working per state per year. */
  arcaneLastHighYear?: number;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Fractional calendar year from Y-M-D (leaps ignored). */
export function calendarTime(year: number, month = 1, day = 1): number {
  const m = Math.max(1, Math.min(12, Math.floor(month)));
  let doy = Math.max(1, Math.min(MONTH_DAYS[m - 1] ?? 31, Math.floor(day))) - 1;
  for (let i = 1; i < m; i++) doy += MONTH_DAYS[i - 1] ?? 31;
  return year + doy / 365;
}

export function arcaneBand(score: number | undefined): ArcaneBandId {
  const value = score ?? 0;
  if (value <= 0) return "none";
  if (value < ARCANE_WAR_WORKING_MIN) return "folk";
  if (value < 50) return "adept";
  if (value < ARCANE_HIGH_WAR_MIN) return "war";
  if (value < ARCANE_METEOR_MIN) return "highWar";
  if (value < ARCANE_CALAMITY_MIN) return "meteor";
  return "calamity";
}

/** Typical effect radius in metres. Meteor Swarm analog is ~1 mile. */
export function arcaneRangeMeters(score: number | undefined): number {
  const value = score ?? 0;
  if (value <= 0) return 0;
  if (value < ARCANE_WAR_WORKING_MIN) return 30;
  if (value < 40) return 80;
  if (value < ARCANE_HIGH_WAR_MIN) return 300;
  if (value < ARCANE_METEOR_MIN) return 800;
  if (value < ARCANE_CALAMITY_MIN) return 1600;
  return 4000;
}

/**
 * Recovery as fractional years.
 * 20–49: ~1 week; 50–69: ~3 weeks; 70–89: ~2 months; 90–94: 1 year; 95–100: 3–8 years.
 */
export function warWorkingRecoveryYears(score: number): number {
  if (score >= ARCANE_CALAMITY_MIN) return 3 + (score - ARCANE_CALAMITY_MIN);
  if (score >= ARCANE_METEOR_MIN) return 1;
  if (score >= ARCANE_HIGH_WAR_MIN) return 60 / 365;
  if (score >= 50) return 21 / 365;
  if (score >= ARCANE_WAR_WORKING_MIN) return 7 / 365;
  return 1 / 365;
}

/**
 * Battlefield kill count. 90–94 interpolates Meteor Swarm (400 dense-low … 1200 packed).
 * 95+ is a cell disaster, not a daily tick.
 */
export function warWorkingCasualties(score: number): number {
  if (score < ARCANE_WAR_WORKING_MIN) return 0;
  if (score >= ARCANE_CALAMITY_MIN) return 3000;
  if (score >= ARCANE_METEOR_MIN) return 400 + (score - ARCANE_METEOR_MIN) * 200;
  if (score >= 80) return 400;
  if (score >= ARCANE_HIGH_WAR_MIN) return 100;
  if (score >= 50) return 50;
  if (score >= 40) return 20;
  return 10;
}

/** Lifetime cap for 95+ only. Human-scale 3, elf-scale 8. */
export function lifetimeCalamityBudget(lifespan: number | undefined): number {
  const years = Math.max(30, lifespan ?? 75);
  return Math.max(3, Math.min(8, Math.round(3 + (5 * (years - 75)) / 675)));
}

/** @deprecated Use lifetimeCalamityBudget — only 95+ workings are lifetime-capped. */
export function lifetimeWarWorkingBudget(lifespan: number | undefined): number {
  return lifetimeCalamityBudget(lifespan);
}

export function remainingCalamityWorkings(spent: number | undefined, lifespan?: number): number {
  return Math.max(0, lifetimeCalamityBudget(lifespan) - (spent ?? 0));
}

export function isArcaneWorkingReady(caster: ArcaneCasterRecord, now: number, lifespan?: number): boolean {
  if (caster.dead) return false;
  const score = caster.arcane ?? 0;
  if (score < ARCANE_WAR_WORKING_MIN) return false;
  if ((caster.arcaneReadyYear ?? 0) > now) return false;
  if (score >= ARCANE_CALAMITY_MIN && remainingCalamityWorkings(caster.arcaneWorkingsSpent, lifespan) <= 0) {
    return false;
  }
  return true;
}

export function stateSpentHighArcaneThisYear(
  casters: readonly ArcaneCasterRecord[],
  stateId: number,
  now: number
): boolean {
  const year = Math.floor(now);
  return casters.some(caster => caster.state === stateId && caster.arcaneLastHighYear === year);
}

export function spendArcaneWorking(caster: ArcaneCasterRecord, score: number, now: number): void {
  caster.arcaneReadyYear = now + warWorkingRecoveryYears(score);
  if (score >= ARCANE_CALAMITY_MIN) {
    caster.arcaneWorkingsSpent = (caster.arcaneWorkingsSpent ?? 0) + 1;
  }
  if (score >= ARCANE_METEOR_MIN) {
    caster.arcaneLastHighYear = Math.floor(now);
  }
}

/** Army-hunt years a working is worth. Meteor = 1; calamity = 3–8. */
export function arcaneHuntYearMultiplier(score: number): number {
  if (score >= ARCANE_CALAMITY_MIN) return 3 + (score - ARCANE_CALAMITY_MIN);
  if (score >= ARCANE_METEOR_MIN) return 1;
  return 0;
}

/**
 * Extra monster.power removed on a funded hunt.
 * Calamity cannot execute the last point — the army must finish.
 */
export function arcaneHuntPowerReduced(score: number, armyYearChunk: number, currentPower: number): number {
  const years = arcaneHuntYearMultiplier(score);
  if (years <= 0 || currentPower <= 0 || armyYearChunk <= 0) return 0;
  const extra = armyYearChunk * years;
  if (score >= ARCANE_CALAMITY_MIN) return Math.min(extra, Math.max(0, currentPower - 1));
  return Math.min(extra, currentPower);
}

export function workingAllowedOnPath(score: number, kind: ArcaneWorkingKind): boolean {
  if (score < ARCANE_WAR_WORKING_MIN) return false;
  if (kind === "daily") return score <= ARCANE_DAILY_MAX;
  if (kind === "campaign") return score < ARCANE_CALAMITY_MIN;
  return score >= ARCANE_METEOR_MIN;
}

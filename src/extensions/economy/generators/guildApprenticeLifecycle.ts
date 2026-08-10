import { getSolidarity } from "../../characters/backstoryProfile";
import type { Character } from "../../characters/characterTypes";
import type { AptitudeTier, CharacterDomainSkill } from "./individualSkillTypes";

export const APPRENTICE_GENIUS_ENGINEERING = 90;

export interface ApprenticeDepartureAssessment {
  /** Annual probability after relationship, personality, and mobility modifiers. */
  annualChance: number;
  /** Pre-mobility dissatisfaction, normalized to 0..1. */
  pressure: number;
  reasons: readonly string[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function above(value: number, threshold: number): number {
  return clamp01((value - threshold) / (100 - threshold));
}

function below(value: number, threshold: number): number {
  return clamp01((threshold - value) / threshold);
}

/**
 * Apprentices start with almost no public standing. Only an engineering prodigy earns visible
 * prestige before practical training has demonstrated the promise.
 */
export function getInitialApprenticePrestige(engineering: number): number {
  const normalized = Math.max(1, Math.min(100, engineering));
  if (normalized < APPRENTICE_GENIUS_ENGINEERING) return Math.max(1, Math.round(1 + (normalized / 90) * 4));
  return Math.min(50, Math.round(10 + (normalized - APPRENTICE_GENIUS_ENGINEERING) * 4));
}

/**
 * A master’s v1 recruitment reputation is derived rather than stored: demonstrated proficiency
 * matters most, aptitude signals future quality, and public prestige is only a small supplement.
 */
export function getGuildMasterStanding(master: Character, mastery: CharacterDomainSkill | undefined): number {
  const aptitude: Readonly<Record<AptitudeTier, number>> = {
    poor: 0.1,
    ordinary: 0.35,
    promising: 0.58,
    gifted: 0.8,
    exceptional: 1
  };
  const proficiency = mastery ? clamp01(mastery.proficiency / 100) : clamp01(master.skills.engineering / 100);
  const aptitudeScore = mastery ? aptitude[mastery.aptitude] : 0.35;
  return clamp01(proficiency * 0.65 + aptitudeScore * 0.25 + clamp01(master.prestige / 100) * 0.1);
}

/** Probability that a vacant apprenticeship attracts one candidate in this annual settlement. */
export function getApprenticeRecruitmentChance(population: number | undefined, masterStanding: number): number {
  const populationSignal = Math.log1p(Math.max(0, population ?? 0)) / Math.log(101);
  return clamp01(0.08 + populationSignal * 0.45 + clamp01(masterStanding) * 0.4);
}

/**
 * Calculate voluntary apprenticeship departure without mutating either character. Low wealth does
 * not make a bad relationship disappear; it suppresses the ability to leave for an unknown job.
 */
export function assessApprenticeDeparture(master: Character, apprentice: Character): ApprenticeDepartureAssessment {
  if (master.dead || apprentice.dead || master.i === apprentice.i) {
    return { annualChance: 0, pressure: 0, reasons: [] };
  }

  const p = apprentice.personality;
  const reasons: string[] = [];
  let pressure = 0;

  const overconfidence = above(p.confidence - apprentice.skills.engineering, 15);
  if (overconfidence > 0) {
    pressure += overconfidence * 0.34;
    reasons.push("overconfident-low-engineering");
  }

  const mutualSolidarity = Math.min(getSolidarity(master, apprentice.i), getSolidarity(apprentice, master.i));
  const relationshipStrain = clamp01((-mutualSolidarity - 15) / 65);
  if (relationshipStrain > 0) {
    pressure += relationshipStrain * 0.32;
    reasons.push("strained-mentorship");
  }

  const optionalPressure =
    below(p.rationality, 40) * 0.04 +
    above(p.boldness, 60) * 0.04 +
    above(p.energy, 60) * 0.03 +
    above(p.greed, 60) * 0.04 +
    above(p.zeal, 65) * 0.02 +
    above(p.vengefulness, 60) * 0.05 +
    below(p.honor, 40) * 0.04;
  if (optionalPressure > 0) reasons.push("restless-personality");

  pressure = clamp01(pressure + optionalPressure);
  if (pressure < 0.12) return { annualChance: 0, pressure, reasons: [] };

  const financialMobility = clamp01((apprentice.wealth ?? 0) / 2);
  const annualChance = clamp01(pressure * (0.2 + financialMobility * 0.8));
  return { annualChance, pressure, reasons };
}

/**
 * Character health & disease — Phase 1.
 * Design: docs/plan/characters/character-health-and-disease.md
 *
 * Ties personal health to local public sanitation (`Burg.sanitation`, seeded by the host
 * at 50 even without Economy; Economy's UrbanWaterSystem makes it move per-burg when
 * enabled). Runs once per tick, before advanceCharacterAging() so a fresh affliction/health
 * state feeds that same tick's mortality roll via diseaseDeathRiskFor().
 *
 * Deliberately holds no title-table knowledge (same split as advanceAge.ts) — this module
 * only mutates `health`/`affliction`/`timesIllness`; death itself (title cleanup, deathYear,
 * reason) stays centralized in advanceCharacterAging().
 */
import { minmax, normalize, P } from "../hostUtils";
import { resolveCharacterRaceId } from "./appearance";
import { getCharacters, getCurrentYear, getWorldContext, hasCharactersContext } from "./charactersContext";
import type { AfflictionKind, AfflictionSeverity, Character } from "./characterTypes";
import { resolveRaceAgeProfile, scaleHumanAgeToRace } from "./raceAge";

/** Full health value new characters are seeded with (see personFactory.ts). */
export const HEALTH_FULL = 100;
/** Neutral sanitation score used when no burg/state value is resolvable (matches the host's own seed default). */
export const SANITATION_DEFAULT = 50;
/** Neutral medical-care civic score (matches the host Burg.medicalCare seed). */
export const MEDICAL_CARE_DEFAULT = 50;
/** Local sanitation at/above this carries no elevated disease risk. */
export const SANITATION_SAFE_THRESHOLD = 60;
/** Max permanent drag on the unafflicted health target from chronic exposure to squalor. */
export const CHRONIC_HEALTH_DRAG_MAX = 20;
/** Annual base infection probability scale at maximum sanitation pressure and average vulnerability. */
export const BASE_ANNUAL_INFECTION_RATE = 0.12;
/** Risk multiplier for children (below race maturity) and elders (race-scaled 50 human years+). */
export const VULNERABLE_AGE_MULTIPLIER = 1.6;
/**
 * Long-lived races (elves, dwarves, …) resist human-scale disease. Aligns with
 * advanceAge.LONG_LIVED_LIFESPAN_MIN — duplicated here (not imported) to avoid a
 * characterHealth.ts <-> advanceAge.ts import cycle; same pattern as data/personNameSpheres.ts's
 * MYTHIC_NAME_LIFESPAN_MIN.
 */
export const LONG_LIVED_LIFESPAN_MIN = 150;
export const LONG_LIVED_RESISTANCE_MULTIPLIER = 0.4;
/** looks.vitality below this raises disease risk (frail constitution). */
export const LOW_VITALITY_THRESHOLD = 40;
export const LOW_VITALITY_MULTIPLIER = 1.25;
/** Wealth at which care/nutrition mitigation saturates toward WEALTH_CARE_MITIGATION_CAP. */
export const WEALTH_CARE_REFERENCE = 500;
/** Max fraction of risk that wealth (better food, private physicians) can mitigate. */
export const WEALTH_CARE_MITIGATION_CAP = 0.35;
/** Human-scale elder age — matches advanceAge.ts's own mortality-curve inflection at newAge > 50. */
export const ELDER_HUMAN_AGE = 50;
/** health below this contributes a small baseline mortality risk even without a formal affliction. */
export const CHRONIC_LOW_HEALTH_THRESHOLD = 20;
export const CHRONIC_LOW_HEALTH_DEATH_RISK = 0.01;
/** How fast unafflicted health drifts toward its sanitation-capped target, per year. */
export const HEALTH_RECOVERY_RATE_PER_YEAR = 15;

const SEVERITY_ORDER: readonly AfflictionSeverity[] = ["mild", "moderate", "severe", "critical"];

const SEVERITY_HEALTH_DRAIN_PER_YEAR: Readonly<Record<AfflictionSeverity, number>> = {
  mild: 8,
  moderate: 20,
  severe: 40,
  critical: 65
};
/** Annual chance the affliction clears entirely, before the vulnerability-multiplier adjustment. */
const SEVERITY_RECOVERY_CHANCE_PER_YEAR: Readonly<Record<AfflictionSeverity, number>> = {
  mild: 0.55,
  moderate: 0.35,
  severe: 0.18,
  critical: 0.08
};
/** Annual chance an untreated affliction worsens one band (none from critical — already worst). */
const SEVERITY_ESCALATION_CHANCE_PER_YEAR: Readonly<Record<AfflictionSeverity, number>> = {
  mild: 0.22,
  moderate: 0.18,
  severe: 0.12,
  critical: 0
};
/** Base annual death risk contributed by an affliction at each severity, before per-disease/vulnerability scaling. */
const SEVERITY_DEATH_RISK_PER_YEAR: Readonly<Record<AfflictionSeverity, number>> = {
  mild: 0.001,
  moderate: 0.006,
  severe: 0.03,
  critical: 0.12
};

interface AfflictionDef {
  readonly id: AfflictionKind;
  readonly label: string;
  /** 0 = age/ambient driven only, 1 = fully sanitation-driven. */
  readonly sanitationWeight: number;
  /** Relative pick weight among afflictions that pass their gate. */
  readonly pickWeight: number;
  /** Multiplies SEVERITY_DEATH_RISK_PER_YEAR for this disease. */
  readonly deathRiskMultiplier: number;
  /** Only rollable when local sanitation is at/below this (0–100); undefined = no gate. */
  readonly requiresSanitationBelow?: number;
}

/** Disease catalog — see docs/plan/characters/character-health-and-disease.md §2.2. */
export const AFFLICTION_CATALOG: Readonly<Record<AfflictionKind, AfflictionDef>> = {
  fever: { id: "fever", label: "Fever", sanitationWeight: 0.5, pickWeight: 3, deathRiskMultiplier: 0.6 },
  flux: {
    id: "flux",
    label: "Flux",
    sanitationWeight: 1,
    pickWeight: 3,
    deathRiskMultiplier: 0.8,
    requiresSanitationBelow: 55
  },
  pox: { id: "pox", label: "Pox", sanitationWeight: 0.65, pickWeight: 2, deathRiskMultiplier: 0.3 },
  plague: {
    id: "plague",
    label: "Plague",
    sanitationWeight: 0.9,
    pickWeight: 1,
    deathRiskMultiplier: 1.8,
    requiresSanitationBelow: 25
  },
  wasting: { id: "wasting", label: "Wasting sickness", sanitationWeight: 0.15, pickWeight: 1, deathRiskMultiplier: 1.1 }
};

/** `character.health`, defaulting to full health when never simulated (old saves/fixtures). */
export function getCharacterHealth(character: Pick<Character, "health">): number {
  return character.health ?? HEALTH_FULL;
}

export function isCharacterSick(character: Pick<Character, "affliction">): boolean {
  return !!character.affliction;
}

/**
 * Resolve the local public-sanitation score (0–100) a character is exposed to: their burg,
 * falling back to their state, falling back to the host's own neutral seed default. Reads
 * only plain `pack` fields — no Economy import (Characters must stay Economy-optional).
 */
export function resolveCharacterSanitation(
  character: Pick<Character, "location" | "state" | "nationalityStateId">
): number {
  if (!hasCharactersContext()) return SANITATION_DEFAULT;
  const { pack } = getWorldContext();

  if (character.location !== undefined) {
    const burg = pack.burgs?.[character.location];
    if (burg && !burg.removed && typeof burg.sanitation === "number") return burg.sanitation;
  }

  const stateId = character.nationalityStateId ?? character.state;
  const state = pack.states?.[stateId];
  if (state && typeof state.sanitation === "number") return state.sanitation;

  return SANITATION_DEFAULT;
}

/**
 * Resolve the local medical-care civic score (0–100): burg → state → 50.
 * Pack fields only — Characters must not import Economy or hospital objects.
 */
export function resolveCharacterMedicalCare(
  character: Pick<Character, "location" | "state" | "nationalityStateId">
): number {
  if (!hasCharactersContext()) return MEDICAL_CARE_DEFAULT;
  const { pack } = getWorldContext();

  if (character.location !== undefined) {
    const burg = pack.burgs?.[character.location];
    if (burg && !burg.removed && typeof burg.medicalCare === "number") return burg.medicalCare;
  }

  const stateId = character.nationalityStateId ?? character.state;
  const state = pack.states?.[stateId];
  if (state && typeof state.medicalCare === "number") return state.medicalCare;

  return MEDICAL_CARE_DEFAULT;
}

function medicalCareScales(character: Pick<Character, "location" | "state" | "nationalityStateId">): {
  recoveryScale: number;
  infectionScale: number;
} {
  const care = resolveCharacterMedicalCare(character) / 100;
  return {
    recoveryScale: 0.7 + 0.6 * care,
    infectionScale: 1.25 - 0.5 * care
  };
}

interface Vulnerability {
  /** >1 = more vulnerable to disease, <1 = more resistant. */
  multiplier: number;
  isElder: boolean;
}

/**
 * Combines age (children/elders), race longevity, constitution (looks.vitality), and
 * personal wealth (care/nutrition) into one disease-risk multiplier.
 */
function characterVulnerability(character: Character): Vulnerability {
  const raceId = resolveCharacterRaceId(character);
  const profile = resolveRaceAgeProfile(raceId);

  let multiplier = 1;
  const elderAge = scaleHumanAgeToRace(ELDER_HUMAN_AGE, profile);
  const isElder = character.age >= elderAge;
  const isChild = character.age < profile.maturity;
  if (isChild || isElder) multiplier *= VULNERABLE_AGE_MULTIPLIER;

  if (profile.lifespan >= LONG_LIVED_LIFESPAN_MIN) multiplier *= LONG_LIVED_RESISTANCE_MULTIPLIER;

  const vitality = character.looks?.vitality;
  if (typeof vitality === "number" && vitality < LOW_VITALITY_THRESHOLD) multiplier *= LOW_VITALITY_MULTIPLIER;

  const careMitigation = Math.min(WEALTH_CARE_MITIGATION_CAP, (character.wealth || 0) / WEALTH_CARE_REFERENCE);
  multiplier *= 1 - careMitigation;

  return { multiplier: Math.max(0.05, multiplier), isElder };
}

/** Unafflicted health drifts toward this sanitation-capped ceiling ("always a bit run down" in a squalid city). */
function chronicHealthTarget(sanitation: number): number {
  const drag =
    normalize(SANITATION_SAFE_THRESHOLD - sanitation, 0, SANITATION_SAFE_THRESHOLD) * CHRONIC_HEALTH_DRAG_MAX;
  return HEALTH_FULL - drag;
}

/** Converts a per-year probability into a per-tick roll for a possibly fractional/multi-year deltaYears. */
function rollPerYear(probabilityPerYear: number, deltaYears: number): boolean {
  if (probabilityPerYear <= 0) return false;
  const perTick = 1 - (1 - Math.min(0.99, probabilityPerYear)) ** deltaYears;
  return P(perTick);
}

/**
 * How strongly this disease presses on a character right now: a sanitation-driven term
 * (0 at/above SANITATION_SAFE_THRESHOLD) blended with a small ambient/age-driven term so
 * chronic, non-sanitation illnesses (wasting sickness in elders) can still occur in clean cities.
 */
function diseasePressure(def: AfflictionDef, sanitation: number, isElder: boolean): number {
  const sanitationPressure = normalize(SANITATION_SAFE_THRESHOLD - sanitation, 0, SANITATION_SAFE_THRESHOLD);
  const ambientPressure = def.id === "wasting" && isElder ? 0.5 : 0.05;
  return def.sanitationWeight * sanitationPressure + (1 - def.sanitationWeight) * ambientPressure;
}

function eligibleAfflictions(sanitation: number): AfflictionDef[] {
  return Object.values(AFFLICTION_CATALOG).filter(
    def => def.requiresSanitationBelow === undefined || sanitation <= def.requiresSanitationBelow
  );
}

/** Weighted pick over {def, chance} pairs; `total` must equal the sum of all `chance` values. */
function pickWeightedAffliction(
  weighted: readonly { def: AfflictionDef; chance: number }[],
  total: number
): AfflictionKind {
  let roll = Math.random() * total;
  for (const w of weighted) {
    roll -= w.chance;
    if (roll <= 0) return w.def.id;
  }
  return weighted[weighted.length - 1].def.id;
}

/**
 * Generic per-tick health pass: resolves local sanitation, advances any existing affliction
 * (drain, recovery, escalation), and rolls new infections for the still-healthy. Call this
 * before advanceCharacterAging() in the same tick so a fresh affliction is already reflected
 * in that tick's mortality roll (see diseaseDeathRiskFor()).
 */
export function advanceCharacterHealth(deltaYears: number): void {
  if (deltaYears <= 0) return;
  if (!hasCharactersContext()) return;
  const characters = getCharacters();
  if (!characters.length) return;

  for (const character of characters) {
    if (character.dead) continue;

    const sanitation = resolveCharacterSanitation(character);
    const { multiplier, isElder } = characterVulnerability(character);
    const currentHealth = getCharacterHealth(character);

    if (character.affliction) {
      const affliction = character.affliction;
      const severity = affliction.severity;

      const drain = SEVERITY_HEALTH_DRAIN_PER_YEAR[severity] * deltaYears;
      character.health = minmax(currentHealth - drain, 1, HEALTH_FULL);

      // Better constitution/wealth/sanitation (lower vulnerability multiplier) improves recovery odds.
      const { recoveryScale, infectionScale } = medicalCareScales(character);
      const recoveryChance = minmax(
        (SEVERITY_RECOVERY_CHANCE_PER_YEAR[severity] / multiplier) * recoveryScale,
        0.02,
        0.9
      );
      if (rollPerYear(recoveryChance, deltaYears)) {
        character.affliction = undefined;
        character.timesIllness = (character.timesIllness ?? 0) + 1;
        continue;
      }

      const escalationChance = SEVERITY_ESCALATION_CHANCE_PER_YEAR[severity] * multiplier * infectionScale;
      if (escalationChance > 0 && rollPerYear(escalationChance, deltaYears)) {
        const nextIndex = Math.min(SEVERITY_ORDER.length - 1, SEVERITY_ORDER.indexOf(severity) + 1);
        affliction.severity = SEVERITY_ORDER[nextIndex];
      }
      continue;
    }

    // Not afflicted: drift health toward the sanitation-capped baseline.
    const target = chronicHealthTarget(sanitation);
    const recovery = HEALTH_RECOVERY_RATE_PER_YEAR * deltaYears;
    character.health =
      currentHealth < target
        ? Math.min(target, currentHealth + recovery)
        : Math.max(target, currentHealth - recovery * 0.3); // settles down slowly if sanitation just worsened

    // Roll for a new infection across all sanitation-gate-eligible diseases at once.
    const { infectionScale } = medicalCareScales(character);
    const weighted = eligibleAfflictions(sanitation).map(def => ({
      def,
      chance:
        BASE_ANNUAL_INFECTION_RATE *
        diseasePressure(def, sanitation, isElder) *
        def.pickWeight *
        multiplier *
        infectionScale
    }));
    const totalChance = weighted.reduce((sum, w) => sum + w.chance, 0);
    if (totalChance <= 0 || !rollPerYear(totalChance, deltaYears)) continue;

    const picked = pickWeightedAffliction(weighted, totalChance);
    const startsModerate = sanitation <= 20 && P(0.25);
    character.affliction = {
      kind: picked,
      severity: startsModerate ? "moderate" : "mild",
      sinceYear: getCurrentYear()
    };
  }
}

/**
 * Extra annual mortality risk contributed by disease, folded into advanceCharacterAging()'s
 * single death roll. Zero for a healthy character — purely additive, does not change existing
 * age-only mortality outcomes.
 */
export function diseaseDeathRiskFor(character: Character): number {
  if (character.affliction) {
    const def = AFFLICTION_CATALOG[character.affliction.kind];
    const { multiplier } = characterVulnerability(character);
    return SEVERITY_DEATH_RISK_PER_YEAR[character.affliction.severity] * def.deathRiskMultiplier * multiplier;
  }

  const health = getCharacterHealth(character);
  if (health < CHRONIC_LOW_HEALTH_THRESHOLD) {
    return CHRONIC_LOW_HEALTH_DEATH_RISK * ((CHRONIC_LOW_HEALTH_THRESHOLD - health) / CHRONIC_LOW_HEALTH_THRESHOLD);
  }
  return 0;
}

/** Death-reason flavor string for a character dying while sick — undefined when not afflicted. */
export function diseaseDeathReason(character: Character): string | undefined {
  if (!character.affliction) return undefined;
  return `Died of ${AFFLICTION_CATALOG[character.affliction.kind].label.toLowerCase()}`;
}

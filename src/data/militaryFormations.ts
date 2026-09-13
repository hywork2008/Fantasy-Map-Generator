import type { Character } from "../extensions/characters/characterTypes";

import type { MilitaryFormation } from "../types/models";

export type { MilitaryFormation };

export interface FormationInfo {
  id: MilitaryFormation;
  nameKey: string;
  icon: string;
  descKey: string;
}

export const FORMATION_INFO: Record<MilitaryFormation, FormationInfo> = {
  square: {
    id: "square",
    nameKey: "militaryFormations.square",
    icon: "🛡️",
    descKey: "militaryFormations.squareDesc"
  },
  wedge: {
    id: "wedge",
    nameKey: "militaryFormations.wedge",
    icon: "🔺",
    descKey: "militaryFormations.wedgeDesc"
  },
  line: {
    id: "line",
    nameKey: "militaryFormations.line",
    icon: "═",
    descKey: "militaryFormations.lineDesc"
  },
  loose: {
    id: "loose",
    nameKey: "militaryFormations.loose",
    icon: "💨",
    descKey: "militaryFormations.looseDesc"
  }
};

/**
 * Formation matchup matrix.
 * Row: Attacker formation, Col: Defender formation.
 * Value: multiplier on attacker power against this opponent formation.
 *
 * Tactical Dynamics:
 * - Wedge (魚鱗・くさび型) breaks through Line (横隊) with concentrated shock (1.30 vs 0.75).
 * - Line (横隊・鶴翼) envelopes Square (方陣) with superior frontal/flanking firepower (1.30 vs 0.75).
 * - Square (方陣・槍衾) absorbs and repulses Wedge (くさび型) frontal charge (1.30 vs 0.75).
 * - Loose (散開・遊撃) avoids Square's rigid hedgehog (1.20 vs 0.85),
 *   but is overwhelmed by Line's wide firepower (0.80 vs 1.25) and Wedge shock (0.85 vs 1.20).
 */
export const FORMATION_MATCHUPS: Record<MilitaryFormation, Record<MilitaryFormation, number>> = {
  wedge: {
    wedge: 1.0,
    line: 1.3,
    square: 0.75,
    loose: 1.2
  },
  line: {
    wedge: 0.75,
    line: 1.0,
    square: 1.3,
    loose: 1.25
  },
  square: {
    wedge: 1.3,
    line: 0.75,
    square: 1.0,
    loose: 0.85
  },
  loose: {
    wedge: 0.85,
    line: 0.8,
    square: 1.2,
    loose: 1.0
  }
};

/** Formations that counter a given formation (matchup factor >= 1.2) */
export const COUNTER_FORMATIONS: Record<MilitaryFormation, MilitaryFormation> = {
  line: "wedge", // Wedge beats Line
  square: "line", // Line beats Square
  wedge: "square", // Square beats Wedge
  loose: "line" // Line beats Loose
};

/** Formations that lose against a given formation */
export const VULNERABLE_FORMATIONS: Record<MilitaryFormation, MilitaryFormation> = {
  line: "square", // Line is strong against Square -> Square loses to Line
  square: "wedge", // Square is strong against Wedge -> Wedge loses to Square
  wedge: "line", // Wedge is strong against Line -> Line loses to Wedge
  loose: "square" // Loose is strong against Square -> Square loses to Loose
};

/**
 * Returns effective tactical leadership score of a commander (0 - 120).
 * High martial skill (e.g. 70+) combined with martial.tactics (陣形) or martial.command (指揮)
 * elevates the commander's tactical perception.
 */
export function getTacticalSkill(commander: Character | undefined): number {
  if (!commander || commander.dead) return 0;
  const baseMartial = commander.skills?.martial ?? 50;
  // These two domains store their practice directly on the character. Missing
  // expertise falls back to Martial, as the character expertise reader does.
  const practice = (id: string) => {
    const value = commander.specializations?.domains.find(domain => domain.domainId === id)?.practice ?? baseMartial;
    return Math.max(0, Math.min(100, value));
  };
  const tactics = practice("martial.tactics");
  const command = practice("martial.command");
  // Martial contributes 70%, Tactics 20%, Command 10%
  return Math.round(baseMartial * 0.7 + tactics * 0.2 + command * 0.1);
}

/**
 * Selects an inherent preferred formation based on troop composition when no tactical counter is forced.
 * - Spearmen-heavy: Square (方陣)
 * - Cavalry/Sword-heavy: Wedge (魚鱗・くさび)
 * - Archer/Ranged-heavy: Line (横隊)
 * - Balanced or mobile: Loose / Line
 */
export function getTroopPreferredFormation(troops: Record<string, number>): MilitaryFormation {
  const spearmen = troops.spearmen || 0;
  const cavalry = (troops.cavalry || 0) + (troops.armored || 0);
  const ranged = (troops.archers || 0) + (troops.musketeers || 0) + (troops.riflemen || 0);
  const infantry = troops.infantry || 0;

  if (spearmen > cavalry && spearmen >= ranged) {
    return "square";
  }
  if (cavalry > 0 && cavalry >= spearmen && cavalry >= ranged) {
    return "wedge";
  }
  if (ranged > infantry && ranged > spearmen) {
    return "line";
  }
  if (infantry > spearmen + ranged) {
    return "wedge";
  }
  return "line";
}

export interface BattleFormationsResult {
  formationA: MilitaryFormation;
  formationB: MilitaryFormation;
  advantageA: "advantaged" | "disadvantaged" | "even";
  advantageB: "advantaged" | "disadvantaged" | "even";
  tacticalScoreA: number;
  tacticalScoreB: number;
}

/**
 * Determines battle starting formations for side A and side B.
 * Rules:
 * - If a side lacks a commander (tacticalScore = 0):
 *   They cannot read enemy deployments and are highly prone (85%+ chance) to ending up in an inferior
 *   formation countered by the opponent.
 * - If led by a skilled commander (tacticalScore >= 70):
 *   They actively outmaneuver the enemy to ensure an advantageous counter-formation.
 * - If both have commanders:
 *   Contested tactical check based on their tactical leadership skills.
 */
export function resolveBattleFormations(
  commanderA: Character | undefined,
  troopsA: Record<string, number>,
  commanderB: Character | undefined,
  troopsB: Record<string, number>,
  rng: () => number = Math.random
): BattleFormationsResult {
  const scoreA = getTacticalSkill(commanderA);
  const scoreB = getTacticalSkill(commanderB);

  let formationA: MilitaryFormation;
  let formationB: MilitaryFormation;

  const defaultA = getTroopPreferredFormation(troopsA);
  const defaultB = getTroopPreferredFormation(troopsB);

  // Case 1: Neither has a commander
  if (scoreA === 0 && scoreB === 0) {
    formationA = defaultA;
    formationB = defaultB;
  }
  // Case 2: Only A has a commander
  else if (scoreA > 0 && scoreB === 0) {
    formationB = defaultB;
    const counterChance = (commanderA?.skills.martial ?? 0) >= 70 || scoreA >= 70 ? 1 : 0.85;
    if (rng() < counterChance) {
      formationA = COUNTER_FORMATIONS[formationB];
    } else {
      formationA = defaultA;
    }
  }
  // Case 3: Only B has a commander
  else if (scoreB > 0 && scoreA === 0) {
    formationA = defaultA;
    const counterChance = (commanderB?.skills.martial ?? 0) >= 70 || scoreB >= 70 ? 1 : 0.85;
    if (rng() < counterChance) {
      formationB = COUNTER_FORMATIONS[formationA];
    } else {
      formationB = defaultB;
    }
  }
  // Case 4: Both have commanders -> Tactical Duel
  else {
    const scoreDiff = scoreA - scoreB;
    const dominantMargin = 20;

    if (scoreDiff >= dominantMargin) {
      formationB = defaultB;
      const counterChance =
        scoreA >= 70 || (commanderA?.skills.martial ?? 0) >= 70 ? 1 : Math.min(0.95, 0.65 + (scoreDiff / 100) * 0.4);
      formationA = rng() < counterChance ? COUNTER_FORMATIONS[formationB] : defaultA;
    } else if (scoreDiff <= -dominantMargin) {
      formationA = defaultA;
      const counterChance =
        scoreB >= 70 || (commanderB?.skills.martial ?? 0) >= 70
          ? 1
          : Math.min(0.95, 0.65 + (Math.abs(scoreDiff) / 100) * 0.4);
      formationB = rng() < counterChance ? COUNTER_FORMATIONS[formationA] : defaultB;
    } else {
      const rollA = scoreA + rng() * 40;
      const rollB = scoreB + rng() * 40;
      if (rollA > rollB + 15) {
        formationB = defaultB;
        formationA = COUNTER_FORMATIONS[formationB];
      } else if (rollB > rollA + 15) {
        formationA = defaultA;
        formationB = COUNTER_FORMATIONS[formationA];
      } else {
        formationA = defaultA;
        formationB = defaultB;
      }
    }
  }

  const factorA = getFormationMatchupFactor(formationA, formationB, troopsA, troopsB);
  const factorB = getFormationMatchupFactor(formationB, formationA, troopsB, troopsA);

  const advantageA = factorA > 1.15 ? "advantaged" : factorA < 0.85 ? "disadvantaged" : "even";
  const advantageB = factorB > 1.15 ? "advantaged" : factorB < 0.85 ? "disadvantaged" : "even";

  return {
    formationA,
    formationB,
    advantageA,
    advantageB,
    tacticalScoreA: scoreA,
    tacticalScoreB: scoreB
  };
}

/**
 * Calculates the formation combat power multiplier for mySide against oppSide.
 * Includes additional bonus for spearmen in square formation against cavalry/wedge.
 */
export function getFormationMatchupFactor(
  myFormation: MilitaryFormation,
  oppFormation: MilitaryFormation,
  myTroops: Record<string, number> = {},
  oppTroops: Record<string, number> = {}
): number {
  let baseFactor = FORMATION_MATCHUPS[myFormation]?.[oppFormation] ?? 1.0;

  // Spearmen synergy in Square formation:
  // If in Square and holding spearmen, defense against Wedge or Cavalry is boosted further!
  if (myFormation === "square") {
    const totalMyTroops = Object.values(myTroops).reduce((a, b) => a + b, 0);
    const spearmenCount = myTroops.spearmen || 0;
    const spearmenRatio = totalMyTroops > 0 ? spearmenCount / totalMyTroops : 0;

    const oppCavalry = (oppTroops.cavalry || 0) + (oppTroops.armored || 0);
    const totalOppTroops = Object.values(oppTroops).reduce((a, b) => a + b, 0);
    const oppCavalryRatio = totalOppTroops > 0 ? oppCavalry / totalOppTroops : 0;

    // Up to +25% extra power against cavalry/wedge when bristling with pikes
    if (oppFormation === "wedge" || oppCavalryRatio > 0.2) {
      baseFactor += Math.min(0.25, spearmenRatio * 0.4);
    }
  }

  return baseFactor;
}

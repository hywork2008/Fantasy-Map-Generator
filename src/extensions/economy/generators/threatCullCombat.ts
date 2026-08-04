/**
 * Pure combat resolution for threat cull / pest contracts.
 * Spec: docs/plan/player-threat-cull-jobs.md §5 (PR-3b).
 *
 * domainBonus stays 0 in PR-3b; PR-3c enables cullDomainBonus from individualSkills.
 */

import type { CullTargetRef } from "../../../generators/threatCullEffects";
import type { RNGService } from "../../../utils/probabilityUtils";
import type { Character } from "../../characters/characterTypes";
import type { CullEcologyOutcome } from "./threatCullHireTypes";

/** Anon NPC synthetic combat score (K11). */
export const ANON_COMBAT_SCORE = 45;

/** Ecology intensity scale for anonymous hunters. */
export const ANON_ECOLOGY_SCALE = 0.5;

export interface CullCombatResult {
  /** Ecology / death tier only — never "injured". */
  outcome: CullEcologyOutcome;
  /** 0..1 ecology scale before anon factor; 0 on fail/dead. */
  intensity: number;
  /** Orthogonal injury flag; does not change outcome or bounty tier. */
  injured: boolean;
}

/** Personal sortie score — intentional weights (K5). domainBonus = 0 in PR-3b. */
export function combatScore(character: Character, domainBonus = 0): number {
  const s = character.skills;
  return 0.55 * (s?.prowess ?? 50) + 0.45 * (s?.martial ?? 50) + domainBonus;
}

/**
 * Resolution difficulty (~20–95). Always from CullTargetRef snapshots.
 * Never use posting.uiDifficulty.
 */
export function targetDifficulty(target: CullTargetRef): number {
  return Math.min(95, 15 + target.rarity * 12 + target.powerSnapshot * 1.5);
}

/**
 * Single normative combat resolver. Injury never overwrites outcome.
 * Pay uses `outcome` only; injury sets cooldown / optional wealth loss separately.
 */
export function resolveCullCombat(args: {
  combatScore: number;
  difficulty: number;
  rarity: number;
  rng: RNGService;
}): CullCombatResult {
  const delta = args.combatScore - args.difficulty;
  const u = () => args.rng.rand();

  // Critical death checks first
  if (delta < -25 && u() < 0.03) {
    return { outcome: "dead", intensity: 0, injured: false };
  }
  if (args.rarity >= 5 && args.combatScore < 35 && u() < 0.08) {
    return { outcome: "dead", intensity: 0, injured: false };
  }

  if (delta >= 15) {
    const intensity = 0.85 + u() * 0.15; // U(0.85, 1.0)
    const injured = u() < 0.02;
    return { outcome: "success", intensity, injured };
  }

  if (delta >= -5) {
    const intensity = 0.35 + u() * 0.25; // U(0.35, 0.60)
    const injured = u() < 0.15;
    return { outcome: "partial", intensity, injured };
  }

  // Fail band — high injury chance, still outcome "fail"
  const injuryP = Math.min(0.7, Math.max(0.25, 0.25 - delta / 80));
  const injured = u() < injuryP;
  return { outcome: "fail", intensity: 0, injured };
}

/**
 * Pure combat resolution for threat cull / pest contracts.
 * Spec: docs/plan/player-threat-cull-jobs.md §5; equipment + domain bonuses:
 * docs/plan/character-loadout-and-readiness.md EQ-3.
 */

import type { CullTargetRef } from "../../../generators/threatCullEffects";
import type { RNGService } from "../../../utils/probabilityUtils";
import type { Character, CharacterLoadout, EquipmentQuality } from "../../characters/characterTypes";
import { getIndividualSkill } from "./individualSkillMastery";
import type { CullEcologyOutcome } from "./threatCullHireTypes";

/** Anon NPC synthetic combat score (K11). */
export const ANON_COMBAT_SCORE = 45;

/** Ecology intensity scale for anonymous hunters. */
export const ANON_ECOLOGY_SCALE = 0.5;

/** Max combat-score points from swordsmanship/archery proficiency (EQ-3). */
export const CULL_DOMAIN_BONUS_MAX = 8;

/**
 * Domain bonus scale: `0.08 * max(sword, bow)` → 0..8 at proficiency 0..100.
 * Prefer max of the two practices (adventurer may specialise either way).
 */
export const CULL_DOMAIN_BONUS_PER_PROFICIENCY = 0.08;

/** Weapon quality contribution: (Q − 1) × this, Q 1..5 → 0..10. */
export const CULL_WEAPON_QUALITY_BONUS = 2.5;

/** Soft cap on total equipment bonus (weapon + body). */
export const CULL_EQUIPMENT_BONUS_CAP = 12;

export interface CullCombatResult {
  /** Ecology / death tier only — never "injured". */
  outcome: CullEcologyOutcome;
  /** 0..1 ecology scale before anon factor; 0 on fail/dead. */
  intensity: number;
  /** Orthogonal injury flag; does not change outcome or bounty tier. */
  injured: boolean;
}

/**
 * Live individualSkills domain bonus (swordsmanship / archery).
 * Named hunters only — do not apply to ANON_COMBAT_SCORE.
 * Does not inflate base Character.skills (K5).
 */
export function domainBonusFromProficiencies(swordProficiency: number, bowProficiency: number): number {
  const best = Math.max(0, swordProficiency, bowProficiency);
  return Math.min(CULL_DOMAIN_BONUS_MAX, CULL_DOMAIN_BONUS_PER_PROFICIENCY * best);
}

/**
 * Lookup + scale for a character's martial domain practices.
 * Missing domain rows → 0 (no auto-ensure; EQ-4 practice credit seeds growth later).
 */
export function cullDomainBonus(characterId: number): number {
  const sword = getIndividualSkill(characterId, "swordsmanship")?.proficiency ?? 0;
  const bow = getIndividualSkill(characterId, "archery")?.proficiency ?? 0;
  return domainBonusFromProficiencies(sword, bow);
}

/**
 * Personal kit bonus from worn/wielded loadout (EQ-3).
 * - weapon: (quality − 1) × 2.5 → 0..10
 * - body: +1 when quality ≥ 4 (fine attire only — not plate sim)
 * Soft-capped at {@link CULL_EQUIPMENT_BONUS_CAP}.
 */
export function equipmentBonusFromLoadout(loadout: CharacterLoadout | undefined | null): number {
  if (!loadout) return 0;
  const weaponQ = loadout.weapon?.quality;
  const bodyQ = loadout.body?.quality;
  const weapon = weaponQ !== undefined ? (clampQuality(weaponQ) - 1) * CULL_WEAPON_QUALITY_BONUS : 0;
  const body = bodyQ !== undefined && clampQuality(bodyQ) >= 4 ? 1 : 0;
  return Math.min(CULL_EQUIPMENT_BONUS_CAP, weapon + body);
}

function clampQuality(value: number): EquipmentQuality {
  const q = Math.round(value);
  if (q <= 1) return 1;
  if (q === 2) return 2;
  if (q === 3) return 3;
  if (q === 4) return 4;
  return 5;
}

/**
 * Personal sortie score — intentional weights (K5).
 * Always includes equipment from `character.loadout` when present.
 * Pass live {@link cullDomainBonus} for named hunters (EQ-3); leave 0 for pure skill tests.
 */
export function combatScore(character: Character, domainBonus = 0): number {
  const s = character.skills;
  const base = 0.55 * (s?.prowess ?? 50) + 0.45 * (s?.martial ?? 50);
  return base + domainBonus + equipmentBonusFromLoadout(character.loadout);
}

/**
 * Full named-hunter score: base skills + domain practice + equipment.
 * Anonymous contracts must keep using {@link ANON_COMBAT_SCORE} instead.
 */
export function namedHunterCombatScore(character: Character): number {
  return combatScore(character, cullDomainBonus(character.i));
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

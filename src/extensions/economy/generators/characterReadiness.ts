/**
 * Derived hunt/adventurer readiness snapshot for UI (EQ-5).
 * Spec: docs/plan/character-loadout-and-readiness.md §4.2 / §8.2.
 *
 * Pure display helper — no mutations. Combat estimate matches namedHunterCombatScore.
 */

import type { CullTargetRef } from "../../../generators/threatCullEffects";
import type { Character, EquipmentQuality } from "../../characters/characterTypes";
import { getIndividualSkill } from "./individualSkillMastery";
import { equipmentBonusFromLoadout, namedHunterCombatScore, targetDifficulty } from "./threatCullCombat";

export interface CharacterReadiness {
  attireQuality: EquipmentQuality | 0;
  weaponQuality: EquipmentQuality | 0;
  martialDomain: { swordsmanship: number; archery: number };
  combatScoreEstimate: number;
  equipmentBonus: number;
  attireLabel: string;
  weaponLabel: string;
  /** Short English line for the PC panel. */
  summaryLine: string;
  /** Advisory tips only — never hard-block apply. */
  readinessTips: string[];
}

const ATTIRE_QUALITY_LABEL: Readonly<Record<EquipmentQuality, string>> = {
  1: "rags",
  2: "work clothes",
  3: "town dress",
  4: "court attire",
  5: "regalia"
};

const WEAPON_QUALITY_LABEL: Readonly<Record<EquipmentQuality, string>> = {
  1: "farm tool",
  2: "militia arms",
  3: "soldier arms",
  4: "officer arms",
  5: "masterwork arms"
};

/**
 * Build a readiness snapshot for a living character.
 * @param compareTarget optional cull target for advisory undergear tips
 */
export function buildCharacterReadiness(
  character: Character,
  options?: { compareTarget?: CullTargetRef | null }
): CharacterReadiness {
  const bodyQ = character.loadout?.body?.quality;
  const weaponQ = character.loadout?.weapon?.quality;
  const attireQuality = (bodyQ ?? 0) as EquipmentQuality | 0;
  const weaponQuality = (weaponQ ?? 0) as EquipmentQuality | 0;

  const swordsmanship = getIndividualSkill(character.i, "swordsmanship")?.proficiency ?? 0;
  const archery = getIndividualSkill(character.i, "archery")?.proficiency ?? 0;
  const combatScoreEstimate = character.dead ? 0 : namedHunterCombatScore(character);
  const equipmentBonus = equipmentBonusFromLoadout(character.loadout);

  const attireLabel =
    attireQuality === 0
      ? "Undressed"
      : `Garments Q${attireQuality} (${ATTIRE_QUALITY_LABEL[attireQuality as EquipmentQuality]})`;
  const weaponLabel =
    weaponQuality === 0
      ? "Unarmed"
      : `Arms Q${weaponQuality} (${WEAPON_QUALITY_LABEL[weaponQuality as EquipmentQuality]})`;

  const swordPart = swordsmanship > 0 ? `Sword ${Math.round(swordsmanship)}` : "Sword —";
  const summaryLine = `${attireLabel.replace(/ \(.*/, "")} · ${weaponLabel.replace(/ \(.*/, "")} · ${swordPart} · Est. score ${Math.round(combatScoreEstimate)}`;

  const readinessTips: string[] = [];
  if (character.dead) {
    readinessTips.push("This character is deceased.");
  } else {
    if (weaponQuality === 0) {
      readinessTips.push("No weapon equipped — hunt risk is high.");
    } else if (weaponQuality <= 2) {
      readinessTips.push("Weapon quality is low for dangerous targets.");
    }
    if (attireQuality === 0) {
      readinessTips.push("No body attire — seed or equip garments.");
    }
    if (swordsmanship <= 0 && archery <= 0) {
      readinessTips.push("No martial practice recorded — first missions will seed domain skill.");
    }
    const target = options?.compareTarget;
    if (target) {
      const difficulty = targetDifficulty(target);
      const delta = combatScoreEstimate - difficulty;
      if (delta < -15) {
        readinessTips.push(
          `Undergunned for ${target.label} (est. ${Math.round(combatScoreEstimate)} vs difficulty ${Math.round(difficulty)}). You can still apply.`
        );
      } else if (delta < 0) {
        readinessTips.push(
          `Close match for ${target.label} (est. ${Math.round(combatScoreEstimate)} vs ${Math.round(difficulty)}).`
        );
      }
    }
  }

  return {
    attireQuality,
    weaponQuality,
    martialDomain: { swordsmanship, archery },
    combatScoreEstimate,
    equipmentBonus,
    attireLabel,
    weaponLabel,
    summaryLine,
    readinessTips
  };
}

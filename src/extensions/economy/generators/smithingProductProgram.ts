import { getWorldContext } from "../economyContext";
import { findMaster } from "./guildSuccession";
import { getIndividualSkill } from "./individualSkillMastery";
import type { BlacksmithingTechnique, CharacterDomainSkill } from "./individualSkillTypes";

export type SmithingDemandSink = "agriculture" | "extractiveIndustry" | "construction" | "transport" | "military";

/**
 * Catalogue for the first blacksmithing economy vertical slice. A single market Good may serve
 * more than one public/private demand sink; `Tools`, for example, are farm implements, mine and
 * smelter tooling, and construction hardware until those are differentiated into separate Goods.
 */
export const SMITHING_PRODUCT_CATALOG = [
  {
    id: "toolsAndHardware",
    goodNames: ["Tools"] as const,
    demandSinks: ["agriculture", "extractiveIndustry", "construction"] as const
  },
  {
    id: "transportFittings",
    goodNames: ["Harnesses"] as const,
    demandSinks: ["transport"] as const
  },
  {
    id: "armsAndArmor",
    goodNames: ["Arms"] as const,
    demandSinks: ["military"] as const
  },
  {
    id: "ammunition",
    goodNames: ["Arrows", "Bullets"] as const,
    demandSinks: ["military"] as const
  }
] as const;

export const SMITHING_PRODUCT_GOOD_NAMES = ["Tools", "Harnesses", "Arms", "Bullets"] as const;
export type SmithingProductGoodName = (typeof SMITHING_PRODUCT_GOOD_NAMES)[number];
const MASTER_SUPERVISED_SMITHING_PRODUCT_GOOD_NAMES = ["Tools", "Harnesses", "Arms"] as const;
type MasterSupervisedSmithingProductGoodName = (typeof MASTER_SUPERVISED_SMITHING_PRODUCT_GOOD_NAMES)[number];

/** Maximum efficiency contribution from practical proficiency alone. */
const PROFICIENCY_OUTPUT_BONUS_MAX = 0.06;
/** Heat treatment reduces failed work and rework across all initial forged products. */
const HEAT_TREATMENT_OUTPUT_BONUS = 0.03;
/** Pattern welding is a high-skill technique for arms, not ordinary tools or harness fittings. */
const PATTERN_WELDING_ARMS_OUTPUT_BONUS = 0.06;

export interface SmithingProductProgram {
  masterCharacterId: number;
  proficiency: number;
  techniques: readonly BlacksmithingTechnique[];
  /** Finished-good units yielded from one unit of ordinary workshop work. */
  outputMultiplier: number;
}

export function isSmithingWorkshopProductGood(goodName: string): boolean {
  return (SMITHING_PRODUCT_GOOD_NAMES as readonly string[]).includes(goodName);
}

function isMasterSupervisedSmithingProductGoodName(
  goodName: string
): goodName is MasterSupervisedSmithingProductGoodName {
  return (MASTER_SUPERVISED_SMITHING_PRODUCT_GOOD_NAMES as readonly string[]).includes(goodName);
}

function hasTechnique(skill: CharacterDomainSkill, technique: BlacksmithingTechnique): boolean {
  return skill.techniques.includes(technique);
}

/**
 * Calculates the modest material-and-workmanship efficiency from an active master's direct
 * supervision. The shared Good catalogue has no separate quality variants yet, so this represents
 * fewer failed pieces and less rework rather than changing a market Good's price in place.
 */
export function getSmithingProductProgramForSkill(
  goodName: MasterSupervisedSmithingProductGoodName,
  skill: CharacterDomainSkill
): SmithingProductProgram {
  const proficiencyProgress = Math.max(0, Math.min(1, (skill.proficiency - 40) / 60));
  let outputMultiplier = 1 + proficiencyProgress * PROFICIENCY_OUTPUT_BONUS_MAX;

  if (hasTechnique(skill, "heatTreatment")) outputMultiplier += HEAT_TREATMENT_OUTPUT_BONUS;
  if (goodName === "Arms" && hasTechnique(skill, "patternWelding")) {
    outputMultiplier += PATTERN_WELDING_ARMS_OUTPUT_BONUS;
  }

  return {
    masterCharacterId: skill.characterId,
    proficiency: skill.proficiency,
    techniques: skill.techniques,
    outputMultiplier
  };
}

/**
 * Resolves a Burg's active master-supervised smithing program. It deliberately requires a living
 * guild master: guild knowledge remains useful after a death, but this individual bonus does not.
 */
export function getSmithingProductProgram(burgId: number, goodName: string): SmithingProductProgram | null {
  if (!isMasterSupervisedSmithingProductGoodName(goodName)) return null;

  const master = findMaster(getWorldContext().pack.characters ?? [], burgId, "metallurgy");
  if (!master || master.dead) return null;

  const skill = getIndividualSkill(master.i, "blacksmithing");
  return skill ? getSmithingProductProgramForSkill(goodName, skill) : null;
}

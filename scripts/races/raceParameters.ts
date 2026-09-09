import type { RaceSupernatural } from "../../src/types/models";

import type { RaceDefinition as CoreRaceDefinition } from "../../src/data/raceDefinition";
import type { CharacterRaceParameters } from "../../src/extensions/characters/data/raceTypes";
import { RACE_SKILL_AXES, RACE_PERSONALITY_AXES } from "../../src/extensions/characters/data/raceTypes";
import type { EconomyRaceParameters } from "../../src/extensions/economy/data/raceTypes";
export { RACE_SKILL_AXES, RACE_PERSONALITY_AXES };
export const RACE_CIVIC_STANCES = ["diplomatic", "distant", "enemy_colony", "bound"] as const;
export interface RaceDefinition extends CoreRaceDefinition, Omit<CharacterRaceParameters, "key">, Omit<EconomyRaceParameters, "key"> {}
export type RaceParameters = RaceDefinition;

export const RACE_PARAMETER_NUMERIC_COLUMNS: Record<string, string> = {
  arcane_cap: "supernatural.arcaneCap",
  arcane_median: "supernatural.arcaneMedian",
  arcane_inclination: "supernatural.arcaneInclination",
  durability: "supernatural.durability",
  infernal_atavism_chance: "infernalAtavism.chance",
  infernal_atavism_blue_blood_chance: "infernalAtavism.blueBloodChance",
  infernal_atavism_arcane_cap: "infernalAtavism.supernatural.arcaneCap",
  infernal_atavism_arcane_median: "infernalAtavism.supernatural.arcaneMedian",
  infernal_atavism_arcane_inclination: "infernalAtavism.supernatural.arcaneInclination",
  infernal_atavism_durability: "infernalAtavism.supernatural.durability",
  ...Object.fromEntries(RACE_SKILL_AXES.map(axis => [`skill_bias_${axis}`, `skillBias.${axis}`])),
  ...Object.fromEntries(RACE_PERSONALITY_AXES.map(axis => [`personality_bias_${axis}`, `personalityBias.${axis}`])),
  mixed_polity_chance: "mixedPolityChance",
  bound_servitor_chance: "boundServitor.chance",
  hoard_sp_per_adult_year: "hoardSpPerAdultYear",
  water_lifting_ceiling_bonus: "waterTechBias.ceilingBonus.waterLifting",
  municipal_sanitation_ceiling_bonus: "waterTechBias.ceilingBonus.municipalSanitation",
  water_administration_bonus: "waterTechBias.administrationBonusBonus",
  water_urgency_threshold_multiplier: "waterTechBias.urgencyThresholdMultiplier",
  water_construction_speed_multiplier: "waterTechBias.constructionSpeedMultiplier"
};

export function validateRaceParameters(
  def: RaceParameters,
  number: (path: string, min: number, max?: number, integer?: boolean) => void,
  fail: (message: string) => never
) {
  const supernatural = (path: string, profile: RaceSupernatural | undefined) => {
    number(`${path}.arcaneCap`, 0, 100, true);
    number(`${path}.arcaneMedian`, 0, profile?.arcaneCap);
    number(`${path}.arcaneInclination`, 0, 1);
    number(`${path}.durability`, Number.MIN_VALUE);
  };
  supernatural("supernatural", def.supernatural);
  if (def.infernalAtavism) {
    number("infernalAtavism.chance", 0, 1);
    number("infernalAtavism.blueBloodChance", 0, 1);
    supernatural("infernalAtavism.supernatural", def.infernalAtavism.supernatural);
  }
  for (const axis of RACE_SKILL_AXES) if (def.skillBias[axis] !== undefined) number(`skillBias.${axis}`, -100, 100);
  for (const axis of RACE_PERSONALITY_AXES)
    if (def.personalityBias[axis] !== undefined) number(`personalityBias.${axis}`, -100, 100);
  if (!RACE_CIVIC_STANCES.includes(def.civicStance)) fail("invalid civic_stance");
  number("mixedPolityChance", 0, 1);
  if (def.civicStance !== "diplomatic" && def.mixedPolityChance !== 0)
    fail("mixed_polity_chance must be 0 outside diplomatic races");
  if (def.boundServitor) {
    number("boundServitor.chance", 0, 1);
    if (
      !def.boundServitor.raceKey ||
      !def.boundServitor.roles?.length ||
      def.boundServitor.roles.some(role => !/^[a-z][a-z0-9_]*$/.test(role)) ||
      new Set(def.boundServitor.roles).size !== def.boundServitor.roles.length
    )
      fail("bound servitor requires a key and unique role keys");
  }
  if (def.hoardSpPerAdultYear !== undefined) number("hoardSpPerAdultYear", 0);
  if (def.waterTechBias) {
    number("waterTechBias.ceilingBonus.waterLifting", 0, 1);
    number("waterTechBias.ceilingBonus.municipalSanitation", 0, 1);
    number("waterTechBias.administrationBonusBonus", 0, 1);
    number("waterTechBias.urgencyThresholdMultiplier", Number.MIN_VALUE);
    number("waterTechBias.constructionSpeedMultiplier", Number.MIN_VALUE);
  }
  if (def.personNameSpheres.primary !== null) number("personNameSpheres.primary", 0, Infinity, true);
  if (def.personNameSpheres.alternate !== undefined && def.personNameSpheres.alternate !== null)
    number("personNameSpheres.alternate", 0, Infinity, true);
}

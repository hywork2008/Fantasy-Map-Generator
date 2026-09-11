import type { BeastfolkAnimal, RaceSupernatural } from "../../../types/models";
export const RACE_SKILL_AXES = [
  "artistry",
  "diplomacy",
  "engineering",
  "geography",
  "intrigue",
  "learning",
  "martial",
  "prowess",
  "stewardship"
] as const;
export const RACE_PERSONALITY_AXES = [
  "boldness",
  "compassion",
  "greed",
  "honor",
  "rationality",
  "sociability",
  "vengefulness",
  "zeal",
  "energy",
  "piety",
  "guile",
  "confidence"
] as const;
export interface CharacterRaceParameters {
  key: string;
  hybridParents?: readonly [string, string];
  continuousMonogamy?: boolean;
  carnivorousAnimals?: readonly BeastfolkAnimal[];
  skillBias: Partial<Record<(typeof RACE_SKILL_AXES)[number], number>>;
  personalityBias: Partial<Record<(typeof RACE_PERSONALITY_AXES)[number], number>>;
  infernalAtavism?: { chance: number; blueBloodChance: number; supernatural: RaceSupernatural };
  boundServitor?: { raceKey: string; roles: readonly string[]; chance: number };
}

import type {
  AppearanceAxes,
  AppearanceRanges,
  CharacterGenderMode,
  RaceBeautyIdeal,
  RaceCharacterAppearance,
  RaceEnvironmentalSurvival,
  RaceFertility,
  RaceKey,
  RaceSupernatural
} from "../types/models";

export interface RaceDefinition {
  supernatural: RaceSupernatural;
  civicStance: "diplomatic" | "distant" | "enemy_colony" | "bound";
  mixedPolityChance: number;
  personNameSpheres: { primary: number | null; alternate?: number | null };
  key: RaceKey;
  name: string;
  characterGender?: CharacterGenderMode;
  lifespan: number;
  maxLifespan: number;
  looksBaseline: AppearanceAxes;
  /** Per-axis looks roll clamp. Half Elf uses Human×Elf min/max; others omit (1–100). */
  looksRange?: AppearanceRanges;
  beautyIdeal: RaceBeautyIdeal;
  fertility: RaceFertility;
  characterAppearance?: RaceCharacterAppearance;
  /** Persistent species traits used by settlement and population generators. */
  environmentalSurvival?: RaceEnvironmentalSurvival;
}

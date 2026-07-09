import { rand } from "../hostUtils";
import type { AbilityPreset } from "./characterTypes";

/**
 * Built-in default preset — wraps the existing 9 CharacterSkills + 12 CharacterPersonality
 * fields (already CK3-flavored) as an AbilityPreset so they participate in the same pluggable
 * registry as any future game system, without changing their existing fixed-field storage on
 * Character (see docs/plan/char-economy.md 質問3/回答3).
 */
export const ck3Preset: AbilityPreset = {
  id: "ck3e",
  label: "CK3-style (Skills & Personality)",
  stats: [
    { key: "artistry", label: "Artistry", min: 1, max: 100, default: 50 },
    { key: "diplomacy", label: "Diplomacy", min: 1, max: 100, default: 50 },
    { key: "engineering", label: "Engineering", min: 1, max: 100, default: 50 },
    { key: "geography", label: "Geography", min: 1, max: 100, default: 50 },
    { key: "intrigue", label: "Intrigue", min: 1, max: 100, default: 50 },
    { key: "learning", label: "Learning", min: 1, max: 100, default: 50 },
    { key: "martial", label: "Martial", min: 1, max: 100, default: 50 },
    { key: "prowess", label: "Prowess", min: 1, max: 100, default: 50 },
    { key: "stewardship", label: "Stewardship", min: 1, max: 100, default: 50 },
    { key: "boldness", label: "Boldness", min: 1, max: 100, default: 50 },
    { key: "compassion", label: "Compassion", min: 1, max: 100, default: 50 },
    { key: "greed", label: "Greed", min: 1, max: 100, default: 50 },
    { key: "honor", label: "Honor", min: 1, max: 100, default: 50 },
    { key: "rationality", label: "Rationality", min: 1, max: 100, default: 50 },
    { key: "sociability", label: "Sociability", min: 1, max: 100, default: 50 },
    { key: "vengefulness", label: "Vengefulness", min: 1, max: 100, default: 50 },
    { key: "zeal", label: "Zeal", min: 1, max: 100, default: 50 },
    { key: "energy", label: "Energy", min: 1, max: 100, default: 50 },
    { key: "piety", label: "Piety", min: 1, max: 100, default: 50 },
    { key: "guile", label: "Guile", min: 1, max: 100, default: 50 },
    { key: "confidence", label: "Confidence", min: 1, max: 100, default: 50 }
  ],
  generate(): Record<string, number> {
    const values: Record<string, number> = {};
    for (const stat of ck3Preset.stats) values[stat.key] = rand(stat.min, stat.max);
    return values;
  }
};

/** Example alternative preset: classic six D&D 5e ability scores, rolled 3d6 per stat. */
export const dnd5ePreset: AbilityPreset = {
  id: "dnd5e",
  label: "Dungeons & Dragons 5e",
  stats: [
    { key: "STR", label: "Strength", min: 3, max: 18, default: 10 },
    { key: "DEX", label: "Dexterity", min: 3, max: 18, default: 10 },
    { key: "CON", label: "Constitution", min: 3, max: 18, default: 10 },
    { key: "INT", label: "Intelligence", min: 3, max: 18, default: 10 },
    { key: "WIS", label: "Wisdom", min: 3, max: 18, default: 10 },
    { key: "CHA", label: "Charisma", min: 3, max: 18, default: 10 }
  ],
  generate(): Record<string, number> {
    const values: Record<string, number> = {};
    for (const stat of dnd5ePreset.stats) {
      values[stat.key] = rand(1, 6) + rand(1, 6) + rand(1, 6);
    }
    return values;
  }
};

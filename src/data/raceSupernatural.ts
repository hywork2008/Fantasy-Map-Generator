/**
 * Fantasy supernatural traits by race catalog key.
 *
 * Arcane is a cosmic 1–100 (Demon 100, Human 10), not a tenth CharacterSkills axis.
 * Dwarf runes are Engineering, not Arcane. Draconic barely uses Arcane; durability is the
 * reason short-lived folk do not casually attack them.
 * Spec: docs/plan/characters/arcane.md
 */
import type { RaceSupernatural } from "../types/models";
import { hybridMinMaxMedian } from "./hybridRaceTraits";

export const HUMAN_SUPERNATURAL: RaceSupernatural = {
  arcaneCap: 10,
  arcaneMedian: 3,
  arcaneInclination: 0.12,
  durability: 1
};

export const RACE_SUPERNATURAL: Readonly<Record<string, RaceSupernatural>> = {
  unknown: HUMAN_SUPERNATURAL,
  human: HUMAN_SUPERNATURAL,
  elf: { arcaneCap: 95, arcaneMedian: 50, arcaneInclination: 0.55, durability: 1.15 },
  dark_elf: { arcaneCap: 85, arcaneMedian: 48, arcaneInclination: 0.6, durability: 1.1 },
  dwarf: { arcaneCap: 10, arcaneMedian: 2, arcaneInclination: 0.05, durability: 1.35 },
  goblin: { arcaneCap: 6, arcaneMedian: 2, arcaneInclination: 0.15, durability: 0.85 },
  orc: { arcaneCap: 4, arcaneMedian: 1, arcaneInclination: 0.05, durability: 1.25 },
  giant: { arcaneCap: 90, arcaneMedian: 45, arcaneInclination: 0.35, durability: 3.5 },
  draconic: { arcaneCap: 40, arcaneMedian: 18, arcaneInclination: 0.08, durability: 8 },
  arachnid: { arcaneCap: 5, arcaneMedian: 2, arcaneInclination: 0.12, durability: 0.9 },
  amazones: { arcaneCap: 20, arcaneMedian: 8, arcaneInclination: 0.2, durability: 1.2 },
  wyrmkin: { arcaneCap: 12, arcaneMedian: 5, arcaneInclination: 0.15, durability: 1.1 },
  demon: { arcaneCap: 100, arcaneMedian: 55, arcaneInclination: 0.7, durability: 2.5 },
  beastfolk: { arcaneCap: 3, arcaneMedian: 1, arcaneInclination: 0.08, durability: 1.15 },
  // Human × Elf: cap/durability ceiling = higher parent; typical Arcane = lower parent.
  half_elf: {
    arcaneCap: hybridMinMaxMedian(10, 95).max,
    arcaneMedian: hybridMinMaxMedian(3, 50).median,
    arcaneInclination: hybridMinMaxMedian(0.12, 0.55).median,
    durability: hybridMinMaxMedian(1, 1.15).median
  }
};

export function supernaturalForRaceKey(key: string | undefined | null): RaceSupernatural {
  if (!key) return HUMAN_SUPERNATURAL;
  return RACE_SUPERNATURAL[key] ?? HUMAN_SUPERNATURAL;
}

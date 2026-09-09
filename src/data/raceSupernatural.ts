/**
 * Fantasy supernatural traits by race catalog key.
 *
 * Arcane is a cosmic 1–100 (Demon 100, Human 10), not a tenth CharacterSkills axis.
 * Dwarf runes are Engineering, not Arcane. Draconic barely uses Arcane; durability is the
 * reason short-lived folk do not casually attack them.
 * Spec: docs/plan/characters/arcane.md
 */
import type { RaceSupernatural } from "../types/models";
import { raceCatalog, raceCatalogEntry } from "./raceCatalog";

export const HUMAN_SUPERNATURAL: RaceSupernatural = raceCatalogEntry("human")!.supernatural;

export const RACE_SUPERNATURAL: Readonly<Record<string, RaceSupernatural>> = Object.fromEntries(
  raceCatalog.map(def => [def.key, def.supernatural])
);

export function supernaturalForRaceKey(key: string | undefined | null): RaceSupernatural {
  if (!key) return HUMAN_SUPERNATURAL;
  return RACE_SUPERNATURAL[key] ?? HUMAN_SUPERNATURAL;
}

import type { RaceDefinition as CoreRaceDefinition } from "../../src/data/raceDefinition";
import type { CharacterRaceParameters } from "../../src/extensions/characters/data/raceTypes";
import type { EconomyRaceParameters } from "../../src/extensions/economy/data/raceTypes";
import type { RaceDefinition } from "./raceParameters";

export function splitRaceCatalog(definitions: readonly RaceDefinition[]) {
  const core: CoreRaceDefinition[] = [];
  const characters: CharacterRaceParameters[] = [];
  const economy: EconomyRaceParameters[] = [];
  for (const def of definitions) {
    const { hybridParents, continuousMonogamy, carnivorousAnimals, skillBias, personalityBias,
      infernalAtavism, boundServitor, hoardSpPerAdultYear, waterTechBias, ...shared } = def;
    core.push(shared);
    characters.push({ key: def.key, hybridParents, continuousMonogamy, carnivorousAnimals,
      skillBias, personalityBias, infernalAtavism, boundServitor });
    economy.push({ key: def.key, hoardSpPerAdultYear, waterTechBias });
  }
  return { core, characters, economy };
}

/** Match by stable key; never silently lose a missing or extra extension row during export. */
export function joinRaceCatalog(core: CoreRaceDefinition[], characters: CharacterRaceParameters[], economy: EconomyRaceParameters[]): RaceDefinition[] {
  const index = <T extends { key: string }>(rows: T[]) => {
    const map = new Map(rows.map(row => [row.key, row]));
    if (map.size !== rows.length || rows.length !== core.length || core.some(row => !map.has(row.key)))
      throw new Error("Generated race artifacts have inconsistent keys; run races:import");
    return map;
  };
  index(core);
  const characterByKey = index(characters), economyByKey = index(economy);
  return core.map(def => ({ ...def, ...characterByKey.get(def.key)!, ...economyByKey.get(def.key)! }));
}

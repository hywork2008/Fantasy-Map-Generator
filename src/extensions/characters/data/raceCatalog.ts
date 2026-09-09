import catalog from "./races.generated.json";
import type { CharacterRaceParameters } from "./raceTypes";
export const raceCatalog: readonly CharacterRaceParameters[] = catalog as CharacterRaceParameters[];
const byKey = new Map(raceCatalog.map(def => [def.key, def]));
export function raceCatalogEntry(key: string | undefined | null): CharacterRaceParameters | undefined {
  return key ? byKey.get(key) : undefined;
}

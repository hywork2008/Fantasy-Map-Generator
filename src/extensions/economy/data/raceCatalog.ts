import catalog from "./races.generated.json";
import type { EconomyRaceParameters } from "./raceTypes";
export const raceCatalog: readonly EconomyRaceParameters[] = catalog as EconomyRaceParameters[];
const byKey = new Map(raceCatalog.map(def => [def.key, def]));
export function raceCatalogEntry(key: string | undefined | null): EconomyRaceParameters | undefined {
  return key ? byKey.get(key) : undefined;
}

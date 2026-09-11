import type { RaceDefinition } from "./raceDefinition";
import catalog from "./races.generated.json";

/** Dependency-free runtime access: parameter consumers must not import each other. */
export const raceCatalog: readonly RaceDefinition[] = catalog as RaceDefinition[];
const byKey = new Map(raceCatalog.map(def => [def.key, def]));
export function raceCatalogEntry(key: string | undefined | null): RaceDefinition | undefined {
  return key ? byKey.get(key) : undefined;
}

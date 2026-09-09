import { splitRaceCatalog, joinRaceCatalog } from "../races/catalogArtifacts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRaceRelationsCsv } from "../races/racesRelationsCsv";
import { parseRacesCsv } from "../races/racesCsv";

export const raceCsvPath = fileURLToPath(new URL("../../docs/plan/data/races.csv", import.meta.url));
export const raceGeneratedPath = fileURLToPath(new URL("../../src/data/races.generated.json", import.meta.url));
export const raceRelationsCsvPath = fileURLToPath(new URL("../../docs/plan/data/races-relations.csv", import.meta.url));
export const raceRelationsGeneratedPath = fileURLToPath(new URL("../../src/extensions/characters/data/raceRelations.generated.json", import.meta.url));

export const characterRaceGeneratedPath = fileURLToPath(new URL("../../src/extensions/characters/data/races.generated.json", import.meta.url));
export const economyRaceGeneratedPath = fileURLToPath(new URL("../../src/extensions/economy/data/races.generated.json", import.meta.url));

export function readGeneratedRaceCatalog() {
  return joinRaceCatalog(...[raceGeneratedPath, characterRaceGeneratedPath, economyRaceGeneratedPath].map(path => JSON.parse(readFileSync(path, "utf8"))) as Parameters<typeof joinRaceCatalog>);
}

export function compileRaceCatalog(check = false, input = raceCsvPath, relationsInput = raceRelationsCsvPath) {
  // Validate both authoring tables before changing either generated artifact.
  const definitions = parseRacesCsv(readFileSync(input, "utf8"));
  const relations = parseRaceRelationsCsv(readFileSync(relationsInput, "utf8"), definitions);
  const { core, characters, economy } = splitRaceCatalog(definitions);
  const outputs = [[raceGeneratedPath, core], [characterRaceGeneratedPath, characters],
    [economyRaceGeneratedPath, economy], [raceRelationsGeneratedPath, relations]] as const;
  for (const [path, data] of outputs) {
    const output = `${JSON.stringify(data, null, 2)}\n`;
    const current = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (current === output) continue;
    if (check) throw new Error(`Race catalog is stale (${path}). Run npm run races:import`);
    writeFileSync(path, output);
  }
  return definitions.length;
}

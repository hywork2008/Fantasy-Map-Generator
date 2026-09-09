import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRacesCsv } from "../../src/data/racesCsv";

export const raceCsvPath = fileURLToPath(new URL("../../docs/plan/data/races.csv", import.meta.url));
export const raceGeneratedPath = fileURLToPath(new URL("../../src/data/races.generated.json", import.meta.url));
export function compileRaceCatalog(check = false, input = raceCsvPath) {
  const definitions = parseRacesCsv(readFileSync(input, "utf8"));
  const output = `${JSON.stringify(definitions, null, 2)}\n`;
  const current = existsSync(raceGeneratedPath) ? readFileSync(raceGeneratedPath, "utf8") : "";
  if (current !== output) {
    if (check) throw new Error("Race catalog is stale. Run npm run races:import");
    writeFileSync(raceGeneratedPath, output);
  }
  return definitions.length;
}

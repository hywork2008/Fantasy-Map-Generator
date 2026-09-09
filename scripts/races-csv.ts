import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exportRaceRelationsCsv } from "./races/racesRelationsCsv";
import { exportRacesCsv } from "./races/racesCsv";
import { compileRaceCatalog, raceCsvPath, readGeneratedRaceCatalog, raceRelationsCsvPath, raceRelationsGeneratedPath } from "./lib/raceCatalog";

const [command, file, ...extra] = process.argv.slice(2);
try {
  if (extra.length) throw new Error("Too many arguments");
  if (command === "export" || command === "export-relations") {
    // Export the compiled source snapshot, without first importing the CSV.
    const definitions = readGeneratedRaceCatalog();
    const csv = command === "export" ? exportRacesCsv(definitions) : exportRaceRelationsCsv(JSON.parse(readFileSync(raceRelationsGeneratedPath, "utf8")), definitions);
    if (file) {
      if ([raceCsvPath, raceRelationsCsvPath].includes(resolve(file))) throw new Error("Export to another path to preserve authoring formulas");
      writeFileSync(file, csv, { flag: "wx" });
    } else process.stdout.write(csv);
  } else if (command === "import" || command === "import-relations" || command === "check") {
    if (command === "check" && file) throw new Error("check takes no input path");
    const relationsOnly = command === "import-relations";
    const count = compileRaceCatalog(command === "check", !relationsOnly && file ? resolve(file) : undefined, relationsOnly && file ? resolve(file) : undefined);
    if (command !== "check" && file) writeFileSync(relationsOnly ? raceRelationsCsvPath : raceCsvPath, readFileSync(resolve(file), "utf8"));
    console.log(`${count} races: ${command === "check" ? "valid and up to date" : "imported"}`);
  } else throw new Error("Usage: npm run races:import -- [input.csv] | races:check | races:export -- [new-output.csv]");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

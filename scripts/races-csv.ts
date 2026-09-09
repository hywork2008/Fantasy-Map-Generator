import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exportRacesCsv } from "../src/data/racesCsv";
import { compileRaceCatalog, raceCsvPath, raceGeneratedPath } from "./lib/raceCatalog";

const [command, file, ...extra] = process.argv.slice(2);
try {
  if (extra.length) throw new Error("Too many arguments");
  if (command === "export") {
    // Export the compiled source snapshot, without first importing the CSV.
    const csv = exportRacesCsv(JSON.parse(readFileSync(raceGeneratedPath, "utf8")));
    if (file) {
      if (resolve(file) === raceCsvPath) throw new Error("Export to another path to preserve authoring formulas");
      writeFileSync(file, csv, { flag: "wx" });
    } else process.stdout.write(csv);
  } else if (command === "import" || command === "check") {
    if (command === "check" && file) throw new Error("check takes no input path");
    const count = compileRaceCatalog(command === "check", file ? resolve(file) : undefined);
    if (command === "import" && file) writeFileSync(raceCsvPath, readFileSync(resolve(file), "utf8"));
    console.log(`${count} races: ${command === "check" ? "valid and up to date" : "imported"}`);
  } else throw new Error("Usage: npm run races:import -- [input.csv] | races:check | races:export -- [new-output.csv]");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

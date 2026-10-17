import fs from "fs";
import path from "path";
import { planSvg } from "../src/buildings/planSvg";
import { validateBuildingRecord } from "../src/buildings/validate";

/**
 * Writes src/buildings/plans/{id}.svg from each catalogue record.
 * The hash is contentDigest, the same function the viewer checks.
 */
const root = path.join(import.meta.dirname, "..");
const catalogue = path.join(root, "src/buildings/catalogue");
const plans = path.join(root, "src/buildings/plans");

fs.mkdirSync(plans, { recursive: true });
const files = fs.readdirSync(catalogue).filter(name => name.endsWith(".json")).sort();
if (!files.length) {
  console.error("no catalogue json");
  process.exit(1);
}
for (const file of files) {
  const value = JSON.parse(fs.readFileSync(path.join(catalogue, file), "utf8")) as unknown;
  const result = validateBuildingRecord(value);
  if (!result.ok) {
    console.error(`${file}\n${result.errors.join("\n")}`);
    process.exit(1);
  }
  const svg = planSvg(result.record);
  fs.writeFileSync(path.join(plans, `${result.record.id}.svg`), `${svg}\n`);
  console.log(`${result.record.id}.svg`);
}

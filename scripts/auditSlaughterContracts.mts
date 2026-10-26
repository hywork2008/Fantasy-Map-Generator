/** Read-only catalogue/unit reconciliation for the proposed joint slaughter transaction. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost } from "../src/simulation/adapters/node";
import { getGoods } from "../src/extensions/economy/context/trade";
import { GOOD_MEASURES } from "../src/extensions/economy/generators/goodMeasureCatalog";
import { Goods, type Good } from "../src/extensions/economy/generators/goods-generator";
import { animalsPerMarketHead } from "../src/extensions/economy/generators/liveAnimalScale";
import { singleIngredientHeads } from "../src/extensions/economy/generators/slaughter";
import { hasPhysicalWoodRecipe } from "../src/extensions/economy/generators/woodRecipeContracts";

const [output, ...inputs] = process.argv.slice(2);
if (!output) throw new Error("Usage: auditSlaughterContracts.mts output.json [input.fmg ...]");
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const sourcePaths = ["scripts/auditSlaughterContracts.mts", ...[
  "faunaPopulation", "liveAnimalCatch", "liveAnimalScale", "production-utils", "markets-generator",
  "production-generator", "slaughter", "goods-generator", "goodMeasureCatalog", "foodProcessingLedger", "rennet",
  "woodRecipeContracts"
].map(name => `src/extensions/economy/generators/${name}.ts`)];
const sourceHashes = Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(path))]));

function inspect(goods: Good[]) {
  const byId = new Map(goods.map(good => [good.i, good]));
  const animals = goods.filter(good => good.tags.includes("liveAnimal"));
  const tallow = goods.find(good => good.name === "Tallow");
  const leather = goods.find(good => good.name === "Leather");
  const measure = (good: Good) => {
    const row = GOOD_MEASURES[good.name];
    return row && row.unit === good.unit ? row : null;
  };
  const jointYields = animals.filter(good => good.tags.includes("food")).map(animal => {
    const tallowHeads = tallow ? singleIngredientHeads(tallow, animal.i) : undefined;
    const leatherHeads = leather ? singleIngredientHeads(leather, animal.i) ?? (animal.name === "Cattle" ? 1 : undefined) : undefined;
    const tallowUnits = tallowHeads ? 1 / tallowHeads : 0;
    const leatherUnits = leatherHeads ? 1 / leatherHeads : 0;
    const inputKg = measure(animal)?.kg ?? null;
    const outputKg = tallow && leather && measure(tallow) && measure(leather)
      ? tallowUnits * measure(tallow)!.kg + leatherUnits * measure(leather)!.kg : null;
    return { animal: animal.name, animalsPerMarketUnit: animalsPerMarketHead(animal.name), inputKg,
      tallowUnitsPerMarketAnimal: tallowUnits, leatherUnitsPerMarketAnimal: leatherUnits,
      mappedJointOutputKg: outputKg, mappedOutputExceedsLiveMass: inputKg !== null && outputKg !== null ? outputKg > inputKg : null,
      note: "Conditional full legacy catalogue yields, before output rounding and enablement; not an observed slaughter event or historical yield." };
  });
  const directRecipes = goods.flatMap(outputGood => (outputGood.recipes ?? []).flatMap((recipe, recipeIndex) => {
    const entries = Object.entries(recipe).map(([id, units]) => ({good: byId.get(Number(id)), units}));
    if (!entries.some(row => row.good?.tags.includes("liveAnimal"))) return [];
    const complete = entries.every(row => row.good && measure(row.good));
    const inputKg = complete ? entries.reduce((sum, row) => sum + measure(row.good!)!.kg * row.units, 0) : null;
    const outputKg = measure(outputGood)?.kg ?? null;
    return [{ output: outputGood.name, recipeIndex,
      inputs: entries.map(row => ({name: row.good?.name ?? null, units: row.units,
        mappedKgPerUnit: row.good ? measure(row.good)?.kg ?? null : null})), inputKg, outputKg,
      massGainAtUnitYield: inputKg !== null && outputKg !== null ? outputKg - inputKg : null,
      outputBonusConvertedToWorkSpeed: hasPhysicalWoodRecipe(outputGood.name),
      note: "One base output lot, excludes recipe byproducts, packing tare and any unspecified inputs. Transport mass is a model mapping, not calibrated edible mass." }];
  }));
  return { measures: Object.fromEntries(["Cattle", "Sheep", "Goats", "Pig", "Horses", "Tallow", "Leather", "Preserved food", "Salt", "Rennet"]
    .map(name => [name, GOOD_MEASURES[name] ?? null])),
    animals: animals.map(good => ({name: good.name, unit: good.unit, food: good.tags.includes("food"), multipliers: good.multipliers ?? null})),
    jointYields, directRecipes };
}

const defaultGoods = Object.keys(GOOD_MEASURES).flatMap(name => {
  const good = Goods.getDefaultGood(name);
  return good ? [good] : [];
});
const shipped = inspect(defaultGoods);
const worlds = [];
for (const input of inputs) {
  const bytes = readFileSync(input);
  const host = createNodeSimulationHost();
  try {
    await host.loadArchive(new Uint8Array(bytes));
    worlds.push({input, inputSha256: hash(bytes), date: [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay],
      stage: "loaded catalogue, includes normal load migrations; preparation and time advance not run",
      catalogue: inspect(getGoods())});
  } finally { host.dispose(); }
}
writeFileSync(output, JSON.stringify({schemaVersion: 1, sourceHashes,
  notes: ["This is static unit reconciliation, not simulated production or historical calibration.",
    "The inspector never calls offtake, slaughter or manufacture. Normal archive loading may repair loaded columns/catalogues.",
    "Unknown or unit-mismatched measures remain null. Legacy preserved-food output mass is not new edible meat."], shipped, worlds}, null, 2) + "\n");

#!/usr/bin/env tsx
/** T7 catalogue audit, without running or changing the economy.
 * Usage: node --import tsx scripts/auditWoodRecipes.mts output.json
 * Liters are catalogue net/stowable contents, never additive process volumes.
 * Unaccounted mass is not a measured emission, waste stream or conservation error.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { GOOD_MEASURES } from "../src/extensions/economy/generators/goodMeasureCatalog";
import { GOODS_DATA } from "../src/extensions/economy/generators/goods-generator";

const roles: Record<string, string> = {
  Tar: "pyrolysis-feedstock-and-process-fuel",
  Charcoal: "carbonization-feedstock-and-process-fuel",
  Brick: "firing-fuel",
  Barrels: "wooden-body",
  Arrows: "wooden-shafts",
  Muskets: "wooden-stocks; charcoal-is-separate-fuel",
  "Preserved food": "smoking-fuel",
  Ash: "complete-combustion-feedstock",
  "Smoked Cheese": "smoking-fuel",
  Liquor: "distillation-fuel",
  Timber: "sawlogs",
  "Spinning Wheel": "wooden-body",
  Instruments: "wooden-body",
  Rail: "reheating-fuel",
  Steamship: "undocumented-hull-or-fuel"
};

function material(name: string, units: number) {
  const measure = GOOD_MEASURES[name];
  if (!measure || !Number.isFinite(units) || units <= 0) throw new Error(`Invalid material: ${name}`);
  return { name, units, kg: units * measure.kg, liters: units * measure.liters, measure };
}
function materials(recipe: Record<string, number> | undefined) {
  return Object.entries(recipe ?? {}).map(([name, units]) => material(name, units));
}
function sum(rows: { kg: number; liters: number }[]) {
  return rows.reduce((total, row) => ({ kg: total.kg + row.kg, liters: total.liters + row.liters }), {
    kg: 0,
    liters: 0
  });
}

const rows = GOODS_DATA.flatMap(good =>
  (good.recipes ?? []).flatMap((recipe, recipeIndex) => {
    if (!recipe.Wood) return [];
    if (!roles[good.name]) throw new Error(`Classify Wood's role in ${good.name}`);
    const inputs = materials(recipe);
    const output = material(good.name, 1);
    const byproducts = materials(good.byproducts?.[recipeIndex]);
    const wood = inputs.find(row => row.name === "Wood")!;
    const inputTotal = sum(inputs);
    const outputTotal = sum([output, ...byproducts]);
    return [
      {
        good: good.name,
        recipeIndex,
        woodRole: roles[good.name],
        inputs,
        output,
        byproducts,
        inputTotal,
        outputTotal,
        unaccountedKg: inputTotal.kg - outputTotal.kg,
        mainOutputKgPerWoodKg: output.kg / wood.kg,
        mainOutputLitersPerWoodLiter: output.liters / wood.liters
      }
    ];
  })
);
const goods = [...new Set(rows.map(row => row.good))];
if (Object.keys(roles).some(name => name !== "Steamship" && !goods.includes(name))) throw new Error("Stale Wood role classification");
const sourcePaths = [
  "scripts/auditWoodRecipes.mts",
  "src/extensions/economy/generators/goods-generator.ts",
  "src/extensions/economy/generators/goodMeasureCatalog.ts",
  "src/extensions/economy/generators/foodLots.ts",
  "src/extensions/economy/generators/foodConstants.ts",
  "src/extensions/economy/generators/craftDemandCalibration.ts",
  "src/generators/forestStock.ts",
  "src/generators/settlementClearance.ts",
  "src/extensions/economy/generators/liveAnimalScale.ts",
  "src/extensions/economy/generators/woodRecipeContracts.ts"
];
const result = {
  schemaVersion: 1,
  scope: "Shipped GOODS_DATA recipes with a direct Wood input; one nominal output lot before production multipliers",
  caveat:
    "Net catalogue measures, excluding packaging, water, air and untracked residues; no dry-mass or energy balance is implied",
  sourceHashes: Object.fromEntries(
    sourcePaths.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])
  ),
  goodsCount: goods.length,
  recipeCount: rows.length,
  rows
};
const outputPath = process.argv[2];
if (!outputPath) throw new Error("Expected output.json");
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Audited ${goods.length} goods / ${rows.length} Wood recipes -> ${outputPath}`);

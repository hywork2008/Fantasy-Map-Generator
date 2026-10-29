/** T0 table: twelve-month tree appearances at three fixed reference climates (bv-tree-seasonal-appearance.md §9). */
import { PERENNIAL_CROP_PROFILES } from "../src/data/perennialCrops";
import { getSeasonalCropPlan } from "../src/extensions/economy/generators/seasonalCropClimate";
import { resolveTreeAppearanceYear, TREE_PHENOLOGY } from "../src/buildings/landscape/treePhenology";
import { TREE_SPECIES } from "../src/buildings/landscape/trees";

// Rounded 1991–2020-style station normals, used only as fixed inputs.
const SITES = {
  temperate50N: [0.9, 2.0, 5.6, 9.6, 14.0, 17.2, 19.3, 18.8, 14.8, 10.0, 5.4, 2.1],
  mediterranean38N: [10.2, 10.6, 12.6, 16.1, 21.0, 25.7, 28.4, 28.1, 24.0, 19.5, 15.2, 11.8],
  tropical4N: [27.0, 27.5, 27.2, 27.0, 26.6, 25.6, 24.3, 24.3, 25.0, 25.6, 26.3, 26.8]
} as const;
const SHORT = { bare: "B", bloom: "F", leaf: "L", unripe: "U", fruit: "R", harvested: "H", autumn: "A" } as const;

for (const [site, temperatures] of Object.entries(SITES)) {
  console.log(`\n### ${site}\n\n| species | crop harvest | J | F | M | A | M | J | J | A | S | O | N | D |`);
  console.log(`| --- | --- |${" --- |".repeat(12)}`);
  for (const species of TREE_SPECIES) {
    const crop = TREE_PHENOLOGY[species].perennialCrop;
    const plan = crop
      ? getSeasonalCropPlan(PERENNIAL_CROP_PROFILES[crop].calendar, { year: 2001, monthlyMeanTemperatureC: temperatures })
      : undefined;
    const weights = plan?.calendar.harvestWeights;
    const harvest = weights
      ? Array.from({ length: 12 }, (_, m) => m)
          .filter(m => weights[m] > 1e-9)
          .map(m => m + 1)
          .join(",") || "none"
      : "-";
    const year = resolveTreeAppearanceYear(species, { monthlyMeanTemperatureC: temperatures, harvestWeights: weights });
    const cells = year.map(s => `${SHORT[s.appearance]}${s.autumnPalette ? "*" : ""}`);
    console.log(`| ${species} | ${harvest} | ${cells.join(" | ")} |`);
  }
}

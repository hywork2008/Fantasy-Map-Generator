/** Offline calibration only. Run FOOD_CLIMATE_CALIBRATE=1 npx vitest run src/extensions/economy/generators/foodClimateCalibration.test.ts. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import type { WorldContext } from "../../hostCore";
import { calculateAgriculturalLandProfile, getCropMix, getCropSuitability } from "./agriculturalLandUse";
import { GOODS_DATA, type Good } from "./goods-generator";

const temperatures = [-5, -2, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 33, 36, 38, 40];
const rainfall = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 18, 20, 25, 30, 40, 60, 80, 120, 160, 255];
const water = [0, 0.5, 1, 2, 4, 8, 16];
const soils = ["loam", "alluvial", "humus", "clay", "sandy", "thin"];
const cultures = [
  "Generic",
  "Hunting",
  "Highland",
  "River",
  "Lake",
  "Naval",
  "Nomadic",
  "Desert",
  "Marsh",
  "Industrial",
  "Colonial"
];
const crops = GOODS_DATA.flatMap((good, i) => (good.crop ? [{ ...good, i: i + 1 } as Good] : []));
const root = resolve(import.meta.dirname, "../../../..");
const sourceFiles = [
  "src/data/stapleCrops.ts",
  "src/extensions/economy/generators/agriculturalLandUse.ts",
  "src/extensions/economy/generators/goods-generator.ts",
  "src/extensions/economy/generators/floodHazard.ts",
  "src/extensions/economy/generators/foodConstants.ts",
  "src/generators/settlementClearance.ts"
];

const samplesPerCulture = 4;
const count = soils.length * cultures.length * samplesPerCulture;

function fixture(): WorldContext {
  return {
    populationRate: 1,
    distanceScale: 1,
    biomesData: {
      habitability: [100, 100, 100, 100, 100, 100],
      tags: [["arable"], ["arable"], ["forest", "arable"], ["wetland"], ["desert"], ["mountain"]]
    },
    grid: { cells: { temp: new Float32Array(count), prec: new Float32Array(count) } },
    pack: {
      burgs: [],
      cultures: cultures.map(type => ({ type })),
      cells: {
        i: Uint16Array.from({ length: count }, (_, i) => i),
        g: Uint16Array.from({ length: count }, (_, i) => i),
        h: new Uint8Array(count).fill(50),
        area: new Float32Array(count).fill(1),
        forestCover: new Float32Array(count),
        capacity: new Float32Array(count).fill(100),
        r: Uint16Array.from({ length: count }, (_, i) =>
          Math.floor(i / (cultures.length * samplesPerCulture)) === 1 ? 1 : 0
        ),
        fl: new Float32Array(count),
        pop: new Float32Array(count),
        maleAdults: new Float32Array(count),
        femaleAdults: new Float32Array(count),
        culture: Uint16Array.from({ length: count }, (_, i) => Math.floor(i / samplesPerCulture) % cultures.length),
        biomeCode: Uint8Array.from({ length: count }, (_, i) => Math.floor(i / (cultures.length * samplesPerCulture)))
      }
    }
  } as unknown as WorldContext;
}

it.skipIf(process.env.FOOD_CLIMATE_CALIBRATE !== "1")(
  "samples the extension's actual crop selection and yield without a host runtime dependency",
  () => {
    const world = fixture();
    const areas = calculateAgriculturalLandProfile(world).cultivableArea;
    const irrigation = {
      irrigatedAreaHa: new Float32Array(count),
      irrigationSupplement: new Float32Array(count),
      irrigationDeliveredWater: new Float32Array(count),
      irrigationWaterStress: new Float32Array(count),
      residualFlowByCell: new Float32Array(count),
      allocation: {
        status: "complete" as const,
        allocations: [],
        residualFlowByCell: new Float32Array(count),
        withdrawnFlowByCell: new Float32Array(count),
        diagnostics: []
      }
    };
    const values: number[] = [];
    const targets: number[] = [];
    const rows: string[] = [
      "soil,temperatureC,rainfallMm,supplementMm,irrigatedShare,meanYieldKgHa,p10YieldKgHa,p90YieldKgHa,mainCrops,legumes"
    ];
    let observedCells = 0;
    for (const temp of temperatures) {
      world.grid.cells.temp.fill(temp);
      for (const rain of rainfall) {
        world.grid.cells.prec.fill(rain);
        // Probe viability at each crop's water target through the extension API.
        for (let soil = 0; soil < soils.length; soil++) {
          const id = soil * cultures.length * samplesPerCulture;
          const eligible = crops
            .filter(g => {
              world.grid.cells.prec[id] = g.crop!.precipitation.idealMin;
              irrigation.irrigationSupplement[id] = 0;
              const viable = getCropSuitability(world, id, g, { irrigation }) > 0.1;
              world.grid.cells.prec[id] = rain;
              return viable && g.crop!.precipitation.idealMin > rain;
            })
            .map(g => g.crop!.precipitation.idealMin);
          targets.push(eligible.length ? Math.min(...eligible) : rain);
        }
        for (const extra of water) {
          irrigation.irrigationSupplement.fill(extra);
          for (const share of [0, 1]) {
            irrigation.irrigatedAreaHa.set(areas.map(area => area * share));
            irrigation.irrigationDeliveredWater.set(areas.map(area => area * share * extra));
            const profile = calculateAgriculturalLandProfile(
              world,
              undefined,
              undefined,
              {},
              { cropGoods: crops, irrigation }
            );
            for (let soil = 0; soil < soils.length; soil++) {
              const start = soil * cultures.length * samplesPerCulture;
              const yields = Array.from(
                profile.yieldPerArea.slice(start, start + cultures.length * samplesPerCulture)
              ).sort((a, b) => a - b);
              const mean = yields.reduce((s, v) => s + v, 0) / yields.length;
              values.push(+mean.toFixed(5));
              const main: Record<string, number> = {},
                legumes: Record<string, number> = {};
              for (let i = start; i < start + yields.length; i++)
                for (const entry of getCropMix(world, i, crops, { irrigation })) {
                  const bucket = entry.good.crop!.kind === "legume" ? legumes : main;
                  bucket[entry.good.name] = (bucket[entry.good.name] ?? 0) + 1;
                }
              rows.push(
                [
                  soils[soil],
                  temp,
                  rain * 100,
                  extra * 100,
                  share,
                  mean.toFixed(5),
                  yields[Math.floor(yields.length * 0.1)].toFixed(5),
                  yields[Math.floor(yields.length * 0.9)].toFixed(5),
                  JSON.stringify(main),
                  JSON.stringify(legumes)
                ]
                  .map(v => (typeof v === "string" && v.includes(",") ? `"${v.replaceAll('"', '""')}"` : v))
                  .join(",")
              );
              observedCells += yields.length;
            }
          }
        }
      }
    }
    const fingerprint = createHash("sha256");
    for (const file of sourceFiles) fingerprint.update(readFileSync(resolve(root, file)));
    const data = {
      version: 1,
      sourceHash: fingerprint.digest("hex"),
      observedCells,
      temperatures,
      rainfall,
      water,
      soils,
      cultures,
      samplesPerCulture,
      values,
      targets
    };
    mkdirSync(resolve(root, "docs/calibration"), { recursive: true });
    writeFileSync(resolve(root, "src/data/foodClimateCalibration.json"), JSON.stringify(data));
    writeFileSync(resolve(root, "docs/calibration/food-climate.csv"), `${rows.join("\n")}\n`);
    expect(observedCells).toBeGreaterThan(1000000);
    console.log(
      JSON.stringify({
        observedCells,
        climateCombinations: temperatures.length * rainfall.length * water.length * 2,
        cropNames: crops.map(g => g.name),
        sourceHash: data.sourceHash
      })
    );
  },
  300000
);

it("validates the host estimate on climates and culture/cell pairings excluded from calibration", async () => {
  const { estimateFoodClimateYield } = await import("../../../generators/foodClimateEstimate");
  const world = fixture();
  for (const id of world.pack.cells.i)
    world.pack.cells.culture[id] = (world.pack.cells.culture[id] + 3) % cultures.length;
  const areas = calculateAgriculturalLandProfile(world).cultivableArea;
  const irrigation = {
    irrigatedAreaHa: new Float32Array(count),
    irrigationSupplement: new Float32Array(count),
    irrigationDeliveredWater: new Float32Array(count),
    irrigationWaterStress: new Float32Array(count),
    residualFlowByCell: new Float32Array(count),
    allocation: {
      status: "complete" as const,
      allocations: [],
      residualFlowByCell: new Float32Array(count),
      withdrawnFlowByCell: new Float32Array(count),
      diagnostics: []
    }
  };
  const errors: number[] = [];
  const examples: unknown[] = [];
  for (const temp of [-4, -1, 4, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 32, 34, 35, 37, 39]) {
    world.grid.cells.temp.fill(temp);
    for (const rain of [4, 5, 8, 11, 13, 14, 17, 19, 23, 28, 35, 50, 70, 100]) {
      world.grid.cells.prec.fill(rain);
      for (const extra of [0, 0.75, 1.5, 3, 6, 12])
        for (const share of extra > 0 ? [0.1, 0.5] : [0]) {
          irrigation.irrigationSupplement.fill(extra);
          irrigation.irrigatedAreaHa.set(areas.map(area => area * share));
          const actual = calculateAgriculturalLandProfile(
            world,
            undefined,
            undefined,
            {},
            { cropGoods: crops, irrigation }
          );
          for (let soil = 0; soil < soils.length; soil++) {
            const start = soil * cultures.length * samplesPerCulture;
            const observed =
              actual.yieldPerArea.slice(start, start + cultures.length * samplesPerCulture).reduce((s, v) => s + v, 0) /
              (cultures.length * samplesPerCulture);
            const estimated = estimateFoodClimateYield(temp, rain, soils[soil] as "loam", extra, share);
            errors.push(Math.abs(observed - estimated));
            if (temp === 4 && rain === 5 && extra === 0)
              examples.push({ soil: soils[soil], observedYieldKgHa: observed, estimatedYieldKgHa: estimated });
          }
        }
    }
  }
  errors.sort((a, b) => a - b);
  const validation = {
    comparisons: errors.length,
    meanAbsoluteErrorKgHa: errors.reduce((s, v) => s + v, 0) / errors.length,
    p95AbsoluteErrorKgHa: errors[Math.floor(errors.length * 0.95)],
    maximumAbsoluteErrorKgHa: errors.at(-1),
    examples
  };
  if (process.env.FOOD_CLIMATE_CALIBRATE === "1")
    writeFileSync(
      resolve(root, "docs/calibration/food-climate-validation.json"),
      `${JSON.stringify(validation, null, 2)}\n`
    );
  expect(validation.meanAbsoluteErrorKgHa).toBeLessThan(15);
  expect(validation.p95AbsoluteErrorKgHa).toBeLessThan(30);
}, 300000);

it("keeps the offline table tied to the measured economy model", () => {
  const fingerprint = createHash("sha256");
  for (const file of sourceFiles) fingerprint.update(readFileSync(resolve(root, file)));
  const recorded = JSON.parse(readFileSync(resolve(root, "src/data/foodClimateCalibration.json"), "utf8"));
  expect(recorded.sourceHash).toBe(fingerprint.digest("hex"));
});

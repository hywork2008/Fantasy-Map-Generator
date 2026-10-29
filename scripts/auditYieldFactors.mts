/**
 * Why the staple yield sits below BASE_NET_YIELD (E1-5 §7.84): each fed cell's net yield split into
 * the crop mix's temperature, rainfall, soil and cold-anomaly suitability, the crops' yield
 * multipliers and crop cycles, and a residual (soil fertility, salinity, flood, drought, technology).
 * Cells are weighted by the people their staple plan feeds, since field need per person is 1/yield;
 * factors are weighted geometric means, so they multiply back to the weighted yield ratio.
 * Read-only. Usage: auditYieldFactors.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { WET_TOLERANCE_AT_MAX, type ClimateRange } from "../src/data/stapleCrops";
import { getYieldPerArea } from "../src/extensions/economy/context/agriculture";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods } from "../src/extensions/economy/context/trade";
import { getCellSoilType, getCropMix } from "../src/extensions/economy/generators/agriculturalLandUse";
import { isGoodEnabled } from "../src/extensions/economy/generators/goods-generator";
import { getSeasonalCropPlan, readAgriculturalClimate } from "../src/extensions/economy/generators/seasonalCropClimate";
import { BASE_NET_YIELD_KG_PER_SOWN_HECTARE } from "../src/generators/settlementClearance";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "0"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 0)
  throw new Error("Usage: auditYieldFactors.mts <archive.fmg> <output.json> [months]");

// Same shapes as src/data/stapleCrops.ts (not exported there).
function rangeSuitability(value: number, range: ClimateRange): number {
  if (value <= range.min || value >= range.max) return 0;
  if (value >= range.idealMin && value <= range.idealMax) return 1;
  if (value < range.idealMin) return (value - range.min) / (range.idealMin - range.min);
  return (range.max - value) / (range.max - range.idealMax);
}
function precipitationSuitability(value: number, range: ClimateRange): number {
  if (value <= range.min) return 0;
  if (value < range.idealMin) return (value - range.min) / (range.idealMin - range.min);
  if (value <= range.idealMax) return 1;
  if (value < range.max)
    return 1 - ((1 - WET_TOLERANCE_AT_MAX) * (value - range.idealMax)) / (range.max - range.idealMax);
  return WET_TOLERANCE_AT_MAX * Math.sqrt(range.max / value);
}

const FACTORS = ["temperature", "rainfall", "soilType", "coldAnomaly", "cropMultiplier", "cropCycles", "residual"] as const;
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
  }
  const world = getWorldContext();
  const cells = world.pack.cells;
  const yields = getYieldPerArea();
  const cropGoods = getGoods().filter(good => Boolean(good.crop) && isGoodEnabled(good));
  const logSums: Record<string, number> = Object.fromEntries(FACTORS.map(f => [f, 0]));
  let weight = 0;
  let logYieldRatio = 0;
  const zeroFactorPeople: Record<string, number> = {};
  const mainCropPeople: Record<string, number> = {};
  const rainfallBandPeople: Record<string, number> = {};
  const temperatureBandPeople: Record<string, number> = {};
  for (const budget of Object.values(world.pack.landUse?.cells ?? {})) {
    const cell = budget.sourceCellId;
    const people = budget.foodDemandPeople;
    const y = yields[cell] ?? 0;
    if (!(people > 0) || !(y > 0)) continue;
    const climate = readAgriculturalClimate(world, cell);
    const precipitation = world.grid?.cells.prec?.[cells.g?.[cell] ?? cell] ?? 45;
    const soil = getCellSoilType(world, cell);
    const mix = getCropMix(world, cell, cropGoods);
    if (!mix.length) continue;
    const parts: Record<string, number> = Object.fromEntries(FACTORS.map(f => [f, 0]));
    let cropFactor = 0;
    for (const entry of mix) {
      const crop = entry.good.crop!;
      const plan = crop.calendar ? getSeasonalCropPlan(crop.calendar, climate, false) : undefined;
      const growingTemperature = plan?.growingMeanTemperatureC ?? climate.monthlyMeanTemperatureC[0];
      const t = rangeSuitability(growingTemperature, crop.temperature);
      const p = precipitationSuitability(precipitation, crop.precipitation);
      const s = crop.soils.includes(soil) ? 1 : 0.55;
      const base = t * p * s;
      const cold = base > 0 ? entry.suitability / base : 0;
      const cycles = plan?.calendar.cropCycles ?? 1;
      const values = { temperature: t, rainfall: p, soilType: s, coldAnomaly: cold, cropMultiplier: crop.yieldMultiplier, cropCycles: cycles };
      for (const [k, v] of Object.entries(values)) parts[k] += entry.share * v;
      cropFactor += entry.share * entry.suitability * crop.yieldMultiplier * cycles;
    }
    // Share-weighted means of each factor need not multiply to the share-weighted product exactly;
    // the residual absorbs that and everything outside the crop mix.
    const product = FACTORS.slice(0, 6).reduce((acc, f) => acc * parts[f], 1);
    parts.residual = product > 0 ? y / (BASE_NET_YIELD_KG_PER_SOWN_HECTARE * product) : 0;
    for (const f of FACTORS) {
      if (!(parts[f] > 0)) {
        zeroFactorPeople[f] = (zeroFactorPeople[f] ?? 0) + people;
        continue;
      }
      logSums[f] += people * Math.log(parts[f]);
    }
    weight += people;
    logYieldRatio += people * Math.log(y / BASE_NET_YIELD_KG_PER_SOWN_HECTARE);
    const main = mix.reduce((a, b) => (b.share > a.share ? b : a)).good.name;
    mainCropPeople[main] = (mainCropPeople[main] ?? 0) + people;
    const mm = precipitation * 100;
    const band = mm < 400 ? "<400" : mm < 800 ? "400-800" : mm < 1200 ? "800-1200" : mm < 2000 ? "1200-2000" : mm < 3000 ? "2000-3000" : ">=3000";
    rainfallBandPeople[band] = (rainfallBandPeople[band] ?? 0) + people;
    const tc = climate.monthlyMeanTemperatureC.reduce((a, b) => a + b, 0) / 12;
    const tband = tc < 0 ? "<0" : tc < 5 ? "0-5" : tc < 10 ? "5-10" : tc < 15 ? "10-15" : tc < 20 ? "15-20" : ">=20";
    temperatureBandPeople[tband] = (temperatureBandPeople[tband] ?? 0) + people;
    void cropFactor;
  }
  const geometric = Object.fromEntries(FACTORS.map(f => [f, Math.exp(logSums[f] / weight)]));
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        date: [host.simulation.currentYear, host.simulation.currentMonth],
        notes: [
          "People are the staple plan's food demand people per cell (rural, urban, market).",
          "Factors are people-weighted geometric means of share-weighted crop-mix means; residual = yield / (base x product of the six crop factors).",
          "Rain-fed only: irrigation is folded into the residual. Precipitation is the map's 100 mm proxy, shown in mm."
        ],
        people: weight,
        yieldRatio: Math.exp(logYieldRatio / weight),
        factors: geometric,
        zeroFactorPeople,
        mainCropPeople,
        rainfallBandPeople,
        annualMeanTemperatureBandPeople: temperatureBandPeople
      },
      null,
      1
    )}\n`
  );
} finally {
  host.dispose();
}

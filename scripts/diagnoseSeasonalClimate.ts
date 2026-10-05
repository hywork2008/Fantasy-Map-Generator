#!/usr/bin/env node
/** Read-only .fmg climate diagnostic. node --import tsx scripts/diagnoseSeasonalClimate.ts <archive> [output.json] */
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import JSZip from "jszip";
import type { WorldContext } from "../src/context/worldContext";
import { createCellClimateNormalsReader, ensureCellClimateNormals } from "../src/generators/cellClimateNormals";
import { getDailyMeanTemperatureC } from "../src/utils/earthlikeClimate";
import { getSeasonalTemperatureOffset, isLeapYear } from "../src/utils/seasonUtils";

async function main(): Promise<void> {
const archive = process.argv[2];
if (!archive) throw new Error("Expected an .fmg archive path");
const zip = await JSZip.loadAsync(readFileSync(archive));
const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
const arrays = new Map<string, ArrayBufferView>();
const constructors: Record<string, (buffer: ArrayBuffer) => ArrayBufferView> = {
  Int8Array: b => new Int8Array(b), Uint8Array: b => new Uint8Array(b), Uint8ClampedArray: b => new Uint8ClampedArray(b),
  Int16Array: b => new Int16Array(b), Uint16Array: b => new Uint16Array(b), Int32Array: b => new Int32Array(b),
  Uint32Array: b => new Uint32Array(b), Float32Array: b => new Float32Array(b), Float64Array: b => new Float64Array(b)
};
for (const descriptor of manifest.typedArrays) {
  const bytes = await zip.file(descriptor.path)!.async("uint8array");
  const buffer = Uint8Array.from(bytes).buffer;
  const construct = constructors[descriptor.type];
  if (!construct) throw new Error(`Unsupported typed array ${descriptor.type}`);
  arrays.set(descriptor.path, construct(buffer));
}
const parse = async (entry: string) => JSON.parse(await zip.file(entry)!.async("string"), (_key, value) =>
  value?.$typedArray ? arrays.get(value.$typedArray) : value);
const world = await parse("map/world.json") as WorldContext;
const simulation = await parse("simulation/core.json");
const year = simulation.currentYear;
const start = performance.now();
const state = ensureCellClimateNormals(world, year);
const generationMs = performance.now() - start;
const trials = 20;
const repeatedStart = performance.now();
for (let i = 0; i < trials; i++) ensureCellClimateNormals(world, year);
const validationMs = (performance.now() - repeatedStart) / trials;
const monthlyStart = performance.now();
const display = new Int8Array(world.grid.cells.i.length);
for (let i = 0; i < trials; i++) {
  for (const cell of world.grid.cells.i) display[cell] = Math.round(state.monthly[cell * 12 + simulation.currentMonth - 1]);
}
const displayMs = (performance.now() - monthlyStart) / trials;
const read = createCellClimateNormalsReader(world, year);
const cells = [1273, 1274, 1275].map(cell => {
  const gridCell = world.pack.cells.g[cell];
  const normal = read(gridCell)!;
  let daysAbove5C = 0;
  let growingDegreeDaysBase5C = 0;
  for (let day = 0; day < (isLeapYear(year) ? 366 : 365); day++) {
    const temperature = getDailyMeanTemperatureC(normal, day + 0.5);
    if (temperature > 5) daysAbove5C++;
    growingDegreeDaysBase5C += Math.max(0, temperature - 5);
  }
  const priorMonthlyPointTemperatures = Array.from({ length: 12 }, (_, month) => normal.annualMeanTemperatureC +
    getSeasonalTemperatureOffset(normal.latitudeDeg, year, month + 1, 21, world.options, world.options.axialTilt));
  const landUse = simulation.landUse ?? {};
  return { cell, gridCell, coordinates: { latitude: normal.latitudeDeg, longitude: normal.longitudeDeg },
    annualMeanTemperatureC: normal.annualMeanTemperatureC,
      savedSeasonalTemperatureC: world.grid.cells.seasonalTemp?.[gridCell], continentality: normal.continentality,
    continentalitySource: normal.continentalitySource,
    oldMonthlyPointTemperaturesDay21C: priorMonthlyPointTemperatures,
    monthlyMeanTemperatureC: Array.from(normal.monthlyMeanTemperatureC),
    annualPrecipitationMm: normal.annualPrecipitationMm, monthlyPrecipitationMm: Array.from(normal.monthlyPrecipitationMm),
    daysAbove5C, growingDegreeDaysBase5C,
    riverId: world.pack.cells.r[cell], riverFluxProxy: world.pack.cells.fl[cell],
    areaMapUnits: world.pack.cells.area[cell],
    savedSubsistenceCapacity: world.pack.cells.subsistenceCapacity?.[cell],
    savedNonAgriculturalCapacity: world.pack.cells.subsistenceNonAgriculturalCapacity?.[cell],
    landUse: Object.fromEntries(Object.entries(landUse).filter(([, v]) => ArrayBuffer.isView(v)).map(([key, v]) => [key, (v as unknown as ArrayLike<number>)[cell]]))
  };
});
const result = { archive, modelVersion: "earthlike-seasonal-v1", coefficientStatus: "uncalibratedCandidate", year,
  performance: { cells: world.grid.cells.i.length, generationMs, validationMs, displayMs,
    monthlyCacheBytes: state.monthly.byteLength, continentalityCacheBytes: state.geography.continentality.byteLength }, cells };
const json = `${JSON.stringify(result, null, 2)}\n`;
if (process.argv[3]) writeFileSync(process.argv[3], json);
else console.log(json);

}
main().catch(error => { console.error(error); process.exitCode = 1; });

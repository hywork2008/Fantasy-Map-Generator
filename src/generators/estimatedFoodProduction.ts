import { simulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createCellClimateNormalsReader } from "./cellClimateNormals";
import { type EstimatedFoodSoil, estimateFoodClimateYield, estimateFoodWaterTarget } from "./foodClimateEstimate";
import { allocateRiverWater, compileRiverWaterNetwork, type RiverWithdrawal } from "./riverWaterAllocation";

/** Low-investment village irrigation scenario; values recorded in the offline calibration report. */
const IRRIGATION_COMMAND_SHARE = 0.1;
const CONVEYANCE_EFFICIENCY = 0.4;
const ANNUAL_WATER_PER_FLUX = 30;
const ENVIRONMENTAL_FLOW_RESERVE = 0.55;

export function getEstimatedFoodSoil(world: Readonly<WorldContext>, id: number): EstimatedFoodSoil {
  const cells = world.pack.cells;
  const tags = world.biomesData.tags?.[cells.biomeCode[id]] ?? [];
  if (cells.r?.[id]) return "alluvial";
  if (tags.includes("wetland")) return "clay";
  if (tags.includes("forest")) return "humus";
  if (tags.includes("desert")) return "sandy";
  if (tags.includes("mountain")) return "thin";
  return "loam";
}

/** Host-only estimate. The extension is consulted exclusively by the offline calibration tool. */
export function estimateCellFoodProduction(world: Readonly<WorldContext>, potentialLand = false) {
  const cells = world.pack.cells;
  const count = cells.i.length;
  const cultivableAreaHa = new Float32Array(count);
  const yieldKgPerHa = new Float32Array(count);
  const deliveredWater = new Float32Array(count);
  const deficits = new Float32Array(count);
  const network = compileRiverWaterNetwork({
    pack: { cells: { ...cells, fl: cells.fl ?? new Uint16Array(count) }, rivers: world.pack.rivers ?? [] },
    annualWaterPerFlux: ANNUAL_WATER_PER_FLUX
  });
  const readClimate =
    world.grid.cells.i?.length && world.grid.points?.length && world.graphHeight > 0
      ? createCellClimateNormalsReader(world as WorldContext, simulationContext.currentYear || 2001)
      : undefined;
  const amplitudes = new Float32Array(count);
  const demands: RiverWithdrawal[] = [];
  for (const id of cells.i) {
    const height = cells.h[id];
    if (height < 20 || (world.biomesData.habitability?.[cells.biomeCode[id]] ?? 0) <= 0) continue;
    const tags = world.biomesData.tags?.[cells.biomeCode[id]] ?? [];
    const physical = Math.max(0, cells.area?.[id] ?? 0) * (world.distanceScale || 1) ** 2 * 100;
    const terrainShare = height <= 50 ? 0.9 : Math.max(0.2, 0.9 - (height - 50) / 90);
    const biomeShare = tags.includes("wetland")
      ? 0.35
      : tags.includes("desert")
        ? 0.2
        : tags.includes("mountain")
          ? 0.3
          : tags.includes("grassland") || tags.includes("arable")
            ? 0.8
            : 0.7;
    const burg = world.pack.burgs?.[cells.burg?.[id] ?? 0];
    const built =
      burg && !burg.removed
        ? (Math.max(0, burg.population ?? 0) * (world.populationRate || 1) * (world.urbanization ?? 1)) / 50
        : 0;
    const ceiling = Math.max(0, physical * terrainShare * biomeShare - built);
    const established = world.pack.landUse?.cells[id]?.allocatedAreaHa;
    const forest = Math.max(0, Math.min(1, cells.forestCover?.[id] ?? (tags.includes("forest") ? 0.7 : 0)));
    const area = potentialLand ? ceiling : Math.min(ceiling, established ?? physical * (1 - forest));
    cultivableAreaHa[id] = area;
    const grid = cells.g?.[id] ?? id;
    const monthly = readClimate?.(grid)?.monthlyMeanTemperatureC;
    amplitudes[id] = monthly ? (Math.max(...monthly) - Math.min(...monthly)) / 2 : 0;
    const temp = world.grid.cells.temp?.[grid] ?? 12;
    const rain = world.grid.cells.prec?.[grid] ?? 0;
    const deficit = Math.max(
      0,
      estimateFoodWaterTarget(temp, rain, getEstimatedFoodSoil(world, id), amplitudes[id]) - rain
    );
    deficits[id] = deficit;
    const intake = network.intakeByFieldCell[id];
    if (!intake || area <= 0 || deficit <= 0) continue;
    const request = (area * IRRIGATION_COMMAND_SHARE * deficit) / CONVEYANCE_EFFICIENCY;
    demands.push({
      id: `estimated-food:${id}`,
      intake,
      beneficiaryCellId: id,
      requestedWithdrawal: request,
      maximumWithdrawal: request,
      conveyanceEfficiency: CONVEYANCE_EFFICIENCY,
      priority: 100
    });
  }
  const allocation = allocateRiverWater(network, demands, { environmentalFlowReserve: ENVIRONMENTAL_FLOW_RESERVE });
  for (const result of allocation.allocations)
    deliveredWater[result.beneficiaryCellId] = Math.max(0, result.deliveredWater);
  for (const id of cells.i) {
    const grid = cells.g?.[id] ?? id;
    const area = cultivableAreaHa[id];
    const deficit = deficits[id];
    const irrigatedShare =
      area > 0 && deficit > 0 ? Math.min(IRRIGATION_COMMAND_SHARE, deliveredWater[id] / deficit / area) : 0;
    yieldKgPerHa[id] = estimateFoodClimateYield(
      world.grid.cells.temp?.[grid] ?? 12,
      world.grid.cells.prec?.[grid] ?? 0,
      getEstimatedFoodSoil(world, id),
      irrigatedShare > 0 ? deficit : 0,
      irrigatedShare,
      amplitudes[id]
    );
  }
  return { cultivableAreaHa, yieldKgPerHa, deliveredWater, allocation };
}

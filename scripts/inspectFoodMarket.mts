/** Read-only initial market hinterland and pure-route reachability; never advances the world. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost } from "../src/simulation/adapters/node";
import { buildLandRouteGraph, buildSeaRouteGraph, findLandRouteDistance, findSeaRouteDistance } from "../src/extensions/hostCore";
import { getMarkets, getGoods } from "../src/extensions/economy/context/trade";
import { getMarketCellColumn } from "../src/extensions/economy/context/cellTables";
import { getCultivableArea, getCultivatedArea, getFoodPotential, getCropLaborCoverage } from "../src/extensions/economy/context/agriculture";
import { getCurrentCropMix, getCropHarvestWeight } from "../src/extensions/economy/generators/production-utils";

const [input, output, marketArg, monthArg = "7"] = process.argv.slice(2);
const marketId = Number(marketArg), routeMonth = Number(monthArg);
if (!input || !output || !Number.isSafeInteger(marketId) || !Number.isInteger(routeMonth) || routeMonth < 1 || routeMonth > 12)
  throw new Error("Usage: inspectFoodMarket.mts input.fmg output.json marketId [routeMonth=7]");
const bytes = readFileSync(input);
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  const world = host.world, cells = world.pack.cells;
  const market = getMarkets().find(market => market.i === marketId);
  if (!market) throw new Error(`Missing market ${marketId}`);
  const hub = world.pack.burgs[market.centerBurgId];
  const crops = getGoods().filter(good => good.crop);
  const ids = Array.from(cells.i).filter(id => getMarketCellColumn()[id] === marketId && cells.h[id] >= 20);
  const cultivable = getCultivableArea(), cultivated = getCultivatedArea(), potential = getFoodPotential(), coverage = getCropLaborCoverage();
  const cropMix: Record<string, number> = {};
  const weights = Array(12).fill(0);
  let zeroMix = 0, population = 0, area = 0, beforeLabor = 0, afterLabor = 0;
  for (const id of ids) {
    const mix = getCurrentCropMix(world, id, crops);
    const output = potential[id] * (cultivable[id] > 0 ? Math.max(0, Math.min(1, cultivated[id] / cultivable[id])) : 0);
    beforeLabor += output;
    afterLabor += output * (coverage[id] ?? 1);
    population += Math.max(0, cells.pop[id]) * world.populationRate;
    area += cultivated[id];
    if (!mix.length) zeroMix++;
    for (const entry of mix) {
      cropMix[entry.good.name] = (cropMix[entry.good.name] ?? 0) + entry.share * output;
      for (let month = 1; month <= 12; month++)
        weights[month - 1] += output * (coverage[id] ?? 1) * entry.share * (getCropHarvestWeight(entry.good, id, month, entry.irrigated) ?? 0);
    }
  }
  const land = buildLandRouteGraph(world.pack, {month: routeMonth, mapCoordinates: world.mapCoordinates, graphHeight: world.graphHeight});
  const sea = buildSeaRouteGraph(world.pack);
  const towns = world.pack.burgs.filter(burg => burg?.i && !burg.removed && burg.market === marketId);
  const reachability = towns.map(burg => ({
    burgId: burg.i, name: burg.name,
    reachablePureRouteMarkets: getMarkets().filter(other => other.i !== marketId).filter(other => {
      const origin = world.pack.burgs[other.centerBurgId];
      return origin && !origin.removed && (findLandRouteDistance(land, origin.cell, burg.cell) !== null || findSeaRouteDistance(sea, origin.cell, burg.cell) !== null);
    }).map(other => other.i)
  }));
  writeFileSync(output, `${JSON.stringify({
    input, inputSha256: hash(bytes), inspectorSha256: hash(readFileSync("scripts/inspectFoodMarket.mts")),
    date: [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay],
    marketId, hubBurgId: hub.i, hubCell: hub.cell, routeMonth,
    note: "Prepared initial columns and crop-calendar forecast, not measured annual production. Pure land OR pure sea reachability uses charted routes in the stated month. Distances are map units.",
    localProduction: {cells: ids.length, zeroMix, population, cultivatedHa: area,
      annualHarvestBeforeLabor: beforeLabor, annualHarvestAfterLabor: afterLabor,
      annualCropMixBeforeLabor: cropMix, monthlyHarvestForecast: weights},
    ports: towns.filter(burg => burg.port).map(burg => ({burgId: burg.i, name: burg.name, cell: burg.cell,
      roadDistanceFromHub: hub.cell === burg.cell ? 0 : findLandRouteDistance(land, hub.cell, burg.cell)})),
    reachability
  }, null, 2)}\n`);
} finally {
  host.dispose();
}

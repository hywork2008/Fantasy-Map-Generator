import { createCellClimateNormalsReader } from "../../hostCore";
import { getGoods, getMarkets, getSimulationMonth, getSimulationYear, getWorldContext } from "../economyContext";
import { getBasicWorkersByBurg, getChildLabourEquivalent, getCraftWorkforce } from "./craftWorkforce";
import type { Good } from "./goods-generator";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { Market } from "./marketTypes";
import {
  getPeatGood,
  PEAT_HEAT_PER_BALE,
  SALT_BOILING_WOOD_KG_PER_KG,
  SALT_BOILING_WOOD_PILES_PER_BAG
} from "./peatFuel";
import { paySaltInputs, saltInvoice, saltOwnerCash } from "./saltFinance";
import type { Saltworks } from "./saltLogisticsTypes";
import { getSaltworksOperator } from "./saltOwnership";
import { readAgriculturalClimate } from "./seasonalCropClimate";
import { getSubsistenceWage } from "./subsistenceWage";

/** Explicit planning assumptions, not universal historical yields. See salt-logistics.md. */
export const SALT_PRODUCTION_POLICY = {
  hoursPerWorkerMonth: 160,
  solarHoursPerKg: 0.1,
  miningHoursPerKg: 0.5,
  // Medieval lead pans (docs/analytics/saltworks-boiling-labour-sources-20261031.md): shore works
  // gathering and washing salted sand for their brine about 0.2-0.4 h/kg; a strong brine spring
  // such as Lüneburg about 0.05-0.21 h/kg. The former 82 h / 34.5 kg was a prehistoric briquetage trial.
  boilingHoursPerKg: 0.3,
  brineBoilingHoursPerKg: 0.15,
  boilingWoodKgPerKg: SALT_BOILING_WOOD_KG_PER_KG
} as const;

/** Evaporation proxy; precipitation seasonality is the host's uniform assumption. */
export function saltSolarWeights(temperatures: ArrayLike<number>, rainMm: ArrayLike<number>): number[] {
  const potential = Array.from({ length: 12 }, (_, m) =>
    Math.max(0, ((temperatures[m] ?? 0) - 10) * 6 - (rainMm[m] ?? 0))
  );
  const total = potential.reduce((a, b) => a + b, 0);
  return potential.map(value => (total > 0 ? value / total : 0));
}

/** One cycle's common urban labor pool. Rural sites hire crews from their connected market.
 * Never claim unmeasured rural slack already allocated to crops, mines or household crafts.
 */
export function createSaltProductionBudget() {
  const world = getWorldContext();
  const basic = getBasicWorkersByBurg(world.pack.burgs);
  const childEquivalent = getChildLabourEquivalent();
  const remaining = new Map<number, number>();
  const charged = new Map<number, number>();
  for (const burg of world.pack.burgs) {
    if (!burg?.i || burg.removed || !burg.market) continue;
    remaining.set(burg.i ?? 0, getCraftWorkforce(burg, basic.get(burg.i) ?? 0, childEquivalent));
  }
  const rate = Math.max(1, world.populationRate ?? 1);
  const hostClimate =
    world.grid?.cells?.i?.length && world.grid.points?.length && world.graphHeight > 0
      ? createCellClimateNormalsReader(world, getSimulationYear() || 2001)
      : undefined;
  const weightsByCell = new Map<number, number[]>();
  const solarWeights = (cell: number) => {
    let weights = weightsByCell.get(cell);
    if (!weights) {
      const climate = hostClimate?.(world.pack.cells.g?.[cell] ?? cell);
      weights = saltSolarWeights(
        climate?.monthlyMeanTemperatureC ?? readAgriculturalClimate(world, cell).monthlyMeanTemperatureC,
        climate?.monthlyPrecipitationMm ?? new Float64Array(12)
      );
      weightsByCell.set(cell, weights);
    }
    return weights;
  };
  const inputs = (operation: Saltworks) => {
    const hoursPerKg =
      operation.productionMethod === "solar"
        ? SALT_PRODUCTION_POLICY.solarHoursPerKg
        : operation.productionMethod === "mining"
          ? SALT_PRODUCTION_POLICY.miningHoursPerKg
          : operation.kind === "brineWell"
            ? SALT_PRODUCTION_POLICY.brineBoilingHoursPerKg
            : SALT_PRODUCTION_POLICY.boilingHoursPerKg;
    const pointsPerBag = (60 * hoursPerKg) / SALT_PRODUCTION_POLICY.hoursPerWorkerMonth / rate;
    const market = getMarkets().find(m => m.i === operation.marketId);
    const boiling = operation.productionMethod === "boiling";
    // Boiling burns the cheaper of Wood and Peat for the heat first (saltworks-fuel-procurement.md §2).
    const fuels = boiling ? saltFuelOptions(market) : [];
    const fuelPerBag = boiling ? SALT_BOILING_WOOD_PILES_PER_BAG : 0;
    const wagesPerBag = ((pointsPerBag * rate) / 1000) * getSubsistenceWage(market);
    const fuelCostPerBag = (fuels.find(fuel => fuel.stock > 0) ?? fuels[0])?.costPerBag ?? 0;
    return { pointsPerBag, market, fuels, fuelPerBag, wagesPerBag, fuelCostPerBag };
  };
  return {
    charged,
    unitCost(operation: Saltworks): number {
      const input = inputs(operation);
      return input.wagesPerBag + input.fuelCostPerBag;
    },
    capacity(operation: Saltworks): number {
      const weights = solarWeights(operation.cellId);
      operation.productionMethod =
        operation.kind === "rockSaltMine"
          ? "mining"
          : operation.kind === "saltPan" && weights.some(w => w > 0)
            ? "solar"
            : "boiling";
      operation.monthlyLaborHours = 0;
      operation.monthlyFuelWoodUnits = 0;
      operation.settlementOwner = { ...getSaltworksOperator(operation) };
      operation.monthlyWagesPaid = 0;
      operation.monthlyFuelPaid = 0;
      operation.monthlyWholesaleReceived = 0;
      operation.monthlyFreightPaid = 0;
      operation.monthlyCapacityBags =
        Math.max(0, operation.annualCapacityBags) *
        (operation.productionMethod === "solar" ? weights[Math.max(0, (getSimulationMonth() || 1) - 1)] : 1 / 12);
      return operation.monthlyCapacityBags;
    },
    produce(operation: Saltworks, requestedBags: number): number {
      const crews = world.pack.burgs.filter(b => b?.i && !b.removed && b.market === operation.marketId);
      const availablePoints = crews.reduce((sum, b) => sum + (remaining.get(b.i ?? 0) ?? 0), 0);
      const { pointsPerBag, market, fuels, fuelPerBag, wagesPerBag, fuelCostPerBag } = inputs(operation);
      if (!market) return 0;
      // Fund at the dearest fuel in stock, since the cheaper may run out part-way.
      const fundedFuelPerBag = Math.max(
        fuelCostPerBag,
        ...fuels.filter(fuel => fuel.stock > 0).map(fuel => fuel.costPerBag)
      );
      const cashLimit = Math.max(0, saltOwnerCash(operation) - 0.02) / Math.max(1e-12, wagesPerBag + fundedFuelPerBag);
      const output = Math.max(
        0,
        Math.min(
          requestedBags,
          cashLimit,
          availablePoints / pointsPerBag,
          fuelPerBag > 0 ? fuels.reduce((sum, fuel) => sum + fuel.stock / fuel.unitsPerBag, 0) : Infinity
        )
      );
      if (!(output > 0)) return 0;
      const wages = saltInvoice(output * wagesPerBag);
      // Draw the cheaper fuel first, the dearer for what it cannot cover.
      let bagsLeft = fuelPerBag > 0 ? output : 0;
      let fuelBill = 0;
      const burned: { fuel: SaltFuel; units: number }[] = [];
      for (const fuel of fuels) {
        if (bagsLeft <= 0) break;
        const bags = Math.min(bagsLeft, fuel.stock / fuel.unitsPerBag);
        if (!(bags > 0)) continue;
        burned.push({ fuel, units: bags * fuel.unitsPerBag });
        fuelBill += bags * fuel.costPerBag;
        bagsLeft -= bags;
      }
      const fuelCost = saltInvoice(fuelBill);
      paySaltInputs(
        operation,
        market,
        wages,
        fuelCost,
        crews.map(b => ({ burgId: b.i!, share: (remaining.get(b.i ?? 0) ?? 0) / availablePoints }))
      );
      const points = output * pointsPerBag;
      for (const burg of crews) {
        const available = remaining.get(burg.i ?? 0) ?? 0;
        const share = (points * available) / availablePoints;
        remaining.set(burg.i ?? 0, Math.max(0, available - share));
        charged.set(burg.i ?? 0, (charged.get(burg.i ?? 0) ?? 0) + share);
      }
      operation.monthlyLaborHours =
        (operation.monthlyLaborHours ?? 0) + points * rate * SALT_PRODUCTION_POLICY.hoursPerWorkerMonth;
      for (const { fuel, units } of burned) {
        fuel.row.stock = Math.max(0, fuel.row.stock - units);
        // Fuel use stays counted in Wood piles of heat.
        operation.monthlyFuelWoodUnits = (operation.monthlyFuelWoodUnits ?? 0) + units * fuel.heatPerUnit;
        recordGoodFlow({
          direction: "sink",
          category: "recipeInput",
          goodId: fuel.goodId,
          units,
          marketId: operation.marketId
        });
      }
      return output;
    }
  };
}

interface SaltFuel {
  goodId: number;
  row: { stock: number; price: number };
  /** Wood piles of heat one unit gives. */
  heatPerUnit: number;
  unitsPerBag: number;
  costPerBag: number;
  stock: number;
}

/** The market's boiling fuels, cheapest for a bag's heat first. */
function saltFuelOptions(market: Market | undefined): SaltFuel[] {
  if (!market) return [];
  const options: SaltFuel[] = [];
  const add = (good: Good | undefined, heatPerUnit: number) => {
    if (!good) return;
    market.goods[good.i] ??= { stock: 0, price: good.value };
    const row = market.goods[good.i];
    const unitsPerBag = SALT_BOILING_WOOD_PILES_PER_BAG / heatPerUnit;
    options.push({
      goodId: good.i,
      row,
      heatPerUnit,
      unitsPerBag,
      costPerBag: unitsPerBag * Math.max(0, row.price ?? good.value),
      stock: Math.max(0, row.stock ?? 0)
    });
  };
  add(
    getGoods().find(g => g.name === "Wood" && isGoodEnabled(g)),
    1
  );
  add(getPeatGood(), PEAT_HEAT_PER_BALE);
  return options.sort((a, b) => a.costPerBag - b.costPerBag || a.goodId - b.goodId);
}

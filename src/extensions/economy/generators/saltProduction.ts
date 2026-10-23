import { createCellClimateNormalsReader } from "../../hostCore";
import { getGoods, getMarkets, getSimulationMonth, getSimulationYear, getWorldContext } from "../economyContext";
import { getBasicWorkersByBurg, getChildLabourEquivalent, getCraftWorkforce } from "./craftWorkforce";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { paySaltInputs, saltInvoice, saltOwnerCash } from "./saltFinance";
import type { Saltworks } from "./saltLogisticsTypes";
import { getSaltworksOwner } from "./saltOwnership";
import { readAgriculturalClimate } from "./seasonalCropClimate";
import { getSubsistenceWage } from "./subsistenceWage";
import { WOOD_KG_PER_LOT } from "./woodRecipeContracts";

/** Explicit planning assumptions, not universal historical yields. See salt-logistics.md. */
export const SALT_PRODUCTION_POLICY = {
  hoursPerWorkerMonth: 160,
  solarHoursPerKg: 0.1,
  miningHoursPerKg: 0.5,
  boilingHoursPerKg: 82 / 34.5,
  boilingWoodKgPerKg: 60 / 34.5
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
          : SALT_PRODUCTION_POLICY.boilingHoursPerKg;
    const pointsPerBag = (60 * hoursPerKg) / SALT_PRODUCTION_POLICY.hoursPerWorkerMonth / rate;
    const market = getMarkets().find(m => m.i === operation.marketId);
    const wood = getGoods().find(g => g.name === "Wood" && isGoodEnabled(g));
    const fuel = wood && market?.goods[wood.i];
    const fuelPerBag =
      operation.productionMethod === "boiling" ? (60 * SALT_PRODUCTION_POLICY.boilingWoodKgPerKg) / WOOD_KG_PER_LOT : 0;
    const wagesPerBag = ((pointsPerBag * rate) / 1000) * getSubsistenceWage(market);
    const fuelCostPerBag = fuelPerBag * Math.max(0, fuel?.price ?? wood?.value ?? 0);
    return { pointsPerBag, market, wood, fuel, fuelPerBag, wagesPerBag, fuelCostPerBag };
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
      operation.settlementOwner = { ...getSaltworksOwner(operation) };
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
      const { pointsPerBag, market, wood, fuel, fuelPerBag, wagesPerBag, fuelCostPerBag } = inputs(operation);
      if (!market) return 0;
      const cashLimit = Math.max(0, saltOwnerCash(operation) - 0.02) / Math.max(1e-12, wagesPerBag + fuelCostPerBag);
      const output = Math.max(
        0,
        Math.min(
          requestedBags,
          cashLimit,
          availablePoints / pointsPerBag,
          fuelPerBag > 0 ? Math.max(0, fuel?.stock ?? 0) / fuelPerBag : Infinity
        )
      );
      if (!(output > 0)) return 0;
      const wages = saltInvoice(output * wagesPerBag);
      const fuelCost = saltInvoice(output * fuelCostPerBag);
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
      if (fuel && wood && fuelPerBag > 0) {
        const units = output * fuelPerBag;
        fuel.stock = Math.max(0, fuel.stock - units);
        operation.monthlyFuelWoodUnits = (operation.monthlyFuelWoodUnits ?? 0) + units;
        recordGoodFlow({
          direction: "sink",
          category: "recipeInput",
          goodId: wood.i,
          units,
          marketId: operation.marketId
        });
      }
      return output;
    }
  };
}

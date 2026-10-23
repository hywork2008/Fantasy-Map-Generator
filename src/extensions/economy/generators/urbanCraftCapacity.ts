/** Actual city work budgets for assessing future private textile commissions. Never assigns work. */
import {
  getGoods,
  getOrCreateUrbanCraftCapacityTable,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext
} from "../economyContext";
import { getGoodDemandCalibration } from "./craftDemandCalibration";
import { pointsToPeople } from "./craftScale";
import { isGoodEnabled } from "./goods-generator";
import { getRuralTextileChains } from "./ruralTextileChains";
import type { UrbanCraftCapacity } from "./urbanCraftCapacityTypes";

export function recordUrbanCraftCapacity(
  burgId: number,
  marketId: number,
  workforcePoints: number,
  chargedPoints: number,
  textilePoints: number,
  calibrated: boolean,
  productionDiagnostics?: UrbanCraftCapacity["productionDiagnostics"]
): void {
  const table = getOrCreateUrbanCraftCapacityTable();
  if (!table || !burgId) return;
  const workforce = Math.max(0, workforcePoints);
  const charged = Math.max(0, chargedPoints);
  table[burgId] = {
    burgId,
    marketId,
    year: getSimulationYear(),
    month: getSimulationMonth(),
    calibrated,
    productionDiagnostics,
    populationRate: Math.max(1, getWorldContext().populationRate || 1),
    workforcePoints: workforce,
    chargedPoints: charged,
    unusedPoints: Math.max(0, workforce - charged),
    overusedPoints: Math.max(0, charged - workforce),
    textilePoints: Math.max(0, textilePoints)
  };
}

/** Ignore removed/moved towns and observations older than the latest monthly cycle. */
export function getUrbanCraftCapacityRecords(): UrbanCraftCapacity[] {
  const world = getWorldContext();
  const period = getSimulationYear() * 12 + getSimulationMonth() - 1;
  return Object.values(getOrCreateUrbanCraftCapacityTable() ?? {}).filter(row => {
    const burg = world.pack.burgs[row.burgId];
    const age = period - (row.year * 12 + row.month - 1);
    return burg?.i && !burg.removed && burg.market === row.marketId && age >= 0 && age <= 1;
  });
}

/**
 * Alternative handwork references using only uncharged labor. No materials, cash, skills, machinery,
 * workshop limits or delivery are assumed. Every entry competes for the SAME unused work budget.
 * Legacy uncalibrated attempts cannot be interpreted as calibrated textile labor, so return null.
 */
export function getUrbanTextileHandworkReference(row: UrbanCraftCapacity): Record<string, number> | null {
  if (!row.calibrated) return null;
  const unusedPeople = pointsToPeople(row.unusedPoints, row.populationRate);
  const goods = getGoods().filter(isGoodEnabled);
  const chains = getRuralTextileChains(goods);
  const result: Record<string, number> = {};
  for (const name of ["Wool Garments", "Wool Blankets"]) {
    for (const weaves of [true, false]) {
      const chain = chains.find(candidate => candidate.product.name === name && candidate.weavesCloth === weaves);
      if (chain) result[`${name}:${weaves ? "fullChain" : "tailoring"}`] = unusedPeople / chain.laborPerProduct;
    }
  }
  const cloth = goods.find(good => good.name === "Wool Cloth");
  const labor = (getGoodDemandCalibration("Wool Cloth")?.laborPointsPerLotAtDefaultRate ?? 0) * 1000;
  if (cloth && labor > 0) result["Wool Cloth:weaving"] = unusedPeople / labor;
  return result;
}

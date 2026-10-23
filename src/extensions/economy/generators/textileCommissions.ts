/** Rural households own paid cloth and receive private products; cities earn only the tailoring fee. */
import { rn } from "../../hostUtils";
import {
  getGoods,
  getOrCreateTextileCommissionTable,
  getSimulationMonth,
  getSimulationYear,
  getStrategicLaborMarkets
} from "../economyContext";
import { creditHouseholdWealth } from "./burgMarketLedgers";
import { laborPointsForLots } from "./craftDemandCalibration";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { debitRuralHouseholdWealth, getRuralHouseholdWealth } from "./householdWealth";
import type { Market } from "./marketTypes";
import { getRuralTextileChains } from "./ruralTextileChains";
import type { RuralTextileProduction } from "./ruralTextileProduction";
import { getManufactureWageRate } from "./strategicLaborMarkets";
import { getSubsistenceWage } from "./subsistenceWage";
import type { TextileCommissionLedger } from "./textileCommissionTypes";
import { getBeddingCashBudget } from "./textileHouseholdPolicy";
import { HOUSEHOLD_GARMENT_NAMES } from "./textileRecipeContracts";
import { getUrbanCraftCapacityRecords } from "./urbanCraftCapacity";

export interface TextileCommissionRequest {
  budget: number;
  garmentNeed: number;
  wardrobeNeed: number;
  wardrobePrice: number;
  blanketNeed: number;
  blanketStock: number;
  blanketPrice: number;
}

/** Only current-cycle, calibrated, unused work can serve these immediate paid orders. */
function runTextileCommissions(
  market: Market,
  home: RuralTextileProduction,
  request: TextileCommissionRequest,
  estimate: boolean,
  onLaborUsed?: (burgId: number, points: number) => void
): TextileCommissionLedger {
  const year = getSimulationYear();
  const month = getSimulationMonth();
  const result: TextileCommissionLedger = {
    marketId: market.i,
    year,
    month,
    garments: 0,
    blankets: 0,
    garmentSpending: 0,
    blanketSpending: 0,
    materialSpending: 0,
    serviceSpending: 0,
    jobs: []
  };
  const table = getOrCreateTextileCommissionTable();
  if (!table || (table[market.i]?.year === year && table[market.i]?.month === month)) return result;
  if (!estimate) table[market.i] = result;
  const workers = getUrbanCraftCapacityRecords()
    .filter(
      row =>
        row.marketId === market.i && row.year === year && row.month === month && row.calibrated && row.unusedPoints > 0
    )
    .sort((a, b) => a.burgId - b.burgId)
    .map(row => (estimate ? { ...row } : row));
  const laborMarket = getStrategicLaborMarkets().find(row => row.marketId === market.i);
  const chains = getRuralTextileChains(getGoods().filter(isGoodEnabled)).filter(chain => !chain.weavesCloth);
  chains.sort(
    (a, b) =>
      Number(b.product.name !== "Wool Blankets") - Number(a.product.name !== "Wool Blankets") ||
      a.clothPerProduct * (market.goods[a.input.i]?.price ?? Infinity) -
        b.clothPerProduct * (market.goods[b.input.i]?.price ?? Infinity)
  );
  const previewStocks = new Map<number, { stock: number; price: number }>();
  let cash = Math.max(
    0,
    getRuralHouseholdWealth(market) - (estimate ? home.garmentSpending + home.blanketSpending : 0)
  );
  for (const chain of chains) {
    const garment = HOUSEHOLD_GARMENT_NAMES.has(chain.product.name);
    for (const worker of workers) {
      const row = market.goods[chain.cloth.i];
      if (estimate && row && !previewStocks.has(chain.cloth.i))
        previewStocks.set(chain.cloth.i, {
          price: row.price,
          stock: Math.max(0, row.stock - (home.inputOrders?.[chain.cloth.i] ?? 0))
        });
      const stock = estimate ? previewStocks.get(chain.cloth.i) : row;
      if (!stock || !(stock.price > 0) || !Number.isFinite(stock.price)) continue;
      const wage = getManufactureWageRate(laborMarket, chain.product, getSubsistenceWage(market));
      if (!(wage > 0) || !Number.isFinite(wage)) continue;
      const workPerLot = laborPointsForLots(chain.product.name, 1, worker.populationRate);
      const materialPerLot = stock.price * chain.clothPerProduct;
      const servicePerLot = workPerLot * wage;
      const remainingBudget = Math.max(
        0,
        request.budget - home.garmentSpending - home.blanketSpending - result.garmentSpending - result.blanketSpending
      );
      const beddingBudget = Math.max(
        0,
        getBeddingCashBudget(
          request.budget,
          request.wardrobeNeed,
          request.wardrobePrice,
          home.garments + result.garments,
          home.garmentSpending + result.garmentSpending
        ) -
          home.blanketSpending -
          result.blanketSpending
      );
      const need = garment
        ? Math.max(0, request.garmentNeed - home.garments - result.garments)
        : Math.max(
            0,
            request.blanketNeed -
              home.blankets -
              result.blankets -
              Math.min(request.blanketStock, beddingBudget / request.blanketPrice)
          );
      const budget = Math.min(cash, remainingBudget, garment ? remainingBudget : beddingBudget);
      const units = Math.min(
        need,
        Math.max(0, stock.stock) / chain.clothPerProduct,
        worker.unusedPoints / workPerLot,
        budget / (materialPerLot + servicePerLot)
      );
      let material = Math.floor(Math.max(0, units) * materialPerLot * 100 + 1e-9) / 100;
      let made = material / materialPerLot;
      let fee = Math.ceil(made * servicePerLot * 100 - 1e-9) / 100;
      while (material > 0 && material + fee > budget + 1e-9) {
        material = rn(material - 0.01, 2);
        made = material / materialPerLot;
        fee = Math.ceil(made * servicePerLot * 100 - 1e-9) / 100;
      }
      if (!(material > 0) || !(fee > 0)) continue;
      const bill = rn(material + fee, 2);
      if (!estimate && debitRuralHouseholdWealth(market, bill) < bill - 1e-9)
        throw new Error("Textile commission cash changed during settlement");
      cash = Math.max(0, cash - bill);
      if (!estimate) {
        market.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
        market.marketTreasury.balance = rn(market.marketTreasury.balance + material, 2);
        creditHouseholdWealth(worker.burgId, fee);
      }
      const inputUnits = made * chain.clothPerProduct;
      const work = made * workPerLot;
      stock.stock = Math.max(0, stock.stock - inputUnits);
      worker.chargedPoints += work;
      worker.unusedPoints = Math.max(0, worker.unusedPoints - work);
      worker.textilePoints += work;
      worker.commissionPoints = (worker.commissionPoints ?? 0) + work;
      if (!estimate) onLaborUsed?.(worker.burgId, work);
      result.materialSpending += material;
      result.serviceSpending += fee;
      if (garment) {
        result.garments += made;
        result.garmentSpending += bill;
      } else {
        result.blankets += made;
        result.blanketSpending += bill;
      }
      result.jobs.push({
        burgId: worker.burgId,
        inputGoodId: chain.cloth.i,
        inputUnits,
        productGoodId: chain.product.i,
        productUnits: made,
        materialPayment: material,
        servicePayment: fee,
        laborPoints: work,
        status: "delivered"
      });
      if (!estimate) {
        recordGoodFlow({
          direction: "sink",
          category: "recipeInput",
          goodId: chain.cloth.i,
          units: inputUnits,
          marketId: market.i,
          burgId: worker.burgId,
          relatedGoodId: chain.product.i
        });
        recordGoodFlow({
          direction: "source",
          category: "burgCraft",
          goodId: chain.product.i,
          units: made,
          marketId: market.i,
          burgId: worker.burgId
        });
        recordGoodFlow({
          direction: "sink",
          category: "householdTextiles",
          goodId: chain.product.i,
          units: made,
          marketId: market.i,
          burgId: worker.burgId
        });
      }
    }
  }
  return result;
}

export function settleTextileCommissions(
  market: Market,
  home: RuralTextileProduction,
  request: TextileCommissionRequest,
  onLaborUsed?: (burgId: number, points: number) => void
): TextileCommissionLedger {
  return runTextileCommissions(market, home, request, false, onLaborUsed);
}

export function estimateTextileCommissions(
  market: Market,
  home: RuralTextileProduction,
  request: TextileCommissionRequest
): TextileCommissionLedger {
  return runTextileCommissions(market, home, request, true);
}

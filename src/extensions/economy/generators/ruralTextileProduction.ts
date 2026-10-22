/** Rural families buy actual fiber and use their reserved handcraft labor for their own needs. */
import { rn } from "../../hostUtils";
import {
  getFarmLaborRequired,
  getGoods,
  getHouseholdTextileWorkers,
  getMarketCellColumn,
  getWorldContext
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { debitRuralHouseholdWealth } from "./householdWealth";
import type { Market } from "./marketTypes";
import { getRuralTextileChains, type RuralTextileChain } from "./ruralTextileChains";
import { HOUSEHOLD_GARMENT_NAMES } from "./textileRecipeContracts";

export interface RuralTextileProduction {
  garments: number;
  blankets: number;
  garmentSpending: number;
  blanketSpending: number;
  laborUsed: number;
  laborCapacity: number;
}

function getLaborCapacity(market: Market): number {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const workers = getHouseholdTextileWorkers();
  const farm = getFarmLaborRequired();
  const markets = getMarketCellColumn();
  const rate = Math.max(1, world.populationRate || 1);
  let capacity = 0;
  for (const cell of cells?.i ?? []) {
    if (cells.h[cell] < 20 || markets[cell] !== market.i) continue;
    const reserved = Math.max(0, workers[cell] ?? 0);
    const adults = (Math.max(0, cells.maleAdults?.[cell] ?? 0) + Math.max(0, cells.femaleAdults?.[cell] ?? 0)) * rate;
    // Population losses cannot leave last year's workers available in addition to farm work.
    const otherWork = Math.max(0, (farm[cell] ?? 0) * rate - reserved);
    capacity += Math.min(reserved, Math.max(0, adults - otherWork));
  }
  return capacity;
}

export function settleRuralTextileProduction(
  market: Market,
  garmentNeed: number,
  blanketNeed: number,
  garmentBudget: number,
  blanketBudget: number
): RuralTextileProduction {
  const result: RuralTextileProduction = {
    garments: 0,
    blankets: 0,
    garmentSpending: 0,
    blanketSpending: 0,
    laborUsed: 0,
    laborCapacity: getLaborCapacity(market)
  };
  const goods = getGoods().filter(isGoodEnabled);
  if (!(result.laborCapacity > 0)) return result;
  const chains = getRuralTextileChains(goods);
  const fiberCost = (chain: RuralTextileChain): number => {
    const price = market.goods[chain.fiber.i]?.price;
    return price > 0 && Number.isFinite(price) ? chain.clothPerProduct * chain.fiberPerCloth * price : Infinity;
  };
  // One wardrobe target across all fibers. Deterministic ties retain the declared route order.
  chains.sort(
    (a, b) =>
      Number(b.product.name !== "Wool Blankets") - Number(a.product.name !== "Wool Blankets") ||
      fiberCost(a) - fiberCost(b) ||
      a.laborPerProduct - b.laborPerProduct
  );
  const produce = (chain: RuralTextileChain, need: number, budget: number): { units: number; cost: number } => {
    const { fiber, cloth, product: good, clothPerProduct, laborPerProduct } = chain;
    const fiberRow = market.goods[fiber.i];
    const costPerProduct = fiberCost(chain);
    if (!(need > 0) || !(budget > 0) || !Number.isFinite(costPerProduct) || !fiberRow) return { units: 0, cost: 0 };
    const fiberPerProduct = clothPerProduct * chain.fiberPerCloth;
    const units = Math.min(
      need,
      Math.max(0, fiberRow.stock) / fiberPerProduct,
      Math.max(0, result.laborCapacity - result.laborUsed) / laborPerProduct,
      budget / (fiberPerProduct * fiberRow.price)
    );
    const cost = Math.floor(Math.max(0, units) * fiberPerProduct * fiberRow.price * 100 + 1e-9) / 100;
    if (!(cost > 0)) return { units: 0, cost: 0 };
    const paid = debitRuralHouseholdWealth(market, cost);
    const produced = paid / (fiberPerProduct * fiberRow.price);
    if (!(produced > 0)) return { units: 0, cost: 0 };
    fiberRow.stock = Math.max(0, fiberRow.stock - produced * fiberPerProduct);
    market.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
    market.marketTreasury.balance = rn(market.marketTreasury.balance + paid, 2);
    result.laborUsed += produced * laborPerProduct;
    // Intermediates are made and used at home, never added to market stock.
    recordGoodFlow({
      direction: "sink",
      category: "recipeInput",
      goodId: fiber.i,
      units: produced * fiberPerProduct,
      marketId: market.i,
      relatedGoodId: cloth.i
    });
    recordGoodFlow({
      direction: "source",
      category: "ruralCraft",
      goodId: cloth.i,
      units: produced * clothPerProduct,
      marketId: market.i
    });
    recordGoodFlow({
      direction: "sink",
      category: "recipeInput",
      goodId: cloth.i,
      units: produced * clothPerProduct,
      marketId: market.i,
      relatedGoodId: good.i
    });
    recordGoodFlow({
      direction: "source",
      category: "ruralCraft",
      goodId: good.i,
      units: produced,
      marketId: market.i
    });
    recordGoodFlow({
      direction: "sink",
      category: "householdTextiles",
      goodId: good.i,
      units: produced,
      marketId: market.i
    });
    return { units: produced, cost: paid };
  };
  for (const chain of chains) {
    const garment = HOUSEHOLD_GARMENT_NAMES.has(chain.product.name);
    const produced = produce(
      chain,
      Math.max(0, (garment ? garmentNeed : blanketNeed) - (garment ? result.garments : result.blankets)),
      Math.max(
        0,
        (garment ? garmentBudget : blanketBudget) - (garment ? result.garmentSpending : result.blanketSpending)
      )
    );
    if (garment) {
      result.garments += produced.units;
      result.garmentSpending += produced.cost;
    } else {
      result.blankets += produced.units;
      result.blanketSpending += produced.cost;
    }
  }
  return result;
}

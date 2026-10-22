/** Rural families buy fiber or cloth and use their reserved handcraft labor for their own needs. */
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
import { debitRuralHouseholdWealth, getRuralHouseholdWealth } from "./householdWealth";
import type { Market } from "./marketTypes";
import { getRuralTextileChains, type RuralTextileChain } from "./ruralTextileChains";
import { getBeddingCashBudget } from "./textileHouseholdPolicy";
import { HOUSEHOLD_GARMENT_NAMES } from "./textileRecipeContracts";

export interface RuralTextileProduction {
  inputOrders?: Record<number, number>;
  garments: number;
  blankets: number;
  garmentSpending: number;
  blanketSpending: number;
  /** Subsets of garment/blanket totals; absent on older saves. */
  purchasedClothGarments?: number;
  purchasedClothBlankets?: number;
  purchasedClothSpending?: number;
  laborUsed: number;
  laborCapacity: number;
}

function getLaborCapacity(market: Market): number {
  const world = getWorldContext();
  const cells = world.pack.cells;
  if (!cells?.i?.length) return 0;
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

interface RuralBeddingReservation {
  wardrobeNeed: number;
  wardrobePrice: number;
  blanketNeed: number;
  blanketStock: number;
  blanketPrice: number;
}

function runRuralTextileProduction(
  market: Market,
  garmentNeed: number,
  blanketNeed: number,
  garmentBudget: number,
  blanketBudget: number,
  reservation: RuralBeddingReservation | undefined,
  estimate: boolean
): RuralTextileProduction {
  const result: RuralTextileProduction = {
    inputOrders: {},
    garments: 0,
    blankets: 0,
    garmentSpending: 0,
    blanketSpending: 0,
    purchasedClothGarments: 0,
    purchasedClothBlankets: 0,
    purchasedClothSpending: 0,
    laborUsed: 0,
    laborCapacity: getLaborCapacity(market)
  };
  const goods = getGoods().filter(isGoodEnabled);
  if (!(result.laborCapacity > 0)) return result;
  const chains = getRuralTextileChains(goods);
  let cash = Math.max(0, getRuralHouseholdWealth(market));
  const inputPrice = (chain: RuralTextileChain) =>
    market.goods[chain.input.i]?.price ?? (estimate ? chain.input.value : 0);
  const inputCost = (chain: RuralTextileChain): number => {
    const price = inputPrice(chain);
    return price > 0 && Number.isFinite(price) ? chain.clothPerProduct * chain.inputPerCloth * price : Infinity;
  };
  // One wardrobe target across all fibers. Deterministic ties retain the declared route order.
  chains.sort(
    (a, b) =>
      Number(b.product.name !== "Wool Blankets") - Number(a.product.name !== "Wool Blankets") ||
      inputCost(a) - inputCost(b) ||
      a.laborPerProduct - b.laborPerProduct
  );
  const produce = (chain: RuralTextileChain, need: number, budget: number): { units: number; cost: number } => {
    const { input, cloth, product: good, clothPerProduct, laborPerProduct } = chain;
    const inputRow = market.goods[input.i];
    const costPerProduct = inputCost(chain);
    if (!(need > 0) || !(budget > 0) || !Number.isFinite(costPerProduct) || (!estimate && !inputRow))
      return { units: 0, cost: 0 };
    const inputPerProduct = clothPerProduct * chain.inputPerCloth;
    const units = Math.min(
      need,
      estimate ? Infinity : Math.max(0, inputRow.stock) / inputPerProduct,
      Math.max(0, result.laborCapacity - result.laborUsed) / laborPerProduct,
      Math.min(budget, cash) / (inputPerProduct * inputPrice(chain))
    );
    const cost = Math.floor(Math.max(0, units) * inputPerProduct * inputPrice(chain) * 100 + 1e-9) / 100;
    if (!(cost > 0)) return { units: 0, cost: 0 };
    const paid = estimate ? cost : debitRuralHouseholdWealth(market, cost);
    const produced = paid / (inputPerProduct * inputPrice(chain));
    if (!(produced > 0)) return { units: 0, cost: 0 };
    cash = Math.max(0, cash - paid);
    result.inputOrders![input.i] = (result.inputOrders![input.i] ?? 0) + produced * inputPerProduct;
    result.laborUsed += produced * laborPerProduct;
    if (estimate) return { units: produced, cost: paid };
    inputRow.stock = Math.max(0, inputRow.stock - produced * inputPerProduct);
    market.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
    market.marketTreasury.balance = rn(market.marketTreasury.balance + paid, 2);
    if (chain.weavesCloth) {
      recordGoodFlow({
        direction: "sink",
        category: "recipeInput",
        goodId: input.i,
        units: produced * inputPerProduct,
        marketId: market.i,
        relatedGoodId: cloth.i
      });
      // Home-woven cloth is consumed immediately, never added to market stock.
      recordGoodFlow({
        direction: "source",
        category: "ruralCraft",
        goodId: cloth.i,
        units: produced * clothPerProduct,
        marketId: market.i
      });
    } else {
      result.purchasedClothSpending! += paid;
      if (HOUSEHOLD_GARMENT_NAMES.has(good.name)) result.purchasedClothGarments! += produced;
      else result.purchasedClothBlankets! += produced;
    }
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
    const beddingBudget = reservation
      ? getBeddingCashBudget(
          garmentBudget + blanketBudget,
          reservation.wardrobeNeed,
          reservation.wardrobePrice,
          result.garments,
          result.garmentSpending
        )
      : blanketBudget;
    // Savings can now afford existing bedding stock; preserve its priority over home manufacture.
    const beddingNeed = reservation
      ? Math.max(
          0,
          reservation.blanketNeed - Math.min(reservation.blanketStock, beddingBudget / reservation.blanketPrice)
        )
      : blanketNeed;
    const produced = produce(
      chain,
      Math.max(0, (garment ? garmentNeed : beddingNeed) - (garment ? result.garments : result.blankets)),
      Math.max(
        0,
        (garment ? garmentBudget : beddingBudget) - (garment ? result.garmentSpending : result.blanketSpending)
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

type RuralTextileRequest = [
  market: Market,
  garmentNeed: number,
  blanketNeed: number,
  garmentBudget: number,
  blanketBudget: number,
  reservation?: RuralBeddingReservation
];

export function settleRuralTextileProduction(...request: RuralTextileRequest): RuralTextileProduction {
  const [market, garments, blankets, garmentBudget, blanketBudget, reservation] = request;
  return runRuralTextileProduction(market, garments, blankets, garmentBudget, blanketBudget, reservation, false);
}

/** Gross input orders before stock subtraction; shared cash and labor constrain all alternative routes. */
export function estimateRuralTextileProduction(...request: RuralTextileRequest): RuralTextileProduction {
  const [market, garments, blankets, garmentBudget, blanketBudget, reservation] = request;
  return runRuralTextileProduction(market, garments, blankets, garmentBudget, blanketBudget, reservation, true);
}

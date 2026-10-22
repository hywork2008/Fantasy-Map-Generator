/** Rural families buy actual fiber and use their reserved handcraft labor for their own needs. */
import { rn } from "../../hostUtils";
import {
  getFarmLaborRequired,
  getGoods,
  getHouseholdTextileWorkers,
  getMarketCellColumn,
  getWorldContext
} from "../economyContext";
import { getGoodDemandCalibration } from "./craftDemandCalibration";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { Good } from "./goodsGeneratorTypes";
import { debitRuralHouseholdWealth } from "./householdWealth";
import type { Market } from "./marketTypes";

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

/** Only the authored single-input wool chain is supported; custom byproducts or gates stay with workshops. */
function inputAmount(good: Good, inputId: number): number | null {
  if (good.requiredTechnology) return null;
  if (good.byproducts?.some(row => row && Object.keys(row).length) || good.recipeTechnologies?.some(Boolean))
    return null;
  if (good.recipes?.length !== 1) return null;
  const entries = Object.entries(good.recipes[0]);
  if (entries.length !== 1 || +entries[0][0] !== inputId) return null;
  const amount = entries[0][1];
  return Number.isFinite(amount) && amount > 0 ? amount : null;
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
  const wool = goods.find(good => good.name === "Wool");
  const cloth = goods.find(good => good.name === "Wool Cloth");
  if (!wool || !cloth || !(result.laborCapacity > 0)) return result;
  const woolPerCloth = inputAmount(cloth, wool.i);
  const woolRow = market.goods[wool.i];
  if (woolPerCloth === null || !woolRow || !(woolRow.price > 0) || !Number.isFinite(woolRow.price)) return result;
  const labor = (good: Good): number =>
    (getGoodDemandCalibration(good.name)?.laborPointsPerLotAtDefaultRate ?? 0) * 1000;
  if (!(labor(cloth) > 0)) return result;

  const produce = (name: string, need: number, budget: number): { units: number; cost: number } => {
    const good = goods.find(entry => entry.name === name);
    if (!good || !(need > 0) || !(budget > 0)) return { units: 0, cost: 0 };
    const clothPerProduct = inputAmount(good, cloth.i);
    if (clothPerProduct === null || !(labor(good) > 0)) return { units: 0, cost: 0 };
    const woolPerProduct = clothPerProduct * woolPerCloth;
    const laborPerProduct = labor(good) + clothPerProduct * labor(cloth);
    const units = Math.min(
      need,
      Math.max(0, woolRow.stock) / woolPerProduct,
      Math.max(0, result.laborCapacity - result.laborUsed) / laborPerProduct,
      budget / (woolPerProduct * woolRow.price)
    );
    const cost = Math.floor(Math.max(0, units) * woolPerProduct * woolRow.price * 100 + 1e-9) / 100;
    if (!(cost > 0)) return { units: 0, cost: 0 };
    const paid = debitRuralHouseholdWealth(market, cost);
    const produced = paid / (woolPerProduct * woolRow.price);
    if (!(produced > 0)) return { units: 0, cost: 0 };
    woolRow.stock = Math.max(0, woolRow.stock - produced * woolPerProduct);
    market.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
    market.marketTreasury.balance = rn(market.marketTreasury.balance + paid, 2);
    result.laborUsed += produced * laborPerProduct;
    // Intermediates are made and used at home, never added to market stock.
    recordGoodFlow({
      direction: "sink",
      category: "recipeInput",
      goodId: wool.i,
      units: produced * woolPerProduct,
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
  const garments = produce("Wool Garments", garmentNeed, garmentBudget);
  result.garments = garments.units;
  result.garmentSpending = garments.cost;
  const blankets = produce("Wool Blankets", blanketNeed, blanketBudget);
  result.blankets = blankets.units;
  result.blanketSpending = blankets.cost;
  return result;
}

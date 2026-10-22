/** Rural families buy fiber or cloth and use their reserved handcraft labor for their own needs. */
import { rn } from "../../hostUtils";
import {
  getFarmLaborRequired,
  getGoods,
  getHouseholdTextileWorkers,
  getMarketCellColumn,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { debitRuralHouseholdWealth, getRuralHouseholdWealth } from "./householdWealth";
import type { Market } from "./marketTypes";
import { getRuralTextileChains, type RuralTextileChain } from "./ruralTextileChains";
import { getBeddingCashBudget } from "./textileHouseholdPolicy";
import { HOUSEHOLD_GARMENT_NAMES } from "./textileRecipeContracts";

export interface BeddingRouteDiagnostic {
  inputGoodId: number;
  weavesCloth: boolean;
  inputPrice: number | null;
  inputStock: number;
  needLimitLots: number;
  cashLimitLots: number;
  stockLimitLots: number;
  laborLimitLots: number;
  producedLots: number;
  belowPaymentPrecision: boolean;
}

/** Captured at the real home-processing decision, before blanket purchases and later tick changes. */
export interface RuralBeddingDiagnostic {
  year: number;
  month: number;
  householdBudget: number;
  wardrobeNeedLots: number;
  wardrobeHomeLots: number;
  wardrobeSpending: number;
  remainingWardrobeCost: number;
  beddingBudget: number;
  laborAfterGarments: number;
  blanketNeedLots: number;
  finishedBlanketStock: number;
  beddingLaborReserved?: number;
  releasedLaborToGarments?: number;
  routes: BeddingRouteDiagnostic[];
}

export interface RuralTextileProduction {
  inputOrders?: Record<number, number>;
  beddingDiagnostic?: RuralBeddingDiagnostic;
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
  estimate: boolean,
  shareLabor = true,
  stockLimitedPreview = false,
  laborCapacityOverride?: number,
  cashOverride?: number
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
    laborCapacity: laborCapacityOverride ?? getLaborCapacity(market)
  };
  let beddingLaborReserved = 0;
  const quoteInputs = estimate && !stockLimitedPreview;
  const previewStocks = new Map<number, number>();
  const captureBedding = (beddingBudget: number) => {
    if (estimate || result.beddingDiagnostic) return;
    result.beddingDiagnostic = {
      year: getSimulationYear(),
      month: getSimulationMonth(),
      householdBudget: garmentBudget + blanketBudget,
      wardrobeNeedLots: reservation?.wardrobeNeed ?? garmentNeed,
      wardrobeHomeLots: result.garments,
      wardrobeSpending: result.garmentSpending,
      remainingWardrobeCost:
        reservation && Number.isFinite(reservation.wardrobePrice)
          ? Math.max(0, reservation.wardrobeNeed - result.garments) * reservation.wardrobePrice
          : 0,
      beddingBudget: Math.min(Math.max(0, getRuralHouseholdWealth(market)), beddingBudget),
      laborAfterGarments: Math.max(0, result.laborCapacity - result.laborUsed),
      blanketNeedLots: reservation?.blanketNeed ?? blanketNeed,
      finishedBlanketStock: reservation?.blanketStock ?? 0,
      beddingLaborReserved,
      releasedLaborToGarments: 0,
      routes: []
    };
  };
  const beddingCash = () =>
    reservation
      ? getBeddingCashBudget(
          garmentBudget + blanketBudget,
          reservation.wardrobeNeed,
          reservation.wardrobePrice,
          result.garments,
          result.garmentSpending
        )
      : blanketBudget;
  const goods = getGoods().filter(isGoodEnabled);
  if (!(result.laborCapacity > 0)) {
    captureBedding(beddingCash());
    return result;
  }
  const chains = getRuralTextileChains(goods);
  let cash = Math.max(0, cashOverride ?? getRuralHouseholdWealth(market));
  const inputPrice = (chain: RuralTextileChain) =>
    market.goods[chain.input.i]?.price ?? (quoteInputs ? chain.input.value : 0);
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
  if (shareLabor && chains.some(chain => chain.product.name === "Wool Blankets")) {
    // Plan clothes first without committing purchases. Only feasible bedding can reserve work.
    const clothing = runRuralTextileProduction(
      market,
      garmentNeed,
      0,
      garmentBudget,
      blanketBudget,
      reservation ? { ...reservation, blanketNeed: 0 } : undefined,
      true,
      false,
      !quoteInputs,
      laborCapacityOverride,
      cashOverride
    );
    const budget = reservation
      ? getBeddingCashBudget(
          garmentBudget + blanketBudget,
          reservation.wardrobeNeed,
          reservation.wardrobePrice,
          clothing.garments,
          clothing.garmentSpending
        )
      : blanketBudget;
    const need = reservation
      ? Math.max(0, reservation.blanketNeed - Math.min(reservation.blanketStock, budget / reservation.blanketPrice))
      : blanketNeed;
    for (const chain of chains.filter(chain => chain.product.name === "Wool Blankets")) {
      const cost = inputCost(chain);
      if (!(need > 0) || !(budget > 0) || !Number.isFinite(cost)) continue;
      const stock = quoteInputs
        ? Infinity
        : Math.max(0, (market.goods[chain.input.i]?.stock ?? 0) - (clothing.inputOrders?.[chain.input.i] ?? 0));
      const units = Math.min(
        need,
        stock / (chain.inputPerCloth * chain.clothPerProduct),
        Math.max(0, Math.min(budget, cash - clothing.garmentSpending)) / cost,
        result.laborCapacity / chain.laborPerProduct
      );
      if (Math.floor(units * cost * 100 + 1e-9) < 1) continue;
      const beddingWork = units * chain.laborPerProduct;
      beddingLaborReserved = Math.min(
        beddingWork,
        (result.laborCapacity * beddingWork) / (clothing.laborUsed + beddingWork)
      );
      break;
    }
  }
  let firstGarmentPass = true;
  const produce = (chain: RuralTextileChain, need: number, budget: number): { units: number; cost: number } => {
    const { input, cloth, product: good, clothPerProduct, laborPerProduct } = chain;
    const inputRow = market.goods[input.i];
    const costPerProduct = inputCost(chain);
    const inputPerProduct = clothPerProduct * chain.inputPerCloth;
    const availableStock = stockLimitedPreview
      ? (previewStocks.get(input.i) ?? Math.max(0, inputRow?.stock ?? 0))
      : Math.max(0, inputRow?.stock ?? 0);
    const stockLimit = availableStock / inputPerProduct;
    const garment = HOUSEHOLD_GARMENT_NAMES.has(good.name);
    const laborCeiling =
      garment && firstGarmentPass ? result.laborCapacity - beddingLaborReserved : result.laborCapacity;
    const laborLimit = Math.max(0, laborCeiling - result.laborUsed) / laborPerProduct;
    const cashLimit = Number.isFinite(costPerProduct) ? Math.max(0, Math.min(budget, cash)) / costPerProduct : 0;
    const route: BeddingRouteDiagnostic | undefined =
      !estimate && good.name === "Wool Blankets"
        ? {
            inputGoodId: input.i,
            weavesCloth: chain.weavesCloth,
            inputPrice: Number.isFinite(inputCost(chain)) ? inputPrice(chain) : null,
            inputStock: Math.max(0, inputRow?.stock ?? 0),
            needLimitLots: Math.max(0, need),
            cashLimitLots: cashLimit,
            stockLimitLots: stockLimit,
            laborLimitLots: laborLimit,
            producedLots: 0,
            belowPaymentPrecision: false
          }
        : undefined;
    if (route) result.beddingDiagnostic?.routes.push(route);
    if (!(need > 0) || !(budget > 0) || !Number.isFinite(costPerProduct) || (!quoteInputs && !inputRow))
      return { units: 0, cost: 0 };
    const units = Math.min(need, quoteInputs ? Infinity : stockLimit, laborLimit, cashLimit);
    const cost = Math.floor(Math.max(0, units) * inputPerProduct * inputPrice(chain) * 100 + 1e-9) / 100;
    if (!(cost > 0)) {
      if (route) route.belowPaymentPrecision = units > 0;
      return { units: 0, cost: 0 };
    }
    const paid = estimate ? cost : debitRuralHouseholdWealth(market, cost);
    const produced = paid / (inputPerProduct * inputPrice(chain));
    if (!(produced > 0)) return { units: 0, cost: 0 };
    if (route) route.producedLots = produced;
    cash = Math.max(0, cash - paid);
    result.inputOrders![input.i] = (result.inputOrders![input.i] ?? 0) + produced * inputPerProduct;
    result.laborUsed += produced * laborPerProduct;
    if (estimate) {
      if (stockLimitedPreview) previewStocks.set(input.i, Math.max(0, availableStock - produced * inputPerProduct));
      return { units: produced, cost: paid };
    }
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
    const beddingBudget = beddingCash();
    if (!garment) captureBedding(beddingBudget);
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
  // Unused bedding work returns to clothing, with the same remaining cash, stock and need.
  firstGarmentPass = false;
  const beforeRelease = result.laborUsed;
  for (const chain of chains.filter(chain => HOUSEHOLD_GARMENT_NAMES.has(chain.product.name))) {
    const produced = produce(
      chain,
      Math.max(0, garmentNeed - result.garments),
      Math.max(0, garmentBudget - result.garmentSpending)
    );
    result.garments += produced.units;
    result.garmentSpending += produced.cost;
  }
  captureBedding(beddingCash());
  if (result.beddingDiagnostic) result.beddingDiagnostic.releasedLaborToGarments = result.laborUsed - beforeRelease;
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

/** Local materials get first call on work and cash; only the residual can order missing inputs. */
export function estimateRuralTextileProduction(...request: RuralTextileRequest): RuralTextileProduction {
  const [market, garments, blankets, garmentBudget, blanketBudget, reservation] = request;
  const local = runRuralTextileProduction(
    market,
    garments,
    blankets,
    garmentBudget,
    blanketBudget,
    reservation,
    true,
    true,
    true
  );
  const spent = local.garmentSpending + local.blanketSpending;
  const workLeft = Math.max(0, local.laborCapacity - local.laborUsed);
  const cashLeft = Math.max(0, getRuralHouseholdWealth(market) - spent);
  if (!(workLeft > 0) || !(cashLeft > 0)) return local;
  const budgetLeft = Math.max(0, garmentBudget + blanketBudget - spent);
  const remainingReservation = reservation
    ? {
        ...reservation,
        wardrobeNeed: Math.max(0, reservation.wardrobeNeed - local.garments),
        blanketNeed: Math.max(0, reservation.blanketNeed - local.blankets)
      }
    : undefined;
  const beddingBudget = remainingReservation
    ? getBeddingCashBudget(budgetLeft, remainingReservation.wardrobeNeed, remainingReservation.wardrobePrice)
    : Math.max(0, blanketBudget - local.blanketSpending);
  const clothingBudget = remainingReservation
    ? Math.max(0, budgetLeft - beddingBudget)
    : Math.max(0, garmentBudget - local.garmentSpending);
  const imported = runRuralTextileProduction(
    market,
    Math.max(0, garments - local.garments),
    Math.max(0, blankets - local.blankets),
    clothingBudget,
    beddingBudget,
    remainingReservation,
    true,
    true,
    false,
    workLeft,
    cashLeft
  );
  const inputs = { ...local.inputOrders };
  for (const [id, units] of Object.entries(imported.inputOrders ?? {})) inputs[+id] = (inputs[+id] ?? 0) + units;
  return {
    ...local,
    inputOrders: inputs,
    garments: local.garments + imported.garments,
    blankets: local.blankets + imported.blankets,
    garmentSpending: local.garmentSpending + imported.garmentSpending,
    blanketSpending: local.blanketSpending + imported.blanketSpending,
    laborUsed: local.laborUsed + imported.laborUsed
  };
}

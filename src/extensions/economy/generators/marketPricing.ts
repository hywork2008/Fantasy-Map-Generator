import { getMarketSettings } from "../../../simulation/marketSettings";
import { minmax, rn } from "../../hostUtils";
import { getBurgMarketLedger } from "./burgMarketLedgers";
import { getGoodDemandCalibration } from "./craftDemandCalibration";
import { getMintPriceFloor } from "./currencySufficiency";
import { GOODS_DATA, Goods } from "./goods-generator";
import type { Good } from "./goodsGeneratorTypes";
import { isTownSoapDemandGood } from "./townSoap";

export const MARKET_MARGIN = 0.1;

export function getWarPriceModifier(burgId: number | undefined, goodId: number | undefined): number {
  if (!burgId || goodId === undefined || goodId === null) {
    return 1;
  }
  const ledger = getBurgMarketLedger(burgId);
  if (!ledger) {
    return 1;
  }

  const good = Goods.get(goodId);
  if (!good) {
    return 1;
  }

  const intensity = ledger.warIntensity || 0;
  if (intensity === 0) {
    return 1;
  }

  const durationTicks = ledger.warDurationTicks || 0;
  const durationFactor = Math.min(1.0, durationTicks / 10);

  let warType = good.warEconomyType;
  if (!warType) {
    const defaultGood = GOODS_DATA.find((g: { name: string; warEconomyType?: string }) => g.name === good.name);
    warType = defaultGood?.warEconomyType;
  }

  if (!warType) {
    return 1;
  }

  let baseMultiplier = 0;
  switch (warType) {
    case "military":
      baseMultiplier = 1.5;
      break;
    case "essential":
      baseMultiplier = 1.2;
      break;
    case "strategic":
      baseMultiplier = 0.8;
      break;
    case "luxury": {
      const dropFactor = 0.3;
      const luxuryMod = Math.max(0.1, 1 - dropFactor * intensity);
      return luxuryMod; // food stress does not apply to luxuries
    }
    default:
      return 1;
  }

  const warMod = 1 + baseMultiplier * intensity * (1 + durationFactor);
  return warMod;
}

export function customerBuyPrice(midPrice: number, burgId?: number, goodId?: number): number {
  const warMod = getWarPriceModifier(burgId, goodId);
  return rn(midPrice * warMod * (1 + MARKET_MARGIN), 2);
}

/**
 * Salt is priced once a month from its need and stock (saltFinance.ts `priceSalt`, which smooths from
 * the last price). Trade and purchase pressure must not move it, or one large deal carried a
 * collapsed price into the following months (docs/plan/salt-supply-calibration.md §3.12). Fresh
 * Meat is sold the month it is killed and never stands in stock (slaughter.ts), so an empty shelf
 * is not a shortage; it is priced at sale (docs/plan/livestock-meat-sales.md §4.4).
 */
export function hasSettledPrice(good: Pick<Good, "name">): boolean {
  return good.name === "Salt" || good.name === "Meat";
}

/**
 * Food processing goods with a monthly household demand of their own (foodProcessingLedger.ts):
 * their price is set each cycle from that demand against stock, and a sale or purchase does not
 * push it. A tun of ale sold took 1% of its value off the price, so a brewing town's own beer fell
 * to the floor, below its barley (docs/plan/urban-craft-staffing.md §10.6).
 */
const HOUSEHOLD_DEMAND_PRICED_GOODS: ReadonlySet<string> = new Set([
  "Beer",
  "Cider",
  "Perry",
  "Mead",
  "Wine",
  "Cheese",
  "Raisins"
]);

export function isPricedByHouseholdDemand(good: Pick<Good, "name">): boolean {
  // The towns' soap, while their soap need is on (docs/plan/town-soap.md §3.3).
  return HOUSEHOLD_DEMAND_PRICED_GOODS.has(good.name) || isTownSoapDemandGood(good) || isPricedByTownTargets(good);
}

/** Goods slaughter and the hunt give with the carcass, with no recipe and no cell distribution. */
export const SLAUGHTER_BYPRODUCTS: ReadonlySet<string> = new Set(["Leather", "Tallow", "Rennet"]);

/**
 * With `byproductPricing` on, the slaughter by-products and the goods the towns buy to a target
 * are priced each month from their stock against the towns' targets, and a sale or purchase does
 * not push them: at 1% of the value a unit, the hides a market's shoemakers buy in a month put
 * Leather back at the ceiling whatever its stock (docs/plan/byproduct-prices.md §7).
 */
export function isPricedByTownTargets(good: Pick<Good, "name">): boolean {
  if (getMarketSettings().byproductPricing !== "stockAndDemand") return false;
  return SLAUGHTER_BYPRODUCTS.has(good.name) || Boolean(getGoodDemandCalibration(good.name)?.householdPurchase);
}

export const PRICE_FLOOR_FACTOR = 0.25;
export const PRICE_CEILING_FACTOR = 3.0;
/** Lots added to both demand and stock, so an empty market is dear rather than infinitely so. */
export const LAPLACE_PRICE_SMOOTHING = 5;

/** Lowest price a good falls to: a quarter of its value, or the mint price for minted metal. */
export function getPriceFloor(good: Pick<Good, "unit" | "value">, baseValue: number): number {
  const floor = baseValue * PRICE_FLOOR_FACTOR;
  const mintFloor = getMintPriceFloor(good);
  return mintFloor === undefined ? floor : Math.max(floor, mintFloor);
}

/** A raw good's price for its demand against its stock: value times their ratio, floor to ceiling. */
export function getRawGoodTargetPrice(
  good: Pick<Good, "unit" | "value">,
  baseValue: number,
  demand: number,
  stock: number
): number {
  const ratio = (demand + LAPLACE_PRICE_SMOOTHING) / (Math.max(0, stock) + LAPLACE_PRICE_SMOOTHING);
  return minmax(baseValue * ratio, getPriceFloor(good, baseValue), baseValue * PRICE_CEILING_FACTOR);
}
const MARKET_PRESSURE_FACTOR = 0.01;

export function applyMarketPressure(basePrice: number, currentPrice: number | undefined, units: number): number {
  const price = currentPrice ?? basePrice;
  const floor = basePrice * PRICE_FLOOR_FACTOR;
  const ceiling = basePrice * PRICE_CEILING_FACTOR;
  return minmax(floor, price + units * basePrice * MARKET_PRESSURE_FACTOR, ceiling);
}

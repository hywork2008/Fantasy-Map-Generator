import { minmax, rn } from "../../hostUtils";
import { getBurgMarketLedger } from "./burgMarketLedgers";
import { GOODS_DATA, Goods } from "./goods-generator";
import type { Good } from "./goodsGeneratorTypes";

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

export const PRICE_FLOOR_FACTOR = 0.25;
export const PRICE_CEILING_FACTOR = 3.0;
const MARKET_PRESSURE_FACTOR = 0.01;

export function applyMarketPressure(basePrice: number, currentPrice: number | undefined, units: number): number {
  const price = currentPrice ?? basePrice;
  const floor = basePrice * PRICE_FLOOR_FACTOR;
  const ceiling = basePrice * PRICE_CEILING_FACTOR;
  return minmax(floor, price + units * basePrice * MARKET_PRESSURE_FACTOR, ceiling);
}

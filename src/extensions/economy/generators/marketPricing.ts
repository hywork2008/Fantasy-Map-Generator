import { rn } from "../../hostUtils";
import { getBurgMarketLedger } from "./burgMarketLedgers";
import { GOODS_DATA, Goods } from "./goods-generator";

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

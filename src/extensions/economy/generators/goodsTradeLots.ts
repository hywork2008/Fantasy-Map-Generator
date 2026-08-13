import type { Good } from "./goodsGeneratorTypes";

const EPSILON = 1e-7;
const DEFAULT_BULK_LOT_SIZE = 0.01;
const MINIMUM_RETAIL_LOT_SIZE = 0.01;
const DEFAULT_MARKET_TRADE_MINIMUM_UNITS = 0.1;
const INDIVISIBLE_UNITS = new Set(["head", "ship", "cannon", "slave", "set", "pair", "quiver", "piece", "vessel"]);

/** Smallest retail quantity. Live cargo and explicitly discrete units are never split. */
export function getRetailLotSize(good: Pick<Good, "retailLotSize" | "unit" | "cargo">): number {
  if (
    typeof good.retailLotSize === "number" &&
    Number.isFinite(good.retailLotSize) &&
    good.retailLotSize >= MINIMUM_RETAIL_LOT_SIZE
  ) {
    return good.retailLotSize;
  }
  return good.cargo?.handlingClass === "live" || INDIVISIBLE_UNITS.has(good.unit) ? 1 : DEFAULT_BULK_LOT_SIZE;
}

/**
 * Minimum quantity eligible for a market-to-market shipment. Military-tagged Goods may travel
 * in their retail lot so scarce ammunition and its strategic inputs are not blocked below the
 * general 0.1-unit trade threshold. Discrete Goods (such as Muskets) still resolve to one unit.
 */
export function getMarketTradeMinimumUnits(good: Pick<Good, "tags" | "retailLotSize" | "unit" | "cargo">): number {
  return good.tags.includes("military") ? getRetailLotSize(good) : DEFAULT_MARKET_TRADE_MINIMUM_UNITS;
}

function decimalPlaces(value: number): number {
  const text = value.toString().toLowerCase();
  const exponent = text.indexOf("e-");
  if (exponent !== -1) return Number(text.slice(exponent + 2));
  const decimal = text.indexOf(".");
  return decimal === -1 ? 0 : text.length - decimal - 1;
}

function fromTicks(ticks: number, lotSize: number): number {
  return Number((ticks * lotSize).toFixed(Math.min(12, decimalPlaces(lotSize) + 2)));
}

/** Amount the UI may truthfully advertise as immediately tradeable. */
export function floorToRetailLot(quantity: number, lotSize: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return fromTicks(Math.max(0, Math.floor(quantity / lotSize + EPSILON)), lotSize);
}

/** Reject input that is not an exact multiple of the Good's retail lot. */
export function isRetailLotQuantity(quantity: number, lotSize: number): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  const ticks = Math.round(quantity / lotSize);
  return ticks > 0 && Math.abs(quantity - ticks * lotSize) <= EPSILON * Math.max(1, quantity);
}

export function formatRetailQuantity(quantity: number, lotSize: number): string {
  const digits = Math.min(6, Math.max(0, decimalPlaces(lotSize)));
  return floorToRetailLot(quantity, lotSize).toFixed(digits);
}

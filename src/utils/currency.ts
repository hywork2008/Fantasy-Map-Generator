/** A coin-exchange rate must leave at least one lower denomination. */
export const MIN_CURRENCY_EXCHANGE_RATE = 2;

export const DEFAULT_GOLD_TO_SILVER_RATE = 12;
export const DEFAULT_SILVER_TO_COPPER_RATE = 12;

export interface CurrencyRates {
  goldToSilverRate: number;
  silverToCopperRate: number;
}

export const DEFAULT_CURRENCY_RATES: Readonly<CurrencyRates> = {
  goldToSilverRate: DEFAULT_GOLD_TO_SILVER_RATE,
  silverToCopperRate: DEFAULT_SILVER_TO_COPPER_RATE
};

/**
 * Keep persisted settings and programmatic callers from creating a zero or
 * fractional denomination. Invalid values fall back to the configured default.
 */
export function normalizeCurrencyRate(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;

  const rate = Math.floor(value);
  return rate >= MIN_CURRENCY_EXCHANGE_RATE ? rate : fallback;
}

export function normalizeCurrencyRates(rates: CurrencyRates): CurrencyRates {
  return {
    goldToSilverRate: normalizeCurrencyRate(rates.goldToSilverRate, DEFAULT_GOLD_TO_SILVER_RATE),
    silverToCopperRate: normalizeCurrencyRate(rates.silverToCopperRate, DEFAULT_SILVER_TO_COPPER_RATE)
  };
}

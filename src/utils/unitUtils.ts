import { useOptionsState } from "../store/optionsState";
import { type CurrencyRates, DEFAULT_CURRENCY_RATES, normalizeCurrencyRates } from "./currency";
import { rn } from "./numberUtils";

type TemperatureScale = "°C" | "°F" | "K" | "°R" | "°De" | "°N" | "°Ré" | "°Rø";

/** Display calibration for FMG's stored 0–255 annual precipitation proxy. */
export const ANNUAL_PRECIPITATION_MILLIMETERS_PER_PROXY_UNIT = 100;

/** Converts the stored annual precipitation proxy into the millimetre values shown to users. */
export function precipitationProxyToMillimeters(precipitation: number): number {
  return precipitation * ANNUAL_PRECIPITATION_MILLIMETERS_PER_PROXY_UNIT;
}

/** Formats a stored annual precipitation proxy for every user-facing climate surface. */
export function formatAnnualPrecipitation(precipitation: number, decimals = 0): string {
  return `${rn(precipitationProxyToMillimeters(precipitation), decimals)} mm`;
}

export type UnitSystemId = "metric" | "imperial";

export interface UnitSystemPreset {
  id: UnitSystemId;
  label: string;
  temperatureScale: TemperatureScale;
  distanceUnit: string;
  heightUnit: string;
  weightUnit: string;
}

/**
 * Bundled unit choices for the "Unit system" selector. Kept as an ordered
 * list (rather than per-category defaults scattered across the app) so a
 * future i18n layer can translate `label` and pick a default preset per locale.
 */
export const unitSystemPresets: readonly UnitSystemPreset[] = [
  {
    id: "metric",
    label: "Metric (°C, km, kg)",
    temperatureScale: "°C",
    distanceUnit: "km",
    heightUnit: "m",
    weightUnit: "kg"
  },
  {
    id: "imperial",
    label: "Imperial (°F, mi, lb)",
    temperatureScale: "°F",
    distanceUnit: "mi",
    heightUnit: "ft",
    weightUnit: "lb"
  }
];

export interface UnitSystemSelection {
  temperatureScale: string;
  distanceUnit: string;
  heightUnit: string;
  weightUnit: string;
}

export function detectUnitSystem(selection: UnitSystemSelection): UnitSystemId | "custom" {
  const preset = unitSystemPresets.find(
    p =>
      p.temperatureScale === selection.temperatureScale &&
      p.distanceUnit === selection.distanceUnit &&
      p.heightUnit === selection.heightUnit &&
      p.weightUnit === selection.weightUnit
  );
  return preset ? preset.id : "custom";
}
/**
 * Convert temperature from Celsius to other scales
 * @param {number} temperatureInCelsius - Temperature in Celsius
 * @param {string} targetScale - Target temperature scale
 * @returns {string} - Converted temperature with unit
 */
export const convertTemperature = (temperatureInCelsius: number, targetScale: TemperatureScale = "°C") => {
  const temperatureConversionMap: { [key: string]: (temp: number) => string } = {
    "°C": (temp: number) => `${rn(temp)}°C`,
    "°F": (temp: number) => `${rn((temp * 9) / 5 + 32)}°F`,
    K: (temp: number) => `${rn(temp + 273.15)}K`,
    "°R": (temp: number) => `${rn(((temp + 273.15) * 9) / 5)}°R`,
    "°De": (temp: number) => `${rn(((100 - temp) * 3) / 2)}°De`,
    "°N": (temp: number) => `${rn((temp * 33) / 100)}°N`,
    "°Ré": (temp: number) => `${rn((temp * 4) / 5)}°Ré`,
    "°Rø": (temp: number) => `${rn((temp * 21) / 40 + 7.5)}°Rø`
  };
  return temperatureConversionMap[targetScale](temperatureInCelsius);
};

/**
 * Convert number to short string with SI postfix
 * @param {number} n - The number to convert
 * @returns {string} - The converted string
 */
export const si = (n: number): string => {
  if (n >= 1e9) return `${rn(n / 1e9, 1)}B`;
  if (n >= 1e8) return `${rn(n / 1e6)}M`;
  if (n >= 1e6) return `${rn(n / 1e6, 1)}M`;
  if (n >= 1e4) return `${rn(n / 1e3)}K`;
  if (n >= 1e3) return `${rn(n / 1e3, 1)}K`;
  return rn(n).toString();
};

/**
 * Convert string with SI postfix to integer
 * @param {string} value - The string to convert
 * @returns {number} - The converted integer
 */
export const getIntegerFromSI = (value: string): number => {
  const metric = value.slice(-1);
  if (metric === "K") return parseInt(value.slice(0, -1), 10) * 1e3;
  if (metric === "M") return parseInt(value.slice(0, -1), 10) * 1e6;
  if (metric === "B") return parseInt(value.slice(0, -1), 10) * 1e9;
  return parseInt(value, 10);
};

export interface Coinage {
  gold: number;
  silver: number;
  copper: number;
}

/**
 * Converts the app's internal silver-piece amount to display-only coinage.
 * Internal balances and prices remain untouched; never use this result for
 * finance calculations or data export.
 */
export function toCoinage(silverAmount: number, rates: CurrencyRates = DEFAULT_CURRENCY_RATES): Coinage {
  const { goldToSilverRate, silverToCopperRate } = normalizeCurrencyRates(rates);
  const amount = Number.isFinite(silverAmount) ? Math.max(0, silverAmount) : 0;
  const totalCopper = Math.round(amount * silverToCopperRate);
  const goldToCopperRate = goldToSilverRate * silverToCopperRate;
  const gold = Math.floor(totalCopper / goldToCopperRate);
  const remainder = totalCopper % goldToCopperRate;
  const silver = Math.floor(remainder / silverToCopperRate);
  const copper = remainder % silverToCopperRate;

  return { gold, silver, copper };
}

/** Formats an internal silver-piece amount as gold, silver, and copper coins. */
export function formatCoinage(silverAmount: number, rates: CurrencyRates = DEFAULT_CURRENCY_RATES): string {
  const { gold, silver, copper } = toCoinage(silverAmount, rates);
  const parts: string[] = [];

  if (gold > 0) parts.push(`🟡${gold}`);
  if (silver > 0 || parts.length === 0) parts.push(`⚪${silver}`);
  if (copper > 0) parts.push(`🟤${copper}`);

  return parts.join(" ");
}

/**
 * Display-only currency formatting — never use for CSV/data exports; write the
 * raw numeric value instead. Existing callers retain their API while following
 * the live denomination settings.
 */
export function formatPrice(value: number): string {
  const { goldToSilverRate, silverToCopperRate } = useOptionsState.getState();
  return formatCoinage(value, { goldToSilverRate, silverToCopperRate });
}

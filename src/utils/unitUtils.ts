import { rn } from "./numberUtils";

type TemperatureScale = "°C" | "°F" | "K" | "°R" | "°De" | "°N" | "°Ré" | "°Rø";

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

/** Display-only currency formatting (embeds a decorative icon) — never use for CSV/data exports; write the raw numeric value instead. */
export function formatPrice(value: number): string {
  return `🟡 ${rn(value, 2)}`;
}

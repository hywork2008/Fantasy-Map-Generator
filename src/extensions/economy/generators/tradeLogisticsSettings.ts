/**
 * Player-tunable commercial logistics parameters (Phase F).
 * Persisted in localStorage; pure defaults live in marketFlowBudget / tradeSailSchedule.
 */

import { minmax } from "../../hostUtils";
import {
  DEFAULT_MAX_WAIT_DAYS_LAND,
  DEFAULT_MAX_WAIT_DAYS_SEA,
  DEFAULT_MIN_SAIL_UTILIZATION,
  DEFAULT_TARGET_UTILIZATION
} from "./marketFlowBudget";
import { DEFAULT_MAX_WAIT_DAYS_SHORT_SEA, SCHEDULED_SAIL_DAYS, SHORT_SEA_DISTANCE_KM } from "./tradeSailSchedule";

const STORAGE_KEY = "fmg-trade-logistics-settings";

export type TradeLogisticsSettings = {
  targetUtilization: number;
  minSailUtilization: number;
  maxWaitDaysLand: number;
  maxWaitDaysSea: number;
  maxWaitDaysShortSea: number;
  shortSeaDistanceKm: number;
  /** Calendar days of month for scheduled sailings (1–28 recommended). */
  sailDays: number[];
};

export const DEFAULT_TRADE_LOGISTICS_SETTINGS: Readonly<TradeLogisticsSettings> = {
  targetUtilization: DEFAULT_TARGET_UTILIZATION,
  minSailUtilization: DEFAULT_MIN_SAIL_UTILIZATION,
  maxWaitDaysLand: DEFAULT_MAX_WAIT_DAYS_LAND,
  maxWaitDaysSea: DEFAULT_MAX_WAIT_DAYS_SEA,
  maxWaitDaysShortSea: DEFAULT_MAX_WAIT_DAYS_SHORT_SEA,
  shortSeaDistanceKm: SHORT_SEA_DISTANCE_KM,
  sailDays: [...SCHEDULED_SAIL_DAYS]
};

function clampUtil(value: number): number {
  return minmax(value, 0.05, 1);
}

function clampWaitDays(value: number): number {
  return Math.max(1, Math.min(60, Math.round(value)));
}

function normalizeSailDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TRADE_LOGISTICS_SETTINGS.sailDays];
  const days = raw
    .map(entry => (typeof entry === "number" ? entry : Number(entry)))
    .filter(day => Number.isFinite(day) && day >= 1 && day <= 28)
    .map(day => Math.floor(day));
  const unique = [...new Set(days)].sort((a, b) => a - b);
  return unique.length ? unique : [...DEFAULT_TRADE_LOGISTICS_SETTINGS.sailDays];
}

function loadSettings(): TradeLogisticsSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored)
      return { ...DEFAULT_TRADE_LOGISTICS_SETTINGS, sailDays: [...DEFAULT_TRADE_LOGISTICS_SETTINGS.sailDays] };
    const parsed = JSON.parse(stored) as Partial<TradeLogisticsSettings>;
    return {
      targetUtilization: clampUtil(
        typeof parsed.targetUtilization === "number"
          ? parsed.targetUtilization
          : DEFAULT_TRADE_LOGISTICS_SETTINGS.targetUtilization
      ),
      minSailUtilization: clampUtil(
        typeof parsed.minSailUtilization === "number"
          ? parsed.minSailUtilization
          : DEFAULT_TRADE_LOGISTICS_SETTINGS.minSailUtilization
      ),
      maxWaitDaysLand: clampWaitDays(
        typeof parsed.maxWaitDaysLand === "number"
          ? parsed.maxWaitDaysLand
          : DEFAULT_TRADE_LOGISTICS_SETTINGS.maxWaitDaysLand
      ),
      maxWaitDaysSea: clampWaitDays(
        typeof parsed.maxWaitDaysSea === "number"
          ? parsed.maxWaitDaysSea
          : DEFAULT_TRADE_LOGISTICS_SETTINGS.maxWaitDaysSea
      ),
      maxWaitDaysShortSea: clampWaitDays(
        typeof parsed.maxWaitDaysShortSea === "number"
          ? parsed.maxWaitDaysShortSea
          : DEFAULT_TRADE_LOGISTICS_SETTINGS.maxWaitDaysShortSea
      ),
      shortSeaDistanceKm: Math.max(
        10,
        Math.min(
          500,
          typeof parsed.shortSeaDistanceKm === "number"
            ? parsed.shortSeaDistanceKm
            : DEFAULT_TRADE_LOGISTICS_SETTINGS.shortSeaDistanceKm
        )
      ),
      sailDays: normalizeSailDays(parsed.sailDays)
    };
  } catch (e) {
    console.warn("Failed to load trade logistics settings from localStorage", e);
    return { ...DEFAULT_TRADE_LOGISTICS_SETTINGS, sailDays: [...DEFAULT_TRADE_LOGISTICS_SETTINGS.sailDays] };
  }
}

function persist(settings: TradeLogisticsSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save trade logistics settings", e);
  }
}

export class TradeLogisticsSettingsModule {
  private options: TradeLogisticsSettings = loadSettings();

  getOptions(): Readonly<TradeLogisticsSettings> {
    return this.options;
  }

  getDefaultOptions(): Readonly<TradeLogisticsSettings> {
    return DEFAULT_TRADE_LOGISTICS_SETTINGS;
  }

  configure(partial: Partial<TradeLogisticsSettings>): void {
    const next: TradeLogisticsSettings = {
      ...this.options,
      ...partial,
      sailDays: partial.sailDays !== undefined ? normalizeSailDays(partial.sailDays) : this.options.sailDays
    };
    if (partial.targetUtilization !== undefined) next.targetUtilization = clampUtil(partial.targetUtilization);
    if (partial.minSailUtilization !== undefined) next.minSailUtilization = clampUtil(partial.minSailUtilization);
    if (partial.maxWaitDaysLand !== undefined) next.maxWaitDaysLand = clampWaitDays(partial.maxWaitDaysLand);
    if (partial.maxWaitDaysSea !== undefined) next.maxWaitDaysSea = clampWaitDays(partial.maxWaitDaysSea);
    if (partial.maxWaitDaysShortSea !== undefined) {
      next.maxWaitDaysShortSea = clampWaitDays(partial.maxWaitDaysShortSea);
    }
    if (partial.shortSeaDistanceKm !== undefined) {
      next.shortSeaDistanceKm = Math.max(10, Math.min(500, partial.shortSeaDistanceKm));
    }
    // Keep min ≤ target so policy stays coherent.
    if (next.minSailUtilization > next.targetUtilization) {
      next.minSailUtilization = next.targetUtilization;
    }
    this.options = next;
    persist(next);
  }

  reset(): void {
    this.options = {
      ...DEFAULT_TRADE_LOGISTICS_SETTINGS,
      sailDays: [...DEFAULT_TRADE_LOGISTICS_SETTINGS.sailDays]
    };
    persist(this.options);
  }
}

export const TradeLogisticsSettings = new TradeLogisticsSettingsModule();

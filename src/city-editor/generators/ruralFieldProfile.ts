import { historicalPeriodIndex } from "../../types/historicalPeriod";
import type { RuralFieldSettings, RuralFieldSystem } from "../types/contracts/ruralFields";
import type { HistoricalPeriod } from "../types/document";

export function ruralFieldSystem(
  period?: HistoricalPeriod,
  tradition?: string,
  settings?: RuralFieldSettings
): RuralFieldSystem {
  if (settings?.system) return settings.system;
  const era = historicalPeriodIndex(period ?? "ageOfExploration");
  if (era >= historicalPeriodIndex("petroleumEra")) return "mechanized";
  if (era >= historicalPeriodIndex("steamEra")) return "planned";
  if (["gallic", "celtic", "gaelic"].includes(tradition ?? "") && era >= historicalPeriodIndex("ageOfExploration"))
    return "bocage";
  if (
    ["latinWest", "anglo", "slavic", "germanic"].includes(tradition ?? "") &&
    era >= historicalPeriodIndex("earlyMedieval")
  )
    return "open-field";
  return "planned";
}

export function validRuralFieldSettings(value: unknown): value is RuralFieldSettings | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as RuralFieldSettings;
  return (
    (v.mode === undefined || ["manual", "background", "off"].includes(v.mode)) &&
    (v.range === undefined || ["near-city", "whole-frame"].includes(v.range)) &&
    (v.direction === undefined || ["all", "north", "east", "south", "west"].includes(v.direction)) &&
    (v.coveragePercent === undefined ||
      (Number.isFinite(v.coveragePercent) && v.coveragePercent >= 0 && v.coveragePercent <= 100)) &&
    (v.system === undefined || ["open-field", "bocage", "planned", "mechanized"].includes(v.system)) &&
    (v.rotationYear === undefined || (Number.isSafeInteger(v.rotationYear) && v.rotationYear >= 0)) &&
    (v.gardenRadiusMeters === undefined ||
      (Number.isFinite(v.gardenRadiusMeters) && v.gardenRadiusMeters >= 0 && v.gardenRadiusMeters <= 100_000))
  );
}

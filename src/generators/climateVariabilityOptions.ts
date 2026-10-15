/**
 * Bridges the UI option store and the saved world options for long-period climate variability
 * (docs/plan/wind-aspect-climate-variability.md §4, §5.6).
 */

import { type ClimateVariabilityOptions, normalizeClimateVariability } from "../utils/climateVariability";

export interface ClimateVariabilityOptionSource {
  readonly climateVariabilityStart: ClimateVariabilityOptions["start"];
  readonly climateVariabilityMode: ClimateVariabilityOptions["mode"];
  readonly climateVariabilityPeriodYears: number;
  readonly climateVariabilityDepthC: number;
  readonly climateVariabilityVolcanicPerCentury: number;
}

/** `anchorYear` is the map's start year; it is fixed at generation and kept on live edits. */
export function buildClimateVariabilityOptions(
  source: ClimateVariabilityOptionSource,
  anchorYear: number
): ClimateVariabilityOptions {
  return normalizeClimateVariability({
    start: source.climateVariabilityStart,
    mode: source.climateVariabilityMode,
    periodYears: source.climateVariabilityPeriodYears,
    depthC: source.climateVariabilityDepthC,
    volcanicPerCentury: source.climateVariabilityVolcanicPerCentury,
    anchorYear
  });
}

/**
 * Live edit on a generated map: everything but the anchor follows the UI. Maps saved before the
 * option existed get the current year as their anchor when the user first switches it on.
 */
export function applyClimateVariabilityToWorld(
  worldOptions: { climateVariability?: ClimateVariabilityOptions },
  source: ClimateVariabilityOptionSource,
  fallbackAnchorYear: number
): void {
  const anchor = worldOptions.climateVariability?.anchorYear ?? fallbackAnchorYear;
  worldOptions.climateVariability = buildClimateVariabilityOptions(source, anchor);
}

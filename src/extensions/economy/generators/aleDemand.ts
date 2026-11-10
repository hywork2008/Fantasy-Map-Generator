import type { UrbanWaterSystem } from "./urbanWaterTypes";

/**
 * A deliberately bounded demand response: unsafe urban drinking water makes small ale a more
 * attractive substitute, but it does not imply that every resident stops drinking water.
 */
export const MAX_ALE_WATER_DEMAND_BONUS = 0.5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Primary drinking-water signal, independent of unrelated drainage and odor effects. */
export function getAleWaterRisk(
  system: Pick<UrbanWaterSystem, "waterContamination" | "drinkingWaterSecurity">
): number {
  return clamp01(system.waterContamination * 0.7 + (1 - system.drinkingWaterSecurity) * 0.3);
}

/**
 * Old saves and Economy-disabled maps expose only the host civic score. Keep its effect weaker
 * than direct water measurements because sanitation also includes drainage and street conditions.
 */
export function getAleSanitationFallbackRisk(sanitation: number | undefined): number {
  const normalizedSanitation = Math.max(0, Math.min(100, sanitation ?? 50));
  return clamp01((50 - normalizedSanitation) / 50) * 0.25;
}

export function getAleDemandMultiplier(waterRisk: number): number {
  return 1 + clamp01(waterRisk) * MAX_ALE_WATER_DEMAND_BONUS;
}

/**
 * Town ale a head a year (docs/plan/low-habitability-site-bonus.md §4). Wine-country towns (by the
 * share of their wine the market makes) and treeless pastoral lands drink the country level; between no woodland and `fullAleWoodland` the
 * town level rises linearly. Martin (1703) on Shetland: "they can spare no corn for drink, so that
 * they have no other than bland"; Iceland drank whey and water (blanda) and kept ale for feasts.
 */
export function getTownAleLitersPerAdultYear(
  wineCountryShare: number,
  woodlandShare: number,
  fullAleWoodland: number,
  litres: { readonly baseline: number; readonly urban: number }
): number {
  const woodlandLitres = !(fullAleWoodland > 0)
    ? litres.urban
    : litres.baseline + (litres.urban - litres.baseline) * clamp01(woodlandShare / fullAleWoodland);
  return woodlandLitres + (litres.baseline - woodlandLitres) * clamp01(wineCountryShare);
}

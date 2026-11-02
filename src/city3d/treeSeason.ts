import { resolveTreeAppearance, TREE_PHENOLOGY, type TreeAppearanceState } from "../buildings/landscape/treePhenology";
import type { TreeAppearanceOptions } from "../buildings/landscape/treeSeasonLayers";
import type { TreeSpecies } from "../buildings/landscape/trees";
import type { BurgSiteDescriptor } from "../city-editor/types/contracts/burgSiteDescriptor";
import { EARTH_AXIAL_TILT_DEG } from "../data/earthConfig";
import { getMonthlyMeanTemperaturesC } from "../utils/earthlikeClimate";
import { getDrySeasonCandidates } from "../utils/precipitationSeasonality";

/** CE's display month: the descriptor's own month, or one the viewer picked. Never saved in the city. */
export type TreeDisplayMonth = "descriptor" | number;

/** Grove forms take their fruit timing from the crop calendar; all other trees follow temperature. */
const ORCHARD_TREES = new Set<TreeSpecies>([
  "olive_orchard",
  "date_palm_orchard",
  "date_palm_orchard_male",
  "date_palm_orchard_young"
]);

export interface TreeSeason {
  /** The month drawn, 1–12. */
  month: number;
  /** Equal keys resolve every species to the same look. */
  key: string;
  /**
   * The look of a species this month; undefined while it shows its default model, so the default
   * prototype and its cache key stay shared with views that have no season.
   */
  look(species: TreeSpecies): TreeAppearanceState | undefined;
}

/**
 * Seasonal looks for a CE view (docs/plan/bv-tree-seasonal-appearance.md §8). Undefined when the
 * descriptor carries no monthly temperatures (older files) or no month is known: every tree then
 * keeps its default appearance unless standalone display settings supply a latitude and month.
 */
export function treeSeason(
  descriptor: BurgSiteDescriptor | undefined,
  displayMonth: TreeDisplayMonth = "descriptor",
  standalone?: { latitude: number; month: number }
): TreeSeason | undefined {
  let climate = descriptor?.climate;
  let month = displayMonth === "descriptor" ? descriptor?.date?.month : displayMonth;
  if (!climate?.monthlyMeanTemperatureC || climate.monthlyMeanTemperatureC.length < 12) {
    if (!standalone || !Number.isFinite(standalone.latitude)) return undefined;
    const latitude = Math.max(-90, Math.min(90, standalone.latitude));
    // A sea-level preview climate, not a change to the city's simulated climate or crop calendar.
    const temperatureC = 30 - 36 * Math.sin((latitude * Math.PI) / 180) ** 2;
    climate = {
      temperatureC,
      biomeId: 0,
      monthlyMeanTemperatureC: Array.from(
        getMonthlyMeanTemperaturesC({
          annualMeanTemperatureC: temperatureC,
          latitudeDeg: latitude,
          continentality: 0.5,
          axialTiltDeg: EARTH_AXIAL_TILT_DEG,
          year: 1
        })
      )
    };
    descriptor = undefined;
    month = standalone.month;
  }
  const temperatures = climate.monthlyMeanTemperatureC!;
  if (!month || !Number.isInteger(month) || month < 1 || month > 12) return undefined;
  const waterBuffered = Boolean(descriptor?.rivers?.length || descriptor?.waterbody?.kind === "lake");
  const drySeason = getDrySeasonCandidates({ ...climate, year: descriptor?.date?.year ?? 1 });
  const harvest = descriptor?.economy?.perennialHarvest;
  const looks = new Map<TreeSpecies, TreeAppearanceState | undefined>();
  return {
    month,
    key: `${month}|${temperatures.join(",")}|${JSON.stringify(harvest ?? null)}|${JSON.stringify([climate.annualPrecipitationMm, climate.monthlyPrecipitationMm, climate.precipitationModelVersion, climate.precipitationSeasonalitySource, climate.precipitationSeasonalityConfidence, descriptor?.date?.year, waterBuffered])}`,
    look(species) {
      if (looks.has(species)) return looks.get(species);
      const profile = TREE_PHENOLOGY[species];
      const crop = ORCHARD_TREES.has(species) && profile.perennialCrop ? harvest?.[profile.perennialCrop] : undefined;
      const state = resolveTreeAppearance(species, month, {
        monthlyMeanTemperatureC: temperatures,
        harvestWeights: crop,
        drySeason,
        waterBuffered
      });
      const look = state.appearance === profile.defaultAppearance && !state.autumnPalette ? undefined : state;
      looks.set(species, look);
      return look;
    }
  };
}

/** Factory options and cache-key suffix of a look; both empty for the default model. */
export function treeLookOptions(look: TreeAppearanceState | undefined): {
  options?: TreeAppearanceOptions;
  suffix: string;
} {
  if (!look) return { suffix: "" };
  return {
    options: { appearance: look.appearance, autumnPalette: look.autumnPalette },
    suffix: `|${look.appearance}${look.autumnPalette ? "+autumn" : ""}`
  };
}

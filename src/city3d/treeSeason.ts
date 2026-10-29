import { resolveTreeAppearance, TREE_PHENOLOGY, type TreeAppearanceState } from "../buildings/landscape/treePhenology";
import type { TreeAppearanceOptions } from "../buildings/landscape/treeSeasonLayers";
import type { TreeSpecies } from "../buildings/landscape/trees";
import type { BurgSiteDescriptor } from "../city-editor/types/contracts/burgSiteDescriptor";

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
 * keeps its default appearance.
 */
export function treeSeason(
  descriptor: BurgSiteDescriptor | undefined,
  displayMonth: TreeDisplayMonth = "descriptor"
): TreeSeason | undefined {
  const temperatures = descriptor?.climate.monthlyMeanTemperatureC;
  if (!temperatures || temperatures.length < 12) return undefined;
  const month = displayMonth === "descriptor" ? descriptor.date?.month : displayMonth;
  if (!month || !Number.isInteger(month) || month < 1 || month > 12) return undefined;
  const harvest = descriptor.economy?.perennialHarvest;
  const looks = new Map<TreeSpecies, TreeAppearanceState | undefined>();
  return {
    month,
    key: `${month}|${temperatures.join(",")}|${JSON.stringify(harvest ?? null)}`,
    look(species) {
      if (looks.has(species)) return looks.get(species);
      const profile = TREE_PHENOLOGY[species];
      const crop = ORCHARD_TREES.has(species) && profile.perennialCrop ? harvest?.[profile.perennialCrop] : undefined;
      const state = resolveTreeAppearance(species, month, {
        monthlyMeanTemperatureC: temperatures,
        harvestWeights: crop
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

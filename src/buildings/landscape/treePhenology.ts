import type { PERENNIAL_CROP_PROFILES } from "../../data/perennialCrops";
import type { TreeSpecies } from "./treeSpecies";

/**
 * Seasonal appearances a tree model can show (docs/plan/bv-tree-seasonal-appearance.md §3).
 * They are visual states chosen per month, not botanical growth stages.
 */
export const TREE_APPEARANCES = ["bare", "bloom", "leaf", "unripe", "fruit", "harvested", "autumn"] as const;
export type TreeAppearance = (typeof TREE_APPEARANCES)[number];
export type TreeLeafHabit = "deciduous" | "evergreen" | "leafless";
export type PerennialCropKey = keyof typeof PERENNIAL_CROP_PROFILES;

export interface TreePhenologyProfile {
  leafHabit: TreeLeafHabit;
  /** Every appearance the species supports; the resolver never returns another one. */
  appearances: readonly TreeAppearance[];
  /** The appearance of the current static model, used when no seasonal input is available. */
  defaultAppearance: TreeAppearance;
  /** Rendering hint: whether blossom opens on bare twigs or among young leaves. */
  bloom?: "beforeLeaves" | "withLeaves" | "summer";
  /** Months of visible fruit development before harvest starts; the first is the bloom month. */
  fruitDevelopmentMonths?: number;
  /**
   * First harvest month relative to the local temperature cycle. Seasonal climates use it for
   * timing; the crop calendar only supplies the harvest length there (§5.2).
   */
  harvestAnchor?: { from: "autumn" | "warmest" | "coldest"; offsetMonths: number };
  /** Harvest length without a crop calendar. */
  fruitMonths?: number;
  /**
   * Explicit catalogue key of the perennial crop this tree bears, or for a male pollinator the crop
   * it flowers with; never resolved from display names.
   */
  perennialCrop?: PerennialCropKey;
}

export interface TreeAppearanceState {
  appearance: TreeAppearance;
  /** Foliage uses autumn colours (an `autumn` month, or a fruit tree's fruit/harvest in that month). */
  autumnPalette: boolean;
}

export interface TreeSeasonInput {
  /** Twelve monthly mean temperatures of the cell, January first. */
  monthlyMeanTemperatureC?: ArrayLike<number>;
  /** Twelve monthly harvest weights of the tree's perennial crop from the economy, if planted as a crop. */
  harvestWeights?: ArrayLike<number>;
}

// Deciduous dormancy uses the position of a month within the local annual temperature range, so
// Mediterranean winters at 10 °C still drop leaves while absolute floors keep cold springs bare.
// Initial game coefficients, calibrated on the three reference sites of
// docs/analytics/tree-phenology-t0-20261030.md.
export const TREE_DORMANCY = {
  /** A coldest month at or above this keeps deciduous trees in leaf all year. */
  ceilingC: 13,
  leafOutFraction: 0.3,
  leafOutMinC: 7,
  autumnFraction: 0.55,
  bareFraction: 0.22,
  bareBelowC: 6,
  /** Months at or above this fraction of the range bloom for species without fruit timing. */
  summerBloomFraction: 0.85,
  /** Below this annual range the climate has no usable temperature season; crop calendars time fruit. */
  aseasonalRangeC: 5
} as const;

const EVERGREEN: TreePhenologyProfile = {
  leafHabit: "evergreen",
  appearances: ["leaf"],
  defaultAppearance: "leaf"
};
const FOREST_DECIDUOUS: TreePhenologyProfile = {
  leafHabit: "deciduous",
  appearances: ["bare", "leaf", "autumn"],
  defaultAppearance: "leaf"
};
const POME_ORCHARD = ["bare", "bloom", "leaf", "fruit", "harvested"] as const;

/** One profile per BV species; counts follow §4 of the design. */
export const TREE_PHENOLOGY: Record<TreeSpecies, TreePhenologyProfile> = {
  arabica_coffee: {
    leafHabit: "evergreen",
    appearances: ["bloom", "unripe", "fruit", "harvested"],
    defaultAppearance: "fruit",
    bloom: "withLeaves",
    fruitDevelopmentMonths: 8,
    perennialCrop: "Coffee"
  },
  cacao: {
    leafHabit: "evergreen",
    appearances: ["fruit", "harvested"],
    defaultAppearance: "fruit",
    fruitDevelopmentMonths: 5,
    perennialCrop: "Cocoa"
  },
  sweet_chestnut: {
    leafHabit: "deciduous",
    appearances: ["bare", "bloom", "unripe", "fruit", "harvested"],
    defaultAppearance: "unripe",
    bloom: "summer",
    fruitDevelopmentMonths: 3,
    harvestAnchor: { from: "autumn", offsetMonths: 0 },
    perennialCrop: "Chestnuts"
  },
  lemon: {
    leafHabit: "evergreen",
    appearances: ["unripe", "fruit", "harvested"],
    defaultAppearance: "fruit",
    fruitDevelopmentMonths: 6,
    // The main Mediterranean lemon crop is picked in winter.
    harvestAnchor: { from: "coldest", offsetMonths: -1 },
    perennialCrop: "Lemons"
  },
  common_fig: {
    leafHabit: "deciduous",
    appearances: ["bare", "leaf", "fruit", "harvested"],
    defaultAppearance: "fruit",
    fruitDevelopmentMonths: 4,
    harvestAnchor: { from: "autumn", offsetMonths: -2 },
    perennialCrop: "Figs"
  },
  european_plum: {
    leafHabit: "deciduous",
    appearances: POME_ORCHARD,
    defaultAppearance: "fruit",
    bloom: "beforeLeaves",
    fruitDevelopmentMonths: 4,
    harvestAnchor: { from: "autumn", offsetMonths: -2 },
    perennialCrop: "Plums"
  },
  european_pear: {
    leafHabit: "deciduous",
    appearances: POME_ORCHARD,
    defaultAppearance: "fruit",
    bloom: "beforeLeaves",
    fruitDevelopmentMonths: 4,
    harvestAnchor: { from: "autumn", offsetMonths: -2 },
    perennialCrop: "Pears"
  },
  domestic_apple: {
    leafHabit: "deciduous",
    appearances: POME_ORCHARD,
    defaultAppearance: "fruit",
    bloom: "withLeaves",
    fruitDevelopmentMonths: 5,
    harvestAnchor: { from: "autumn", offsetMonths: -1 },
    perennialCrop: "Apples"
  },
  scots_pine: EVERGREEN,
  european_hornbeam: FOREST_DECIDUOUS,
  pedunculate_oak: FOREST_DECIDUOUS,
  european_beech: FOREST_DECIDUOUS,
  garden_parkland: FOREST_DECIDUOUS,
  norway_spruce: EVERGREEN,
  silver_birch: FOREST_DECIDUOUS,
  sacred_yew: EVERGREEN,
  date_palm: {
    leafHabit: "evergreen",
    appearances: ["bloom", "unripe", "fruit", "harvested"],
    defaultAppearance: "unripe",
    bloom: "withLeaves",
    fruitDevelopmentMonths: 5,
    harvestAnchor: { from: "warmest", offsetMonths: 1 },
    perennialCrop: "Dates"
  },
  // Grove forms share the landscape palm's timing; the male flowers with the crop it pollinates.
  date_palm_orchard: {
    leafHabit: "evergreen",
    appearances: ["bloom", "unripe", "fruit", "harvested"],
    defaultAppearance: "unripe",
    bloom: "withLeaves",
    fruitDevelopmentMonths: 5,
    harvestAnchor: { from: "warmest", offsetMonths: 1 },
    perennialCrop: "Dates"
  },
  date_palm_orchard_male: {
    leafHabit: "evergreen",
    appearances: ["bloom", "leaf"],
    defaultAppearance: "leaf",
    bloom: "withLeaves",
    fruitDevelopmentMonths: 5,
    harvestAnchor: { from: "warmest", offsetMonths: 1 },
    perennialCrop: "Dates"
  },
  date_palm_orchard_young: EVERGREEN,
  // Dry-season leaf fall needs seasonal precipitation, which the host does not provide yet (X01).
  umbrella_thorn: EVERGREEN,
  saxaul: { ...EVERGREEN, leafHabit: "leafless" },
  kapok: EVERGREEN,
  western_red_cedar: EVERGREEN,
  // Alder leaves fall green, so it has no autumn colour.
  black_alder: { leafHabit: "deciduous", appearances: ["bare", "leaf"], defaultAppearance: "leaf" },
  olive: {
    leafHabit: "evergreen",
    appearances: ["leaf", "unripe", "fruit"],
    defaultAppearance: "fruit",
    fruitDevelopmentMonths: 3,
    harvestAnchor: { from: "autumn", offsetMonths: 1 },
    perennialCrop: "Olives"
  },
  olive_orchard: {
    leafHabit: "evergreen",
    appearances: ["leaf", "unripe", "fruit"],
    defaultAppearance: "fruit",
    fruitDevelopmentMonths: 3,
    harvestAnchor: { from: "autumn", offsetMonths: 1 },
    perennialCrop: "Olives"
  },
  silver_fir: EVERGREEN,
  red_mangrove: EVERGREEN,
  tamarisk: {
    leafHabit: "deciduous",
    appearances: ["bare", "bloom", "leaf"],
    defaultAppearance: "bloom",
    bloom: "summer"
  },
  rowan: {
    leafHabit: "deciduous",
    appearances: ["bare", "bloom", "leaf", "fruit", "autumn"],
    defaultAppearance: "fruit",
    bloom: "withLeaves",
    fruitDevelopmentMonths: 4,
    harvestAnchor: { from: "autumn", offsetMonths: -1 },
    fruitMonths: 1
  },
  canary_pine: EVERGREEN,
  mediterranean_cypress: EVERGREEN,
  oriental_evergreen: EVERGREEN,
  sacred_bodhi_and_fig: EVERGREEN,
  peaceful_willow: FOREST_DECIDUOUS
};

/** Substitutes for appearances a species does not support, nearest look first. */
const FALLBACKS: Record<TreeAppearance, readonly TreeAppearance[]> = {
  bare: ["leaf"],
  bloom: ["unripe", "leaf", "harvested"],
  leaf: ["harvested", "unripe"],
  unripe: ["leaf", "harvested"],
  fruit: [],
  harvested: ["leaf", "unripe"],
  autumn: ["harvested", "leaf"]
};

type Phase = "bare" | "leaf" | "autumn";

interface TemperatureCycle {
  temperatures: number[];
  min: number;
  range: number;
  coldest: number;
  warmest: number;
}

function temperatureCycle(temperatures: number[]): TemperatureCycle {
  const min = Math.min(...temperatures);
  return {
    temperatures,
    min,
    range: Math.max(...temperatures) - min,
    coldest: temperatures.indexOf(min),
    warmest: temperatures.indexOf(Math.max(...temperatures))
  };
}

function position(cycle: TemperatureCycle, month: number): number {
  return cycle.range > 0 ? (cycle.temperatures[month] - cycle.min) / cycle.range : 1;
}

/** Months from the coldest up to (not including) the warmest are the warming half. */
function warming(cycle: TemperatureCycle, month: number): boolean {
  return (month - cycle.coldest + 12) % 12 < (cycle.warmest - cycle.coldest + 12) % 12;
}

/** Leaf phase of each month for a deciduous tree; `undefined` when the climate has no dormant season. */
function deciduousPhases(cycle: TemperatureCycle): Phase[] | undefined {
  if (cycle.min >= TREE_DORMANCY.ceilingC) return undefined;
  return cycle.temperatures.map((t, month) => {
    const p = position(cycle, month);
    if (warming(cycle, month))
      return p >= TREE_DORMANCY.leafOutFraction && t >= TREE_DORMANCY.leafOutMinC ? "leaf" : "bare";
    if (p < TREE_DORMANCY.bareFraction || t < TREE_DORMANCY.bareBelowC) return "bare";
    return p < TREE_DORMANCY.autumnFraction ? "autumn" : "leaf";
  });
}

/** First cooling month below the autumn fraction of the annual range. */
function autumnStart(cycle: TemperatureCycle): number {
  for (let i = 0; i < 12; i++) {
    const month = (cycle.warmest + i) % 12;
    if (!warming(cycle, month) && position(cycle, month) < TREE_DORMANCY.autumnFraction) return month;
  }
  return cycle.coldest;
}

/** Contiguous harvest months as [start, length]; undefined when nothing is harvested. */
function calendarHarvest(weights: ArrayLike<number> | undefined): [number, number] | undefined {
  if (!weights) return undefined;
  const fruit = Array.from({ length: 12 }, (_, m) => (weights[m] ?? 0) > 1e-9);
  const length = fruit.filter(Boolean).length;
  if (!length) return undefined;
  return [fruit.every(Boolean) ? 0 : fruit.findIndex((on, m) => on && !fruit[(m + 11) % 12]), length];
}

function readMonthly(values: ArrayLike<number> | undefined): number[] | undefined {
  if (!values || values.length < 12) return undefined;
  const monthly = Array.from({ length: 12 }, (_, m) => Number(values[m]));
  return monthly.every(Number.isFinite) ? monthly : undefined;
}

/**
 * Harvest months of a fruiting tree. Seasonal climates anchor the timing to the temperature cycle
 * and take only the length from the crop calendar; aseasonal climates follow the calendar.
 */
function fruitWindow(
  profile: TreePhenologyProfile,
  cycle: TemperatureCycle | undefined,
  harvestWeights: ArrayLike<number> | undefined
): [number, number] | undefined {
  // A pollinator without fruit still flowers on the timing of the crop it serves.
  if (!profile.appearances.includes("fruit") && !profile.harvestAnchor) return undefined;
  const calendar = profile.perennialCrop ? calendarHarvest(harvestWeights) : undefined;
  const anchor = profile.harvestAnchor;
  if (cycle && anchor && cycle.range >= TREE_DORMANCY.aseasonalRangeC) {
    const base =
      anchor.from === "autumn" ? autumnStart(cycle) : anchor.from === "warmest" ? cycle.warmest : cycle.coldest;
    return [(base + anchor.offsetMonths + 12) % 12, calendar?.[1] ?? profile.fruitMonths ?? 2];
  }
  return calendar;
}

/**
 * The twelve appearances of one tree, January first. Pure: reads only monthly temperatures and,
 * for planted crops, the economy's harvest weights (§5.2). Renderers never derive yield from it.
 */
export function resolveTreeAppearanceYear(species: TreeSpecies, input: TreeSeasonInput = {}): TreeAppearanceState[] {
  const profile = TREE_PHENOLOGY[species];
  const temperatures = readMonthly(input.monthlyMeanTemperatureC);
  const cycle = temperatures && temperatureCycle(temperatures);
  const phases = profile.leafHabit === "deciduous" && cycle ? deciduousPhases(cycle) : undefined;
  const window = fruitWindow(profile, cycle, input.harvestWeights);
  const blooms = profile.appearances.includes("bloom");

  const year: TreeAppearance[] = Array.from({ length: 12 }, () => profile.defaultAppearance);
  if (window) {
    const [start, length] = window;
    const development = profile.fruitDevelopmentMonths ?? 0;
    let dormant = false;
    for (let i = 0; i < 12; i++) {
      const m = (start + i) % 12;
      const beforeHarvest = 12 - i;
      if (i < length) year[m] = "fruit";
      else if (beforeHarvest <= development) year[m] = beforeHarvest === development ? "bloom" : "unripe";
      else {
        // After a dormant winter, leaves before the next bloom are spring foliage, not a harvested tree.
        dormant ||= phases?.[m] === "bare";
        year[m] = dormant ? "leaf" : "harvested";
      }
    }
  } else if (phases) {
    year.fill("leaf");
    if (blooms && profile.bloom === "summer")
      for (let m = 0; m < 12; m++) if (position(cycle!, m) >= TREE_DORMANCY.summerBloomFraction) year[m] = "bloom";
  }

  if (phases) {
    for (let m = 0; m < 12; m++) {
      // Blossom on bare twigs is drawn as bloom; any other bare month shows the winter tree.
      if (phases[m] === "bare" && !(year[m] === "bloom" && blooms)) year[m] = "bare";
      // Developing and ripe fruit keep their look under autumn colours; after harvest the leaves turn.
      else if (phases[m] === "autumn" && (year[m] === "leaf" || year[m] === "harvested")) year[m] = "autumn";
    }
  }

  return year.map((wanted, m) => {
    const appearance = supported(profile, wanted);
    return { appearance, autumnPalette: phases?.[m] === "autumn" && appearance !== "bare" && appearance !== "leaf" };
  });
}

/** The appearance of one month (1–12), matching `simulationContext.currentMonth`. */
export function resolveTreeAppearance(
  species: TreeSpecies,
  month: number,
  input: TreeSeasonInput = {}
): TreeAppearanceState {
  return resolveTreeAppearanceYear(species, input)[(((Math.trunc(month) - 1) % 12) + 12) % 12];
}

function supported(profile: TreePhenologyProfile, wanted: TreeAppearance): TreeAppearance {
  if (profile.appearances.includes(wanted)) return wanted;
  return FALLBACKS[wanted].find(candidate => profile.appearances.includes(candidate)) ?? profile.defaultAppearance;
}

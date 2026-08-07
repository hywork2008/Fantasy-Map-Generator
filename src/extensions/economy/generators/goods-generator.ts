import Alea from "alea";
import { color, shuffler } from "d3";
import { resolveBiomeOutputRate } from "../../../data/biomeEconomy";
import { getCoastalHabitatKey, getNearshoreHabitatKey } from "../../../data/coastalHabitatCatalog";
import type { BiomeTag } from "../../../types/biome";
import { type PackedGraph, SHIP_CLASS_DEFINITIONS, SHIP_VALUE_PER_BUILD_POINT } from "../../hostTypes";
import { TIME } from "../../hostUtils";
import { getGoodCellColumn, getGoods, getWorldContext, setGoodCellColumn, setGoods } from "../economyContext";
import {
  DEMAND_PRIORITY,
  type DemandCategory,
  type Good,
  type GoodTradeProfile,
  type TradeScale,
  type TradeTrend
} from "./goodsGeneratorTypes";
import { getDefaultGoodCargoProfile } from "./tradeCargo";

export type { DemandCategory, Good, GoodTradeProfile, WarEconomyType } from "./goodsGeneratorTypes";
export { DEMAND_PRIORITY } from "./goodsGeneratorTypes";

export const DEMAND_TARGET_FACTORS: Record<DemandCategory, number> = {
  food: 0.2,
  utilities: 0.15,
  construction: 0.1,
  military: 0.08,
  hunting: 0.05,
  luxury: 0.07
};
export const DEMAND_CATEGORY_ICONS: Record<DemandCategory, string> = {
  food: "🍖",
  utilities: "🛠️",
  construction: "🧱",
  military: "🛡️",
  hunting: "🎯",
  luxury: "💎"
};

export function getDemandTargets(population: number): number[] {
  return DEMAND_PRIORITY.map(category => population * DEMAND_TARGET_FACTORS[category]);
}

const GUNPOWDER_ERA_GOODS = new Set(["sulfur", "gunpowder", "artillery", "bullets"]);

/** Returns whether a good is available under the current world's era settings. */
export function isGoodEnabled(good: Pick<Good, "name">): boolean {
  if (getWorldContext().options.gunpowderEraEnabled !== false) return true;
  return !GUNPOWDER_ERA_GOODS.has(good.name.toLowerCase());
}

type GoodData = Omit<Good, "i"> & { recipes?: Record<string, number>[] };
const shipClassById = new Map(SHIP_CLASS_DEFINITIONS.map(shipClass => [shipClass.id, shipClass]));
const shipGoodValue = (shipClassId: string): number => {
  const shipClass = shipClassById.get(shipClassId);
  if (!shipClass) throw new Error(`Unknown ship class: ${shipClassId}`);
  return shipClass.buildPointsRequired * SHIP_VALUE_PER_BUILD_POINT;
};

export const GOODS_DATA: GoodData[] = [
  {
    name: "Wood",
    warEconomyType: "strategic",
    tags: ["construction", "fuel"],
    icon: "good-wood",
    color: "#966F33",
    value: 1,
    chance: 4,
    distribution: 'biomeTag("forest", "wetland")',
    unit: "pile",
    demandCoverage: { construction: 1, utilities: 1 },
    multipliers: { cultureType: { Hunting: 1.5 } },
    biomeOutputByTag: { forest: 0.3, wetland: 0.1 }
  },
  {
    name: "Stone",
    tags: ["construction"],
    icon: "good-stone",
    color: "#979EA2",
    value: 1,
    chance: 4,
    distribution: "(minHeight(40) || (minHeight(20) && elevation())) && biome(1, 2, 3, 4)",
    unit: "pallet",
    demandCoverage: { construction: 1 },
    multipliers: { cultureType: { Hunting: 0.6, Nomadic: 0.6 } },
    biomeOutput: { 1: 0.1, 2: 0.1 }
  },
  {
    name: "Marble",
    warEconomyType: "luxury",
    tags: ["construction", "luxury"],
    icon: "good-marble",
    color: "#d6d0bf",
    value: 8,
    chance: 1,
    distribution: "minHeight(60) || (minHeight(30) && elevation())",
    unit: "pallet",
    demandCoverage: { construction: 0.5, luxury: 0.5 },
    multipliers: { cultureType: { Highland: 1.4 } }
  },
  {
    name: "Iron Ore",
    tags: ["ore", "mineral"],
    icon: "good-iron",
    color: "#5D686E",
    value: 2,
    // Cell placement comes from MineralDeposit/MineOperation (mineralResources.ts), rendered
    // on the mineralDeposits layer, not from this legacy chance/distribution scatter — see Fix 3
    // in docs/plan/mineral-resource-circulation-fixes.md.
    chance: 0,
    unit: "wagon",
    multipliers: { cultureType: { Highland: 1.4 } }
  },
  {
    name: "Copper Ore",
    tags: ["ore", "mineral"],
    icon: "good-copper",
    color: "#b87333",
    value: 2.5,
    chance: 0,
    unit: "wagon",
    multipliers: { cultureType: { Highland: 1.4 } }
  },
  {
    name: "Tin Ore",
    tags: ["ore", "mineral"],
    icon: "good-tin",
    color: "#454343",
    value: 3,
    chance: 0,
    unit: "wagon",
    multipliers: { cultureType: { Highland: 1.4 } }
  },
  {
    name: "Lead Ore",
    tags: ["ore", "mineral"],
    icon: "good-lead",
    color: "#6f7285",
    value: 1.5,
    chance: 0,
    unit: "wagon",
    multipliers: { cultureType: { Highland: 1.4 } }
  },
  {
    name: "Silver Ore",
    tags: ["ore", "mineral"],
    icon: "good-silver",
    color: "#C0C0C0",
    value: 10,
    chance: 0,
    unit: "bullion",
    multipliers: { cultureType: { Hunting: 0.5, Highland: 1.4, Nomadic: 0.5 } }
  },
  {
    name: "Gold Ore",
    tags: ["ore", "mineral"],
    icon: "good-gold",
    color: "#ffd700",
    value: 20,
    chance: 0,
    unit: "bullion",
    multipliers: { cultureType: { Highland: 1.4, Nomadic: 0.5 } }
  },
  {
    name: "Iron Ingot",
    warEconomyType: "strategic",
    tags: ["ingot", "metal", "military"],
    icon: "good-iron",
    color: "#5D686E",
    value: 4,
    chance: 0,
    unit: "wagon"
  },
  {
    name: "Copper Ingot",
    warEconomyType: "strategic",
    tags: ["ingot", "metal"],
    icon: "good-copper",
    color: "#b87333",
    value: 5,
    chance: 0,
    unit: "wagon"
  },
  {
    name: "Tin Ingot",
    warEconomyType: "strategic",
    tags: ["ingot", "metal"],
    icon: "good-tin",
    color: "#454343",
    value: 6,
    chance: 0,
    unit: "wagon"
  },
  {
    name: "Lead Ingot",
    warEconomyType: "strategic",
    tags: ["ingot", "metal", "military", "construction"],
    icon: "good-lead",
    color: "#6f7285",
    value: 3,
    chance: 0,
    unit: "wagon",
    demandCoverage: { construction: 0.3 }
  },
  {
    name: "Silver Ingot",
    warEconomyType: "luxury",
    tags: ["ingot", "metal", "luxury"],
    icon: "good-silver",
    color: "#C0C0C0",
    value: 20,
    chance: 0,
    unit: "bullion"
  },
  {
    name: "Gold Ingot",
    warEconomyType: "luxury",
    tags: ["ingot", "metal", "luxury"],
    icon: "good-gold",
    color: "#ffd700",
    value: 40,
    chance: 0,
    unit: "bullion"
  },
  {
    name: "Grain",
    warEconomyType: "essential",
    tags: ["food", "stapleFood"],
    icon: "good-grain",
    color: "#F5DEB3",
    value: 1,
    chance: 4,
    distribution: "minHabitability(20) && habitability()",
    unit: "wain",
    demandCoverage: { food: 1 },
    multipliers: { cultureType: { River: 1.2, Lake: 1.2, Nomadic: 0.5 } },
    biomeOutputByTag: { arable: 0.08, forest: 0.05 }
  },
  {
    name: "Cattle",
    warEconomyType: "essential",
    // "draft" documents Cattle's role as a plow animal alongside food/leather. The actual
    // agricultural-technology bonus (rural-agtech-investment.md §3.4) keys off this good's
    // biomeOutputByTag grassland/nomadic biomes directly, not this tags array; distinct from
    // Caravan.draftAnimalId, which governs land-route transport speed, not farm labor.
    tags: ["food", "draft", "liveAnimal"],
    icon: "good-cattle",
    color: "#56b000",
    value: 5,
    chance: 4,
    distribution:
      '(biomeTag("grassland") || biomeTag("nomadic")) && !elevation() || (biomeTag("forest") && random(70))',
    unit: "head",
    demandCoverage: { food: 1 },
    multipliers: { cultureType: { Nomadic: 2 } },
    // `arable` added 2026-08-07 (docs/plan/fauna-biome-realism.md §3 Phase H): this good's own
    // `distribution` above already draws Cattle in forest 70% of the time (medieval mixed-farming/
    // wood-pasture flavor), but biomeOutputByTag had no forest-linked entry at all, so the actual
    // economy (husbandry.ts) could never produce Cattle outside grassland/nomadic — on a map with
    // little grassland, all Cattle got crammed into that sliver of land while every temperate/
    // tropical farmland-forest biome (Temperate deciduous forest, Tropical seasonal forest, Central
    // European great forest — all `arable`-tagged) showed zero. Rate is well below grassland's,
    // reflecting real lower livestock density on cleared/mixed farmland vs. open pasture; husbandry.ts
    // needs no change since its pasture ceiling already has a PASTURE_DEFAULT_CEILING fallback for
    // arable-but-not-grassland biomes.
    biomeOutputByTag: { grassland: 0.1, nomadic: 0.08, arable: 0.04 }
  },
  {
    name: "Fish",
    warEconomyType: "essential",
    tags: ["food", "aquatic", "freshFood"],
    icon: "good-fish",
    color: "#7fcdff",
    value: 1,
    chance: 2,
    distribution:
      'nearshoreHabitat("rockyReef", "coralReef", "seagrassMeadow") || shore(-1) && type("ocean", "freshwater", "salt")',
    unit: "wain",
    demandCoverage: { food: 1 },
    multipliers: { cultureType: { River: 1.4, Lake: 1.4, Naval: 1.4, Nomadic: 0.2 } }
  },
  {
    name: "Game",
    warEconomyType: "essential",
    tags: ["food", "freshFood"],
    icon: "good-game",
    color: "#c38a8a",
    value: 2,
    chance: 3,
    distribution: 'biomeTag("forest")',
    unit: "wain",
    demandCoverage: { food: 1 },
    multipliers: { cultureType: { Naval: 0.6, Nomadic: 1.4, Hunting: 2 } },
    // No longer forest-only (2026-08-07, docs/plan/fauna-biome-realism.md §2.2/§3 Phase A): every
    // habitable biome has SOME huntable wildlife in reality (Savanna herds, desert game, etc.).
    // These per-tag rates only gate whether Game enters this biome's production loop at all
    // (getHuntingGameOutput()'s actual monthly yield is hunters x a fixed per-hunter rate, not this
    // number) — relative ordering mirrors faunaPopulation.ts's WILD_GAME_DENSITY_PER_HECTARE_BY_TAG,
    // kept in sync by eye. `distribution` (map-generation resource-icon scatter) stays forest-only —
    // that's a separate, cosmetic upstream mechanic this change doesn't touch.
    biomeOutputByTag: {
      forest: 0.05,
      wetland: 0.045,
      grassland: 0.04,
      scrub: 0.025,
      mountain: 0.02,
      cold: 0.015,
      dry: 0.01,
      desert: 0.005
    }
  },
  {
    // Phase 4 (docs/plan/biome-goods-producer-ecosystem.md §5.3): Wine is no longer directly
    // biome-produced — it's brewed from harvested `Grapes` (+ `Barrels`) via the existing generic
    // recipe/craft pipeline, same as Beer from Grain. viticulture.ts sizes Grapes' harvest instead.
    name: "Wine",
    warEconomyType: "luxury",
    tags: ["food", "luxury"],
    icon: "good-wine",
    color: "#963e48",
    // 2026-08-08 (docs/temp/0807-alcoholic.md): raised from 6 to 8. The old value 6 was chosen only
    // to *clear* { Grapes: 2, Barrels: 1 }'s ingredient cost (2*2 + 1*2 = 6) — a zero-margin recipe by
    // construction. production-generator.ts's makeProductionDecision() rejects any candidate whose
    // projectedGain <= 0, and Wine gets no exemption from that guard just because it's in
    // preservationGoods' first-claim-on-labour set (Phase M) — a zero-margin baseline meant Wine's
    // projectedGain sat at ~0 and routinely dipped negative on live market prices, so Wine was never
    // actually produced despite the priority queue access (confirmed via Balance History export: Grapes
    // piled up ~20x over a year while Wine fell from 4 to 0). value 8 gives a ~33% margin over the same
    // recipe cost, matching Beer's { Grain: 1, Barrels: 1 } margin ratio (value 4 vs cost 3). Vinegar's
    // { Wine: 1 } recipe (below) now costs more than Vinegar's own value, so Vinegar-making will favor
    // its { Honey: 1 } alternative instead — an acceptable, market-rational shift, not a regression.
    value: 8,
    chance: 0,
    recipes: [{ Grapes: 2, Barrels: 1 }],
    unit: "barrel",
    demandCoverage: { food: 0.5, luxury: 0.5 },
    multipliers: { cultureType: { Highland: 1.2, Nomadic: 0.5 } }
  },
  {
    name: "Olives",
    warEconomyType: "essential",
    tags: ["food"],
    icon: "good-olives",
    color: "#BDBD7D",
    value: 3,
    chance: 3,
    distribution: 'biomeTag("scrub") || biome(6) || (biome(4) && random(50) && river())',
    unit: "barrel",
    demandCoverage: { food: 1 },
    multipliers: { cultureType: { Generic: 0.8, Nomadic: 0.5 } },
    biomeOutputByTag: { scrub: 0.15, arable: 0.05 }
  },
  {
    name: "Honey",
    warEconomyType: "essential",
    tags: ["food", "preservative"],
    icon: "good-honey",
    color: "#DCBC66",
    value: 4,
    chance: 3,
    distribution: 'biomeTag("forest")',
    unit: "barrel",
    demandCoverage: { food: 0.5 },
    multipliers: { cultureType: { Generic: 1.2 } },
    biomeOutputByTag: { forest: 0.04 }
  },
  {
    name: "Salt",
    warEconomyType: "essential",
    tags: ["preservative", "mineral"],
    icon: "good-salt",
    color: "#E5E4E5",
    value: 3,
    chance: 3,
    distribution:
      'coastalHabitat("tidalFlat") || shore(1) && type("salt", "dry") || biomeTag("desert") && random(70) || biomeTag("wetland") && nth(10)',
    unit: "bag",
    demandCoverage: { utilities: 1 },
    multipliers: { cultureType: { Naval: 1.2 } },
    // `biomeOutput: { 1: 0.1, 2: 0.1 }` (hotDesert/coldDesert numeric codes only) -> tag-based
    // 2026-08-07 (docs/plan/fauna-biome-realism.md §3 Phase L): the same "distribution says broader
    // than biomeOutput allows" mismatch already found and fixed for Cattle/Elephants/Camels this
    // session. This good's own `distribution` above rolls tidal flats/salt shores/desert(70%)/
    // wetland(10%) — desert dominant, wetland a minor secondary source (matches real coastal
    // salt-panning being a real but smaller supplement to desert/mine salt) — but the actual economic
    // production (this field) only ever fired in desert biomes, leaving Salt structurally undersupplied
    // everywhere else (including every coastal/wetland region the flavor text implies should produce
    // some). `shore(1)`/`coastalHabitat("tidalFlat")` are geographic, not biome-based, so they can't be
    // expressed here at all (no cell-adjacency term exists in resolveBiomeOutputRate) — true
    // distance-from-sea salt economics stay a placeholder gap, not fully closed by this fix.
    biomeOutputByTag: { desert: 0.1, wetland: 0.015 }
  },
  {
    name: "Dates",
    warEconomyType: "essential",
    tags: ["food"],
    icon: "good-dates",
    color: "#dbb2a3",
    value: 7,
    chance: 2,
    distribution: "biome(1)",
    unit: "chest",
    demandCoverage: { food: 1 },
    multipliers: { cultureType: { Hunting: 0.8, Highland: 0.8 } },
    biomeOutput: { 1: 0.1 }
  },
  {
    name: "Horses",
    warEconomyType: "military",
    // See the "draft" note on Cattle above.
    tags: ["supply", "military", "draft", "liveAnimal"],
    icon: "good-horses",
    color: "#ba7447",
    value: 10,
    chance: 4,
    distribution: 'biomeTag("nomadic") || biomeTag("grassland") || (biome(2) && nth(4))',
    unit: "head",
    demandCoverage: { utilities: 0.6, military: 0.4 },
    multipliers: { cultureType: { Nomadic: 2 } },
    // `arable` added 2026-08-07 (docs/plan/fauna-biome-realism.md §3 Phase H) — same rationale as
    // Cattle above: draft/plow horses were a fixture of medieval mixed farmland, not only steppe/
    // grassland cultures. Rate kept below both nomadic and grassland's.
    biomeOutputByTag: { nomadic: 0.06, grassland: 0.05, arable: 0.03 }
  },
  {
    name: "Fodder",
    warEconomyType: "essential",
    // Hay/feed for draft and cavalry animals. Bought by ordinary farms to keep cattle and oxen
    // (civilian demand, "utilities") as well as by the army to keep mounted units in the field
    // ("military", settled monthly by militaryResources.ts against MOUNTED_FODDER_PER_HEAD).
    tags: ["fodder", "supply"],
    icon: "good-grain",
    color: "#c9b458",
    value: 1,
    chance: 4,
    distribution: '(biomeTag("grassland") || biomeTag("arable")) && !elevation()',
    unit: "bale",
    demandCoverage: { utilities: 0.7, military: 0.3 },
    multipliers: { cultureType: { Nomadic: 1.5, River: 1.2 } },
    biomeOutputByTag: { grassland: 0.08, arable: 0.06 }
  },
  {
    name: "Elephants",
    warEconomyType: "military",
    tags: ["supply", "military", "liveAnimal"],
    icon: "good-elephants",
    color: "#C5CACD",
    value: 30,
    chance: 2,
    distribution: "biome(1, 3, 5, 7)",
    unit: "head",
    demandCoverage: { utilities: 0.2, military: 0.8 },
    multipliers: { cultureType: { Highland: 0.2 } },
    // Found 2026-08-07 (docs/plan/fauna-biome-realism.md §2.3): Elephants previously had neither
    // biomeOutput nor biomeOutputByTag, so resolveBiomeOutputRate() always returned 0 and this good
    // never entered production at all, in any biome. Savanna (grassland tag) + tropical forest
    // match real elephant range; low rate reflects the high per-head value (30).
    // `forest` -> `tropical` 2026-08-07 (docs/plan/fauna-biome-realism.md §3 Phase H): a bare
    // "forest" tag matches temperate/cold forest biomes too (Temperate deciduous forest, Taiga,
    // Temperate rainforest, ...), which have no elephant population in reality — every land cell
    // with any forest was getting a token ~1-head "unbreedable" elephant, crowding out the biome's
    // actual real-world livestock (Cattle/Sheep) that the old tag set locked out of forest entirely
    // (see Cattle/Horses/Sheep below). `tropical` (types/biome.ts) is scoped to Savanna/Tropical
    // seasonal forest/Tropical rainforest/Tropical dry forest/Mangrove/Cloud forest only — matches
    // this good's own `distribution` field's original biome(1, 3, 5, 7) intent (minus hotDesert,
    // whose ~0 habitability already makes it a non-producer).
    biomeOutputByTag: { grassland: 0.015, tropical: 0.01 }
  },
  {
    name: "Camels",
    warEconomyType: "military",
    tags: ["supply", "military", "liveAnimal"],
    icon: "good-camels",
    color: "#C19A6B",
    value: 12,
    chance: 3,
    distribution: "biome(1, 2)",
    unit: "head",
    demandCoverage: { utilities: 0.7, military: 0.3 },
    multipliers: { cultureType: { Nomadic: 2, Generic: 0.8 } },
    // Migrated from numeric biomeOutput: { 1: 0.05, 2: 0.05 } (hardcoded hotDesert/coldDesert
    // codes) to tag-based rates 2026-08-07 (docs/plan/fauna-biome-realism.md §2.3/§3 Phase C) — the
    // numeric form silently stops matching if a custom biome catalog reorders codes, and every
    // other liveAnimal good already uses tags. `desert` keeps the original hotDesert/coldDesert
    // rate; `dry` (arid steppe/scrubland — coldSteppe, xericShrubland, Savanna's own "dry" tag)
    // adds camels' broader real-world range at a lower rate.
    biomeOutputByTag: { desert: 0.05, dry: 0.03 }
  },
  {
    name: "Hemp",
    tags: ["clothing", "naval"],
    icon: "good-hemp",
    color: "#069a06",
    value: 1,
    chance: 3,
    distribution: 'biomeTag("forest")',
    unit: "wain",
    multipliers: { cultureType: { River: 1.4, Lake: 1.4 } },
    biomeOutputByTag: { forest: 0.08 }
  },
  {
    name: "Pearls",
    warEconomyType: "luxury",
    tags: ["luxury", "aquatic"],
    icon: "good-pearls",
    color: "#EAE0C8",
    value: 18,
    chance: 2,
    distribution: 'nearshoreHabitat("coralReef") || (shore(-1) && minTemp(18))',
    unit: "pearl",
    demandCoverage: { luxury: 0.6 },
    multipliers: { cultureType: { Naval: 1.4 } }
  },
  {
    name: "Gemstones",
    warEconomyType: "luxury",
    tags: ["luxury", "mineral"],
    icon: "good-gemstones",
    color: "#e463e4",
    value: 20,
    chance: 2,
    distribution: "minHeight(60) || (minHeight(30) && elevation())",
    unit: "gem",
    demandCoverage: { luxury: 0.6 },
    multipliers: { cultureType: { Highland: 1.4 } }
  },
  {
    name: "Dyes",
    warEconomyType: "luxury",
    tags: ["luxury"],
    icon: "good-dyes",
    color: "#fecdea",
    value: 8,
    chance: 1,
    distribution: "shore(-1) || minHabitability(1)",
    unit: "bag",
    multipliers: { cultureType: { Generic: 1.2 } }
  },
  {
    name: "Incense",
    warEconomyType: "luxury",
    tags: ["luxury", "ritual"],
    icon: "good-incense",
    color: "#ebe5a7",
    value: 12,
    chance: 2,
    distribution: 'biomeTag("desert", "scrub") && minTemp(12) || biomeTag("forest") && minTemp(22)',
    unit: "chest",
    demandCoverage: { luxury: 1 }
  },
  {
    name: "Silk",
    warEconomyType: "luxury",
    tags: ["luxury", "clothing"],
    icon: "good-silk",
    color: "#e0f0f8",
    value: 16,
    chance: 1,
    distribution: "biome(7)",
    unit: "bolt",
    demandCoverage: { luxury: 1 },
    multipliers: { cultureType: { River: 1.2, Lake: 1.2 } }
  },
  {
    name: "Spices",
    warEconomyType: "luxury",
    tags: ["luxury"],
    icon: "good-spices",
    color: "#e99c75",
    value: 18,
    chance: 2,
    distribution: 'biomeTag("forest") && minTemp(18)',
    unit: "chest",
    demandCoverage: { luxury: 1 },
    multipliers: { cultureType: { Generic: 1.2 } }
  },
  {
    name: "Amber",
    warEconomyType: "luxury",
    tags: ["luxury"],
    icon: "good-amber",
    color: "#e68200",
    value: 8,
    chance: 2,
    distribution: 'shore(1) && (biomeTag("forest") || biomeTag("cold"))',
    unit: "stone",
    demandCoverage: { luxury: 0.5 },
    multipliers: { cultureType: { Generic: 1.2 } }
  },
  {
    name: "Furs",
    tags: ["clothing", "luxury"],
    icon: "good-furs",
    color: "#8a5e51",
    value: 6,
    chance: 2,
    distribution: 'biomeTag("cold") || biomeTag("forest") || biomeTag("wetland")',
    unit: "pelt",
    demandCoverage: { luxury: 0.5, utilities: 0.3 },
    multipliers: { cultureType: { Hunting: 2 } },
    biomeOutputByTag: { cold: 0.03, forest: 0.02, wetland: 0.02 }
  },
  {
    name: "Sheep",
    tags: ["clothing", "liveAnimal"],
    icon: "good-sheep",
    color: "#53b574",
    value: 1,
    chance: 3,
    distribution: '(biomeTag("grassland") && !elevation()) || (biomeTag("forest") && random(70)) || biomeTag("scrub")',
    unit: "head",
    demandCoverage: { food: 1 },
    multipliers: { cultureType: { Naval: 1.4, Highland: 1.4 } },
    // `arable` added 2026-08-07 (docs/plan/fauna-biome-realism.md §3 Phase H) — same rationale as
    // Cattle above: this good's own `distribution` already draws Sheep in forest 70% of the time,
    // but biomeOutputByTag had no forest-linked entry, locking Sheep out of every
    // temperate/tropical farmland-forest biome.
    biomeOutputByTag: { grassland: 0.1, scrub: 0.08, arable: 0.04 }
  },
  {
    name: "Slaves",
    warEconomyType: "essential",
    tags: ["supply"],
    icon: "good-slaves",
    color: "#757575",
    value: 10,
    chance: 2,
    distribution: "shore(1) && minHabitability(1) && !habitability()",
    unit: "slave",
    demandCoverage: { utilities: 1 },
    multipliers: { cultureType: { Naval: 1.4, Nomadic: 2, Hunting: 0.6, Highland: 0.4 } }
  },
  {
    name: "Tar",
    warEconomyType: "strategic",
    tags: ["naval"],
    icon: "good-tar",
    color: "#727272",
    value: 5,
    chance: 0,
    unit: "barrel",
    demandCoverage: { utilities: 0.4, military: 0.1 },
    multipliers: { cultureType: { Hunting: 1.2 } },
    recipes: [{ Wood: 1 }, { Resin: 0.75 }]
  },
  {
    name: "Sulfur",
    warEconomyType: "strategic",
    tags: ["mineral", "military"],
    icon: "good-sulfur",
    color: "#e4d64b",
    value: 5,
    // Cell placement comes from MineralDeposit/MineOperation (mineralResources.ts), rendered
    // on the mineralDeposits layer, not from this legacy chance/distribution scatter — see Fix 3
    // in docs/plan/mineral-resource-circulation-fixes.md.
    chance: 0,
    unit: "barrel",
    demandCoverage: {}
  },
  {
    name: "Saltpeter",
    warEconomyType: "strategic",
    tags: ["military", "mineral"],
    icon: "good-saltpeter",
    color: "#e6e3e3",
    value: 4,
    chance: 0,
    unit: "barrel",
    demandCoverage: {}
  },
  {
    name: "Coal",
    warEconomyType: "strategic",
    tags: ["fuel"],
    icon: "good-coal",
    color: "#5a6a75",
    value: 2,
    chance: 0,
    unit: "wain",
    demandCoverage: { utilities: 0.5 },
    recipes: [{ Wood: 1.5 }]
  },
  {
    name: "Oil",
    tags: ["fuel"],
    icon: "good-oil",
    color: "#565656",
    value: 4,
    chance: 2,
    distribution: "biome(1, 2, 10) || (shore(-1) && minTemp(18) && random(15))",
    unit: "barrel",
    demandCoverage: { utilities: 1 },
    recipes: [{ Olives: 1 }, { Whales: 1 }]
  },
  {
    name: "Mahogany",
    warEconomyType: "luxury",
    tags: ["luxury"],
    icon: "good-tropicalTimber",
    color: "#a45a52",
    value: 10,
    chance: 1,
    distribution: 'biomeTag("forest") && minTemp(18) && random(50)',
    unit: "pile",
    demandCoverage: { luxury: 1 }
  },
  {
    name: "Whales",
    warEconomyType: "essential",
    tags: ["food", "aquatic", "fuel"],
    icon: "good-whales",
    color: "#7fcdff",
    value: 3,
    chance: 3,
    distribution: "shore(-1) && type('ocean') && maxTemp(7)",
    unit: "barrel",
    demandCoverage: { food: 1, utilities: 0.2 },
    multipliers: { cultureType: { Naval: 1.4, Nomadic: 0.5 } }
  },
  {
    name: "Sugarcane",
    warEconomyType: "essential",
    tags: ["preservative", "food"],
    icon: "good-sugar",
    color: "#7abf87",
    value: 4,
    chance: 3,
    distribution: "biome(7)",
    unit: "bag",
    demandCoverage: { food: 0.6, luxury: 0.4 }
  },
  {
    name: "Tea",
    warEconomyType: "luxury",
    tags: ["luxury"],
    icon: "good-tea",
    color: "#d0f0c0",
    value: 10,
    chance: 2,
    distribution: "minHeight(40) && (biome(5) || (biome(7) || biome(8)))",
    unit: "bag",
    demandCoverage: { luxury: 1 },
    multipliers: { cultureType: { Highland: 1.2 } }
  },
  {
    name: "Tobacco",
    warEconomyType: "luxury",
    tags: ["luxury"],
    icon: "good-tobacco",
    color: "#6D5843",
    value: 8,
    chance: 1,
    distribution: "random(20) && (biome(3) || (biome(5) || biome(6)))",
    unit: "bag",
    demandCoverage: { luxury: 1 }
  },
  {
    name: "Clay",
    warEconomyType: "luxury",
    tags: ["mineral", "construction"],
    icon: "good-clay",
    color: "#b07c60",
    value: 1,
    chance: 5,
    distribution: "minTemp(8) && (shore(1) || river())",
    unit: "wain",
    demandCoverage: { construction: 1 },
    multipliers: { cultureType: { River: 1.4, Lake: 1.4 } }
  },
  {
    // docs/plan/urban-housing-system.md K6/PR-M: construction brick distinct from Ceramics (utilities).
    name: "Brick",
    warEconomyType: "strategic",
    tags: ["construction"],
    icon: "good-clay",
    color: "#a65d3f",
    value: 2,
    chance: 0,
    // Clay body + Wood firing fuel; manufacture pulls Clay/Wood via the recipe pipeline.
    recipes: [{ Clay: 1, Wood: 0.1 }],
    unit: "wain",
    demandCoverage: { construction: 1 },
    multipliers: { cultureType: { River: 1.3, Lake: 1.3 } }
  },
  {
    name: "Volcanic Ash",
    warEconomyType: "luxury",
    tags: ["mineral", "construction"],
    icon: "good-clay",
    color: "#5a4d47",
    value: 3,
    // Cell placement comes from the "volcanic" GeologicalProvinceKind (mineralResources.ts) via
    // VolcanicAshOperations, not from this legacy chance/distribution scatter — same pattern as
    // Iron Ore (see the comment above). docs/plan/urban-construction-industry.md §3.4.
    chance: 0,
    unit: "sack"
  },
  {
    name: "White sand",
    warEconomyType: "luxury",
    tags: ["mineral"],
    icon: "good-sand",
    color: "#e6d69c",
    value: 1,
    chance: 4,
    distribution: "minTemp(8) && (shore(1) || river())",
    unit: "wain",
    multipliers: { cultureType: { River: 1.4, Lake: 1.4 } }
  },
  {
    name: "Leather",
    warEconomyType: "strategic",
    tags: ["clothing", "military"],
    icon: "good-leather",
    color: "#8b5a2b",
    value: 6,
    chance: 0,
    recipes: [{ Cattle: 1 }, { Game: 1 }, { Horses: 0.5 }, { Camels: 0.25 }],
    unit: "roll",
    multipliers: { cultureType: { Naval: 0.6 } }
  },
  {
    name: "Cloth",
    warEconomyType: "strategic",
    tags: ["clothing"],
    icon: "good-cloth",
    color: "#e8e69c",
    value: 5,
    chance: 0,
    recipes: [{ Wool: 1 }, { Hemp: 1 }, { Silk: 0.25 }, { Cotton: 1 }],
    unit: "bolt",
    demandCoverage: { utilities: 0.2 }
  },
  {
    name: "Garments",
    warEconomyType: "essential",
    tags: ["clothing"],
    icon: "good-garments",
    color: "#bd21ec",
    value: 12,
    chance: 0,
    recipes: [
      { Cloth: 1, Dyes: 0.5, Alum: 0.25 },
      { Linen: 0.75, Dyes: 0.5, Alum: 0.25 },
      { Cloth: 0.5, Furs: 1 }
    ],
    unit: "set",
    demandCoverage: { utilities: 1 }
  },
  {
    name: "Ceramics",
    warEconomyType: "luxury",
    tags: ["storage", "construction"],
    icon: "good-ceramics",
    color: "#c1440e",
    value: 4,
    chance: 0,
    recipes: [{ Clay: 1 }],
    unit: "wain",
    demandCoverage: { utilities: 1 }
  },
  {
    name: "Glass",
    warEconomyType: "luxury",
    tags: ["storage", "construction"],
    icon: "good-glass",
    color: "#a0c8e8",
    value: 6,
    chance: 0,
    recipes: [{ "White sand": 1, Potash: 0.5 }],
    unit: "wain",
    demandCoverage: { luxury: 1 },
    multipliers: { cultureType: { Nomadic: 0.2 } }
  },
  {
    name: "Lime",
    warEconomyType: "luxury",
    tags: ["construction"],
    icon: "good-clay",
    color: "#e8e2d0",
    value: 2,
    chance: 0,
    // §7.1 decision 6: intermediate good burnt from Stone, feeding Roman Concrete below.
    recipes: [{ Stone: 1 }],
    unit: "sack"
  },
  {
    name: "Roman Concrete",
    warEconomyType: "luxury",
    tags: ["construction"],
    icon: "good-stone",
    color: "#8c8577",
    value: 6,
    chance: 0,
    // docs/plan/urban-construction-industry.md §3.4, §7.1 decision 3: a direct Stone/Wood
    // substitute for masons (constructionEmployment.ts), not a separate technology-adoption
    // stock — consumed at a lower per-worker rate than raw Stone.
    recipes: [{ "Volcanic Ash": 1, Lime: 1 }],
    unit: "pallet",
    demandCoverage: { construction: 1 }
  },
  {
    name: "Ropes",
    warEconomyType: "strategic",
    tags: ["naval", "construction"],
    icon: "good-ropes",
    color: "#ba9773",
    value: 3,
    chance: 0,
    recipes: [{ Hemp: 1 }, { Reeds: 1 }],
    unit: "coil",
    demandCoverage: { utilities: 1 }
  },
  {
    name: "Paper",
    warEconomyType: "luxury",
    tags: ["ritual", "educational"],
    icon: "good-paper",
    color: "#f5f5dc",
    value: 5,
    chance: 0,
    recipes: [{ Hemp: 1 }, { Reeds: 1 }],
    unit: "ream",
    demandCoverage: {}
  },
  {
    name: "Ink",
    warEconomyType: "luxury",
    tags: ["ritual", "educational"],
    icon: "good-ink",
    color: "#000000",
    value: 7,
    chance: 0,
    recipes: [{ Oil: 1 }, { Dyes: 0.5 }],
    unit: "bottle",
    demandCoverage: {}
  },
  {
    name: "Books",
    warEconomyType: "luxury",
    tags: ["ritual", "educational"],
    icon: "good-books",
    color: "#deb887",
    value: 18,
    chance: 0,
    recipes: [
      { Paper: 1, Ink: 0.5 },
      { Leather: 1, Ink: 0.5 }
    ],
    unit: "volume",
    demandCoverage: { luxury: 1 },
    multipliers: { cultureType: { Nomadic: 0.2, Hunting: 0.5 } }
  },
  {
    name: "Sails",
    tags: ["naval"],
    icon: "good-sails",
    color: "#ffffff",
    value: 8,
    chance: 0,
    recipes: [{ Cloth: 1 }, { Linen: 1 }],
    unit: "set",
    demandCoverage: { military: 1 }
  },
  {
    name: "Sloop",
    warEconomyType: "military",
    seaOnly: true,
    tags: ["naval"],
    icon: "good-ships",
    color: "#654321",
    value: shipGoodValue("sloop"),
    chance: 0,
    unit: "ship",
    demandCoverage: { military: 0.5 },
    multipliers: { cultureType: { Naval: 2 } }
  },
  {
    name: "Caravel",
    warEconomyType: "military",
    seaOnly: true,
    tags: ["naval"],
    icon: "good-ships",
    color: "#654321",
    value: shipGoodValue("caravel"),
    chance: 0,
    unit: "ship",
    demandCoverage: { military: 1.25 },
    multipliers: { cultureType: { Naval: 2 } }
  },
  {
    name: "Galleon",
    warEconomyType: "military",
    seaOnly: true,
    tags: ["naval"],
    icon: "good-ships",
    color: "#654321",
    value: shipGoodValue("galleon"),
    chance: 0,
    unit: "ship",
    demandCoverage: { military: 3 },
    multipliers: { cultureType: { Naval: 2 } }
  },
  {
    name: "Boots",
    warEconomyType: "essential",
    tags: ["clothing", "military"],
    icon: "good-boots",
    color: "#654321",
    value: 7,
    chance: 0,
    recipes: [{ Leather: 1 }, { Furs: 0.5 }],
    unit: "pair",
    demandCoverage: { utilities: 1 }
  },
  {
    name: "Harnesses",
    warEconomyType: "military",
    tags: ["military"],
    icon: "good-harnesses",
    color: "#a0522d",
    value: 10,
    chance: 0,
    recipes: [
      { Leather: 0.5, "Iron Ingot": 0.25 },
      { Leather: 0.5, Bronze: 0.25 },
      { Leather: 0.5, "Copper Ingot": 0.25 }
    ],
    unit: "set",
    demandCoverage: { military: 1 },
    multipliers: { cultureType: { Nomadic: 1.2 } }
  },
  {
    name: "Barrels",
    tags: ["naval", "storage"],
    icon: "good-barrels",
    color: "#b46e3b",
    value: 2,
    chance: 0,
    recipes: [{ Wood: 1 }],
    unit: "barrel",
    demandCoverage: { utilities: 1 }
  },
  {
    name: "Bronze",
    warEconomyType: "strategic",
    tags: ["military"],
    icon: "good-bronze",
    color: "#e46f21",
    value: 8,
    chance: 0,
    recipes: [
      { "Copper Ingot": 0.5, Coal: 1 },
      { "Tin Ingot": 0.5, Coal: 1 }
    ],
    unit: "wagon",
    multipliers: { cultureType: { Highland: 1.2 } }
  },
  {
    name: "Tools",
    warEconomyType: "strategic",
    tags: ["construction", "military"],
    icon: "good-tools",
    color: "#808080",
    value: 14,
    chance: 0,
    recipes: [
      { "Iron Ingot": 0.5, Coal: 1 },
      { Bronze: 0.5, Coal: 1 }
    ],
    unit: "set",
    demandCoverage: { utilities: 1 }
  },
  {
    name: "Arms",
    warEconomyType: "military",
    tags: ["military"],
    icon: "good-arms",
    color: "#333333",
    value: 24,
    chance: 0,
    recipes: [
      { "Iron Ingot": 0.5, Coal: 1, Leather: 0.5 },
      { Bronze: 0.5, Coal: 1, Leather: 0.5 }
    ],
    unit: "set",
    demandCoverage: { military: 1 }
  },
  {
    name: "Arrows",
    // Always available (not gated by gunpowderEraEnabled): fletching predates and outlasts
    // firearms, and hunters keep buying them for game alongside archer regiments (see the
    // "hunting" DemandCategory above). Consumed by archer units in militaryResources.ts.
    warEconomyType: "military",
    tags: ["military", "hunting"],
    icon: "good-arms",
    color: "#8b5a2b",
    value: 3,
    chance: 0,
    recipes: [{ Wood: 0.4, "Iron Ingot": 0.1 }],
    unit: "quiver",
    demandCoverage: { military: 0.5, hunting: 0.5 }
  },
  {
    name: "Gunpowder",
    warEconomyType: "military",
    tags: ["military"],
    icon: "good-gunpowder",
    color: "#b0c4de",
    value: 12,
    chance: 0,
    recipes: [{ Saltpeter: 0.5, Sulfur: 0.25, Coal: 0.5 }],
    unit: "barrel",
    demandCoverage: { military: 2 }
  },
  {
    name: "Bullets",
    // Gunpowder-era good (see GUNPOWDER_ERA_GOODS below): shot for the same firearm units that
    // consume Gunpowder as propellant. Also bought by civilian hunters once firearms exist,
    // same dual-use split as Arrows. Consumed by firearm units in militaryResources.ts.
    warEconomyType: "military",
    tags: ["military", "hunting"],
    icon: "good-lead",
    color: "#5c5c5c",
    value: 6,
    chance: 0,
    recipes: [{ "Lead Ingot": 1 }],
    unit: "pouch",
    demandCoverage: { military: 0.6, hunting: 0.4 }
  },
  {
    name: "Artillery",
    warEconomyType: "military",
    tags: ["military"],
    icon: "good-artillery",
    color: "#cd7f32",
    value: 70,
    chance: 0,
    recipes: [
      { "Iron Ingot": 2, Coal: 1 },
      { Bronze: 1, Coal: 1 }
    ],
    unit: "cannon",
    demandCoverage: { military: 1 }
  },
  {
    name: "Coins",
    // Currency stock is owned by MintLedger. This Good represents exchange and mint services,
    // not a second physical supply of coins that would duplicate Gold/Silver/Copper value.
    tags: ["currency", "service"],
    icon: "good-coins",
    color: "#ffd700",
    value: 45,
    chance: 0,
    unit: "service",
    demandCoverage: { utilities: 0.25 }
  },
  {
    name: "Jewelry",
    tags: ["luxury"],
    icon: "good-jewelry",
    color: "#34861b",
    value: 55,
    chance: 0,
    recipes: [
      { Gemstones: 1, "Gold Ingot": 0.5 },
      { Pearls: 1, "Gold Ingot": 0.5 },
      { Amber: 2, "Gold Ingot": 0.5 },
      { Ivory: 1, "Gold Ingot": 0.5 },
      { Coral: 1, "Gold Ingot": 0.5 },
      { Gemstones: 1, "Silver Ingot": 1 },
      { Pearls: 1, "Silver Ingot": 1 },
      { Amber: 2, "Silver Ingot": 1 },
      { Ivory: 1, "Silver Ingot": 1 },
      { Coral: 1, "Silver Ingot": 1 }
    ],
    unit: "piece",
    demandCoverage: { luxury: 1 }
  },
  {
    name: "Preserved food",
    tags: ["food"],
    icon: "good-salted-fish",
    color: "#c2b280",
    value: 5,
    chance: 0,
    recipes: [
      { Fish: 1, Salt: 1 },
      { Shellfish: 1, Salt: 1 },
      { Cattle: 0.25, Salt: 1 },
      { Game: 1, Salt: 1 },
      { Sheep: 1, Salt: 1 },
      { Pig: 1, Salt: 1 },
      { Fish: 1, Vinegar: 0.5 },
      { Cattle: 0.25, Vinegar: 0.5 },
      { Game: 1, Vinegar: 0.5 },
      { Sheep: 1, Vinegar: 0.5 },
      { Pig: 1, Vinegar: 0.5 },
      { Fish: 1, Wood: 1 }
    ],
    unit: "wain",
    demandCoverage: { food: 1 }
  },
  {
    name: "Vinegar",
    tags: ["food", "preservative"],
    icon: "good-vinegar",
    color: "#9b111e",
    // Bumped from 5 alongside Wine's Phase 4 value increase, to clear { Wine: 1 }'s then-cost of 6.
    // 2026-08-08 (docs/temp/0807-alcoholic.md): Wine's own value rose to 8, so the Wine-leg amount
    // below was reduced from 1 to 0.75 (8 * 0.75 = 6) to keep clearing this unchanged value instead of
    // bumping Vinegar's value itself — which would ripple into Cheese/Preserved food's own { Vinegar }
    // recipe legs (both price off Vinegar's value transitively) the same way the original comment on
    // Wine warned about. Left at breakeven deliberately, same as Wine pre-fix: Vinegar's real margin
    // comes from its { Honey: 1 } leg (cost 4, healthy margin), not from converting valuable Wine.
    value: 6,
    chance: 0,
    recipes: [{ Wine: 0.75 }, { Honey: 1 }],
    unit: "barrel",
    demandCoverage: { utilities: 0.5 }
  },
  {
    // A rural, cell-local dairy-headcount-driven harvest good (dairy.ts's getMilkOutput(), wired
    // into production-utils.ts's getRuralProductionContributions() the same way Grapes is) — it can
    // only be produced in a cell that itself has local Cattle/Sheep/Goats, never another cell's or a
    // pooled market's stock. `freshFood` (no refrigeration) keeps long-haul caravan trade
    // uneconomical without a bespoke non-tradeable flag — see dairy.ts's module doc-comment (Phase K,
    // 2026-08-07, docs/plan/fauna-biome-realism.md §3) for the full history, including why Cheese
    // (below) went back to consuming this as a recipe ingredient instead of computing itself
    // directly the way this good does.
    name: "Milk",
    tags: ["food", "freshFood"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#f5f0e6",
    value: 1,
    chance: 0,
    unit: "jug",
    demandCoverage: { food: 1 }
  },
  {
    // Real cheesemaking curdles Milk with an acid (Salt-brined whey/Vinegar, already modeled below)
    // or rennet (an enzyme, historically extracted from a slaughtered calf/lamb/kid's stomach), not
    // literally the salt/vinegar itself acting alone — added 2026-08-07 (docs/plan/
    // fauna-biome-realism.md §3 Phase N, docs/temp/0807-cheese.md) as a second, independent
    // coagulant path for Cheese's recipe below, alongside Ash. A cheap byproduct of animals already
    // being culled for other liveAnimal goods — modeled as a small direct headcount draw (not tied
    // to dairy specifically; a calf/lamb/kid doesn't have to come from a milking herd) via the
    // standard recipe/Market pipeline, unlike Milk itself.
    name: "Rennet",
    tags: ["preservative"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#e8d5c4",
    value: 4,
    chance: 0,
    recipes: [{ Cattle: 0.03 }, { Sheep: 0.03 }, { Goats: 0.03 }],
    unit: "vial",
    demandCoverage: {}
  },
  {
    // Wood ash — a cheap alkaline coagulant/preservative used historically in some traditional
    // cheeses (alongside surface mold/acidity control), added 2026-08-07 (docs/plan/
    // fauna-biome-realism.md §3 Phase N, docs/temp/0807-cheese.md) as Cheese's third coagulant path.
    // Deliberately modeled as burnt Wood (not raw Wood itself) for the same "actually processed, not
    // just renamed" reasoning as Barrels-from-Wood below. Wood is abundant almost everywhere, so this
    // gives Cheese-making a near-universally available fallback input when Salt/Vinegar/Rennet are
    // locally scarce.
    name: "Ash",
    tags: ["construction"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#b8b8b0",
    value: 1,
    chance: 0,
    recipes: [{ Wood: 1 }],
    unit: "sack",
    demandCoverage: { construction: 0.2 }
  },
  {
    // Cheese consumes Milk (above) rather than Cattle/Sheep/Goats headcount directly — Milk's own
    // cell-local production keeps Cheese-making geographically tied to where the dairy animals are,
    // while Cheese itself stays a normal burg-craft recipe good so Salt/Vinegar demand and craft
    // employment flow through the standard pipeline (2026-08-07 Phase K, see dairy.ts and Milk above).
    // Rennet/Ash recipe variants added 2026-08-07 (Phase N, docs/temp/0807-cheese.md) so Cheese-making
    // isn't bottlenecked behind a single scarce coagulant good — four independent raw-material paths
    // now compete for the same Milk surplus instead of one.
    name: "Cheese",
    tags: ["food"],
    icon: "good-cheese",
    color: "#f5e1a4",
    value: 5,
    chance: 0,
    recipes: [
      { Milk: 3, Salt: 0.25 },
      { Milk: 3, Vinegar: 0.25 },
      { Milk: 3, Rennet: 0.1 },
      { Milk: 3, Ash: 0.15 }
    ],
    unit: "wain",
    demandCoverage: { food: 1 }
  },
  {
    // A second-stage processing good — smoking a finished Cheese for extended shelf life and flavor,
    // not a Milk-coagulation method itself (docs/temp/0807-cheese.md's own distinction). Added
    // 2026-08-07 (Phase N) partly as an additional Milk sink (indirectly, via consuming more Cheese)
    // and partly as a genuine higher-value export good — real-map testing found Milk supply
    // (even after this session's yield-rate cut, see dairy.ts) still outpacing what plain Cheese
    // demand alone could absorb.
    name: "Smoked Cheese",
    tags: ["food", "luxury"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#c68642",
    value: 9,
    chance: 0,
    recipes: [{ Cheese: 1, Wood: 0.5 }],
    unit: "wain",
    demandCoverage: { food: 0.5, luxury: 0.5 }
  },
  {
    name: "Egg",
    tags: ["food"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#f0e2b6",
    value: 1,
    chance: 0,
    recipes: [{ Chicken: 1 }],
    unit: "basket",
    demandCoverage: { food: 1 }
  },
  {
    name: "Beer",
    tags: ["food"],
    icon: "good-beer",
    color: "#fbb117",
    value: 4,
    chance: 0,
    recipes: [
      { Grain: 1, Barrels: 1 },
      { Honey: 0.5, Barrels: 1 }
    ],
    unit: "barrel",
    demandCoverage: { food: 1 }
  },
  {
    name: "Liquor",
    tags: ["food", "luxury"],
    icon: "good-liquor",
    color: "#8a0303",
    value: 12,
    chance: 0,
    recipes: [
      { Grain: 2, Wood: 1, Barrels: 0.5 },
      { Wine: 1, Wood: 1, Barrels: 0.5 },
      { Grain: 2, Wood: 1, Ceramics: 0.25 },
      { Wine: 1, Wood: 1, Ceramics: 0.25 },
      { Grain: 2, Wood: 1, Glass: 0.25 },
      { Wine: 1, Wood: 1, Glass: 0.25 }
    ],
    unit: "vessel",
    demandCoverage: { luxury: 1 }
  },
  {
    name: "Candles",
    tags: ["luxury", "ritual"],
    icon: "good-candles",
    color: "#fffacd",
    value: 10,
    chance: 0,
    recipes: [{ Honey: 2 }, { Oil: 1 }, { Beeswax: 1 }, { Tallow: 1 }],
    unit: "block",
    demandCoverage: { utilities: 0.5, luxury: 0.5 }
  },
  {
    name: "Soap",
    tags: ["luxury", "ritual"],
    icon: "good-soap",
    color: "#e0e4cc",
    value: 6,
    chance: 0,
    recipes: [
      { Olives: 1, Potash: 0.3 },
      { Cattle: 1, Potash: 0.3 },
      { Tallow: 1, Potash: 0.3 }
    ],
    unit: "barrel",
    demandCoverage: { utilities: 0.4, luxury: 0.6 }
  },
  {
    name: "Perfume",
    tags: ["luxury", "ritual"],
    icon: "good-perfume",
    color: "#ff69b4",
    value: 28,
    chance: 0,
    recipes: [
      { Olives: 1, Incense: 0.25, Glass: 0.5 },
      { Olives: 1, Game: 2, Glass: 0.5 },
      { Liquor: 0.25, Incense: 0.25, Whales: 0.5, Ceramics: 0.5 }
    ],
    unit: "bottle",
    demandCoverage: { luxury: 2 }
  },
  // Appended to preserve stable IDs for the existing default catalogue.
  {
    name: "Peat",
    tags: ["fuel"],
    icon: "good-peat",
    color: "#5c4938",
    value: 2,
    chance: 3,
    distribution: 'biomeTag("wetland") && biomeTag("cold") || biomeTag("wetland") && random(35)',
    unit: "bale",
    demandCoverage: { utilities: 0.5 },
    biomeOutputByTag: { wetland: 0.04 }
  },
  {
    name: "Resin",
    tags: ["naval", "ritual"],
    icon: "good-resin",
    color: "#d8912e",
    value: 6,
    chance: 2,
    distribution:
      'biomeTag("forest") && biomeTag("cold") || biomeTag("forest") && biomeTag("mountain") || biomeTag("forest") && random(25)',
    unit: "barrel",
    demandCoverage: { utilities: 0.3, luxury: 0.2 },
    biomeOutputByTag: { forest: 0.03 }
  },
  {
    name: "Medicinal herbs",
    tags: ["luxury", "ritual"],
    icon: "good-medicinal-herbs",
    color: "#668f4d",
    value: 10,
    chance: 2,
    distribution:
      'biomeTag("forest") && biomeTag("mountain") || biomeTag("forest") && biomeTag("wetland") || biomeTag("forest") && random(25)',
    unit: "bundle",
    demandCoverage: { luxury: 0.6 },
    biomeOutputByTag: { forest: 0.025 }
  },
  {
    name: "Shellfish",
    tags: ["food", "aquatic", "freshFood"],
    icon: "good-shellfish",
    color: "#b8c2ad",
    value: 2,
    chance: 3,
    distribution:
      'coastalHabitat("rockyIntertidal", "tidalFlat") || nearshoreHabitat("rockyReef", "coralReef", "seagrassMeadow")',
    unit: "basket",
    demandCoverage: { food: 0.8 }
  },
  {
    name: "Reeds",
    tags: ["construction", "clothing"],
    icon: "good-reeds",
    color: "#9aaf64",
    value: 1,
    chance: 3,
    distribution: 'biomeTag("wetland") || river()',
    unit: "bundle",
    demandCoverage: { utilities: 0.4 },
    biomeOutputByTag: { wetland: 0.06 }
  },
  {
    name: "Goats",
    tags: ["food", "clothing", "supply", "liveAnimal"],
    icon: "good-goats",
    color: "#a98f75",
    value: 3,
    chance: 3,
    distribution: 'biomeTag("scrub") || biomeTag("mountain") || biomeTag("dry") && random(50)',
    unit: "head",
    demandCoverage: { food: 0.8, utilities: 0.2 },
    biomeOutputByTag: { scrub: 0.1, mountain: 0.08, dry: 0.06 }
  },
  {
    name: "Pig",
    warEconomyType: "essential",
    tags: ["food", "liveAnimal"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#e8a0a0",
    value: 2,
    chance: 3,
    // Forest pannage (mast/acorns) and village scrap-feeding, not open grassland droving — pigs
    // historically don't herd well over long distances or arid/nomadic terrain (unlike sheep/goats).
    distribution: 'biomeTag("forest") || (biomeTag("arable") && random(60))',
    unit: "head",
    demandCoverage: { food: 1 },
    multipliers: { cultureType: { Nomadic: 0.2 } },
    biomeOutputByTag: { forest: 0.08, arable: 0.05 }
  },
  {
    name: "Chicken",
    warEconomyType: "essential",
    tags: ["food", "liveAnimal"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#d9c589",
    value: 1,
    chance: 4,
    distribution: "habitability() && random(85)",
    unit: "head",
    demandCoverage: { food: 1 },
    biomeOutputByTag: { arable: 0.04, grassland: 0.03 }
  },
  // Raw-material / processed-good chains: sheared/grown fiber feeds Cloth & Linen so textile
  // manufacturing has an actual import-raw/export-finished trade loop instead of consuming the
  // live-animal Good directly (see docs discussion on medieval wool/flax trade).
  {
    name: "Wool",
    tags: ["clothing"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#f2e9d8",
    value: 2,
    chance: 0,
    recipes: [{ Sheep: 1 }],
    unit: "fleece"
  },
  {
    name: "Flax",
    tags: ["clothing"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#8faee0",
    value: 1,
    chance: 3,
    distribution: '(biomeTag("arable") && river()) || (biomeTag("wetland") && random(40))',
    unit: "bundle",
    multipliers: { cultureType: { River: 1.4, Lake: 1.2 } },
    biomeOutputByTag: { arable: 0.05, wetland: 0.03 }
  },
  {
    name: "Linen",
    warEconomyType: "strategic",
    tags: ["clothing"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#f5f0e6",
    value: 6,
    chance: 0,
    recipes: [{ Flax: 1 }],
    unit: "bolt",
    demandCoverage: { utilities: 0.2 }
  },
  {
    name: "Cotton",
    tags: ["clothing"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#f5f5f0",
    value: 2,
    chance: 3,
    distribution: 'biomeTag("arable") && minTemp(20) && random(50)',
    unit: "bale",
    biomeOutputByTag: { arable: 0.03 }
  },
  {
    name: "Tallow",
    tags: ["fuel"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#e8d9b8",
    value: 2,
    chance: 0,
    recipes: [{ Cattle: 0.4 }, { Sheep: 0.5 }, { Pig: 0.5 }, { Goats: 0.5 }],
    unit: "barrel",
    demandCoverage: { utilities: 0.3 }
  },
  {
    name: "Beeswax",
    tags: ["ritual"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#f0c419",
    value: 5,
    chance: 0,
    recipes: [{ Honey: 0.5 }],
    unit: "block",
    demandCoverage: { utilities: 0.1 }
  },
  {
    name: "Flour",
    warEconomyType: "essential",
    tags: ["food"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#efe1c1",
    value: 1.5,
    chance: 0,
    recipes: [{ Grain: 1 }],
    unit: "sack",
    demandCoverage: { food: 0.3 }
  },
  {
    name: "Bread",
    warEconomyType: "essential",
    tags: ["food"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#d9a66c",
    value: 2,
    chance: 0,
    recipes: [{ Flour: 1 }],
    unit: "loaf",
    demandCoverage: { food: 1 }
  },
  {
    name: "Timber",
    warEconomyType: "strategic",
    tags: ["construction"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#7a5230",
    value: 3,
    chance: 0,
    recipes: [{ Wood: 1.5 }],
    unit: "beam",
    demandCoverage: { construction: 0.5 }
  },
  {
    name: "Alum",
    warEconomyType: "luxury",
    tags: ["mineral"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#e0d8c8",
    value: 9,
    chance: 1,
    distribution: "minHeight(50) || (minHeight(25) && elevation())",
    unit: "sack",
    demandCoverage: { luxury: 0.2 },
    multipliers: { cultureType: { Highland: 1.4 } }
  },
  {
    name: "Potash",
    warEconomyType: "strategic",
    tags: ["mineral"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#c9c2a6",
    value: 3,
    chance: 0,
    recipes: [{ Wood: 2 }],
    unit: "barrel",
    demandCoverage: { utilities: 0.3 }
  },
  {
    name: "Ivory",
    warEconomyType: "luxury",
    tags: ["luxury"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#fff8dc",
    value: 35,
    chance: 0,
    recipes: [{ Elephants: 0.2 }],
    unit: "tusk",
    demandCoverage: { luxury: 0.8 }
  },
  {
    name: "Coral",
    warEconomyType: "luxury",
    tags: ["luxury", "aquatic"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#ff6f61",
    value: 16,
    chance: 2,
    distribution: 'nearshoreHabitat("coralReef")',
    unit: "branch",
    demandCoverage: { luxury: 0.5 },
    multipliers: { cultureType: { Naval: 1.4 } }
  },
  {
    name: "Stockfish",
    warEconomyType: "essential",
    tags: ["food", "preservative"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#c9b896",
    value: 4,
    chance: 0,
    recipes: [{ Fish: 1 }],
    unit: "bundle",
    demandCoverage: { food: 0.8 }
  },
  {
    name: "Spinning Wheel",
    tags: ["construction"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#6b4226",
    value: 12,
    chance: 0,
    recipes: [{ Wood: 1.5, "Iron Ingot": 0.2 }],
    unit: "wheel",
    demandCoverage: { utilities: 0.5 }
  },
  // Gift / court luxury finishes — docs/plan/characters/backstory-profile.md §6.5.5
  {
    name: "Artworks",
    warEconomyType: "luxury",
    tags: ["luxury", "gift", "art"],
    icon: "good-unknown",
    color: "#c45c26",
    value: 32,
    chance: 0,
    recipes: [
      { Dyes: 1, Paper: 1, Ink: 0.5 },
      { Dyes: 1, Cloth: 1 }
    ],
    unit: "piece",
    demandCoverage: { luxury: 1 }
  },
  {
    name: "Sculptures",
    warEconomyType: "luxury",
    tags: ["luxury", "gift", "art"],
    icon: "good-unknown",
    color: "#9aa0a6",
    value: 42,
    chance: 0,
    recipes: [
      { Marble: 1, Tools: 0.2 },
      { Ivory: 1, Tools: 0.2 },
      { Bronze: 1, Tools: 0.2 }
    ],
    unit: "piece",
    demandCoverage: { luxury: 1 }
  },
  {
    name: "Tapestries",
    warEconomyType: "luxury",
    tags: ["luxury", "gift", "art"],
    icon: "good-unknown",
    color: "#6b3fa0",
    value: 28,
    chance: 0,
    recipes: [
      { Cloth: 2, Dyes: 1 },
      { Silk: 1, Dyes: 1 }
    ],
    unit: "hanging",
    demandCoverage: { luxury: 1 }
  },
  {
    name: "Instruments",
    warEconomyType: "luxury",
    tags: ["luxury", "gift", "art"],
    icon: "good-unknown",
    color: "#8b5a2b",
    value: 24,
    chance: 0,
    recipes: [
      { Wood: 1, "Copper Ingot": 0.2 },
      { Mahogany: 1, "Copper Ingot": 0.1 }
    ],
    unit: "set",
    demandCoverage: { luxury: 1 }
  },
  {
    name: "Relics",
    warEconomyType: "luxury",
    tags: ["luxury", "gift", "ritual"],
    icon: "good-unknown",
    color: "#d4af37",
    value: 48,
    chance: 0,
    // Rare finished religious objects; production is intentionally scarce.
    recipes: [
      { Incense: 1, "Gold Ingot": 0.1 },
      { Ivory: 1, Incense: 0.5 }
    ],
    unit: "relic",
    demandCoverage: { luxury: 0.5 }
  },
  // Appended to preserve stable IDs for the existing default catalogue.
  {
    name: "Cats",
    tags: ["liveAnimal", "pestControl"],
    // Cats are deliberately a live good, rather than an abstract pest-control service: future
    // warehouse assignment consumes actual market stock.
    icon: "good-cats",
    color: "#8c8c8c",
    value: 3,
    chance: 0,
    unit: "head",
    biomeOutputByTag: { arable: 0.005, grassland: 0.003 }
  },
  {
    name: "Dogs",
    // "herding" is a forward-looking marker tag (docs/plan/biome-goods-producer-ecosystem.md §5.4,
    // docs/temp/herding-dogs.md): Phase 3's husbandry.ts is expected to read a cell's Dogs headcount
    // to scale up its herdsPerWorker constant — Arnott et al. 2014 (Univ. of Sydney, 800+ Australian
    // farms) found a trained handler+dogs team musters up to 2,000 sheep or 500 cattle, replacing at
    // least one full-time stockperson. Not yet wired to that mechanic; today Dogs is a live good like
    // Cats, produced/traded/stocked but with no active consumer.
    tags: ["liveAnimal", "herding"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#a97142",
    value: 4,
    chance: 0,
    unit: "head",
    multipliers: { cultureType: { Nomadic: 1.6, Hunting: 1.3 } },
    biomeOutputByTag: { grassland: 0.02, nomadic: 0.02, scrub: 0.015, mountain: 0.01 }
  },
  {
    // Phase 4 (§5.3): harvested via viticulture.ts's area/labour model (production-utils.ts special-
    // cases "Grapes" the same way it already special-cases "Game" instead of the generic
    // population x biomeOutputByTag loop) — no biomeOutputByTag here. `distribution`/`chance` are
    // kept only for the cosmetic one-time per-cell "bonus good" placement (same condition Wine used
    // to drive its own production with), purely a map-flavor label now.
    name: "Grapes",
    tags: ["food", "freshFood"],
    icon: "good-unknown",
    color: "#963e48",
    value: 2,
    chance: 3,
    distribution: 'biome(6) || biomeTag("scrub") || (biome(4) && random(50) && river())',
    unit: "basket",
    demandCoverage: { food: 1 },
    multipliers: { cultureType: { Highland: 1.2, Nomadic: 0.5 } }
  },
  {
    // Dried grapes — a preserved good like Stockfish, produced by the existing generic recipe/craft
    // pipeline (production-generator.ts's runWorkerLoop) with zero new processing-stage code.
    name: "Raisins",
    tags: ["food", "preservative"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#6b4423",
    // { Grapes: 2 } costs 2*2 = 4 — value 5 keeps a modest margin instead of breaking even.
    value: 5,
    chance: 0,
    recipes: [{ Grapes: 2 }],
    unit: "bag",
    demandCoverage: { food: 0.8 }
  }
];

function tradeProfile(
  weight: TradeScale,
  bulk: TradeScale,
  rarity: TradeScale,
  distancePremium: TradeTrend,
  timeValueTrend: TradeTrend,
  durability: TradeScale,
  lossRisk: TradeScale
): GoodTradeProfile {
  return { weight, bulk, rarity, distancePremium, timeValueTrend, durability, lossRisk };
}

const DEFAULT_TRADE_PROFILE = tradeProfile(3, 3, 2, 0, 0, 3, 2);

const GOOD_TRADE_PROFILES: Record<string, GoodTradeProfile> = {
  Wood: tradeProfile(4, 5, 1, -1, 0, 4, 2),
  Stone: tradeProfile(5, 5, 1, -2, 0, 5, 1),
  Marble: tradeProfile(5, 5, 4, 1, 0, 4, 3),
  "Iron Ore": tradeProfile(5, 5, 3, -1, 0, 5, 3),
  "Copper Ore": tradeProfile(5, 5, 3, -1, 0, 5, 3),
  "Tin Ore": tradeProfile(5, 5, 4, 0, 0, 5, 3),
  "Lead Ore": tradeProfile(5, 5, 3, -1, 0, 5, 3),
  "Silver Ore": tradeProfile(4, 4, 4, 0, 0, 5, 3),
  "Gold Ore": tradeProfile(4, 4, 5, 0, 0, 5, 3),
  "Iron Ingot": tradeProfile(4, 3, 3, 1, 0, 5, 2),
  "Copper Ingot": tradeProfile(4, 3, 3, 1, 0, 5, 2),
  "Tin Ingot": tradeProfile(3, 2, 4, 2, 0, 5, 2),
  "Lead Ingot": tradeProfile(4, 3, 3, 1, 0, 5, 2),
  "Silver Ingot": tradeProfile(2, 1, 4, 2, 0, 5, 2),
  "Gold Ingot": tradeProfile(2, 1, 5, 3, 0, 5, 2),
  Grain: tradeProfile(4, 4, 1, -1, -1, 2, 3),
  Fodder: tradeProfile(4, 5, 1, -2, -1, 2, 3),
  Cattle: tradeProfile(5, 5, 2, 0, -2, 1, 5),
  Cats: tradeProfile(1, 1, 2, -2, -2, 1, 5),
  // Trained working dogs are a lean, fragile live cargo like Cats — mostly sold/kept locally
  // rather than hauled long distance.
  Dogs: tradeProfile(1, 1, 2, -2, -2, 1, 5),
  // Pigs don't drove well over distance (stress/weight loss), so local sale is preferred even more
  // than Grain's -1; distancePremium keeps that as an economic disincentive, not a hard trade ban.
  Pig: tradeProfile(4, 4, 1, -1, -2, 1, 5),
  // A live bird is cheap and fragile enough that it was essentially never a long-haul trade good —
  // distancePremium matches Stone's -2 ("definitely sell it locally").
  Chicken: tradeProfile(2, 2, 1, -2, -2, 1, 5),
  Fish: tradeProfile(3, 3, 1, -1, -2, 1, 5),
  Game: tradeProfile(3, 3, 2, 0, -2, 1, 5),
  // durability bumped to the 1-5 scale's max (Phase 5, §9.4): wine ages/stores better than most
  // goods, and viticultureAllocation.ts's reallocation-speed smoothing needs Wine and Raisins to
  // actually differ (both were 4 pre-Phase-5) for "Wine reallocates slower than Raisins" to hold.
  Wine: tradeProfile(3, 3, 3, 2, 2, 5, 2),
  Olives: tradeProfile(3, 3, 2, 1, -1, 3, 2),
  Honey: tradeProfile(3, 3, 2, 1, 0, 4, 1),
  Salt: tradeProfile(3, 2, 2, 1, 0, 5, 1),
  Dates: tradeProfile(2, 3, 2, 1, -1, 3, 2),
  Horses: tradeProfile(5, 5, 3, 1, -2, 2, 5),
  Elephants: tradeProfile(5, 5, 5, 2, -2, 1, 5),
  Camels: tradeProfile(5, 5, 3, 1, -2, 2, 5),
  Hemp: tradeProfile(3, 4, 2, 0, 0, 3, 2),
  Pearls: tradeProfile(1, 1, 5, 3, 0, 5, 2),
  Gemstones: tradeProfile(1, 1, 5, 3, 0, 5, 2),
  Dyes: tradeProfile(2, 2, 4, 3, 0, 3, 2),
  Incense: tradeProfile(1, 2, 4, 3, 0, 4, 2),
  Silk: tradeProfile(1, 2, 5, 3, 0, 3, 2),
  Spices: tradeProfile(1, 2, 5, 3, 0, 4, 2),
  Amber: tradeProfile(1, 1, 4, 2, 0, 5, 1),
  Furs: tradeProfile(2, 4, 3, 2, 0, 3, 2),
  Sheep: tradeProfile(5, 5, 2, 0, -2, 1, 5),
  Slaves: tradeProfile(5, 5, 3, 1, -2, 1, 5),
  Tar: tradeProfile(4, 3, 2, 0, 0, 4, 2),
  Sulfur: tradeProfile(3, 3, 4, 2, 0, 4, 2),
  Saltpeter: tradeProfile(3, 3, 4, 2, 0, 4, 2),
  Coal: tradeProfile(5, 4, 2, 0, 0, 5, 2),
  Oil: tradeProfile(3, 3, 2, 1, 0, 4, 2),
  Mahogany: tradeProfile(4, 5, 5, 3, 0, 4, 2),
  Whales: tradeProfile(4, 4, 2, 0, -2, 1, 5),
  Sugarcane: tradeProfile(3, 4, 3, 2, -1, 2, 3),
  Tea: tradeProfile(1, 2, 4, 3, 0, 3, 2),
  Tobacco: tradeProfile(1, 2, 4, 3, 1, 3, 2),
  Clay: tradeProfile(5, 5, 1, -2, 0, 4, 2),
  Brick: tradeProfile(5, 4, 2, -1, 0, 5, 2),
  "White sand": tradeProfile(5, 5, 1, -2, 0, 5, 1),
  Leather: tradeProfile(3, 3, 2, 0, 0, 4, 2),
  Cloth: tradeProfile(2, 3, 2, 1, 0, 3, 2),
  Garments: tradeProfile(2, 3, 3, 2, 0, 3, 2),
  Ceramics: tradeProfile(4, 4, 3, 1, 0, 2, 4),
  Glass: tradeProfile(3, 4, 4, 2, 0, 1, 5),
  Ropes: tradeProfile(3, 4, 2, 0, 0, 4, 2),
  Paper: tradeProfile(1, 2, 3, 2, 0, 2, 3),
  Ink: tradeProfile(1, 1, 3, 2, 0, 3, 2),
  Books: tradeProfile(2, 2, 4, 3, 0, 3, 3),
  Sails: tradeProfile(3, 4, 3, 1, 0, 3, 2),
  Sloop: tradeProfile(5, 5, 5, 0, 0, 4, 3),
  Caravel: tradeProfile(5, 5, 5, 0, 0, 4, 3),
  Galleon: tradeProfile(5, 5, 5, 0, 0, 4, 3),
  Boots: tradeProfile(2, 3, 2, 1, 0, 4, 2),
  Harnesses: tradeProfile(3, 3, 3, 1, 0, 4, 2),
  Barrels: tradeProfile(4, 5, 1, -1, 0, 4, 2),
  Bronze: tradeProfile(5, 4, 3, 1, 0, 5, 2),
  Tools: tradeProfile(4, 3, 3, 2, 0, 5, 2),
  Arms: tradeProfile(4, 3, 4, 2, 0, 5, 3),
  Arrows: tradeProfile(2, 2, 2, 1, 0, 3, 3),
  Gunpowder: tradeProfile(3, 3, 4, 2, 0, 2, 5),
  Bullets: tradeProfile(2, 1, 3, 1, 0, 4, 3),
  Artillery: tradeProfile(5, 5, 4, 1, 0, 5, 3),
  Coins: tradeProfile(2, 1, 5, 3, 0, 5, 3),
  Jewelry: tradeProfile(1, 1, 5, 3, 0, 4, 3),
  "Preserved food": tradeProfile(4, 4, 2, 1, 0, 4, 2),
  Vinegar: tradeProfile(3, 3, 2, 1, 1, 4, 2),
  Cheese: tradeProfile(3, 3, 3, 1, 1, 3, 2),
  // Room-temperature shelf life of roughly a month (unwashed) puts this alongside Preserved food's
  // "keeps a while, not a fast-decay good" timeValueTrend, not the freshFood day-count model — but
  // low value density and fragility (durability/lossRisk) mean it's still not worth hauling far.
  Egg: tradeProfile(2, 3, 1, 1, 0, 2, 3),
  Beer: tradeProfile(4, 4, 2, 1, -1, 2, 3),
  Liquor: tradeProfile(2, 2, 4, 2, 1, 4, 2),
  Candles: tradeProfile(2, 3, 3, 1, 0, 3, 2),
  Soap: tradeProfile(3, 3, 3, 1, 0, 4, 2),
  Perfume: tradeProfile(1, 1, 5, 3, 0, 3, 3),
  Peat: tradeProfile(4, 4, 2, 0, 0, 4, 2),
  Resin: tradeProfile(2, 2, 3, 2, 0, 4, 2),
  "Medicinal herbs": tradeProfile(1, 2, 4, 3, -1, 2, 3),
  Shellfish: tradeProfile(3, 3, 2, 0, -2, 1, 5),
  Reeds: tradeProfile(3, 4, 1, -1, 0, 3, 2),
  Goats: tradeProfile(4, 4, 2, 0, -2, 1, 5),
  Wool: tradeProfile(3, 4, 2, 1, 0, 4, 1),
  Flax: tradeProfile(3, 4, 2, 0, 0, 3, 2),
  Linen: tradeProfile(2, 3, 3, 2, 0, 3, 2),
  Cotton: tradeProfile(3, 4, 3, 1, 0, 3, 2),
  Tallow: tradeProfile(4, 3, 1, 0, -1, 2, 3),
  Beeswax: tradeProfile(2, 2, 3, 2, 0, 5, 1),
  Flour: tradeProfile(4, 4, 1, -1, -1, 1, 3),
  Bread: tradeProfile(3, 3, 1, -2, -2, 1, 4),
  Timber: tradeProfile(4, 5, 2, 0, 0, 4, 2),
  Alum: tradeProfile(3, 3, 4, 2, 0, 5, 1),
  Potash: tradeProfile(4, 4, 2, 0, 0, 4, 2),
  Ivory: tradeProfile(1, 1, 5, 3, 0, 5, 2),
  Coral: tradeProfile(1, 1, 4, 3, 0, 4, 2),
  Stockfish: tradeProfile(3, 3, 2, 1, 0, 4, 2),
  "Spinning Wheel": tradeProfile(4, 4, 3, 1, 0, 4, 2),
  // Fresh fruit spoils faster than Grain (durability/timeValueTrend below Grain's tradeProfile(4,4,1,-1,-1,2,3)).
  Grapes: tradeProfile(4, 4, 1, -1, -2, 1, 3),
  // Dried, shelf-stable — same profile class as Stockfish.
  Raisins: tradeProfile(3, 3, 2, 1, 0, 4, 2)
};

export function getDefaultGoodTradeProfile(good: Pick<Good, "name" | "tags" | "unit" | "value">): GoodTradeProfile {
  const profile = GOOD_TRADE_PROFILES[good.name];
  if (profile) return { ...profile };

  const isLuxury = good.tags.includes("luxury") || good.value >= 8;
  const isFood = good.tags.includes("food");
  const isMineral = good.tags.includes("mineral") || good.tags.includes("ore");
  const isLiveCargo = good.unit === "head" || good.unit === "slave";

  return {
    ...DEFAULT_TRADE_PROFILE,
    weight: isMineral ? 5 : isLiveCargo ? 5 : isLuxury ? 2 : DEFAULT_TRADE_PROFILE.weight,
    bulk: isLiveCargo ? 5 : isLuxury ? 2 : DEFAULT_TRADE_PROFILE.bulk,
    rarity: isLuxury ? 4 : DEFAULT_TRADE_PROFILE.rarity,
    distancePremium: isLuxury ? 2 : DEFAULT_TRADE_PROFILE.distancePremium,
    timeValueTrend: isFood || isLiveCargo ? -1 : DEFAULT_TRADE_PROFILE.timeValueTrend,
    durability: isFood || isLiveCargo ? 2 : DEFAULT_TRADE_PROFILE.durability,
    lossRisk: isLiveCargo ? 5 : isFood ? 3 : DEFAULT_TRADE_PROFILE.lossRisk
  };
}

export class GoodsModule {
  private get worldContext() {
    return getWorldContext();
  }

  private cells!: PackedGraph["cells"];
  private cellId: number = 0;
  private goodById: Good[] = [];

  // Place a bonus good on every eligible cell based on the current catalogue
  generate(options: { randomSeed?: number } = {}) {
    TIME && console.time("generateGoods");
    Math.random = Alea(options.randomSeed ?? this.worldContext.seed);
    const shuffle = shuffler(() => Math.random());

    if (!getGoods().length) this.restoreDefaults();

    this.cells = this.worldContext.pack.cells;
    const goodColumn = new Uint16Array(this.cells.i.length);
    setGoodCellColumn(goodColumn);

    const resourceMaxCells = Math.ceil((200 * this.cells.i.length) / 5000);
    const resources: Record<number, number> = {};

    const methods = `{${Object.keys(this.getMethods()).join(", ")}}`;
    const shuffledCells = shuffle(Array.from(this.cells.i));
    const goods = getGoods().filter(isGoodEnabled);

    for (const cellId of shuffledCells) {
      if (!(cellId % 10)) shuffle(goods);
      if (this.cells.biomeCode[cellId] === 11 && this.worldContext.biomesData.habitability[11] === 0) continue; // skip glaciers
      this.cellId = cellId;

      for (const good of goods) {
        if (!good.distribution || !good.chance) continue;
        if (resources[good.i] >= resourceMaxCells) continue;
        if (Math.random() * 100 > good.chance) continue;

        const spread = new Function(methods, `return ${good.distribution}`);
        if (!spread(this.getMethods())) continue;

        goodColumn[cellId] = good.i;
        resources[good.i] = (resources[good.i] || 0) + 1;
        break;
      }
    }

    TIME && console.timeEnd("generateGoods");
    this.sync();
  }

  regeneratePlacement(goodId: number) {
    this.sync();
    const good = this.get(goodId);
    if (!good) return;

    TIME && console.time("regenerateGoodPlacement");
    this.cells = this.worldContext.pack.cells;
    let goodColumn = getGoodCellColumn();
    if (!goodColumn.length || goodColumn.length !== this.cells.i.length) {
      goodColumn = new Uint16Array(this.cells.i.length);
      setGoodCellColumn(goodColumn);
    }

    for (const cellId of this.cells.i) {
      if (goodColumn[cellId] === goodId) goodColumn[cellId] = 0;
    }

    if (!isGoodEnabled(good)) {
      TIME && console.timeEnd("regenerateGoodPlacement");
      return;
    }

    if (!good.distribution || !good.chance) {
      TIME && console.timeEnd("regenerateGoodPlacement");
      return;
    }

    const resourceMaxCells = Math.ceil((200 * this.cells.i.length) / 5000);
    const resources: Record<number, number> = {};
    const methods = `{${Object.keys(this.getMethods()).join(", ")}}`;
    const shuffledCells = shuffler(() => Math.random())(Array.from(this.cells.i));
    const spread = new Function(methods, `return ${good.distribution}`);

    for (const cellId of shuffledCells) {
      if (this.cells.biomeCode[cellId] === 11 && this.worldContext.biomesData.habitability[11] === 0) continue; // skip glaciers
      this.cellId = cellId;

      if (goodColumn[cellId]) continue;
      if (resources[good.i] >= resourceMaxCells) continue;
      if (Math.random() * 100 > good.chance) continue;

      if (!spread(this.getMethods())) continue;

      goodColumn[cellId] = good.i;
      resources[good.i] = (resources[good.i] || 0) + 1;
    }

    TIME && console.timeEnd("regenerateGoodPlacement");
  }

  /**
   * Gives a newly promoted settlement an urban bonus good suited to the cell's
   * biome. Existing deposits are retained: a mine or other mapped resource is
   * already a more specific local product than the biome fallback.
   */
  assignBiomeProduct(cellId: number): number | null {
    const cells = this.worldContext.pack.cells;
    let goodColumn = getGoodCellColumn();
    if (goodColumn.length !== cells.i.length) {
      goodColumn = new Uint16Array(cells.i.length);
      setGoodCellColumn(goodColumn);
    }
    if (cellId < 0 || cellId >= cells.i.length || goodColumn[cellId]) return null;

    const biomeId = cells.biomeCode[cellId];
    const biomesData = this.worldContext.biomesData;
    const matchingGoods = getGoods().filter(good => {
      if (!isGoodEnabled(good)) return false;
      return resolveBiomeOutputRate(biomeId, good.biomeOutput, good.biomeOutputByTag, biomesData) > 0;
    });
    if (!matchingGoods.length) return null;

    // The map-cell id makes the choice stable across saves and reloads while
    // sharing compatible biome products between nearby new settlements.
    const selected = matchingGoods[(cellId + biomeId) % matchingGoods.length];
    goodColumn[cellId] = selected.i;
    return selected.i;
  }

  restoreDefaults() {
    setGoods(structuredClone(this.defaultGoods));
    this.sync();
  }

  getMethods(cellId: number = this.cellId) {
    return {
      random: (number: number) => number >= 100 || (number > 0 && number / 100 > Math.random()),
      nth: (number: number) => !(cellId % number),
      minHabitability: (min: number) =>
        this.worldContext.biomesData.habitability[this.worldContext.pack.cells.biomeCode[cellId]] >= min,
      habitability: () => this.worldContext.biomesData.habitability[this.cells.biomeCode[cellId]] > Math.random() * 100,
      elevation: () => this.worldContext.pack.cells.h[cellId] / 100 > Math.random(),
      biome: (...biomes: number[]) => biomes.includes(this.worldContext.pack.cells.biomeCode[cellId]),
      biomeTag: (...tags: string[]) => {
        const code = this.worldContext.pack.cells.biomeCode[cellId];
        const cellTags = this.worldContext.biomesData.tags?.[code] ?? [];
        return tags.some(t => cellTags.includes(t as BiomeTag));
      },
      minHeight: (heigh: number) => this.worldContext.pack.cells.h[cellId] >= heigh,
      maxHeight: (heigh: number) => this.worldContext.pack.cells.h[cellId] <= heigh,
      minTemp: (temp: number) => this.worldContext.grid.cells.temp[this.worldContext.pack.cells.g[cellId]] >= temp,
      maxTemp: (temp: number) => this.worldContext.grid.cells.temp[this.worldContext.pack.cells.g[cellId]] <= temp,
      shore: (...rings: number[]) => rings.includes(this.worldContext.pack.cells.t[cellId]),
      type: (...types: string[]) => {
        const feature = this.worldContext.pack.features[this.worldContext.pack.cells.f[cellId]];
        return types.includes(feature.group || feature.type);
      },
      coastalHabitat: (...habitats: string[]) => {
        const code = this.worldContext.pack.cells.coastalHabitat?.[cellId] ?? 0;
        return habitats.includes(getCoastalHabitatKey(code));
      },
      nearshoreHabitat: (...habitats: string[]) => {
        const code = this.worldContext.pack.cells.nearshoreHabitat?.[cellId] ?? 0;
        return habitats.includes(getNearshoreHabitatKey(code));
      },
      river: () => this.worldContext.pack.cells.r[cellId]
    };
  }

  getBiomesProduction(): Record<number, { goodId: number; production: number }[]> {
    const biomesData = this.worldContext.biomesData;
    const codes = biomesData.i?.length
      ? biomesData.i
      : Array.from({ length: biomesData.name?.length ?? 0 }, (_, i) => i);
    return getGoods().reduce(
      (acc, good) => {
        if (!isGoodEnabled(good)) return acc;
        if (!good.biomeOutput && !good.biomeOutputByTag) return acc;
        for (const biomeId of codes) {
          const production = resolveBiomeOutputRate(biomeId, good.biomeOutput, good.biomeOutputByTag, biomesData);
          if (production) {
            if (!acc[biomeId]) acc[biomeId] = [];
            acc[biomeId].push({ goodId: good.i, production });
          }
        }
        return acc;
      },
      {} as Record<number, { goodId: number; production: number }[]>
    );
  }

  getStroke(colorHex: string): string {
    const c = color(colorHex);
    return c ? c.darker(2).formatHex() : colorHex;
  }

  get(i: number): Good | undefined {
    return this.goodById[i];
  }

  /** True only while a catalogue entry still exactly matches its shipped definition. */
  isUnmodifiedDefault(good: Readonly<Good>): boolean {
    const defaultGood = this.defaultGoods[good.i - 1];
    return defaultGood?.name === good.name && JSON.stringify(defaultGood) === JSON.stringify(good);
  }

  sync() {
    this.goodById = [];
    for (const good of getGoods()) this.goodById[good.i] = good;
  }

  /** Returns a detached shipped default, for additive migrations of existing catalogues. */
  getDefaultGood(name: string): Good | undefined {
    const good = this.defaultGoods.find(candidate => candidate.name === name);
    return good ? structuredClone(good) : undefined;
  }

  private readonly defaultGoods = GOODS_DATA.map((good, index): Good => {
    let recipes: Good["recipes"];
    if ("recipes" in good && good.recipes) {
      recipes = good.recipes.map(recipe => {
        const entries = Object.entries(recipe).map(([key, value]) => {
          const i = GOODS_DATA.findIndex(g => g.name === key);
          if (i === -1) throw new Error(`Unknown ingredient ${key} in good ${good.name}`);
          return [i + 1, value];
        });
        return Object.fromEntries(entries);
      });
    }

    const trade = good.trade ?? getDefaultGoodTradeProfile(good);
    return {
      i: index + 1,
      ...good,
      trade,
      cargo: good.cargo ?? getDefaultGoodCargoProfile({ ...good, trade }),
      ...(recipes && { recipes })
    };
  });
}

export const Goods = new GoodsModule();

const LIVE_ANIMAL_GOOD_NAMES = new Set([
  "Cattle",
  "Horses",
  "Elephants",
  "Camels",
  "Sheep",
  "Goats",
  "Pig",
  "Chicken",
  "Cats"
]);

/**
 * Adds Cats to catalogues saved before the live pest-control good existed. It deliberately does
 * not seed stock: only a future production pass may create new animals.
 */
export function migrateLiveCatsGood(): boolean {
  const goods = getGoods();
  if (goods.some(good => good.name === "Cats")) return false;

  const cats = Goods.getDefaultGood("Cats");
  if (!cats) throw new Error("Cats must be present in the shipped goods catalogue");
  cats.i = goods.reduce((maxId, good) => Math.max(maxId, good.i), 0) + 1;
  goods.push(cats);
  return true;
}

/**
 * Adds Dogs to catalogues saved before the live herding good existed (docs/plan/
 * biome-goods-producer-ecosystem.md §5.4). Same shape as migrateLiveCatsGood: deliberately does
 * not seed stock, only a future production pass may create new animals.
 */
export function migrateLiveDogsGood(): boolean {
  const goods = getGoods();
  if (goods.some(good => good.name === "Dogs")) return false;

  const dogs = Goods.getDefaultGood("Dogs");
  if (!dogs) throw new Error("Dogs must be present in the shipped goods catalogue");
  dogs.i = goods.reduce((maxId, good) => Math.max(maxId, good.i), 0) + 1;
  goods.push(dogs);
  return true;
}

/**
 * Adds Grapes to catalogues saved before Phase 4 (docs/plan/biome-goods-producer-ecosystem.md
 * §5.3). Run before migrateRaisinsGood()/migrateWineRecipe() in the same pass — both need Grapes'
 * id, already assigned to this save (not the shipped catalogue's default id), to build their recipes.
 */
export function migrateGrapesGood(): boolean {
  const goods = getGoods();
  if (goods.some(good => good.name === "Grapes")) return false;

  const grapes = Goods.getDefaultGood("Grapes");
  if (!grapes) throw new Error("Grapes must be present in the shipped goods catalogue");
  grapes.i = goods.reduce((maxId, good) => Math.max(maxId, good.i), 0) + 1;
  goods.push(grapes);
  return true;
}

/** Adds Raisins (`{ Grapes: 2 }` recipe) to catalogues saved before Phase 4. No-ops if Grapes
 * hasn't been migrated into this save yet — call migrateGrapesGood() first in the same pass. */
export function migrateRaisinsGood(): boolean {
  const goods = getGoods();
  if (goods.some(good => good.name === "Raisins")) return false;
  const grapes = goods.find(good => good.name === "Grapes");
  if (!grapes) return false;

  const raisins = Goods.getDefaultGood("Raisins");
  if (!raisins) throw new Error("Raisins must be present in the shipped goods catalogue");
  raisins.i = goods.reduce((maxId, good) => Math.max(maxId, good.i), 0) + 1;
  raisins.recipes = [{ [grapes.i]: 2 }]; // this save's actual Grapes id, not the shipped catalogue's
  goods.push(raisins);
  return true;
}

/**
 * Upgrades a pre-Phase-4 Wine entry (population x biome-rate production) to the new
 * `{ Grapes, Barrels }` recipe form, stripping the now-unused distribution/biomeOutputByTag
 * fields. No-ops if Wine already has a recipe (already migrated) or Grapes hasn't been migrated
 * into this save yet — call migrateGrapesGood() first in the same pass. Existing Market stock
 * keeps accumulating under the same Good id; only the production mechanism changes.
 */
export function migrateWineRecipe(): boolean {
  const goods = getGoods();
  const wine = goods.find(good => good.name === "Wine");
  if (!wine || wine.recipes) return false;
  const grapes = goods.find(good => good.name === "Grapes");
  const barrels = goods.find(good => good.name === "Barrels");
  if (!grapes || !barrels) return false;

  wine.recipes = [{ [grapes.i]: 2, [barrels.i]: 1 }];
  wine.chance = 0;
  delete wine.distribution;
  delete wine.biomeOutputByTag;
  return true;
}

/** Adds the liveAnimal tag to shipped living animals in catalogues saved before the tag existed. */
export function migrateLiveAnimalTags(): boolean {
  let changed = false;
  for (const good of getGoods()) {
    if (!LIVE_ANIMAL_GOOD_NAMES.has(good.name) || good.tags.includes("liveAnimal")) continue;
    good.tags.push("liveAnimal");
    changed = true;
  }
  return changed;
}

const LEGACY_METAL_NAMES = ["Iron", "Copper", "Tin", "Lead", "Silver", "Gold"] as const;
type LegacyMetalName = (typeof LEGACY_METAL_NAMES)[number];

const LEGACY_INGOT_PROPERTIES: Record<LegacyMetalName, Pick<Good, "tags" | "warEconomyType">> = {
  Iron: { tags: ["ingot", "metal", "military"], warEconomyType: "strategic" },
  Copper: { tags: ["ingot", "metal"], warEconomyType: "strategic" },
  Tin: { tags: ["ingot", "metal"], warEconomyType: "strategic" },
  Lead: { tags: ["ingot", "metal", "military", "construction"], warEconomyType: "strategic" },
  Silver: { tags: ["ingot", "metal", "luxury"], warEconomyType: "luxury" },
  Gold: { tags: ["ingot", "metal", "luxury"], warEconomyType: "luxury" }
};

/**
 * Upgrades pre-Phase-A catalogues in place. Existing metal stock keeps its Good id but becomes
 * Ore; the newly appended Ingot starts with no stock. This deliberately avoids creating wealth
 * during migration and lets the Phase-B smelter become the sole source of Ingots.
 */
export function migrateLegacyOreIngotGoods(): boolean {
  const goods = getGoods();
  const legacyMetals = goods.filter(good => (LEGACY_METAL_NAMES as readonly string[]).includes(good.name));
  if (!legacyMetals.length) return false;

  let nextId = goods.reduce((maxId, good) => Math.max(maxId, good.i), 0) + 1;
  const ingotIdByLegacyGoodId = new Map<number, number>();

  for (const ore of legacyMetals) {
    const legacyName = ore.name as LegacyMetalName;
    const ingotId = nextId++;
    const ingotProperties = LEGACY_INGOT_PROPERTIES[legacyName];
    const ingotValue = ore.value;

    ingotIdByLegacyGoodId.set(ore.i, ingotId);
    ore.name = `${legacyName} Ore`;
    ore.tags = ["ore", "mineral"];
    ore.warEconomyType = undefined;
    ore.value = ingotValue / 2;
    ore.chance = 0;
    ore.trade = getDefaultGoodTradeProfile(ore);
    delete ore.distribution;
    delete ore.biomeOutput;
    delete ore.biomeOutputByTag;
    delete ore.demandCoverage;

    const ingot: Good = {
      i: ingotId,
      name: `${legacyName} Ingot`,
      tags: [...ingotProperties.tags],
      warEconomyType: ingotProperties.warEconomyType,
      icon: ore.icon,
      color: ore.color,
      value: ingotValue,
      chance: 0,
      unit: ore.unit
    };
    ingot.trade = getDefaultGoodTradeProfile(ingot);
    ingot.cargo = getDefaultGoodCargoProfile(ingot);
    if (legacyName === "Lead") ingot.demandCoverage = { construction: 0.3 };
    goods.push(ingot);
  }

  for (const good of goods) {
    if (!good.recipes) continue;
    good.recipes = good.recipes.map(recipe => {
      const migratedRecipe: Record<number, number> = {};
      for (const [rawGoodId, amount] of Object.entries(recipe)) {
        const goodId = Number(rawGoodId);
        migratedRecipe[ingotIdByLegacyGoodId.get(goodId) ?? goodId] = amount;
      }
      return migratedRecipe;
    });
  }

  return true;
}

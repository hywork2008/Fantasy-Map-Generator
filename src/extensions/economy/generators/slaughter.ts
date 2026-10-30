/**
 * Slaughter of the food herd (docs/plan/fmg-economy-to-city-editor.md §8.1).
 *
 * Cattle, sheep, pigs and goats reach the market as live heads. Tallow and Leather
 * already price a single-ingredient recipe for some of them, but those recipes lose
 * the labor ranking, so the heads are sold alive. This pass runs after that craft
 * and before household demand, and turns whatever heads remain into the products
 * those recipes already price.
 *
 * Yield per head is the inverse of the recipe coefficient: `{ Pig: 0.5 }` on Tallow
 * is two barrels per head. A species with both a Tallow recipe and a Leather recipe
 * yields both, because one carcass has both fat and a hide. Horses, camels and
 * other draft animals are not food-tagged and stay in the market. Chickens stay
 * too: their catalog product is eggs, not a hide or tallow.
 *
 * No catalog good states how much meat one head yields. Game is hunted meat.
 * This pass does not invent that ratio and does not add a Meat good.
 */

import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { isWinterSlaughterExperimentEnabled } from "../context/winterSlaughter";
import {
  getGoods,
  getMarkets,
  getOrCreateCumulativeGoodsSales,
  getOrCreateMarketGoodProductionTotals,
  getWorldContext
} from "../economyContext";
import { debitHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { recordFoodMarketIntake } from "./foodProcessingLedger";
import { FARMGATE_PRICE_SHARE } from "./foodProduction";
import { WAIN_KG } from "./goodMeasureCatalog";
import type { Good } from "./goods-generator";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { HERD_MEAT_OFFTAKE } from "./herdDiet";
import { creditRuralHouseholdWealth } from "./householdWealth";
import type { Market } from "./marketTypes";
import { rennetBarrelsFromCalfAbomasa } from "./rennet";
import { EXPERIMENTAL_CARCASS_PROFILES } from "./winterSlaughterPolicy";

/**
 * Heads that give one roll (a hide) of Leather when the catalogue's Leather has no recipe: a hide is
 * a byproduct of the carcass, not a craft (goods-physical-units.md §28). Only cattle are slaughtered
 * for one; an older catalogue's Leather recipe, if it has one, wins.
 */
const LEATHER_HEADS_PER_ROLL: Readonly<Record<string, number>> = { Cattle: 1 };

export interface SlaughterResult {
  heads: number;
  tallow: number;
  leather: number;
  rennet: number;
  /** Wains of Meat the carcasses gave, and the part the towns bought. */
  meat: number;
  meatSold: number;
}

/** Edible lean and fat a slaughtered head gives (herdDiet.ts; the pig after winterSlaughterPolicy.ts). */
const MEAT_KG_PER_HEAD: Readonly<Record<string, number>> = {
  Cattle: HERD_MEAT_OFFTAKE.Cattle.edibleKg,
  Sheep: HERD_MEAT_OFFTAKE.Sheep.edibleKg,
  Goats: HERD_MEAT_OFFTAKE.Goats.edibleKg,
  Pig: EXPERIMENTAL_CARCASS_PROFILES.Pig.leanKgPerHead + EXPERIMENTAL_CARCASS_PROFILES.Pig.edibleFatKgPerHead
};
/** Meat a townsperson buys in a year (provisional; docs/plan/livestock-meat-sales.md §2.1). */
export const URBAN_MEAT_KG_PER_PERSON_YEAR = 25;
/**
 * Share of a town household purse, after this month's staple bill, the month's meat may take
 * (provisional). Meat is bought before the staple is paid (simulation.ts), so the staple comes first.
 */
export const MEAT_HOUSEHOLD_CASH_SHARE = 0.1;

/** Heads of `animal` one unit of `output` consumes, when the recipe is that animal alone. */
export function singleIngredientHeads(output: Good, animalId: number): number | undefined {
  for (const recipe of output.recipes ?? []) {
    const keys = Object.keys(recipe);
    if (keys.length !== 1 || Number(keys[0]) !== animalId) continue;
    const heads = recipe[animalId];
    if (typeof heads === "number" && heads > 0) return heads;
  }
  return undefined;
}

function credit(market: Market, good: Good, units: number): void {
  if (!(units > 0) || !isGoodEnabled(good)) return;
  const row = market.goods[good.i] ?? { stock: 0, price: good.value };
  market.goods[good.i] = row;
  // A calf yields only 1/240 barrel. Preserve small byproduct quantities in stock and counters.
  const quantity = (value: number) => (good.name === "Rennet" ? value : rn(value, 2));
  row.stock = quantity(row.stock + units);
  recordGoodFlow({
    direction: "source",
    category: "burgCraft",
    goodId: good.i,
    units,
    marketId: market.i,
    burgId: market.centerBurgId
  });
  recordFoodMarketIntake(market, good.name, units);
  const sales = getOrCreateCumulativeGoodsSales();
  if (sales) sales[good.i] = quantity((sales[good.i] ?? 0) + units);
  const produced = getOrCreateMarketGoodProductionTotals();
  if (produced) {
    const key = `${market.i}:${good.i}`;
    produced[key] = quantity((produced[key] ?? 0) + units);
  }
}

/**
 * Converts remaining food-herd stock into joint carcass byproducts.
 * The optional map identifies the unweaned calves among each market's Cattle stock.
 * Its caller must supply verified cohort provenance; unknown ages produce no rennet.
 * The current aggregate herd pipeline does not yet provide this provenance.
 * Returns the heads taken and the units credited.
 */
export function settleSlaughter(eligibleCalfHeadsByMarket?: ReadonlyMap<number, number>): SlaughterResult {
  const goods = getGoods();
  const tallow = goods.find(good => good.name === "Tallow");
  const leather = goods.find(good => good.name === "Leather");
  const rennet = goods.find(good => good.name === "Rennet" && isGoodEnabled(good));
  const animals = goods.filter(
    good => good.tags?.includes("liveAnimal") && good.tags.includes("food") && isGoodEnabled(good)
  );
  const meat = goods.find(good => good.name === "Meat" && isGoodEnabled(good));
  const result: SlaughterResult = { heads: 0, tallow: 0, leather: 0, rennet: 0, meat: 0, meatSold: 0 };
  // Keep unowned market animals alive; the experiment may process only its own rural herds.
  if (isWinterSlaughterExperimentEnabled()) return result;
  if (!animals.length || (!tallow && !leather)) return result;

  const townsByMarket = meat ? getTownsByMarket() : undefined;
  for (const market of getMarkets()) {
    let meatKg = 0;
    for (const animal of animals) {
      const tallowHeads = tallow ? singleIngredientHeads(tallow, animal.i) : undefined;
      const leatherHeads = leather
        ? (singleIngredientHeads(leather, animal.i) ?? LEATHER_HEADS_PER_ROLL[animal.name])
        : undefined;
      if (tallowHeads === undefined && leatherHeads === undefined) continue;
      const row = market.goods[animal.i];
      const heads = row?.stock ?? 0;
      if (!(heads > 0.001)) continue;
      row!.stock = 0;
      recordGoodFlow({
        direction: "sink",
        category: "recipeInput",
        goodId: animal.i,
        units: heads,
        marketId: market.i,
        burgId: market.centerBurgId,
        relatedGoodId: tallowHeads !== undefined ? tallow?.i : leather?.i
      });
      const tallowUnits = tallow && tallowHeads ? rn(heads / tallowHeads, 2) : 0;
      const leatherUnits = leather && leatherHeads ? rn(heads / leatherHeads, 2) : 0;
      const eligibleCalves = eligibleCalfHeadsByMarket?.get(market.i) ?? 0;
      const rennetUnits =
        rennet && animal.name === "Cattle" && Number.isFinite(eligibleCalves)
          ? rennetBarrelsFromCalfAbomasa(Math.min(heads, eligibleCalves))
          : 0;
      if (tallow) credit(market, tallow, tallowUnits);
      if (leather) credit(market, leather, leatherUnits);
      if (rennet) credit(market, rennet, rennetUnits);
      result.heads = rn(result.heads + heads, 2);
      result.tallow = rn(result.tallow + tallowUnits, 2);
      result.leather = rn(result.leather + leatherUnits, 2);
      result.rennet += rennetUnits;
      meatKg += heads * (MEAT_KG_PER_HEAD[animal.name] ?? 0);
    }
    if (meat && meatKg > 0) {
      const units = meatKg / WAIN_KG;
      result.meat += units;
      result.meatSold += sellMeat(market, meat, units, townsByMarket?.get(market.i) ?? []);
    }
  }
  return result;
}

function getTownsByMarket(): Map<number, Burg[]> {
  const towns = new Map<number, Burg[]>();
  for (const burg of getWorldContext().pack.burgs ?? []) {
    if (!burg?.i || burg.removed || !burg.market || !((burg.population ?? 0) > 0)) continue;
    towns.set(burg.market, [...(towns.get(burg.market) ?? []), burg]);
  }
  return towns;
}

/**
 * The market's towns buy this month's fresh Meat from their household purses, each its share of
 * what the carcasses gave, up to its people's need and the cash left after the staple bill. The
 * farm families who sent the herds are paid FARMGATE_PRICE_SHARE of what sold; the rest is the
 * market's margin. Meat the towns did not buy is eaten by those families and never stands in stock
 * (docs/plan/livestock-meat-sales.md §3). Returns the wains sold.
 */
function sellMeat(market: Market, meat: Good, units: number, towns: readonly Burg[]): number {
  const world = getWorldContext();
  const rate = Math.max(1, world.populationRate ?? 1);
  const urbanization = Math.max(1, world.urbanization ?? 1);
  const row = market.goods[meat.i] ?? { stock: 0, price: meat.value };
  market.goods[meat.i] = row;
  const price = Math.max(0.0001, row.price);
  recordGoodFlow({
    direction: "source",
    category: "burgCraft",
    goodId: meat.i,
    units,
    marketId: market.i,
    burgId: market.centerBurgId
  });
  const staple = getGoods().find(good => good.tags.includes("stapleFood"));
  const staplePrice = staple ? (market.goods[staple.i]?.price ?? staple.value) : 0;
  const people = towns.map(burg => (burg.population ?? 0) * rate * urbanization);
  const wanted = people.map(count => (count * URBAN_MEAT_KG_PER_PERSON_YEAR) / 12 / WAIN_KG);
  const totalWanted = wanted.reduce((sum, value) => sum + value, 0);
  const offered = totalWanted > 0 ? Math.min(1, units / totalWanted) : 0;
  let sold = 0;
  let revenue = 0;
  towns.forEach((burg, index) => {
    const stapleBill = (people[index] * GROSS_FOOD_NEED * staplePrice) / 12;
    const budget = Math.max(0, getHouseholdWealth(burg.i) - stapleBill) * MEAT_HOUSEHOLD_CASH_SHARE;
    const buy = Math.min(wanted[index] * offered, budget / price);
    const paid = buy > 0 ? debitHouseholdWealth(burg.i, rn(buy * price, 2)) : 0;
    if (!(paid > 0)) return;
    const bought = paid / price;
    sold += bought;
    revenue += paid;
    recordGoodFlow({
      direction: "sink",
      category: "householdFood",
      goodId: meat.i,
      units: bought,
      marketId: market.i,
      burgId: burg.i
    });
  });
  const eatenAtHome = units - sold;
  if (eatenAtHome > 0)
    recordGoodFlow({
      direction: "sink",
      category: "householdFood",
      goodId: meat.i,
      units: eatenAtHome,
      marketId: market.i
    });
  if (revenue > 0) {
    // A market without a farm purse yet keeps the whole price, as for heating Wood (heating.ts).
    const farmers = market.foodLedger ? rn(revenue * FARMGATE_PRICE_SHARE, 2) : 0;
    creditRuralHouseholdWealth(market, farmers);
    const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
    treasury.balance = rn(treasury.balance + revenue - farmers, 2);
    market.marketTreasury = treasury;
  }
  const sales = getOrCreateCumulativeGoodsSales();
  if (sales) sales[meat.i] = rn((sales[meat.i] ?? 0) + sold, 4);
  return sold;
}

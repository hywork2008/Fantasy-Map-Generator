/**
 * Rural Peat as fuel (docs/plan/saltworks-fuel-procurement.md F2). Where bogs, fens and moors give
 * no forest, rural households cut and dry peat for their own hearths first and for the market's
 * fuel buyers after, only up to the stock the market draws down, as rural Wood is
 * (markets-generator.ts `supplyRuralWood`). Resource cells keep their own Peat output besides.
 */
import { rn } from "../../hostUtils";
import { getGoods, getMarketCellColumn, getMarkets, getSaltworks, getWorldContext } from "../economyContext";
import { getPeatGood, PEAT_HEAT_PER_BALE, PEAT_KG_PER_BALE, SALT_BOILING_WOOD_PILES_PER_BAG } from "./peatFuel";

/**
 * Peat one rural person in a bog or moor cell can cut and dry in a year besides the farm work
 * (provisional). A household of five cut its own winter fuel of 10-15 t in a few weeks of spring.
 */
export const PEAT_KG_PER_RURAL_PERSON_YEAR = 3000;
/** Months of the market's draw kept in stock, as for rural Wood. */
const PEAT_STOCK_COVER_MONTHS = 6;
const PEAT_DRAW_SMOOTHING = 1 / 6;

/** Open bogs, fens and moors; flooded forest and mangrove are wetland but not peat-cutting ground. */
export function isPeatCell(cellId: number): boolean {
  const world = getWorldContext();
  const code = world.pack.cells.biomeCode[cellId];
  const tags = world.biomesData.tags?.[code] ?? [];
  return tags.includes("wetland") && !tags.includes("forest") && !tags.includes("tropical");
}

/**
 * Cuts this month's Peat. `ruralFuelDemand` is each market's rural hearth need in Wood piles and
 * `monthKey` the heating month (heating.ts `getWoodSupplyMonthKey`);
 * sale goes into the market through `addOutput` (rural output, paid when it sells).
 */
export function supplyRuralPeat(
  ruralFuelDemand: ReadonlyMap<number, number>,
  monthKey: number,
  addOutput: (marketId: number, collectionBurgId: number, goodId: number, units: number) => void
): void {
  const peat = getPeatGood();
  if (!peat) return;
  const world = getWorldContext();
  const column = getMarketCellColumn();
  const rate = Math.max(1, world.populationRate ?? 1);
  const potentialByMarket = new Map<number, number>();
  for (const cellId of world.pack.cells.i) {
    if (world.pack.cells.h[cellId] < 20 || !isPeatCell(cellId)) continue;
    const people = Math.max(0, world.pack.cells.pop[cellId] ?? 0) * rate;
    if (!(people > 0)) continue;
    potentialByMarket.set(
      column[cellId],
      (potentialByMarket.get(column[cellId]) ?? 0) + (people * PEAT_KG_PER_RURAL_PERSON_YEAR) / 12 / PEAT_KG_PER_BALE
    );
  }
  const wood = getGoods().find(good => good.name === "Wood");
  const balesPerBag = SALT_BOILING_WOOD_PILES_PER_BAG / PEAT_HEAT_PER_BALE;
  for (const market of getMarkets()) {
    const potential = potentialByMarket.get(market.i) ?? 0;
    if (!(potential > 0)) continue;
    // Hearths first: the rural fuel the countryside's own Wood did not give this month.
    const woodFuel = market.woodSupply?.monthKey === monthKey ? market.woodSupply.ruralFuelWood : 0;
    const hearthBales = Math.max(0, (ruralFuelDemand.get(market.i) ?? 0) - woodFuel) / PEAT_HEAT_PER_BALE;
    const ruralFuel = Math.min(potential, hearthBales);
    const stock = market.goods[peat.i]?.stock ?? 0;
    // Boiling saltworks need the fuel their market's Wood cannot give.
    const boilingBales = getSaltworks()
      .filter(works => works.active && works.marketId === market.i && works.productionMethod === "boiling")
      .reduce((sum, works) => sum + (works.monthlyCapacityBags ?? 0) * balesPerBag, 0);
    const woodStock = wood ? (market.goods[wood.i]?.stock ?? 0) : 0;
    const knownDraw = Math.max(0, boilingBales - woodStock / PEAT_HEAT_PER_BALE);
    const previous = market.peatSupply;
    const smoothedDraw = previous
      ? previous.smoothedDraw +
        (Math.max(0, previous.stockAfterSupply - stock) - previous.smoothedDraw) * PEAT_DRAW_SMOOTHING
      : knownDraw;
    const sale = Math.min(
      potential - ruralFuel,
      Math.max(0, PEAT_STOCK_COVER_MONTHS * Math.max(smoothedDraw, knownDraw) - stock)
    );
    if (sale > 0) addOutput(market.i, market.centerBurgId, peat.i, sale);
    market.peatSupply = {
      monthKey,
      potential: rn(potential, 4),
      ruralFuelPeat: rn(ruralFuel, 4),
      marketPeat: rn(Math.max(0, sale), 4),
      stockAfterSupply: rn(market.goods[peat.i]?.stock ?? 0, 4),
      smoothedDraw: rn(smoothedDraw, 4)
    };
  }
}

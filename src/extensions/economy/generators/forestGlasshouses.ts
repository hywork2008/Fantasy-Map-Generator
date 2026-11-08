/**
 * Forest glasshouses (docs/plan/forest-glasshouses.md). Potash glass (Waldglas) was made in the
 * forest, not in towns: a hut burned its own wood for the potash and the furnace, about one stacked
 * cubic metre of wood for a kilogram of glass, and moved on when the woods near it were cut. The
 * market's forest-cell rural people run the huts; they fell the wood on site, buy White sand from the
 * market and sell the glass into it, only as far as the market's stock wants and its glassmaker
 * families (glassmakerHouses.ts) can work. Where a market has glasshouses, its inland town glaziers
 * keep the finishing work and no longer make Glass themselves; port towns keep their own glasshouses.
 */

import { getForestCapacity, getForestStockRatio } from "../../../generators/forestStock";
import { rn } from "../../hostUtils";
import { getGoods, getMarketCellColumn, getMarkets, getSimulationYear, getWorldContext } from "../economyContext";
import { calculatePhysicalAreaHectares } from "./agriculturalLandUse";
import { getCalibratedMonthlyLots } from "./craftDemandCalibration";
import { laborPeople } from "./craftScale";
import { getFellableWood, harvestWood } from "./forestStock";
import { GLASSMAKER_FOUNDING_MONTHS, getFoundingHouses, settleGlassmakerYear } from "./glassmakerHouses";
import { WAIN_KG } from "./goodMeasureCatalog";
import type { Good } from "./goods-generator";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { creditRuralHouseholdWealth, debitRuralHouseholdWealth, getRuralHouseholdWealth } from "./householdWealth";
import type { Market } from "./marketTypes";

/** Solid cubic metres of wood one Wood unit holds (`WOOD_M3_PER_UNIT`). */
const WOOD_FM_PER_UNIT = 10;
/** About 1 Raummeter (stacked, ~0.7 Festmeter) of wood for 1 kg of glass, 80-85% of it burned for potash (Waldglas). */
export const GLASSHOUSE_WOOD_FM_PER_KG = 0.7;
/** A hut's yearly wood: 2,000-3,000 Festmeter, 20-30 ha of forest (Waldglas). */
export const GLASSHOUSE_WOOD_FM_PER_YEAR = 2500;
/**
 * A hut's workers, woodcutters included: 10 glassmakers, 3 stokers, 8 boys, 15 woodcutters and
 * 2 packers in the Riesengebirge in 1763, firing the furnace 24 weeks a year.
 */
export const GLASSHOUSE_WORKERS = 38;
/** Glass one hut makes in a year, in wains (about 3.6 t). */
export const GLASSHOUSE_LOTS_PER_YEAR = GLASSHOUSE_WOOD_FM_PER_YEAR / GLASSHOUSE_WOOD_FM_PER_KG / WAIN_KG;
/** Person-months of hut work for one wain of glass. */
export const GLASSHOUSE_WORKER_MONTHS_PER_LOT = (GLASSHOUSE_WORKERS * 12) / GLASSHOUSE_LOTS_PER_YEAR;
/** Wood units felled for one wain of glass. */
export const GLASSHOUSE_WOOD_UNITS_PER_LOT = (GLASSHOUSE_WOOD_FM_PER_KG * WAIN_KG) / WOOD_FM_PER_UNIT;
/**
 * Standing forest for one hut. No more than 10 huts worked at once in the Spessart, about
 * 1,700 km² of forest (70% of 2,440 km²); one of the densest forest-glass regions.
 */
export const GLASSHOUSE_FOREST_HA_PER_HUT = 17000;
/** Share of a forest cell's fellable wood the huts may cut in one month, as for rural Wood. */
const GLASSHOUSE_MONTHLY_FELLING_SHARE = 0.01;
/** Months of the market's Glass use it keeps in stock from the huts. */
export const GLASSHOUSE_RESERVE_MONTHS = 3;
const GLASS_DRAW_SMOOTHING = 0.5;

export interface ForestGlasshouseLedger {
  /** Glass drawn from the market since the last settlement. */
  drawThisMonth: number;
  /** Running monthly Glass draw. */
  monthlyDraw: number;
  /** Most glass the market's forest people could make in a month. */
  capacityLots: number;
  /** Glass made at the last settlement, wains. */
  lots: number;
  /** Wood felled at the last settlement, Wood units. */
  woodFelled: number;
  cumulativeLots: number;
  cumulativeWoodFelled: number;
  /** Huts' worth of glassmaker families in the market (glassmakerHouses.ts); absent until seeded. */
  houses?: number;
  /** Simulation year the houses were last settled in. */
  housesYear?: number;
  /** Settlements since the start while the houses are being counted, and the highest running draw in them. */
  foundingMonths?: number;
  foundingDraw?: number;
  /** Settlements since the last yearly settlement. */
  yearMonths?: number;
  /** Glass made since the last yearly settlement, wains. */
  yearLots?: number;
  /** Glass wanted since the last yearly settlement but not made for want of families, wains. */
  yearShortLots?: number;
  /** The last yearly settlement's change in houses. */
  housesGrown?: number;
  housesLeft?: number;
  housesArrived?: number;
}

function ledgerOf(market: Market): ForestGlasshouseLedger {
  market.forestGlasshouses ??= {
    drawThisMonth: 0,
    monthlyDraw: 0,
    capacityLots: 0,
    lots: 0,
    woodFelled: 0,
    cumulativeLots: 0,
    cumulativeWoodFelled: 0
  };
  return market.forestGlasshouses;
}

/** Whether this market's own glasshouses supply its Glass, so its towns do not make it. */
export function hasForestGlasshouses(market: Market | undefined): boolean {
  return (market?.forestGlasshouses?.capacityLots ?? 0) > 0;
}

/** Counts Glass the market's towns and recipes drew; called from the goods-flow ledger. */
export function recordGlassDraw(market: Market, units: number): void {
  if (!(units > 0)) return;
  const ledger = ledgerOf(market);
  ledger.drawThisMonth = rn(ledger.drawThisMonth + units, 4);
}

/** The White sand a wain of potash glass takes, from Glass's own sand-and-potash recipe. */
export function getForestGlassSandPerLot(glass: Good, goods: readonly Good[]): number {
  const sand = goods.find(good => good.name === "White sand" && isGoodEnabled(good));
  const potash = goods.find(good => good.name === "Potash");
  if (!sand || !potash) return 0;
  const recipe = glass.recipes?.find(entry => (entry[sand.i] ?? 0) > 0 && (entry[potash.i] ?? 0) > 0);
  return recipe && Object.keys(recipe).length === 2 ? recipe[sand.i] : 0;
}

/** Huts a market's forest holds: its standing forest, and a crew from the people living in it. */
export function getGlasshouseCount(standingForestHa: number, forestPeople: number): number {
  return Math.max(0, Math.min(standingForestHa / GLASSHOUSE_FOREST_HA_PER_HUT, forestPeople / GLASSHOUSE_WORKERS));
}

/** Wains the huts make, given their capacity, the stock room, the sand and the money on both sides. */
export function getForestGlassLots(args: {
  capacityLots: number;
  targetStock: number;
  stock: number;
  sandStock: number;
  sandPerLot: number;
  ruralCash: number;
  treasury: number;
  glassPrice: number;
  sandPrice: number;
}): number {
  const sandCost = args.sandPerLot * Math.max(0, args.sandPrice);
  if (!(args.sandPerLot > 0) || !(args.glassPrice > sandCost)) return 0;
  return Math.max(
    0,
    Math.min(
      args.capacityLots,
      args.targetStock - Math.max(0, args.stock),
      Math.max(0, args.sandStock) / args.sandPerLot,
      sandCost > 0 ? Math.max(0, args.ruralCash) / sandCost : Infinity,
      Math.max(0, args.treasury) / args.glassPrice
    )
  );
}

/** Monthly glasshouse work of every market. */
export function settleForestGlasshouses(): void {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const goods = getGoods();
  const glass = goods.find(good => good.name === "Glass" && isGoodEnabled(good));
  const sand = goods.find(good => good.name === "White sand" && isGoodEnabled(good));
  const markets = getMarkets();
  const sandPerLot = glass ? getForestGlassSandPerLot(glass, goods) : 0;
  if (!glass || !sand || !(sandPerLot > 0) || !cells?.i?.length) {
    for (const market of markets) if (market.forestGlasshouses) market.forestGlasshouses.capacityLots = 0;
    return;
  }
  const rate = Math.max(1, world.populationRate ?? 1);
  const column = getMarketCellColumn();
  const forestCellsByMarket = new Map<number, { cellId: number; fellable: number }[]>();
  const forestPeopleByMarket = new Map<number, number>();
  const forestHaByMarket = new Map<number, number>();
  for (const cellId of cells.i) {
    if (cells.h[cellId] < 20) continue;
    const tags = world.biomesData.tags?.[cells.biomeCode[cellId]] ?? [];
    if (!tags.includes("forest")) continue;
    const people = Math.max(0, cells.pop[cellId] ?? 0) * rate;
    const fellable = getFellableWood(cellId) * GLASSHOUSE_MONTHLY_FELLING_SHARE;
    if (!(people > 0) || !(fellable > 0)) continue;
    const marketId = column[cellId];
    forestPeopleByMarket.set(marketId, (forestPeopleByMarket.get(marketId) ?? 0) + people);
    const standingHa =
      calculatePhysicalAreaHectares(world, cellId) *
      getForestCapacity(cells, cellId) *
      getForestStockRatio(cells, cellId);
    forestHaByMarket.set(marketId, (forestHaByMarket.get(marketId) ?? 0) + standingHa);
    const list = forestCellsByMarket.get(marketId) ?? [];
    list.push({ cellId, fellable });
    forestCellsByMarket.set(marketId, list);
  }
  const townPoints = new Map<number, number>();
  for (const burg of world.pack.burgs) {
    if (!burg?.i || burg.removed || !burg.market) continue;
    townPoints.set(burg.market, (townPoints.get(burg.market) ?? 0) + Math.max(0, burg.population ?? 0));
  }

  const year = getSimulationYear();
  const forestHutsByMarket = new Map<number, number>();
  for (const market of markets) {
    const ledger = ledgerOf(market);
    ledger.monthlyDraw = rn(
      ledger.monthlyDraw * (1 - GLASS_DRAW_SMOOTHING) + ledger.drawThisMonth * GLASS_DRAW_SMOOTHING,
      4
    );
    ledger.drawThisMonth = 0;
    ledger.lots = 0;
    ledger.woodFelled = 0;
    const forest = forestCellsByMarket.get(market.i) ?? [];
    const fellable = forest.reduce((sum, cell) => sum + cell.fellable, 0);
    const forestHuts = getGlasshouseCount(forestHaByMarket.get(market.i) ?? 0, forestPeopleByMarket.get(market.i) ?? 0);
    forestHutsByMarket.set(market.i, forestHuts);
    const floor = getCalibratedMonthlyLots({
      goodName: glass.name,
      laborPeopleBurg: laborPeople(townPoints.get(market.i) ?? 0, rate),
      port: false
    });
    // The families start as many as the market's highest running glass use in its first year (§3.5); until
    // then the huts work as the forest allows. The first settlement comes before any month's use and is not counted.
    if (ledger.houses === undefined) {
      if (ledger.foundingMonths === undefined) {
        ledger.foundingMonths = 0;
        ledger.foundingDraw = 0;
      } else {
        ledger.foundingMonths += 1;
        ledger.foundingDraw = Math.max(ledger.foundingDraw ?? 0, ledger.monthlyDraw);
      }
      if (ledger.foundingMonths >= GLASSMAKER_FOUNDING_MONTHS) {
        ledger.houses = getFoundingHouses(ledger.foundingDraw ?? 0, GLASSHOUSE_LOTS_PER_YEAR, forestHuts);
        ledger.housesYear = year;
        ledger.yearMonths = 0;
        ledger.yearLots = 0;
        ledger.yearShortLots = 0;
        delete ledger.foundingMonths;
        delete ledger.foundingDraw;
      }
    }
    const founding = ledger.houses === undefined;
    if (!founding) ledger.yearMonths = (ledger.yearMonths ?? 0) + 1;
    const woodLots = fellable / GLASSHOUSE_WOOD_UNITS_PER_LOT;
    const forestCapacity = Math.min(forestHuts * (GLASSHOUSE_LOTS_PER_YEAR / 12), woodLots);
    ledger.capacityLots = rn(
      Math.min(Math.min(forestHuts, ledger.houses ?? forestHuts) * (GLASSHOUSE_LOTS_PER_YEAR / 12), woodLots),
      4
    );
    if (!(forestCapacity > 0)) continue;

    const row = market.goods[glass.i] ?? { stock: 0, price: glass.value };
    const sandRow = market.goods[sand.i];
    const glassPrice = Math.max(0, row.price ?? glass.value);
    const sandPrice = Math.max(0, sandRow?.price ?? sand.value);
    const treasury = market.marketTreasury;
    const quote = (capacityLots: number) =>
      getForestGlassLots({
        capacityLots,
        targetStock: Math.max(floor, GLASSHOUSE_RESERVE_MONTHS * ledger.monthlyDraw),
        stock: row.stock,
        sandStock: sandRow?.stock ?? 0,
        sandPerLot,
        ruralCash: getRuralHouseholdWealth(market),
        treasury: treasury?.balance ?? 0,
        glassPrice,
        sandPrice
      });
    let lots = quote(ledger.capacityLots);
    // What a forest with enough families would have made: the call for glassmakers to come.
    if (!founding)
      ledger.yearShortLots = rn((ledger.yearShortLots ?? 0) + Math.max(0, quote(forestCapacity) - lots), 4);
    if (!(lots > 1e-4) || !sandRow || !treasury) continue;

    // Fell the wood from the market's forest cells in proportion to what each can give.
    const wanted = lots * GLASSHOUSE_WOOD_UNITS_PER_LOT;
    let felled = 0;
    for (const cell of forest) felled += harvestWood(cell.cellId, (wanted * cell.fellable) / fellable);
    lots = rn(Math.min(lots, felled / GLASSHOUSE_WOOD_UNITS_PER_LOT), 4);
    ledger.woodFelled = rn(felled, 4);
    ledger.cumulativeWoodFelled = rn(ledger.cumulativeWoodFelled + felled, 4);
    if (!(lots > 0)) continue;

    const sandUnits = rn(lots * sandPerLot, 4);
    const sandPaid = debitRuralHouseholdWealth(market, rn(sandUnits * sandPrice, 2));
    sandRow.stock = rn(Math.max(0, sandRow.stock - sandUnits), 4);
    treasury.balance = rn(treasury.balance + sandPaid, 2);
    recordGoodFlow({
      direction: "sink",
      category: "recipeInput",
      goodId: sand.i,
      units: sandUnits,
      marketId: market.i,
      relatedGoodId: glass.i
    });

    row.stock = rn(row.stock + lots, 4);
    market.goods[glass.i] = row;
    recordGoodFlow({ direction: "source", category: "forestGlass", goodId: glass.i, units: lots, marketId: market.i });
    const glassPaid = rn(Math.min(treasury.balance, lots * glassPrice), 2);
    treasury.balance = rn(treasury.balance - glassPaid, 2);
    creditRuralHouseholdWealth(market, glassPaid);
    ledger.lots = lots;
    ledger.cumulativeLots = rn(ledger.cumulativeLots + lots, 4);
    if (!founding) ledger.yearLots = rn((ledger.yearLots ?? 0) + lots, 4);
  }
  settleGlassmakerHouses(markets, forestHutsByMarket, year);
}

/** Once a year, the families grow, leave idle markets and settle where they are wanted. */
function settleGlassmakerHouses(markets: readonly Market[], forestHuts: ReadonlyMap<number, number>, year: number) {
  const due = markets.filter(market => {
    const ledger = market.forestGlasshouses;
    return ledger?.houses !== undefined && (ledger.housesYear ?? year) < year;
  });
  if (!due.length) return;
  const burgs = getWorldContext().pack.burgs;
  const result = settleGlassmakerYear(
    due.map(market => {
      const ledger = market.forestGlasshouses!;
      // A year begun after the founding months counts at its yearly rate.
      const perYear = 12 / Math.max(1, Math.min(12, ledger.yearMonths ?? 12));
      return {
        marketId: market.i,
        stateId: burgs[market.centerBurgId]?.state ?? 0,
        houses: ledger.houses ?? 0,
        usedHuts: ((ledger.yearLots ?? 0) * perYear) / GLASSHOUSE_LOTS_PER_YEAR,
        shortHuts: ((ledger.yearShortLots ?? 0) * perYear) / GLASSHOUSE_LOTS_PER_YEAR,
        forestHuts: forestHuts.get(market.i) ?? 0
      };
    })
  );
  const byId = new Map(result.markets.map(row => [row.marketId, row]));
  for (const market of due) {
    const ledger = market.forestGlasshouses!;
    const row = byId.get(market.i);
    if (!row) continue;
    ledger.houses = row.houses;
    ledger.housesGrown = row.grown;
    ledger.housesLeft = row.left;
    ledger.housesArrived = row.arrived;
    ledger.housesYear = year;
    ledger.yearMonths = 0;
    ledger.yearLots = 0;
    ledger.yearShortLots = 0;
  }
}

import { getFaunaStockTable, getMarketCellColumn } from "../context/cellTables";
import { getWorldContext } from "../context/economyApi";
import { getGoods } from "../context/trade";
import { ANNUAL_LITERS_PER_LACTATING_FEMALE, LACTATING_SHARE_OF_BREEDING_COHORT } from "./dairyProductionPolicy";
import { getAnnualHerdRenewal } from "./faunaPopulation";
import { KILOGRAMS_PER_CHEESE_LOT, LITERS_PER_MILK_LOT, MILK_LOTS_PER_CHEESE_LOT } from "./foodLots";
import { getMonthlyHouseholdDemand } from "./foodProcessingLedger";
import { assessJointHerdDemand, type RenewableHerdOutput } from "./livestockJointDemand";
import type { Market } from "./marketTypes";
import { getTextileMarketOrders } from "./textileDemand";
import { SHEEP_ANNUAL_WOOL_KG, WOOL_KG_PER_MARKET_LOT } from "./woolProductionPolicy";

/** Physical planning assessment. Never changes herds, demand, stock or household entitlements. */
export function getJointLivestockMarketDemand(market: Market) {
  const world = getWorldContext();
  const goods = getGoods();
  const byName = new Map(goods.map(good => [good.name, good]));
  const stock = (name: string) => {
    const id = byName.get(name)?.i;
    return id === undefined ? 0 : Math.max(0, market.goods[id]?.stock ?? 0);
  };
  const cheeseAnnualLots = getMonthlyHouseholdDemand(market, "Cheese") * 12;
  const cheeseInventoryLots = stock("Cheese");
  // Credit finished cheese first; its embodied milk must not also be requested from the herd.
  const milkForCheeseLiters =
    Math.max(0, cheeseAnnualLots - cheeseInventoryLots) * MILK_LOTS_PER_CHEESE_LOT * LITERS_PER_MILK_LOT;
  const drinkingMilkLiters = getMonthlyHouseholdDemand(market, "Milk") * 12 * LITERS_PER_MILK_LOT;
  // Milk is perishable. Credit at most the current month's drinking requirement, not a year's store.
  const usableMilkInventoryLiters = Math.min(stock("Milk") * LITERS_PER_MILK_LOT, drinkingMilkLiters / 12);
  const table = getFaunaStockTable() ?? {};
  const marketCells = getMarketCellColumn();
  const herds: RenewableHerdOutput[] = [];
  const renewal = [];
  for (const [species, liters] of Object.entries(ANNUAL_LITERS_PER_LACTATING_FEMALE)) {
    const cohorts = { young: 0, breeding: 0, old: 0 };
    const annual = { birthsHeads: 0, naturalDeathsHeads: 0, naturalNetHeads: 0, observedOfftakeHeads: null };
    const good = byName.get(species);
    for (const cell of world.pack.cells.i) {
      if (world.pack.cells.h[cell] < 20 || marketCells[cell] !== market.i) continue;
      const herd = table[`${cell}:${species}`];
      if (!herd) continue;
      cohorts.young += herd.young;
      cohorts.breeding += herd.breeding;
      cohorts.old += herd.old;
      const balance = good ? getAnnualHerdRenewal(cell, good) : null;
      if (balance) {
        annual.birthsHeads += balance.birthsHeads;
        annual.naturalDeathsHeads += balance.naturalDeathsHeads;
        annual.naturalNetHeads += balance.naturalNetHeads;
      }
    }
    herds.push({
      species,
      cohorts,
      yields: {
        milkLiters: { young: 0, breeding: liters * LACTATING_SHARE_OF_BREEDING_COHORT, old: 0 },
        ...(species === "Sheep" ? { woolKg: SHEEP_ANNUAL_WOOL_KG } : {})
      }
    });
    renewal.push({ species, ...annual });
  }
  const woolId = byName.get("Wool")?.i;
  const orders = getTextileMarketOrders(market);
  return {
    marketId: market.i,
    basis:
      "Current model household dairy targets, not historically calibrated requirements; renewable potential before feed/care losses",
    annualDairy: {
      drinkingMilkLiters,
      cheeseKilograms: cheeseAnnualLots * KILOGRAMS_PER_CHEESE_LOT,
      cheeseInventoryKilograms: cheeseInventoryLots * KILOGRAMS_PER_CHEESE_LOT,
      milkForCheeseLiters,
      usableMilkInventoryLiters
    },
    // Selected current orders are not an annual all-wool clothing requirement or a trade forecast.
    selectedRuralWoolOrdersKgThisMonth:
      woolId === undefined ? null : (orders.inputs[woolId] ?? 0) * WOOL_KG_PER_MARKET_LOT,
    assessment: assessJointHerdDemand(
      herds,
      { milkLiters: drinkingMilkLiters + milkForCheeseLiters, woolKg: null, meatKg: null, hideKg: null },
      { milkLiters: usableMilkInventoryLiters, woolKg: stock("Wool") * WOOL_KG_PER_MARKET_LOT }
    ),
    renewal,
    unresolved: [
      "Annual wool fibre mix and net trade",
      "Annual meat/hide demand and slaughter yields",
      "Draft/manure uses",
      "Annual observed offtake and replacement-age policy",
      "Historical dairy/yield calibration"
    ],
    targetHeads: null
  };
}

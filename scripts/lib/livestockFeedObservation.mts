/** Actual feed settlements plus read-only work/seasonal limits; never supplies fodder. */
import { getGoods, getMarkets } from "../../src/extensions/economy/context/trade";
import { getOrCreateLivestockFeedTable, getMarketCellColumn } from "../../src/extensions/economy/context/cellTables";
import { getHusbandryWorkers } from "../../src/extensions/economy/context/agriculture";
import { getWorldContext } from "../../src/extensions/economy/economyContext";
import { calculateHusbandryDemand, getPastureAreaUsedHectares } from "../../src/extensions/economy/generators/husbandry";
import { getLivestockMonthlyFeedNeedKg } from "../../src/extensions/economy/generators/livestockFeed";
import { livestockFeedMonth, livestockFeedPeriod } from "../../src/extensions/economy/generators/livestockFeedState";
import { FODDER_DM_KG_PER_LOT, getPastureGrowth, getLivestockHayPlan, HAY_WORK_DAYS_PER_TONNE_DM } from "../../src/extensions/economy/generators/livestockFeedPolicy";
import { WORKABLE_DAYS_PER_ADULT } from "../../src/extensions/economy/generators/agriculturalLandUse";

export function observeLivestockFeedSettlement() {
  const table = getOrCreateLivestockFeedTable() ?? {};
  const world = getWorldContext();
  const month = livestockFeedMonth() - 1;
  const period = livestockFeedPeriod();
  const column = getMarketCellColumn();
  const fodder = getGoods().find(good => good.name === "Fodder");
  const fields = ["hayKg", "pastureGrownKg", "harvestedKg", "harvestLossKg", "storageLossKg", "unharvestedKg", "soldKg", "purchasedKg", "requiredKg", "pastureConsumedKg", "hayConsumedKg", "unmetKg", "spending", "revenue"];
  const markets = new Map<number, { marketId: number; totals: Record<string, number>; worstCells: unknown[] }>();
  const cells = [];
  for (const [key, row] of Object.entries(table)) {
    if (row.feedPeriod !== period) continue;
    const cell = Number(key), marketId = column[cell] ?? 0;
    const demand = calculateHusbandryDemand(world, cell);
    const assigned = Math.max(0, getHusbandryWorkers()[cell] ?? 0);
    const hayShare = demand.requiredWorkers > 0 ? (demand.hayWorkers ?? 0) / demand.requiredWorkers : 0;
    const growth = getPastureGrowth(world, cell);
    const annualForageKg = getPastureAreaUsedHectares(cell) * growth.annualKgPerHa;
    const need = getLivestockMonthlyFeedNeedKg(cell);
    const seasonalGapKg = growth.weights.reduce((sum, weight) => sum + Math.max(0, need - annualForageKg * weight), 0);
    const workCapacityKg = assigned * hayShare * WORKABLE_DAYS_PER_ADULT *
      (demand.hayMonthlyLaborWeights ?? growth.weights)[month] / HAY_WORK_DAYS_PER_TONNE_DM * 1000;
    const plan = getLivestockHayPlan(world, cell, need * 12, getPastureAreaUsedHectares(cell));
    const entry = { cellId: cell, marketId, ...row, samples: undefined,
      annualForageKg, seasonalGapKg, assignedWorkers: assigned, requiredWorkers: demand.requiredWorkers,
      plannedHayWorkers: demand.hayWorkers ?? 0, referenceHarvestCapacityKg: workCapacityKg,
      annualPlannedRawHayKg: (demand.hayWorkers ?? 0) * WORKABLE_DAYS_PER_ADULT / HAY_WORK_DAYS_PER_TONNE_DM * 1000,
      reserveTargetAfterFeedingKg: plan.reserveAfterMonthKg[month] };
    cells.push(entry);
    const group = markets.get(marketId) ?? {marketId, totals: {}, worstCells: []};
    markets.set(marketId, group);
    for (const name of fields) group.totals[name] = (group.totals[name] ?? 0) + Number((row as any)[name] ?? 0);
    for (const name of ["annualForageKg", "seasonalGapKg", "assignedWorkers", "requiredWorkers", "plannedHayWorkers", "referenceHarvestCapacityKg", "annualPlannedRawHayKg", "reserveTargetAfterFeedingKg"])
      group.totals[name] = (group.totals[name] ?? 0) + Number((entry as any)[name]);
    group.totals.feedCells = (group.totals.feedCells ?? 0) + 1;
  }
  for (const group of markets.values())
    group.worstCells = cells.filter(cell => cell.marketId === group.marketId && cell.unmetKg > 0)
      .sort((a, b) => b.unmetKg - a.unmetKg).slice(0, 5);
  return { period, month: month + 1,
    note: "Only rows settled in this period. Work capacity references current herd/work columns and the active hay work schedule, not an extra harvest. Seasonal gaps are forecasts, never annual consumption.",
    markets: [...markets.values()].map(group => {
      const market = getMarkets().find(market => market.i === group.marketId);
      return {...group, marketFodderKg: fodder ? (market?.goods[fodder.i]?.stock ?? 0) * FODDER_DM_KG_PER_LOT : null,
        fodderPrice: fodder ? market?.goods[fodder.i]?.price ?? null : null,
        ruralCash: market?.foodLedger?.ruralHouseholdWealth ?? null, marketCash: market?.marketTreasury?.balance ?? null};
    })};
}
